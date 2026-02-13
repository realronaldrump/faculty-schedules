import { useEffect, useMemo, useRef } from "react";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext.jsx";
import { getNavigationMeta } from "../utils/navigationMeta";

const ACTIVITY_EVENT_TTL_DAYS = 90;
const DUPLICATE_EVENT_WINDOW_MS = 15 * 1000;

const normalizeRoleList = (roles) => {
  if (Array.isArray(roles)) return roles.filter(Boolean);
  if (roles && typeof roles === "object") {
    return Object.keys(roles).filter((key) => roles[key]);
  }
  if (typeof roles === "string" && roles.trim()) return [roles.trim()];
  return [];
};

const getPrimaryRole = (roles) => {
  const normalizedRoles = normalizeRoleList(roles);
  if (normalizedRoles.includes("admin")) return "admin";
  if (normalizedRoles.includes("staff")) return "staff";
  if (normalizedRoles.includes("faculty")) return "faculty";
  return normalizedRoles[0] || "unknown";
};

const getDisplayName = ({ user, userProfile }) =>
  userProfile?.displayName ||
  user?.displayName ||
  userProfile?.email?.split("@")?.[0] ||
  user?.email?.split("@")?.[0] ||
  "Unknown User";

const buildSessionId = (uid) =>
  `${uid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const buildExpiryTimestamp = () => {
  const now = Date.now();
  const expiryMs = ACTIVITY_EVENT_TTL_DAYS * 24 * 60 * 60 * 1000;
  return Timestamp.fromDate(new Date(now + expiryMs));
};

const defaultLastEvent = { pageId: "", timestampMs: 0 };

export const useUserActivityTracker = ({
  currentPage,
  isAuthenticated,
} = {}) => {
  const { user, userProfile, loading, canAccess } = useAuth();
  const sessionIdRef = useRef("");
  const lastEventRef = useRef(defaultLastEvent);

  const actor = useMemo(() => {
    if (!user?.uid) return null;
    return {
      uid: user.uid,
      email: userProfile?.email || user.email || "",
      displayName: getDisplayName({ user, userProfile }),
      role: getPrimaryRole(userProfile?.roles),
    };
  }, [
    user?.uid,
    user?.email,
    user?.displayName,
    userProfile?.email,
    userProfile?.displayName,
    userProfile?.roles,
  ]);

  useEffect(() => {
    if (!isAuthenticated || loading || !user?.uid) {
      sessionIdRef.current = "";
      lastEventRef.current = defaultLastEvent;
      return;
    }

    if (!sessionIdRef.current) {
      sessionIdRef.current = buildSessionId(user.uid);
    }
  }, [isAuthenticated, loading, user?.uid]);

  useEffect(() => {
    if (!isAuthenticated || loading || !actor || !currentPage) return;

    const pageMeta = getNavigationMeta(currentPage);
    const accessId = pageMeta?.accessId || pageMeta?.pageId || currentPage;
    if (typeof canAccess === "function" && !canAccess(accessId)) {
      return;
    }

    const nowMs = Date.now();
    const lastEvent = lastEventRef.current;
    if (
      lastEvent.pageId === currentPage &&
      nowMs - lastEvent.timestampMs < DUPLICATE_EVENT_WINDOW_MS
    ) {
      return;
    }
    lastEventRef.current = { pageId: currentPage, timestampMs: nowMs };

    const sessionId = sessionIdRef.current || buildSessionId(actor.uid);
    sessionIdRef.current = sessionId;

    const presencePayload = {
      uid: actor.uid,
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
      sessionId,
      currentPageId: pageMeta.pageId,
      currentPageLabel: pageMeta.pageLabel,
      currentSectionLabel: pageMeta.sectionLabel,
      enteredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const eventPayload = {
      uid: actor.uid,
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
      sessionId,
      eventType: "page_enter",
      pageId: pageMeta.pageId,
      pageLabel: pageMeta.pageLabel,
      sectionLabel: pageMeta.sectionLabel,
      timestamp: serverTimestamp(),
      expiresAt: buildExpiryTimestamp(),
    };

    const writeActivity = async () => {
      try {
        await Promise.all([
          setDoc(doc(db, "userPresence", actor.uid), presencePayload, {
            merge: true,
          }),
          addDoc(collection(db, "userActivityEvents"), eventPayload),
        ]);
      } catch (error) {
        console.warn("User activity tracking write failed:", error);
      }
    };

    void writeActivity();
  }, [actor, canAccess, currentPage, isAuthenticated, loading]);
};

export default useUserActivityTracker;
