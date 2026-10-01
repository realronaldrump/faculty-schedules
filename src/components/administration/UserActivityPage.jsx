import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, Download, LayoutDashboard, RefreshCw, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import SelectDropdown from "../SelectDropdown";
import useActivityExplorerData from "../../hooks/useActivityExplorerData";
import {
  buildUsageModel,
  buildVisits,
  filterVisits,
  getExplorerWindow,
  isOwnerActivity,
  timestampMs,
  WORKFLOW_LABELS,
} from "../../utils/activityExplorer";
import {
  readActivityPreferences,
  saveActivityPreferences,
} from "../../utils/activityConsoleStorage";
import { getNavigationMeta } from "../../utils/navigationMeta";
import { downloadTextFile } from "../../utils/csvUtils";
import { formatDateTime } from "./user-activity/activityDisplay";
import ExplorerOverview, {
  AttentionSection,
} from "./user-activity/ExplorerOverview";
import ExplorerUsage from "./user-activity/ExplorerUsage";
import ActivityDetailPanel from "./user-activity/ActivityDetailPanel";
import { ExplorerCard, VisitList } from "./user-activity/ExplorerWidgets";
import "./user-activity/activityExplorer.css";

const VIEWS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "usage", label: "Usage", icon: Users },
  { id: "activity", label: "Activity", icon: Activity },
];

const UserActivityPage = () => {
  const { isActivityOwner, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [preferences, setPreferences] = useState(() =>
    readActivityPreferences(user?.uid),
  );
  const [previousVisit] = useState(preferences.lastVisit);
  const [copied, setCopied] = useState("");
  const [storageError, setStorageError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const exportController = useRef(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const [visibleVisitCount, setVisibleVisitCount] = useState(20);
  const recordedVisit = useRef(false);
  const view = VIEWS.some((item) => item.id === params.get("view"))
    ? params.get("view")
    : "overview";
  const pageRef = useRef(null);
  const previousViewRef = useRef(view);
  useEffect(() => {
    if (previousViewRef.current !== view)
      pageRef.current?.scrollIntoView?.({ block: "start" });
    previousViewRef.current = view;
  }, [view]);
  const group = params.get("group") === "people" ? "people" : "features";
  const range = ["7", "30", "90", "since"].includes(params.get("range"))
    ? params.get("range")
    : "30";
  const excludeOwner = params.has("mine")
    ? params.get("mine") !== "include"
    : preferences.excludeOwner;
  const person = params.get("person") || "";
  const feature = params.get("feature") || "";
  const kind = ["actions", "navigation", "errors"].includes(params.get("kind"))
    ? params.get("kind")
    : "all";
  const search = params.get("search") || "";
  const issue = params.get("issue") || "";
  const detailKind = ["person", "feature"].includes(params.get("detail"))
    ? params.get("detail")
    : "";
  const detailId = params.get("id") || "";
  const window = getExplorerWindow(range, previousVisit);
  const data = useActivityExplorerData({
    enabled: isActivityOwner,
    startDateKey: window.startDateKey,
    endDateKey: window.endDateKey,
  });
  const update = (patch, replace = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(patch).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        );
        return next;
      },
      { replace, preventScrollReset: true },
    );
  const savePreferences = (patch) => {
    const saved = saveActivityPreferences(user?.uid, patch);
    setPreferences((current) => ({ ...current, ...patch }));
    if (!saved)
      setStorageError(
        "Browser storage is unavailable. Preferences and review markers will last only for this visit.",
      );
  };

  useEffect(() => {
    if (!isActivityOwner || !data.updatedAt || recordedVisit.current) return;
    recordedVisit.current = true;
    if (
      !saveActivityPreferences(user?.uid, {
        lastVisit: new Date().toISOString(),
      })
    )
      setStorageError("This browser cannot save the last-visit marker.");
  }, [isActivityOwner, user?.uid, data.updatedAt]);

  const baseOptions = useMemo(
    () => ({
      rows: data.summaries.userDailyRows,
      events: data.history.rows,
      startDateKey: window.startDateKey,
      endDateKey: window.endDateKey,
      ownerUid: user?.uid,
      excludeOwner,
    }),
    [
      data.summaries.userDailyRows,
      data.history.rows,
      window.startDateKey,
      window.endDateKey,
      user?.uid,
      excludeOwner,
    ],
  );
  const baseModel = useMemo(() => buildUsageModel(baseOptions), [baseOptions]);
  const model = useMemo(
    () => buildUsageModel({ ...baseOptions, person, feature }),
    [baseOptions, person, feature],
  );
  const visits = useMemo(
    () =>
      buildVisits(data.history.rows, {
        ...baseOptions,
        sinceMs: window.sinceMs,
        hasMore: data.history.hasMore,
      }),
    [data.history.rows, data.history.hasMore, baseOptions, window.sinceMs],
  );
  const visibleVisits = useMemo(
    () =>
      filterVisits(visits, {
        person,
        feature,
        kind: view === "activity" ? kind : "all",
        search,
        issue: view === "activity" ? issue : "",
      }),
    [visits, person, feature, kind, search, issue, view],
  );
  const detailPerson = detailKind === "person" ? detailId : person;
  const detailFeature = detailKind === "feature" ? detailId : feature;
  const detailModel = useMemo(
    () =>
      buildUsageModel({
        ...baseOptions,
        person: detailPerson,
        feature: detailFeature,
      }),
    [baseOptions, detailPerson, detailFeature],
  );
  const detailVisits = useMemo(
    () =>
      filterVisits(visits, { person: detailPerson, feature: detailFeature }),
    [visits, detailPerson, detailFeature],
  );
  const detailTitle =
    detailKind === "person"
      ? baseModel.people.find((row) => row.id === detailId)?.label ||
        data.presence.find((row) => row.uid === detailId)?.displayName ||
        "Person"
      : baseModel.features.find((row) => row.id === detailId)?.label ||
        getNavigationMeta(detailId).pageLabel;
  const onPerson = (id) => update({ detail: "person", id });
  const onFeature = (id) => update({ detail: "feature", id });
  const onNavigate = (nextView, nextGroup) =>
    update({
      view: nextView,
      ...(nextGroup ? { group: nextGroup } : {}),
      detail: "",
      id: "",
      kind: "",
      issue: "",
    });
  const presence = data.presence.filter(
    (row) =>
      timestampMs(row.updatedAt) >= Date.now() - 10 * 60 * 1000 &&
      (!excludeOwner || !isOwnerActivity(row, user?.uid)) &&
      (!person || row.uid === person) &&
      (!feature || row.currentPageId === feature),
  );
  const historyNote = !data.history.loaded
    ? "Activity history has not loaded yet."
    : data.errors.history
      ? "Activity history could not refresh. Loaded visits may be incomplete."
      : data.history.hasMore
        ? `Recent events loaded${data.oldestEvent ? ` back to ${formatDateTime(data.oldestEvent)}` : ""}. Older activity is available.`
        : `All available recorded events for ${window.startDateKey} through ${window.endDateKey} are loaded.`;
  const filtered = Boolean(
    person ||
      feature ||
      search ||
      (view === "activity" && (kind !== "all" || issue)),
  );

  const copyIssue = async (item) => {
    const text = `${WORKFLOW_LABELS[item.workflow] || "Task"} failed on ${getNavigationMeta(item.pageId).pageLabel}\nPeriod: ${window.startDateKey} through ${window.endDateKey} (Central)\nRecorded failures: ${item.count}\nPeople affected: ${item.people.size}\nLatest: ${formatDateTime(item.lastSeenAt)}\nCategory: ${item.errorCode}\nReview surrounding activity before deciding whether the issue is resolved.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(item.id);
    } catch {
      setStorageError(
        "Could not copy to the clipboard. The issue details are available on this page.",
      );
    }
  };

  const exportActivity = async () => {
    if (exporting || !isActivityOwner) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportStatus("Preparing export…");
    // Capture scope and summary references before pagination or a refresh can
    // change the selected period. The hook cancels if that period changes.
    const options = {
      summaries: data.summaries,
      presence: data.presence,
      tutorials: data.tutorials,
      errors: data.errors,
      sourceUpdatedAt: data.sourceUpdatedAt,
      historyUpdatedAt: data.history.updatedAt,
      generatedAt: new Date(),
      scope: {
        startDateKey: window.startDateKey, endDateKey: window.endDateKey,
        sinceMs: window.sinceMs, ownerUid: user?.uid, excludeOwner, person, feature,
      },
    };
    try {
      const { createActivityExportArchive } = await import("../../utils/activityExport");
      const history = await data.loadExportHistory({
        signal: controller.signal,
        onProgress: ({ documentsFetched }) => setExportStatus(`Preparing export… ${documentsFetched.toLocaleString()} older events loaded.`),
      });
      if (controller.signal.aborted) return;
      setExportStatus("Creating download…");
      const result = await createActivityExportArchive({ ...options, history });
      if (controller.signal.aborted) return;
      downloadTextFile(result.blob, result.filename, "application/zip");
      setExportStatus(`Export downloaded. ${result.summary.eventsExported.toLocaleString()} ${result.summary.eventsExported === 1 ? "event" : "events"} and ${result.summary.userDayRows.toLocaleString()} daily ${result.summary.userDayRows === 1 ? "record" : "records"}.${
        result.summary.eventHistoryComplete ? "" : " Event history is partial; see the coverage notes in the download."
      }${Object.values(options.errors).some(Boolean) ? " Some sources could not refresh; see the coverage notes." : ""}`);
    } catch (error) {
      if (!controller.signal.aborted)
        setExportStatus(error.name === "AbortError"
          ? "The activity period changed. Export again for the current period."
          : error.message || "Could not create the export. Try again.");
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  };

  if (!isActivityOwner)
    return (
      <div className="activity-empty">
        This page is only available to the configured activity owner account.
      </div>
    );

  return (
    <div className="activity-console" ref={pageRef}>
      <header className="activity-page-header">
        <div>
          <p className="activity-eyebrow">Your remote check-in</p>
          <h1>User Activity</h1>
          <p>
            See what’s happening, follow their workflows, and find anything that
            needs a closer look.
          </p>
        </div>
        <div className="activity-header-actions">
          <button
            className="activity-button"
            onClick={exportActivity}
            disabled={exporting || data.loading || data.historyLoading || data.loadingMore}
          >
            <Download size={17} aria-hidden="true" />
            {exporting ? "Exporting…" : "Export"}
          </button>
          <button
            className="activity-icon-button"
            onClick={data.refresh}
            aria-label="Refresh activity data"
            disabled={exporting || data.loading || data.historyLoading || data.loadingMore}
          >
            <RefreshCw size={18} className={data.loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>
      <div className="activity-toolbar">
        <label htmlFor="activity-range">Period</label>
        <div className="activity-select">
          <SelectDropdown
            id="activity-range"
            aria-label="Activity period"
            value={range}
            onChange={(event) => update({ range: event.target.value })}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="since" disabled={!timestampMs(previousVisit)}>
              Since my last visit
            </option>
          </SelectDropdown>
        </div>
        <label>
          <input
            type="checkbox"
            checked={excludeOwner}
            onChange={(event) => {
              update({ mine: event.target.checked ? "exclude" : "include" });
              savePreferences({ excludeOwner: event.target.checked });
            }}
          />
          Exclude my activity
        </label>
        <span className="activity-muted" role="status">
          {data.loading
            ? "Refreshing summaries…"
            : data.updatedAt
              ? `Summaries refreshed ${formatDateTime(data.updatedAt)}`
              : "Summaries have not loaded"}
        </span>
      </div>
      <p className="activity-range-note">
        {window.startDateKey} – {window.endDateKey} · Central time · Activity
        across all semesters
        {window.since &&
          !window.clipped &&
          ` · Daily totals include the day of your last visit; events start ${formatDateTime(previousVisit)}.`}
        {window.clipped &&
          " Only the latest 90 days of summaries are available."}
      </p>
      {exportStatus && <p className="activity-notice" role="status">{exportStatus}</p>}
      {Object.entries(data.errors)
        .filter(([, message]) => message)
        .map(([key, message]) => (
          <div
            className="activity-notice activity-notice-warning"
            role="alert"
            key={key}
          >
            <strong>
              {key === "history"
                ? "Activity history"
                : key === "presence"
                  ? "Current presence"
                  : key === "tutorials"
                    ? "Tutorial progress"
                    : "Daily summaries"}
              :
            </strong>{" "}
            {message}
            <button className="activity-text-button" onClick={data.refresh}>
              Retry
            </button>
          </div>
        ))}
      {storageError && (
        <p className="activity-notice" role="status">
          {storageError}
        </p>
      )}
      <nav className="activity-tabs" aria-label="Activity views">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => update({ view: id })}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      <div className="activity-filters">
        <div>
          <SelectDropdown
            aria-label="Filter by person"
            value={person}
            onChange={(event) => update({ person: event.target.value })}
          >
            <option value="">All people</option>
            {baseModel.people.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </SelectDropdown>
        </div>
        <div>
          <SelectDropdown
            aria-label="Filter by feature"
            value={feature}
            onChange={(event) => update({ feature: event.target.value })}
          >
            <option value="">All features</option>
            {baseModel.features.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </SelectDropdown>
        </div>
        {view !== "overview" && (
          <div>
            <input
              type="search"
              aria-label={view === "usage" ? "Search usage" : "Search activity"}
              placeholder={
                view === "usage"
                  ? "Search people or features"
                  : "Search names, features, actions"
              }
              value={search}
              onChange={(event) => update({ search: event.target.value }, true)}
            />
          </div>
        )}
        {view === "activity" && (
          <div>
            <SelectDropdown
              aria-label="Filter activity type"
              value={kind}
              onChange={(event) =>
                update({ kind: event.target.value, issue: "" })
              }
            >
              <option value="all">All activity</option>
              <option value="actions">Actions</option>
              <option value="navigation">Page visits</option>
              <option value="errors">Recorded failures</option>
            </SelectDropdown>
          </div>
        )}
        {filtered && (
          <button
            className="activity-text-button"
            onClick={() =>
              update({
                person: "",
                feature: "",
                search: "",
                kind: "",
                issue: "",
              })
            }
          >
            Clear filters
          </button>
        )}
      </div>
      {filtered && (
        <div className="activity-filter-chips">
          <span>Showing filtered activity</span>
          {person && (
            <button onClick={() => update({ person: "" })}>
              {baseModel.people.find((row) => row.id === person)?.label ||
                "Selected person"}{" "}
              ×
            </button>
          )}
          {feature && (
            <button onClick={() => update({ feature: "" })}>
              {getNavigationMeta(feature).pageLabel} ×
            </button>
          )}
          {search && (
            <button onClick={() => update({ search: "" })}>
              Search: {search} ×
            </button>
          )}
          {issue && (
            <button onClick={() => update({ issue: "" })}>
              Selected issue ×
            </button>
          )}
        </div>
      )}
      {model.detailMissing && (
        <p className="activity-notice">
          Some older summaries do not contain feature details. Feature counts
          may be incomplete for this period.
        </p>
      )}
      {data.loading && !data.updatedAt ? (
        <div className="activity-empty" role="status">
          Loading usage and recent activity…
        </div>
      ) : (
        <>
          {view === "overview" && (
            <ExplorerOverview
              model={model}
              visits={visibleVisits}
              onPerson={onPerson}
              onFeature={onFeature}
              onNavigate={onNavigate}
              historyNote={historyNote}
              presence={presence}
              attention={
                <AttentionSection
                  model={model}
                  reviewed={preferences.reviewed}
                  error={data.errors.summaries || data.errors.sync}
                  copied={copied}
                  onCopy={copyIssue}
                  onIssue={(item) =>
                    update({
                      view: "activity",
                      feature: item.pageId,
                      kind: "errors",
                      issue: item.id,
                      search: "",
                    })
                  }
                  onReview={(item, reviewed) =>
                    savePreferences({
                      reviewed: {
                        ...preferences.reviewed,
                        [item.id]: reviewed ? timestampMs(item.lastSeenAt) : 0,
                      },
                    })
                  }
                />
              }
            />
          )}
          {view === "usage" && (
            <ExplorerUsage
              model={model}
              group={group}
              onGroup={(value) => update({ group: value })}
              onPerson={onPerson}
              onFeature={onFeature}
              search={search}
              startDateKey={window.startDateKey}
              endDateKey={window.endDateKey}
            />
          )}
          {view === "activity" && (
            <ExplorerCard
              title="Follow their visits"
              description="See the pages and actions that make up each visit."
            >
              <p className="activity-footnote mb-4">
                {historyNote}{" "}
                {data.history.updatedAt &&
                  `History refreshed ${formatDateTime(data.history.updatedAt)}.`}{" "}
                {filtered &&
                  "Filters match visits; expand one to see its surrounding steps."}
              </p>
              <VisitList
                visits={visibleVisits}
                onPerson={onPerson}
                onFeature={onFeature}
                limit={visibleVisitCount}
                emptyText={
                  data.historyLoading
                    ? "Loading recorded visits…"
                    : data.errors.history
                      ? "Activity history is unavailable. Retry before drawing conclusions about this period."
                      : data.history.hasMore
                        ? "No matching visits in the history loaded so far. Load older activity to continue searching."
                        : "No matching visits in the available recorded history for this period."
                }
              />
              <div className="activity-history-footer">
                <span className="activity-muted">
                  {visibleVisits.length} matching{" "}
                  {visibleVisits.length === 1 ? "visit" : "visits"} in{" "}
                  {data.history.rows.length} loaded events
                </span>
                {visibleVisitCount < visibleVisits.length && (
                  <button
                    className="activity-button"
                    onClick={() => setVisibleVisitCount((count) => count + 20)}
                  >
                    Show more visits
                  </button>
                )}
                {data.history.hasMore && (
                  <button
                    className="activity-button"
                    onClick={data.loadMore}
                    disabled={data.loadingMore || data.historyLoading}
                  >
                    {data.loadingMore
                      ? "Loading older activity…"
                      : "Load older activity"}
                  </button>
                )}
              </div>
              <details className="activity-definitions">
                <summary>How visits are grouped</summary>
                <p>
                  A visit groups recorded events for the same person and browser
                  session. A gap of 30 minutes without an event, or a new
                  Central calendar day, starts a separate visit. The time
                  between events does not measure active work. Page visits and
                  actions are recorded separately from visible-tab time.
                </p>
              </details>
            </ExplorerCard>
          )}
        </>
      )}
      {detailKind && detailId && (
        <ActivityDetailPanel
          kind={detailKind}
          id={detailId}
          title={detailTitle}
          model={detailModel}
          visits={detailVisits}
          onClose={() => update({ detail: "", id: "" })}
          onPerson={onPerson}
          onFeature={onFeature}
          onActivity={() =>
            update({
              view: "activity",
              person: detailPerson,
              feature: detailFeature,
              detail: "",
              id: "",
              search: "",
              kind: "",
              issue: "",
            })
          }
          tutorials={data.tutorials}
          historyNote={historyNote}
          hasMore={data.history.hasMore}
          loadingMore={data.loadingMore || data.historyLoading}
          loadMore={data.loadMore}
        />
      )}
    </div>
  );
};

export default UserActivityPage;
