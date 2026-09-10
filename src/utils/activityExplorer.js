import { formatDateKeyInTimeZone, toDate } from "./activityAnalytics";
import { addDaysToDateKey, enumerateDateKeys } from "./activityRollup";
import { isActivityOwnerUid } from "./activityOwner";
import { getNavigationMeta } from "./navigationMeta";

export const VISIT_GAP_MS = 30 * 60 * 1000;
const number = (value) => Math.max(0, Number(value) || 0);
export const timestampMs = (value) => toDate(value)?.getTime() || 0;

const ACTION_LABELS = {
  schedule_pdf_exported: "Opened the PDF print dialog",
  room_calendars_generated: "Generated room calendar files",
  import_applied: "Applied an import",
  import_multiple: "Imported records",
  room_reserved: "Saved a room reservation",
  room_reservation_cancelled: "Cancelled a room reservation",
  whats_new_opened: "Read What’s New",
  search_used: "Used search",
  tutorial_completed: "Completed a tutorial",
};

export const WORKFLOW_LABELS = {
  page_load: "Page loading",
  schedule_import: "Data import",
  pdf_export: "PDF print dialog",
  calendar_export: "Room calendar generation",
  reservation_save: "Reservation save",
  reservation_cancel: "Reservation cancellation",
  directory_save: "Directory save",
  schedule_save: "Schedule save",
};

export const actionLabel = (key = "") => {
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  const verbs = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    import: "Imported",
    merge: "Merged",
    bulk: "Changed",
    standardize: "Standardized",
  };
  const [verb, ...rest] = key.split(/[_-]+/);
  const words = rest.join(" ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return verbs[verb]
    ? `${verbs[verb]} ${words || "records"}`
    : key
        .replace(/[_-]+/g, " ")
        .replace(/^./, (letter) => letter.toUpperCase());
};

export const eventLabel = (event) => {
  if (event.eventType === "page_enter") return `Opened ${event.pageLabel}`;
  if (event.eventType === "error")
    return `${WORKFLOW_LABELS[event.metadata?.workflow] || "Task"} failed`;
  return actionLabel(event.actionKey || event.eventType);
};

export const isOwnerActivity = (row, ownerUid) =>
  Boolean((ownerUid && row.uid === ownerUid) || isActivityOwnerUid(row.uid));

export const getExplorerWindow = (range, previousVisit, now = new Date()) => {
  const endDateKey = formatDateKeyInTimeZone(now);
  const oldest = addDaysToDateKey(endDateKey, -89);
  const previousDateKey = timestampMs(previousVisit)
    ? formatDateKeyInTimeZone(toDate(previousVisit))
    : "";
  const since =
    range === "since" &&
    previousDateKey &&
    timestampMs(previousVisit) <= now.getTime();
  const startDateKey = since
    ? previousDateKey < oldest
      ? oldest
      : previousDateKey
    : addDaysToDateKey(
        endDateKey,
        -(Number(range) === 7 ? 6 : Number(range) === 90 ? 89 : 29),
      );
  return {
    startDateKey,
    endDateKey,
    since: Boolean(since),
    clipped: Boolean(since && previousDateKey < oldest),
    sinceMs:
      since && previousDateKey >= oldest ? timestampMs(previousVisit) : 0,
  };
};

const latest = (left, right) =>
  timestampMs(right) > timestampMs(left) ? right : left;
const addActions = (target, rows = []) =>
  rows.forEach(({ actionKey, count }) => {
    if (!actionKey || actionKey === "navigate" || actionKey.endsWith("_failed"))
      return;
    target.set(actionKey, (target.get(actionKey) || 0) + number(count));
  });
const actionRows = (map) =>
  [...map]
    .map(([actionKey, count]) => ({
      actionKey,
      count,
      label: actionLabel(actionKey),
    }))
    .sort((a, b) => b.count - a.count);
const entity = (id, label) => ({
  id,
  label,
  days: new Set(),
  people: new Set(),
  pages: new Set(),
  pageViews: 0,
  minutes: 0,
  actions: new Map(),
  lastSeenAt: null,
  lastDateKey: "",
  featureUsage: new Map(),
});
const addUsage = (target, row, source) => {
  target.days.add(row.dateKey);
  target.people.add(row.uid);
  target.pageViews += number(source.pageEnterCount);
  target.minutes += number(source.totalMinutesApprox);
  target.lastSeenAt = latest(target.lastSeenAt, row.lastSeenAt);
  if (row.dateKey > target.lastDateKey) target.lastDateKey = row.dateKey;
  addActions(target.actions, source.topActions);
};
const finish = (target) => ({
  ...target,
  activeDays: target.days.size,
  peopleCount: target.people.size,
  featureCount: target.pages.size,
  topActions: actionRows(target.actions),
});

// Use per-person daily summaries for every total. Excluding the owner or drilling
// into a feature must never leave unfiltered app-wide totals on the screen.
export const buildUsageModel = ({
  rows = [],
  events = [],
  startDateKey,
  endDateKey,
  ownerUid,
  excludeOwner = true,
  person = "",
  feature = "",
}) => {
  const eligible = rows.filter(
    (row) => row.uid && (!excludeOwner || !isOwnerActivity(row, ownerUid)),
  );
  const selected = eligible.filter(
    (row) =>
      row.dateKey >= startDateKey &&
      row.dateKey <= endDateKey &&
      (!person || row.uid === person),
  );
  const people = new Map();
  const features = new Map();
  const dayMap = new Map();
  const transitions = new Map();
  let detailMissing = false;
  const reportingPeople = new Set();
  for (const row of selected) {
    const pages = (row.topPagesDetailed || []).filter(
      (page) => !feature || page.pageId === feature,
    );
    if (feature && !pages.length) continue;
    const user = people.get(row.uid) || {
      ...entity(row.uid, row.displayName || row.email || "Unknown person"),
      email: row.email || "",
      role: row.role || "",
    };
    const day = dayMap.get(row.dateKey) || {
      dateKey: row.dateKey,
      people: new Set(),
      pageViews: 0,
      minutes: 0,
    };
    const source = feature ? pages[0] : row;
    addUsage(user, row, source);
    day.people.add(row.uid);
    day.pageViews += number(source.pageEnterCount);
    day.minutes += number(source.totalMinutesApprox);
    dayMap.set(row.dateKey, day);
    if (row.monitoringVersion >= 1) reportingPeople.add(row.uid);
    if (!row.topPagesDetailed?.length && number(row.pageEnterCount))
      detailMissing = true;
    pages.forEach((page) => {
      const meta = getNavigationMeta(page.pageId);
      const item = features.get(page.pageId) || {
        ...entity(page.pageId, page.pageLabel || meta.pageLabel),
        section: page.sectionLabel || meta.sectionLabel,
      };
      addUsage(item, row, page);
      // Page summaries only carry day precision for last use, not a page-specific timestamp.
      item.lastSeenAt = null;
      user.pages.add(page.pageId);
      const userPage = user.featureUsage.get(page.pageId) || {
        ...entity(page.pageId, item.label),
        section: item.section,
      };
      addUsage(userPage, row, page);
      user.featureUsage.set(page.pageId, userPage);
      features.set(page.pageId, item);
    });
    people.set(row.uid, user);
    (row.topTransitions || []).forEach((transition) => {
      if (
        feature &&
        transition.fromPageId !== feature &&
        transition.toPageId !== feature
      )
        return;
      const key = `${transition.fromPageId}:${transition.toPageId}`;
      const entry = transitions.get(key) || { ...transition, count: 0 };
      entry.count += number(transition.count);
      transitions.set(key, entry);
    });
  }
  const peopleRows = [...people.values()]
    .map(finish)
    .sort(
      (a, b) =>
        timestampMs(b.lastSeenAt) - timestampMs(a.lastSeenAt) ||
        b.lastDateKey.localeCompare(a.lastDateKey) ||
        a.label.localeCompare(b.label),
    );
  const featureRows = [...features.values()]
    .map(finish)
    .sort(
      (a, b) =>
        b.activeDays - a.activeDays ||
        b.peopleCount - a.peopleCount ||
        b.pageViews - a.pageViews,
    );
  const trendRows = enumerateDateKeys(startDateKey, endDateKey).map(
    (dateKey) => {
      const day = dayMap.get(dateKey);
      return {
        dateKey,
        label: dateKey.slice(5),
        uniqueUsers: day?.people.size || 0,
        pageEnterCount: day?.pageViews || 0,
        totalMinutesApprox: day?.minutes || 0,
        isPartial: dateKey === endDateKey,
      };
    },
  );
  const observations = [];
  const recurring =
    featureRows.find(
      (page) => page.activeDays > 1 && page.id !== "dashboard",
    ) || featureRows.find((page) => page.activeDays > 1);
  if (recurring)
    observations.push({
      id: "regular",
      title: `${recurring.label} was used on ${recurring.activeDays} days`,
      text: `Used by ${recurring.peopleCount} ${recurring.peopleCount === 1 ? "person" : "people"} on ${recurring.activeDays} days in this period.`,
      feature: recurring.id,
    });
  // Historical evidence is deliberately described as available history, never account creation.
  const priorPages = new Set(
    eligible
      .filter((row) => row.dateKey < startDateKey)
      .flatMap((row) =>
        (row.topPagesDetailed || []).map((page) => page.pageId),
      ),
  );
  if (eligible.some((row) => row.dateKey < startDateKey)) {
    const newlySeen = featureRows.find((page) => !priorPages.has(page.id));
    if (newlySeen)
      observations.push({
        id: "new-feature",
        title: `${newlySeen.label} appeared in this period`,
        text: "No use was recorded earlier in the available daily history.",
        feature: newlySeen.id,
      });
  }
  const paths = [...transitions.values()].sort((a, b) => b.count - a.count);
  if (paths[0]?.count > 1 && observations.length < 3) {
    const path = paths[0];
    observations.push({
      id: "path",
      title: `${path.fromPageLabel || getNavigationMeta(path.fromPageId).pageLabel} → ${path.toPageLabel || getNavigationMeta(path.toPageId).pageLabel}`,
      text: `This page-to-page step was recorded ${path.count} times in the period.`,
      feature: path.toPageId,
    });
  }
  return {
    people: peopleRows,
    features: featureRows,
    trendRows,
    observations,
    paths,
    failures: buildFailureGroups({
      rows: selected,
      events,
      startDateKey,
      endDateKey,
      ownerUid,
      excludeOwner,
      person,
      feature,
    }),
    reportingPeople: reportingPeople.size,
    detailMissing,
    activeDays: dayMap.size,
    pageViews: peopleRows.reduce((sum, row) => sum + row.pageViews, 0),
    minutes: peopleRows.reduce((sum, row) => sum + row.minutes, 0),
  };
};

// Timeline and summary writes are independent. Reconcile each person/day/issue
// bucket using the greater count, so either surviving write can surface a
// problem without counting the same report twice.
export const buildFailureGroups = ({
  rows,
  events,
  startDateKey,
  endDateKey,
  ownerUid,
  excludeOwner,
  person,
  feature,
}) => {
  const buckets = new Map();
  const add = (failure, uid, dateKey, source) => {
    if (
      (excludeOwner && isOwnerActivity({ uid }, ownerUid)) ||
      (person && uid !== person) ||
      (feature && failure.pageId !== feature) ||
      dateKey < startDateKey ||
      dateKey > endDateKey
    )
      return;
    const id = `${failure.pageId}:${failure.workflow}:${failure.errorCode}`;
    const key = `${uid}:${dateKey}:${id}`;
    const bucket = buckets.get(key) || {
      ...failure,
      id,
      uid,
      summaryCount: 0,
      eventCount: 0,
      lastSeenAt: null,
    };
    bucket[source] += number(failure.count);
    bucket.lastSeenAt = latest(bucket.lastSeenAt, failure.lastSeenAt);
    buckets.set(key, bucket);
  };
  rows.forEach((row) =>
    Object.values(row.failureCounts || {}).forEach((failure) =>
      add(failure, row.uid, row.dateKey, "summaryCount"),
    ),
  );
  normalizeEvents([
    ...new Map(events.map((event) => [event.id, event])).values(),
  ])
    .filter((event) => event.eventType === "error")
    .forEach((event) =>
      add(
        {
          pageId: event.pageId,
          workflow: event.metadata?.workflow || "task",
          errorCode: event.metadata?.errorCode || "unexpected",
          count: 1,
          lastSeenAt: event.timestamp,
        },
        event.uid,
        formatDateKeyInTimeZone(toDate(event.timestamp)),
        "eventCount",
      ),
    );
  const groups = new Map();
  buckets.forEach((bucket) => {
    const group = groups.get(bucket.id) || {
      ...bucket,
      count: 0,
      people: new Set(),
      lastSeenAt: null,
    };
    group.count += Math.max(bucket.summaryCount, bucket.eventCount);
    group.people.add(bucket.uid);
    group.lastSeenAt = latest(group.lastSeenAt, bucket.lastSeenAt);
    groups.set(bucket.id, group);
  });
  return [...groups.values()].sort(
    (a, b) => timestampMs(b.lastSeenAt) - timestampMs(a.lastSeenAt),
  );
};

export const normalizeEvents = (rows) =>
  rows
    .filter((row) => row.uid && timestampMs(row.timestamp))
    .map((row) => {
      const meta = getNavigationMeta(row.pageId);
      return {
        ...row,
        actorName: row.displayName || row.email || "Unknown person",
        pageLabel: row.pageLabel || meta.pageLabel,
        sectionLabel: row.sectionLabel || meta.sectionLabel,
        timestampMs: timestampMs(row.timestamp),
      };
    });

// A browser session can remain open for months. Visits are observed event
// sequences separated by 30 minutes, a session change, or a Central date boundary.
// Never describe the elapsed interval between events as active time.
export const buildVisits = (
  rows,
  {
    startDateKey,
    endDateKey,
    sinceMs = 0,
    ownerUid,
    excludeOwner = true,
    hasMore = false,
  } = {},
) => {
  const events = normalizeEvents(rows)
    .filter((row) => {
      const day = formatDateKeyInTimeZone(toDate(row.timestamp));
      return (
        (!excludeOwner || !isOwnerActivity(row, ownerUid)) &&
        (!startDateKey || day >= startDateKey) &&
        (!endDateKey || day <= endDateKey) &&
        row.timestampMs >= sinceMs &&
        row.eventType !== "duration"
      );
    })
    .sort(
      (a, b) =>
        a.timestampMs - b.timestampMs ||
        String(a.id).localeCompare(String(b.id)),
    );
  const lastByPerson = new Map();
  const visits = [];
  for (const event of events) {
    const day = formatDateKeyInTimeZone(toDate(event.timestamp));
    let visit = lastByPerson.get(event.uid);
    if (
      !visit ||
      event.timestampMs - visit.endMs > VISIT_GAP_MS ||
      visit.sessionId !== (event.sessionId || "") ||
      visit.dateKey !== day
    ) {
      visit = {
        id: event.id,
        uid: event.uid,
        actorName: event.actorName,
        sessionId: event.sessionId || "",
        dateKey: day,
        startMs: event.timestampMs,
        endMs: event.timestampMs,
        events: [],
        partial: hasMore && !lastByPerson.has(event.uid),
      };
      visits.push(visit);
    }
    visit.events.push(event);
    visit.endMs = event.timestampMs;
    lastByPerson.set(event.uid, visit);
  }
  return visits.reverse().sort((a, b) => b.endMs - a.endMs);
};

export const filterVisits = (
  visits,
  { person = "", feature = "", kind = "all", search = "", issue = "" } = {},
) => {
  const needle = search.trim().toLowerCase();
  return visits.filter(
    (visit) =>
      (!person || visit.uid === person) &&
      visit.events.some((event) => {
        if (feature && event.pageId !== feature) return false;
        if (
          kind === "actions" &&
          ["page_enter", "error"].includes(event.eventType)
        )
          return false;
        if (kind === "navigation" && event.eventType !== "page_enter")
          return false;
        if (kind === "errors" && event.eventType !== "error") return false;
        if (
          issue &&
          `${event.pageId}:${event.metadata?.workflow}:${event.metadata?.errorCode}` !==
            issue
        )
          return false;
        return (
          !needle ||
          `${event.actorName} ${event.pageLabel} ${event.sectionLabel} ${eventLabel(event)}`
            .toLowerCase()
            .includes(needle)
        );
      }),
  );
};

export const collapseVisitEvents = (events) =>
  events.reduce((groups, event) => {
    const previous = groups[groups.length - 1];
    if (
      previous &&
      previous.event.pageId === event.pageId &&
      eventLabel(previous.event) === eventLabel(event) &&
      event.timestampMs - previous.lastMs <= 5 * 60 * 1000
    ) {
      previous.count += 1;
      previous.lastMs = event.timestampMs;
    } else groups.push({ event, count: 1, lastMs: event.timestampMs });
    return groups;
  }, []);

export const mergeEventPages = (left, right) => [
  ...new Map([...left, ...right].map((event) => [event.id, event])).values(),
];
