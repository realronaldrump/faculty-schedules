import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  AlertCircle,
} from "lucide-react";
import { getNavigationMeta } from "../../../utils/navigationMeta";
import { WORKFLOW_LABELS, timestampMs } from "../../../utils/activityExplorer";
import { formatDateTime } from "./activityDisplay";
import {
  ExplorerCard,
  ExplorerEmpty,
  PeopleList,
  FeatureList,
  VisitList,
} from "./ExplorerWidgets";

export const AttentionSection = ({
  model,
  reviewed,
  onReview,
  onIssue,
  onCopy,
  error,
  copied,
}) => (
  <ExplorerCard
    title="Needs attention"
    description="Recorded problems in this period. Reviewing a problem does not mark it resolved."
  >
    {error ? (
      <p className="activity-notice activity-notice-warning">
        <AlertCircle size={18} />
        Problem information may be incomplete while activity summaries are
        unavailable.
      </p>
    ) : model.failures.length ? (
      <div className="activity-issues">
        {model.failures.map((issue) => {
          const isReviewed =
            Number(reviewed[issue.id] || 0) >= timestampMs(issue.lastSeenAt);
          return (
            <article key={issue.id} className="activity-issue">
              <div>
                <span
                  className={`activity-pill ${isReviewed ? "" : "activity-pill-warning"}`}
                >
                  {isReviewed ? "Reviewed" : "Recorded failure"}
                </span>
                <h3>
                  {WORKFLOW_LABELS[issue.workflow] || "Task"} ·{" "}
                  {getNavigationMeta(issue.pageId).pageLabel}
                </h3>
                <p>
                  {issue.count} {issue.count === 1 ? "failure" : "failures"}{" "}
                  affecting {issue.people.size}{" "}
                  {issue.people.size === 1 ? "person" : "people"} · latest{" "}
                  {formatDateTime(issue.lastSeenAt)}
                </p>
                <p className="activity-muted">
                  {issue.errorCode === "permission-denied"
                    ? "Check whether the affected person still has access to this feature."
                    : "Open the surrounding activity to see what happened before and after the failure."}
                </p>
              </div>
              <div className="activity-issue-actions">
                <button
                  className="activity-button"
                  onClick={() => onIssue(issue)}
                >
                  View activity
                </button>
                <button
                  className="activity-text-button"
                  onClick={() => onCopy(issue)}
                >
                  {copied === issue.id ? "Copied" : "Copy details"}
                </button>
                <button
                  className="activity-text-button"
                  onClick={() => onReview(issue, !isReviewed)}
                >
                  {isReviewed ? "Mark unreviewed" : "Mark reviewed"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    ) : (
      <div className="activity-health-empty">
        {model.reportingPeople ? (
          <CheckCircle2 size={20} />
        ) : (
          <CircleHelp size={20} />
        )}
        <div>
          <strong>
            {model.reportingPeople
              ? "No failures recorded in this period"
              : "Failure reporting has not been observed yet"}
          </strong>
          <p>
            {model.reportingPeople
              ? `Updated failure reporting was observed for ${model.reportingPeople} ${model.reportingPeople === 1 ? "person" : "people"}. This is not an uptime check; older app versions and failures before sign-in may not report.`
              : "It begins as people use the updated app. Historical activity cannot establish whether tasks failed."}
          </p>
        </div>
      </div>
    )}
    <details className="activity-definitions">
      <summary>What is monitored?</summary>
      <p>
        Failures reported by the app during page loading, imports, PDF
        preparation, room calendar generation, reservation changes, and
        directory or schedule saves. Activity reporting depends on sign-in and a
        working connection. A missing failure report is not proof that every
        feature works. Review markers are saved in this browser.
      </p>
    </details>
  </ExplorerCard>
);

export default function ExplorerOverview({
  model,
  visits,
  onPerson,
  onFeature,
  onNavigate,
  attention,
  historyNote,
  presence,
}) {
  return (
    <div className="activity-sections">
      <div className="activity-metrics">
        <button onClick={() => onNavigate("usage", "people")}>
          <span>People using the app</span>
          <strong>{model.people.length}</strong>
          <small>
            Explore their visits <ArrowRight size={14} />
          </small>
        </button>
        <button onClick={() => onNavigate("usage", "features")}>
          <span>Features used</span>
          <strong>{model.features.length}</strong>
          <small>
            See what brings them back <ArrowRight size={14} />
          </small>
        </button>
        <button onClick={() => onNavigate("activity")}>
          <span>Days with recorded use</span>
          <strong>{model.activeDays}</strong>
          <small>
            Browse the activity <ArrowRight size={14} />
          </small>
        </button>
      </div>
      {attention}
      {model.observations.length > 0 && (
        <ExplorerCard
          title="Worth a look"
          description="Factual observations you can explore."
        >
          <div className="activity-observations">
            {model.observations.map((item) => (
              <button key={item.id} onClick={() => onFeature(item.feature)}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        </ExplorerCard>
      )}
      <div className="activity-two-columns">
        <ExplorerCard
          title="Recently active people"
          action={
            <button
              className="activity-text-button"
              onClick={() => onNavigate("usage", "people")}
            >
              All people <ArrowRight size={14} />
            </button>
          }
        >
          <PeopleList people={model.people} onPerson={onPerson} />
        </ExplorerCard>
        <ExplorerCard
          title="Features in use"
          action={
            <button
              className="activity-text-button"
              onClick={() => onNavigate("usage", "features")}
            >
              All features <ArrowRight size={14} />
            </button>
          }
        >
          <FeatureList features={model.features} onFeature={onFeature} />
        </ExplorerCard>
      </div>
      <ExplorerCard
        title="Recent visits"
        description={historyNote}
        action={
          <button
            className="activity-text-button"
            onClick={() => onNavigate("activity")}
          >
            Explore activity <ArrowRight size={14} />
          </button>
        }
      >
        <VisitList
          visits={visits}
          onPerson={onPerson}
          onFeature={onFeature}
          limit={5}
        />
      </ExplorerCard>
      <details className="activity-card activity-presence">
        <summary>
          Recently seen in the app{" "}
          <span className="activity-muted">
            · current presence, independent of the date range
          </span>
        </summary>
        {presence.length ? (
          <ul>
            {presence.map((person) => (
              <li key={person.uid}>
                <button
                  className="activity-entity"
                  onClick={() => onPerson(person.uid)}
                >
                  {person.displayName || person.email || "Unknown person"}
                </button>
                <span>
                  {person.currentPageLabel ||
                    getNavigationMeta(person.currentPageId).pageLabel}{" "}
                  · {formatDateTime(person.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ExplorerEmpty>
            No one seen in the past ten minutes. An open visible tab does not
            necessarily mean someone is actively working.
          </ExplorerEmpty>
        )}
      </details>
    </div>
  );
}
