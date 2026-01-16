import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePostHog } from "posthog-js/react";
import { auth, db } from "../firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { logCreate, logUpdate } from "../utils/changeLogger";
import { getAllRegisteredPageIds } from "../utils/pageRegistry";
import {
  USER_STATUS,
  normalizeRoleList,
  normalizeRolePermissions,
  resolveUserStatus,
  isUserAdmin,
  isUserActive,
  isUserPending,
  isUserDisabled,
  canAccessPage,
} from "../utils/authz";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedProfile, setLoadedProfile] = useState(false);
  const [loadedAccess, setLoadedAccess] = useState(false);
  const posthog = usePostHog();
  const lastIdentifiedRef = useRef(null);

  // Removed insecure .env based admin check. Admin access is now strictly role-based.

  const getAccessControlRef = () => doc(db, "settings", "accessControl");

  const bootstrapAccessControl = async () => {
    // Ensure settings/accessControl exists with safe defaults
    try {
      const ref = getAccessControlRef();
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const defaults = {
          rolePermissions: {
            admin: { pages: { "*": true } },
            staff: { pages: {} },
            faculty: { pages: {} },
          },
          updatedAt: serverTimestamp(),
        };
        await setDoc(ref, defaults);
        await logCreate(
          "Access Control Defaults",
          "settings",
          "accessControl",
          defaults,
          "AuthContext.jsx - bootstrapAccessControl",
        );
        setRolePermissions(defaults.rolePermissions);
      } else {
        const data = snap.data() || {};
        setRolePermissions(normalizeRolePermissions(data.rolePermissions));
      }
    } catch (e) {
      // Fallback to in-memory defaults (normalized shape)
      setRolePermissions({
        admin: { pages: { "*": true } },
        staff: { pages: {} },
        faculty: { pages: {} },
      });
      console.warn("Failed to load access control. Using defaults.", e);
    }
  };

  const loadUserProfile = async (firebaseUser) => {
    if (!firebaseUser) {
      setUserProfile(null);
      return;
    }
    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const newProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName:
          firebaseUser.displayName ||
          firebaseUser.email?.split("@")[0] ||
          "User",
        roles: [],
        status: USER_STATUS.PENDING,
        disabled: false,
        permissions: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };
      await setDoc(userRef, newProfile);
      await logCreate(
        `User - ${newProfile.email}`,
        "users",
        firebaseUser.uid,
        newProfile,
        "AuthContext.jsx - loadUserProfile:create",
      );
      setUserProfile({
        ...newProfile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
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
      if (typeof stopUserProfile === "function") {
        try {
          stopUserProfile();
        } catch (error) {
          console.warn(error);
        }
        stopUserProfile = null;
      }

      setUser(u);
      setLoadedProfile(false);
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
        const userRef = doc(db, "users", u.uid);
        stopUserProfile = onSnapshot(
          userRef,
          (snap) => {
            setUserProfile(snap.exists() ? snap.data() : null);
            setLoadedProfile(true);
          },
          () => {
            setUserProfile(null);
            setLoadedProfile(true);
          },
        );
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
      if (typeof stopUserProfile === "function") {
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
    const stop = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          setRolePermissions(normalizeRolePermissions(data.rolePermissions));
        } else {
          setRolePermissions(normalizeRolePermissions());
        }
        setLoadedAccess(true);
      },
      () => {
        setRolePermissions({
          admin: { pages: { "*": true } },
          staff: { pages: {} },
          faculty: { pages: {} },
        });
        setLoadedAccess(true);
      },
    );
    return () => stop();
  }, []);

  useEffect(() => {
    setLoading(!(loadedProfile && loadedAccess));
  }, [loadedProfile, loadedAccess]);

  useEffect(() => {
    if (!posthog) return;
    const currentId = user?.uid || null;
    if (!currentId) {
      if (lastIdentifiedRef.current) {
        posthog.reset();
        lastIdentifiedRef.current = null;
      }
      return;
    }

    if (lastIdentifiedRef.current && lastIdentifiedRef.current !== currentId) {
      posthog.reset();
    }

    const role = normalizeRoleList(userProfile?.roles)[0] || "unknown";
    const status = resolveUserStatus(userProfile) || "unknown";
    posthog.identify(currentId, {
      email: user?.email || null,
      display_name:
        user?.displayName ||
        (user?.email ? user.email.split("@")[0] : undefined),
      role,
      status,
    });
    lastIdentifiedRef.current = currentId;
  }, [posthog, user, userProfile]);

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
    return Array.isArray(fromRegistry) ? fromRegistry : [];
  };

  const canAccess = (pageId) =>
    canAccessPage({ userProfile, rolePermissions, pageId });

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
    userStatus: resolveUserStatus(userProfile),
    isPending: isUserPending(userProfile),
    isActive: isUserActive(userProfile),
    isDisabled: isUserDisabled(userProfile),
    isAdmin: isUserAdmin(userProfile),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
