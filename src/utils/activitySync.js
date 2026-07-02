import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { addDaysToDateKey, enumerateDateKeys } from "./activityRollup";
import {
  formatDateKeyInTimeZone,
  getDateKeyDaysAgo,
} from "./activityAnalytics";

// Version 2 summaries are maintained as users move through the app. The admin
// page never rebuilds from raw events, so opening it cannot burn the read quota.
export const ROLLUP_SCHEMA_VERSION = 2;
export const SUMMARY_LOOKBACK_DAYS = 90;

const ROLLUP_QUERY_PAGE_SIZE = 500;

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

/**
 * Legacy planner retained for focused unit coverage and for old callers. The
 * runtime sync no longer uses it because rollups are maintained at write time.
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

const normalizeHourlyBuckets = (value) => {
  const buckets = emptyHourlyBuckets();
  const source = Array.isArray(value)
    ? value
    : Object.values(value && typeof value === "object" ? value : {});

  source.forEach((bucket) => {
    const hour = numberOrZero(bucket?.hour);
    const target = buckets[hour];
    if (!target) return;
    target.pageEnterCount += numberOrZero(bucket.pageEnterCount);
    target.semanticEventCount += numberOrZero(bucket.semanticEventCount);
    target.totalMinutesApprox += numberOrZero(bucket.totalMinutesApprox);
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

const normalizePageCounts = (row) => {
  if (Array.isArray(row?.topPagesDetailed)) {
    return row.topPagesDetailed.map((page) => ({
      ...page,
      pageId: page.pageId || "unknown",
      pageLabel: page.pageLabel || page.pageId || "Unknown page",
      sectionLabel: page.sectionLabel || "Other",
      pageEnterCount: numberOrZero(page.pageEnterCount ?? page.count),
      semanticEventCount: numberOrZero(page.semanticEventCount),
      count: numberOrZero(page.count ?? page.pageEnterCount),
      totalMinutesApprox: numberOrZero(page.totalMinutesApprox),
      uniqueUsers: numberOrZero(page.uniqueUsers || 1),
      topActions: normalizeActionCounts(page.topActions || page.actionCounts),
      hourlyBuckets: normalizeHourlyBuckets(page.hourlyBuckets),
    }));
  }

  return Object.values(row?.pageCounts || {})
    .map((page) => ({
      ...page,
      pageId: page?.pageId || "unknown",
      pageLabel: page?.pageLabel || page?.pageId || "Unknown page",
      sectionLabel: page?.sectionLabel || "Other",
      pageEnterCount: numberOrZero(page?.pageEnterCount ?? page?.count),
      semanticEventCount: numberOrZero(page?.semanticEventCount),
      count: numberOrZero(page?.count ?? page?.pageEnterCount),
      totalMinutesApprox: numberOrZero(page?.totalMinutesApprox),
      uniqueUsers: numberOrZero(page?.uniqueUsers || 1),
      topActions: normalizeActionCounts(page?.topActions || page?.actionCounts),
      hourlyBuckets: normalizeHourlyBuckets(page?.hourlyBuckets),
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
  const sessionCount = numberOrZero(row.sessionCount) ||
    (Array.isArray(row.sessionIds) ? row.sessionIds.length : 0) ||
    (numberOrZero(row.pageEnterCount) > 0 ? 1 : 0);

  return {
    ...row,
    role: row.role || "unknown",
    sessionCount,
    pageEnterCount: numberOrZero(row.pageEnterCount),
    semanticEventCount: numberOrZero(row.semanticEventCount),
    totalMinutesApprox: numberOrZero(row.totalMinutesApprox),
    pagesVisitedCount:
      numberOrZero(row.pagesVisitedCount) ||
      topPagesDetailed.reduce(
        (total, page) => total + numberOrZero(page.pageEnterCount || page.count),
        0,
      ),
    topActions: normalizeActionCounts(row.topActions || row.actionCounts),
    topPagesDetailed,
    hourlyBuckets: normalizeHourlyBuckets(row.hourlyBuckets),
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

/**
 * Kept as a cheap compatibility hook for the admin page. Summaries now update in
 * the background as activity is recorded, so this function performs zero reads,
 * zero writes, and zero deletes.
 */
export const syncActivityRollups = async ({ now = new Date() } = {}) => {
  const todayDateKey = formatDateKeyInTimeZone(now);
  return {
    mode: "event-summaries",
    rolledDayCount: 0,
    eventCount: 0,
    prunedCount: 0,
    coveredThroughDateKey: todayDateKey,
    lastSyncAt: null,
  };
};

export const loadActivitySummaries = async ({
  lookbackDays = SUMMARY_LOOKBACK_DAYS,
  now = new Date(),
} = {}) => {
  const todayDateKey = formatDateKeyInTimeZone(now);
  const startDateKey = getDateKeyDaysAgo(lookbackDays - 1, now);
  const rawUserRows = await fetchRollupRange(
    "userActivityDaily",
    startDateKey,
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
