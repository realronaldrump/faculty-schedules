/**
 * Client-side activity rollup — computes daily analytics from raw
 * userActivityEvents documents so the analytics page works without
 * Cloud Functions or a Blaze-plan upgrade.
 *
 * The output shape matches the three rollup collections the page
 * already consumes: analyticsDoc → appDailyRows,
 * pageDocs → pageDailyRows, userDocs → userDailyRows.
 */

import { formatDateKeyInTimeZone, toDate } from "./activityAnalytics";

const ANALYTICS_TIME_ZONE = "America/Chicago";
const MIN_ACTIVITY_MINUTES_PER_EVENT = 1;
const MAX_ACTIVITY_GAP_MINUTES = 30;
const TOP_ITEM_LIMIT = 8;

/* ────────────────────────── helpers ────────────────────────── */

const getZonedParts = (date, timeZone = ANALYTICS_TIME_ZONE) => {
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

  const lookup = parts.reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});

  return {
    hour: Number(lookup.hour || 0),
  };
};

export const addDaysToDateKey = (dateKey, days) => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const enumerateDateKeys = (startDateKey, endDateKey) => {
  const keys = [];
  let cursor = startDateKey;
  while (cursor <= endDateKey) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return keys;
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

const normalizeEvent = (event) => {
  const timestampDate = toDate(event?.timestamp);
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
    timestampDate,
    dateKey: formatDateKeyInTimeZone(timestampDate),
    hour: Math.max(0, Math.min(23, Number(parts.hour || 0))),
  };
};

/* ──────────────── bucket / accumulator factories ──────────────── */

const createAppBucket = (hour) => ({
  hour,
  pageEnterCount: 0,
  semanticEventCount: 0,
  totalMinutesApprox: 0,
  userIds: new Set(),
});

const createUserBucket = (hour) => ({
  hour,
  pageEnterCount: 0,
  semanticEventCount: 0,
  totalMinutesApprox: 0,
});

const make24 = (factory) => Array.from({ length: 24 }, (_, h) => factory(h));

const ensureMap = (map, key, factory) => {
  if (!map.has(key)) map.set(key, factory());
  return map.get(key);
};

const ensureRole = (map, role) => {
  const r = normalizeRole(role);
  return ensureMap(map, r, () => ({
    uniqueUsers: new Set(),
    sessionIds: new Set(),
    pageEnterCount: 0,
    semanticEventCount: 0,
    totalMinutesApprox: 0,
  }));
};

const createDaily = (dateKey) => ({
  dateKey,
  uniqueUsers: new Set(),
  sessionIds: new Set(),
  pageEnterCount: 0,
  semanticEventCount: 0,
  totalMinutesApprox: 0,
  hourlyBuckets: make24(createAppBucket),
  roleBreakdown: new Map(),
  topPages: new Map(),
  topSections: new Map(),
  topActions: new Map(),
  topTransitions: new Map(),
  pageSummaries: new Map(),
  userSummaries: new Map(),
});

const createPageAcc = (dateKey, ev) => ({
  dateKey,
  pageId: ev.pageId,
  pageLabel: ev.pageLabel,
  sectionLabel: ev.sectionLabel,
  uniqueUsers: new Set(),
  pageEnterCount: 0,
  semanticEventCount: 0,
  totalMinutesApprox: 0,
  hourlyBuckets: make24(createAppBucket),
  topActions: new Map(),
  roleBreakdown: new Map(),
});

const createUserAcc = (dateKey, ev) => ({
  dateKey,
  uid: ev.uid,
  email: ev.email || "",
  displayName: ev.displayName,
  role: ev.role,
  sessionIds: new Set(),
  uniquePages: new Set(),
  pageEnterCount: 0,
  totalMinutesApprox: 0,
  hourlyBuckets: make24(createUserBucket),
  topPagesDetailed: new Map(),
  topSections: new Map(),
  topActions: new Map(),
  firstSeenAt: ev.timestampDate,
  lastSeenAt: ev.timestampDate,
});

/* ──────────── increment helpers ──────────── */

const incAction = (map, actionKey, uid) => {
  if (!actionKey) return;
  const e = ensureMap(map, actionKey, () => ({
    actionKey,
    count: 0,
    uniqueUsers: new Set(),
  }));
  e.count += 1;
  if (uid) e.uniqueUsers.add(uid);
};

const incTransition = (map, cur, nxt) => {
  if (!cur?.pageId || !nxt?.pageId) return;
  const key = `${cur.pageId}>>${nxt.pageId}`;
  const e = ensureMap(map, key, () => ({
    fromPageId: cur.pageId,
    fromPageLabel: cur.pageLabel,
    toPageId: nxt.pageId,
    toPageLabel: nxt.pageLabel,
    count: 0,
  }));
  e.count += 1;
};

const incPage = (map, ev) => {
  if (!ev?.pageId) return;
  const e = ensureMap(map, ev.pageId, () => ({
    pageId: ev.pageId,
    pageLabel: ev.pageLabel,
    sectionLabel: ev.sectionLabel,
    count: 0,
    totalMinutesApprox: 0,
    uniqueUsers: new Set(),
  }));
  e.count += 1;
  e.uniqueUsers.add(ev.uid);
};

const incSection = (map, ev) => {
  const s = ev?.sectionLabel || "Other";
  const e = ensureMap(map, s, () => ({
    sectionLabel: s,
    count: 0,
    totalMinutesApprox: 0,
    uniqueUsers: new Set(),
  }));
  e.count += 1;
  e.uniqueUsers.add(ev.uid);
};

const addMinToPage = (map, ev, min) => {
  if (!ev?.pageId) return;
  const e = ensureMap(map, ev.pageId, () => ({
    pageId: ev.pageId,
    pageLabel: ev.pageLabel,
    sectionLabel: ev.sectionLabel,
    count: 0,
    totalMinutesApprox: 0,
    uniqueUsers: new Set(),
  }));
  e.totalMinutesApprox += min;
  e.uniqueUsers.add(ev.uid);
};

const addMinToSection = (map, ev, min) => {
  const s = ev?.sectionLabel || "Other";
  const e = ensureMap(map, s, () => ({
    sectionLabel: s,
    count: 0,
    totalMinutesApprox: 0,
    uniqueUsers: new Set(),
  }));
  e.totalMinutesApprox += min;
  e.uniqueUsers.add(ev.uid);
};

/* ──────────── finalize helpers ──────────── */

const normMin = (m) => {
  if (!Number.isFinite(m) || m <= 0) return MIN_ACTIVITY_MINUTES_PER_EVENT;
  return Math.max(MIN_ACTIVITY_MINUTES_PER_EVENT, Math.min(MAX_ACTIVITY_GAP_MINUTES, Math.round(m)));
};

const finBuckets = (buckets) =>
  buckets.map((b) => {
    const r = {
      hour: b.hour,
      pageEnterCount: b.pageEnterCount || 0,
      semanticEventCount: b.semanticEventCount || 0,
      totalMinutesApprox: Math.round(b.totalMinutesApprox || 0),
    };
    if (b.userIds instanceof Set) r.uniqueUsers = b.userIds.size;
    return r;
  });

const finRoles = (rb) =>
  Array.from(rb.entries()).reduce((acc, [role, v]) => {
    acc[role] = {
      uniqueUsers: v.uniqueUsers.size,
      sessionCount: v.sessionIds.size,
      pageEnterCount: v.pageEnterCount || 0,
      semanticEventCount: v.semanticEventCount || 0,
      totalMinutesApprox: Math.round(v.totalMinutesApprox || 0),
    };
    return acc;
  }, {});

const finTop = (map, labelKey) =>
  Array.from(map.values())
    .map((e) => {
      const f = { ...e };
      if (e.uniqueUsers instanceof Set) f.uniqueUsers = e.uniqueUsers.size;
      if (typeof f.totalMinutesApprox === "number")
        f.totalMinutesApprox = Math.round(f.totalMinutesApprox);
      return f;
    })
    .sort((a, b) => {
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
      return String(a[labelKey] || "").localeCompare(String(b[labelKey] || ""));
    })
    .slice(0, TOP_ITEM_LIMIT);

const finTransitions = (map) =>
  Array.from(map.values())
    .sort((a, b) => {
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
      return `${a.fromPageLabel}${a.toPageLabel}`.localeCompare(
        `${b.fromPageLabel}${b.toPageLabel}`,
      );
    })
    .slice(0, TOP_ITEM_LIMIT);

/* ══════════════ main rollup function ══════════════ */

export const rollupActivityForDateKeys = (rawEvents, dateKeys) => {
  const allowed = new Set(Array.isArray(dateKeys) ? dateKeys : []);
  const dailyMap = new Map();
  const sessionMap = new Map();

  rawEvents
    .map((e) => normalizeEvent(e))
    .filter(Boolean)
    .filter((e) => (allowed.size > 0 ? allowed.has(e.dateKey) : true))
    .sort((a, b) => {
      const d = a.timestampDate.getTime() - b.timestampDate.getTime();
      if (d !== 0) return d;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
    .forEach((ev) => {
      const daily = ensureMap(dailyMap, ev.dateKey, () => createDaily(ev.dateKey));
      const uAcc = ensureMap(daily.userSummaries, ev.uid, () =>
        createUserAcc(daily.dateKey, ev),
      );
      const pAcc = ev.pageId
        ? ensureMap(daily.pageSummaries, ev.pageId, () =>
            createPageAcc(daily.dateKey, ev),
          )
        : null;
      const sKey = `${ev.dateKey}:${ev.uid}:${ev.sessionId}`;

      daily.uniqueUsers.add(ev.uid);
      daily.sessionIds.add(sKey);
      uAcc.sessionIds.add(sKey);
      if (ev.pageId) uAcc.uniquePages.add(ev.pageId);

      if (ev.timestampDate < uAcc.firstSeenAt) uAcc.firstSeenAt = ev.timestampDate;
      if (ev.timestampDate > uAcc.lastSeenAt) uAcc.lastSeenAt = ev.timestampDate;

      const roleSummary = ensureRole(daily.roleBreakdown, ev.role);
      roleSummary.uniqueUsers.add(ev.uid);
      roleSummary.sessionIds.add(sKey);

      const dayBucket = daily.hourlyBuckets[ev.hour];
      if (ev.uid) dayBucket.userIds.add(ev.uid);

      if (pAcc) {
        pAcc.uniqueUsers.add(ev.uid);
        pAcc.hourlyBuckets[ev.hour].userIds.add(ev.uid);
        const pRole = ensureRole(pAcc.roleBreakdown, ev.role);
        pRole.uniqueUsers.add(ev.uid);
        pRole.sessionIds.add(sKey);
      }

      if (ev.eventType === "page_enter") {
        daily.pageEnterCount += 1;
        dayBucket.pageEnterCount += 1;
        uAcc.pageEnterCount += 1;
        uAcc.hourlyBuckets[ev.hour].pageEnterCount += 1;
        roleSummary.pageEnterCount += 1;
        incPage(daily.topPages, ev);
        incSection(daily.topSections, ev);

        if (pAcc) {
          pAcc.pageEnterCount += 1;
          pAcc.hourlyBuckets[ev.hour].pageEnterCount += 1;
          ensureRole(pAcc.roleBreakdown, ev.role).pageEnterCount += 1;
        }

        const uPage = ensureMap(uAcc.topPagesDetailed, ev.pageId, () => ({
          pageId: ev.pageId,
          pageLabel: ev.pageLabel,
          sectionLabel: ev.sectionLabel,
          count: 0,
          totalMinutesApprox: 0,
        }));
        uPage.count += 1;

        const uSec = ensureMap(uAcc.topSections, ev.sectionLabel, () => ({
          sectionLabel: ev.sectionLabel,
          count: 0,
          totalMinutesApprox: 0,
        }));
        uSec.count += 1;

        const sessEvents = sessionMap.get(sKey) || [];
        sessEvents.push(ev);
        sessionMap.set(sKey, sessEvents);
      }

      if (ev.actionKey) {
        daily.semanticEventCount += 1;
        dayBucket.semanticEventCount += 1;
        uAcc.hourlyBuckets[ev.hour].semanticEventCount += 1;
        roleSummary.semanticEventCount += 1;
        incAction(daily.topActions, ev.actionKey, ev.uid);
        incAction(uAcc.topActions, ev.actionKey, ev.uid);

        if (pAcc) {
          pAcc.semanticEventCount += 1;
          pAcc.hourlyBuckets[ev.hour].semanticEventCount += 1;
          incAction(pAcc.topActions, ev.actionKey, ev.uid);
          ensureRole(pAcc.roleBreakdown, ev.role).semanticEventCount += 1;
        }
      }
    });

  /* ── dwell-time pass ── */
  sessionMap.forEach((events) => {
    const ordered = [...events].sort(
      (a, b) => a.timestampDate.getTime() - b.timestampDate.getTime(),
    );

    ordered.forEach((ev, idx) => {
      const nxt = ordered[idx + 1];
      const daily = dailyMap.get(ev.dateKey);
      if (!daily) return;
      const uAcc = daily.userSummaries.get(ev.uid);
      const pAcc = daily.pageSummaries.get(ev.pageId);
      const roleSummary = ensureRole(daily.roleBreakdown, ev.role);
      const diffMin = nxt
        ? (nxt.timestampDate.getTime() - ev.timestampDate.getTime()) / (1000 * 60)
        : MIN_ACTIVITY_MINUTES_PER_EVENT;
      const min = normMin(diffMin);

      daily.totalMinutesApprox += min;
      daily.hourlyBuckets[ev.hour].totalMinutesApprox += min;
      roleSummary.totalMinutesApprox += min;
      addMinToPage(daily.topPages, ev, min);
      addMinToSection(daily.topSections, ev, min);

      if (pAcc) {
        pAcc.totalMinutesApprox += min;
        pAcc.hourlyBuckets[ev.hour].totalMinutesApprox += min;
        ensureRole(pAcc.roleBreakdown, ev.role).totalMinutesApprox += min;
      }

      if (uAcc) {
        uAcc.totalMinutesApprox += min;
        uAcc.hourlyBuckets[ev.hour].totalMinutesApprox += min;
        const uPage = ensureMap(uAcc.topPagesDetailed, ev.pageId, () => ({
          pageId: ev.pageId,
          pageLabel: ev.pageLabel,
          sectionLabel: ev.sectionLabel,
          count: 0,
          totalMinutesApprox: 0,
        }));
        uPage.totalMinutesApprox += min;
        const uSec = ensureMap(uAcc.topSections, ev.sectionLabel, () => ({
          sectionLabel: ev.sectionLabel,
          count: 0,
          totalMinutesApprox: 0,
        }));
        uSec.totalMinutesApprox += min;
      }

      if (nxt) incTransition(daily.topTransitions, ev, nxt);
    });
  });

  /* ── serialize ── */
  return Array.from(dailyMap.values())
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .map((daily) => {
      const userDocs = Array.from(daily.userSummaries.values()).map((u) => ({
        dateKey: daily.dateKey,
        uid: u.uid,
        email: u.email || "",
        displayName: u.displayName,
        role: u.role,
        sessionCount: u.sessionIds.size,
        totalMinutesApprox: Math.round(u.totalMinutesApprox),
        pagesVisitedCount: u.uniquePages.size,
        pageEnterCount: u.pageEnterCount,
        hourlyBuckets: finBuckets(u.hourlyBuckets),
        topPagesDetailed: finTop(u.topPagesDetailed, "pageLabel"),
        topSections: finTop(u.topSections, "sectionLabel"),
        topActions: finTop(u.topActions, "actionKey"),
        firstSeenAt: u.firstSeenAt,
        lastSeenAt: u.lastSeenAt,
      }));

      const pageDocs = Array.from(daily.pageSummaries.values()).map((p) => ({
        dateKey: daily.dateKey,
        pageId: p.pageId,
        pageLabel: p.pageLabel,
        sectionLabel: p.sectionLabel,
        uniqueUsers: p.uniqueUsers.size,
        pageEnterCount: p.pageEnterCount,
        semanticEventCount: p.semanticEventCount,
        totalMinutesApprox: Math.round(p.totalMinutesApprox),
        hourlyBuckets: finBuckets(p.hourlyBuckets),
        topActions: finTop(p.topActions, "actionKey"),
        roleBreakdown: finRoles(p.roleBreakdown),
      }));

      const avgMin =
        daily.uniqueUsers.size > 0
          ? Number((daily.totalMinutesApprox / daily.uniqueUsers.size).toFixed(1))
          : 0;
      const avgPages =
        userDocs.length > 0
          ? Number(
              (
                userDocs.reduce((t, u) => t + (u.pagesVisitedCount || 0), 0) /
                userDocs.length
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
          avgMinutesPerUser: avgMin,
          avgPagesPerUser: avgPages,
          roleBreakdown: finRoles(daily.roleBreakdown),
          hourlyBuckets: finBuckets(daily.hourlyBuckets),
          topPages: finTop(daily.topPages, "pageLabel"),
          topSections: finTop(daily.topSections, "sectionLabel"),
          topActions: finTop(daily.topActions, "actionKey"),
          topTransitions: finTransitions(daily.topTransitions),
        },
        pageDocs,
        userDocs,
      };
    });
};
