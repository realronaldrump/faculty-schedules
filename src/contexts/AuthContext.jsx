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
import { isOwnerUid } from "../utils/owner";

const AuthContext = createContext(null);

const USER_ACTIVITY_HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds
const USER_ACTIVITY_MIN_UPDATE_INTERVAL_MS = 30 * 1000; // 30 seconds
const USER_ACTIVITY_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Firestore errors that, immediately after a fresh sign-in, indicate the auth
// token has not yet propagated to the Firestore SDK rather than a real denial.
const TRANSIENT_AUTH_ERROR_CODES = new Set([
  "permission-denied",
  "unauthenticated",
]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read the signed-in user's own profile doc, retrying through the brief window
 * after a fresh sign-in where the auth token has not yet reached the Firestore
 * SDK (the read is denied until it does). Self-reads are gated only on
 * `request.auth.uid == userId`, so a `permission-denied` here can only mean the
 * token isn't attached yet — making this read a reliable "auth is ready" probe.
 *
 * Awaiting this before attaching the profile/access listeners and downstream
 * data loads closes the race that otherwise left freshly-signed-in users with
 * no data until a full page refresh.
 */
const readOwnProfileWhenAuthReady = async (
  userRef,
  { attempts = 6, baseDelayMs = 250 } = {},
) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getDoc(userRef);
    } catch (error) {
      const isTransient = TRANSIENT_AUTH_ERROR_CODES.has(error?.code);
      if (!isTransient || attempt >= attempts - 1) {
        throw error;
      }
      await wait(baseDelayMs * (attempt + 1));
    }
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadedProfile, setLoadedProfile] = useState(false);
  const activityTrackerRef = useRef(null);

  const loadUserProfile = async (firebaseUser) => {
    if (!firebaseUser) {
      setUserProfile(null);
      return;
    }
    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await readOwnProfileWhenAuthReady(userRef);
    if (!snap.exists()) {
      const newProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName:
          firebaseUser.displayName ||
          firebaseUser.email?.split("@")[0] ||
          "User",
        status: "pending",
        disabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      };
      await setDoc(userRef, newProfile);
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
        setLoadedProfile(true);
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

  const isOwner = isOwnerUid(user?.uid);
  const isApproved =
    isOwner ||
    (userProfile?.status === "active" && userProfile?.disabled !== true);

  const value = useMemo(
    () => ({
      user,
      userProfile,
      loading: !loadedProfile,
      signIn,
      signUp,
      signOut,
      isOwner,
      isApproved,
    }),
    [user, userProfile, loadedProfile, signIn, signUp, signOut, isOwner, isApproved],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
