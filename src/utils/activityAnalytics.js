const ANALYTICS_TIME_ZONE = "America/Chicago";
const NAVIGATION_ACTION_KEY = "navigate";
export const ACTIVITY_RANGE_OPTIONS = [7, 30, 90];

export const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateKeyInTimeZone = (
  date,
  timeZone = ANALYTICS_TIME_ZONE,
) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
};

export const getDateKeyDaysAgo = (days, fromDate = new Date()) => {
  const date = new Date(fromDate);
  date.setDate(date.getDate() - Math.max(0, days));
  return formatDateKeyInTimeZone(date);
};

const formatDateKeyLabel = (dateKey) => {
  if (!dateKey) return "Unknown";
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const sumBuckets = (rows = []) => {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    pageEnterCount: 0,
    semanticEventCount: 0,
    totalMinutesApprox: 0,
    uniqueUsers: 0,
  }));

  rows.forEach((row) => {
    (row.hourlyBuckets || []).forEach((bucket) => {
      const target = buckets[bucket.hour];
      if (!target) return;
      target.pageEnterCount += bucket.pageEnterCount || 0;
      target.semanticEventCount += bucket.semanticEventCount || 0;
      target.totalMinutesApprox += bucket.totalMinutesApprox || 0;
      target.uniqueUsers += bucket.uniqueUsers || 0;
    });
  });

  return buckets;
};

const getNavigationActionCount = (row) =>
  (row?.topActions || []).reduce((total, item) => {
    if (item?.actionKey !== NAVIGATION_ACTION_KEY) return total;
    return total + (item.count || 0);
  }, 0);

const getSemanticEventCount = (row) => {
  const count = row?.semanticEventCount || 0;
  const navigationCount = getNavigationActionCount(row);
  return navigationCount > 0 ? Math.max(0, count - navigationCount) : count;
};

const getHourlyBuckets = (row) => {
  const buckets = row?.hourlyBuckets || [];
  if (getNavigationActionCount(row) <= 0) return buckets;

  return buckets.map((bucket) => ({
    ...bucket,
    semanticEventCount: Math.max(
      0,
      (bucket.semanticEventCount || 0) - (bucket.pageEnterCount || 0),
    ),
  }));
};

const mergeTopItems = (rows = [], field, keyField) => {
  const merged = new Map();

  rows.forEach((row) => {
    (row[field] || []).forEach((item) => {
      const key = item[keyField] || item.pageId || item.sectionLabel || item.actionKey;
      if (!key) return;

      const existing =
        merged.get(key) ||
        {
          ...item,
          count: 0,
          totalMinutesApprox: 0,
          uniqueUsers: 0,
        };
      existing.count = (existing.count || 0) + (item.count || 0);
      existing.totalMinutesApprox =
        (existing.totalMinutesApprox || 0) + (item.totalMinutesApprox || 0);
      existing.uniqueUsers = (existing.uniqueUsers || 0) + (item.uniqueUsers || 0);
      merged.set(key, existing);
    });
  });

  return Array.from(merged.values()).sort((left, right) => {
    if ((right.count || 0) !== (left.count || 0)) {
      return (right.count || 0) - (left.count || 0);
    }
    return String(left[keyField] || "").localeCompare(String(right[keyField] || ""));
  });
};

const mergeTopActions = (rows = []) =>
  mergeTopItems(
    rows.map((row) => ({
      ...row,
      topActions: (row.topActions || []).filter(
        (item) => item?.actionKey !== NAVIGATION_ACTION_KEY,
      ),
    })),
    "topActions",
    "actionKey",
  );

const mergeTransitions = (rows = []) => {
  const merged = new Map();

  rows.forEach((row) => {
    (row.topTransitions || []).forEach((item) => {
      const key = `${item.fromPageId || ""}>>${item.toPageId || ""}`;
      if (!key) return;
      const existing = merged.get(key) || { ...item, count: 0 };
      existing.count += item.count || 0;
      merged.set(key, existing);
    });
  });

  return Array.from(merged.values()).sort((left, right) => right.count - left.count);
};

const aggregateRoleBreakdown = (rows = []) => {
  const merged = new Map();

  rows.forEach((row) => {
    const breakdown = row.roleBreakdown || {};
    Object.entries(breakdown).forEach(([role, value]) => {
      const existing = merged.get(role) || {
        role,
        uniqueUsers: 0,
        sessionCount: 0,
        pageEnterCount: 0,
        semanticEventCount: 0,
        totalMinutesApprox: 0,
      };
      existing.uniqueUsers += value.uniqueUsers || 0;
      existing.sessionCount += value.sessionCount || 0;
      existing.pageEnterCount += value.pageEnterCount || 0;
      existing.semanticEventCount += value.semanticEventCount || 0;
      existing.totalMinutesApprox += value.totalMinutesApprox || 0;
      merged.set(role, existing);
    });
  });

  return Array.from(merged.values()).sort(
    (left, right) => right.totalMinutesApprox - left.totalMinutesApprox,
  );
};

const buildTrendRows = (appRows = []) =>
  [...appRows]
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
    .map((row) => ({
      dateKey: row.dateKey,
      label: formatDateKeyLabel(row.dateKey),
      uniqueUsers: row.uniqueUsers || 0,
      sessionCount: row.sessionCount || 0,
      pageEnterCount: row.pageEnterCount || 0,
      totalMinutesApprox: row.totalMinutesApprox || 0,
      avgSessionMinutes:
        row.sessionCount > 0
          ? Number(((row.totalMinutesApprox || 0) / row.sessionCount).toFixed(1))
          : 0,
    }));

export const buildActivityAnalyticsModel = ({
  appDailyRows = [],
  pageDailyRows = [],
  userDailyRows = [],
  rangeDays = 30,
  now = new Date(),
} = {}) => {
  const cutoffDateKey = getDateKeyDaysAgo(rangeDays - 1, now);
  const todayDateKey = formatDateKeyInTimeZone(now);

  const appRows = appDailyRows.filter((row) => (row.dateKey || "") >= cutoffDateKey);
  const pageRows = pageDailyRows.filter((row) => (row.dateKey || "") >= cutoffDateKey);
  const userRows = userDailyRows.filter((row) => (row.dateKey || "") >= cutoffDateKey);

  const usersByUid = new Map();
  userRows.forEach((row) => {
    const key = row.uid || row.email || row.displayName;
    if (!key) return;
    const existing = usersByUid.get(key) || {
      uid: row.uid || "",
      email: row.email || "",
      displayName: row.displayName || row.email || row.uid || "Unknown User",
      role: row.role || "unknown",
      activeDays: 0,
      sessionCount: 0,
      pageEnterCount: 0,
      semanticEventCount: 0,
      totalMinutesApprox: 0,
      pagesVisitedCount: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      topPagesDetailed: [],
      topActions: [],
      hourlyBuckets: [],
    };

    existing.activeDays += 1;
    existing.sessionCount += row.sessionCount || 0;
    existing.pageEnterCount += row.pageEnterCount || 0;
    existing.semanticEventCount += getSemanticEventCount(row);
    existing.totalMinutesApprox += row.totalMinutesApprox || 0;
    existing.pagesVisitedCount += row.pagesVisitedCount || 0;
    existing.firstSeenAt = existing.firstSeenAt || row.firstSeenAt || null;
    existing.lastSeenAt = row.lastSeenAt || existing.lastSeenAt || null;
    existing.topPagesDetailed = existing.topPagesDetailed.concat(
      row.topPagesDetailed || [],
    );
    existing.topActions = existing.topActions.concat(
      (row.topActions || []).filter(
        (item) => item?.actionKey !== NAVIGATION_ACTION_KEY,
      ),
    );
    existing.hourlyBuckets = existing.hourlyBuckets.concat(
      getHourlyBuckets(row).map((bucket) => ({
        ...bucket,
        uniqueUsers: 0,
      })),
    );
    usersByUid.set(key, existing);
  });

  const aggregatedUsers = Array.from(usersByUid.values())
    .map((user) => ({
      ...user,
      avgMinutesPerSession:
        user.sessionCount > 0
          ? Number((user.totalMinutesApprox / user.sessionCount).toFixed(1))
          : 0,
      avgPagesPerDay:
        user.activeDays > 0
          ? Number((user.pagesVisitedCount / user.activeDays).toFixed(1))
          : 0,
      topPagesDetailed: mergeTopItems(
        [{ topPagesDetailed: user.topPagesDetailed }],
        "topPagesDetailed",
        "pageId",
      ).slice(0, 3),
      topActions: mergeTopActions([{ topActions: user.topActions }]).slice(0, 3),
      hourlyBuckets: sumBuckets([{ hourlyBuckets: user.hourlyBuckets }]),
    }))
    .sort((left, right) => {
      if (right.totalMinutesApprox !== left.totalMinutesApprox) {
        return right.totalMinutesApprox - left.totalMinutesApprox;
      }
      return left.displayName.localeCompare(right.displayName);
    });

  const repeatUsers = aggregatedUsers.filter((user) => user.sessionCount > 1).length;
  const oneTimeUsers = aggregatedUsers.length - repeatUsers;
  const normalizedAppRows = appRows.map((row) => ({
    ...row,
    semanticEventCount: getSemanticEventCount(row),
    hourlyBuckets: getHourlyBuckets(row),
    topActions: (row.topActions || []).filter(
      (item) => item?.actionKey !== NAVIGATION_ACTION_KEY,
    ),
  }));
  const aggregatedHourly = sumBuckets(normalizedAppRows);
  const trendRows = buildTrendRows(appRows).map((row) => ({
    ...row,
    isPartial: row.dateKey === todayDateKey,
  }));
  const topPages = pageRows
    .reduce((accumulator, row) => {
      const existing =
        accumulator.get(row.pageId) ||
        {
          pageId: row.pageId,
          pageLabel: row.pageLabel,
          sectionLabel: row.sectionLabel,
          count: 0,
          totalMinutesApprox: 0,
          uniqueUsers: 0,
        };
      existing.count += row.pageEnterCount || 0;
      existing.totalMinutesApprox += row.totalMinutesApprox || 0;
      existing.uniqueUsers += row.uniqueUsers || 0;
      accumulator.set(row.pageId, existing);
      return accumulator;
    }, new Map())
    .values();

  const topSections = pageRows
    .reduce((accumulator, row) => {
      const key = row.sectionLabel || "Other";
      const existing =
        accumulator.get(key) || {
          sectionLabel: key,
          count: 0,
          totalMinutesApprox: 0,
          uniqueUsers: 0,
        };
      existing.count += row.pageEnterCount || 0;
      existing.totalMinutesApprox += row.totalMinutesApprox || 0;
      existing.uniqueUsers += row.uniqueUsers || 0;
      accumulator.set(key, existing);
      return accumulator;
    }, new Map())
    .values();

  const topActions = mergeTopActions(appRows);
  const topTransitions = mergeTransitions(appRows);
  const roleBreakdown = aggregateRoleBreakdown(appRows);
  const busiestHour =
    [...aggregatedHourly].sort(
      (left, right) => right.totalMinutesApprox - left.totalMinutesApprox,
    )[0] || null;

  const latestSummary = [...appRows].sort((left, right) =>
    right.dateKey.localeCompare(left.dateKey),
  )[0];

  return {
    cutoffDateKey,
    todayDateKey,
    overview: {
      uniqueUsers: aggregatedUsers.length,
      totalMinutesApprox: appRows.reduce(
        (total, row) => total + (row.totalMinutesApprox || 0),
        0,
      ),
      sessionCount: appRows.reduce(
        (total, row) => total + (row.sessionCount || 0),
        0,
      ),
      pageEnterCount: appRows.reduce(
        (total, row) => total + (row.pageEnterCount || 0),
        0,
      ),
      semanticEventCount: appRows.reduce(
        (total, row) => total + getSemanticEventCount(row),
        0,
      ),
      avgSessionMinutes:
        appRows.reduce((total, row) => total + (row.sessionCount || 0), 0) > 0
          ? Number(
              (
                appRows.reduce(
                  (total, row) => total + (row.totalMinutesApprox || 0),
                  0,
                ) /
                appRows.reduce((total, row) => total + (row.sessionCount || 0), 0)
              ).toFixed(1),
            )
          : 0,
      avgPagesPerUser:
        aggregatedUsers.length > 0
          ? Number(
              (
                aggregatedUsers.reduce(
                  (total, user) => total + (user.pagesVisitedCount || 0),
                  0,
                ) / aggregatedUsers.length
              ).toFixed(1),
            )
          : 0,
      latestSummary,
    },
    patterns: {
      repeatUsers,
      oneTimeUsers,
      busiestHour,
      roleBreakdown,
      topActions: topActions.slice(0, 6),
      topTransitions: topTransitions.slice(0, 6),
    },
    trendRows,
    heatmapRows: aggregatedHourly,
    topPages: Array.from(topPages)
      .sort((left, right) => right.totalMinutesApprox - left.totalMinutesApprox)
      .slice(0, 8),
    topSections: Array.from(topSections)
      .sort((left, right) => right.totalMinutesApprox - left.totalMinutesApprox)
      .slice(0, 8),
    aggregatedUsers,
  };
};

export const buildUserDrilldownModel = ({
  rows = [],
  rangeDays = 30,
  now = new Date(),
} = {}) => {
  const cutoffDateKey = getDateKeyDaysAgo(rangeDays - 1, now);
  const filteredRows = rows.filter((row) => (row.dateKey || "") >= cutoffDateKey);
  const normalizedRows = filteredRows.map((row) => ({
    ...row,
    semanticEventCount: getSemanticEventCount(row),
    hourlyBuckets: getHourlyBuckets(row),
    topActions: (row.topActions || []).filter(
      (item) => item?.actionKey !== NAVIGATION_ACTION_KEY,
    ),
  }));
  const trendRows = [...filteredRows]
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
    .map((row) => ({
      dateKey: row.dateKey,
      label: formatDateKeyLabel(row.dateKey),
      totalMinutesApprox: row.totalMinutesApprox || 0,
      pageEnterCount: row.pageEnterCount || 0,
      pagesVisitedCount: row.pagesVisitedCount || 0,
      sessionCount: row.sessionCount || 0,
    }));

  return {
    trendRows,
    topPages: mergeTopItems(normalizedRows, "topPagesDetailed", "pageId").slice(0, 8),
    topSections: mergeTopItems(normalizedRows, "topSections", "sectionLabel").slice(0, 6),
    topActions: mergeTopActions(normalizedRows).slice(0, 6),
    heatmapRows: sumBuckets(normalizedRows),
    summary: {
      totalMinutesApprox: filteredRows.reduce(
        (total, row) => total + (row.totalMinutesApprox || 0),
        0,
      ),
      sessionCount: filteredRows.reduce(
        (total, row) => total + (row.sessionCount || 0),
        0,
      ),
      activeDays: filteredRows.length,
      pagesVisitedCount: filteredRows.reduce(
        (total, row) => total + (row.pagesVisitedCount || 0),
        0,
      ),
    },
  };
};
