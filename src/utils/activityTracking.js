import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { formatDateKeyInTimeZone } from "./activityAnalytics";
import { getNavigationMeta } from "./navigationMeta";

const ACTIVITY_SESSION_STORAGE_KEY = "activitySession";
const ACTIVITY_TIME_ZONE = "America/Chicago";
const NAVIGATION_ACTION_KEY = "navigate";
const warnedWriteFailures = new Set();

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

const safeMapKey = (value) =>
  encodeURIComponent(String(value || "unknown")).replace(/\./g, "%2E");

const getActivityHour = (date) => {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: ACTIVITY_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const hour = Number.parseInt(formatted, 10);
  return Number.isFinite(hour) ? hour % 24 : 0;
};

const buildDailySummaryUpdate = ({
  actor,
  pageMeta,
  sessionId,
  eventPayload,
  now,
}) => {
  const isPageEnter = eventPayload.eventType === "page_enter";
  const isSemanticAction = !isPageEnter;
  const pageEnterDelta = isPageEnter ? 1 : 0;
  const semanticDelta = isSemanticAction ? 1 : 0;
  const minutesDelta = isPageEnter ? 1 : 0;
  const dateKey = formatDateKeyInTimeZone(now, ACTIVITY_TIME_ZONE);
  const hour = getActivityHour(now);
  const pageKey = safeMapKey(pageMeta.pageId);
  const actionKey = eventPayload.actionKey || eventPayload.eventType || "action";
  const actionMapKey = safeMapKey(actionKey);

  const pageSummary = {
    pageId: pageMeta.pageId,
    pageLabel: pageMeta.pageLabel,
    sectionLabel: pageMeta.sectionLabel,
    uniqueUsers: 1,
    pageEnterCount: increment(pageEnterDelta),
    semanticEventCount: increment(semanticDelta),
    count: increment(pageEnterDelta),
    totalMinutesApprox: increment(minutesDelta),
    hourlyBuckets: {
      [`h${String(hour).padStart(2, "0")}`]: {
        hour,
        pageEnterCount: increment(pageEnterDelta),
        semanticEventCount: increment(semanticDelta),
        totalMinutesApprox: increment(minutesDelta),
        uniqueUsers: 1,
      },
    },
  };

  if (isSemanticAction) {
    pageSummary.actionCounts = {
      [actionMapKey]: {
        actionKey,
        count: increment(1),
      },
    };
  }

  return {
    ref: doc(db, "userActivityDaily", `${dateKey}_${actor.uid}`),
    data: {
      schemaVersion: 2,
      dateKey,
      uid: actor.uid,
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
      sessionIds: arrayUnion(sessionId),
      pageEnterCount: increment(pageEnterDelta),
      semanticEventCount: increment(semanticDelta),
      pagesVisitedCount: increment(pageEnterDelta),
      totalMinutesApprox: increment(minutesDelta),
      pageCounts: {
        [pageKey]: pageSummary,
      },
      hourlyBuckets: {
        [`h${String(hour).padStart(2, "0")}`]: {
          hour,
          pageEnterCount: increment(pageEnterDelta),
          semanticEventCount: increment(semanticDelta),
          totalMinutesApprox: increment(minutesDelta),
          uniqueUsers: 1,
        },
      },
      ...(isSemanticAction
        ? {
            actionCounts: {
              [actionMapKey]: {
                actionKey,
                count: increment(1),
              },
            },
          }
        : {}),
      firstSeenAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  };
};

const warnWriteFailureOnce = (label, error) => {
  const key = `${label}:${error?.code || error?.message || "unknown"}`;
  if (warnedWriteFailures.has(key)) return;
  warnedWriteFailures.add(key);
  console.warn(`Activity ${label} write failed:`, error);
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

  const now = new Date();
  const summaryUpdate = buildDailySummaryUpdate({
    actor,
    pageMeta,
    sessionId,
    eventPayload,
    now,
  });

  const writes = [
    {
      label: "daily summary",
      promise: setDoc(summaryUpdate.ref, summaryUpdate.data, { merge: true }),
    },
  ];

  // Navigation volume belongs in per-user daily summaries and presence. Keep raw
  // event rows for semantic actions only so the live timeline remains useful
  // without letting route changes grow an unbounded collection.
  if (
    normalizedEventType !== "page_enter" &&
    normalizedActionKey !== NAVIGATION_ACTION_KEY
  ) {
    writes.push({
      label: "event timeline",
      promise: addDoc(collection(db, "userActivityEvents"), eventPayload),
    });
  }

  if (includePresence) {
    writes.push(
      {
        label: "presence",
        promise: setDoc(
          doc(db, "userPresence", actor.uid),
          {
            ...buildPresenceBase(actor, pageMeta, sessionId),
            enteredAt: serverTimestamp(),
          },
          { merge: true },
        ),
      },
    );
  }

  const results = await Promise.allSettled(writes.map((write) => write.promise));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      warnWriteFailureOnce(writes[index].label, result.reason);
    }
  });
  return sessionId;
};
