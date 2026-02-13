import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { Activity, Clock3, RefreshCw, Shield, Users } from "lucide-react";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { getNavigationMeta } from "../../utils/navigationMeta";

const LIVE_WINDOW_MINUTES = 2;
const IDLE_WINDOW_MINUTES = 10;
const REFRESH_INTERVAL_MS = 60 * 1000;

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const getActivityStatus = (lastActiveAt) => {
  const lastActiveDate = toDate(lastActiveAt);
  if (!lastActiveDate) {
    return { label: "Unknown", color: "text-gray-500", rank: 3 };
  }

  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - lastActiveDate.getTime()) / (1000 * 60)),
  );

  if (diffMinutes <= LIVE_WINDOW_MINUTES) {
    return { label: "Active now", color: "text-green-600", rank: 0 };
  }
  if (diffMinutes <= IDLE_WINDOW_MINUTES) {
    return { label: "Idle", color: "text-amber-600", rank: 1 };
  }
  return { label: "Away", color: "text-gray-600", rank: 2 };
};

const deriveTimelineDwellMinutes = (events) => {
  const groupedBySession = new Map();
  const dwellByEventId = new Map();

  events.forEach((event) => {
    const timestampDate = toDate(event.timestamp);
    if (!timestampDate) return;
    const sessionKey = `${event.uid || "unknown"}:${event.sessionId || "default"}`;
    const existing = groupedBySession.get(sessionKey) || [];
    existing.push({ ...event, timestampDate });
    groupedBySession.set(sessionKey, existing);
  });

  groupedBySession.forEach((sessionEvents) => {
    const ordered = sessionEvents.sort(
      (a, b) => a.timestampDate.getTime() - b.timestampDate.getTime(),
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

const UserActivityPage = () => {
  const { isActivityOwner } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [presenceRows, setPresenceRows] = useState([]);
  const [eventRows, setEventRows] = useState([]);
  const [dailyRows, setDailyRows] = useState([]);
  const [users, setUsers] = useState([]);

  const loadActivityData = useCallback(
    async ({ silent = false } = {}) => {
      if (!isActivityOwner) return;

      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        setErrorMessage("");
        const [presenceSnap, eventsSnap, dailySnap, usersSnap] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "userPresence"),
                orderBy("updatedAt", "desc"),
                limit(120),
              ),
            ),
            getDocs(
              query(
                collection(db, "userActivityEvents"),
                orderBy("timestamp", "desc"),
                limit(300),
              ),
            ),
            getDocs(
              query(
                collection(db, "userActivityDaily"),
                orderBy("dateKey", "desc"),
                limit(90),
              ),
            ),
            getDocs(query(collection(db, "users"), orderBy("email"), limit(500))),
          ]);

        setPresenceRows(
          presenceSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
        );
        setEventRows(
          eventsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
        );
        setDailyRows(
          dailySnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
        );
        setUsers(usersSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      } catch (error) {
        console.error("Failed to load activity data:", error);
        setErrorMessage(
          error?.message || "Could not load activity data right now.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isActivityOwner],
  );

  useEffect(() => {
    if (!isActivityOwner) return;

    void loadActivityData();
    const intervalId = setInterval(() => {
      void loadActivityData({ silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isActivityOwner, loadActivityData]);

  const usersByUid = useMemo(() => {
    const map = new Map();
    users.forEach((row) => map.set(row.id, row));
    return map;
  }, [users]);

  const liveUsers = useMemo(() => {
    const rows = presenceRows.map((presence) => {
      const pageMeta = getNavigationMeta(presence.currentPageId);
      const userRow = usersByUid.get(presence.uid) || {};
      const lastActiveAt = userRow.lastActiveAt || userRow.lastLoginAt;
      const status = getActivityStatus(lastActiveAt);

      return {
        ...presence,
        displayName:
          presence.displayName ||
          userRow.displayName ||
          presence.email ||
          "Unknown User",
        email: presence.email || userRow.email || "Unknown email",
        pageLabel: presence.currentPageLabel || pageMeta.pageLabel,
        sectionLabel: presence.currentSectionLabel || pageMeta.sectionLabel,
        lastActiveAt,
        status,
      };
    });

    return rows.sort((a, b) => {
      const byStatus = a.status.rank - b.status.rank;
      if (byStatus !== 0) return byStatus;
      return (a.email || "").localeCompare(b.email || "");
    });
  }, [presenceRows, usersByUid]);

  const timelineRows = useMemo(() => {
    const dwellByEventId = deriveTimelineDwellMinutes(eventRows);
    return eventRows
      .map((event) => {
        const pageMeta = getNavigationMeta(event.pageId);
        return {
          ...event,
          actorName: event.displayName || event.email || event.uid || "Unknown User",
          pageLabel: event.pageLabel || pageMeta.pageLabel,
          sectionLabel: event.sectionLabel || pageMeta.sectionLabel,
          approxMinutes: dwellByEventId.get(event.id) || 1,
        };
      })
      .sort((a, b) => {
        const left = toDate(a.timestamp)?.getTime() || 0;
        const right = toDate(b.timestamp)?.getTime() || 0;
        return right - left;
      });
  }, [eventRows]);

  const summaryCards = useMemo(() => {
    const activeCount = liveUsers.filter(
      (row) => row.status.label === "Active now",
    ).length;
    return {
      trackedUsers: liveUsers.length,
      activeNow: activeCount,
      timelineEntries: timelineRows.length,
      dailySummaries: dailyRows.length,
    };
  }, [dailyRows.length, liveUsers, timelineRows.length]);

  if (!isActivityOwner) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-gray-700">
        This page is only available to the configured activity owner account.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Activity</h1>
          <p className="text-gray-600 mt-1">
            Owner-only timeline of where people are in the app and what pages
            they opened.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadActivityData({ silent: true })}
          className="btn-secondary inline-flex items-center gap-2"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="university-card">
          <div className="university-card-content flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tracked Users</p>
              <p className="text-2xl font-bold text-gray-900">
                {summaryCards.trackedUsers}
              </p>
            </div>
            <Users className="w-7 h-7 text-baylor-green" />
          </div>
        </div>
        <div className="university-card">
          <div className="university-card-content flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Now</p>
              <p className="text-2xl font-bold text-gray-900">
                {summaryCards.activeNow}
              </p>
            </div>
            <Activity className="w-7 h-7 text-green-600" />
          </div>
        </div>
        <div className="university-card">
          <div className="university-card-content flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Timeline Entries</p>
              <p className="text-2xl font-bold text-gray-900">
                {summaryCards.timelineEntries}
              </p>
            </div>
            <Clock3 className="w-7 h-7 text-blue-600" />
          </div>
        </div>
        <div className="university-card">
          <div className="university-card-content flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Daily Summaries</p>
              <p className="text-2xl font-bold text-gray-900">
                {summaryCards.dailySummaries}
              </p>
            </div>
            <Shield className="w-7 h-7 text-amber-600" />
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="university-card">
        <div className="university-card-header">
          <h2 className="university-card-title">Live Now</h2>
          <span className="text-sm text-gray-500">
            Updated every minute using last-active heartbeats
          </span>
        </div>
        <div className="university-card-content">
          {loading ? (
            <p className="text-sm text-gray-500">Loading live activity...</p>
          ) : liveUsers.length === 0 ? (
            <p className="text-sm text-gray-500">No active presence records yet.</p>
          ) : (
            <div className="space-y-3">
              {liveUsers.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
                >
                  <p className="text-sm text-gray-900">
                    <span className="font-semibold">{row.displayName}</span>{" "}
                    is on <span className="font-medium">{row.pageLabel}</span>{" "}
                    ({row.sectionLabel}).
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Status:{" "}
                    <span className={`font-medium ${row.status.color}`}>
                      {row.status.label}
                    </span>{" "}
                    • Last active {formatTimeAgo(row.lastActiveAt)} •{" "}
                    {row.email}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="university-card">
        <div className="university-card-header">
          <h2 className="university-card-title">Timeline</h2>
          <span className="text-sm text-gray-500">
            Most recent page opens
          </span>
        </div>
        <div className="university-card-content">
          {loading ? (
            <p className="text-sm text-gray-500">Loading timeline...</p>
          ) : timelineRows.length === 0 ? (
            <p className="text-sm text-gray-500">No timeline entries yet.</p>
          ) : (
            <div className="space-y-2">
              {timelineRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-gray-200 px-4 py-3 text-sm"
                >
                  <p className="text-gray-900">
                    <span className="font-semibold">{row.actorName}</span> opened{" "}
                    <span className="font-medium">{row.pageLabel}</span> around{" "}
                    <span className="font-medium">{formatDateTime(row.timestamp)}</span>{" "}
                    and stayed about{" "}
                    <span className="font-medium">
                      {row.approxMinutes} minute{row.approxMinutes === 1 ? "" : "s"}
                    </span>
                    .
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Section: {row.sectionLabel} • Session:{" "}
                    {row.sessionId || "unknown"} • {row.email || row.uid}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="university-card">
        <div className="university-card-header">
          <h2 className="university-card-title">Daily Summary</h2>
          <span className="text-sm text-gray-500">Campus-time rollups</span>
        </div>
        <div className="university-card-content">
          {loading ? (
            <p className="text-sm text-gray-500">Loading summaries...</p>
          ) : dailyRows.length === 0 ? (
            <p className="text-sm text-gray-500">No daily summaries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b border-gray-200">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Time in App</th>
                    <th className="py-2 pr-4">Pages Visited</th>
                    <th className="py-2">Top Pages</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium text-gray-900">
                        {row.dateKey || "Unknown"}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">
                        {row.displayName || row.email || row.uid}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">
                        {row.totalMinutesApprox || 0} minute
                        {(row.totalMinutesApprox || 0) === 1 ? "" : "s"}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">
                        {row.pagesVisitedCount || 0}
                      </td>
                      <td className="py-2 text-gray-700">
                        {Array.isArray(row.topPages) && row.topPages.length > 0
                          ? row.topPages.join(", ")
                          : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default UserActivityPage;
