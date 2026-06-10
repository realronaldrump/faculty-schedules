import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { logCreate } from "../utils/changeLogger";
import {
  getAllRegisteredPageIds,
  getRegisteredPageMeta,
  getRegisteredNavigationEntries,
} from "../utils/pageRegistry";
import { USER_STATUS, normalizeRolePermissions, resolveUserStatus, isUserAdmin, isUserActive, isUserPending, isUserDisabled, canAccessPage } from "../utils/authz";
import { isActivityOwnerUid, isOwnerOnlyPageId } from "../utils/activityOwner";

const AuthContext = createContext(null);

const USER_ACTIVITY_HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds
const USER_ACTIVITY_MIN_UPDATE_INTERVAL_MS = 30 * 1000; // 30 seconds
const USER_ACTIVITY_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [rolePermissions, setRolePermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedProfile, setLoadedProfile] = useState(false);
  const [loadedAccess, setLoadedAccess] = useState(false);
  const activityTrackerRef = useRef(null);
  const userProfileIsAdmin = isUserAdmin(userProfile);

  // Removed insecure .env based admin check. Admin access is now strictly role-based.

  const getAccessControlRef = () => doc(db, "settings", "accessControl");

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
        lastActiveAt: serverTimestamp(),
      };
      await setDoc(userRef, newProfile);
      logCreate(
        `User - ${newProfile.email}`,
        "users",
        firebaseUser.uid,
        newProfile,
        "AuthContext.jsx - loadUserProfile:create",
      ).catch(() => {});
      setUserProfile({
        ...newProfile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      const existing = snap.data();
      // Update last login timestamp
      try {
        await updateDoc(userRef, {
          lastLoginAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn(error);
      }
      setUserProfile(existing);
    }
  };

  const stopUserActivityTracking = () => {
    const tracker = activityTrackerRef.current;
    if (!tracker) return;

    if (tracker.intervalId) {
      clearInterval(tracker.intervalId);
    }
    if (tracker.visibilityListener) {
      document.removeEventListener(
        "visibilitychange",
        tracker.visibilityListener,
      );
    }
    if (tracker.pageHideListener) {
      window.removeEventListener("pagehide", tracker.pageHideListener);
    }
    if (Array.isArray(tracker.events)) {
      tracker.events.forEach(({ type, handler }) =>
        window.removeEventListener(type, handler),
      );
    }

    activityTrackerRef.current = null;
  };

  const startUserActivityTracking = (uid) => {
    stopUserActivityTracking();
    if (!uid || typeof window === "undefined" || typeof document === "undefined")
      return;

    const userRef = doc(db, "users", uid);
    const tracked = { events: [] };
    let lastUpdateMs = Date.now();
    let lastInteractionMs = Date.now();

    const refreshLastActive = async ({ force = false, includeHidden = false } = {}) => {
      if (!includeHidden && document.hidden) return;

      const nowMs = Date.now();
      const isIdle = nowMs - lastInteractionMs > USER_ACTIVITY_IDLE_TIMEOUT_MS;
      if (!force && isIdle) return;
      if (!force && nowMs - lastUpdateMs < USER_ACTIVITY_MIN_UPDATE_INTERVAL_MS)
        return;

      lastUpdateMs = nowMs;
      try {
        await updateDoc(userRef, { lastActiveAt: serverTimestamp() });
      } catch (error) {
        console.warn(error);
      }
    };

    const markActivity = () => {
      lastInteractionMs = Date.now();
      void refreshLastActive();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        // Persist the final "last seen" moment when the app is backgrounded.
        void refreshLastActive({ force: true, includeHidden: true });
        return;
      }
      lastInteractionMs = Date.now();
      void refreshLastActive({ force: true });
    };

    const onPageHide = () => {
      lastInteractionMs = Date.now();
      void refreshLastActive({ force: true, includeHidden: true });
    };

    const activityEvents = ["pointerdown", "touchstart", "keydown", "scroll"];
    activityEvents.forEach((eventType) => {
      window.addEventListener(eventType, markActivity, { passive: true });
      tracked.events.push({ type: eventType, handler: markActivity });
    });

    document.addEventListener("visibilitychange", onVisibilityChange);
    tracked.visibilityListener = onVisibilityChange;
    window.addEventListener("pagehide", onPageHide);
    tracked.pageHideListener = onPageHide;
    tracked.intervalId = setInterval(
      () => {
        void refreshLastActive();
      },
      USER_ACTIVITY_HEARTBEAT_INTERVAL_MS,
    );

    activityTrackerRef.current = tracked;
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
      setLoadedAccess(false);
      // Ensure user profile document exists and update lastLoginAt
      try {
        if (u) {
          await loadUserProfile(u);
          startUserActivityTracking(u.uid);
        }
      } catch (error) {
        console.error("Failed to load/create user profile:", error);
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
        setRolePermissions(normalizeRolePermissions());
        setLoadedProfile(true);
        setLoadedAccess(true);
        stopUserActivityTracking();
      }
    });
    return () => {
      try {
        unsub();
      } catch (error) {
        console.warn(error);
      }
      stopUserActivityTracking();
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
    if (!user?.uid) {
      setRolePermissions(normalizeRolePermissions());
      setLoadedAccess(true);
      return undefined;
    }

    if (!loadedProfile) {
      setLoadedAccess(false);
      return undefined;
    }

    setLoadedAccess(false);
    const ref = getAccessControlRef();
    const stop = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          setRolePermissions(normalizeRolePermissions(data.rolePermissions));
        } else {
          const defaults = {
            rolePermissions: normalizeRolePermissions(),
            updatedAt: serverTimestamp(),
          };
          setRolePermissions(defaults.rolePermissions);
          if (userProfileIsAdmin) {
            setDoc(ref, defaults, { merge: true })
              .then(() =>
                logCreate(
                  "Access Control Defaults",
                  "settings",
                  "accessControl",
                  defaults,
                  "AuthContext.jsx - accessControlListener",
                ),
              )
              .catch((error) => {
                console.warn("Failed to seed access control defaults.", error);
              });
          }
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
  }, [user?.uid, loadedProfile, userProfileIsAdmin]);

  useEffect(() => {
    setLoading(!(loadedProfile && loadedAccess));
  }, [loadedProfile, loadedAccess]);

  const signIn = useCallback(async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const signUp = useCallback(async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      try {
        await updateProfile(cred.user, { displayName });
      } catch (error) {
        console.warn(error);
      }
    }
    // Profile creation is handled by onAuthStateChanged listener — don't
    // call loadUserProfile here to avoid a race where two concurrent
    // setDoc calls collide (second one hits the update rule and is denied).
    return cred.user;
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const userUid = user?.uid;

  const getAllPageIds = useCallback(() => {
    const isOwner = isActivityOwnerUid(userUid);
    const fromMeta = getRegisteredPageMeta();
    if (Array.isArray(fromMeta) && fromMeta.length > 0) {
      return fromMeta
        .filter((entry) => !entry?.ownerOnly || isOwner)
        .map((entry) => entry.id);
    }

    const fromRegistry = getAllRegisteredPageIds();
    if (!Array.isArray(fromRegistry)) return [];
    return fromRegistry.filter((pageId) =>
      isOwner ? true : !isOwnerOnlyPageId(pageId),
    );
  }, [userUid]);

  const getAllNavigationEntries = useCallback(() => {
    const fromRegistry = getRegisteredNavigationEntries();
    if (!Array.isArray(fromRegistry)) return [];
    const isOwner = isActivityOwnerUid(userUid);
    return fromRegistry.filter((entry) => !entry?.ownerOnly || isOwner);
  }, [userUid]);

  const canAccess = useCallback(
    (pageId) => {
      if (!isActivityOwnerUid(userUid) && isOwnerOnlyPageId(pageId)) {
        return false;
      }
      return canAccessPage({ userProfile, rolePermissions, pageId });
    },
    [userUid, userProfile, rolePermissions],
  );

  const value = useMemo(
    () => ({
      user,
      userProfile,
      rolePermissions,
      loading,
      signIn,
      signUp,
      signOut,
      canAccess,
      getAllPageIds,
      getAllNavigationEntries,
      userStatus: resolveUserStatus(userProfile),
      isPending: isUserPending(userProfile),
      isActive: isUserActive(userProfile),
      isDisabled: isUserDisabled(userProfile),
      isAdmin: isUserAdmin(userProfile),
      isActivityOwner: isActivityOwnerUid(user?.uid),
    }),
    [
      user,
      userProfile,
      rolePermissions,
      loading,
      signIn,
      signUp,
      signOut,
      canAccess,
      getAllPageIds,
      getAllNavigationEntries,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
