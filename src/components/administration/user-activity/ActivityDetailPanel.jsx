import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { TUTORIALS } from "../../../contexts/TutorialContext";
import { formatCount, formatDateTime, formatMinutes } from "./activityDisplay";
import {
  ExplorerEmpty,
  FeatureList,
  PeopleList,
  VisitList,
  EntityLink,
} from "./ExplorerWidgets";
import { TrendChart, RankedList } from "./ActivityWidgets";

// Step counts use the tutorial's current length, which is what Resume uses.
const describeTutorialProgress = (progress, totalSteps) => {
  if (progress?.status === "completed") {
    return `Completed · ${formatDateTime(progress.completedAt || progress.updatedAt)}`;
  }
  if (progress?.status === "started") {
    const step = Math.min((progress.currentStepIndex || 0) + 1, totalSteps);
    return `Step ${step} of ${totalSteps} · last opened ${formatDateTime(progress.updatedAt || progress.startedAt)}`;
  }
  return "Not started";
};

export default function ActivityDetailPanel({
  kind,
  id,
  title,
  model,
  visits,
  onClose,
  onPerson,
  onFeature,
  onActivity,
  tutorials,
  historyNote,
  loadMore,
  loadingMore,
  hasMore,
}) {
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(panelRef.current?.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select, summary, [tabindex="0"]',
        ) || []),
      ].filter(
        (element) =>
          !element.closest("details:not([open])") ||
          element.tagName === "SUMMARY",
      );
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === titleRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    titleRef.current?.focus();
    panelRef.current?.scrollTo?.(0, 0);
  }, [kind, id]);
  const person = kind === "person";
  const tutorial = person
    ? tutorials.find((row) => (row.uid || row.id) === id)
    : null;
  const actions = new Map();
  (person ? model.people : model.features).forEach((row) =>
    row.topActions.forEach((action) =>
      actions.set(action.actionKey, {
        ...action,
        count: (actions.get(action.actionKey)?.count || 0) + action.count,
      }),
    ),
  );
  const actionRows = [...actions.values()].sort((a, b) => b.count - a.count);
  return createPortal(
    <div className="activity-panel-backdrop" onClick={onClose}>
      <aside
        ref={panelRef}
        className="activity-detail-panel activity-console"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="activity-panel-header">
          <button className="activity-text-button" onClick={onClose}>
            <ArrowLeft size={16} />
            Back to results
          </button>
          <button
            className="activity-icon-button"
            aria-label="Close details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="activity-panel-body">
          <p className="activity-eyebrow">
            {person ? "Person" : "Feature"} detail
          </p>
          <h2 id="activity-detail-title" ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          <p className="activity-muted">
            {person
              ? "The features and visits behind their recorded activity."
              : "Who uses this feature and how it fits into their visits."}
          </p>
          <div className="activity-detail-stats">
            <div>
              <strong>{model.activeDays}</strong>
              <span>days used</span>
            </div>
            <div>
              <strong>
                {person ? model.features.length : model.people.length}
              </strong>
              <span>{person ? "features" : "people"}</span>
            </div>
            <div>
              <strong>{model.pageViews}</strong>
              <span>page views</span>
            </div>
          </div>
          <section>
            <h3>
              {person ? "Features they use" : "People using this feature"}
            </h3>
            {person ? (
              <FeatureList
                features={model.features}
                onFeature={onFeature}
                limit={100}
              />
            ) : (
              <PeopleList
                people={model.people}
                onPerson={onPerson}
                limit={100}
              />
            )}
          </section>
          <section>
            <div className="activity-card-heading">
              <h3>Recent visits</h3>
              <button className="activity-text-button" onClick={onActivity}>
                All activity <ArrowRight size={14} />
              </button>
            </div>
            <p className="activity-muted">
              {historyNote} Matching visits include their surrounding steps.
            </p>
            <VisitList
              visits={visits}
              onPerson={onPerson}
              onFeature={onFeature}
              limit={8}
            />
            {hasMore && (
              <button
                className="activity-button"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore
                  ? "Loading older activity…"
                  : "Load older activity"}
              </button>
            )}
          </section>
          <section>
            <h3>Recorded actions</h3>
            {actionRows.length ? (
              <RankedList
                rows={actionRows}
                labelKey="label"
                valueKey="count"
                valueFormatter={formatCount}
              />
            ) : (
              <ExplorerEmpty>
                No actions recorded. Looking up information may be all someone
                needed.
              </ExplorerEmpty>
            )}
          </section>
          {model.paths.length > 0 && (
            <section>
              <h3>Common page-to-page steps</h3>
              <ul className="activity-tutorial-list">
                {model.paths.slice(0, 5).map((path) => (
                  <li key={`${path.fromPageId}:${path.toPageId}`}>
                    <span>
                      <EntityLink onClick={() => onFeature(path.fromPageId)}>
                        {path.fromPageLabel}
                      </EntityLink>{" "}
                      →{" "}
                      <EntityLink onClick={() => onFeature(path.toPageId)}>
                        {path.toPageLabel}
                      </EntityLink>
                    </span>
                    <strong>{path.count} times</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <details className="activity-definitions">
            <summary>Daily pattern and time</summary>
            <p>
              {formatMinutes(model.minutes)} of visible-tab time. This is not a
              measure of active work.
            </p>
            <TrendChart
              rows={model.trendRows}
              dataKey="pageEnterCount"
              formatter={formatCount}
            />
            <ul className="activity-daily-values">
              {model.trendRows.map((row) => (
                <li key={row.dateKey}>
                  {row.dateKey}: {row.pageEnterCount} page views
                  {row.isPartial ? " (in progress)" : ""}
                </li>
              ))}
            </ul>
          </details>
          {person && (
            <details className="activity-definitions">
              <summary>Tutorial progress · all time</summary>
              {tutorial ? (
                <ul className="activity-tutorial-list">
                  {Object.values(TUTORIALS).map((item) => (
                    <li key={item.id}>
                      <span>{item.title}</span>
                      <strong>
                        {describeTutorialProgress(
                          tutorial.tutorials?.[item.id],
                          item.steps.length,
                        )}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <ExplorerEmpty>
                  No tutorial progress recorded. Completing every tutorial is
                  not expected.
                </ExplorerEmpty>
              )}
            </details>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
