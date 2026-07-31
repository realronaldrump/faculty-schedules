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
import { formatDateKeyInTimeZone } from "./activityAnalytics";

// Direct summaries (schema v3) are the primary source for new activity. The
// owner-only rollup remains as a bounded compatibility/backfill path for raw
// events and legacy data that predate those direct summaries.
export const ROLLUP_SCHEMA_VERSION = 3;
export const SUMMARY_LOOKBACK_DAYS = 90;

const EVENT_RETENTION_DAYS = 180;
const EVENT_PAGE_SIZE = 1000;
const ROLLUP_QUERY_PAGE_SIZE = 500;
const WRITE_BATCH_SIZE = 425;
const PRUNE_BATCH_LIMIT = 400;

const metaDocRef = () => doc(db, "userActivityMeta", "rollupState");

const mapQueryRows = (snapshot) =>
  (snapshot?.docs || []).map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

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
    const docs = snapshot?.docs || [];
    if (docs.length === 0) break;
    events.push(...mapQueryRows(snapshot));
    hasMore = docs.length >= EVENT_PAGE_SIZE;
    if (hasMore) lastDoc = docs[docs.length - 1];
  }
  return events;
};

const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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

const buildPageRollupDocId = (pageDoc) =>
  `${pageDoc.dateKey}_${encodeURIComponent(pageDoc.pageId || "unknown")}`;

const writeRollupSummaries = async (
  summaries,
  { protectedUserDocIds = new Set() } = {},
) => {
  const generatedAt = serverTimestamp();
  const writes = summaries.flatMap((summary) => [
    {
      ref: doc(db, "userActivityAnalyticsDaily", summary.analyticsDoc.dateKey),
      data: {
        ...summary.analyticsDoc,
        rollupSchemaVersion: ROLLUP_SCHEMA_VERSION,
        generatedAt,
      },
    },
    ...summary.pageDocs.map((pageDoc) => ({
      ref: doc(db, "userActivityPageDaily", buildPageRollupDocId(pageDoc)),
      data: {
        ...pageDoc,
        rollupSchemaVersion: ROLLUP_SCHEMA_VERSION,
        generatedAt,
      },
    })),
    ...summary.userDocs
      .filter(
        (userDoc) =>
          !protectedUserDocIds.has(`${userDoc.dateKey}_${userDoc.uid}`),
      )
      .map((userDoc) => ({
        ref: doc(db, "userActivityDaily", `${userDoc.dateKey}_${userDoc.uid}`),
        data: {
          ...userDoc,
          schemaVersion: 1,
          source: "event-rollup",
          generatedAt,
        },
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
  if (!snapshot || snapshot.empty || snapshot.docs.length === 0) return 0;
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
  return snapshot.docs.length;
};

/**
 * Decide which completed dates need historical event backfill. Today remains a
 * direct-summary date and is never part of this plan.
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

const emptyHourlyBuckets = () =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    pageEnterCount: 0,
    semanticEventCount: 0,
    totalMinutesApprox: 0,
    uniqueUsers: 0,
  }));

const normalizeHourlyBuckets = (
  value,
  {
    durationField = "totalMinutesApprox",
    pageEnterField = "pageEnterCount",
  } = {},
) => {
  const buckets = emptyHourlyBuckets();
  const source = Array.isArray(value)
    ? value
    : Object.values(value && typeof value === "object" ? value : {});

  source.forEach((bucket) => {
    const hour = numberOrZero(bucket?.hour);
    const target = buckets[hour];
    if (!target) return;
    target.pageEnterCount += numberOrZero(bucket[pageEnterField]);
    target.semanticEventCount += numberOrZero(bucket.semanticEventCount);
    target.totalMinutesApprox += numberOrZero(bucket[durationField]);
    target.uniqueUsers += numberOrZero(bucket.uniqueUsers);
  });

  return buckets;
};

const mergeHourlyBucketsInto = (target, source) => {
  normalizeHourlyBuckets(source).forEach((bucket) => {
    const destination = target[bucket.hour];
    if (!destination) return;
    destination.pageEnterCount += bucket.pageEnterCount;
    destination.semanticEventCount += bucket.semanticEventCount;
    destination.totalMinutesApprox += bucket.totalMinutesApprox;
    destination.uniqueUsers += bucket.uniqueUsers;
  });
};

const normalizeActionCounts = (value) => {
  const source = Array.isArray(value)
    ? value
    : Object.values(value && typeof value === "object" ? value : {});

  return source
    .map((item) => ({
      actionKey: item?.actionKey || "",
      count: numberOrZero(item?.count),
    }))
    .filter((item) => item.actionKey && item.count > 0)
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.actionKey.localeCompare(right.actionKey);
    });
};

const normalizeTransitionCounts = (value) => {
  const source = Array.isArray(value)
    ? value
    : Object.values(value && typeof value === "object" ? value : {});

  return source
    .map((item) => ({
      fromPageId: item?.fromPageId || "",
      fromPageLabel: item?.fromPageLabel || item?.fromPageId || "Unknown page",
      toPageId: item?.toPageId || "",
      toPageLabel: item?.toPageLabel || item?.toPageId || "Unknown page",
      count: numberOrZero(item?.count),
    }))
    .filter((item) => item.fromPageId && item.toPageId && item.count > 0)
    .sort((left, right) => right.count - left.count);
};

const mergeTopActions = (actions = []) => {
  const merged = new Map();
  actions.forEach((item) => {
    if (!item?.actionKey) return;
    const existing = merged.get(item.actionKey) || {
      ...item,
      count: 0,
    };
    existing.count += numberOrZero(item.count);
    merged.set(item.actionKey, existing);
  });
  return Array.from(merged.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.actionKey.localeCompare(right.actionKey);
  });
};

const mergeTopTransitions = (transitions = []) => {
  const merged = new Map();
  transitions.forEach((item) => {
    if (!item?.fromPageId || !item?.toPageId) return;
    const key = `${item.fromPageId}>>${item.toPageId}`;
    const existing = merged.get(key) || { ...item, count: 0 };
    existing.count += numberOrZero(item.count);
    merged.set(key, existing);
  });
  return Array.from(merged.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return `${left.fromPageId}>>${left.toPageId}`.localeCompare(
      `${right.fromPageId}>>${right.toPageId}`,
    );
  });
};

const normalizePageCounts = (row) => {
  const schemaVersion = Number(row?.schemaVersion || 0);
  const getDuration = (value) => {
    if (schemaVersion === 2) return 0;
    if (schemaVersion >= 3) return numberOrZero(value?.measuredMinutes);
    return numberOrZero(value?.totalMinutesApprox);
  };
  const durationField =
    schemaVersion >= 3 ? "measuredMinutes" : "totalMinutesApprox";
  const pageEnterField =
    schemaVersion >= 3 ? "trackedPageEnterCount" : "pageEnterCount";
  if (Array.isArray(row?.topPagesDetailed)) {
    return row.topPagesDetailed.map((page) => ({
      ...page,
      pageId: page.pageId || "unknown",
      pageLabel: page.pageLabel || page.pageId || "Unknown page",
      sectionLabel: page.sectionLabel || "Other",
      pageEnterCount: numberOrZero(
        page[pageEnterField] ?? (schemaVersion >= 3 ? 0 : page.count),
      ),
      semanticEventCount: numberOrZero(page.semanticEventCount),
      count: numberOrZero(
        page[pageEnterField] ?? (schemaVersion >= 3 ? 0 : page.count),
      ),
      totalMinutesApprox: getDuration(page),
      uniqueUsers: numberOrZero(page.uniqueUsers || 1),
      topActions: normalizeActionCounts(page.topActions || page.actionCounts),
      hourlyBuckets:
        schemaVersion === 2
          ? normalizeHourlyBuckets(page.hourlyBuckets).map((bucket) => ({
              ...bucket,
              totalMinutesApprox: 0,
            }))
          : normalizeHourlyBuckets(page.hourlyBuckets, {
              durationField,
              pageEnterField,
            }),
    }));
  }

  return Object.values(row?.pageCounts || {})
    .map((page) => ({
      ...page,
      pageId: page?.pageId || "unknown",
      pageLabel: page?.pageLabel || page?.pageId || "Unknown page",
      sectionLabel: page?.sectionLabel || "Other",
      pageEnterCount: numberOrZero(
        page?.[pageEnterField] ?? (schemaVersion >= 3 ? 0 : page?.count),
      ),
      semanticEventCount: numberOrZero(page?.semanticEventCount),
      count: numberOrZero(
        page?.[pageEnterField] ?? (schemaVersion >= 3 ? 0 : page?.count),
      ),
      totalMinutesApprox: getDuration(page),
      uniqueUsers: numberOrZero(page?.uniqueUsers || 1),
      topActions: normalizeActionCounts(page?.topActions || page?.actionCounts),
      hourlyBuckets:
        schemaVersion === 2
          ? normalizeHourlyBuckets(page?.hourlyBuckets).map((bucket) => ({
              ...bucket,
              totalMinutesApprox: 0,
            }))
          : normalizeHourlyBuckets(page?.hourlyBuckets, {
              durationField,
              pageEnterField,
            }),
    }))
    .filter(
      (page) =>
        page.pageEnterCount > 0 ||
        page.semanticEventCount > 0 ||
        page.totalMinutesApprox > 0,
    );
};

const normalizeUserDailyRow = (row) => {
  const topPagesDetailed = normalizePageCounts(row);
  const schemaVersion = Number(row?.schemaVersion || 0);
  const durationField =
    schemaVersion >= 3 ? "measuredMinutes" : "totalMinutesApprox";
  const pageEnterField =
    schemaVersion >= 3 ? "trackedPageEnterCount" : "pageEnterCount";
  const sessionCount = numberOrZero(row.sessionCount) ||
    (Array.isArray(row.sessionIds) ? row.sessionIds.length : 0) ||
    (numberOrZero(row.pageEnterCount) > 0 ? 1 : 0);

  return {
    ...row,
    role: row.role || "unknown",
    sessionCount,
    pageEnterCount: numberOrZero(row[pageEnterField]),
    semanticEventCount:
      numberOrZero(row.semanticEventCount) ||
      normalizeActionCounts(row.topActions || row.actionCounts).reduce(
        (total, action) => total + action.count,
        0,
      ),
    totalMinutesApprox:
      schemaVersion === 2 ? 0 : numberOrZero(row[durationField]),
    pagesVisitedCount:
      (Array.isArray(row.pageIds) ? new Set(row.pageIds).size : 0) ||
      (schemaVersion >= 2
        ? topPagesDetailed.length
        : numberOrZero(row.pagesVisitedCount) || topPagesDetailed.length),
    topActions: normalizeActionCounts(row.topActions || row.actionCounts),
    topTransitions: normalizeTransitionCounts(
      row.topTransitions || row.transitionCounts,
    ),
    topPagesDetailed,
    hourlyBuckets:
      schemaVersion === 2
        ? normalizeHourlyBuckets(row.hourlyBuckets).map((bucket) => ({
            ...bucket,
            totalMinutesApprox: 0,
          }))
        : normalizeHourlyBuckets(row.hourlyBuckets, {
            durationField,
            pageEnterField,
          }),
  };
};

const addRoleBreakdown = (target, row, uniqueUsers = 1) => {
  const role = row.role || "unknown";
  const existing = target[role] || {
    role,
    uniqueUsers: 0,
    sessionCount: 0,
    pageEnterCount: 0,
    semanticEventCount: 0,
    totalMinutesApprox: 0,
  };
  existing.uniqueUsers += uniqueUsers;
  existing.sessionCount += numberOrZero(row.sessionCount);
  existing.pageEnterCount += numberOrZero(row.pageEnterCount);
  existing.semanticEventCount += numberOrZero(row.semanticEventCount);
  existing.totalMinutesApprox += numberOrZero(row.totalMinutesApprox);
  target[role] = existing;
};

const deriveSummariesFromUserDailyRows = (rawUserRows) => {
  const userDailyRows = rawUserRows.map(normalizeUserDailyRow);
  const appByDate = new Map();
  const pageByDateAndId = new Map();

  userDailyRows.forEach((row) => {
    if (!row.dateKey) return;

    const appRow = appByDate.get(row.dateKey) || {
      dateKey: row.dateKey,
      uniqueUsers: 0,
      sessionCount: 0,
      pageEnterCount: 0,
      semanticEventCount: 0,
      totalMinutesApprox: 0,
      topActions: [],
      topTransitions: [],
      roleBreakdown: {},
      hourlyBuckets: emptyHourlyBuckets(),
    };
    appRow.uniqueUsers += row.uid ? 1 : 0;
    appRow.sessionCount += row.sessionCount;
    appRow.pageEnterCount += row.pageEnterCount;
    appRow.semanticEventCount += row.semanticEventCount;
    appRow.totalMinutesApprox += row.totalMinutesApprox;
    appRow.topActions.push(...row.topActions);
    appRow.topTransitions.push(...row.topTransitions);
    mergeHourlyBucketsInto(appRow.hourlyBuckets, row.hourlyBuckets);
    addRoleBreakdown(appRow.roleBreakdown, row, row.uid ? 1 : 0);
    appByDate.set(row.dateKey, appRow);

    row.topPagesDetailed.forEach((page) => {
      const key = `${row.dateKey}_${page.pageId}`;
      const pageRow = pageByDateAndId.get(key) || {
        dateKey: row.dateKey,
        pageId: page.pageId,
        pageLabel: page.pageLabel,
        sectionLabel: page.sectionLabel || "Other",
        uniqueUsers: 0,
        pageEnterCount: 0,
        semanticEventCount: 0,
        totalMinutesApprox: 0,
        topActions: [],
        roleBreakdown: {},
        hourlyBuckets: emptyHourlyBuckets(),
      };
      pageRow.uniqueUsers += 1;
      pageRow.pageEnterCount += numberOrZero(page.pageEnterCount || page.count);
      pageRow.semanticEventCount += numberOrZero(page.semanticEventCount);
      pageRow.totalMinutesApprox += numberOrZero(page.totalMinutesApprox);
      pageRow.topActions.push(...(page.topActions || []));
      mergeHourlyBucketsInto(pageRow.hourlyBuckets, page.hourlyBuckets);
      addRoleBreakdown(
        pageRow.roleBreakdown,
        {
          ...row,
          pageEnterCount: page.pageEnterCount || page.count,
          semanticEventCount: page.semanticEventCount,
          totalMinutesApprox: page.totalMinutesApprox,
        },
        1,
      );
      pageByDateAndId.set(key, pageRow);
    });
  });

  const analyticsRows = Array.from(appByDate.values())
    .map((row) => ({
      ...row,
      topActions: mergeTopActions(row.topActions),
      topTransitions: mergeTopTransitions(row.topTransitions),
    }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  const pageDailyRows = Array.from(pageByDateAndId.values())
    .map((row) => ({
      ...row,
      topActions: mergeTopActions(row.topActions),
    }))
    .sort((left, right) => {
      const dateCompare = left.dateKey.localeCompare(right.dateKey);
      if (dateCompare !== 0) return dateCompare;
      return left.pageLabel.localeCompare(right.pageLabel);
    });

  return { analyticsRows, pageDailyRows, userDailyRows };
};

const mergeStoredAndDerivedSummaries = ({
  storedAnalyticsRows,
  storedPageRows,
  rawUserRows,
}) => {
  const derived = deriveSummariesFromUserDailyRows(rawUserRows);
  const modernSchemaByDate = new Map();
  rawUserRows.forEach((row) => {
    if (!row?.dateKey) return;
    const schemaVersion = Number(row.schemaVersion || 0);
    modernSchemaByDate.set(
      row.dateKey,
      Math.max(modernSchemaByDate.get(row.dateKey) || 0, schemaVersion),
    );
  });

  const storedAnalyticsByDate = new Map(
    storedAnalyticsRows
      .filter((row) => row?.dateKey)
      .map((row) => [row.dateKey, row]),
  );
  const derivedAnalyticsByDate = new Map(
    derived.analyticsRows.map((row) => [row.dateKey, row]),
  );
  const analyticsDateKeys = new Set([
    ...storedAnalyticsByDate.keys(),
    ...derivedAnalyticsByDate.keys(),
  ]);
  const analyticsRows = Array.from(analyticsDateKeys)
    .map((dateKey) => {
      const stored = storedAnalyticsByDate.get(dateKey);
      const current = derivedAnalyticsByDate.get(dateKey);
      const schemaVersion = modernSchemaByDate.get(dateKey) || 0;
      if (schemaVersion < 2) return stored || current;
      if (!current) return stored;
      if (schemaVersion === 2 && current.topTransitions.length === 0 && stored) {
        return {
          ...current,
          topTransitions: normalizeTransitionCounts(stored.topTransitions),
        };
      }
      return current;
    })
    .filter(Boolean)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  const derivedPagesByDate = new Map();
  derived.pageDailyRows.forEach((row) => {
    const rows = derivedPagesByDate.get(row.dateKey) || [];
    rows.push(row);
    derivedPagesByDate.set(row.dateKey, rows);
  });
  const storedPagesByDate = new Map();
  storedPageRows.forEach((row) => {
    if (!row?.dateKey) return;
    const rows = storedPagesByDate.get(row.dateKey) || [];
    rows.push(row);
    storedPagesByDate.set(row.dateKey, rows);
  });
  const pageDateKeys = new Set([
    ...storedPagesByDate.keys(),
    ...derivedPagesByDate.keys(),
  ]);
  const pageDailyRows = Array.from(pageDateKeys)
    .flatMap((dateKey) => {
      const schemaVersion = modernSchemaByDate.get(dateKey) || 0;
      if (schemaVersion >= 2) {
        return derivedPagesByDate.get(dateKey) || storedPagesByDate.get(dateKey) || [];
      }
      return storedPagesByDate.get(dateKey) || derivedPagesByDate.get(dateKey) || [];
    })
    .sort((left, right) => {
      const dateCompare = left.dateKey.localeCompare(right.dateKey);
      if (dateCompare !== 0) return dateCompare;
      return String(left.pageLabel || left.pageId || "").localeCompare(
        String(right.pageLabel || right.pageId || ""),
      );
    });

  return {
    analyticsRows,
    pageDailyRows,
    userDailyRows: derived.userDailyRows,
  };
};

/**
 * Backfill uncovered historical dates from raw events without overwriting any
 * schema-v2/v3 direct user summaries. Normally this only reads the watermark;
 * work happens once after a day boundary or schema upgrade.
 */
export const syncActivityRollups = async ({
  force = false,
  now = new Date(),
} = {}) => {
  const todayDateKey = formatDateKeyInTimeZone(now);
  const metaSnap = await getDoc(metaDocRef());
  const metaState = metaSnap.exists() ? metaSnap.data() : null;
  const plan = force
    ? planRollupSync({ metaState: null, todayDateKey })
    : planRollupSync({ metaState, todayDateKey });

  let eventCount = 0;
  let rolledDayCount = 0;
  if (plan.mode !== "none") {
    const existingUserRows = await fetchRollupRange(
      "userActivityDaily",
      plan.startDateKey,
      plan.endDateKey,
    );
    const protectedUserDocIds = new Set(
      existingUserRows
        .filter((row) => Number(row.schemaVersion || 0) >= 2)
        .map((row) => row.id),
    );
    const events = await fetchEventsBetween(
      plan.startDateKey,
      plan.endDateKey,
    );
    eventCount = events.length;
    const summaries = rollupActivityForDateKeys(events, plan.dateKeys);
    rolledDayCount = summaries.length;

    await writeRollupSummaries(summaries, { protectedUserDocIds });
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

export const loadActivitySummaries = async ({
  lookbackDays = SUMMARY_LOOKBACK_DAYS,
  now = new Date(),
} = {}) => {
  const todayDateKey = formatDateKeyInTimeZone(now);
  const startDateKey = addDaysToDateKey(todayDateKey, -(lookbackDays - 1));
  const [storedAnalyticsRows, storedPageRows, rawUserRows] = await Promise.all([
    fetchRollupRange("userActivityAnalyticsDaily", startDateKey, todayDateKey),
    fetchRollupRange("userActivityPageDaily", startDateKey, todayDateKey),
    fetchRollupRange("userActivityDaily", startDateKey, todayDateKey),
  ]);
  const merged = mergeStoredAndDerivedSummaries({
    storedAnalyticsRows,
    storedPageRows,
    rawUserRows,
  });

  return {
    todayDateKey,
    analyticsRows: merged.analyticsRows,
    pageDailyRows: merged.pageDailyRows,
    userDailyRows: merged.userDailyRows,
  };
};

// Minute refreshes only need today's direct per-user documents. Historical
// app/page rollups are immutable during the day and stay in the page's existing
// 90-day state.
export const loadTodayActivitySummary = async ({ now = new Date() } = {}) => {
  const todayDateKey = formatDateKeyInTimeZone(now);
  const rawUserRows = await fetchRollupRange(
    "userActivityDaily",
    todayDateKey,
    todayDateKey,
  );
  const derived = deriveSummariesFromUserDailyRows(rawUserRows);
  return {
    todayDateKey,
    analyticsRows: derived.analyticsRows,
    pageDailyRows: derived.pageDailyRows,
    userDailyRows: derived.userDailyRows,
  };
};
