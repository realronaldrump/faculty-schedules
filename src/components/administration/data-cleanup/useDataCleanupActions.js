import { useMemo, useState } from "react";
import {
  scanDataHealth,
  autoFixAllIssues,
  mergePeople,
  mergeRoomRecords,
  mergeScheduleRecords,
  markNotDuplicate,
  repairScheduleSpaceLinksForSchedule,
  previewHistoricalBaselineBackfill,
  runHistoricalBaselineBackfill,
  previewPostImportCleanup,
  runPostImportCleanup,
  previewLocationMigration,
  applyLocationMigration,
} from "../../../utils/dataHygiene";
import {
  findOrphanedImportedData,
  cleanupOrphanedImportedData,
} from "../../../utils/import/core";
import {
  buildBlockingCategories,
  getDuplicatePairKey,
  getSafeFixableCount,
  getSpaceRepairKey,
  getTeachingConflictKey,
  getTotalBlockingIssues,
  toArray,
} from "./reportFormatters";

const notify = (showNotification, type, title, message) => {
  showNotification?.(type, title, message);
};

const useDataCleanupActions = ({ showNotification } = {}) => {
  const [activeStep, setActiveStep] = useState(1);
  const [scanResult, setScanResult] = useState(null);
  const [safeFixResult, setSafeFixResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFixingSafe, setIsFixingSafe] = useState(false);
  const [lastRunError, setLastRunError] = useState("");

  const [expandedCategories, setExpandedCategories] = useState({});
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [pendingMergeConfirmationKey, setPendingMergeConfirmationKey] =
    useState("");

  const [baselineReport, setBaselineReport] = useState(null);
  const [baselinePreviewReport, setBaselinePreviewReport] = useState(null);
  const [isLoadingBaselinePreview, setIsLoadingBaselinePreview] = useState(false);
  const [isRunningBaseline, setIsRunningBaseline] = useState(false);

  const [termCode, setTermCode] = useState("");
  const [termRepairReport, setTermRepairReport] = useState(null);
  const [termRepairPreviewReport, setTermRepairPreviewReport] = useState(null);
  const [isLoadingTermRepairPreview, setIsLoadingTermRepairPreview] = useState(false);
  const [isRunningTermRepair, setIsRunningTermRepair] = useState(false);

  const [locationPreview, setLocationPreview] = useState(null);
  const [locationApplyReport, setLocationApplyReport] = useState(null);
  const [isLoadingLocationPreview, setIsLoadingLocationPreview] = useState(false);
  const [isApplyingLocationMigration, setIsApplyingLocationMigration] =
    useState(false);

  const [orphanTermFilter, setOrphanTermFilter] = useState("");
  const [orphanScan, setOrphanScan] = useState(null);
  const [orphanCleanupResult, setOrphanCleanupResult] = useState(null);
  const [isScanningOrphans, setIsScanningOrphans] = useState(false);
  const [isApplyingOrphanCleanup, setIsApplyingOrphanCleanup] = useState(false);

  const blockingCategories = useMemo(
    () => buildBlockingCategories(scanResult),
    [scanResult],
  );

  const totalBlockingIssues = useMemo(
    () => getTotalBlockingIssues(blockingCategories),
    [blockingCategories],
  );

  const safeFixableCount = useMemo(
    () => getSafeFixableCount(scanResult),
    [scanResult],
  );

  const orphanTotal = useMemo(() => Number(orphanScan?.total || 0), [orphanScan]);

  const refreshScanResult = async () => {
    const refreshed = await scanDataHealth();
    setScanResult(refreshed);
    return refreshed;
  };

  const handleScan = async () => {
    setIsScanning(true);
    setLastRunError("");
    try {
      const result = await scanDataHealth();
      setScanResult(result);
      setSafeFixResult(null);
      setActiveStep(result?.canAutoFix ? 2 : 3);
      setExpandedCategories({});
      setPendingMergeConfirmationKey("");
      const issues = Number(result?.summary?.blockingIssues || 0);
      notify(
        showNotification,
        "success",
        "Data Health Check Complete",
        `Found ${issues} item${issues === 1 ? "" : "s"} that may need your choice.`,
      );
    } catch (error) {
      setLastRunError(error?.message || "Unable to check data health.");
      notify(
        showNotification,
        "error",
        "Data Health Check Could Not Finish",
        error?.message || "Unable to check data health.",
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleSafeFix = async () => {
    setIsFixingSafe(true);
    setLastRunError("");
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
      const errorCount = Array.isArray(result?.errors) ? result.errors.length : 0;
      const firstError =
        errorCount > 0 ? String(result.errors[0] || "").trim() : "";

      if (remainingLegacy === 0) {
        notify(
          showNotification,
          "success",
          "Routine Cleanup Complete",
          "Routine cleanup finished.",
        );
      } else {
        const summaryParts = [
          `${remainingLegacy} older-format item${remainingLegacy === 1 ? "" : "s"} still need review.`,
        ];
        if (errorCount > 0) {
          summaryParts.push(
            `${errorCount} cleanup note${errorCount === 1 ? "" : "s"} found.`,
          );
        }
        if (firstError) {
          summaryParts.push(`First note: ${firstError}`);
        }
        notify(
          showNotification,
          "warning",
          "Routine Cleanup Needs Review",
          summaryParts.join(" "),
        );
      }
    } catch (error) {
      setLastRunError(error?.message || "Could not run routine cleanup.");
      notify(
        showNotification,
        "error",
        "Routine Cleanup Could Not Finish",
        error?.message || "Could not run routine cleanup.",
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
        notify(showNotification, "success", "Copied", `${label} copied to clipboard.`);
      } else {
        throw new Error("Clipboard is not available in this browser.");
      }
    } catch (error) {
      notify(
        showNotification,
        "warning",
        "Copy Failed",
        error?.message || "Could not copy to clipboard.",
      );
    }
  };

  const handleMergeDuplicate = async (duplicate) => {
    const [primary, secondary] = toArray(duplicate?.records);
    if (!primary?.id || !secondary?.id || !duplicate?.entityType) {
      notify(
        showNotification,
        "error",
        "Merge Failed",
        "This duplicate entry does not include two valid items.",
      );
      return;
    }

    const duplicatePairKey = getDuplicatePairKey(duplicate);
    if (pendingMergeConfirmationKey !== duplicatePairKey) {
      setPendingMergeConfirmationKey(duplicatePairKey);
      notify(
        showNotification,
        "warning",
        "Review Merge",
        "Confirm the merge inside the item card.",
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
      notify(
        showNotification,
        "success",
        "Duplicate Merged",
        "The entries were merged successfully.",
      );
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Merge Failed",
        error?.message || "Could not merge duplicate entries.",
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const handleMarkDuplicateAsDistinct = async (duplicate) => {
    const [primary, secondary] = toArray(duplicate?.records);
    if (!primary?.id || !secondary?.id || !duplicate?.entityType) {
      notify(
        showNotification,
        "error",
        "Action Failed",
        "This duplicate entry does not include two valid items.",
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
      notify(
        showNotification,
        "success",
        "Marked As Separate",
        "This pair will be ignored in duplicate/conflict checks.",
      );
      setPendingMergeConfirmationKey("");
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Action Failed",
        error?.message || "Could not mark this pair as separate.",
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const handleRepairSpaceIssue = async (issue) => {
    const scheduleId = issue?.record?.id;
    if (!scheduleId) {
      notify(
        showNotification,
        "error",
        "Room Link Update Could Not Finish",
        "This issue does not include a schedule ID.",
      );
      return;
    }

    const actionKey = getSpaceRepairKey(issue);
    setPendingActionKey(actionKey);

    try {
      const result = await repairScheduleSpaceLinksForSchedule(scheduleId);
      await refreshScanResult();
      notify(
        showNotification,
        "success",
        "Room Link Updated",
        `Updated ${result?.schedulesUpdated || 0} schedule entr${
          (result?.schedulesUpdated || 0) === 1 ? "y" : "ies"
        }.`,
      );
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Room Link Update Could Not Finish",
        error?.message || "Could not update schedule room links.",
      );
    } finally {
      setPendingActionKey("");
    }
  };

  const handleMarkConflictAsDistinct = async (conflict) => {
    const [scheduleA, scheduleB] = toArray(conflict?.schedules);
    if (!scheduleA?.id || !scheduleB?.id) {
      notify(
        showNotification,
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
        reason: "Marked from conflict review in Data Health Check",
      });
      await refreshScanResult();
      notify(
        showNotification,
        "success",
        "Conflict Suppressed",
        "The selected schedule pair is now marked as separate.",
      );
      setPendingMergeConfirmationKey("");
    } catch (error) {
      notify(
        showNotification,
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

  const cancelMergeConfirmation = () => {
    setPendingMergeConfirmationKey("");
  };

  const runBaseline = async () => {
    setIsRunningBaseline(true);
    try {
      const report = await runHistoricalBaselineBackfill();
      setBaselineReport(report);
      setBaselinePreviewReport(report);
      notify(
        showNotification,
        "success",
        "Full Data Refresh Complete",
        `Processed ${report?.summary?.totalSchedulesProcessed || 0} schedules across all terms.`,
      );
      return report;
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Full Data Refresh Could Not Finish",
        error?.message || "Failed to run full data refresh.",
      );
      throw error;
    } finally {
      setIsRunningBaseline(false);
    }
  };

  const loadBaselinePreview = async () => {
    setIsLoadingBaselinePreview(true);
    try {
      const preview = await previewHistoricalBaselineBackfill();
      setBaselinePreviewReport(preview);
      notify(
        showNotification,
        "success",
        "Full Data Refresh Preview Ready",
        `Previewed ${preview?.summary?.totalSchedulesProcessed || 0} schedules across all terms.`,
      );
      return preview;
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Full Data Refresh Preview Could Not Finish",
        error?.message || "Failed to preview full data refresh.",
      );
      throw error;
    } finally {
      setIsLoadingBaselinePreview(false);
    }
  };

  const updateTermCode = (value) => {
    setTermCode(value);
    setTermRepairPreviewReport(null);
    setTermRepairReport(null);
  };

  const loadTermRepairPreview = async () => {
    const normalized = termCode.trim();
    if (!normalized) {
      notify(
        showNotification,
        "warning",
        "Term Required",
        "Choose a term before previewing a term refresh.",
      );
      return null;
    }

    setIsLoadingTermRepairPreview(true);
    try {
      const preview = await previewPostImportCleanup({ termCode: normalized });
      setTermRepairPreviewReport(preview);
      notify(
        showNotification,
        "success",
        "Term Refresh Preview Ready",
        `Previewed refresh actions for ${normalized}.`,
      );
      return preview;
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Term Preview Could Not Finish",
        error?.message || "Failed to preview the term refresh.",
      );
      throw error;
    } finally {
      setIsLoadingTermRepairPreview(false);
    }
  };

  const runTermRepair = async () => {
    const normalized = termCode.trim();
    if (!normalized) {
      notify(
        showNotification,
        "warning",
        "Term Required",
        "Choose a term before refreshing a term.",
      );
      return null;
    }

    setIsRunningTermRepair(true);
    try {
      const report = await runPostImportCleanup({ termCode: normalized });
      setTermRepairReport(report);
      setTermRepairPreviewReport(report);
      notify(
        showNotification,
        "success",
        "Term Refresh Complete",
        `Updated ${report?.spaceLinkRepairs?.schedulesUpdated || 0} schedule links for ${normalized}.`,
      );
      return report;
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Term Refresh Could Not Finish",
        error?.message || "Failed to refresh the term.",
      );
      throw error;
    } finally {
      setIsRunningTermRepair(false);
    }
  };

  const loadLocationPreview = async () => {
    setIsLoadingLocationPreview(true);
    try {
      const preview = await previewLocationMigration();
      setLocationPreview(preview);
      setLocationApplyReport(null);
      notify(
        showNotification,
        "success",
        "Room Link Preview Ready",
        "Room link preview has been generated.",
      );
      return preview;
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Room Link Preview Could Not Finish",
        error?.message || "Could not preview room link updates.",
      );
      throw error;
    } finally {
      setIsLoadingLocationPreview(false);
    }
  };

  const applyLocationChanges = async () => {
    setIsApplyingLocationMigration(true);
    try {
      const report = await applyLocationMigration();
      setLocationApplyReport(report);
      notify(
        showNotification,
        "success",
        "Room Link Update Complete",
        `Updated ${report?.roomsUpdated || 0} rooms and ${report?.schedulesUpdated || 0} schedules.`,
      );
      return report;
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Room Link Update Could Not Finish",
        error?.message || "Failed to update room links.",
      );
      throw error;
    } finally {
      setIsApplyingLocationMigration(false);
    }
  };

  const updateOrphanTermFilter = (value) => {
    setOrphanTermFilter(value);
    setOrphanScan(null);
    setOrphanCleanupResult(null);
  };

  const scanOrphans = async () => {
    const normalizedTerm = orphanTermFilter.trim();
    if (!normalizedTerm) {
      notify(
        showNotification,
        "warning",
        "Term Required",
        "Choose a term before checking for unused imported items.",
      );
      return null;
    }

    setIsScanningOrphans(true);
    try {
      const report = await findOrphanedImportedData(normalizedTerm);
      setOrphanScan(report);
      setOrphanCleanupResult(null);
      notify(
        showNotification,
        "success",
        "Unused Imported Items Check Complete",
        `Found ${report?.total || 0} unused imported item${(report?.total || 0) === 1 ? "" : "s"}.`,
      );
      return report;
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Unused Imported Items Check Could Not Finish",
        error?.message || "Could not check for unused imported items.",
      );
      throw error;
    } finally {
      setIsScanningOrphans(false);
    }
  };

  const applyOrphanCleanup = async () => {
    if (!orphanScan || orphanTotal === 0) {
      notify(
        showNotification,
        "info",
        "No Unused Items Found",
        "There are no unused imported items to remove for this term.",
      );
      return null;
    }

    setIsApplyingOrphanCleanup(true);
    try {
      const result = await cleanupOrphanedImportedData(orphanScan, true);
      setOrphanCleanupResult(result);
      notify(
        showNotification,
        "success",
        "Unused Imported Items Removed",
        `Removed ${result?.deleted || 0} unused imported item${(result?.deleted || 0) === 1 ? "" : "s"}.`,
      );
      const refreshed = await findOrphanedImportedData(orphanTermFilter.trim());
      setOrphanScan(refreshed);
      return result;
    } catch (error) {
      notify(
        showNotification,
        "error",
        "Unused Imported Items Could Not Be Removed",
        error?.message || "Failed to remove unused imported items.",
      );
      throw error;
    } finally {
      setIsApplyingOrphanCleanup(false);
    }
  };

  return {
    activeStep,
    setActiveStep,
    scanResult,
    safeFixResult,
    isScanning,
    isFixingSafe,
    lastRunError,
    blockingCategories,
    totalBlockingIssues,
    safeFixableCount,
    expandedCategories,
    pendingActionKey,
    pendingMergeConfirmationKey,

    baselineReport,
    baselinePreviewReport,
    isLoadingBaselinePreview,
    isRunningBaseline,
    termCode,
    termRepairReport,
    termRepairPreviewReport,
    isLoadingTermRepairPreview,
    isRunningTermRepair,
    locationPreview,
    locationApplyReport,
    isLoadingLocationPreview,
    isApplyingLocationMigration,
    orphanTermFilter,
    orphanScan,
    orphanCleanupResult,
    orphanTotal,
    isScanningOrphans,
    isApplyingOrphanCleanup,

    handleScan,
    handleSafeFix,
    handleCopyValue,
    handleMergeDuplicate,
    handleMarkDuplicateAsDistinct,
    handleRepairSpaceIssue,
    handleMarkConflictAsDistinct,
    toggleCategory,
    cancelMergeConfirmation,

    loadBaselinePreview,
    runBaseline,
    setTermCode: updateTermCode,
    loadTermRepairPreview,
    runTermRepair,
    loadLocationPreview,
    applyLocationChanges,
    setOrphanTermFilter: updateOrphanTermFilter,
    scanOrphans,
    applyOrphanCleanup,
  };
};

export default useDataCleanupActions;
