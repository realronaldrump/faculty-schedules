import { useMemo, useState } from "react";
import { MousePointerClick, Navigation, RefreshCw } from "lucide-react";
import Badge from "../../shared/Badge";
import { EmptyState, LoadingBlock, SectionCard } from "./ActivityWidgets";
import {
  formatDateTime,
  formatTimeAgo,
  humanizeActionKey,
} from "./activityDisplay";

const EVENT_FILTERS = [
  { id: "all", label: "All" },
  { id: "navigation", label: "Navigation" },
  { id: "actions", label: "Actions" },
];

const LiveTab = ({ liveUsers, timelineRows, loading }) => {
  const [eventFilter, setEventFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const timelineUsers = useMemo(
    () =>
      Array.from(
        new Map(
          timelineRows.map((row) => [row.uid, row.actorName]),
        ).entries(),
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [timelineRows],
  );

  const visibleTimeline = useMemo(
    () =>
      timelineRows.filter((row) => {
        if (userFilter !== "all" && row.uid !== userFilter) return false;
        if (eventFilter === "navigation") return row.eventType === "page_enter";
        if (eventFilter === "actions") return row.eventType !== "page_enter";
        return true;
      }),
    [eventFilter, timelineRows, userFilter],
  );

  const activeCount = liveUsers.filter((user) => user.status.rank === 0).length;

  if (loading) {
    return <LoadingBlock label="Loading live activity…" />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard
        title={`Active now (${activeCount})`}
        subtitle="Everyone with a recent presence heartbeat."
        actions={
          <Badge tone="neutral" size="sm" icon={RefreshCw}>
            Refreshes every minute
          </Badge>
        }
      >
        {liveUsers.length === 0 ? (
          <EmptyState>No presence records yet.</EmptyState>
        ) : (
          <div className="space-y-2.5">
            {liveUsers.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900">
                    <span className="font-medium">{row.displayName}</span>
                    <span className="text-gray-500"> · {row.pageLabel}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {row.sectionLabel} · last heartbeat {formatTimeAgo(row.lastActiveAt)}
                  </p>
                </div>
                <Badge tone={row.status.tone} size="sm" showDot className="shrink-0">
                  {row.status.label}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Recent events"
        subtitle="The newest raw events, kept small to stay quota-friendly."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {EVENT_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setEventFilter(filter.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  eventFilter === filter.id
                    ? "border-baylor-green/30 bg-baylor-green/10 text-baylor-green"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {filter.label}
              </button>
            ))}
            <select
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs focus:border-baylor-green focus:outline-none focus:ring-2 focus:ring-baylor-green/20"
              aria-label="Filter timeline by user"
            >
              <option value="all">All users</option>
              {timelineUsers.map(([uid, name]) => (
                <option key={uid} value={uid}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {visibleTimeline.length === 0 ? (
          <EmptyState>
            {timelineRows.length === 0
              ? "No events yet."
              : "No events match the current filters."}
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {visibleTimeline.map((row) => {
              const isNavigation = row.eventType === "page_enter";
              const Icon = isNavigation ? Navigation : MousePointerClick;
              return (
                <div
                  key={row.id}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 px-3.5 py-2.5"
                >
                  <div
                    className={`mt-0.5 rounded-md p-1.5 ${
                      isNavigation
                        ? "bg-gray-100 text-gray-500"
                        : "bg-baylor-gold/15 text-baylor-green"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{row.actorName}</span>{" "}
                      {isNavigation ? (
                        <>
                          opened <span className="font-medium">{row.pageLabel}</span>
                        </>
                      ) : (
                        <>
                          {humanizeActionKey(row.actionKey || row.eventType).toLowerCase()}{" "}
                          on <span className="font-medium">{row.pageLabel}</span>
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatDateTime(row.timestamp)} · {row.sectionLabel}
                      {isNavigation ? ` · ~${row.approxMinutes}m on page` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default LiveTab;
