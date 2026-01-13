import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { logCreate, logUpdate } from '../utils/changeLogger';
import { getAllRegisteredPageIds } from '../utils/pageRegistry';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedProfile, setLoadedProfile] = useState(false);
  const [loadedAccess, setLoadedAccess] = useState(false);

  // Removed insecure .env based admin check. Admin access is now strictly role-based.
  const ADMIN_EMAILS = [];

  const getAccessControlRef = () => doc(db, 'settings', 'accessControl');

  // Normalize role permissions into new schema { [role]: { pages: {}, actions: {} } }
  const normalizeRolePermissions = (raw) => {
    const input = raw || {};
    const roleKeys = new Set([
      'admin',
      'staff',
      'faculty',
      'viewer',
      ...Object.keys(input)
    ]);

    const normalized = {};
    roleKeys.forEach((role) => {
      const value = input[role];
      if (value && typeof value === 'object' && (value.pages || value.actions)) {
        normalized[role] = {
          pages: (value.pages && typeof value.pages === 'object') ? { ...value.pages } : {},
          actions: (value.actions && typeof value.actions === 'object') ? { ...value.actions } : {}
        };
      } else if (value && typeof value === 'object') {
        // Legacy shape treated as page permissions
        normalized[role] = { pages: { ...value }, actions: {} };
      } else {
        normalized[role] = { pages: {}, actions: {} };
      }
    });

    // Ensure admin wildcards
    if (!normalized.admin) normalized.admin = { pages: {}, actions: {} };
    if (!normalized.admin.pages || Object.keys(normalized.admin.pages).length === 0) {
      normalized.admin.pages = { '*': true };
    }
    if (!normalized.admin.actions || Object.keys(normalized.admin.actions).length === 0) {
      normalized.admin.actions = { '*': true };
    }

    // Viewer default: dashboard view if not explicitly set
    if (!normalized.viewer) normalized.viewer = { pages: {}, actions: {} };
    if (!normalized.viewer.pages) normalized.viewer.pages = {};
    if (!Object.prototype.hasOwnProperty.call(normalized.viewer.pages, 'dashboard')) {
      normalized.viewer.pages['dashboard'] = true;
    }

    return normalized;
  };

  const bootstrapAccessControl = async () => {
    // Ensure settings/accessControl exists with safe defaults
    try {
      const ref = getAccessControlRef();
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const defaults = {
          rolePermissions: {
            admin: { pages: { '*': true }, actions: { '*': true } },
            staff: { pages: {}, actions: {} },
            faculty: { pages: {}, actions: {} },
            viewer: { pages: { 'dashboard': true }, actions: {} }
          },
          updatedAt: serverTimestamp(),
        };
        await setDoc(ref, defaults);
        await logCreate('Access Control Defaults', 'settings', 'accessControl', defaults, 'AuthContext.jsx - bootstrapAccessControl');
        setRolePermissions(defaults.rolePermissions);
      } else {
        const data = snap.data() || {};
        setRolePermissions(normalizeRolePermissions(data.rolePermissions));
      }
    } catch (e) {
      // Fallback to in-memory defaults (normalized shape)
      setRolePermissions({
        admin: { pages: { '*': true }, actions: { '*': true } },
        staff: { pages: {}, actions: {} },
        faculty: { pages: {}, actions: {} },
        viewer: { pages: { 'dashboard': true }, actions: {} }
      });
      console.warn('Failed to load access control. Using defaults.', e);
    }
  };

  const loadUserProfile = async (firebaseUser) => {
    if (!firebaseUser) {
      setUserProfile(null);
      return;
    }
    const userRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(userRef);
    const emailLower = (firebaseUser.email || '').toLowerCase();
    const isBootstrapAdmin = ADMIN_EMAILS.includes(emailLower);

    if (!snap.exists()) {
      const newProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        roles: isBootstrapAdmin ? ['admin'] : ['viewer'],
        permissions: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      };
      await setDoc(userRef, newProfile);
      await logCreate(`User - ${newProfile.email}`, 'users', firebaseUser.uid, newProfile, 'AuthContext.jsx - loadUserProfile:create');
      setUserProfile({ ...newProfile, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    } else {
      const existing = snap.data();
      // Update last login timestamp
      try {
        await updateDoc(userRef, { lastLoginAt: serverTimestamp() });
      } catch (error) {
        console.warn(error);
      }
      // Ensure bootstrap admin has admin role
      // Legacy code removed: We no longer auto-grant admin based on .env emails. 
      // Admins must be manually promoted in Firestore or via the initial seed script.
      setUserProfile(existing);
    }
  };

  useEffect(() => {
    setLoading(true);
    let stopUserProfile = null;
    const unsub = onAuthStateChanged(auth, async (u) => {
      // Clean up any existing profile subscription before handling new user
      if (typeof stopUserProfile === 'function') {
        try {
          stopUserProfile();
        } catch (error) {
          console.warn(error);
        }
        stopUserProfile = null;
      }

      setUser(u);
      setLoadedProfile(false);
      // Persist minimal user info for activity logger
      try {
        if (u) {
          const persisted = {
            userId: u.uid,
            email: u.email || null,
            role: (Array.isArray(userProfile?.roles) && userProfile.roles[0]) || 'unknown',
            displayName: u.displayName || (u.email ? u.email.split('@')[0] : undefined)
          };
          localStorage.setItem('userInfo', JSON.stringify(persisted));
        } else {
          localStorage.removeItem('userInfo');
        }
      } catch (error) {
        console.warn(error);
      }
      try {
        await bootstrapAccessControl();
      } finally {
        // no-op
      }
      // Ensure user profile document exists and update lastLoginAt
      try {
        if (u) {
          await loadUserProfile(u);
        }
      } catch (error) {
        console.warn(error);
      }
      // Subscribe to current user's profile
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        stopUserProfile = onSnapshot(userRef, (snap) => {
          setUserProfile(snap.exists() ? snap.data() : null);
          // Update cached role/email for activity logs when profile changes
          try {
            const existing = JSON.parse(localStorage.getItem('userInfo') || '{}');
            const updated = {
              ...existing,
              userId: u.uid,
              email: u.email || existing.email || null,
              role: (snap.exists() && Array.isArray(snap.data().roles) ? snap.data().roles[0] : existing.role || 'unknown')
            };
            localStorage.setItem('userInfo', JSON.stringify(updated));
          } catch (error) {
            console.warn(error);
          }
          setLoadedProfile(true);
        }, () => {
          setUserProfile(null);
          setLoadedProfile(true);
        });
      } else {
        setUserProfile(null);
        setLoadedProfile(true);
      }
    });
    return () => {
      try {
        unsub();
      } catch (error) {
        console.warn(error);
      }
      if (typeof stopUserProfile === 'function') {
        try {
          stopUserProfile();
        } catch (error) {
          console.warn(error);
        }
      }
    };
  }, []);

  // Subscribe to Access Control changes
  useEffect(() => {
    const ref = getAccessControlRef();
    const stop = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() || {};
        setRolePermissions(normalizeRolePermissions(data.rolePermissions));
      } else {
        setRolePermissions(normalizeRolePermissions());
      }
      setLoadedAccess(true);
    }, () => {
      setRolePermissions({
        admin: { pages: { '*': true }, actions: { '*': true } },
        staff: { pages: {}, actions: {} },
        faculty: { pages: {}, actions: {} },
        viewer: { pages: { 'dashboard': true }, actions: {} }
      });
      setLoadedAccess(true);
    });
    return () => stop();
  }, []);

  useEffect(() => {
    setLoading(!(loadedProfile && loadedAccess));
  }, [loadedProfile, loadedAccess]);

  const signIn = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  const signUp = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      try {
        await updateProfile(cred.user, { displayName });
      } catch (error) {
        console.warn(error);
      }
    }
    await loadUserProfile(cred.user);
    return cred.user;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const getAllPageIds = () => {
    const fromRegistry = getAllRegisteredPageIds();
    if (Array.isArray(fromRegistry) && fromRegistry.length > 0) return fromRegistry;
    // Fallback to known pages if registry is empty early in boot
    return [
      'dashboard',
      'scheduling/faculty-schedules',
      'scheduling/individual-availability',
      'scheduling/room-schedules',
      'scheduling/student-schedules',
      'scheduling/group-meeting-scheduler',
      'people/people-directory',
      'people/email-lists',
      'resources/building-directory',
      'resources/room-grid-generator',
      'resources/temperature-monitoring',
      'analytics/department-insights',
      'analytics/course-management',
      'administration/program-management',
      'administration/import-wizard',
      'administration/data-hygiene',
      'administration/recent-changes',
      'administration/baylor-systems',
      'administration/baylor-acronyms',
      'administration/access-control'
    ];
  };

  const canAccess = (pageId) => {
    if (!pageId) return false;
    const emailLower = (user?.email || '').toLowerCase();
    // Env-admin override regardless of Firestore profile state
    if (ADMIN_EMAILS.includes(emailLower)) return true;
    if (!userProfile) return false;
    if (userProfile.disabled === true) return false;
    const roles = Array.isArray(userProfile.roles) ? userProfile.roles : [];
    // Admin override
    if (roles.includes('admin')) return true;
    // User-specific override takes precedence
    const userPerm = userProfile.permissions && Object.prototype.hasOwnProperty.call(userProfile.permissions, pageId)
      ? Boolean(userProfile.permissions[pageId])
      : undefined;
    // New-style per-user overrides
    const userOverridePages = (userProfile.overrides && userProfile.overrides.pages) || {};
    const hasUserOverride = Object.prototype.hasOwnProperty.call(userOverridePages, pageId);
    if (typeof userPerm === 'boolean') return userPerm;
    if (hasUserOverride) return Boolean(userOverridePages[pageId]);
    // Role-based permissions
    if (!rolePermissions) return false;
    const normalized = normalizeRolePermissions(rolePermissions);
    for (const role of roles) {
      const rp = normalized[role] || { pages: {}, actions: {} };
      const pages = rp.pages || {};
      if (pages['*'] === true) return true;
      if (pages[pageId] === true) return true;
    }
    return false;
  };

  const value = {
    user,
    userProfile,
    rolePermissions,
    loading,
    signIn,
    signUp,
    signOut,
    canAccess,
    getAllPageIds,
    isAdmin: (() => {
      const email = (user?.email || '').toLowerCase();
      const isEnvAdmin = ADMIN_EMAILS.includes(email);
      const hasRoleAdmin = Array.isArray(userProfile?.roles) && userProfile.roles.includes('admin');
      return isEnvAdmin || hasRoleAdmin;
    })(),
    // Action-level permissions: simple extension so admins can grant specific actions by setting
    // userProfile.actions[actionKey] === true. Admins always allowed.
    canAction: (actionKey) => {
      if (!actionKey) return false;
      const email = (user?.email || '').toLowerCase();
      if (ADMIN_EMAILS.includes(email)) return true;
      const roles = Array.isArray(userProfile?.roles) ? userProfile.roles : [];
      if (roles.includes('admin')) return true;
      // User-specific overrides (legacy and new)
      if (userProfile) {
        if (userProfile.actions && typeof userProfile.actions === 'object') {
          if (userProfile.actions[actionKey] === true) return true;
        }
        const userOverrideActions = (userProfile.overrides && userProfile.overrides.actions) || {};
        if (userOverrideActions[actionKey] === true) return true;
      }
      // Role-based action permissions
      if (!rolePermissions) return false;
      const normalized = normalizeRolePermissions(rolePermissions);
      for (const role of roles) {
        const rp = normalized[role] || { pages: {}, actions: {} };
        const actions = rp.actions || {};
        if (actions['*'] === true) return true;
        if (actions[actionKey] === true) return true;
      }
      return false;
    }
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
