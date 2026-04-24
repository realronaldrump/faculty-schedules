const ACTIVITY_ROLLUP_TIME_ZONE = "America/Chicago";
const MIN_ACTIVITY_MINUTES_PER_EVENT = 1;
const MAX_ACTIVITY_GAP_MINUTES = 30;
const TOP_ITEM_LIMIT = 8;

const formatDateKeyInTimeZone = (date, timeZone = ACTIVITY_ROLLUP_TIME_ZONE) => {
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

const getZonedParts = (date, timeZone = ACTIVITY_ROLLUP_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const lookup = parts.reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});

  return {
    year: Number(lookup.year || 0),
    month: Number(lookup.month || 0),
    day: Number(lookup.day || 0),
    hour: Number(lookup.hour || 0),
    minute: Number(lookup.minute || 0),
    second: Number(lookup.second || 0),
  };
};

const getTimeZoneOffsetMs = (date, timeZone = ACTIVITY_ROLLUP_TIME_ZONE) => {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    Math.max(0, parts.month - 1),
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
};

const zonedDateTimeToUtc = (
  input,
  timeZone = ACTIVITY_ROLLUP_TIME_ZONE,
) => {
  const year = Number(input?.year || 0);
  const month = Number(input?.month || 1);
  const day = Number(input?.day || 1);
  const hour = Number(input?.hour || 0);
  const minute = Number(input?.minute || 0);
  const second = Number(input?.second || 0);

  const initialUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const initialDate = new Date(initialUtc);
  const initialOffset = getTimeZoneOffsetMs(initialDate, timeZone);
  let adjustedUtc = initialUtc - initialOffset;
  const adjustedDate = new Date(adjustedUtc);
  const adjustedOffset = getTimeZoneOffsetMs(adjustedDate, timeZone);
  if (adjustedOffset !== initialOffset) {
    adjustedUtc = initialUtc - adjustedOffset;
  }
  return new Date(adjustedUtc);
};

const addDaysToDateKey = (dateKey, days) => {
  const baseDate = new Date(`${dateKey}T00:00:00Z`);
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return baseDate.toISOString().slice(0, 10);
};

const getDateKeyUtcRange = (
  dateKey,
  timeZone = ACTIVITY_ROLLUP_TIME_ZONE,
) => {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map((value) => Number(value));

  if (!year || !month || !day) {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }

  const start = zonedDateTimeToUtc(
    { year, month, day, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  const nextDateKey = addDaysToDateKey(dateKey, 1);
  const [nextYear, nextMonth, nextDay] = nextDateKey
    .split("-")
    .map((value) => Number(value));
  const end = zonedDateTimeToUtc(
    { year: nextYear, month: nextMonth, day: nextDay, hour: 0, minute: 0, second: 0 },
    timeZone,
  );

  return { start, end };
};

const enumerateDateKeys = (startDateKey, endDateKey) => {
  const keys = [];
  let cursor = startDateKey;
  while (cursor <= endDateKey) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return keys;
};

const asDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeRole = (role) =>
  typeof role === "string" && role.trim() ? role.trim() : "unknown";

const normalizeEventType = (value, pageId) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return pageId ? "page_enter" : "action";
};

const normalizeActionKey = (eventType, actionKey) => {
  if (typeof actionKey === "string" && actionKey.trim()) return actionKey.trim();
  if (eventType === "page_enter") return "navigate";
  return "";
};

const isSemanticActionEvent = (event) =>
  event?.eventType !== "page_enter" && Boolean(event?.actionKey);

const normalizeEvent = (event) => {
  const timestampDate = asDate(event?.timestamp);
  if (!event?.uid || !timestampDate) return null;

  const pageId =
    typeof event.pageId === "string" && event.pageId.trim()
      ? event.pageId.trim()
      : "";
  const eventType = normalizeEventType(event.eventType, pageId);
  const actionKey = normalizeActionKey(eventType, event.actionKey);
  const parts = getZonedParts(timestampDate);

  return {
    id: event.id || "",
    uid: event.uid,
    email: event.email || "",
    displayName: event.displayName || event.email || event.uid || "Unknown User",
    role: normalizeRole(event.role),
    sessionId:
      typeof event.sessionId === "string" && event.sessionId.trim()
        ? event.sessionId.trim()
        : "default",
    eventType,
    actionKey,
    pageId,
    pageLabel: event.pageLabel || pageId || "Unknown Page",
    sectionLabel: event.sectionLabel || "Other",
    metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {},
    timestampDate,
    dateKey: formatDateKeyInTimeZone(timestampDate),
    hour: Math.max(0, Math.min(23, Number(parts.hour || 0))),
  };
};

const createAppHourlyBucket = (hour) => ({
  hour,
  pageEnterCount: 0,
  semanticEventCount: 0,
  totalMinutesApprox: 0,
  userIds: new Set(),
});

const createUserHourlyBucket = (hour) => ({
  hour,
  pageEnterCount: 0,
  semanticEventCount: 0,
  totalMinutesApprox: 0,
});

const createAppHourlyBuckets = () =>
  Array.from({ length: 24 }, (_, hour) => createAppHourlyBucket(hour));

const createUserHourlyBuckets = () =>
  Array.from({ length: 24 }, (_, hour) => createUserHourlyBucket(hour));

const ensureRoleBreakdown = (map, role) => {
  const normalizedRole = normalizeRole(role);
  if (!map.has(normalizedRole)) {
    map.set(normalizedRole, {
      uniqueUsers: new Set(),
      sessionIds: new Set(),
      pageEnterCount: 0,
      semanticEventCount: 0,
      totalMinutesApprox: 0,
    });
  }
  return map.get(normalizedRole);
};

const ensureTopEntry = (map, key, seedFactory) => {
  if (!map.has(key)) {
    map.set(key, seedFactory());
  }
  return map.get(key);
};

const incrementActionEntry = (map, actionKey, uid) => {
  if (!actionKey) return;
  const entry = ensureTopEntry(map, actionKey, () => ({
    actionKey,
    count: 0,
    uniqueUsers: new Set(),
  }));
  entry.count += 1;
  if (uid) entry.uniqueUsers.add(uid);
};

const incrementTransitionEntry = (map, currentEvent, nextEvent) => {
  if (!currentEvent?.pageId || !nextEvent?.pageId) return;
  const key = `${currentEvent.pageId}>>${nextEvent.pageId}`;
  const entry = ensureTopEntry(map, key, () => ({
    fromPageId: currentEvent.pageId,
    fromPageLabel: currentEvent.pageLabel,
    toPageId: nextEvent.pageId,
    toPageLabel: nextEvent.pageLabel,
    count: 0,
  }));
  entry.count += 1;
};

const incrementPageEntry = (map, event) => {
  if (!event?.pageId) return;
  const entry = ensureTopEntry(map, event.pageId, () => ({
    pageId: event.pageId,
    pageLabel: event.pageLabel,
    sectionLabel: event.sectionLabel,
    count: 0,
    totalMinutesApprox: 0,
    uniqueUsers: new Set(),
  }));
  entry.count += 1;
  entry.uniqueUsers.add(event.uid);
};

const incrementSectionEntry = (map, event) => {
  const sectionLabel = event?.sectionLabel || "Other";
  const entry = ensureTopEntry(map, sectionLabel, () => ({
    sectionLabel,
    count: 0,
    totalMinutesApprox: 0,
    uniqueUsers: new Set(),
  }));
  entry.count += 1;
  entry.uniqueUsers.add(event.uid);
};

const addMinutesToPageEntry = (map, event, minutes) => {
  if (!event?.pageId) return;
  const entry = ensureTopEntry(map, event.pageId, () => ({
    pageId: event.pageId,
    pageLabel: event.pageLabel,
    sectionLabel: event.sectionLabel,
    count: 0,
    totalMinutesApprox: 0,
    uniqueUsers: new Set(),
  }));
  entry.totalMinutesApprox += minutes;
  entry.uniqueUsers.add(event.uid);
};

const addMinutesToSectionEntry = (map, event, minutes) => {
  const sectionLabel = event?.sectionLabel || "Other";
  const entry = ensureTopEntry(map, sectionLabel, () => ({
    sectionLabel,
    count: 0,
    totalMinutesApprox: 0,
    uniqueUsers: new Set(),
  }));
  entry.totalMinutesApprox += minutes;
  entry.uniqueUsers.add(event.uid);
};

const createDailyAccumulator = (dateKey) => ({
  dateKey,
  uniqueUsers: new Set(),
  sessionIds: new Set(),
  pageEnterCount: 0,
  semanticEventCount: 0,
  totalMinutesApprox: 0,
  hourlyBuckets: createAppHourlyBuckets(),
  roleBreakdown: new Map(),
  topPages: new Map(),
  topSections: new Map(),
  topActions: new Map(),
  topTransitions: new Map(),
  pageSummaries: new Map(),
  userSummaries: new Map(),
});

const createPageAccumulator = (dateKey, event) => ({
  dateKey,
  pageId: event.pageId,
  pageLabel: event.pageLabel,
  sectionLabel: event.sectionLabel,
  uniqueUsers: new Set(),
  pageEnterCount: 0,
  semanticEventCount: 0,
  totalMinutesApprox: 0,
  hourlyBuckets: createAppHourlyBuckets(),
  topActions: new Map(),
  roleBreakdown: new Map(),
});

const createUserAccumulator = (dateKey, event) => ({
  dateKey,
  uid: event.uid,
  email: event.email || "",
  displayName: event.displayName,
  role: event.role,
  sessionIds: new Set(),
  uniquePages: new Set(),
  pageEnterCount: 0,
  totalMinutesApprox: 0,
  hourlyBuckets: createUserHourlyBuckets(),
  topPagesDetailed: new Map(),
  topSections: new Map(),
  topActions: new Map(),
  firstSeenAt: event.timestampDate,
  lastSeenAt: event.timestampDate,
});

const getDailyAccumulator = (map, dateKey) => {
  if (!map.has(dateKey)) {
    map.set(dateKey, createDailyAccumulator(dateKey));
  }
  return map.get(dateKey);
};

const getPageAccumulator = (daily, event) => {
  if (!event.pageId) return null;
  if (!daily.pageSummaries.has(event.pageId)) {
    daily.pageSummaries.set(
      event.pageId,
      createPageAccumulator(daily.dateKey, event),
    );
  }
  return daily.pageSummaries.get(event.pageId);
};

const getUserAccumulator = (daily, event) => {
  if (!daily.userSummaries.has(event.uid)) {
    daily.userSummaries.set(
      event.uid,
      createUserAccumulator(daily.dateKey, event),
    );
  }
  return daily.userSummaries.get(event.uid);
};

const touchAppBucket = (bucket, uid) => {
  if (uid) bucket.userIds.add(uid);
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

const finalizeHourlyBuckets = (buckets) =>
  buckets.map((bucket) => {
    const result = {
      hour: bucket.hour,
      pageEnterCount: bucket.pageEnterCount || 0,
      semanticEventCount: bucket.semanticEventCount || 0,
      totalMinutesApprox: Math.round(bucket.totalMinutesApprox || 0),
    };
    if (bucket.userIds instanceof Set) {
      result.uniqueUsers = bucket.userIds.size;
    }
    return result;
  });

const finalizeRoleBreakdown = (roleBreakdown) =>
  Array.from(roleBreakdown.entries()).reduce((accumulator, [role, value]) => {
    accumulator[role] = {
      uniqueUsers: value.uniqueUsers.size,
      sessionCount: value.sessionIds.size,
      pageEnterCount: value.pageEnterCount || 0,
      semanticEventCount: value.semanticEventCount || 0,
      totalMinutesApprox: Math.round(value.totalMinutesApprox || 0),
    };
    return accumulator;
  }, {});

const sortByCountThenLabel = (left, right, labelKey) => {
  if ((right.count || 0) !== (left.count || 0)) {
    return (right.count || 0) - (left.count || 0);
  }
  return String(left[labelKey] || "").localeCompare(String(right[labelKey] || ""));
};

const finalizeTopEntries = (map, labelKey) =>
  Array.from(map.values())
    .map((entry) => {
      const finalized = { ...entry };
      if (entry.uniqueUsers instanceof Set) {
        finalized.uniqueUsers = entry.uniqueUsers.size;
      }
      if (typeof finalized.totalMinutesApprox === "number") {
        finalized.totalMinutesApprox = Math.round(finalized.totalMinutesApprox);
      }
      return finalized;
    })
    .sort((left, right) => sortByCountThenLabel(left, right, labelKey))
    .slice(0, TOP_ITEM_LIMIT);

const finalizeTransitionEntries = (map) =>
  Array.from(map.values())
    .sort((left, right) => {
      if ((right.count || 0) !== (left.count || 0)) {
        return (right.count || 0) - (left.count || 0);
      }
      return `${left.fromPageLabel || ""}${left.toPageLabel || ""}`.localeCompare(
        `${right.fromPageLabel || ""}${right.toPageLabel || ""}`,
      );
    })
    .slice(0, TOP_ITEM_LIMIT);

const rollupActivityForDateKeys = (rawEvents, dateKeys) => {
  const allowedDateKeys = new Set(Array.isArray(dateKeys) ? dateKeys : []);
  const dailyMap = new Map();
  const sessionMap = new Map();

  rawEvents
    .map((event) => normalizeEvent(event))
    .filter(Boolean)
    .filter((event) =>
      allowedDateKeys.size > 0 ? allowedDateKeys.has(event.dateKey) : true,
    )
    .sort((left, right) => {
      const diff =
        left.timestampDate.getTime() - right.timestampDate.getTime();
      if (diff !== 0) return diff;
      return String(left.id || "").localeCompare(String(right.id || ""));
    })
    .forEach((event) => {
      const daily = getDailyAccumulator(dailyMap, event.dateKey);
      const userSummary = getUserAccumulator(daily, event);
      const pageSummary = getPageAccumulator(daily, event);
      const sessionKey = `${event.dateKey}:${event.uid}:${event.sessionId}`;

      daily.uniqueUsers.add(event.uid);
      daily.sessionIds.add(sessionKey);
      userSummary.sessionIds.add(sessionKey);
      if (event.pageId) {
        userSummary.uniquePages.add(event.pageId);
      }

      if (event.timestampDate < userSummary.firstSeenAt) {
        userSummary.firstSeenAt = event.timestampDate;
      }
      if (event.timestampDate > userSummary.lastSeenAt) {
        userSummary.lastSeenAt = event.timestampDate;
      }

      const roleSummary = ensureRoleBreakdown(daily.roleBreakdown, event.role);
      roleSummary.uniqueUsers.add(event.uid);
      roleSummary.sessionIds.add(sessionKey);

      const dayBucket = daily.hourlyBuckets[event.hour];
      touchAppBucket(dayBucket, event.uid);

      if (pageSummary) {
        pageSummary.uniqueUsers.add(event.uid);
        const pageBucket = pageSummary.hourlyBuckets[event.hour];
        touchAppBucket(pageBucket, event.uid);
        const pageRoleSummary = ensureRoleBreakdown(
          pageSummary.roleBreakdown,
          event.role,
        );
        pageRoleSummary.uniqueUsers.add(event.uid);
        pageRoleSummary.sessionIds.add(sessionKey);
      }

      if (event.eventType === "page_enter") {
        daily.pageEnterCount += 1;
        dayBucket.pageEnterCount += 1;
        userSummary.pageEnterCount += 1;
        userSummary.hourlyBuckets[event.hour].pageEnterCount += 1;
        roleSummary.pageEnterCount += 1;
        incrementPageEntry(daily.topPages, event);
        incrementSectionEntry(daily.topSections, event);

        if (pageSummary) {
          pageSummary.pageEnterCount += 1;
          pageSummary.hourlyBuckets[event.hour].pageEnterCount += 1;
          const pageRoleSummary = ensureRoleBreakdown(
            pageSummary.roleBreakdown,
            event.role,
          );
          pageRoleSummary.pageEnterCount += 1;
        }

        const userPageEntry = ensureTopEntry(
          userSummary.topPagesDetailed,
          event.pageId,
          () => ({
            pageId: event.pageId,
            pageLabel: event.pageLabel,
            sectionLabel: event.sectionLabel,
            count: 0,
            totalMinutesApprox: 0,
          }),
        );
        userPageEntry.count += 1;

        const userSectionEntry = ensureTopEntry(
          userSummary.topSections,
          event.sectionLabel,
          () => ({
            sectionLabel: event.sectionLabel,
            count: 0,
            totalMinutesApprox: 0,
          }),
        );
        userSectionEntry.count += 1;

        const sessionEvents = sessionMap.get(sessionKey) || [];
        sessionEvents.push(event);
        sessionMap.set(sessionKey, sessionEvents);
      }

      if (isSemanticActionEvent(event)) {
        daily.semanticEventCount += 1;
        dayBucket.semanticEventCount += 1;
        userSummary.hourlyBuckets[event.hour].semanticEventCount += 1;
        roleSummary.semanticEventCount += 1;
        incrementActionEntry(daily.topActions, event.actionKey, event.uid);
        incrementActionEntry(userSummary.topActions, event.actionKey, event.uid);

        if (pageSummary) {
          pageSummary.semanticEventCount += 1;
          pageSummary.hourlyBuckets[event.hour].semanticEventCount += 1;
          incrementActionEntry(pageSummary.topActions, event.actionKey, event.uid);
          const pageRoleSummary = ensureRoleBreakdown(
            pageSummary.roleBreakdown,
            event.role,
          );
          pageRoleSummary.semanticEventCount += 1;
        }
      }
    });

  sessionMap.forEach((events) => {
    const ordered = [...events].sort(
      (left, right) => left.timestampDate.getTime() - right.timestampDate.getTime(),
    );

    ordered.forEach((event, index) => {
      const nextEvent = ordered[index + 1];
      const daily = dailyMap.get(event.dateKey);
      if (!daily) return;
      const userSummary = daily.userSummaries.get(event.uid);
      const pageSummary = daily.pageSummaries.get(event.pageId);
      const roleSummary = ensureRoleBreakdown(daily.roleBreakdown, event.role);
      const nextTimestamp = nextEvent?.timestampDate;
      const diffMinutes = nextTimestamp
        ? (nextTimestamp.getTime() - event.timestampDate.getTime()) / (1000 * 60)
        : MIN_ACTIVITY_MINUTES_PER_EVENT;
      const minutes = normalizeEventMinutes(diffMinutes);

      daily.totalMinutesApprox += minutes;
      daily.hourlyBuckets[event.hour].totalMinutesApprox += minutes;
      roleSummary.totalMinutesApprox += minutes;
      addMinutesToPageEntry(daily.topPages, event, minutes);
      addMinutesToSectionEntry(daily.topSections, event, minutes);

      if (pageSummary) {
        pageSummary.totalMinutesApprox += minutes;
        pageSummary.hourlyBuckets[event.hour].totalMinutesApprox += minutes;
        const pageRoleSummary = ensureRoleBreakdown(
          pageSummary.roleBreakdown,
          event.role,
        );
        pageRoleSummary.totalMinutesApprox += minutes;
      }

      if (userSummary) {
        userSummary.totalMinutesApprox += minutes;
        userSummary.hourlyBuckets[event.hour].totalMinutesApprox += minutes;
        const userPageEntry = ensureTopEntry(
          userSummary.topPagesDetailed,
          event.pageId,
          () => ({
            pageId: event.pageId,
            pageLabel: event.pageLabel,
            sectionLabel: event.sectionLabel,
            count: 0,
            totalMinutesApprox: 0,
          }),
        );
        userPageEntry.totalMinutesApprox += minutes;
        const userSectionEntry = ensureTopEntry(
          userSummary.topSections,
          event.sectionLabel,
          () => ({
            sectionLabel: event.sectionLabel,
            count: 0,
            totalMinutesApprox: 0,
          }),
        );
        userSectionEntry.totalMinutesApprox += minutes;
      }

      if (nextEvent) {
        incrementTransitionEntry(daily.topTransitions, event, nextEvent);
      }
    });
  });

  return Array.from(dailyMap.values())
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
    .map((daily) => {
      const userDocs = Array.from(daily.userSummaries.values()).map((summary) => ({
        dateKey: daily.dateKey,
        uid: summary.uid,
        email: summary.email || "",
        displayName: summary.displayName,
        role: summary.role,
        sessionCount: summary.sessionIds.size,
        totalMinutesApprox: Math.round(summary.totalMinutesApprox),
        pagesVisitedCount: summary.uniquePages.size,
        pageEnterCount: summary.pageEnterCount,
        hourlyBuckets: finalizeHourlyBuckets(summary.hourlyBuckets),
        topPagesDetailed: finalizeTopEntries(summary.topPagesDetailed, "pageLabel"),
        topSections: finalizeTopEntries(summary.topSections, "sectionLabel"),
        topActions: finalizeTopEntries(summary.topActions, "actionKey"),
        firstSeenAt: summary.firstSeenAt,
        lastSeenAt: summary.lastSeenAt,
      }));

      const pageDocs = Array.from(daily.pageSummaries.values()).map((summary) => ({
        dateKey: daily.dateKey,
        pageId: summary.pageId,
        pageLabel: summary.pageLabel,
        sectionLabel: summary.sectionLabel,
        uniqueUsers: summary.uniqueUsers.size,
        pageEnterCount: summary.pageEnterCount,
        semanticEventCount: summary.semanticEventCount,
        totalMinutesApprox: Math.round(summary.totalMinutesApprox),
        hourlyBuckets: finalizeHourlyBuckets(summary.hourlyBuckets),
        topActions: finalizeTopEntries(summary.topActions, "actionKey"),
        roleBreakdown: finalizeRoleBreakdown(summary.roleBreakdown),
      }));

      const avgMinutesPerUser =
        daily.uniqueUsers.size > 0
          ? Number((daily.totalMinutesApprox / daily.uniqueUsers.size).toFixed(1))
          : 0;
      const avgPagesPerUser =
        userDocs.length > 0
          ? Number(
              (
                userDocs.reduce(
                  (total, item) => total + (item.pagesVisitedCount || 0),
                  0,
                ) / userDocs.length
              ).toFixed(1),
            )
          : 0;

      return {
        analyticsDoc: {
          dateKey: daily.dateKey,
          uniqueUsers: daily.uniqueUsers.size,
          sessionCount: daily.sessionIds.size,
          pageEnterCount: daily.pageEnterCount,
          semanticEventCount: daily.semanticEventCount,
          totalMinutesApprox: Math.round(daily.totalMinutesApprox),
          avgMinutesPerUser,
          avgPagesPerUser,
          roleBreakdown: finalizeRoleBreakdown(daily.roleBreakdown),
          hourlyBuckets: finalizeHourlyBuckets(daily.hourlyBuckets),
          topPages: finalizeTopEntries(daily.topPages, "pageLabel"),
          topSections: finalizeTopEntries(daily.topSections, "sectionLabel"),
          topActions: finalizeTopEntries(daily.topActions, "actionKey"),
          topTransitions: finalizeTransitionEntries(daily.topTransitions),
        },
        pageDocs,
        userDocs,
      };
    });
};

module.exports = {
  ACTIVITY_ROLLUP_TIME_ZONE,
  addDaysToDateKey,
  enumerateDateKeys,
  formatDateKeyInTimeZone,
  getDateKeyUtcRange,
  rollupActivityForDateKeys,
};
