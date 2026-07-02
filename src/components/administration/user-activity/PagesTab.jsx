import { useMemo, useState } from "react";
import { Clock3, Download, Eye, Search } from "lucide-react";
import Badge from "../../shared/Badge";
import Modal from "../../shared/Modal";
import SortableHeader from "../../shared/SortableHeader";
import { buildPageDrilldownModel } from "../../../utils/activityAnalytics";
import {
  EmptyState,
  HourBars,
  LoadingBlock,
  MetricCard,
  RankedList,
  TrendChart,
} from "./ActivityWidgets";
import {
  downloadCsv,
  formatCount,
  formatDateKeyShort,
  formatMinutes,
  humanizeActionKey,
} from "./activityDisplay";

const compareValues = (left, right) => {
  if (typeof left === "string" || typeof right === "string") {
    return String(left ?? "").localeCompare(String(right ?? ""));
  }
  return Number(left ?? 0) - Number(right ?? 0);
};

const PageDrilldownModal = ({ page, pageDailyRows, rangeDays, onClose }) => {
  const detail = useMemo(
    () =>
      buildPageDrilldownModel({
        rows: pageDailyRows.filter((row) => row.pageId === page?.pageId),
        rangeDays,
      }),
    [page?.pageId, pageDailyRows, rangeDays],
  );

  if (!page) return null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={page.pageLabel}
      subtitle={`${page.sectionLabel} · last ${rangeDays} days`}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard
            label="Time on Page"
            value={formatMinutes(detail.summary.totalMinutesApprox)}
            hint={`${detail.summary.daysUsed} day${detail.summary.daysUsed === 1 ? "" : "s"} with visits`}
            icon={Clock3}
          />
          <MetricCard
            label="Opens"
            value={formatCount(detail.summary.pageEnterCount)}
            hint={`Peak ${detail.summary.peakDayUsers} user${detail.summary.peakDayUsers === 1 ? "" : "s"} in one day`}
            icon={Eye}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-baylor-green">Daily time on page</p>
          <TrendChart rows={detail.trendRows} dataKey="totalMinutesApprox" formatter={formatMinutes} height={180} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-baylor-green">Hour-of-day profile</p>
          <HourBars rows={detail.heatmapRows} />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-baylor-green">Actions on this page</p>
            <RankedList
              rows={detail.topActions.map((row) => ({
                ...row,
                actionLabel: humanizeActionKey(row.actionKey),
              }))}
              labelKey="actionLabel"
              valueKey="count"
              valueFormatter={formatCount}
              emptyText="No recorded actions on this page."
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-baylor-green">Who uses it</p>
            {detail.roleBreakdown.length === 0 ? (
              <EmptyState>No role data yet.</EmptyState>
            ) : (
              <div className="space-y-2">
                {detail.roleBreakdown.map((entry) => (
                  <div
                    key={entry.role}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm"
                  >
                    <Badge tone="neutral" size="sm">{entry.role}</Badge>
                    <span className="text-gray-600">
                      {formatMinutes(entry.totalMinutesApprox)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

const PagesTab = ({ model, pageDailyRows, rangeDays, loading, todayDateKey }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({
    key: "totalMinutesApprox",
    direction: "descending",
  });
  const [selectedPage, setSelectedPage] = useState(null);

  const sections = useMemo(
    () =>
      Array.from(
        new Set(model.pagesTable.map((page) => page.sectionLabel || "Other")),
      ).sort(),
    [model.pagesTable],
  );

  const visiblePages = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const filtered = model.pagesTable.filter((page) => {
      if (sectionFilter !== "all" && (page.sectionLabel || "Other") !== sectionFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        page.pageLabel.toLowerCase().includes(needle) ||
        (page.pageId || "").toLowerCase().includes(needle)
      );
    });
    const direction = sortConfig.direction === "ascending" ? 1 : -1;
    return [...filtered].sort(
      (left, right) =>
        compareValues(left[sortConfig.key], right[sortConfig.key]) * direction,
    );
  }, [model.pagesTable, searchTerm, sectionFilter, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === "descending"
          ? "ascending"
          : "descending",
    }));
  };

  const exportCsv = () => {
    downloadCsv(
      `user-activity-pages-${rangeDays}d-${todayDateKey}.csv`,
      [
        "Page",
        "Section",
        "Total Minutes",
        "Opens",
        "Actions",
        "Peak Daily Users",
        "Days Used",
        "Last Used",
      ],
      visiblePages.map((page) => [
        page.pageLabel,
        page.sectionLabel,
        page.totalMinutesApprox || 0,
        page.pageEnterCount || 0,
        page.semanticEventCount || 0,
        page.peakDayUsers || 0,
        page.daysUsed || 0,
        page.lastUsedDateKey || "",
      ]),
    );
  };

  if (loading) {
    return <LoadingBlock label="Loading page summaries…" />;
  }

  return (
    <div className="university-card">
      <div className="university-card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-baylor-green">
            Pages ({visiblePages.length})
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Every page visited in the range. Click one for its usage detail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search pages"
              className="w-48 rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-baylor-green focus:outline-none focus:ring-2 focus:ring-baylor-green/20"
            />
          </div>
          <select
            value={sectionFilter}
            onChange={(event) => setSectionFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-baylor-green focus:outline-none focus:ring-2 focus:ring-baylor-green/20"
            aria-label="Filter by section"
          >
            <option value="all">All sections</option>
            {sections.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={visiblePages.length === 0}
            className="btn-secondary-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {visiblePages.length === 0 ? (
        <div className="p-5">
          <EmptyState>
            {model.pagesTable.length === 0
              ? "No page activity in this range yet."
              : "No pages match the current filters."}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="university-table">
            <thead>
              <tr>
                <SortableHeader label="Page" columnKey="pageLabel" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Section" columnKey="sectionLabel" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Time" columnKey="totalMinutesApprox" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Opens" columnKey="pageEnterCount" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Actions" columnKey="semanticEventCount" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Peak Users" columnKey="peakDayUsers" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Last Used" columnKey="lastUsedDateKey" sortConfig={sortConfig} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {visiblePages.map((page) => (
                <tr
                  key={page.pageId}
                  className="cursor-pointer"
                  onClick={() => setSelectedPage(page)}
                >
                  <td className="font-medium text-gray-900">{page.pageLabel}</td>
                  <td>
                    <Badge tone="neutral" size="sm">{page.sectionLabel}</Badge>
                  </td>
                  <td className="font-medium">{formatMinutes(page.totalMinutesApprox)}</td>
                  <td>{formatCount(page.pageEnterCount)}</td>
                  <td>{formatCount(page.semanticEventCount)}</td>
                  <td>{page.peakDayUsers}</td>
                  <td className="text-gray-600">{formatDateKeyShort(page.lastUsedDateKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedPage && (
        <PageDrilldownModal
          page={selectedPage}
          pageDailyRows={pageDailyRows}
          rangeDays={rangeDays}
          onClose={() => setSelectedPage(null)}
        />
      )}
    </div>
  );
};

export default PagesTab;
