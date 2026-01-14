import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  canPerformAction,
} from "../utils/authz";

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

  const getAccessControlRef = () => doc(db, "settings", "accessControl");

  const bootstrapAccessControl = async () => {
    // Ensure settings/accessControl exists with safe defaults
    try {
      const ref = getAccessControlRef();
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const defaults = {
          rolePermissions: {
            admin: { pages: { "*": true }, actions: { "*": true } },
            staff: { pages: {}, actions: {} },
            faculty: { pages: {}, actions: {} },
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
        admin: { pages: { "*": true }, actions: { "*": true } },
        staff: { pages: {}, actions: {} },
        faculty: { pages: {}, actions: {} },
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
    const emailLower = (firebaseUser.email || "").toLowerCase();
    const isBootstrapAdmin = ADMIN_EMAILS.includes(emailLower);

    if (!snap.exists()) {
      const newProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName:
          firebaseUser.displayName ||
          firebaseUser.email?.split("@")[0] ||
          "User",
        roles: isBootstrapAdmin ? ["admin"] : [],
        status: isBootstrapAdmin ? USER_STATUS.ACTIVE : USER_STATUS.PENDING,
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
      // Persist minimal user info for activity logger
      try {
        if (u) {
          const persisted = {
            userId: u.uid,
            email: u.email || null,
            role: normalizeRoleList(userProfile?.roles)[0] || "unknown",
            status: resolveUserStatus(userProfile) || "unknown",
            displayName:
              u.displayName || (u.email ? u.email.split("@")[0] : undefined),
          };
          localStorage.setItem("userInfo", JSON.stringify(persisted));
        } else {
          localStorage.removeItem("userInfo");
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
        const userRef = doc(db, "users", u.uid);
        stopUserProfile = onSnapshot(
          userRef,
          (snap) => {
            setUserProfile(snap.exists() ? snap.data() : null);
            // Update cached role/email for activity logs when profile changes
            try {
              const existing = JSON.parse(
                localStorage.getItem("userInfo") || "{}",
              );
              const roles = normalizeRoleList(
                snap.exists() ? snap.data().roles : existing.roles,
              );
              const updated = {
                ...existing,
                userId: u.uid,
                email: u.email || existing.email || null,
                role: roles[0] || existing.role || "unknown",
                status:
                  resolveUserStatus(snap.exists() ? snap.data() : existing) ||
                  existing.status ||
                  "unknown",
              };
              localStorage.setItem("userInfo", JSON.stringify(updated));
            } catch (error) {
              console.warn(error);
            }
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
          admin: { pages: { "*": true }, actions: { "*": true } },
          staff: { pages: {}, actions: {} },
          faculty: { pages: {}, actions: {} },
        });
        setLoadedAccess(true);
      },
    );
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
    if (Array.isArray(fromRegistry) && fromRegistry.length > 0)
      return fromRegistry;
    // Fallback to known pages if registry is empty early in boot
    return [
      "dashboard",
      "live-view",
      "scheduling/faculty-schedules",
      "scheduling/individual-availability",
      "scheduling/room-schedules",
      "scheduling/student-schedules",
      "scheduling/group-meeting-scheduler",
      "people/people-directory",
      "people/email-lists",
      "people/baylor-id-manager",
      "resources/building-directory",
      "resources/baylor-acronyms",
      "resources/baylor-systems",
      "tools/import-wizard",
      "tools/data-hygiene",
      "tools/crn-tools",
      "tools/outlook-export",
      "tools/room-grid-generator",
      "tools/temperature-monitoring",
      "analytics/department-insights",
      "analytics/student-worker-analytics",
      "analytics/course-management",
      "analytics/program-management",
      "administration/app-settings",
      "administration/access-control",
      "administration/user-activity",
      "administration/recent-changes",
      "help/tutorials",
    ];
  };

  const canAccess = (pageId) => {
    const emailLower = (user?.email || "").toLowerCase();
    // Env-admin override regardless of Firestore profile state
    if (ADMIN_EMAILS.includes(emailLower)) return true;
    return canAccessPage({ userProfile, rolePermissions, pageId });
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
    userStatus: resolveUserStatus(userProfile),
    isPending: isUserPending(userProfile),
    isActive: isUserActive(userProfile),
    isDisabled: isUserDisabled(userProfile),
    isAdmin: (() => {
      const email = (user?.email || "").toLowerCase();
      const isEnvAdmin = ADMIN_EMAILS.includes(email);
      const hasRoleAdmin = isUserAdmin(userProfile);
      return isEnvAdmin || hasRoleAdmin;
    })(),
    // Action-level permissions: simple extension so admins can grant specific actions by setting
    // userProfile.actions[actionKey] === true. Admins always allowed.
    canAction: (actionKey) => {
      if (!actionKey) return false;
      const email = (user?.email || "").toLowerCase();
      if (ADMIN_EMAILS.includes(email)) return true;
      return canPerformAction({ userProfile, rolePermissions, actionKey });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
