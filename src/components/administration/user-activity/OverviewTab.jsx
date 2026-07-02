import { useState } from "react";
import { ArrowRight, Clock3, Eye, Radio, Users } from "lucide-react";
import {
  EmptyState,
  LoadingBlock,
  MetricCard,
  RankedList,
  SectionCard,
  TrendChart,
  WeekHourHeatmap,
} from "./ActivityWidgets";
import {
  formatCount,
  formatHourLabel,
  formatMinutes,
  humanizeActionKey,
} from "./activityDisplay";

const TREND_METRICS = [
  { id: "totalMinutesApprox", label: "Time", formatter: formatMinutes },
  { id: "uniqueUsers", label: "Active users", formatter: formatCount },
  { id: "sessionCount", label: "Sessions", formatter: formatCount },
  { id: "pageEnterCount", label: "Page views", formatter: formatCount },
];

const OverviewTab = ({ model, liveActiveCount, rangeDays, loading }) => {
  const [trendMetric, setTrendMetric] = useState(TREND_METRICS[0]);
  const compareLabel = `previous ${rangeDays} days`;
  const newUserCount = model.aggregatedUsers.filter(
    (user) => user.isNewInRange,
  ).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingBlock label="Loading activity summaries…" />
        <LoadingBlock label="Loading usage patterns…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active Now"
          value={liveActiveCount}
          hint="In the app within the last 2 minutes"
          icon={Radio}
        />
        <MetricCard
          label="Users"
          value={model.overview.uniqueUsers}
          hint={
            newUserCount > 0
              ? `${newUserCount} new · ${model.patterns.repeatUsers} returning`
              : `${model.patterns.repeatUsers} returning users`
          }
          icon={Users}
          delta={model.deltas?.uniqueUsers}
          compareLabel={compareLabel}
        />
        <MetricCard
          label="Time in App"
          value={formatMinutes(model.overview.totalMinutesApprox)}
          hint={`${model.overview.avgSessionMinutes}m average session`}
          icon={Clock3}
          delta={model.deltas?.totalMinutesApprox}
          compareLabel={compareLabel}
        />
        <MetricCard
          label="Page Views"
          value={formatCount(model.overview.pageEnterCount)}
          hint={`${formatCount(model.overview.sessionCount)} sessions`}
          icon={Eye}
          delta={model.deltas?.pageEnterCount}
          compareLabel={compareLabel}
        />
      </div>

      <SectionCard
        title="Usage trend"
        subtitle="Daily totals for the selected range — the gold point is today, still in progress."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {TREND_METRICS.map((metric) => (
              <button
                key={metric.id}
                type="button"
                onClick={() => setTrendMetric(metric)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  trendMetric.id === metric.id
                    ? "border-baylor-green/30 bg-baylor-green/10 text-baylor-green"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {metric.label}
              </button>
            ))}
          </div>
        }
      >
        <TrendChart
          rows={model.trendRows}
          dataKey={trendMetric.id}
          formatter={trendMetric.formatter}
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title="When people are active"
          subtitle="Time spent by weekday and hour (local time)."
        >
          <WeekHourHeatmap grid={model.weekHourGrid} />
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
            <span>
              Busiest hour:{" "}
              <span className="font-semibold text-gray-900">
                {model.patterns.busiestHour &&
                model.patterns.busiestHour.totalMinutesApprox > 0
                  ? formatHourLabel(model.patterns.busiestHour.hour)
                  : "—"}
              </span>
            </span>
            <span>
              Busiest day:{" "}
              <span className="font-semibold text-gray-900">
                {model.busiestDay && model.busiestDay.totalMinutesApprox > 0
                  ? `${model.busiestDay.label} (${formatMinutes(model.busiestDay.totalMinutesApprox)})`
                  : "—"}
              </span>
            </span>
          </div>
        </SectionCard>

        <SectionCard title="Weekday rhythm" subtitle="Total time by day of week.">
          <RankedList
            rows={model.weekdayTotals}
            labelKey="label"
            valueKey="totalMinutesApprox"
            emptyText="No weekday pattern yet."
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Top pages" subtitle="Where time is actually spent.">
          <RankedList rows={model.topPages} labelKey="pageLabel" />
        </SectionCard>
        <SectionCard title="Top sections" subtitle="Areas of the app drawing the most use.">
          <RankedList rows={model.topSections} labelKey="sectionLabel" />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Top actions"
          subtitle="Meaningful actions like imports, exports, and edits — not navigation."
        >
          <RankedList
            rows={model.patterns.topActions.map((row) => ({
              ...row,
              actionLabel: humanizeActionKey(row.actionKey),
            }))}
            labelKey="actionLabel"
            valueKey="count"
            valueFormatter={formatCount}
            emptyText="No actions recorded yet — they appear as people import, export, book rooms, and save edits."
          />
        </SectionCard>
        <SectionCard
          title="Common paths"
          subtitle="The page-to-page moves that repeat most."
        >
          {model.patterns.topTransitions.length === 0 ? (
            <EmptyState>No repeated navigation paths yet.</EmptyState>
          ) : (
            <div className="space-y-2.5">
              {model.patterns.topTransitions.map((row) => (
                <div
                  key={`${row.fromPageId}>>${row.toPageId}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-gray-800">
                    <span className="truncate">{row.fromPageLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="truncate font-medium">{row.toPageLabel}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {formatCount(row.count)}×
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default OverviewTab;
