import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { useUI } from "../../../contexts/UIContext";
import { useSchedules } from "../../../contexts/ScheduleContext";
import ConfirmDialog from "../../shared/ConfirmDialog";
import DecisionReviewSection from "./DecisionReviewSection";
import RareRepairToolsSection from "./RareRepairToolsSection";
import RoutineWorkflowSection from "./RoutineWorkflowSection";
import useDataCleanupActions from "./useDataCleanupActions";

const DataCleanupRepairsPage = () => {
  const { isAdmin } = useAuth();
  const { showNotification } = useUI();
  const { termOptions = [], selectedTermMeta } = useSchedules();

  const actions = useDataCleanupActions({ showNotification });

  const [isRareOpen, setIsRareOpen] = useState(false);
  const [isRareUnlocked, setIsRareUnlocked] = useState(false);
  const [confirmType, setConfirmType] = useState("");
  const hasAutoScannedRef = useRef(false);

  useEffect(() => {
    if (!actions.termCode && selectedTermMeta?.termCode) {
      actions.setTermCode(selectedTermMeta.termCode);
    }
    if (!actions.orphanTermFilter && selectedTermMeta?.term) {
      actions.setOrphanTermFilter(selectedTermMeta.term);
    }
  }, [
    actions,
    actions.orphanTermFilter,
    actions.termCode,
    selectedTermMeta?.term,
    selectedTermMeta?.termCode,
  ]);

  useEffect(() => {
    if (!isAdmin || hasAutoScannedRef.current || actions.scanResult || actions.isScanning) {
      return;
    }
    hasAutoScannedRef.current = true;
    actions.handleScan();
  }, [actions, isAdmin]);

  const confirmConfig = useMemo(() => {
    if (confirmType === "baseline") {
      return {
        variant: "danger",
        title: "Run full data refresh?",
        message:
          "This can update many entries across all terms. Use it only for large cleanup with support guidance.",
        confirmText: "Run Refresh",
        confirmDisabled: actions.isRunningBaseline,
        onConfirm: async () => {
          await actions.runBaseline();
        },
      };
    }

    if (confirmType === "location") {
      return {
        variant: "warning",
        title: "Update room links?",
        message:
          "This applies the previewed room-link updates and can update many classes and rooms.",
        confirmText: "Update Links",
        confirmDisabled:
          actions.isApplyingLocationMigration || !actions.locationPreview,
        onConfirm: async () => {
          await actions.applyLocationChanges();
        },
      };
    }

    if (confirmType === "orphans") {
      return {
        variant: "danger",
        title: "Remove unused imported items?",
        message:
          "This permanently removes the unused imported items found in the selected term check.",
        confirmText: "Remove Items",
        confirmDisabled:
          actions.isApplyingOrphanCleanup || actions.orphanTotal === 0,
        onConfirm: async () => {
          await actions.applyOrphanCleanup();
        },
      };
    }

    return null;
  }, [confirmType, actions]);

  const closeConfirm = () => setConfirmType("");

  const handleConfirm = async () => {
    if (!confirmConfig?.onConfirm) return;
    try {
      await confirmConfig.onConfirm();
      closeConfirm();
    } catch (_error) {
      // Error notifications are handled in the action hook.
    }
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-800">
            Data Health Check
          </h1>
          <p className="mt-2 text-sm text-red-700">
            Admin access is required to open these tools.
          </p>
        </div>
      </div>
    );
  }

  const shouldShowDecisionQueue =
    Boolean(actions.scanResult) &&
    !actions.isScanning &&
    !actions.isFixingSafe &&
    actions.safeFixableCount === 0 &&
    actions.totalBlockingIssues > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      <RoutineWorkflowSection
        scanResult={actions.scanResult}
        safeFixResult={actions.safeFixResult}
        isScanning={actions.isScanning}
        isFixingSafe={actions.isFixingSafe}
        safeFixableCount={actions.safeFixableCount}
        totalBlockingIssues={actions.totalBlockingIssues}
        lastRunError={actions.lastRunError}
        onRunScan={actions.handleScan}
        onRunSafeFix={actions.handleSafeFix}
      />

      {shouldShowDecisionQueue && (
        <DecisionReviewSection
          scanResult={actions.scanResult}
          blockingCategories={actions.blockingCategories}
          totalBlockingIssues={actions.totalBlockingIssues}
          expandedCategories={actions.expandedCategories}
          pendingActionKey={actions.pendingActionKey}
          pendingMergeConfirmationKey={actions.pendingMergeConfirmationKey}
          isFixingSafe={actions.isFixingSafe}
          onToggleCategory={actions.toggleCategory}
          onRunSafeFix={actions.handleSafeFix}
          onMergeDuplicate={actions.handleMergeDuplicate}
          onCancelMergeConfirmation={actions.cancelMergeConfirmation}
          onMarkDuplicateAsDistinct={actions.handleMarkDuplicateAsDistinct}
          onRepairSpaceIssue={actions.handleRepairSpaceIssue}
          onMarkConflictAsDistinct={actions.handleMarkConflictAsDistinct}
          onCopyValue={actions.handleCopyValue}
        />
      )}

      <RareRepairToolsSection
        isOpen={isRareOpen}
        onToggleOpen={() => setIsRareOpen((prev) => !prev)}
        isUnlocked={isRareUnlocked}
        onUnlock={() => {
          setIsRareUnlocked(true);
          showNotification?.(
            "warning",
            "Support Tools Shown",
            "Use these tools only with support guidance.",
          );
        }}
        termOptions={termOptions}
        baselinePreviewReport={actions.baselinePreviewReport}
        isLoadingBaselinePreview={actions.isLoadingBaselinePreview}
        onLoadBaselinePreview={actions.loadBaselinePreview}
        baselineReport={actions.baselineReport}
        isRunningBaseline={actions.isRunningBaseline}
        onRequestBaselineConfirm={() => setConfirmType("baseline")}
        termCode={actions.termCode}
        setTermCode={actions.setTermCode}
        termRepairPreviewReport={actions.termRepairPreviewReport}
        isLoadingTermRepairPreview={actions.isLoadingTermRepairPreview}
        onLoadTermRepairPreview={actions.loadTermRepairPreview}
        termRepairReport={actions.termRepairReport}
        isRunningTermRepair={actions.isRunningTermRepair}
        onRunTermRepair={actions.runTermRepair}
        locationPreview={actions.locationPreview}
        locationApplyReport={actions.locationApplyReport}
        isLoadingLocationPreview={actions.isLoadingLocationPreview}
        isApplyingLocationMigration={actions.isApplyingLocationMigration}
        onLoadLocationPreview={actions.loadLocationPreview}
        onRequestLocationConfirm={() => setConfirmType("location")}
        orphanTermFilter={actions.orphanTermFilter}
        setOrphanTermFilter={actions.setOrphanTermFilter}
        orphanScan={actions.orphanScan}
        orphanCleanupResult={actions.orphanCleanupResult}
        orphanTotal={actions.orphanTotal}
        isScanningOrphans={actions.isScanningOrphans}
        isApplyingOrphanCleanup={actions.isApplyingOrphanCleanup}
        onScanOrphans={actions.scanOrphans}
        onRequestOrphanConfirm={() => setConfirmType("orphans")}
      />

      <ConfirmDialog
        isOpen={Boolean(confirmConfig)}
        variant={confirmConfig?.variant || "warning"}
        title={confirmConfig?.title || "Confirm"}
        message={confirmConfig?.message || "Are you sure?"}
        confirmText={confirmConfig?.confirmText || "Confirm"}
        cancelText="Cancel"
        confirmDisabled={Boolean(confirmConfig?.confirmDisabled)}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
        icon={ShieldAlert}
      />
    </div>
  );
};

export default DataCleanupRepairsPage;
