import { ArrowRight, ChevronRight, FileText, UserRound } from "lucide-react";
import {
  collapseVisitEvents,
  eventLabel,
} from "../../../utils/activityExplorer";
import { formatCount, formatDateTime, formatTimeAgo } from "./activityDisplay";

export const ExplorerCard = ({
  title,
  description,
  action,
  children,
  className = "",
}) => (
  <section className={`activity-card ${className}`}>
    <div className="activity-card-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);
export const ExplorerEmpty = ({ children }) => (
  <p className="activity-empty">{children}</p>
);
export const EntityLink = ({ children, onClick, className = "" }) => (
  <button
    type="button"
    className={`activity-entity ${className}`}
    onClick={onClick}
  >
    {children}
  </button>
);

export const PeopleList = ({ people, onPerson, limit = 5 }) =>
  people.length ? (
    <div className="activity-list">
      {people.slice(0, limit).map((person) => (
        <button
          key={person.id}
          type="button"
          className="activity-list-row"
          onClick={() => onPerson(person.id)}
        >
          <span className="activity-avatar">
            <UserRound size={18} aria-hidden="true" />
          </span>
          <span className="activity-row-main">
            <strong>{person.label}</strong>
            <small>
              {person.activeDays} {person.activeDays === 1 ? "day" : "days"}{" "}
              used · {person.featureCount}{" "}
              {person.featureCount === 1 ? "feature" : "features"}
            </small>
          </span>
          <span className="activity-row-meta">
            {person.lastSeenAt
              ? formatTimeAgo(person.lastSeenAt)
              : person.lastDateKey}
            <ChevronRight size={15} aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  ) : (
    <ExplorerEmpty>
      No people with recorded activity in this period.
    </ExplorerEmpty>
  );

export const FeatureList = ({ features, onFeature, limit = 5 }) =>
  features.length ? (
    <div className="activity-list">
      {features.slice(0, limit).map((feature) => (
        <button
          key={feature.id}
          type="button"
          className="activity-list-row"
          onClick={() => onFeature(feature.id)}
        >
          <span className="activity-avatar">
            <FileText size={18} aria-hidden="true" />
          </span>
          <span className="activity-row-main">
            <strong>{feature.label}</strong>
            <small>
              {feature.peopleCount}{" "}
              {feature.peopleCount === 1 ? "person" : "people"} ·{" "}
              {formatCount(feature.pageViews)} page views
            </small>
          </span>
          <span className="activity-row-meta">
            {feature.activeDays} {feature.activeDays === 1 ? "day" : "days"}{" "}
            used
            <ChevronRight size={15} aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  ) : (
    <ExplorerEmpty>No feature activity recorded in this period.</ExplorerEmpty>
  );

export const VisitList = ({
  visits,
  onPerson,
  onFeature,
  limit = 20,
  emptyText = "No visits match these filters in the loaded history.",
}) =>
  visits.length ? (
    <div className="activity-visits">
      {visits.slice(0, limit).map((visit) => {
        const steps = collapseVisitEvents(visit.events);
        const pages = visit.events.filter(
          (event, index, events) =>
            index === 0 || event.pageId !== events[index - 1].pageId,
        );
        const lastAction = [...visit.events]
          .reverse()
          .find((event) => event.eventType !== "page_enter");
        const failures = visit.events.filter(
          (event) => event.eventType === "error",
        ).length;
        return (
          <article
            className={`activity-visit ${failures ? "activity-visit-error" : ""}`}
            key={visit.id}
          >
            <div className="activity-visit-heading">
              <EntityLink onClick={() => onPerson(visit.uid)}>
                {visit.actorName}
              </EntityLink>
              <time dateTime={new Date(visit.startMs).toISOString()}>
                {formatDateTime(visit.startMs)}
                {visit.endMs > visit.startMs &&
                  ` – ${new Date(visit.endMs).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })}`}
              </time>
            </div>
            <div className="activity-path">
              {pages.slice(0, 4).map((event, index) => (
                <span key={event.id}>
                  {index > 0 && <ArrowRight size={13} aria-hidden="true" />}
                  <EntityLink onClick={() => onFeature(event.pageId)}>
                    {event.pageLabel}
                  </EntityLink>
                </span>
              ))}
              {pages.length > 4 && (
                <span className="activity-muted">+{pages.length - 4} more</span>
              )}
            </div>
            {lastAction && (
              <p className="activity-visit-outcome">
                {eventLabel(lastAction)}
                {failures > 0 && (
                  <span className="activity-error-count">
                    {failures} recorded{" "}
                    {failures === 1 ? "failure" : "failures"}
                  </span>
                )}
              </p>
            )}
            <details>
              <summary>
                View {visit.events.length}{" "}
                {visit.events.length === 1 ? "event" : "events"}
                {visit.partial ? " · earlier events may be unloaded" : ""}
              </summary>
              <ol className="activity-event-list">
                {steps.map(({ event, count, lastMs }) => (
                  <li
                    key={event.id}
                    className={
                      event.eventType === "error" ? "activity-event-error" : ""
                    }
                  >
                    <time>
                      {new Date(event.timestampMs).toLocaleTimeString("en-US", {
                        timeZone: "America/Chicago",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {count > 1 &&
                        ` – ${new Date(lastMs).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })}`}
                    </time>
                    <div>
                      <strong>
                        {eventLabel(event)}
                        {count > 1 && ` · ${count} times`}
                      </strong>
                      <div>
                        <EntityLink onClick={() => onFeature(event.pageId)}>
                          {event.pageLabel}
                        </EntityLink>
                        {event.eventType === "error" && (
                          <span className="activity-muted">
                            {" "}
                            · {event.metadata?.errorCode || "unexpected"}
                          </span>
                        )}
                      </div>
                      {event.actionKey === "import_applied" &&
                        Number.isFinite(event.metadata?.changes) && (
                          <small>
                            {formatCount(event.metadata.changes)} record changes
                            applied
                          </small>
                        )}
                      {event.actionKey === "room_calendars_generated" &&
                        Number.isFinite(event.metadata?.calendars) && (
                          <small>
                            {event.metadata.calendars} calendar files generated
                          </small>
                        )}
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          </article>
        );
      })}
    </div>
  ) : (
    <ExplorerEmpty>{emptyText}</ExplorerEmpty>
  );
