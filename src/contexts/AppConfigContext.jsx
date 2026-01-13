import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { useAuth } from './AuthContext';
import {
  DEFAULT_BUILDING_CONFIG,
  normalizeBuildingConfig,
  setBuildingConfig as applyBuildingConfig
} from '../utils/buildingUtils';
import {
  DEFAULT_TERM_CONFIG,
  normalizeTermConfig,
  setTermConfig as applyTermConfig
} from '../utils/termUtils';

const AppConfigContext = createContext(null);

const withTimestamps = (payload, existing = {}) => {
  const base = { ...payload, updatedAt: new Date().toISOString() };
  if (!existing?.createdAt) {
    base.createdAt = new Date().toISOString();
  }
  return base;
};

export const AppConfigProvider = ({ children }) => {
  const { isAdmin } = useAuth();
  const [buildingConfig, setBuildingConfigState] = useState(DEFAULT_BUILDING_CONFIG);
  const [termConfig, setTermConfigState] = useState(DEFAULT_TERM_CONFIG);
  const [loading, setLoading] = useState(true);
  const [buildingConfigVersion, setBuildingConfigVersion] = useState(0);
  const [termConfigVersion, setTermConfigVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const buildingsRef = doc(db, 'settings', 'buildings');
    const termRef = doc(db, 'settings', 'termConfig');

    const seedBuildingsFromRooms = async () => {
      if (!isAdmin) return;
      try {
        const roomsSnapshot = await getDocs(collection(db, COLLECTIONS.ROOMS));
        const buildingMap = new Map();
        roomsSnapshot.docs.forEach((docSnap) => {
          const name = (docSnap.data()?.building || '').toString().trim();
          if (!name) return;
          if (!buildingMap.has(name)) {
            buildingMap.set(name, {
              code: name.toUpperCase(),
              displayName: name,
              aliases: []
            });
          }
        });
        const seeded = {
          ...DEFAULT_BUILDING_CONFIG,
          buildings: Array.from(buildingMap.values())
        };
        await setDoc(buildingsRef, withTimestamps(seeded, null), { merge: true });
      } catch (error) {
        console.warn('Unable to seed settings:', error);
      }
    };

    const seedDefaults = async (ref, defaults, existing) => {
      if (!isAdmin) return;
      try {
        await setDoc(ref, withTimestamps(defaults, existing), { merge: true });
      } catch (error) {
        console.warn('Unable to seed settings:', error);
      }
    };

    const unsubscribeBuildings = onSnapshot(
      buildingsRef,
      (snap) => {
        if (!active) return;
        if (snap.exists()) {
          const normalized = normalizeBuildingConfig(snap.data());
          setBuildingConfigState(normalized);
          applyBuildingConfig(normalized);
          setBuildingConfigVersion((v) => v + 1);
        } else {
          const normalized = normalizeBuildingConfig(DEFAULT_BUILDING_CONFIG);
          setBuildingConfigState(normalized);
          applyBuildingConfig(normalized);
          setBuildingConfigVersion((v) => v + 1);
          seedBuildingsFromRooms();
        }
        setLoading(false);
      },
      (error) => {
        console.warn('Failed to load building settings:', error);
        if (!active) return;
        setLoading(false);
      }
    );

    const unsubscribeTerms = onSnapshot(
      termRef,
      (snap) => {
        if (!active) return;
        if (snap.exists()) {
          const normalized = normalizeTermConfig(snap.data());
          setTermConfigState(normalized);
          applyTermConfig(normalized);
          setTermConfigVersion((v) => v + 1);
        } else {
          const normalized = normalizeTermConfig(DEFAULT_TERM_CONFIG);
          setTermConfigState(normalized);
          applyTermConfig(normalized);
          setTermConfigVersion((v) => v + 1);
          seedDefaults(termRef, DEFAULT_TERM_CONFIG, null);
        }
        setLoading(false);
      },
      (error) => {
        console.warn('Failed to load term settings:', error);
        if (!active) return;
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribeBuildings();
      unsubscribeTerms();
    };
  }, [isAdmin]);

  const saveBuildingConfig = async (nextConfig) => {
    const normalized = normalizeBuildingConfig(nextConfig);
    await setDoc(doc(db, 'settings', 'buildings'), withTimestamps(normalized, buildingConfig), {
      merge: true
    });
  };

  const saveTermConfig = async (nextConfig) => {
    const normalized = normalizeTermConfig(nextConfig);
    await setDoc(doc(db, 'settings', 'termConfig'), withTimestamps(normalized, termConfig), {
      merge: true
    });
  };

  const value = useMemo(
    () => ({
      buildingConfig,
      termConfig,
      buildingConfigVersion,
      termConfigVersion,
      loading,
      saveBuildingConfig,
      saveTermConfig
    }),
    [buildingConfig, termConfig, buildingConfigVersion, termConfigVersion, loading]
  );

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
};

export const useAppConfig = () => {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error('useAppConfig must be used within an AppConfigProvider');
  }
  return context;
};
