import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, getDocFromCache } from 'firebase/firestore';
import { logCreate, logUpdate } from '../utils/changeLogger';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  const ADMIN_EMAILS = useMemo(() => {
    const envEmails = (import.meta.env.VITE_ADMIN_EMAILS || import.meta.env.VITE_ADMIN_EMAIL || '').trim();
    return envEmails ? envEmails.split(',').map(e => e.trim().toLowerCase()) : [];
  }, []);

  const getAccessControlRef = () => doc(db, 'settings', 'accessControl');

  const bootstrapAccessControl = async () => {
    // Ensure settings/accessControl exists with safe defaults
    try {
      const ref = getAccessControlRef();
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const allWildcard = { '*': true };
        const defaults = {
          rolePermissions: {
            admin: allWildcard,
            staff: {},
            faculty: {},
            viewer: { 'dashboard': true }
          },
          updatedAt: serverTimestamp(),
        };
        await setDoc(ref, defaults);
        await logCreate('Access Control Defaults', 'settings', 'accessControl', defaults, 'AuthContext.jsx - bootstrapAccessControl');
        setRolePermissions(defaults.rolePermissions);
      } else {
        const data = snap.data() || {};
        setRolePermissions(data.rolePermissions || { admin: { '*': true }, staff: {}, faculty: {}, viewer: { 'dashboard': true } });
      }
    } catch (e) {
      // Fallback to in-memory defaults
      setRolePermissions({ admin: { '*': true }, staff: {}, faculty: {} });
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
      } catch (_) {}
      // Ensure bootstrap admin has admin role
      if (isBootstrapAdmin && !(Array.isArray(existing.roles) && existing.roles.includes('admin'))) {
        const updated = { ...existing, roles: [...new Set([...(existing.roles || []), 'admin'])], updatedAt: serverTimestamp() };
        await updateDoc(userRef, { roles: updated.roles, updatedAt: updated.updatedAt });
        await logUpdate(`User Roles - ${existing.email}`, 'users', firebaseUser.uid, { roles: updated.roles }, existing, 'AuthContext.jsx - loadUserProfile:bootstrapAdmin');
        setUserProfile({ ...existing, roles: updated.roles });
      } else {
        setUserProfile(existing);
      }
    }
  };

  useEffect(() => {
    setLoading(true);
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      try {
        await bootstrapAccessControl();
        await loadUserProfile(u);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const signIn = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  const signUp = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      try { await updateProfile(cred.user, { displayName }); } catch (_) {}
    }
    await loadUserProfile(cred.user);
    return cred.user;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const getAllPageIds = () => {
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
      'analytics/department-insights',
      'analytics/course-management',
      'administration/program-management',
      'administration/smart-import',
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
    if (typeof userPerm === 'boolean') return userPerm;
    // Role-based permissions
    if (!rolePermissions) return false;
    for (const role of roles) {
      const rp = rolePermissions[role] || {};
      if (rp['*'] === true) return true;
      if (rp[pageId] === true) return true;
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
    })()
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);


