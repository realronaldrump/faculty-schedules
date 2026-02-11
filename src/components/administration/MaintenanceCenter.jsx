import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Database,
  Loader2,
  ShieldAlert,
  Wrench,
  CheckCircle2,
  Search,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useUI } from "../../contexts/UIContext";
import {
  runPostImportCleanup,
  previewLocationMigration,
  applyLocationMigration,
  runHistoricalBaselineBackfill,
} from "../../utils/dataHygiene";
import {
  findOrphanedImportedData,
  cleanupOrphanedImportedData,
} from "../../utils/importTransactionUtils";

const CONFIRM_TOKENS = {
  baseline: "ESTABLISH BASELINE",
  locationMigration: "MIGRATE LOCATIONS",
  orphanCleanup: "DELETE ORPHANED",
};

const MaintenanceCenter = () => {
  const { isAdmin } = useAuth();
  const { showNotification } = useUI();

  const [baselineConfirm, setBaselineConfirm] = useState("");
  const [baselineReport, setBaselineReport] = useState(null);
  const [isRunningBaseline, setIsRunningBaseline] = useState(false);

  const [termCode, setTermCode] = useState("");
  const [termRepairReport, setTermRepairReport] = useState(null);
  const [isRunningTermRepair, setIsRunningTermRepair] = useState(false);

  const [locationConfirm, setLocationConfirm] = useState("");
  const [locationPreview, setLocationPreview] = useState(null);
  const [isLoadingLocationPreview, setIsLoadingLocationPreview] = useState(false);
  const [isApplyingLocationMigration, setIsApplyingLocationMigration] = useState(false);

  const [orphanConfirm, setOrphanConfirm] = useState("");
  const [orphanTermFilter, setOrphanTermFilter] = useState("");
  const [orphanScan, setOrphanScan] = useState(null);
  const [isScanningOrphans, setIsScanningOrphans] = useState(false);
  const [isApplyingOrphanCleanup, setIsApplyingOrphanCleanup] = useState(false);

  const baselineReady =
    baselineConfirm.trim().toUpperCase() === CONFIRM_TOKENS.baseline;
  const locationReady =
    locationConfirm.trim().toUpperCase() === CONFIRM_TOKENS.locationMigration;
  const orphanReady =
    orphanConfirm.trim().toUpperCase() === CONFIRM_TOKENS.orphanCleanup;

  const orphanTotal = useMemo(() => Number(orphanScan?.total || 0), [orphanScan]);

  const runBaseline = async () => {
    setIsRunningBaseline(true);
    try {
      const report = await runHistoricalBaselineBackfill();
      setBaselineReport(report);
      showNotification?.(
        "success",
        "Baseline Complete",
        `Processed ${report?.summary?.totalSchedulesProcessed || 0} schedules across all terms.`,
      );
    } catch (error) {
      showNotification?.(
        "error",
        "Baseline Failed",
        error?.message || "Failed to establish all-term baseline.",
      );
    } finally {
      setIsRunningBaseline(false);
    }
  };

  const runTermRepair = async () => {
    const normalized = termCode.trim();
    if (!normalized) {
      showNotification?.(
        "warning",
        "Term Code Required",
        "Enter a term code before running a term repair.",
      );
      return;
    }

    setIsRunningTermRepair(true);
    try {
      const report = await runPostImportCleanup({ termCode: normalized });
      setTermRepairReport(report);
      showNotification?.(
        "success",
        "Term Repair Complete",
        `Repaired ${report?.spaceLinkRepairs?.schedulesUpdated || 0} schedule links for ${normalized}.`,
      );
    } catch (error) {
      showNotification?.(
        "error",
        "Term Repair Failed",
        error?.message || "Failed to run term repair.",
      );
    } finally {
      setIsRunningTermRepair(false);
    }
  };

  const loadLocationPreview = async () => {
    setIsLoadingLocationPreview(true);
    try {
      const preview = await previewLocationMigration();
      setLocationPreview(preview);
    } catch (error) {
      showNotification?.(
        "error",
        "Preview Failed",
        error?.message || "Could not generate location migration preview.",
      );
    } finally {
      setIsLoadingLocationPreview(false);
    }
  };

  const applyLocationChanges = async () => {
    setIsApplyingLocationMigration(true);
    try {
      const report = await applyLocationMigration();
      setLocationPreview((prev) => ({ ...prev, lastApply: report }));
      showNotification?.(
        "success",
        "Location Migration Complete",
        `Updated ${report?.stats?.rooms?.updated || 0} rooms and ${report?.stats?.schedules?.updated || 0} schedules.`,
      );
    } catch (error) {
      showNotification?.(
        "error",
        "Location Migration Failed",
        error?.message || "Failed to apply location migration.",
      );
    } finally {
      setIsApplyingLocationMigration(false);
    }
  };

  const scanOrphans = async () => {
    const normalizedTerm = orphanTermFilter.trim();
    if (!normalizedTerm) {
      showNotification?.(
        "warning",
        "Term Required",
        "Enter the semester label (for example, Spring 2026) before scanning.",
      );
      return;
    }

    setIsScanningOrphans(true);
    try {
      const report = await findOrphanedImportedData(normalizedTerm);
      setOrphanScan(report);
    } catch (error) {
      showNotification?.(
        "error",
        "Orphan Scan Failed",
        error?.message || "Could not scan for orphaned imported records.",
      );
    } finally {
      setIsScanningOrphans(false);
    }
  };

  const applyOrphanCleanup = async () => {
    if (!orphanScan || orphanTotal === 0) {
      showNotification?.("info", "No Orphans", "No orphaned records found.");
      return;
    }

    setIsApplyingOrphanCleanup(true);
    try {
      const result = await cleanupOrphanedImportedData(orphanScan, true);
      showNotification?.(
        "success",
        "Orphan Cleanup Complete",
        `Deleted ${result?.deleted || 0} records from ${orphanTermFilter.trim()}.`,
      );
      const refreshed = await findOrphanedImportedData(orphanTermFilter.trim());
      setOrphanScan(refreshed);
    } catch (error) {
      showNotification?.(
        "error",
        "Orphan Cleanup Failed",
        error?.message || "Failed to clean orphaned records.",
      );
    } finally {
      setIsApplyingOrphanCleanup(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-800">Maintenance Center</h1>
          <p className="mt-2 text-sm text-red-700">
            Admin access is required to open maintenance tools.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Maintenance Center</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 max-w-3xl">
              Advanced repair and destructive operations live here. Routine users should
              stay in Data Health Check.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-red-200 bg-red-50 p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-red-900">
              Establish Clean Baseline (All Terms)
            </h2>
            <p className="text-sm text-red-800 mt-1">
              One-time all-term backfill: identity repair, cross-list link groups,
              space-link repair, canonical room normalization, and high-confidence dedupe.
            </p>
          </div>
        </div>

        <label className="block text-sm font-medium text-red-900">
          Type <code>{CONFIRM_TOKENS.baseline}</code> to continue
        </label>
        <input
          type="text"
          value={baselineConfirm}
          onChange={(event) => setBaselineConfirm(event.target.value)}
          className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm"
          placeholder={CONFIRM_TOKENS.baseline}
        />

        <button
          type="button"
          onClick={runBaseline}
          disabled={!baselineReady || isRunningBaseline}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {isRunningBaseline ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running Baseline...
            </>
          ) : (
            <>
              <Database className="h-4 w-4" />
              Establish Baseline
            </>
          )}
        </button>

        {baselineReport && (
          <details className="rounded-lg border border-red-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-red-900">
              View Baseline Report
            </summary>
            <pre className="mt-2 text-xs overflow-x-auto text-red-900">
              {JSON.stringify(baselineReport, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Term-Scoped Legacy Repair</h2>
        <p className="text-sm text-gray-600">
          Run finalize-style cleanup on one term when you are repairing historical drift.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={termCode}
            onChange={(event) => setTermCode(event.target.value)}
            placeholder="Example: 202510"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={runTermRepair}
            disabled={isRunningTermRepair}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-baylor-green px-4 py-2 text-sm font-semibold text-baylor-green hover:bg-baylor-green/5 disabled:opacity-50"
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
        </div>

        {termRepairReport && (
          <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-800">
              View Term Repair Report
            </summary>
            <pre className="mt-2 text-xs overflow-x-auto text-gray-700">
              {JSON.stringify(termRepairReport, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Canonical Location Migration</h2>
        <p className="text-sm text-gray-600">
          Preview and apply full location canonicalization. This can change many records.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadLocationPreview}
            disabled={isLoadingLocationPreview}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoadingLocationPreview ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Preview Migration
              </>
            )}
          </button>
        </div>

        <label className="block text-sm font-medium text-gray-700">
          Type <code>{CONFIRM_TOKENS.locationMigration}</code> to apply
        </label>
        <input
          type="text"
          value={locationConfirm}
          onChange={(event) => setLocationConfirm(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder={CONFIRM_TOKENS.locationMigration}
        />

        <button
          type="button"
          onClick={applyLocationChanges}
          disabled={!locationReady || isApplyingLocationMigration}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
        >
          {isApplyingLocationMigration ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Applying Migration...
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4" />
              Apply Location Migration
            </>
          )}
        </button>

        {locationPreview && (
          <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-800">
              View Migration Preview
            </summary>
            <pre className="mt-2 text-xs overflow-x-auto text-gray-700">
              {JSON.stringify(locationPreview, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Orphan Cleanup</h2>
        <p className="text-sm text-gray-600">
          Detect and remove orphaned records for a specific semester only.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Semester label (required)
          </label>
          <input
            type="text"
            value={orphanTermFilter}
            onChange={(event) => {
              setOrphanTermFilter(event.target.value);
              setOrphanScan(null);
            }}
            placeholder="Example: Spring 2026"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={scanOrphans}
          disabled={isScanningOrphans || !orphanTermFilter.trim()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {isScanningOrphans ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Scan for Orphans
            </>
          )}
        </button>

        {orphanScan && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            Found {orphanTotal} orphaned record{orphanTotal === 1 ? "" : "s"} in {orphanTermFilter.trim()}.
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700">
          Type <code>{CONFIRM_TOKENS.orphanCleanup}</code> to delete
        </label>
        <input
          type="text"
          value={orphanConfirm}
          onChange={(event) => setOrphanConfirm(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder={CONFIRM_TOKENS.orphanCleanup}
        />

        <button
          type="button"
          onClick={applyOrphanCleanup}
          disabled={!orphanReady || orphanTotal === 0 || isApplyingOrphanCleanup}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {isApplyingOrphanCleanup ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Delete Orphaned Records
            </>
          )}
        </button>
      </section>
    </div>
  );
};

export default MaintenanceCenter;
