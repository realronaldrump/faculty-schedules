import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useSchedules } from "../../contexts/ScheduleContext.jsx";
import { useUI } from "../../contexts/UIContext.jsx";
import { useAppConfig } from "../../contexts/AppConfigContext.jsx";
import ConfirmDialog from "../shared/ConfirmDialog";
import {
  BULK_EXPORT_SHEET_IDS,
  INDIVIDUAL_EXPORT_OPTIONS,
} from "../../utils/export/adminExportSchemas";
import {
  buildAdminExportPackage,
  getBulkFileName,
  getIndividualFileName,
  LARGE_EXPORT_ROW_THRESHOLD,
} from "../../utils/export/adminExportData";

const TERM_SCOPE_ALL = "all";
const TERM_SCOPE_SELECTED = "selected";

const waitForPaint = () =>
  new Promise((resolve) => {
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });

const AdminDataExportsPage = () => {
  const { isAdmin } = useAuth();
  const { showNotification } = useUI();
  const { buildingConfig } = useAppConfig();
  const { selectedSemester, termOptions, getTermByLabel } = useSchedules();

  const [termScope, setTermScope] = useState(TERM_SCOPE_ALL);
  const [selectedTerm, setSelectedTerm] = useState(selectedSemester || "");
  const [isExporting, setIsExporting] = useState(false);
  const [activeExportId, setActiveExportId] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [pageError, setPageError] = useState("");
  const [warningState, setWarningState] = useState({
    isOpen: false,
    pending: null,
  });

  useEffect(() => {
    if (selectedSemester && !selectedTerm) {
      setSelectedTerm(selectedSemester);
    }
  }, [selectedSemester, selectedTerm]);

  const selectedTermMeta = useMemo(
    () => getTermByLabel(selectedTerm) || null,
    [getTermByLabel, selectedTerm],
  );

  const normalizedTermOptions = useMemo(
    () => (Array.isArray(termOptions) ? termOptions : []),
    [termOptions],
  );

  const requiresSelectedTerm = termScope === TERM_SCOPE_SELECTED;
  const canRunSelectedTermExport = !requiresSelectedTerm || Boolean(selectedTerm);

  const buildPackageAndMaybeWarn = async ({ sheetIds, exportLabel, isBulk }) => {
    const exportPackage = await buildAdminExportPackage({
      sheetIds,
      termScope,
      selectedTerm,
      selectedTermMeta,
      buildingConfig,
    });

    if (isBulk && exportPackage.totalRows > LARGE_EXPORT_ROW_THRESHOLD) {
      const fileName = getBulkFileName({ termScopeInfo: exportPackage.termScopeInfo });
      setWarningState({
        isOpen: true,
        pending: {
          exportPackage,
          fileName,
          exportLabel,
        },
      });
      return null;
    }

    return exportPackage;
  };

  const executeWorkbookDownload = async ({
    exportPackage,
    fileName,
    successTitle,
    successMessage,
  }) => {
    setExportStatus("Loading workbook tools...");
    await waitForPaint();
    const { downloadAdminWorkbook } = await import(
      "../../utils/export/adminWorkbookBuilder"
    );

    await downloadAdminWorkbook({
      fileName,
      sheetIds: exportPackage.sheetIds,
      rowsBySheetId: exportPackage.rowsBySheetId,
      summaryRows: exportPackage.summaryRows,
      onProgress: setExportStatus,
    });

    showNotification("success", successTitle, successMessage);
  };

  const runExport = async ({ sheetIds, exportLabel, isBulk = false }) => {
    if (isExporting) return;

    if (!canRunSelectedTermExport) {
      showNotification(
        "warning",
        "Select a Semester",
        "Choose a semester before running a selected-semester export.",
      );
      return;
    }

    setPageError("");
    setIsExporting(true);
    setActiveExportId(exportLabel);

    try {
      const exportPackage = await buildPackageAndMaybeWarn({
        sheetIds,
        exportLabel,
        isBulk,
      });

      // Warning modal path stores pending package and exits early.
      if (!exportPackage) {
        return;
      }

      const fileName = isBulk
        ? getBulkFileName({ termScopeInfo: exportPackage.termScopeInfo })
        : getIndividualFileName({ label: exportLabel });

      await executeWorkbookDownload({
        exportPackage,
        fileName,
        successTitle: "Export Complete",
        successMessage: `${fileName} downloaded successfully.`,
      });
    } catch (error) {
      console.error("Export failed:", error);
      const message =
        error?.message || "Unable to generate the workbook. Please try again.";
      setPageError(message);
      showNotification("error", "Export Failed", message);
    } finally {
      setIsExporting(false);
      setActiveExportId("");
      setExportStatus("");
    }
  };

  const handleConfirmLargeExport = async () => {
    const pending = warningState.pending;
    if (!pending) {
      setWarningState({ isOpen: false, pending: null });
      return;
    }

    setWarningState({ isOpen: false, pending: null });
    setIsExporting(true);
    setActiveExportId(pending.exportLabel);

    try {
      await executeWorkbookDownload({
        exportPackage: pending.exportPackage,
        fileName: pending.fileName,
        successTitle: "Large Export Complete",
        successMessage: `${pending.fileName} downloaded successfully.`,
      });
    } catch (error) {
      console.error("Large export failed:", error);
      const message =
        error?.message || "Unable to complete the large export download.";
      setPageError(message);
      showNotification("error", "Export Failed", message);
    } finally {
      setIsExporting(false);
      setActiveExportId("");
      setExportStatus("");
    }
  };

  const closeWarningDialog = () => {
    setWarningState({ isOpen: false, pending: null });
    setIsExporting(false);
    setActiveExportId("");
    setExportStatus("");
  };

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-gray-700">
        Only administrators can access the Data Exports page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Data Exports</h1>
        <p className="text-gray-600">
          Export operational data to clean Excel workbooks for departmental
          administration.
        </p>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">Semester Scope</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="term-scope"
                  value={TERM_SCOPE_ALL}
                  checked={termScope === TERM_SCOPE_ALL}
                  onChange={() => setTermScope(TERM_SCOPE_ALL)}
                  className="h-4 w-4 text-baylor-green border-gray-300"
                />
                All semesters
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="term-scope"
                  value={TERM_SCOPE_SELECTED}
                  checked={termScope === TERM_SCOPE_SELECTED}
                  onChange={() => setTermScope(TERM_SCOPE_SELECTED)}
                  className="h-4 w-4 text-baylor-green border-gray-300"
                />
                Selected semester
              </label>
            </div>

            {termScope === TERM_SCOPE_SELECTED && (
              <div className="max-w-sm">
                <label
                  htmlFor="selected-term"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Select semester
                </label>
                <select
                  id="selected-term"
                  value={selectedTerm}
                  onChange={(event) => setSelectedTerm(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                >
                  <option value="">Choose a semester...</option>
                  {normalizedTermOptions.map((term) => (
                    <option key={term.termCode || term.term} value={term.term}>
                      {term.term}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            onClick={() =>
              runExport({
                sheetIds: BULK_EXPORT_SHEET_IDS,
                exportLabel: "bulk",
                isBulk: true,
              })
            }
            disabled={isExporting || !canRunSelectedTermExport}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-baylor-green text-white hover:bg-baylor-green/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isExporting && activeExportId === "bulk" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Export Everything (Workbook)
          </button>
        </div>

        <div className="text-xs text-gray-500">
          Large-export warning threshold: {LARGE_EXPORT_ROW_THRESHOLD.toLocaleString()} rows.
        </div>

        {pageError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        {isExporting && exportStatus && (
          <div
            className="inline-flex items-center gap-2 rounded-lg border border-baylor-green/20 bg-baylor-green/5 px-3 py-2 text-sm text-baylor-green"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {exportStatus}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Individual Exports</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {INDIVIDUAL_EXPORT_OPTIONS.map((option) => {
            const isActive = isExporting && activeExportId === option.id;
            return (
              <article
                key={option.id}
                className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3"
              >
                <div>
                  <h3 className="font-semibold text-gray-900">{option.label}</h3>
                  <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                </div>
                <button
                  onClick={() =>
                    runExport({
                      sheetIds: option.sheetIds,
                      exportLabel: option.id,
                    })
                  }
                  disabled={isExporting || !canRunSelectedTermExport}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Export {option.label}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <ConfirmDialog
        isOpen={warningState.isOpen}
        variant="warning"
        title="Large Export Warning"
        message={
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              This workbook contains approximately
              <strong>
                {" "}
                {warningState.pending?.exportPackage?.totalRows?.toLocaleString() || 0}
                {" "}
              </strong>
              rows. Browser-based Excel generation may take additional time and
              memory.
            </p>
            <p>Do you want to continue with a single workbook export?</p>
          </div>
        }
        confirmText="Continue Export"
        cancelText="Cancel"
        onConfirm={handleConfirmLargeExport}
        onCancel={closeWarningDialog}
        icon={AlertTriangle}
      />
    </div>
  );
};

export default AdminDataExportsPage;
