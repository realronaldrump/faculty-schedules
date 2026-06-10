import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  DATA_HEALTH_STATES,
  buildRoutineCleanupPreview,
  buildDataHealthViewModel,
} from "./reportFormatters";

const STATE_ICON = {
  [DATA_HEALTH_STATES.checking]: Loader2,
  [DATA_HEALTH_STATES.cleanupReady]: Sparkles,
  [DATA_HEALTH_STATES.cleaning]: Loader2,
  [DATA_HEALTH_STATES.needsChoice]: AlertCircle,
  [DATA_HEALTH_STATES.allClear]: CheckCircle2,
  [DATA_HEALTH_STATES.error]: AlertCircle,
};

const STATE_TONE = {
  [DATA_HEALTH_STATES.checking]: {
    ring: "border-baylor-green/20 bg-baylor-green/5 text-baylor-green",
    icon: "text-baylor-green",
  },
  [DATA_HEALTH_STATES.cleanupReady]: {
    ring: "border-baylor-gold/40 bg-baylor-gold/10 text-baylor-green",
    icon: "text-baylor-green",
  },
  [DATA_HEALTH_STATES.cleaning]: {
    ring: "border-baylor-green/20 bg-baylor-green/5 text-baylor-green",
    icon: "text-baylor-green",
  },
  [DATA_HEALTH_STATES.needsChoice]: {
    ring: "border-baylor-gold/40 bg-baylor-gold/10 text-baylor-green",
    icon: "text-baylor-green",
  },
  [DATA_HEALTH_STATES.allClear]: {
    ring: "border-baylor-green/20 bg-baylor-green/5 text-baylor-green",
    icon: "text-baylor-green",
  },
  [DATA_HEALTH_STATES.error]: {
    ring: "border-red-200 bg-red-50 text-red-800",
    icon: "text-red-700",
  },
};

const PrimaryActionButton = ({
  viewModel,
  isScanning,
  isFixingSafe,
  scanResult,
  safeFixableCount,
  onRunScan,
  onRunSafeFix,
}) => {
  const isBusy =
    viewModel.state === DATA_HEALTH_STATES.checking ||
    viewModel.state === DATA_HEALTH_STATES.cleaning;

  if (isBusy) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-500"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        {viewModel.primaryLabel}
      </button>
    );
  }

  if (viewModel.primaryAction === "cleanup") {
    return (
      <button
        type="button"
        onClick={onRunSafeFix}
        disabled={!scanResult || safeFixableCount === 0 || isFixingSafe}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-baylor-green px-4 py-2 text-sm font-semibold text-white hover:bg-baylor-green/90 disabled:opacity-50"
      >
        <Wrench className="h-4 w-4" />
        {viewModel.primaryLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onRunScan}
      disabled={isScanning}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-baylor-green px-4 py-2 text-sm font-semibold text-baylor-green hover:bg-baylor-green/5 disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${isScanning ? "animate-spin" : ""}`} />
      {viewModel.primaryLabel}
    </button>
  );
};

const RoutineWorkflowSection = ({
  scanResult,
  safeFixResult,
  isScanning,
  isFixingSafe,
  safeFixableCount,
  totalBlockingIssues,
  lastRunError,
  onRunScan,
  onRunSafeFix,
}) => {
  const [isRoutinePreviewOpen, setIsRoutinePreviewOpen] = useState(false);
  const viewModel = buildDataHealthViewModel({
    scanResult,
    safeFixResult,
    isScanning,
    isFixingSafe,
    safeFixableCount,
    totalBlockingIssues,
    lastRunError,
  });
  const Icon = STATE_ICON[viewModel.state] || Sparkles;
  const tone = STATE_TONE[viewModel.state] || STATE_TONE[DATA_HEALTH_STATES.checking];
  const showCleanupNote = viewModel.hasCleanupResult && !isFixingSafe;
  const routinePreview = useMemo(
    () => buildRoutineCleanupPreview(scanResult),
    [scanResult],
  );
  const canShowRoutinePreview =
    Boolean(scanResult) && Number(safeFixableCount || 0) > 0 && !isFixingSafe;

  useEffect(() => {
    if (!canShowRoutinePreview) {
      setIsRoutinePreviewOpen(false);
    }
  }, [canShowRoutinePreview]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${tone.ring}`}
          >
            <Icon
              className={`h-5 w-5 ${tone.icon} ${
                viewModel.state === DATA_HEALTH_STATES.checking ||
                viewModel.state === DATA_HEALTH_STATES.cleaning
                  ? "animate-spin"
                  : ""
              }`}
            />
          </div>
          <div>
            <div className="text-sm font-semibold text-baylor-green">
              {viewModel.eyebrow}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-gray-950">
              {viewModel.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
              {viewModel.description}
            </p>
          </div>
        </div>

        <PrimaryActionButton
          viewModel={viewModel}
          isScanning={isScanning}
          isFixingSafe={isFixingSafe}
          scanResult={scanResult}
          safeFixableCount={safeFixableCount}
          onRunScan={onRunScan}
          onRunSafeFix={onRunSafeFix}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {viewModel.metrics.map((metric) => {
          const isRoutineMetric = metric.label === "Routine cleanup";
          const isInteractiveRoutineMetric =
            isRoutineMetric && canShowRoutinePreview;
          const metricContent = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-medium text-gray-500">
                  {metric.label}
                </div>
                {isInteractiveRoutineMetric &&
                  (isRoutinePreviewOpen ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ))}
              </div>
              <div className="mt-1 text-base font-semibold text-gray-950">
                {metric.value}
              </div>
              {isInteractiveRoutineMetric && (
                <div className="mt-2 text-xs font-medium text-baylor-green">
                  Preview cleanup
                </div>
              )}
            </>
          );

          if (isInteractiveRoutineMetric) {
            return (
              <button
                key={metric.label}
                type="button"
                aria-controls="routine-cleanup-preview"
                aria-expanded={isRoutinePreviewOpen}
                onClick={() => setIsRoutinePreviewOpen((prev) => !prev)}
                className="rounded-lg border border-baylor-gold/40 bg-baylor-gold/10 px-4 py-3 text-left transition hover:border-baylor-gold/60 hover:bg-baylor-gold/20 focus:outline-none focus:ring-2 focus:ring-baylor-green/40"
              >
                {metricContent}
              </button>
            );
          }

          return (
            <div
              key={metric.label}
              className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
            >
              {metricContent}
            </div>
          );
        })}
      </div>

      {isRoutinePreviewOpen && (
        <div
          id="routine-cleanup-preview"
          className="mt-3 rounded-lg border border-baylor-gold/30 bg-baylor-gold/5 p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-baylor-gold/40 bg-white text-baylor-green">
              <ListChecks className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-950">
                Routine cleanup preview
              </div>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                This preview comes from the latest data health check. Click
                Clean up routine items to apply these updates.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {routinePreview.map((category) => {
              const hiddenExampleCount = Math.max(
                0,
                Number(category.count || 0) - category.examples.length,
              );

              return (
                <div
                  key={category.id}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-950">
                      {category.label}
                    </div>
                    <div className="rounded-full bg-baylor-green/10 px-2 py-0.5 text-xs font-semibold text-baylor-green">
                      {category.count}
                    </div>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-gray-600">
                    {category.description}
                  </p>
                  {category.examples.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-gray-700">
                      {category.examples.map((example, index) => (
                        <li
                          key={`${category.id}:${example}:${index}`}
                          className="flex gap-2"
                        >
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-baylor-green/60" />
                          <span>{example}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {hiddenExampleCount > 0 && (
                    <div className="mt-2 text-xs font-medium text-gray-500">
                      {hiddenExampleCount} more included
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCleanupNote && (
        <div className="mt-4 rounded-lg border border-baylor-green/20 bg-baylor-green/5 px-4 py-3 text-sm text-baylor-green">
          Routine cleanup finished, and the app checked the data again afterward.
        </div>
      )}

      {viewModel.errorMessage && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {viewModel.errorMessage}
        </div>
      )}
    </section>
  );
};

export default RoutineWorkflowSection;
