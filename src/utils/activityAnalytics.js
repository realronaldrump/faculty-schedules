const ANALYTICS_TIME_ZONE = "America/Chicago";
const NAVIGATION_ACTION_KEY = "navigate";
export const ACTIVITY_RANGE_OPTIONS = [7, 30, 90];
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getWeekdayIndex = (dateKey) => {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getDay();
};

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

// Percentage change vs the prior equal-length window; null when there is no
// prior baseline to compare against.
const computeDelta = (current, previous) => {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(0));
};

export const buildActivityAnalyticsModel = ({
  appDailyRows = [],
  pageDailyRows = [],
  userDailyRows = [],
  rangeDays = 30,
  lookbackDays = 90,
  now = new Date(),
} = {}) => {
  const cutoffDateKey = getDateKeyDaysAgo(rangeDays - 1, now);
  const todayDateKey = formatDateKeyInTimeZone(now);

  const appRows = appDailyRows.filter((row) => (row.dateKey || "") >= cutoffDateKey);
  const pageRows = pageDailyRows.filter((row) => (row.dateKey || "") >= cutoffDateKey);
  const userRows = userDailyRows.filter((row) => (row.dateKey || "") >= cutoffDateKey);

  // First appearance across the whole loaded lookback (not just the selected
  // range) so "new" means "not seen before this range within the lookback".
  const firstSeenDateKeyByUid = new Map();
  userDailyRows.forEach((row) => {
    if (!row.uid || !row.dateKey) return;
    const existing = firstSeenDateKeyByUid.get(row.uid);
    if (!existing || row.dateKey < existing) {
      firstSeenDateKeyByUid.set(row.uid, row.dateKey);
    }
  });

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
      lastSeenDateKey: "",
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
    if ((row.dateKey || "") > existing.lastSeenDateKey) {
      existing.lastSeenDateKey = row.dateKey || "";
    }
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

  // "New" is only meaningful when the lookback extends before the range —
  // otherwise every user would look new.
  const canFlagNewUsers = lookbackDays > rangeDays;

  const aggregatedUsers = Array.from(usersByUid.values())
    .map((user) => ({
      ...user,
      isNewInRange:
        canFlagNewUsers &&
        (firstSeenDateKeyByUid.get(user.uid) || "") >= cutoffDateKey,
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

  // Period-over-period comparison against the prior equal-length window, only
  // when the loaded lookback fully covers that prior window.
  const previousCutoffDateKey = getDateKeyDaysAgo(rangeDays * 2 - 1, now);
  const hasPreviousWindow = rangeDays * 2 <= lookbackDays;
  const previousAppRows = hasPreviousWindow
    ? appDailyRows.filter((row) => {
        const dateKey = row.dateKey || "";
        return dateKey >= previousCutoffDateKey && dateKey < cutoffDateKey;
      })
    : [];
  const previousUserRows = hasPreviousWindow
    ? userDailyRows.filter((row) => {
        const dateKey = row.dateKey || "";
        return dateKey >= previousCutoffDateKey && dateKey < cutoffDateKey;
      })
    : [];
  const sumField = (rows, field) =>
    rows.reduce((total, row) => total + (row[field] || 0), 0);
  const currentTotals = {
    totalMinutesApprox: sumField(appRows, "totalMinutesApprox"),
    sessionCount: sumField(appRows, "sessionCount"),
    pageEnterCount: sumField(appRows, "pageEnterCount"),
    uniqueUsers: aggregatedUsers.length,
  };
  const previousTotals = {
    totalMinutesApprox: sumField(previousAppRows, "totalMinutesApprox"),
    sessionCount: sumField(previousAppRows, "sessionCount"),
    pageEnterCount: sumField(previousAppRows, "pageEnterCount"),
    uniqueUsers: new Set(previousUserRows.map((row) => row.uid).filter(Boolean))
      .size,
  };
  const deltas = hasPreviousWindow
    ? {
        totalMinutesApprox: computeDelta(
          currentTotals.totalMinutesApprox,
          previousTotals.totalMinutesApprox,
        ),
        sessionCount: computeDelta(
          currentTotals.sessionCount,
          previousTotals.sessionCount,
        ),
        pageEnterCount: computeDelta(
          currentTotals.pageEnterCount,
          previousTotals.pageEnterCount,
        ),
        uniqueUsers: computeDelta(
          currentTotals.uniqueUsers,
          previousTotals.uniqueUsers,
        ),
      }
    : null;

  // Weekday x hour minutes grid (rows Sun..Sat, cols 0..23) for the heatmap.
  const weekHourGrid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  const weekdayTotals = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday],
    totalMinutesApprox: 0,
    activeDayCount: 0,
  }));
  appRows.forEach((row) => {
    const weekday = getWeekdayIndex(row.dateKey);
    (row.hourlyBuckets || []).forEach((bucket) => {
      if (bucket.hour >= 0 && bucket.hour <= 23) {
        weekHourGrid[weekday][bucket.hour] += bucket.totalMinutesApprox || 0;
      }
    });
    weekdayTotals[weekday].totalMinutesApprox += row.totalMinutesApprox || 0;
    if ((row.totalMinutesApprox || 0) > 0) {
      weekdayTotals[weekday].activeDayCount += 1;
    }
  });

  const busiestDay =
    [...trendRows].sort(
      (left, right) => right.totalMinutesApprox - left.totalMinutesApprox,
    )[0] || null;

  // Per-page aggregation for the sortable Pages table. Daily unique-user counts
  // cannot be summed across days, so expose the peak day instead.
  const pagesTable = Array.from(
    pageRows
      .reduce((accumulator, row) => {
        const existing = accumulator.get(row.pageId) || {
          pageId: row.pageId,
          pageLabel: row.pageLabel || row.pageId,
          sectionLabel: row.sectionLabel || "Other",
          pageEnterCount: 0,
          totalMinutesApprox: 0,
          semanticEventCount: 0,
          peakDayUsers: 0,
          daysUsed: 0,
          lastUsedDateKey: "",
        };
        existing.pageEnterCount += row.pageEnterCount || 0;
        existing.totalMinutesApprox += row.totalMinutesApprox || 0;
        existing.semanticEventCount += getSemanticEventCount(row);
        existing.peakDayUsers = Math.max(
          existing.peakDayUsers,
          row.uniqueUsers || 0,
        );
        existing.daysUsed += 1;
        if ((row.dateKey || "") > existing.lastUsedDateKey) {
          existing.lastUsedDateKey = row.dateKey || "";
        }
        accumulator.set(row.pageId, existing);
        return accumulator;
      }, new Map())
      .values(),
  ).sort((left, right) => right.totalMinutesApprox - left.totalMinutesApprox);

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
    deltas,
    trendRows,
    heatmapRows: aggregatedHourly,
    weekHourGrid,
    weekdayTotals,
    busiestDay,
    pagesTable,
    topPages: Array.from(topPages)
      .sort((left, right) => right.totalMinutesApprox - left.totalMinutesApprox)
      .slice(0, 8),
    topSections: Array.from(topSections)
      .sort((left, right) => right.totalMinutesApprox - left.totalMinutesApprox)
      .slice(0, 8),
    aggregatedUsers,
  };
};

export const buildPageDrilldownModel = ({
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
  }));

  const trendRows = [...filteredRows]
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
    .map((row) => ({
      dateKey: row.dateKey,
      label: formatDateKeyLabel(row.dateKey),
      totalMinutesApprox: row.totalMinutesApprox || 0,
      pageEnterCount: row.pageEnterCount || 0,
      uniqueUsers: row.uniqueUsers || 0,
    }));

  return {
    trendRows,
    heatmapRows: sumBuckets(normalizedRows),
    topActions: mergeTopActions(normalizedRows).slice(0, 6),
    roleBreakdown: aggregateRoleBreakdown(normalizedRows),
    summary: {
      totalMinutesApprox: filteredRows.reduce(
        (total, row) => total + (row.totalMinutesApprox || 0),
        0,
      ),
      pageEnterCount: filteredRows.reduce(
        (total, row) => total + (row.pageEnterCount || 0),
        0,
      ),
      peakDayUsers: filteredRows.reduce(
        (max, row) => Math.max(max, row.uniqueUsers || 0),
        0,
      ),
      daysUsed: filteredRows.length,
    },
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
