import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Wrench,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { scanDataHealth, autoFixAllIssues } from "../../utils/dataHygiene";
import { useUI } from "../../contexts/UIContext";

const STEP_COPY = {
  1: {
    title: "Scan",
    description:
      "Run a quick integrity scan. This only checks issues that can block reliable scheduling.",
    icon: Search,
  },
  2: {
    title: "Fix Safe Issues",
    description:
      "Apply safe automatic repairs for room links and high-confidence duplicates.",
    icon: Wrench,
  },
  3: {
    title: "Review Required Decisions",
    description:
      "Handle only the few items that need human decisions.",
    icon: ClipboardCheck,
  },
};

const formatTimestamp = (value) => {
  if (!value) return "Not run yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not run yet";
  return date.toLocaleString();
};

const DataHealthCheck = () => {
  const navigate = useNavigate();
  const { showNotification } = useUI();
  const [activeStep, setActiveStep] = useState(1);
  const [scanResult, setScanResult] = useState(null);
  const [safeFixResult, setSafeFixResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFixingSafe, setIsFixingSafe] = useState(false);

  const blockingCategories = useMemo(() => {
    if (!scanResult?.issues) {
      return [];
    }

    const orphaned = Array.isArray(scanResult.issues.orphaned)
      ? scanResult.issues.orphaned
      : [];
    const duplicates = scanResult.issues.duplicates || {};
    const scheduleDuplicates = Array.isArray(duplicates.schedules)
      ? duplicates.schedules.filter((entry) => Number(entry?.confidence || 0) >= 0.98)
      : [];
    const peopleDuplicates = Array.isArray(duplicates.people)
      ? duplicates.people.filter((entry) => Number(entry?.confidence || 0) >= 0.95)
      : [];
    const roomDuplicates = Array.isArray(duplicates.rooms)
      ? duplicates.rooms.filter((entry) => Number(entry?.confidence || 0) >= 0.95)
      : [];
    const unresolvedImportIssues = Array.isArray(scanResult.issues.unresolvedImportIssues)
      ? scanResult.issues.unresolvedImportIssues
      : [];
    const teachingConflicts = Array.isArray(scanResult.issues.teachingConflicts)
      ? scanResult.issues.teachingConflicts
      : [];

    const orphanedInstructorReferences = orphaned.filter(
      (issue) => issue?.type === "orphaned_schedule",
    );
    const orphanedSpaceReferences = orphaned.filter(
      (issue) => issue?.type === "orphaned_space",
    );

    return [
      {
        id: "orphaned-instructors",
        label: "Orphaned instructor references",
        count: orphanedInstructorReferences.length,
        description:
          "Schedules with missing or invalid instructor links.",
      },
      {
        id: "orphaned-spaces",
        label: "Orphaned space references",
        count: orphanedSpaceReferences.length,
        description: "Schedules that reference spaces not available in rooms.",
      },
      {
        id: "high-confidence-duplicates",
        label: "High-confidence duplicates",
        count:
          scheduleDuplicates.length + peopleDuplicates.length + roomDuplicates.length,
        description:
          "Records that look like the same entity and can cause duplicate/conflict noise.",
      },
      {
        id: "unresolved-import-issues",
        label: "Unresolved import-linked issues",
        count: unresolvedImportIssues.length,
        description:
          "Import runs in queue-for-review that still need link/create/exclude decisions.",
      },
      {
        id: "teaching-conflicts",
        label: "Teaching conflicts",
        count: teachingConflicts.length,
        description:
          "Potential instructor overlaps not already suppressed by link groups.",
      },
    ];
  }, [scanResult]);

  const totalBlockingIssues = useMemo(
    () => blockingCategories.reduce((total, item) => total + item.count, 0),
    [blockingCategories],
  );

  const safeFixableCount = useMemo(() => {
    if (!scanResult?.autoFixable) return 0;
    const auto = scanResult.autoFixable;
    return (
      Number(auto.highConfidencePeopleDuplicates || 0) +
      Number(auto.highConfidenceScheduleDuplicates || 0) +
      Number(auto.highConfidenceRoomDuplicates || 0) +
      Number(auto.orphanedSpaceLinks || 0)
    );
  }, [scanResult]);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const result = await scanDataHealth();
      setScanResult(result);
      setSafeFixResult(null);
      setActiveStep(result?.canAutoFix ? 2 : 3);
      showNotification?.(
        "success",
        "Scan Complete",
        `Found ${result?.summary?.blockingIssues ?? totalBlockingIssues} blocking integrity issue${
          (result?.summary?.blockingIssues ?? totalBlockingIssues) === 1 ? "" : "s"
        }`,
      );
    } catch (error) {
      showNotification?.(
        "error",
        "Scan Failed",
        error?.message || "Unable to scan data health.",
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleSafeFix = async () => {
    setIsFixingSafe(true);
    try {
      const result = await autoFixAllIssues({
        standardizeData: false,
        backfillInstructorIds: false,
        mergeHighConfidenceDuplicates: true,
        fixLocations: true,
      });
      setSafeFixResult(result);
      const refreshed = await scanDataHealth();
      setScanResult(refreshed);
      setActiveStep(3);
      showNotification?.(
        "success",
        "Safe Fixes Applied",
        "Automatic integrity repairs are complete.",
      );
    } catch (error) {
      showNotification?.(
        "error",
        "Safe Fix Failed",
        error?.message || "Could not apply automatic fixes.",
      );
    } finally {
      setIsFixingSafe(false);
    }
  };

  const openMaintenance = () => {
    navigate("/admin/maintenance");
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Health Check</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 max-w-3xl">
              Routine checks focus on only what can block reliable schedules.
              Everything else belongs in quality cleanup or maintenance.
            </p>
            <div className="mt-3 text-xs sm:text-sm text-gray-500">
              Last scan: {formatTimestamp(scanResult?.timestamp)}
            </div>
          </div>
          <button
            type="button"
            onClick={openMaintenance}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Open Maintenance Center
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Object.entries(STEP_COPY).map(([stepId, step]) => {
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
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700">
                  {stepId}
                </div>
                <StepIcon className="h-4 w-4 text-baylor-green" />
                <h2 className="text-sm font-semibold text-gray-900">{step.title}</h2>
              </div>
              <p className="mt-2 text-sm text-gray-600">{step.description}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Step 1: Scan</h3>
            <p className="text-sm text-gray-600 mt-1">
              Check orphaned references, blocking duplicates, unresolved import issues,
              and teaching conflicts.
            </p>
          </div>
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-baylor-green px-4 py-2 text-sm font-semibold text-white hover:bg-baylor-green/90 disabled:opacity-60"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Run Health Scan
              </>
            )}
          </button>
        </div>

        {scanResult && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-gray-600">Blocking integrity issues</div>
              <div className="text-2xl font-bold text-gray-900">{totalBlockingIssues}</div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {blockingCategories.map((category) => (
                <div
                  key={category.id}
                  className="rounded-md border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-gray-900">{category.label}</div>
                    <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      {category.count}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{category.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Step 2: Fix Safe Issues</h3>
            <p className="text-sm text-gray-600 mt-1">
              Only automatic, low-risk repairs are run here.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSafeFix}
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
                Fix Safe Issues ({safeFixableCount})
              </>
            )}
          </button>
        </div>

        {safeFixResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-semibold">Safe fixes complete</span>
            </div>
            <div className="mt-2 text-sm text-green-900">
              Merged {safeFixResult?.duplicates?.peopleMerged || 0} people duplicates,
              {` `}
              {safeFixResult?.duplicates?.schedulesMerged || 0} schedule
              duplicates, repaired {safeFixResult?.locations?.schedulesUpdated || 0} schedule
              space links, and updated {safeFixResult?.locations?.roomsUpdated || 0} rooms.
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-baylor-gold mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Step 3: Review Required Decisions
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              If any issues remain, they are true decision points and should be
              reviewed by an admin.
            </p>
          </div>
        </div>

        {scanResult ? (
          <div className="mt-4 space-y-3">
            {blockingCategories
              .filter((category) => category.count > 0)
              .map((category) => (
                <div
                  key={category.id}
                  className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {category.label}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {category.description}
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                    {category.count} item{category.count === 1 ? "" : "s"}
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              ))}

            {totalBlockingIssues === 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                No blocking integrity issues found. Routine data hygiene is not needed.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            Run Step 1 first to populate review items.
          </div>
        )}
      </section>
    </div>
  );
};

export default DataHealthCheck;
