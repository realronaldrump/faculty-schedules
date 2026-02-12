import React from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import TechnicalDetailsPanel from "./TechnicalDetailsPanel";
import {
  summarizeBaselineReport,
  summarizeLocationApplyReport,
  summarizeLocationPreview,
  summarizeOrphanCleanup,
  summarizeOrphanScan,
  summarizeTermRepairReport,
} from "./reportFormatters";

const SummaryCard = ({ summary, tone = "amber" }) => {
  if (!summary) return null;

  const toneMap = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-green-200 bg-green-50 text-green-900",
  };

  const cardTone = toneMap[tone] || toneMap.amber;

  return (
    <div className={`rounded-lg border p-3 ${cardTone}`}>
      <div className="text-sm font-semibold">{summary.title}</div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {summary.items.map((item) => (
          <div
            key={`${summary.title}:${item.label}`}
            className="rounded-md border border-white/70 bg-white/70 p-2"
          >
            <div className="text-xs opacity-80">{item.label}</div>
            <div className="text-sm font-semibold">{item.value}</div>
          </div>
        ))}
      </div>
      {summary.nextStep && <p className="mt-2 text-xs">Next step: {summary.nextStep}</p>}
    </div>
  );
};

const RareRepairToolsSection = ({
  isOpen,
  onToggleOpen,
  isUnlocked,
  onUnlock,
  isLegacyMaintenanceMode,
  termOptions,

  baselineReport,
  isRunningBaseline,
  onRequestBaselineConfirm,

  termCode,
  setTermCode,
  termRepairReport,
  isRunningTermRepair,
  onRunTermRepair,

  locationPreview,
  locationApplyReport,
  isLoadingLocationPreview,
  isApplyingLocationMigration,
  onLoadLocationPreview,
  onRequestLocationConfirm,

  orphanTermFilter,
  setOrphanTermFilter,
  orphanScan,
  orphanCleanupResult,
  orphanTotal,
  isScanningOrphans,
  isApplyingOrphanCleanup,
  onScanOrphans,
  onRequestOrphanConfirm,
}) => {
  const baselineSummary = summarizeBaselineReport(baselineReport);
  const termSummary = summarizeTermRepairReport(termRepairReport, termCode);
  const locationPreviewSummary = summarizeLocationPreview(locationPreview);
  const locationApplySummary = summarizeLocationApplyReport(locationApplyReport);
  const orphanScanSummary = summarizeOrphanScan(orphanScan, orphanTermFilter);
  const orphanCleanupSummary = summarizeOrphanCleanup(
    orphanCleanupResult,
    orphanTermFilter,
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Rare repair tools</h3>
            <p className="mt-1 text-sm text-gray-600">
              Use these only for unusual issues. They can update many records at once.
            </p>
            {isLegacyMaintenanceMode && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Opened in advanced mode from legacy maintenance route.
              </p>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-600" />
        )}
      </button>

      {!isOpen && (
        <p className="mt-3 text-sm text-gray-500">
          Keep this collapsed during routine use.
        </p>
      )}

      {isOpen && !isUnlocked && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="text-sm font-semibold">Advanced actions are locked</p>
              <p className="mt-1 text-sm">
                Unlock to reveal tools that can apply large-scale repairs and deletions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onUnlock}
            className="mt-3 inline-flex items-center rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Unlock Rare Repair Tools
          </button>
        </div>
      )}

      {isOpen && isUnlocked && (
        <div className="mt-5 space-y-6">
          <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-2">
              <Database className="mt-0.5 h-4 w-4 text-red-700" />
              <div>
                <h4 className="text-sm font-semibold text-red-900">
                  Full baseline repair (all terms)
                </h4>
                <p className="mt-1 text-xs text-red-800">
                  One-time global repair for identity cleanup, room links, cross-list links,
                  and legacy normalization.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onRequestBaselineConfirm}
              disabled={isRunningBaseline}
              className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {isRunningBaseline ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                "Run Full Baseline Repair"
              )}
            </button>

            <SummaryCard summary={baselineSummary} tone="amber" />
            <TechnicalDetailsPanel title="Baseline technical details" data={baselineReport} />
          </section>

          <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                Term-specific repair
              </h4>
              <p className="mt-1 text-xs text-gray-600">
                Run targeted cleanup for one term code.
              </p>
            </div>

            <select
              value={termCode}
              onChange={(event) => setTermCode(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a term</option>
              {termOptions.map((term) => (
                <option key={term.termCode || term.term} value={term.termCode || ""}>
                  {(term.term || term.termCode || "Unknown")}
                  {term.termCode ? ` (${term.termCode})` : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onRunTermRepair}
              disabled={isRunningTermRepair || !termCode}
              className="inline-flex items-center gap-2 rounded-lg border border-baylor-green px-4 py-2 text-sm font-semibold text-baylor-green hover:bg-baylor-green/5 disabled:opacity-50"
            >
              {isRunningTermRepair ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4" />
                  Run Term Repair
                </>
              )}
            </button>

            <SummaryCard summary={termSummary} tone="blue" />
            <TechnicalDetailsPanel title="Term repair technical details" data={termRepairReport} />
          </section>

          <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                Location migration
              </h4>
              <p className="mt-1 text-xs text-gray-600">
                Preview changes first, then apply if everything looks correct.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onLoadLocationPreview}
                disabled={isLoadingLocationPreview}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {isLoadingLocationPreview ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Preview Migration
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onRequestLocationConfirm}
                disabled={isApplyingLocationMigration || !locationPreview}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {isApplyingLocationMigration ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  "Apply Migration"
                )}
              </button>
            </div>

            <SummaryCard summary={locationPreviewSummary} tone="blue" />
            <SummaryCard summary={locationApplySummary} tone="green" />
            <TechnicalDetailsPanel
              title="Location preview details"
              data={locationPreview}
            />
            <TechnicalDetailsPanel
              title="Location migration details"
              data={locationApplyReport}
            />
          </section>

          <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Orphan cleanup by term</h4>
              <p className="mt-1 text-xs text-gray-600">
                Scan one term for orphaned records, then delete only what the scan reports.
              </p>
            </div>

            <select
              value={orphanTermFilter}
              onChange={(event) => setOrphanTermFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a term label</option>
              {termOptions.map((term) => (
                <option key={`orphan:${term.termCode || term.term}`} value={term.term || ""}>
                  {term.term || term.termCode || "Unknown"}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onScanOrphans}
                disabled={isScanningOrphans || !orphanTermFilter}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {isScanningOrphans ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Scan For Orphans
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onRequestOrphanConfirm}
                disabled={isApplyingOrphanCleanup || orphanTotal === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {isApplyingOrphanCleanup ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Orphaned Records"
                )}
              </button>
            </div>

            <SummaryCard summary={orphanScanSummary} tone="blue" />
            <SummaryCard summary={orphanCleanupSummary} tone="green" />
            <TechnicalDetailsPanel title="Orphan scan details" data={orphanScan} />
            <TechnicalDetailsPanel
              title="Orphan cleanup details"
              data={orphanCleanupResult}
            />
          </section>
        </div>
      )}
    </section>
  );
};

export default RareRepairToolsSection;
