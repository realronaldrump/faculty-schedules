import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  addDaysToDateKey,
  enumerateDateKeys,
  getDateKeyUtcRange,
  rollupActivityForDateKeys,
} from "./activityRollup";
import {
  formatDateKeyInTimeZone,
  getDateKeyDaysAgo,
} from "./activityAnalytics";

// Bump this whenever the rollup output shape changes. The next console visit
// detects the mismatch and rebuilds the whole lookback window automatically —
// no manual "rebuild" step, ever.
export const ROLLUP_SCHEMA_VERSION = 1;
export const SUMMARY_LOOKBACK_DAYS = 90;
// Raw events older than this are pruned once they are safely covered by daily
// rollups. Keeps userActivityEvents bounded on the Spark plan while leaving a
// deep window for automatic full rebuilds.
const EVENT_RETENTION_DAYS = 180;

const EVENT_PAGE_SIZE = 1000;
const ROLLUP_QUERY_PAGE_SIZE = 500;
const WRITE_BATCH_SIZE = 425;
const PRUNE_BATCH_LIMIT = 400;

const ROLLUP_COLLECTIONS = [
  "userActivityAnalyticsDaily",
  "userActivityPageDaily",
  "userActivityDaily",
];

const metaDocRef = () => doc(db, "userActivityMeta", "rollupState");

const mapQueryRows = (snapshot) =>
  snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

/**
 * Pure planner: given the stored watermark state, decide which past days need
 * rolling up. Today is never rolled up here — it is computed in memory from raw
 * events so the console is always current without repeated writes.
 */
export const planRollupSync = ({
  metaState,
  todayDateKey,
  lookbackDays = SUMMARY_LOOKBACK_DAYS,
} = {}) => {
  const windowStartDateKey = addDaysToDateKey(todayDateKey, -(lookbackDays - 1));
  const yesterdayDateKey = addDaysToDateKey(todayDateKey, -1);
  const coveredThrough = metaState?.coveredThroughDateKey || "";
  const schemaVersion = Number(metaState?.schemaVersion || 0);

  if (schemaVersion !== ROLLUP_SCHEMA_VERSION) {
    return {
      mode: "full",
      startDateKey: windowStartDateKey,
      endDateKey: yesterdayDateKey,
      dateKeys: enumerateDateKeys(windowStartDateKey, yesterdayDateKey),
    };
  }

  if (coveredThrough >= yesterdayDateKey) {
    return { mode: "none", startDateKey: "", endDateKey: "", dateKeys: [] };
  }

  const resumeDateKey = coveredThrough
    ? addDaysToDateKey(coveredThrough, 1)
    : windowStartDateKey;
  const startDateKey =
    resumeDateKey > windowStartDateKey ? resumeDateKey : windowStartDateKey;

  return {
    mode: "incremental",
    startDateKey,
    endDateKey: yesterdayDateKey,
    dateKeys: enumerateDateKeys(startDateKey, yesterdayDateKey),
  };
};

const fetchEventsBetween = async (startDateKey, endDateKeyInclusive) => {
  const { start } = getDateKeyUtcRange(startDateKey);
  const { start: endExclusive } = getDateKeyUtcRange(
    addDaysToDateKey(endDateKeyInclusive, 1),
  );

  const events = [];
  let lastDoc = null;
  let hasMore = true;
  while (hasMore) {
    const snapshot = await getDocs(
      query(
        collection(db, "userActivityEvents"),
        where("timestamp", ">=", start),
        where("timestamp", "<", endExclusive),
        orderBy("timestamp", "asc"),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
        limit(EVENT_PAGE_SIZE),
      ),
    );
    if (snapshot.empty) break;
    events.push(...mapQueryRows(snapshot));
    hasMore = snapshot.size >= EVENT_PAGE_SIZE;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }
  return events;
};

const fetchRollupRange = async (
  collectionName,
  startDateKey,
  endDateKey,
) => {
  const rows = [];
  let lastDoc = null;
  let hasMore = true;
  while (hasMore) {
    const snapshot = await getDocs(
      query(
        collection(db, collectionName),
        where("dateKey", ">=", startDateKey),
        where("dateKey", "<=", endDateKey),
        orderBy("dateKey", "asc"),
        ...(lastDoc ? [startAfter(lastDoc)] : []),
        limit(ROLLUP_QUERY_PAGE_SIZE),
      ),
    );
    const docs = snapshot?.docs || [];
    rows.push(...docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    hasMore = docs.length >= ROLLUP_QUERY_PAGE_SIZE;
    if (hasMore) lastDoc = docs[docs.length - 1];
  }
  return rows;
};

const deleteRollupRange = async (collectionName, startDateKey, endDateKey) => {
  const rows = await fetchRollupRange(collectionName, startDateKey, endDateKey);
  for (let index = 0; index < rows.length; index += WRITE_BATCH_SIZE) {
    const batch = writeBatch(db);
    rows.slice(index, index + WRITE_BATCH_SIZE).forEach((row) => {
      batch.delete(doc(db, collectionName, row.id));
    });
    await batch.commit();
  }
  return rows.length;
};

const buildPageRollupDocId = (pageDoc) =>
  `${pageDoc.dateKey}_${encodeURIComponent(pageDoc.pageId || "unknown")}`;

const writeRollupSummaries = async (summaries) => {
  const generatedAt = serverTimestamp();
  const writes = summaries.flatMap((summary) => [
    {
      ref: doc(db, "userActivityAnalyticsDaily", summary.analyticsDoc.dateKey),
      data: { ...summary.analyticsDoc, generatedAt },
    },
    ...summary.pageDocs.map((pageDoc) => ({
      ref: doc(db, "userActivityPageDaily", buildPageRollupDocId(pageDoc)),
      data: { ...pageDoc, generatedAt },
    })),
    ...summary.userDocs.map((userDoc) => ({
      ref: doc(db, "userActivityDaily", `${userDoc.dateKey}_${userDoc.uid}`),
      data: { ...userDoc, generatedAt },
    })),
  ]);

  for (let index = 0; index < writes.length; index += WRITE_BATCH_SIZE) {
    const batch = writeBatch(db);
    writes.slice(index, index + WRITE_BATCH_SIZE).forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: false });
    });
    await batch.commit();
  }
  return writes.length;
};

// One capped delete pass per sync. Old events reappear in the next sync's pass
// if more than PRUNE_BATCH_LIMIT remain, so backlog drains gradually without
// ever spending a quota-threatening burst.
const pruneExpiredEvents = async (todayDateKey) => {
  const cutoffDateKey = addDaysToDateKey(todayDateKey, -EVENT_RETENTION_DAYS);
  const { start: cutoff } = getDateKeyUtcRange(cutoffDateKey);
  const snapshot = await getDocs(
    query(
      collection(db, "userActivityEvents"),
      where("timestamp", "<", cutoff),
      orderBy("timestamp", "asc"),
      limit(PRUNE_BATCH_LIMIT),
    ),
  );
  if (snapshot.empty) return 0;
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
  return snapshot.size;
};

/**
 * Bring daily rollups up to date. Runs automatically when the console opens:
 * - normally a single meta read confirms everything is covered (no writes);
 * - after a day boundary it rolls up just the uncovered day(s);
 * - after a schema version bump (or force) it rebuilds the whole window.
 */
export const syncActivityRollups = async ({ force = false, now = new Date() } = {}) => {
  const todayDateKey = formatDateKeyInTimeZone(now);
  const metaSnap = await getDoc(metaDocRef());
  const metaState = metaSnap.exists() ? metaSnap.data() : null;

  const plan = force
    ? planRollupSync({ metaState: null, todayDateKey })
    : planRollupSync({ metaState, todayDateKey });

  let eventCount = 0;
  let rolledDayCount = 0;
  if (plan.mode !== "none") {
    const events = await fetchEventsBetween(plan.startDateKey, plan.endDateKey);
    eventCount = events.length;
    const summaries = rollupActivityForDateKeys(events, plan.dateKeys);
    rolledDayCount = summaries.length;

    if (plan.mode === "full") {
      // A rebuild may legitimately produce fewer docs than exist (removed
      // pages, corrected events), so clear the window before rewriting.
      await Promise.all(
        ROLLUP_COLLECTIONS.map((name) =>
          deleteRollupRange(name, plan.startDateKey, plan.endDateKey),
        ),
      );
    }
    await writeRollupSummaries(summaries);
  }

  const prunedCount = await pruneExpiredEvents(todayDateKey);

  if (plan.mode !== "none" || !metaState) {
    await setDoc(metaDocRef(), {
      coveredThroughDateKey:
        plan.mode === "none"
          ? metaState?.coveredThroughDateKey || ""
          : plan.endDateKey,
      schemaVersion: ROLLUP_SCHEMA_VERSION,
      lastSyncAt: serverTimestamp(),
      lastSyncMode: plan.mode,
      lastSyncEventCount: eventCount,
    });
  }

  return {
    mode: plan.mode,
    rolledDayCount,
    eventCount,
    prunedCount,
    coveredThroughDateKey:
      plan.mode === "none"
        ? metaState?.coveredThroughDateKey || ""
        : plan.endDateKey,
    lastSyncAt: metaState?.lastSyncAt || null,
  };
};

// Today's numbers never touch Firestore rollups: they are derived in memory
// from today's raw events on each load, so the console is always current.
const fetchTodayPartialSummary = async (now = new Date()) => {
  const todayDateKey = formatDateKeyInTimeZone(now);
  const events = await fetchEventsBetween(todayDateKey, todayDateKey);
  const summary = rollupActivityForDateKeys(events, [todayDateKey])[0] || null;
  return {
    todayDateKey,
    analyticsRows: summary ? [{ ...summary.analyticsDoc, isPartial: true }] : [],
    pageRows: summary ? summary.pageDocs : [],
    userRows: summary ? summary.userDocs : [],
  };
};

/**
 * Load everything the analytics model needs: stored rollups for the lookback
 * window plus an in-memory rollup of today's raw events (which replaces any
 * stored rows for today, e.g. from an older full rebuild).
 */
export const loadActivitySummaries = async ({
  lookbackDays = SUMMARY_LOOKBACK_DAYS,
  now = new Date(),
} = {}) => {
  const todayDateKey = formatDateKeyInTimeZone(now);
  const startDateKey = getDateKeyDaysAgo(lookbackDays - 1, now);

  const [analyticsRows, pageDailyRows, userDailyRows, today] = await Promise.all([
    fetchRollupRange("userActivityAnalyticsDaily", startDateKey, todayDateKey),
    fetchRollupRange("userActivityPageDaily", startDateKey, todayDateKey),
    fetchRollupRange("userActivityDaily", startDateKey, todayDateKey),
    fetchTodayPartialSummary(now),
  ]);

  const notToday = (row) => row.dateKey !== todayDateKey;
  return {
    todayDateKey,
    analyticsRows: [...analyticsRows.filter(notToday), ...today.analyticsRows],
    pageDailyRows: [...pageDailyRows.filter(notToday), ...today.pageRows],
    userDailyRows: [...userDailyRows.filter(notToday), ...today.userRows],
  };
};
