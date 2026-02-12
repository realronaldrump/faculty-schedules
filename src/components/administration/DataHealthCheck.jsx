import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Wrench,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  scanDataHealth,
  autoFixAllIssues,
  mergePeople,
  mergeRoomRecords,
  mergeScheduleRecords,
  markNotDuplicate,
  repairScheduleSpaceLinksForSchedule,
} from "../../utils/dataHygiene";
import { useUI } from "../../contexts/UIContext";

const STEP_COPY = {
  1: {
    title: "Scan",
    description:
      "Run a quick integrity scan. This only checks issues that can block reliable scheduling.",
    icon: Search,
  },
  2: {
    title: "Canonicalize",
    description:
      "Run full automatic canonicalization: legacy cleanup, standardization, linking, and safe integrity fixes.",
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

const toArray = (value) => (Array.isArray(value) ? value : []);

const getPersonLabel = (person = {}) => {
  const explicitName = (person?.name || "").toString().trim();
  if (explicitName) return explicitName;
  const composedName = `${person?.firstName || ""} ${person?.lastName || ""}`.trim();
  if (composedName) return composedName;
  return person?.email || person?.id || "Unknown person";
};

const getScheduleLabel = (schedule = {}) => {
  const term = schedule?.term || schedule?.termCode || "No term";
  const courseId = [schedule?.courseCode, schedule?.section].filter(Boolean).join(" ");
  if (courseId) return `${courseId} (${term})`;
  if (schedule?.courseTitle) return `${schedule.courseTitle} (${term})`;
  if (schedule?.id) return `Schedule ${schedule.id} (${term})`;
  return `Unlabeled schedule (${term})`;
};

const getRoomLabel = (room = {}) =>
  room?.displayName || room?.spaceKey || room?.id || "Unknown room";

const formatConfidence = (confidence) =>
  `${Math.round(Number(confidence || 0) * 100)}%`;

const getDuplicatePairKey = (duplicate = {}) => {
  const [primary, secondary] = toArray(duplicate.records);
  return `${duplicate?.entityType || "unknown"}:${primary?.id || "none"}:${secondary?.id || "none"}`;
};

const getSpaceRepairKey = (issue = {}) =>
  `repair-space:${issue?.record?.id || "unknown"}`;

const getTeachingConflictKey = (conflict = {}) => {
  const [scheduleA, scheduleB] = toArray(conflict.schedules);
  return `teaching-conflict:${scheduleA?.id || "none"}:${scheduleB?.id || "none"}`;
};

const getLegacyIssueKey = (issue = {}) =>
  `legacy:${issue?.recordType || "unknown"}:${issue?.record?.id || issue?.id || "unknown"}`;

const DataHealthCheck = () => {
  const navigate = useNavigate();
  const { showNotification } = useUI();
  const [activeStep, setActiveStep] = useState(1);
  const [scanResult, setScanResult] = useState(null);
  const [safeFixResult, setSafeFixResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFixingSafe, setIsFixingSafe] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [pendingMergeConfirmationKey, setPendingMergeConfirmationKey] = useState("");

  const blockingCategories = useMemo(() => {
    if (!scanResult?.issues) {
      return [];
    }

    const orphaned = toArray(scanResult.issues.orphaned);
    const duplicates = scanResult.issues.duplicates || {};
    const scheduleDuplicates = toArray(duplicates.schedules).filter(
      (entry) => Number(entry?.confidence || 0) >= 0.98,
    );
    const peopleDuplicates = toArray(duplicates.people).filter(
      (entry) => Number(entry?.confidence || 0) >= 0.95,
    );
    const roomDuplicates = toArray(duplicates.rooms).filter(
      (entry) => Number(entry?.confidence || 0) >= 0.95,
    );
    const unresolvedImportIssues = toArray(scanResult.issues.unresolvedImportIssues);
    const teachingConflicts = toArray(scanResult.issues.teachingConflicts);
    const legacyModelIssues = toArray(scanResult.issues.legacyModelIssues);

    const orphanedInstructorReferences = orphaned.filter(
      (issue) => issue?.type === "orphaned_schedule",
    );
    const orphanedSpaceReferences = orphaned.filter(
      (issue) => issue?.type === "orphaned_space",
    );
    const highConfidenceDuplicates = [
      ...scheduleDuplicates.map((entry) => ({ ...entry, entityType: "schedules" })),
      ...peopleDuplicates.map((entry) => ({ ...entry, entityType: "people" })),
      ...roomDuplicates.map((entry) => ({ ...entry, entityType: "rooms" })),
    ];

    return [
      {
        id: "orphaned-instructors",
        label: "Orphaned instructor references",
        count: orphanedInstructorReferences.length,
        description:
          "Schedules with missing or invalid instructor links.",
        items: orphanedInstructorReferences,
      },
      {
        id: "orphaned-spaces",
        label: "Orphaned space references",
        count: orphanedSpaceReferences.length,
        description: "Schedules that reference spaces not available in rooms.",
        items: orphanedSpaceReferences,
      },
      {
        id: "high-confidence-duplicates",
        label: "High-confidence duplicates",
        count: highConfidenceDuplicates.length,
        description:
          "Records that look like the same entity and can cause duplicate/conflict noise.",
        items: highConfidenceDuplicates,
      },
      {
        id: "unresolved-import-issues",
        label: "Unresolved import-linked issues",
        count: unresolvedImportIssues.length,
        description:
          "Import runs in queue-for-review that still need link/create/exclude decisions.",
        items: unresolvedImportIssues,
      },
      {
        id: "teaching-conflicts",
        label: "Teaching conflicts",
        count: teachingConflicts.length,
        description:
          "Potential instructor overlaps not already suppressed by link groups.",
        items: teachingConflicts,
      },
      {
        id: "legacy-model-issues",
        label: "Legacy model issues",
        count: legacyModelIssues.length,
        description:
          "Records with legacy mirrored fields that should be normalized to canonical format.",
        items: legacyModelIssues,
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
      Number(auto.orphanedSchedulesWithName || 0) +
      Number(auto.orphanedSpaceLinks || 0) +
      Number(auto.legacyModelIssues || 0)
    );
  }, [scanResult]);

  const refreshScanResult = async () => {
    const refreshed = await scanDataHealth();
    setScanResult(refreshed);
    return refreshed;
  };

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const result = await scanDataHealth();
      setScanResult(result);
      setSafeFixResult(null);
      setActiveStep(result?.canAutoFix ? 2 : 3);
      setExpandedCategories({});
      setPendingMergeConfirmationKey("");
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
      let result = null;
      let refreshed = null;
      let passCount = 0;
      const maxPasses = 2;

      while (passCount < maxPasses) {
        passCount += 1;
        result = await autoFixAllIssues({
          fixLegacyModel: true,
          standardizeData: true,
          backfillInstructorIds: true,
          mergeHighConfidenceDuplicates: true,
          fixLocations: true,
        });
        refreshed = await refreshScanResult();
        const remainingLegacy = Array.isArray(refreshed?.issues?.legacyModelIssues)
          ? refreshed.issues.legacyModelIssues.length
          : 0;
        if (remainingLegacy === 0) break;
      }

      setSafeFixResult({
        ...(result || {}),
        passes: passCount,
        postScan: refreshed || null,
      });
      setActiveStep(3);
      setExpandedCategories({});
      setPendingMergeConfirmationKey("");
      const remainingLegacy = Array.isArray(refreshed?.issues?.legacyModelIssues)
        ? refreshed.issues.legacyModelIssues.length
        : 0;
      if (remainingLegacy === 0) {
        showNotification?.(
          "success",
          "Canonicalization Complete",
          "Automatic canonical cleanup and integrity repairs are complete.",
        );
      } else {
        showNotification?.(
          "warning",
          "Canonicalization Partially Complete",
          `${remainingLegacy} legacy-model issue${remainingLegacy === 1 ? "" : "s"} still need manual review.`,
        );
      }
    } catch (error) {
      showNotification?.(
        "error",
        "Canonicalization Failed",
        error?.message || "Could not run automatic canonicalization.",
      );
    } finally {
      setIsFixingSafe(false);
    }
  };

  const handleCopyValue = async (value, label = "ID") => {
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(value));
        showNotification?.("success", "Copied", `${label} copied to clipboard.`);
      } else {
        throw new Error("Clipboard is not available in this browser.");
      }
    } catch (error) {
      showNotification?.(
        "warning",
        "Copy Failed",
        error?.message || "Could not copy to clipboard.",
      );
    }
  };

  const handleMergeDuplicate = async (duplicate) => {
    const [primary, secondary] = toArray(duplicate?.records);
    if (!primary?.id || !secondary?.id || !duplicate?.entityType) {
      showNotification?.(
        "error",
        "Merge Failed",
        "This duplicate entry does not contain two valid records.",
      );
      return;
    }

    const duplicatePairKey = getDuplicatePairKey(duplicate);
    if (pendingMergeConfirmationKey !== duplicatePairKey) {
      setPendingMergeConfirmationKey(duplicatePairKey);
      showNotification?.(
        "warning",
        "Confirm Merge",
        "Click Merge Records again to confirm this merge.",
      );
      return;
    }

    const actionKey = `merge:${duplicatePairKey}`;
    setPendingActionKey(actionKey);
    setPendingMergeConfirmationKey("");
    try {
      if (duplicate.entityType === "people") {
        await mergePeople(primary.id, secondary.id);
      } else if (duplicate.entityType === "schedules") {
        await mergeScheduleRecords(duplicate);
      } else if (duplicate.entityType === "rooms") {
        await mergeRoomRecords(duplicate);
      } else {
        throw new Error("Unsupported duplicate type.");
      }
      await refreshScanResult();
      showNotification?.(
        "success",
        "Duplicate Merged",
        "The duplicate records were merged successfully.",
      );
    } catch (error) {
      showNotification?.(
        "error",
        "Merge Failed",
        error?.message || "Could not merge duplicate records.",
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const handleMarkDuplicateAsDistinct = async (duplicate) => {
    const [primary, secondary] = toArray(duplicate?.records);
    if (!primary?.id || !secondary?.id || !duplicate?.entityType) {
      showNotification?.(
        "error",
        "Action Failed",
        "This duplicate entry does not contain two valid records.",
      );
      return;
    }

    const actionKey = `distinct:${getDuplicatePairKey(duplicate)}`;
    setPendingActionKey(actionKey);
    try {
      await markNotDuplicate({
        entityType: duplicate.entityType,
        idA: primary.id,
        idB: secondary.id,
        reason: "Marked from Data Health Check",
      });
      await refreshScanResult();
      showNotification?.(
        "success",
        "Marked Not Duplicate",
        "This pair will be suppressed from duplicate/conflict checks.",
      );
      setPendingMergeConfirmationKey("");
    } catch (error) {
      showNotification?.(
        "error",
        "Action Failed",
        error?.message || "Could not mark this pair as not duplicate.",
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const handleRepairSpaceIssue = async (issue) => {
    const scheduleId = issue?.record?.id;
    if (!scheduleId) {
      showNotification?.(
        "error",
        "Repair Failed",
        "This issue does not include a schedule ID.",
      );
      return;
    }

    const actionKey = getSpaceRepairKey(issue);
    setPendingActionKey(actionKey);
    try {
      const result = await repairScheduleSpaceLinksForSchedule(scheduleId);
      await refreshScanResult();
      showNotification?.(
        "success",
        "Space Link Repair Complete",
        `Updated ${result?.schedulesUpdated || 0} schedule record${
          (result?.schedulesUpdated || 0) === 1 ? "" : "s"
        }.`,
      );
    } catch (error) {
      showNotification?.(
        "error",
        "Repair Failed",
        error?.message || "Could not repair schedule space links.",
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const handleMarkConflictAsDistinct = async (conflict) => {
    const [scheduleA, scheduleB] = toArray(conflict?.schedules);
    if (!scheduleA?.id || !scheduleB?.id) {
      showNotification?.(
        "error",
        "Action Failed",
        "This conflict does not include two valid schedules.",
      );
      return;
    }

    const actionKey = `distinct:${getTeachingConflictKey(conflict)}`;
    setPendingActionKey(actionKey);
    try {
      await markNotDuplicate({
        entityType: "schedules",
        idA: scheduleA.id,
        idB: scheduleB.id,
        reason: "Marked from teaching conflict review in Data Health Check",
      });
      await refreshScanResult();
      showNotification?.(
        "success",
        "Conflict Suppressed",
        "The selected schedule pair was marked as not duplicate.",
      );
      setPendingMergeConfirmationKey("");
    } catch (error) {
      showNotification?.(
        "error",
        "Action Failed",
        error?.message || "Could not suppress this conflict pair.",
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const toggleCategory = (categoryId) => {
    setExpandedCategories((prev) => {
      const nextValue = !(prev[categoryId] ?? true);
      return {
        ...prev,
        [categoryId]: nextValue,
      };
    });
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
              teaching conflicts, and legacy model drift.
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
            <h3 className="text-lg font-semibold text-gray-900">Step 2: Run Canonicalization</h3>
            <p className="text-sm text-gray-600 mt-1">
              One-click canonicalization runs legacy cleanup, standardization,
              instructor linking, duplicate merge, and location repairs.
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
                Run Canonicalization ({safeFixableCount})
              </>
            )}
          </button>
        </div>

        {safeFixResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-semibold">Canonicalization complete</span>
            </div>
            <div className="mt-2 text-sm text-green-900">
              Merged {safeFixResult?.duplicates?.peopleMerged || 0} people duplicates,
              {` `}
              {safeFixResult?.duplicates?.schedulesMerged || 0} schedule
              duplicates, standardized {safeFixResult?.standardization?.updated || 0} records,
              linked {safeFixResult?.instructorLinks?.linked || 0} instructor references,
              repaired {safeFixResult?.locations?.schedulesUpdated || 0} schedule space links,
              fixed {safeFixResult?.legacyModel?.fixed || 0} legacy records, and updated
              {` `}{safeFixResult?.locations?.roomsUpdated || 0} rooms
              {safeFixResult?.passes ? ` in ${safeFixResult.passes} pass${safeFixResult.passes === 1 ? "" : "es"}` : ""}.
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
              Expand each category to review specific items and resolve them directly.
            </p>
          </div>
        </div>

        {scanResult ? (
          <div className="mt-4 space-y-3">
            {blockingCategories
              .filter((category) => category.count > 0)
              .map((category) => {
                const isExpanded = expandedCategories[category.id] ?? true;
                return (
                  <div
                    key={category.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className="w-full text-left flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
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
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {category.items.map((item, index) => {
                          if (category.id === "orphaned-instructors") {
                            const schedule = item?.record || {};
                            const missingInstructorIds = toArray(item?.missingInstructorIds);
                            return (
                              <div
                                key={`${schedule?.id || "orphaned-instructor"}:${index}`}
                                className="rounded-md border border-gray-200 bg-white p-3"
                              >
                                <div className="text-sm font-medium text-gray-900">
                                  {getScheduleLabel(schedule)}
                                </div>
                                <div className="mt-1 text-xs text-gray-600">
                                  {item?.reason || "Instructor assignment is missing or invalid."}
                                </div>
                                {missingInstructorIds.length > 0 && (
                                  <div className="mt-1 text-xs text-gray-500">
                                    Missing instructor IDs: {missingInstructorIds.join(", ")}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => navigate("/courses/manage")}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    Open Courses Manage
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyValue(schedule?.id, "Schedule ID")}
                                    disabled={!schedule?.id}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Copy Schedule ID
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (category.id === "orphaned-spaces") {
                            const schedule = item?.record || {};
                            const missingSpaceIds = toArray(item?.missingSpaceIds);
                            const repairActionKey = getSpaceRepairKey(item);
                            const isRepairing = pendingActionKey === repairActionKey;
                            return (
                              <div
                                key={`${schedule?.id || "orphaned-space"}:${index}`}
                                className="rounded-md border border-gray-200 bg-white p-3"
                              >
                                <div className="text-sm font-medium text-gray-900">
                                  {getScheduleLabel(schedule)}
                                </div>
                                <div className="mt-1 text-xs text-gray-600">
                                  {item?.reason || "Schedule references one or more invalid spaces."}
                                </div>
                                {missingSpaceIds.length > 0 && (
                                  <div className="mt-1 text-xs text-gray-500">
                                    Missing space IDs: {missingSpaceIds.join(", ")}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRepairSpaceIssue(item)}
                                    disabled={Boolean(pendingActionKey)}
                                    className="inline-flex items-center rounded-md bg-baylor-green px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-baylor-green/90 disabled:opacity-50"
                                  >
                                    {isRepairing ? "Repairing..." : "Repair Space Link"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => navigate("/facilities/spaces")}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    Open Space Management
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyValue(schedule?.id, "Schedule ID")}
                                    disabled={!schedule?.id}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Copy Schedule ID
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (category.id === "high-confidence-duplicates") {
                            const [primary, secondary] = toArray(item?.records);
                            const entityLabel =
                              item?.entityType === "people"
                                ? "People"
                                : item?.entityType === "rooms"
                                  ? "Rooms"
                                  : "Schedules";
                            const primaryLabel =
                              item?.entityType === "people"
                                ? getPersonLabel(primary)
                                : item?.entityType === "rooms"
                                  ? getRoomLabel(primary)
                                  : getScheduleLabel(primary);
                            const secondaryLabel =
                              item?.entityType === "people"
                                ? getPersonLabel(secondary)
                                : item?.entityType === "rooms"
                                  ? getRoomLabel(secondary)
                                  : getScheduleLabel(secondary);
                            const duplicatePairKey = getDuplicatePairKey(item);
                            const mergeActionKey = `merge:${duplicatePairKey}`;
                            const distinctActionKey = `distinct:${duplicatePairKey}`;
                            const isMerging = pendingActionKey === mergeActionKey;
                            const isMarkingDistinct = pendingActionKey === distinctActionKey;
                            const isAwaitingMergeConfirmation =
                              pendingMergeConfirmationKey === duplicatePairKey;

                            return (
                              <div
                                key={`${duplicatePairKey}:${index}`}
                                className="rounded-md border border-gray-200 bg-white p-3"
                              >
                                <div className="text-sm font-medium text-gray-900">
                                  {entityLabel}: {primaryLabel} + {secondaryLabel}
                                </div>
                                <div className="mt-1 text-xs text-gray-600">
                                  {formatConfidence(item?.confidence)} match
                                  {item?.reason ? ` • ${item.reason}` : ""}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleMergeDuplicate(item)}
                                    disabled={Boolean(pendingActionKey)}
                                    className="inline-flex items-center rounded-md bg-baylor-green px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-baylor-green/90 disabled:opacity-50"
                                  >
                                    {isMerging
                                      ? "Merging..."
                                      : isAwaitingMergeConfirmation
                                        ? "Confirm Merge"
                                        : "Merge Records"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMarkDuplicateAsDistinct(item)}
                                    disabled={Boolean(pendingActionKey)}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    {isMarkingDistinct ? "Saving..." : "Mark Not Duplicate"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyValue(
                                        [primary?.id, secondary?.id].filter(Boolean).join(", "),
                                        "Record IDs",
                                      )
                                    }
                                    disabled={!primary?.id && !secondary?.id}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Copy IDs
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (category.id === "unresolved-import-issues") {
                            const issueId = item?.issueId || "";
                            const transactionId = item?.transactionId || "";
                            const semester = item?.semester || "Unknown semester";
                            return (
                              <div
                                key={`${transactionId || "import"}:${issueId || index}`}
                                className="rounded-md border border-gray-200 bg-white p-3"
                              >
                                <div className="text-sm font-medium text-gray-900">
                                  Transaction {transactionId || "Unknown"} • {semester}
                                </div>
                                <div className="mt-1 text-xs text-gray-600">
                                  {(item?.importType || "schedule").toString()} issue
                                  {issueId ? ` • ${issueId}` : ""}
                                  {item?.reason ? ` • ${item.reason}` : ""}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => navigate("/admin-tools/import-wizard")}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    Open Import Wizard
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyValue(transactionId, "Transaction ID")
                                    }
                                    disabled={!transactionId}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Copy Transaction ID
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (category.id === "teaching-conflicts") {
                            const [scheduleA, scheduleB] = toArray(item?.schedules);
                            const conflictKey = getTeachingConflictKey(item);
                            const markDistinctActionKey = `distinct:${conflictKey}`;
                            const isMarkingDistinct =
                              pendingActionKey === markDistinctActionKey;
                            return (
                              <div
                                key={`${conflictKey}:${index}`}
                                className="rounded-md border border-gray-200 bg-white p-3"
                              >
                                <div className="text-sm font-medium text-gray-900">
                                  {getScheduleLabel(scheduleA)} vs {getScheduleLabel(scheduleB)}
                                </div>
                                <div className="mt-1 text-xs text-gray-600">
                                  {item?.day ? `${item.day}: ` : ""}
                                  {item?.overlapDescription || item?.reason || "Overlapping meeting times"}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleMarkConflictAsDistinct(item)}
                                    disabled={Boolean(pendingActionKey)}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    {isMarkingDistinct ? "Saving..." : "Mark Not Duplicate"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => navigate("/courses/manage")}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    Open Courses Manage
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyValue(
                                        [scheduleA?.id, scheduleB?.id].filter(Boolean).join(", "),
                                        "Schedule IDs",
                                      )
                                    }
                                    disabled={!scheduleA?.id && !scheduleB?.id}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Copy Schedule IDs
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (category.id === "legacy-model-issues") {
                            const issueKey = getLegacyIssueKey(item);
                            const recordType = (item?.recordType || "record")
                              .toString()
                              .replace(/s$/, "");
                            const recordId = item?.record?.id || "";
                            const touchedFields = toArray(item?.touchedFields);
                            return (
                              <div
                                key={`${issueKey}:${index}`}
                                className="rounded-md border border-gray-200 bg-white p-3"
                              >
                                <div className="text-sm font-medium text-gray-900">
                                  Legacy {recordType} cleanup: {recordId || "Unknown ID"}
                                </div>
                                <div className="mt-1 text-xs text-gray-600">
                                  {item?.message || "Legacy mirrored fields detected."}
                                </div>
                                {touchedFields.length > 0 && (
                                  <div className="mt-1 text-xs text-gray-500">
                                    Fields: {touchedFields.join(", ")}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyValue(recordId, "Record ID")}
                                    disabled={!recordId}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Copy Record ID
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`${category.id}:fallback:${index}`}
                              className="rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-600"
                            >
                              Unknown issue format.
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

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
