const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// Callable functions v2 require explicit CORS config when invoked from non-Firebase
// origins (for example, a Vercel-hosted SPA).
const ALLOWED_CALLABLE_ORIGINS = [
  "https://faculty-schedules.vercel.app",
  // Local dev
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  // Vercel preview deployments
  /^https:\/\/faculty-schedules(?:-[a-z0-9-]+)?\.vercel\.app$/,
];

const normalizeRoleList = (roles) => {
  if (Array.isArray(roles)) {
    return roles.filter(Boolean);
  }
  if (roles && typeof roles === "object") {
    return Object.keys(roles).filter((key) => roles[key]);
  }
  if (typeof roles === "string" && roles.trim()) {
    return [roles.trim()];
  }
  return [];
};

const ACTIVITY_ROLLUP_TIME_ZONE = "America/Chicago";
const ACTIVITY_ROLLUP_FETCH_LIMIT = 10000;
const ACTIVITY_ROLLUP_LOOKBACK_DAYS = 3;
const MIN_ACTIVITY_MINUTES_PER_EVENT = 1;
const MAX_ACTIVITY_GAP_MINUTES = 30;

const formatDateKeyInTimeZone = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ACTIVITY_ROLLUP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
};

const asDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildUserRollupSeed = (event) => ({
  uid: event.uid,
  email: event.email || "",
  displayName: event.displayName || event.email || event.uid || "Unknown User",
  pageCounts: new Map(),
  uniquePageIds: new Set(),
  totalMinutesApprox: 0,
  firstSeenAt: event.timestampDate,
  lastSeenAt: event.timestampDate,
});

const appendPageCount = (summary, event) => {
  const pageLabel = event.pageLabel || event.pageId || "Unknown Page";
  const current = summary.pageCounts.get(pageLabel) || 0;
  summary.pageCounts.set(pageLabel, current + 1);
  if (event.pageId) {
    summary.uniquePageIds.add(event.pageId);
  }
};

const normalizeEventMinutes = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return MIN_ACTIVITY_MINUTES_PER_EVENT;
  }
  return Math.max(
    MIN_ACTIVITY_MINUTES_PER_EVENT,
    Math.min(MAX_ACTIVITY_GAP_MINUTES, Math.round(minutes)),
  );
};

exports.rollupUserActivityDaily = onSchedule(
  {
    region: "us-central1",
    schedule: "15 1 * * *",
    timeZone: ACTIVITY_ROLLUP_TIME_ZONE,
  },
  async () => {
    const now = new Date();
    const targetDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const targetDateKey = formatDateKeyInTimeZone(targetDate);
    const lookbackStart = new Date(
      now.getTime() - ACTIVITY_ROLLUP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    const eventsSnapshot = await db
      .collection("userActivityEvents")
      .orderBy("timestamp", "desc")
      .limit(ACTIVITY_ROLLUP_FETCH_LIMIT)
      .get();

    const events = [];
    eventsSnapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (data.eventType !== "page_enter") return;
      if (!data.uid) return;

      const timestampDate = asDate(data.timestamp);
      if (!timestampDate || timestampDate < lookbackStart) return;
      if (formatDateKeyInTimeZone(timestampDate) !== targetDateKey) return;

      events.push({
        id: docSnap.id,
        ...data,
        timestampDate,
      });
    });

    if (events.length === 0) {
      return null;
    }

    const summariesByUid = new Map();
    const eventsBySession = new Map();

    events.forEach((event) => {
      const existingSummary = summariesByUid.get(event.uid);
      const summary = existingSummary || buildUserRollupSeed(event);
      summary.email = summary.email || event.email || "";
      summary.displayName =
        summary.displayName ||
        event.displayName ||
        event.email ||
        event.uid ||
        "Unknown User";
      if (event.timestampDate < summary.firstSeenAt) {
        summary.firstSeenAt = event.timestampDate;
      }
      if (event.timestampDate > summary.lastSeenAt) {
        summary.lastSeenAt = event.timestampDate;
      }
      appendPageCount(summary, event);
      summariesByUid.set(event.uid, summary);

      const sessionKey = `${event.uid}:${event.sessionId || "default"}`;
      const sessionEvents = eventsBySession.get(sessionKey) || [];
      sessionEvents.push(event);
      eventsBySession.set(sessionKey, sessionEvents);
    });

    eventsBySession.forEach((sessionEvents) => {
      const ordered = sessionEvents.sort(
        (left, right) => left.timestampDate.getTime() - right.timestampDate.getTime(),
      );

      ordered.forEach((event, index) => {
        const nextEvent = ordered[index + 1];
        const summary = summariesByUid.get(event.uid);
        if (!summary) return;

        if (!nextEvent) {
          summary.totalMinutesApprox += MIN_ACTIVITY_MINUTES_PER_EVENT;
          return;
        }

        const diffMinutes =
          (nextEvent.timestampDate.getTime() - event.timestampDate.getTime()) /
          (1000 * 60);
        summary.totalMinutesApprox += normalizeEventMinutes(diffMinutes);
      });
    });

    const batch = db.batch();
    summariesByUid.forEach((summary, uid) => {
      const topPages = Array.from(summary.pageCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([page]) => page);

      const docRef = db.collection("userActivityDaily").doc(`${targetDateKey}_${uid}`);
      batch.set(
        docRef,
        {
          dateKey: targetDateKey,
          uid,
          email: summary.email || "",
          displayName: summary.displayName,
          totalMinutesApprox: Math.round(summary.totalMinutesApprox),
          pagesVisitedCount: summary.uniquePageIds.size,
          pageEnterCount: Array.from(summary.pageCounts.values()).reduce(
            (count, value) => count + value,
            0,
          ),
          topPages,
          firstSeenAt: summary.firstSeenAt,
          lastSeenAt: summary.lastSeenAt,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    await batch.commit();
    return null;
  },
);

exports.deleteUser = onCall(
  {
    region: "us-central1",
    cors: ALLOWED_CALLABLE_ORIGINS,
    // Callable functions must be reachable from browsers; auth is enforced via Firebase Auth tokens,
    // not Cloud Run IAM.
    invoker: "public",
  },
  async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const targetUid = request.data?.uid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "A valid uid is required.");
  }

  if (targetUid === callerUid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot delete your own account.",
    );
  }

  const callerSnap = await db.doc(`users/${callerUid}`).get();
  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found.");
  }
  const callerRoles = normalizeRoleList(callerSnap.data()?.roles);
  if (!callerRoles.includes("admin")) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const targetRef = db.doc(`users/${targetUid}`);
  const targetSnap = await targetRef.get();
  const targetData = targetSnap.exists ? targetSnap.data() : null;

  let authDeleted = false;
  try {
    await auth.deleteUser(targetUid);
    authDeleted = true;
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw new HttpsError("internal", "Failed to delete auth account.");
    }
  }

  try {
    await targetRef.delete();
  } catch (error) {
    throw new HttpsError("internal", "Failed to delete user profile.");
  }

  await db.collection("changeLog").add({
    timestamp: new Date().toISOString(),
    action: "DELETE",
    entity: `User Profile - ${targetData?.email || targetUid}`,
    collection: "users",
    documentId: targetUid,
    originalData: targetData || null,
    source: "functions.deleteUser",
    metadata: {
      authDeleted,
      profileExisted: targetSnap.exists,
    },
    userId: callerUid,
  });

  return {
    success: true,
    authDeleted,
    profileDeleted: targetSnap.exists,
  };
  },
);
