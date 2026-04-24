const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  ACTIVITY_ROLLUP_TIME_ZONE,
  addDaysToDateKey,
  enumerateDateKeys,
  getDateKeyUtcRange,
  formatDateKeyInTimeZone,
  rollupActivityForDateKeys,
} = require("./activityAnalytics");

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

const ACTIVITY_OWNER_UID = "fjQuh4iAMFYi8URf35Yv5RRijKw2";
const MAX_BACKFILL_DAYS = 120;
const QUERY_PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 425;

const buildPageRollupDocId = (pageDoc) =>
  `${pageDoc.dateKey}_${encodeURIComponent(pageDoc.pageId || "unknown")}`;

const fetchActivityEventsForDateRange = async (startDateKey, endDateKey) => {
  const { start } = getDateKeyUtcRange(startDateKey, ACTIVITY_ROLLUP_TIME_ZONE);
  const { start: endExclusive } = getDateKeyUtcRange(
    addDaysToDateKey(endDateKey, 1),
    ACTIVITY_ROLLUP_TIME_ZONE,
  );

  const queryRef = db
    .collection("userActivityEvents")
    .where("timestamp", ">=", start)
    .where("timestamp", "<", endExclusive)
    .orderBy("timestamp", "asc")
    .limit(QUERY_PAGE_SIZE);

  const events = [];
  let lastDoc = null;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await (lastDoc ? queryRef.startAfter(lastDoc).get() : queryRef.get());
    if (snapshot.empty) break;

    snapshot.docs.forEach((docSnap) => {
      events.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (snapshot.size < QUERY_PAGE_SIZE) {
      hasMore = false;
      continue;
    }
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return events;
};

const buildRollupWrites = (dateSummaries) => {
  const writes = [];

  dateSummaries.forEach((summary) => {
    writes.push({
      ref: db.collection("userActivityAnalyticsDaily").doc(summary.analyticsDoc.dateKey),
      data: {
        ...summary.analyticsDoc,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    summary.pageDocs.forEach((pageDoc) => {
      writes.push({
        ref: db
          .collection("userActivityPageDaily")
          .doc(buildPageRollupDocId(pageDoc)),
        data: {
          ...pageDoc,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    });

    summary.userDocs.forEach((userDoc) => {
      writes.push({
        ref: db.collection("userActivityDaily").doc(`${userDoc.dateKey}_${userDoc.uid}`),
        data: {
          ...userDoc,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    });
  });

  return writes;
};

const commitWritesInChunks = async (writes) => {
  for (let index = 0; index < writes.length; index += WRITE_BATCH_SIZE) {
    const chunk = writes.slice(index, index + WRITE_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true });
    });
    await batch.commit();
  }
};

const fetchRollupDocsForDateRange = async (
  collectionName,
  startDateKey,
  endDateKey,
) => {
  const docs = [];
  let queryRef = db
    .collection(collectionName)
    .where("dateKey", ">=", startDateKey)
    .where("dateKey", "<=", endDateKey)
    .orderBy("dateKey", "asc")
    .limit(QUERY_PAGE_SIZE);
  let lastDoc = null;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await (lastDoc ? queryRef.startAfter(lastDoc).get() : queryRef.get());
    if (snapshot.empty) break;

    docs.push(...snapshot.docs);
    if (snapshot.size < QUERY_PAGE_SIZE) {
      hasMore = false;
      continue;
    }
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return docs;
};

const deleteDocsInChunks = async (docs) => {
  for (let index = 0; index < docs.length; index += WRITE_BATCH_SIZE) {
    const chunk = docs.slice(index, index + WRITE_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  }
};

const clearExistingRollupsForDateRange = async (startDateKey, endDateKey) => {
  const collections = [
    "userActivityAnalyticsDaily",
    "userActivityPageDaily",
    "userActivityDaily",
  ];
  const snapshots = await Promise.all(
    collections.map((collectionName) =>
      fetchRollupDocsForDateRange(collectionName, startDateKey, endDateKey),
    ),
  );
  const docs = snapshots.flat();
  await deleteDocsInChunks(docs);
  return docs.length;
};

const rebuildAnalyticsDateRange = async (startDateKey, endDateKey) => {
  const dateKeys = enumerateDateKeys(startDateKey, endDateKey);
  const events = await fetchActivityEventsForDateRange(startDateKey, endDateKey);
  const summaries = rollupActivityForDateKeys(events, dateKeys);
  const writes = buildRollupWrites(summaries);
  const deletedRollupDocCount = await clearExistingRollupsForDateRange(
    startDateKey,
    endDateKey,
  );
  await commitWritesInChunks(writes);

  return {
    dateKeys,
    eventCount: events.length,
    deletedRollupDocCount,
    analyticsDocCount: summaries.length,
    pageDocCount: summaries.reduce(
      (count, summary) => count + summary.pageDocs.length,
      0,
    ),
    userDocCount: summaries.reduce(
      (count, summary) => count + summary.userDocs.length,
      0,
    ),
  };
};

exports.rollupUserActivityDaily = onSchedule(
  {
    region: "us-central1",
    schedule: "15 1 * * *",
    timeZone: ACTIVITY_ROLLUP_TIME_ZONE,
  },
  async () => {
    const now = new Date();
    const previousDateKey = formatDateKeyInTimeZone(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
      ACTIVITY_ROLLUP_TIME_ZONE,
    );
    await rebuildAnalyticsDateRange(previousDateKey, previousDateKey);
    return null;
  },
);

exports.rollupUserActivityHourly = onSchedule(
  {
    region: "us-central1",
    schedule: "12 * * * *",
    timeZone: ACTIVITY_ROLLUP_TIME_ZONE,
  },
  async () => {
    const now = new Date();
    const currentDateKey = formatDateKeyInTimeZone(now, ACTIVITY_ROLLUP_TIME_ZONE);
    const previousDateKey = formatDateKeyInTimeZone(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
      ACTIVITY_ROLLUP_TIME_ZONE,
    );
    await rebuildAnalyticsDateRange(previousDateKey, currentDateKey);
    return null;
  },
);

exports.rebuildUserActivityAnalytics = onCall(
  {
    region: "us-central1",
    cors: ALLOWED_CALLABLE_ORIGINS,
    invoker: "public",
  },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    if (callerUid !== ACTIVITY_OWNER_UID) {
      throw new HttpsError(
        "permission-denied",
        "Only the activity owner can rebuild analytics.",
      );
    }

    const startDateKey = String(request.data?.startDateKey || "").trim();
    const endDateKey = String(request.data?.endDateKey || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endDateKey)) {
      throw new HttpsError(
        "invalid-argument",
        "startDateKey and endDateKey must be YYYY-MM-DD strings.",
      );
    }
    if (startDateKey > endDateKey) {
      throw new HttpsError(
        "invalid-argument",
        "startDateKey must be on or before endDateKey.",
      );
    }

    const dateKeys = enumerateDateKeys(startDateKey, endDateKey);
    if (dateKeys.length > MAX_BACKFILL_DAYS) {
      throw new HttpsError(
        "invalid-argument",
        `Date range cannot exceed ${MAX_BACKFILL_DAYS} days.`,
      );
    }

    const result = await rebuildAnalyticsDateRange(startDateKey, endDateKey);
    return {
      success: true,
      ...result,
    };
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
