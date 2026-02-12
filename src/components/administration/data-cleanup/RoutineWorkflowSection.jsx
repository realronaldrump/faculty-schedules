import React from "react";
import {
  Search,
  Wrench,
  ClipboardCheck,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  formatTimestamp,
  summarizeSafeFixPlan,
  summarizeSafeFixResult,
  summarizeScanResult,
} from "./reportFormatters";

const WORKFLOW_STEPS = {
  1: {
    title: "Check data",
    description:
      "Run a quick system check for missing links, likely duplicates, and unresolved imports.",
    icon: Search,
  },
  2: {
    title: "Fix safe issues",
    description:
      "Apply automatic repairs that are safe to run without manual record decisions.",
    icon: Wrench,
  },
  3: {
    title: "Review decisions",
    description:
      "Handle only the remaining items that need a human choice.",
    icon: ClipboardCheck,
  },
};

const SummaryCard = ({ summary }) => {
  if (!summary) return null;

  return (
    <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-center gap-2 text-green-800">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-sm font-semibold">{summary.title}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {summary.items.map((item) => (
          <div
            key={`${summary.title}:${item.label}`}
            className="rounded-md border border-green-200 bg-white p-2"
          >
            <div className="text-xs text-gray-500">{item.label}</div>
            <div className="text-sm font-semibold text-gray-900">{item.value}</div>
          </div>
        ))}
      </div>
      {summary.nextStep && (
        <p className="mt-3 text-sm text-green-900">Next step: {summary.nextStep}</p>
      )}
    </div>
  );
};

const RoutineWorkflowSection = ({
  activeStep,
  scanResult,
  safeFixResult,
  isScanning,
  isFixingSafe,
  safeFixableCount,
  totalBlockingIssues,
  onRunScan,
  onRunSafeFix,
}) => {
  const scanSummary = summarizeScanResult(scanResult);
  const safeFixPlan = summarizeSafeFixPlan(scanResult);
  const safeFixSummary = summarizeSafeFixResult(safeFixResult);

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-bold text-gray-900">Data Cleanup & Repairs</h2>
        <p className="mt-2 max-w-3xl text-sm sm:text-base text-gray-600">
          Use this page to check data quality, apply safe fixes, and resolve any records
          that still need manual decisions.
        </p>
        <div className="mt-3 text-xs sm:text-sm text-gray-500">
          Last data check: {formatTimestamp(scanResult?.timestamp)}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Object.entries(WORKFLOW_STEPS).map(([stepId, step]) => {
          const numericStep = Number(stepId);
          const StepIcon = step.icon;
          const isActive = activeStep === numericStep;
          return (
            <article
              key={stepId}
              className={`rounded-xl border p-4 transition-colors ${
                isActive
                  ? "border-baylor-green bg-baylor-green/5"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700">
                  {stepId}
                </div>
                <StepIcon className="h-4 w-4 text-baylor-green" />
                <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
              </div>
              <p className="mt-2 text-sm text-gray-600">{step.description}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">1. Check data</h3>
            <p className="mt-1 text-sm text-gray-600">
              Find missing links, likely duplicates, unresolved import decisions, and
              records in older field formats.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunScan}
            disabled={isScanning}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-baylor-green px-4 py-2 text-sm font-semibold text-white hover:bg-baylor-green/90 disabled:opacity-60"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Run Data Check
              </>
            )}
          </button>
        </div>

        {scanResult && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-600">Items needing decisions</div>
              <div className="text-2xl font-bold text-gray-900">{totalBlockingIssues}</div>
            </div>
            <SummaryCard summary={scanSummary} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">2. Fix safe issues</h3>
            <p className="mt-1 text-sm text-gray-600">
              Run automatic cleanup for issues that can be repaired safely.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunSafeFix}
            disabled={!scanResult || safeFixableCount === 0 || isFixingSafe}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-baylor-green px-4 py-2 text-sm font-semibold text-baylor-green hover:bg-baylor-green/5 disabled:opacity-50"
          >
            {isFixingSafe ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4" />
                Run Safe Fixes ({safeFixableCount})
              </>
            )}
          </button>
        </div>

        <SummaryCard summary={safeFixPlan} />
        <SummaryCard summary={safeFixSummary} />
      </section>
    </section>
  );
};

export default RoutineWorkflowSection;
