import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  writeBatch,
  where,
} from "firebase/firestore";
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Flame,
  GraduationCap,
  MousePointerClick,
  RefreshCw,
  Shield,
  Users,
  X,
} from "lucide-react";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { TUTORIALS } from "../../contexts/TutorialContext";
import {
  ACTIVITY_RANGE_OPTIONS,
  buildActivityAnalyticsModel,
  buildUserDrilldownModel,
  formatDateKeyInTimeZone,
  getDateKeyDaysAgo,
  toDate,
} from "../../utils/activityAnalytics";
import { getNavigationMeta } from "../../utils/navigationMeta";
import activityRollup from "../../utils/activityRollup.cjs";

const LIVE_WINDOW_MINUTES = 2;
const IDLE_WINDOW_MINUTES = 10;
const LIVE_REFRESH_INTERVAL_MS = 60 * 1000;
const SUMMARY_LOOKBACK_DAYS = 90;
const SUMMARY_QUERY_PAGE_SIZE = 500;
const TIMELINE_LIMIT = 60;
const PRESENCE_LIMIT = 120;
const REBUILD_EVENT_PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 425;

const {
  addDaysToDateKey,
  getDateKeyUtcRange,
  rollupActivityForDateKeys,
} = activityRollup;

const mapQueryRows = (snapshot) =>
  snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

const buildRollupQuery = ({
  collectionName,
  startDateKey,
  endDateKey,
  lastDoc,
}) =>
  query(
    collection(db, collectionName),
    where("dateKey", ">=", startDateKey),
    where("dateKey", "<=", endDateKey),
    orderBy("dateKey", "asc"),
    ...(lastDoc ? [startAfter(lastDoc)] : []),
    limit(SUMMARY_QUERY_PAGE_SIZE),
  );

const buildPageRollupDocId = (pageDoc) =>
  `${pageDoc.dateKey}_${encodeURIComponent(pageDoc.pageId || "unknown")}`;

const fetchActivityEventsForRebuild = async (startDateKey, endDateKey) => {
  const { start } = getDateKeyUtcRange(startDateKey);
  const { start: endExclusive } = getDateKeyUtcRange(
    addDaysToDateKey(endDateKey, 1),
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
        limit(REBUILD_EVENT_PAGE_SIZE),
      ),
    );

    if (snapshot.empty) {
      hasMore = false;
      continue;
    }
    events.push(...mapQueryRows(snapshot));
    if (snapshot.size < REBUILD_EVENT_PAGE_SIZE) {
      hasMore = false;
      continue;
    }
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return events;
};

const deleteRollupDocsForRange = async (collectionName, startDateKey, endDateKey) => {
  const docsToDelete = await fetchPagedRows((lastDoc) =>
    buildRollupQuery({
      collectionName,
      startDateKey,
      endDateKey,
      lastDoc,
    }),
  );
  for (let index = 0; index < docsToDelete.length; index += WRITE_BATCH_SIZE) {
    const batch = writeBatch(db);
    docsToDelete.slice(index, index + WRITE_BATCH_SIZE).forEach((row) => {
      batch.delete(doc(db, collectionName, row.id));
    });
    await batch.commit();
  }
  return docsToDelete.length;
};

const commitRollupWrites = async (writes) => {
  for (let index = 0; index < writes.length; index += WRITE_BATCH_SIZE) {
    const batch = writeBatch(db);
    writes.slice(index, index + WRITE_BATCH_SIZE).forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: false });
    });
    await batch.commit();
  }
};

const rebuildActivityRollupsInBrowser = async (startDateKey, endDateKey) => {
  const dateKeys = [];
  let cursor = startDateKey;
  while (cursor <= endDateKey) {
    dateKeys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }

  const events = await fetchActivityEventsForRebuild(startDateKey, endDateKey);
  const summaries = rollupActivityForDateKeys(events, dateKeys);
  const deletedRollupDocCount = (
    await Promise.all(
      [
        "userActivityAnalyticsDaily",
        "userActivityPageDaily",
        "userActivityDaily",
      ].map((collectionName) =>
        deleteRollupDocsForRange(collectionName, startDateKey, endDateKey),
      ),
    )
  ).reduce((total, count) => total + count, 0);

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

  await commitRollupWrites(writes);

  return {
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

const fetchPagedRows = async (buildQuery) => {
  const rows = [];
  let lastDoc = null;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await getDocs(buildQuery(lastDoc));
    const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
    rows.push(
      ...docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );

    if (docs.length < SUMMARY_QUERY_PAGE_SIZE) {
      hasMore = false;
      continue;
    }

    lastDoc = docs[docs.length - 1];
  }

  return rows;
};

const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "Unknown time";
  return date.toLocaleString();
};

const formatTimeAgo = (value) => {
  const date = toDate(value);
  if (!date) return "unknown";

  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60)),
  );

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};

const formatMinutes = (value) => {
  const minutes = Math.round(value || 0);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (remainder === 0) return `${hours}h`;
    return `${hours}h ${remainder}m`;
  }
  return `${minutes}m`;
};

const formatHourLabel = (hour, { compact = false } = {}) => {
  const normalizedHour = ((Number(hour) % 24) + 24) % 24;
  const meridiem = normalizedHour < 12 ? "AM" : "PM";
  const displayHour = normalizedHour % 12 || 12;
  return compact ? `${displayHour} ${meridiem}` : `${displayHour}:00 ${meridiem}`;
};

const formatActivityLoadError = (error) => {
  const message = String(error?.message || "").trim();
  if (
    error?.code === "permission-denied" ||
    /missing or insufficient permissions/i.test(message)
  ) {
    return "Activity rollups are blocked by Firestore rules. Deploy the latest Firestore rules and indexes, then refresh.";
  }
  return message || "Could not load activity analytics right now.";
};

const formatActivityRebuildError = (error) => {
  const message = String(error?.message || "").trim();
  // Rebuilds run entirely in the browser (no Cloud Function on the free tier),
  // so the only real failures are Firestore rule denials or a quota wall.
  if (
    error?.code === "permission-denied" ||
    /missing or insufficient permissions/i.test(message)
  ) {
    return "Rebuilding is blocked by Firestore rules. Confirm you are signed in as the activity owner and that the latest rules are deployed.";
  }
  if (
    error?.code === "resource-exhausted" ||
    /quota|resource-exhausted/i.test(message)
  ) {
    return "Firestore's free-tier quota was exhausted mid-rebuild. Wait for the daily reset, then rebuild a shorter range.";
  }
  return message || "Could not rebuild activity analytics right now.";
};

const getActivityStatus = (lastActiveAt) => {
  const lastActiveDate = toDate(lastActiveAt);
  if (!lastActiveDate) {
    return {
      label: "Unknown",
      color: "text-slate-500",
      badge: "bg-slate-100 text-slate-600",
      rank: 3,
    };
  }

  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - lastActiveDate.getTime()) / (1000 * 60)),
  );

  if (diffMinutes <= LIVE_WINDOW_MINUTES) {
    return {
      label: "Active now",
      color: "text-emerald-600",
      badge: "bg-emerald-100 text-emerald-700",
      rank: 0,
    };
  }
  if (diffMinutes <= IDLE_WINDOW_MINUTES) {
    return {
      label: "Idle",
      color: "text-amber-600",
      badge: "bg-amber-100 text-amber-700",
      rank: 1,
    };
  }
  return {
    label: "Away",
    color: "text-slate-600",
    badge: "bg-slate-100 text-slate-700",
    rank: 2,
  };
};

const deriveTimelineDwellMinutes = (events) => {
  const groupedBySession = new Map();
  const dwellByEventId = new Map();

  events.forEach((event) => {
    const timestampDate = toDate(event.timestamp);
    if (!timestampDate || event.eventType !== "page_enter") return;
    const sessionKey = `${event.uid || "unknown"}:${event.sessionId || "default"}`;
    const existing = groupedBySession.get(sessionKey) || [];
    existing.push({ ...event, timestampDate });
    groupedBySession.set(sessionKey, existing);
  });

  groupedBySession.forEach((sessionEvents) => {
    const ordered = sessionEvents.sort(
      (left, right) => left.timestampDate.getTime() - right.timestampDate.getTime(),
    );

    ordered.forEach((event, index) => {
      const next = ordered[index + 1];
      let minutes = 1;
      if (next) {
        const rawDiffMinutes = Math.round(
          (next.timestampDate.getTime() - event.timestampDate.getTime()) /
            (1000 * 60),
        );
        if (Number.isFinite(rawDiffMinutes) && rawDiffMinutes > 0) {
          minutes = Math.max(1, Math.min(30, rawDiffMinutes));
        }
      }
      dwellByEventId.set(event.id, minutes);
    });
  });

  return dwellByEventId;
};

const MetricCard = ({ label, value, hint, accentClass, icon: Icon }) => (
  <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div
      className={`pointer-events-none absolute inset-y-4 left-0 w-1.5 rounded-r-full ${accentClass}`}
    />
    <div className="flex items-start justify-between gap-4 pl-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {label}
        </p>
        <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
          {value}
        </p>
        <p className="mt-2 text-sm text-slate-600">{hint}</p>
      </div>
      <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

const SectionShell = ({ eyebrow, title, description, children, action }) => (
  <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 bg-stone-50 px-5 py-5 md:px-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-800">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </div>
    <div className="px-5 py-5 md:px-7 md:py-6">{children}</div>
  </section>
);

const RangeSelector = ({ value, onChange }) => (
  <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-300 bg-white p-1">
    {ACTIVITY_RANGE_OPTIONS.map((option) => {
      const selected = value === option;
      return (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition ${
            selected
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-stone-100"
          }`}
        >
          Last {option} days
        </button>
      );
    })}
  </div>
);

const SimpleLineChart = ({ rows, dataKey, stroke, formatter = (value) => value }) => {
  if (!rows.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        No summary data for this range yet.
      </div>
    );
  }

  const width = 760;
  const height = 240;
  const padding = { top: 22, right: 18, bottom: 34, left: 18 };
  const values = rows.map((row) => Number(row[dataKey] || 0));
  const maxValue = Math.max(...values, 1);
  const minX = 0;
  const maxX = Math.max(rows.length - 1, 1);
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;

  const xScale = (index) =>
    padding.left + ((index - minX) / (maxX - minX || 1)) * usableWidth;
  const yScale = (value) =>
    padding.top + usableHeight - (value / maxValue) * usableHeight;

  const path = rows
    .map((row, index) => {
      const x = xScale(index);
      const y = yScale(Number(row[dataKey] || 0));
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Trend
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {rows.some((row) => row.isPartial) ? "Today is still in progress." : "Completed daily rollups."}
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-stone-50 px-3 py-1 text-xs text-slate-600">
          Peak {formatter(maxValue)}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const value = maxValue * step;
          const y = yScale(value);
          return (
            <g key={step}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="rgba(148,163,184,0.28)"
                strokeDasharray="4 6"
              />
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {rows.map((row, index) => {
          const x = xScale(index);
          const y = yScale(Number(row[dataKey] || 0));
          const showLabel =
            index === 0 ||
            index === rows.length - 1 ||
            index % Math.max(1, Math.ceil(rows.length / 6)) === 0;
          return (
            <g key={row.dateKey}>
              <circle cx={x} cy={y} r="4.5" fill={row.isPartial ? "#f59e0b" : stroke} />
              {showLabel ? (
                <text
                  x={x}
                  y={height - 10}
                  fill="rgba(51,65,85,0.86)"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {row.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const HourHeatmap = ({ rows }) => {
  const maxValue = Math.max(...rows.map((row) => row.totalMinutesApprox || 0), 1);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Hour-of-day intensity</p>
          <p className="text-sm text-slate-600">
            Minutes are assigned to the hour where a page visit started.
          </p>
        </div>
        <div className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-slate-600">
          Local time
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map((row) => {
          const intensity = (row.totalMinutesApprox || 0) / maxValue;
          const textClass = intensity > 0.58 ? "text-white" : "text-slate-800";
          const cardStyle = {
            backgroundColor:
              intensity > 0
                ? `rgba(15, 23, 42, ${0.08 + intensity * 0.72})`
                : "rgb(248 250 252)",
            borderColor:
              intensity > 0.2 ? "rgba(15, 23, 42, 0.14)" : "rgba(226, 232, 240, 1)",
          };
          return (
            <div
              key={row.hour}
              className={`rounded-2xl border p-4 shadow-sm transition-colors ${textClass}`}
              style={cardStyle}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-80">
                  {formatHourLabel(row.hour, { compact: true })}
                </p>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      intensity > 0
                        ? "rgba(255,255,255,0.88)"
                        : "rgba(100,116,139,0.4)",
                  }}
                />
              </div>
              <p className="mt-5 text-3xl font-black tracking-tight">
                {formatMinutes(row.totalMinutesApprox)}
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-white/90"
                  style={{ width: `${Math.max(intensity * 100, intensity > 0 ? 14 : 0)}%` }}
                />
              </div>
              <p className="mt-3 text-xs opacity-85">
                {row.pageEnterCount || 0} opens
                {row.semanticEventCount ? ` • ${row.semanticEventCount} actions` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RankedBars = ({
  title,
  subtitle,
  rows,
  labelKey,
  valueKey = "totalMinutesApprox",
  valueFormatter = formatMinutes,
}) => {
  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        {title}: no data yet.
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-600">
          {subtitle}
        </p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const value = Number(row[valueKey] || 0);
          return (
            <div key={`${row[labelKey]}-${row.pageId || row.actionKey || ""}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-slate-800">
                  {row[labelKey]}
                </span>
                <span className="text-slate-500">{valueFormatter(value)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900"
                  style={{ width: `${Math.max(8, (value / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SortHeader = ({ label, active, direction, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex min-h-[44px] items-center gap-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] ${
      active ? "text-slate-900" : "text-slate-500"
    }`}
  >
    <span>{label}</span>
    <span className="text-[10px]">{active ? (direction === "asc" ? "▲" : "▼") : ""}</span>
  </button>
);

const UserDrilldownDrawer = ({
  user,
  detailModel,
  loading,
  rangeDays,
  onClose,
}) => {
  if (!user) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/35 backdrop-blur-sm">
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                User Drilldown
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                {user.displayName}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {user.email} • last {rangeDays} days
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close user drilldown"
              className="min-h-[44px] rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Loading user history...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard
                  label="Time in App"
                  value={formatMinutes(detailModel.summary.totalMinutesApprox)}
                  hint={`${detailModel.summary.sessionCount || 0} sessions in range`}
                  accentClass="bg-emerald-600"
                  icon={Clock3}
                />
                <MetricCard
                  label="Active Days"
                  value={detailModel.summary.activeDays || 0}
                  hint={`${detailModel.summary.pagesVisitedCount || 0} pages visited`}
                  accentClass="bg-sky-600"
                  icon={Users}
                />
              </div>

              <SimpleLineChart
                rows={detailModel.trendRows}
                dataKey="totalMinutesApprox"
                stroke="#14b8a6"
                formatter={formatMinutes}
              />

              <HourHeatmap rows={detailModel.heatmapRows} />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <RankedBars
                  title="Top Pages"
                  subtitle="Where this user spends the most time."
                  rows={detailModel.topPages}
                  labelKey="pageLabel"
                />
                <RankedBars
                  title="Top Actions"
                  subtitle="Curated semantic actions that have been instrumented."
                  rows={detailModel.topActions}
                  labelKey="actionKey"
                  valueKey="count"
                  valueFormatter={(value) => `${value}`}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const TUTORIAL_LIST = Object.values(TUTORIALS).map((tutorial) => ({
  id: tutorial.id,
  title: tutorial.title,
  category: tutorial.category,
  totalSteps: tutorial.steps.length,
}));

const buildTutorialCompletionModel = (rows) => {
  const users = rows
    .map((row) => {
      const tutorials = row.tutorials || {};
      const byId = {};
      let completedCount = 0;
      let inProgressCount = 0;

      TUTORIAL_LIST.forEach((tutorial) => {
        const entry = tutorials[tutorial.id];
        let status = "not_started";
        if (entry?.status === "completed") {
          status = "completed";
          completedCount += 1;
        } else if (entry?.status === "started") {
          status = "started";
          inProgressCount += 1;
        }
        byId[tutorial.id] = {
          status,
          currentStepIndex: entry?.currentStepIndex ?? 0,
          totalSteps: entry?.totalSteps || tutorial.totalSteps,
        };
      });

      return {
        uid: row.uid || row.id,
        displayName: row.displayName || row.email || row.uid || row.id,
        email: row.email || "",
        role: row.role || "unknown",
        completedCount,
        inProgressCount,
        byId,
      };
    })
    .sort(
      (left, right) =>
        right.completedCount - left.completedCount ||
        left.displayName.localeCompare(right.displayName),
    );

  const perTutorial = TUTORIAL_LIST.map((tutorial) => {
    let completed = 0;
    let started = 0;
    users.forEach((user) => {
      const status = user.byId[tutorial.id]?.status;
      if (status === "completed") completed += 1;
      else if (status === "started") started += 1;
    });
    return { ...tutorial, completed, started };
  });

  return {
    users,
    perTutorial,
    totalCompletions: users.reduce((sum, user) => sum + user.completedCount, 0),
    usersWithActivity: users.length,
    usersFullyComplete: users.filter(
      (user) => user.completedCount === TUTORIAL_LIST.length,
    ).length,
  };
};

const TutorialStatusCell = ({ cell }) => {
  if (cell?.status === "completed") {
    return (
      <span className="inline-flex items-center justify-center text-emerald-600">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }
  if (cell?.status === "started") {
    const total = cell.totalSteps || 0;
    const current = Math.min((cell.currentStepIndex || 0) + 1, total || 1);
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        {current}/{total}
      </span>
    );
  }
  return <span className="text-slate-300">–</span>;
};

const TutorialCompletionSection = ({ loading, model }) => {
  const metrics = [
    {
      label: "Tutorials",
      value: TUTORIAL_LIST.length,
      hint: "Available step-by-step tutorials",
      accentClass: "bg-sky-600",
      icon: GraduationCap,
    },
    {
      label: "Total Completions",
      value: model.totalCompletions,
      hint: `${model.usersFullyComplete} user${
        model.usersFullyComplete === 1 ? "" : "s"
      } finished every tutorial`,
      accentClass: "bg-emerald-600",
      icon: CheckCircle2,
    },
    {
      label: "Users With Progress",
      value: model.usersWithActivity,
      hint: "Started or completed at least one tutorial",
      accentClass: "bg-violet-600",
      icon: Users,
    },
  ];

  return (
    <SectionShell
      eyebrow="Onboarding"
      title="Tutorial completion"
      description="Who has completed, started, or not yet opened each tutorial. A check means completed; an amber count shows the furthest step reached on an in-progress tutorial."
    >
      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Loading tutorial progress...
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>

          {model.users.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              No tutorial activity recorded yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        User
                      </th>
                      {model.perTutorial.map((tutorial) => (
                        <th
                          key={tutorial.id}
                          className="px-3 py-3 text-center align-bottom"
                          title={`${tutorial.title}: ${tutorial.completed} completed, ${tutorial.started} in progress`}
                        >
                          <div className="mx-auto max-w-[7rem] text-xs font-semibold text-slate-700">
                            {tutorial.title}
                          </div>
                          <div className="mt-1 text-[11px] font-medium text-slate-400">
                            {tutorial.completed}✓
                            {tutorial.started ? ` · ${tutorial.started}…` : ""}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.users.map((user) => (
                      <tr
                        key={user.uid}
                        className="border-b border-slate-100 transition hover:bg-slate-50"
                      >
                        <td className="sticky left-0 z-10 bg-white px-4 py-3 align-top">
                          <p className="font-semibold text-slate-900">
                            {user.displayName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {user.completedCount}/{TUTORIAL_LIST.length} done
                            {user.inProgressCount
                              ? ` · ${user.inProgressCount} in progress`
                              : ""}
                          </p>
                        </td>
                        {model.perTutorial.map((tutorial) => (
                          <td
                            key={tutorial.id}
                            className="px-3 py-3 text-center align-middle"
                          >
                            <TutorialStatusCell cell={user.byId[tutorial.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
};

const UserActivityPage = () => {
  const { isActivityOwner } = useAuth();
  const [rangeDays, setRangeDays] = useState(30);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [rebuildMessage, setRebuildMessage] = useState("");
  const [analyticsRows, setAnalyticsRows] = useState([]);
  const [pageDailyRows, setPageDailyRows] = useState([]);
  const [userDailyRows, setUserDailyRows] = useState([]);
  const [presenceRows, setPresenceRows] = useState([]);
  const [eventRows, setEventRows] = useState([]);
  const [tutorialProgressRows, setTutorialProgressRows] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userDetailRows, setUserDetailRows] = useState([]);
  const [userSort, setUserSort] = useState({
    key: "totalMinutesApprox",
    direction: "desc",
  });

  const loadSummaryData = useCallback(async () => {
    if (!isActivityOwner) return;

    const now = new Date();
    const startDateKey = getDateKeyDaysAgo(SUMMARY_LOOKBACK_DAYS - 1, now);
    const endDateKey = formatDateKeyInTimeZone(now);
    const [analyticsData, pageData, userData] = await Promise.all([
      fetchPagedRows((lastDoc) =>
        buildRollupQuery({
          collectionName: "userActivityAnalyticsDaily",
          startDateKey,
          endDateKey,
          lastDoc,
        }),
      ),
      fetchPagedRows((lastDoc) =>
        buildRollupQuery({
          collectionName: "userActivityPageDaily",
          startDateKey,
          endDateKey,
          lastDoc,
        }),
      ),
      fetchPagedRows((lastDoc) =>
        buildRollupQuery({
          collectionName: "userActivityDaily",
          startDateKey,
          endDateKey,
          lastDoc,
        }),
      ),
    ]);

    setAnalyticsRows(analyticsData);
    setPageDailyRows(pageData);
    setUserDailyRows(userData);
  }, [isActivityOwner]);

  const loadLiveData = useCallback(async () => {
    if (!isActivityOwner) return;

    const [presenceSnap, eventsSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "userPresence"),
          orderBy("updatedAt", "desc"),
          limit(PRESENCE_LIMIT),
        ),
      ),
      getDocs(
        query(
          collection(db, "userActivityEvents"),
          orderBy("timestamp", "desc"),
          limit(TIMELINE_LIMIT),
        ),
      ),
    ]);

    setPresenceRows(
      mapQueryRows(presenceSnap),
    );
    setEventRows(
      mapQueryRows(eventsSnap),
    );
  }, [isActivityOwner]);

  const loadTutorialProgress = useCallback(async () => {
    if (!isActivityOwner) return;

    const snapshot = await getDocs(collection(db, "tutorialProgress"));
    setTutorialProgressRows(mapQueryRows(snapshot));
  }, [isActivityOwner]);

  const refreshAll = useCallback(
    async ({ silent = false } = {}) => {
      if (!isActivityOwner) return;

      if (silent) {
        setRefreshing(true);
      } else {
        setSummaryLoading(true);
        setLiveLoading(true);
      }

      try {
        setErrorMessage("");
        await Promise.all([
          loadSummaryData(),
          loadLiveData(),
          loadTutorialProgress(),
        ]);
      } catch (error) {
        console.error("Failed to load user activity analytics:", error);
        setErrorMessage(formatActivityLoadError(error));
      } finally {
        setSummaryLoading(false);
        setLiveLoading(false);
        setRefreshing(false);
      }
    },
    [isActivityOwner, loadLiveData, loadSummaryData, loadTutorialProgress],
  );

  const rebuildSelectedRange = useCallback(async () => {
    if (!isActivityOwner || rebuilding) return;

    const now = new Date();
    const startDateKey = getDateKeyDaysAgo(rangeDays - 1, now);
    const endDateKey = formatDateKeyInTimeZone(now);

    setRebuilding(true);
    setErrorMessage("");
    setRebuildMessage("");

    try {
      const data = await rebuildActivityRollupsInBrowser(startDateKey, endDateKey);
      setRebuildMessage(
        `Rebuilt ${data.analyticsDocCount || 0} daily summaries, ${
          data.userDocCount || 0
        } user summaries, and ${data.pageDocCount || 0} page summaries from ${
          data.eventCount || 0
        } raw events.`,
      );
      await refreshAll({ silent: true });
    } catch (error) {
      console.error("Failed to rebuild user activity analytics:", error);
      setErrorMessage(formatActivityRebuildError(error));
    } finally {
      setRebuilding(false);
    }
  }, [isActivityOwner, rangeDays, refreshAll, rebuilding]);

  useEffect(() => {
    if (!isActivityOwner) return;
    void refreshAll();
  }, [isActivityOwner, refreshAll]);

  useEffect(() => {
    if (!isActivityOwner) return;
    if (typeof document === "undefined") return;

    // Only poll while the tab is visible — an idle console left open would
    // otherwise burn ~10k reads/hour against the free-tier daily quota.
    const refreshLive = () => {
      if (document.visibilityState !== "visible") return;
      void loadLiveData().catch((error) => {
        console.error("Failed to refresh live activity:", error);
      });
    };

    const intervalId = setInterval(refreshLive, LIVE_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshLive);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshLive);
    };
  }, [isActivityOwner, loadLiveData]);

  useEffect(() => {
    if (!selectedUser?.uid || !isActivityOwner) {
      setUserDetailRows([]);
      setUserDetailLoading(false);
      return;
    }

    // Use the already-loaded userDailyRows instead of querying a rollup collection
    setUserDetailLoading(true);
    const filtered = userDailyRows.filter((row) => row.uid === selectedUser.uid);
    setUserDetailRows(filtered);
    setUserDetailLoading(false);
  }, [isActivityOwner, rangeDays, selectedUser?.uid, userDailyRows]);

  const analyticsModel = useMemo(
    () =>
      buildActivityAnalyticsModel({
        appDailyRows: analyticsRows,
        pageDailyRows,
        userDailyRows,
        rangeDays,
      }),
    [analyticsRows, pageDailyRows, rangeDays, userDailyRows],
  );

  const userDetailModel = useMemo(
    () => buildUserDrilldownModel({ rows: userDetailRows, rangeDays }),
    [rangeDays, userDetailRows],
  );

  const tutorialCompletionModel = useMemo(
    () => buildTutorialCompletionModel(tutorialProgressRows),
    [tutorialProgressRows],
  );

  const liveUsers = useMemo(() => {
    return presenceRows
      .map((presence) => {
        const pageMeta = getNavigationMeta(presence.currentPageId);
        const lastActiveAt = presence.updatedAt || presence.enteredAt;
        const status = getActivityStatus(lastActiveAt);

        return {
          ...presence,
          displayName:
            presence.displayName || presence.email || presence.uid || "Unknown User",
          email: presence.email || "Unknown email",
          pageLabel: presence.currentPageLabel || pageMeta.pageLabel,
          sectionLabel: presence.currentSectionLabel || pageMeta.sectionLabel,
          lastActiveAt,
          status,
        };
      })
      .sort((left, right) => {
        const byStatus = left.status.rank - right.status.rank;
        if (byStatus !== 0) return byStatus;
        return (left.email || "").localeCompare(right.email || "");
      });
  }, [presenceRows]);

  const timelineRows = useMemo(() => {
    const dwellByEventId = deriveTimelineDwellMinutes(eventRows);

    return eventRows.map((event) => {
      const pageMeta = getNavigationMeta(event.pageId);
      return {
        ...event,
        actorName: event.displayName || event.email || event.uid || "Unknown User",
        pageLabel: event.pageLabel || pageMeta.pageLabel,
        sectionLabel: event.sectionLabel || pageMeta.sectionLabel,
        approxMinutes: dwellByEventId.get(event.id) || 1,
      };
    });
  }, [eventRows]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Active Users",
        value: liveUsers.filter((user) => user.status.label === "Active now").length,
        hint: `${analyticsModel.overview.uniqueUsers} distinct users in range`,
        icon: Users,
        accentClass: "bg-emerald-600",
      },
      {
        label: "Time in App",
        value: formatMinutes(analyticsModel.overview.totalMinutesApprox),
        hint: `${analyticsModel.overview.sessionCount} sessions reconstructed from page enters`,
        icon: Clock3,
        accentClass: "bg-sky-600",
      },
      {
        label: "Page Views",
        value: analyticsModel.overview.pageEnterCount,
        hint: `${analyticsModel.overview.avgPagesPerUser} pages per user on average`,
        icon: Activity,
        accentClass: "bg-indigo-600",
      },
      {
        label: "Curated Actions",
        value: analyticsModel.overview.semanticEventCount,
        hint: "Semantic events such as import, save, or search",
        icon: MousePointerClick,
        accentClass: "bg-amber-500",
      },
    ],
    [analyticsModel.overview, liveUsers],
  );

  const sortedUsers = useMemo(() => {
    const rows = [...analyticsModel.aggregatedUsers];
    rows.sort((left, right) => {
      const leftValue = left[userSort.key] ?? 0;
      const rightValue = right[userSort.key] ?? 0;
      if (typeof leftValue === "string" || typeof rightValue === "string") {
        const result = String(leftValue).localeCompare(String(rightValue));
        return userSort.direction === "asc" ? result : -result;
      }
      const result = Number(leftValue) - Number(rightValue);
      return userSort.direction === "asc" ? result : -result;
    });
    return rows;
  }, [analyticsModel.aggregatedUsers, userSort.direction, userSort.key]);

  const updateSort = (key) => {
    setUserSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  // Freshness: the newest generatedAt across loaded daily rollups tells the owner
  // how stale the summaries are (rollups are rebuilt on demand on the free tier).
  const lastRebuiltAt = useMemo(() => {
    let latest = null;
    analyticsRows.forEach((row) => {
      const generatedDate = toDate(row.generatedAt);
      if (generatedDate && (!latest || generatedDate > latest)) {
        latest = generatedDate;
      }
    });
    return latest;
  }, [analyticsRows]);

  const exportUsersCsv = useCallback(() => {
    if (!sortedUsers.length) return;

    const header = [
      "Name",
      "Email",
      "Role",
      "Total Minutes",
      "Sessions",
      "Avg Min/Session",
      "Pages Visited",
      "Active Days",
      "Avg Pages/Day",
    ];
    const escapeCell = (value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [header.join(",")];
    sortedUsers.forEach((user) => {
      lines.push(
        [
          user.displayName,
          user.email,
          user.role || "unknown",
          user.totalMinutesApprox || 0,
          user.sessionCount || 0,
          user.avgMinutesPerSession || 0,
          user.pagesVisitedCount || 0,
          user.activeDays || 0,
          user.avgPagesPerDay || 0,
        ]
          .map(escapeCell)
          .join(","),
      );
    });

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `user-activity-${rangeDays}d-${formatDateKeyInTimeZone(
      new Date(),
    )}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [rangeDays, sortedUsers]);

  if (!isActivityOwner) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-700">
        This page is only available to the configured activity owner account.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[#f6f2ea] px-5 py-6 text-slate-900 shadow-sm md:px-7 md:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-800">
                Owner Analytics Console
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
                User Activity Intelligence
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Daily rollups are rebuilt on demand from raw events to stay within
                the free Firestore tier — click <strong>Rebuild rollups</strong> to
                refresh the summaries for the selected range. Live presence and the
                timeline refresh automatically every minute while this tab is open.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <RangeSelector value={rangeDays} onChange={setRangeDays} />
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => void rebuildSelectedRange()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={rebuilding}
                >
                  <RefreshCw className={`h-4 w-4 ${rebuilding ? "animate-spin" : ""}`} />
                  <span>{rebuilding ? "Rebuilding..." : "Rebuild rollups"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void refreshAll({ silent: true })}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  <span>{refreshing ? "Refreshing..." : "Refresh analytics"}</span>
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {lastRebuiltAt
                  ? `Rollups updated ${formatTimeAgo(lastRebuiltAt)}`
                  : "Rollups not built yet. Click Rebuild rollups."}
              </p>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {rebuildMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {rebuildMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>

        <SectionShell
          eyebrow="Overview"
          title="Usage volume and timing"
          description="Daily rollups power these charts. They show how much the app was used, when that use happened, and which destinations absorbed the most attention."
        >
          {summaryLoading ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Loading rollup summaries...
            </div>
          ) : (
            <div className="space-y-5">
              <SimpleLineChart
                rows={analyticsModel.trendRows}
                dataKey="totalMinutesApprox"
                stroke="#14b8a6"
                formatter={formatMinutes}
              />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <HourHeatmap rows={analyticsModel.heatmapRows} />
                <div className="grid grid-cols-1 gap-4">
                  <RankedBars
                    title="Top Pages"
                    subtitle="Pages with the most time spent in the selected range."
                    rows={analyticsModel.topPages}
                    labelKey="pageLabel"
                  />
                  <RankedBars
                    title="Top Sections"
                    subtitle="Sections generating the most sustained usage."
                    rows={analyticsModel.topSections}
                    labelKey="sectionLabel"
                  />
                </div>
              </div>
            </div>
          )}
        </SectionShell>

        <SectionShell
          eyebrow="Patterns"
          title="Habits, tendencies, and navigation signals"
          description="These summaries surface whether people come back, where activity concentrates, and which paths through the app repeat most often."
        >
          {summaryLoading ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Loading pattern summaries...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard
                  label="Repeat Users"
                  value={analyticsModel.patterns.repeatUsers}
                  hint={`${analyticsModel.patterns.oneTimeUsers} one-time users in the same range`}
                  accentClass="bg-violet-600"
                  icon={Users}
                />
                <MetricCard
                  label="Avg Session"
                  value={formatMinutes(analyticsModel.overview.avgSessionMinutes)}
                  hint={
                    analyticsModel.patterns.busiestHour
                      ? `Busiest hour ${formatHourLabel(
                          analyticsModel.patterns.busiestHour.hour,
                          { compact: true },
                        )}`
                      : "No hour trend yet"
                  }
                  accentClass="bg-amber-500"
                  icon={Flame}
                />
                <MetricCard
                  label="Strongest Action"
                  value={
                    analyticsModel.patterns.topActions[0]?.actionKey || "None"
                  }
                  hint={`${
                    analyticsModel.patterns.topActions[0]?.count || 0
                  } occurrences`}
                  accentClass="bg-sky-600"
                  icon={MousePointerClick}
                />
                <MetricCard
                  label="Top Transition"
                  value={
                    analyticsModel.patterns.topTransitions[0]?.toPageLabel || "None"
                  }
                  hint={
                    analyticsModel.patterns.topTransitions[0]
                      ? `${analyticsModel.patterns.topTransitions[0].fromPageLabel} -> ${analyticsModel.patterns.topTransitions[0].toPageLabel}`
                      : "No page-path data yet"
                  }
                  accentClass="bg-emerald-600"
                  icon={ArrowRightLeft}
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <RankedBars
                  title="Top Actions"
                  subtitle="Curated activity actions, not generic click noise."
                  rows={analyticsModel.patterns.topActions}
                  labelKey="actionKey"
                  valueKey="count"
                  valueFormatter={(value) => `${value}`}
                />
                <RankedBars
                  title="Common Transitions"
                  subtitle="Most repeated page-to-page flows across sessions."
                  rows={analyticsModel.patterns.topTransitions.map((row) => ({
                    ...row,
                    label: `${row.fromPageLabel} -> ${row.toPageLabel}`,
                  }))}
                  labelKey="label"
                  valueKey="count"
                  valueFormatter={(value) => `${value}`}
                />
              </div>
            </div>
          )}
        </SectionShell>

        <SectionShell
          eyebrow="Users"
          title="Who uses the app and how"
          description="This table aggregates daily per-user summaries for the selected range. Open a user to inspect their day-by-day pattern, top pages, and activity heatmap."
          action={
            <button
              type="button"
              onClick={exportUsersCsv}
              disabled={summaryLoading || sortedUsers.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
          }
        >
          {summaryLoading ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Loading user summaries...
            </div>
          ) : sortedUsers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              No rolled-up user summaries exist yet for the selected range. Click{" "}
              <strong>Rebuild rollups</strong> above to generate them from raw
              events.
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="px-4">
                        <SortHeader
                          label="User"
                          active={userSort.key === "displayName"}
                          direction={userSort.direction}
                          onClick={() => updateSort("displayName")}
                        />
                      </th>
                      <th className="px-4">
                        <SortHeader
                          label="Time"
                          active={userSort.key === "totalMinutesApprox"}
                          direction={userSort.direction}
                          onClick={() => updateSort("totalMinutesApprox")}
                        />
                      </th>
                      <th className="px-4">
                        <SortHeader
                          label="Sessions"
                          active={userSort.key === "sessionCount"}
                          direction={userSort.direction}
                          onClick={() => updateSort("sessionCount")}
                        />
                      </th>
                      <th className="px-4">
                        <SortHeader
                          label="Pages"
                          active={userSort.key === "pagesVisitedCount"}
                          direction={userSort.direction}
                          onClick={() => updateSort("pagesVisitedCount")}
                        />
                      </th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Signature Pages
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map((user) => (
                      <tr
                        key={user.uid}
                        className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                        onClick={() => setSelectedUser(user)}
                      >
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-slate-900">{user.displayName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {user.email} • {user.role || "unknown"}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          <p className="font-medium">{formatMinutes(user.totalMinutesApprox)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {user.avgMinutesPerSession}m avg/session
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          <p className="font-medium">{user.sessionCount}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {user.activeDays} active day{user.activeDays === 1 ? "" : "s"}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          <p className="font-medium">{user.pagesVisitedCount}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {user.avgPagesPerDay} avg/day
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          {(user.topPagesDetailed || []).length === 0 ? (
                            <span className="text-slate-400">No dominant pages yet</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {user.topPagesDetailed.map((page) => (
                                <span
                                  key={`${user.uid}-${page.pageId}`}
                                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                                >
                                  {page.pageLabel}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionShell>

        <TutorialCompletionSection
          loading={summaryLoading}
          model={tutorialCompletionModel}
        />

        <SectionShell
          eyebrow="Live / Timeline"
          title="Operational activity feed"
          description="This is the only part of the page still backed by recent raw presence and event documents. It stays intentionally small so operational visibility does not turn into an analytics query."
          action={
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {liveLoading ? "Refreshing live feed..." : "Auto-refresh every minute"}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Live Now</p>
                  <p className="text-sm text-slate-600">
                    Presence documents sorted by last heartbeat.
                  </p>
                </div>
                <Shield className="h-5 w-5 text-slate-400" />
              </div>

              {liveLoading ? (
                <p className="text-sm text-slate-500">Loading live activity...</p>
              ) : liveUsers.length === 0 ? (
                <p className="text-sm text-slate-500">No active presence records yet.</p>
              ) : (
                <div className="space-y-3">
                  {liveUsers.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm text-slate-900">
                            <span className="font-semibold">{row.displayName}</span> is on{" "}
                            <span className="font-medium">{row.pageLabel}</span>
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.sectionLabel} • {row.email}
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.status.badge}`}
                        >
                          {row.status.label}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Last heartbeat {formatTimeAgo(row.lastActiveAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Recent Timeline</p>
                  <p className="text-sm text-slate-600">
                    Latest raw events only, capped to keep reads low.
                  </p>
                </div>
                <BarChart3 className="h-5 w-5 text-slate-400" />
              </div>

              {liveLoading ? (
                <p className="text-sm text-slate-500">Loading recent events...</p>
              ) : timelineRows.length === 0 ? (
                <p className="text-sm text-slate-500">No timeline entries yet.</p>
              ) : (
                <div className="space-y-3">
                  {timelineRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <p className="text-sm text-slate-900">
                        <span className="font-semibold">{row.actorName}</span>{" "}
                        {row.eventType === "page_enter"
                          ? `opened ${row.pageLabel}`
                          : `triggered ${row.actionKey || row.eventType}`}{" "}
                        at <span className="font-medium">{formatDateTime(row.timestamp)}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.sectionLabel} • Session {row.sessionId || "unknown"} •{" "}
                        {row.eventType === "page_enter"
                          ? `approx ${row.approxMinutes}m on page`
                          : row.email || row.uid}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionShell>
      </div>

      <UserDrilldownDrawer
        user={selectedUser}
        detailModel={userDetailModel}
        loading={userDetailLoading}
        rangeDays={rangeDays}
        onClose={() => setSelectedUser(null)}
      />
    </>
  );
};

export default UserActivityPage;
