import React, { useEffect, useMemo, useState } from "react";
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

  const confirmConfig = useMemo(() => {
    if (confirmType === "baseline") {
      return {
        variant: "danger",
        title: "Run full baseline repair?",
        message:
          "This can update many records across all terms. Only run this for large-scale cleanup.",
        confirmText: "Run Baseline",
        confirmDisabled: actions.isRunningBaseline,
        onConfirm: async () => {
          await actions.runBaseline();
        },
      };
    }

    if (confirmType === "location") {
      return {
        variant: "warning",
        title: "Apply location migration?",
        message:
          "This applies the location preview changes and can update many schedules and rooms.",
        confirmText: "Apply Migration",
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
        title: "Delete orphaned records?",
        message:
          "This permanently deletes orphaned records found in the selected term scan.",
        confirmText: "Delete Records",
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
          <h1 className="text-xl font-semibold text-red-800">Data Cleanup & Repairs</h1>
          <p className="mt-2 text-sm text-red-700">
            Admin access is required to open these tools.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <RoutineWorkflowSection
        activeStep={actions.activeStep}
        scanResult={actions.scanResult}
        safeFixResult={actions.safeFixResult}
        isScanning={actions.isScanning}
        isFixingSafe={actions.isFixingSafe}
        safeFixableCount={actions.safeFixableCount}
        totalBlockingIssues={actions.totalBlockingIssues}
        onRunScan={actions.handleScan}
        onRunSafeFix={actions.handleSafeFix}
      />

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
        onMarkDuplicateAsDistinct={actions.handleMarkDuplicateAsDistinct}
        onRepairSpaceIssue={actions.handleRepairSpaceIssue}
        onMarkConflictAsDistinct={actions.handleMarkConflictAsDistinct}
        onCopyValue={actions.handleCopyValue}
      />

      <RareRepairToolsSection
        isOpen={isRareOpen}
        onToggleOpen={() => setIsRareOpen((prev) => !prev)}
        isUnlocked={isRareUnlocked}
        onUnlock={() => {
          setIsRareUnlocked(true);
          showNotification?.(
            "warning",
            "Rare Tools Unlocked",
            "Use these tools only for unusual repair situations.",
          );
        }}
        termOptions={termOptions}
        baselineReport={actions.baselineReport}
        isRunningBaseline={actions.isRunningBaseline}
        onRequestBaselineConfirm={() => setConfirmType("baseline")}
        termCode={actions.termCode}
        setTermCode={actions.setTermCode}
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
