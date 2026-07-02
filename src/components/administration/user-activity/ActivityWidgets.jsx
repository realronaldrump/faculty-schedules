import { TrendingDown, TrendingUp } from "lucide-react";
import Badge from "../../shared/Badge";
import { WEEKDAY_LABELS } from "../../../utils/activityAnalytics";
import { formatHourLabel, formatMinutes } from "./activityDisplay";

const BRAND_GREEN = "#154734";
const BRAND_GOLD = "#FFB81C";

export const SectionCard = ({ title, subtitle, actions, children, className = "" }) => (
  <div className={`university-card ${className}`}>
    <div className="university-card-header flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-baylor-green">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const DeltaChip = ({ value, compareLabel }) => {
  if (value === null || value === undefined) return null;
  if (value === 0) {
    return (
      <Badge tone="neutral" size="sm" className="whitespace-nowrap">
        ± 0%
      </Badge>
    );
  }
  const positive = value > 0;
  return (
    <Badge
      tone={positive ? "success" : "error"}
      size="sm"
      icon={positive ? TrendingUp : TrendingDown}
      className="whitespace-nowrap"
    >
      <span title={compareLabel ? `vs ${compareLabel}` : undefined}>
        {positive ? "+" : ""}
        {value}%
      </span>
    </Badge>
  );
};

export const MetricCard = ({ label, value, hint, icon: Icon, delta, compareLabel }) => (
  <div className="university-card p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <p className="metric-value mt-1">{value}</p>
        {hint && <p className="metric-subtitle truncate">{hint}</p>}
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        {Icon && (
          <div className="metric-icon">
            <Icon className="w-5 h-5 text-baylor-green" />
          </div>
        )}
        <DeltaChip value={delta} compareLabel={compareLabel} />
      </div>
    </div>
  </div>
);

export const EmptyState = ({ children }) => (
  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
    {children}
  </div>
);

export const LoadingBlock = ({ label = "Loading…" }) => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 animate-pulse">
    {label}
  </div>
);

/**
 * Dependency-free daily trend chart: area + line in brand green, with today's
 * in-progress point highlighted in gold.
 */
export const TrendChart = ({ rows, dataKey, formatter = (value) => value, height = 210 }) => {
  if (!rows?.length) {
    return <EmptyState>No activity recorded in this range yet.</EmptyState>;
  }

  const width = 760;
  const padding = { top: 16, right: 14, bottom: 28, left: 42 };
  const values = rows.map((row) => Number(row[dataKey] || 0));
  const maxValue = Math.max(...values, 1);
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  const xScale = (index) =>
    padding.left + (rows.length === 1 ? usableWidth / 2 : (index / (rows.length - 1)) * usableWidth);
  const yScale = (value) => padding.top + usableHeight - (value / maxValue) * usableHeight;

  const linePath = rows
    .map((row, index) => `${index === 0 ? "M" : "L"} ${xScale(index)} ${yScale(Number(row[dataKey] || 0))}`)
    .join(" ");
  const areaPath = `${linePath} L ${xScale(rows.length - 1)} ${yScale(0)} L ${xScale(0)} ${yScale(0)} Z`;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Daily trend chart">
      {[0.25, 0.5, 0.75, 1].map((step) => (
        <g key={step}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={yScale(maxValue * step)}
            y2={yScale(maxValue * step)}
            stroke="#e5e7eb"
            strokeDasharray="3 5"
          />
          <text
            x={padding.left - 8}
            y={yScale(maxValue * step) + 4}
            fontSize="11"
            fill="#6b7280"
            textAnchor="end"
          >
            {formatter(Math.round(maxValue * step))}
          </text>
        </g>
      ))}
      <path d={areaPath} fill={BRAND_GREEN} opacity="0.07" />
      <path d={linePath} fill="none" stroke={BRAND_GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {rows.map((row, index) => (
        <g key={row.dateKey}>
          <circle
            cx={xScale(index)}
            cy={yScale(Number(row[dataKey] || 0))}
            r="3"
            fill={row.isPartial ? BRAND_GOLD : BRAND_GREEN}
          >
            <title>{`${row.label}: ${formatter(Number(row[dataKey] || 0))}${row.isPartial ? " (today, in progress)" : ""}`}</title>
          </circle>
          {(index % labelEvery === 0 || index === rows.length - 1) && (
            <text x={xScale(index)} y={height - 8} fontSize="11" fill="#6b7280" textAnchor="middle">
              {row.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
};

/**
 * Weekday x hour heatmap (rows Sun-Sat, columns 12AM-11PM) of time spent.
 */
export const WeekHourHeatmap = ({ grid }) => {
  const maxValue = Math.max(...(grid || []).flat(), 1);
  const hasData = (grid || []).flat().some((value) => value > 0);
  if (!hasData) {
    return <EmptyState>No hourly pattern yet for this range.</EmptyState>;
  }

  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: "2.25rem repeat(24, minmax(0, 1fr))" }}>
        {grid.map((hours, weekday) => (
          <div key={WEEKDAY_LABELS[weekday]} className="contents">
            <div className="flex items-center text-2xs font-medium text-gray-500">
              {WEEKDAY_LABELS[weekday]}
            </div>
            {hours.map((minutes, hour) => {
              const intensity = minutes / maxValue;
              return (
                <div
                  key={hour}
                  className="aspect-square rounded-[3px] min-w-0"
                  style={{
                    backgroundColor:
                      minutes > 0
                        ? `rgba(21, 71, 52, ${0.12 + intensity * 0.78})`
                        : "#f3f4f6",
                  }}
                  title={`${WEEKDAY_LABELS[weekday]} ${formatHourLabel(hour)} — ${formatMinutes(minutes)}`}
                />
              );
            })}
          </div>
        ))}
        <div />
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="text-center text-2xs text-gray-400">
            {hour % 4 === 0 ? formatHourLabel(hour).replace(" ", "") : ""}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-2xs text-gray-500">
        <span>Less</span>
        {[0.12, 0.35, 0.58, 0.9].map((alpha) => (
          <span
            key={alpha}
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: `rgba(21, 71, 52, ${alpha})` }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
};

/**
 * Compact 24-hour profile used inside drilldowns.
 */
export const HourBars = ({ rows }) => {
  const maxValue = Math.max(...rows.map((row) => row.totalMinutesApprox || 0), 1);
  const hasData = rows.some((row) => (row.totalMinutesApprox || 0) > 0);
  if (!hasData) {
    return <EmptyState>No hourly pattern yet.</EmptyState>;
  }
  return (
    <div>
      <div className="flex h-24 items-end gap-[2px]">
        {rows.map((row) => (
          <div
            key={row.hour}
            className="flex-1 rounded-t-sm bg-baylor-green/80 min-h-[2px]"
            style={{
              height: `${Math.max(((row.totalMinutesApprox || 0) / maxValue) * 100, row.totalMinutesApprox > 0 ? 6 : 2)}%`,
              opacity: row.totalMinutesApprox > 0 ? 1 : 0.15,
            }}
            title={`${formatHourLabel(row.hour)} — ${formatMinutes(row.totalMinutesApprox)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-2xs text-gray-400">
        {[0, 4, 8, 12, 16, 20].map((hour) => (
          <span key={hour}>{formatHourLabel(hour).replace(" ", "")}</span>
        ))}
        <span>11PM</span>
      </div>
    </div>
  );
};

export const RankedList = ({
  rows,
  labelKey,
  valueKey = "totalMinutesApprox",
  valueFormatter = formatMinutes,
  emptyText = "No data yet for this range.",
  getRowKey,
  onRowClick,
}) => {
  if (!rows?.length) {
    return <EmptyState>{emptyText}</EmptyState>;
  }
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const value = Number(row[valueKey] || 0);
        const key = getRowKey ? getRowKey(row) : `${row[labelKey]}-${index}`;
        const content = (
          <>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-gray-800">{row[labelKey]}</span>
              <span className="shrink-0 text-gray-500">{valueFormatter(value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-baylor-green"
                style={{ width: `${Math.max(6, (value / maxValue) * 100)}%` }}
              />
            </div>
          </>
        );
        return onRowClick ? (
          <button
            key={key}
            type="button"
            onClick={() => onRowClick(row)}
            className="block w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-50"
          >
            {content}
          </button>
        ) : (
          <div key={key}>{content}</div>
        );
      })}
    </div>
  );
};
