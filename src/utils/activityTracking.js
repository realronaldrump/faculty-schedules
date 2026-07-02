import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { getNavigationMeta } from "./navigationMeta";

const ACTIVITY_SESSION_STORAGE_KEY = "activitySession";

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

export const buildActivityActor = ({ user, userProfile }) => {
  if (!user?.uid) return null;
  return {
    uid: user.uid,
    email: userProfile?.email || user.email || "",
    displayName: getDisplayName({ user, userProfile }),
    role: getPrimaryRole(userProfile?.roles),
  };
};

const buildSessionId = (uid) =>
  `${uid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const canUseSessionStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const readStoredSession = () => {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVITY_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("Failed to read activity session:", error);
    return null;
  }
};

const writeStoredSession = (session) => {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(
      ACTIVITY_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch (error) {
    console.warn("Failed to persist activity session:", error);
  }
};

export const getActivitySessionId = (uid) => {
  if (!uid) return "";
  const existing = readStoredSession();
  if (existing?.uid === uid && typeof existing?.sessionId === "string") {
    return existing.sessionId;
  }
  const sessionId = buildSessionId(uid);
  writeStoredSession({ uid, sessionId });
  return sessionId;
};

const sanitizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.entries(metadata).reduce((accumulator, [key, value]) => {
    if (accumulator && Object.keys(accumulator).length >= 12) return accumulator;
    if (typeof key !== "string" || !key.trim()) return accumulator;

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      accumulator[key] = value;
      return accumulator;
    }

    if (Array.isArray(value)) {
      accumulator[key] = value
        .filter(
          (item) =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        )
        .slice(0, 10);
    }

    return accumulator;
  }, {});
};

const buildPresenceBase = (actor, pageMeta, sessionId) => ({
  uid: actor.uid,
  email: actor.email,
  displayName: actor.displayName,
  role: actor.role,
  sessionId,
  currentPageId: pageMeta.pageId,
  currentPageLabel: pageMeta.pageLabel,
  currentSectionLabel: pageMeta.sectionLabel,
  updatedAt: serverTimestamp(),
});

// Heartbeat: refresh only the presence doc (no event row) so a user who lingers
// on one page still reads as "Active now" without inflating userActivityEvents.
// Cheap on the free tier — one keyed upsert per call, gated to a visible tab by
// the caller.
export const touchPresence = async ({ actor, currentPage }) => {
  if (!actor?.uid || !currentPage) return;

  const pageMeta = getNavigationMeta(currentPage);
  const sessionId = getActivitySessionId(actor.uid);

  await setDoc(
    doc(db, "userPresence", actor.uid),
    buildPresenceBase(actor, pageMeta, sessionId),
    { merge: true },
  );
};

// Module-level activity context lets feature code report semantic actions with a
// one-line trackAction() call — no actor/page prop drilling. useUserActivityTracker
// (wired in App.jsx) keeps this current for the signed-in user.
let activityContext = { actor: null, currentPage: "" };

export const setActivityContext = ({ actor = null, currentPage = "" } = {}) => {
  activityContext = { actor, currentPage };
};

export const trackAction = (actionKey, metadata = {}) => {
  const { actor, currentPage } = activityContext;
  if (!actor?.uid || !currentPage || !actionKey) return;
  void logUserActivityEvent({
    actor,
    currentPage,
    eventType: "action",
    actionKey,
    metadata,
  }).catch((error) => {
    console.warn("Activity action tracking failed:", error);
  });
};

// Throttled variant for high-frequency sources (e.g. bulk imports logging one
// audit row per record): at most one activity event per actionKey per window.
const lastTrackedAtMs = new Map();
const ACTION_THROTTLE_WINDOW_MS = 30 * 1000;

export const trackActionThrottled = (actionKey, metadata = {}) => {
  if (!actionKey) return;
  const now = Date.now();
  if (now - (lastTrackedAtMs.get(actionKey) || 0) < ACTION_THROTTLE_WINDOW_MS) {
    return;
  }
  lastTrackedAtMs.set(actionKey, now);
  trackAction(actionKey, metadata);
};

export const logUserActivityEvent = async ({
  actor,
  currentPage,
  eventType = "action",
  actionKey = "",
  metadata = {},
  includePresence = false,
}) => {
  if (!actor?.uid || !currentPage) return null;

  const pageMeta = getNavigationMeta(currentPage);
  const sessionId = getActivitySessionId(actor.uid);
  const normalizedEventType =
    typeof eventType === "string" && eventType.trim() ? eventType.trim() : "action";
  const normalizedActionKey =
    typeof actionKey === "string" && actionKey.trim()
      ? actionKey.trim()
      : normalizedEventType === "page_enter"
        ? "navigate"
        : "";

  const eventPayload = {
    uid: actor.uid,
    email: actor.email,
    displayName: actor.displayName,
    role: actor.role,
    sessionId,
    eventType: normalizedEventType,
    actionKey: normalizedActionKey,
    pageId: pageMeta.pageId,
    pageLabel: pageMeta.pageLabel,
    sectionLabel: pageMeta.sectionLabel,
    metadata: sanitizeMetadata(metadata),
    timestamp: serverTimestamp(),
  };

  const writes = [addDoc(collection(db, "userActivityEvents"), eventPayload)];

  if (includePresence) {
    writes.push(
      setDoc(
        doc(db, "userPresence", actor.uid),
        {
          ...buildPresenceBase(actor, pageMeta, sessionId),
          enteredAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  }

  await Promise.all(writes);
  return sessionId;
};
