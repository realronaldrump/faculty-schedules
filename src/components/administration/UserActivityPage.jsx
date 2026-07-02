import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Users,
} from "lucide-react";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext.jsx";
import HubTabs from "../shared/HubTabs";
import {
  ACTIVITY_RANGE_OPTIONS,
  buildActivityAnalyticsModel,
  formatDateKeyInTimeZone,
  toDate,
} from "../../utils/activityAnalytics";
import {
  SUMMARY_LOOKBACK_DAYS,
  loadActivitySummaries,
  syncActivityRollups,
} from "../../utils/activitySync";
import { getNavigationMeta } from "../../utils/navigationMeta";
import OverviewTab from "./user-activity/OverviewTab";
import UsersTab from "./user-activity/UsersTab";
import PagesTab from "./user-activity/PagesTab";
import LiveTab from "./user-activity/LiveTab";
import TutorialsTab from "./user-activity/TutorialsTab";
import { formatTimeAgo, getActivityStatus } from "./user-activity/activityDisplay";

const LIVE_REFRESH_INTERVAL_MS = 60 * 1000;
const TIMELINE_LIMIT = 60;
const PRESENCE_LIMIT = 120;

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "pages", label: "Pages", icon: FileText },
  { id: "live", label: "Live", icon: Radio },
  { id: "tutorials", label: "Tutorials", icon: GraduationCap },
];

const isPermissionError = (error) =>
  error?.code === "permission-denied" ||
  /missing or insufficient permissions/i.test(String(error?.message || ""));

const formatLoadError = (error) => {
  if (isPermissionError(error)) {
    return "Activity data is blocked by Firestore rules. Deploy the latest rules, then refresh.";
  }
  return (
    String(error?.message || "").trim() ||
    "Could not load activity analytics right now."
  );
};

const formatSyncError = (error) => {
  if (isPermissionError(error)) {
    return "Summary status could not be checked: Firestore rules block activity summary reads.";
  }
  if (
    error?.code === "resource-exhausted" ||
    /quota|resource-exhausted/i.test(String(error?.message || ""))
  ) {
    return "Summary status could not be checked: the free-tier Firestore quota is exhausted. Stored activity will resume automatically after the daily reset.";
  }
  return (
    String(error?.message || "").trim() ||
    "Summary status could not be checked right now — showing the latest stored data."
  );
};

// Approximate per-event dwell for the live timeline from gaps between page
// entries in the same session.
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

const SyncStatus = ({ syncState }) => {
  if (syncState.status === "syncing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-white/80">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Updating summaries…
      </span>
    );
  }
  if (syncState.status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-baylor-gold">
        <AlertTriangle className="h-3.5 w-3.5" />
        Summaries may be stale
      </span>
    );
  }
  const { info } = syncState;
  const detail =
    info?.mode === "event-summaries"
      ? "Daily summaries update automatically as users use the app"
      : info?.mode && info.mode !== "none"
      ? `Rolled up ${info.rolledDayCount} day${info.rolledDayCount === 1 ? "" : "s"} just now`
      : info?.lastSyncAt
        ? `Last rollup ${formatTimeAgo(info.lastSyncAt)}`
        : "";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-white/80"
      title={detail || undefined}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      Up to date · today is live
    </span>
  );
};

const UserActivityPage = () => {
  const { isActivityOwner } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [rangeDays, setRangeDays] = useState(30);
  const [summaries, setSummaries] = useState({
    todayDateKey: "",
    analyticsRows: [],
    pageDailyRows: [],
    userDailyRows: [],
  });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncState, setSyncState] = useState({ status: "syncing", info: null, error: "" });
  const [errorMessage, setErrorMessage] = useState("");
  const [presenceRows, setPresenceRows] = useState([]);
  const [eventRows, setEventRows] = useState([]);
  const [tutorialProgressRows, setTutorialProgressRows] = useState([]);

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
      presenceSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );
    setEventRows(
      eventsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );
  }, [isActivityOwner]);

  const loadTutorialProgress = useCallback(async () => {
    if (!isActivityOwner) return;
    const snapshot = await getDocs(collection(db, "tutorialProgress"));
    setTutorialProgressRows(
      snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
    );
  }, [isActivityOwner]);

  // The whole pipeline is automatic: activity writes maintain daily summaries,
  // while this page only reloads those bounded summaries and live presence.
  const initialize = useCallback(
    async ({ silent = false } = {}) => {
      if (!isActivityOwner) return;
      if (silent) {
        setRefreshing(true);
      } else {
        setSummaryLoading(true);
        setLiveLoading(true);
      }
      setErrorMessage("");

      setSyncState((current) => ({ ...current, status: "syncing", error: "" }));
      try {
        const info = await syncActivityRollups();
        setSyncState({ status: "ready", info, error: "" });
      } catch (error) {
        console.error("Automatic activity rollup sync failed:", error);
        setSyncState({ status: "error", info: null, error: formatSyncError(error) });
      }

      try {
        const [loaded] = await Promise.all([
          loadActivitySummaries(),
          loadLiveData(),
          loadTutorialProgress(),
        ]);
        setSummaries(loaded);
      } catch (error) {
        console.error("Failed to load user activity analytics:", error);
        setErrorMessage(formatLoadError(error));
      } finally {
        setSummaryLoading(false);
        setLiveLoading(false);
        setRefreshing(false);
      }
    },
    [isActivityOwner, loadLiveData, loadTutorialProgress],
  );

  useEffect(() => {
    if (!isActivityOwner) return;
    void initialize();
  }, [initialize, isActivityOwner]);

  // Live data refreshes each minute while the tab is visible. If the local day
  // rolls over while the page stays open, reload bounded summaries automatically.
  useEffect(() => {
    if (!isActivityOwner || typeof document === "undefined") return undefined;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (
        summaries.todayDateKey &&
        formatDateKeyInTimeZone(new Date()) !== summaries.todayDateKey
      ) {
        void initialize({ silent: true });
        return;
      }
      void loadLiveData().catch((error) => {
        console.error("Failed to refresh live activity:", error);
      });
    };

    const intervalId = setInterval(tick, LIVE_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [initialize, isActivityOwner, loadLiveData, summaries.todayDateKey]);

  const model = useMemo(
    () =>
      buildActivityAnalyticsModel({
        appDailyRows: summaries.analyticsRows,
        pageDailyRows: summaries.pageDailyRows,
        userDailyRows: summaries.userDailyRows,
        rangeDays,
        lookbackDays: SUMMARY_LOOKBACK_DAYS,
      }),
    [rangeDays, summaries],
  );

  const liveUsers = useMemo(
    () =>
      presenceRows
        .map((presence) => {
          const pageMeta = getNavigationMeta(presence.currentPageId);
          const lastActiveAt = presence.updatedAt || presence.enteredAt;
          return {
            ...presence,
            displayName:
              presence.displayName || presence.email || presence.uid || "Unknown User",
            pageLabel: presence.currentPageLabel || pageMeta.pageLabel,
            sectionLabel: presence.currentSectionLabel || pageMeta.sectionLabel,
            lastActiveAt,
            status: getActivityStatus(lastActiveAt),
          };
        })
        .sort(
          (left, right) =>
            left.status.rank - right.status.rank ||
            left.displayName.localeCompare(right.displayName),
        ),
    [presenceRows],
  );

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

  const liveActiveCount = useMemo(
    () => liveUsers.filter((user) => user.status.rank === 0).length,
    [liveUsers],
  );

  if (!isActivityOwner) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-700">
        This page is only available to the configured activity owner account.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="university-header rounded-xl p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="university-brand">
            <div className="university-logo">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="university-title">User Activity</h1>
              <p className="university-subtitle">
                Who uses the app, where time goes, and what gets done
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2.5 sm:items-end">
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-white/10 p-1">
                {ACTIVITY_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRangeDays(option)}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      rangeDays === option
                        ? "bg-white font-semibold text-baylor-green shadow-sm"
                        : "font-medium text-white/80 hover:text-white"
                    }`}
                  >
                    {option}d
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void initialize({ silent: true })}
                disabled={refreshing}
                className="rounded-lg bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-60"
                title="Refresh now (data also refreshes automatically)"
                aria-label="Refresh activity data"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
            <SyncStatus syncState={syncState} />
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      {syncState.status === "error" && (
        <div className="rounded-lg border border-baylor-gold/40 bg-baylor-gold/10 px-4 py-3 text-sm text-baylor-green">
          {syncState.error}
        </div>
      )}

      <HubTabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
        dataTutorialPrefix="user-activity-tab-"
      />

      {activeTab === "overview" && (
        <OverviewTab
          model={model}
          liveActiveCount={liveActiveCount}
          rangeDays={rangeDays}
          loading={summaryLoading}
        />
      )}
      {activeTab === "users" && (
        <UsersTab
          model={model}
          userDailyRows={summaries.userDailyRows}
          rangeDays={rangeDays}
          loading={summaryLoading}
          todayDateKey={summaries.todayDateKey}
        />
      )}
      {activeTab === "pages" && (
        <PagesTab
          model={model}
          pageDailyRows={summaries.pageDailyRows}
          rangeDays={rangeDays}
          loading={summaryLoading}
          todayDateKey={summaries.todayDateKey}
        />
      )}
      {activeTab === "live" && (
        <LiveTab
          liveUsers={liveUsers}
          timelineRows={timelineRows}
          loading={liveLoading}
        />
      )}
      {activeTab === "tutorials" && (
        <TutorialsTab
          tutorialProgressRows={tutorialProgressRows}
          loading={summaryLoading}
        />
      )}
    </div>
  );
};

export default UserActivityPage;
