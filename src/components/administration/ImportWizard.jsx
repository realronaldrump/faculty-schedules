import React, { useState, useMemo } from "react";
import { usePermissions } from "../../utils/permissions";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Eye,
  History,
  ChevronRight,
  Calendar,
  Users,
} from "lucide-react";
import { parseCLSSCSV } from "../../utils/dataImportUtils";
import {
  previewImportChanges,
  commitTransaction,
  projectSchedulePreviewRow,
} from "../../utils/importTransactionUtils";
import { parseCSVRecords } from "../../utils/csvUtils";
import { runPostImportCleanup } from "../../utils/dataHygiene";
import ImportPreviewModal from "./ImportPreviewModal";
import ImportHistoryModal from "./ImportHistoryModal";
import { useSchedules } from "../../contexts/ScheduleContext";
import { usePeople } from "../../contexts/PeopleContext";
import { useUI } from "../../contexts/UIContext";
import { normalizeTermLabel, termCodeFromLabel } from "../../utils/termUtils";
import { hashString, hashRecord } from "../../utils/hashUtils";

const ImportWizard = ({ embedded = false }) => {
  const { selectedSemester, refreshSchedules, refreshTerms, isTermLocked } =
    useSchedules();
  const { loadPeople } = usePeople();
  const { showNotification } = useUI();
  const { canImport, canEdit } = usePermissions();
  const canImportHere = canImport("data/import-wizard");
  const canEditHere = canEdit("data/import-wizard");
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [rawText, setRawText] = useState("");
  const [csvData, setCsvData] = useState([]);
  const [importType, setImportType] = useState(null); // 'schedule' | 'directory'
  const [detectedTerm, setDetectedTerm] = useState("");
  const [previewTransaction, setPreviewTransaction] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [resultsSummary, setResultsSummary] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCleanupRunning, setIsCleanupRunning] = useState(false);
  const [cleanupReport, setCleanupReport] = useState(null);

  const handleDataRefresh = async () => {
    await Promise.all([
      refreshSchedules(),
      refreshTerms?.(),
      loadPeople({ force: true }),
    ]);
  };

  const isCLSS = useMemo(() => {
    if (!rawText) return false;
    const has =
      rawText.includes("CLSS ID") &&
      rawText.includes("CRN") &&
      rawText.includes("Course") &&
      rawText.includes("Section #");
    return has;
  }, [rawText]);

  const parsedPreviewRows = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];
    if (importType === "schedule") {
      const fallbackTerm = detectedTerm || selectedSemester || "";
      return csvData.map((row) => projectSchedulePreviewRow(row, fallbackTerm));
    }
    if (importType === "directory") {
      return csvData.map((row) => ({
        "First Name": row["First Name"] || "",
        "Last Name": row["Last Name"] || "",
        "Preferred Name":
          row["Preferred First Name"] || row["Preferred Name"] || "",
        "E-mail Address": row["E-mail Address"] || "",
        Phone: row["Phone"] || row["Business Phone"] || row["Home Phone"] || "",
        Office: row["Office"] || row["Office Location"] || "",
      }));
    }
    return [];
  }, [csvData, importType, detectedTerm, selectedSemester]);

  const previewHeaders = useMemo(() => {
    const headerSet = new Set();
    parsedPreviewRows.forEach((row) => {
      Object.keys(row).forEach((key) => headerSet.add(key));
    });
    return Array.from(headerSet);
  }, [parsedPreviewRows]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      showNotification?.(
        "warning",
        "Invalid File",
        "Please select a CSV file (.csv)",
      );
      return;
    }
    setFileName(file.name);
    setFileSize(file.size || 0);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      setRawText(text);
      setFileHash(hashString(text));
      try {
        if (
          text.includes("CLSS ID") &&
          text.includes("CRN") &&
          text.includes("Course")
        ) {
          const clssRows = parseCLSSCSV(text);
          setCsvData(clssRows);
          setImportType("schedule");
          const term = (
            clssRows[0]?.Semester ||
            clssRows[0]?.Term ||
            ""
          ).trim();
          setDetectedTerm(term);
        } else {
          // Robust CSV parse for directory imports (supports commas, quotes, multiline fields)
          const rows = parseCSVRecords(text);
          if (!rows || rows.length < 2) throw new Error("CSV has no data rows");
          const normalizeHeader = (value) =>
            String(value || "")
              .replace(/\s+/g, " ")
              .trim();
          const headers = rows[0].map((h) => normalizeHeader(h));
          const data = [];
          for (let i = 1; i < rows.length; i += 1) {
            const values = rows[i] || [];
            const isEmpty = values.every((value) => !String(value || "").trim());
            if (isEmpty) continue;
            const obj = {};
            headers.forEach((h, idx) => {
              obj[h] = String(values[idx] ?? "").trim();
            });
            obj.__rowIndex = i + 1;
            const hashInput = { ...obj };
            delete hashInput.__rowIndex;
            obj.__rowHash = hashRecord(hashInput);
            data.push(obj);
          }
          setCsvData(data);
          setImportType("directory");
        }
        setStep(2);
      } catch (err) {
        console.error("CSV parse error:", err);
        showNotification?.(
          "error",
          "CSV Parse Error",
          err.message || "Failed to parse CSV file",
        );
        setFileName("");
        setRawText("");
        setCsvData([]);
        setImportType(null);
      }
    };
    reader.readAsText(file);
  };

  const validateDetected = () => {
    if (!csvData || csvData.length === 0) return false;
    if (importType === "schedule") {
      const headers = Object.keys(csvData[0] || {});
      const required = ["Instructor", "Course", "Section #", "CRN"];
      const hasSemester =
        headers.includes("Semester") || headers.includes("Term");
      return hasSemester && required.every((h) => headers.includes(h));
    }
    if (importType === "directory") {
      const headers = Object.keys(csvData[0] || {});
      const required = ["First Name", "Last Name", "E-mail Address"];
      return required.every((h) => headers.includes(h));
    }
    return false;
  };

  const startPreview = async () => {
    if (!validateDetected()) {
      showNotification?.(
        "warning",
        "Invalid CSV",
        "CSV columns do not match the detected import type",
      );
      return;
    }
    setIsProcessing(true);
    try {
      let semester = detectedTerm || selectedSemester;
      const importMetadata = {
        fileName,
        fileHash,
        fileSize,
      };
      if (importType === "schedule") {
        const tx = await previewImportChanges(csvData, "schedule", semester, {
          persist: true,
          importMetadata,
        });
        setPreviewTransaction(tx);
        setShowPreviewModal(true);
      } else {
        const tx = await previewImportChanges(
          csvData,
          "directory",
          semester || "",
          {
            persist: true,
            includeOfficeRooms: canEditHere,
            importMetadata,
          },
        );
        setPreviewTransaction(tx);
        setShowPreviewModal(true);
      }
      setStep(3);
    } catch (e) {
      console.error("Preview error:", e);
      showNotification?.(
        "error",
        "Preview Failed",
        e.message || "Could not generate preview",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async (
    transactionId,
    selectedChanges = null,
    selectedFieldMap = null,
    matchResolutions = null,
  ) => {
    if (!canImportHere || !canEditHere) {
      showNotification?.(
        "warning",
        "Permission Denied",
        "You do not have permission to import data.",
      );
      return;
    }
    const importTerm = normalizeTermLabel(
      detectedTerm || selectedSemester || "",
    );
    if (importType === "schedule" && importTerm && isTermLocked?.(importTerm)) {
      showNotification?.(
        "warning",
        "Semester Locked",
        `Schedules for ${importTerm} are archived or locked. Import is disabled.`,
      );
      return;
    }
    setIsCommitting(true);
    try {
      const result = await commitTransaction(
        transactionId,
        selectedChanges,
        selectedFieldMap,
        matchResolutions,
      );
      const stats = result.getSummary().stats;
      const termCodes = new Set();
      (result.changes?.schedules?.added || []).forEach((change) => {
        const tc = change?.newData?.termCode;
        if (tc) termCodes.add(tc);
      });
      (result.changes?.schedules?.modified || []).forEach((change) => {
        const tc = change?.newData?.termCode || change?.originalData?.termCode;
        if (tc) termCodes.add(tc);
      });
      if (termCodes.size === 0) {
        const tc = termCodeFromLabel(result.getSummary().semester || "");
        if (tc) termCodes.add(tc);
      }
      setResultsSummary({
        transactionId: result.getSummary().id,
        termCodes: Array.from(termCodes),
        total: stats.totalChanges,
        schedulesAdded: stats.schedulesAdded,
        peopleAdded: stats.peopleAdded,
        roomsAdded: stats.roomsAdded,
        semester: result.getSummary().semester,
      });
      showNotification?.(
        "success",
        "Import Applied",
        `Applied ${stats.totalChanges} changes`,
      );
      setShowPreviewModal(false);
      setPreviewTransaction(null);
      setStep(4);
      setCleanupReport(null);
      if (importType === "schedule") {
        await refreshSchedules();
        await refreshTerms?.();
        if (stats.peopleAdded > 0 || stats.peopleModified > 0) {
          await loadPeople({ force: true });
        }
      } else {
        await loadPeople({ force: true });
      }
    } catch (e) {
      console.error("Commit error:", e);
      showNotification?.(
        "error",
        "Import Failed",
        e.message || "Failed to apply changes",
      );
    } finally {
      setIsCommitting(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setFileName("");
    setRawText("");
    setCsvData([]);
    setImportType(null);
    setDetectedTerm("");
    setPreviewTransaction(null);
    setShowPreviewModal(false);
    setIsCommitting(false);
    setResultsSummary(null);
    setFileHash("");
    setFileSize(0);
    setIsCleanupRunning(false);
    setCleanupReport(null);
  };

  const handlePostImportCleanup = async () => {
    if (!resultsSummary?.transactionId) return;
    const termCodes = Array.isArray(resultsSummary.termCodes)
      ? resultsSummary.termCodes
      : [];
    if (termCodes.length === 0) {
      showNotification?.(
        "warning",
        "Cleanup Unavailable",
        "No term codes were detected for this import.",
      );
      return;
    }

    setIsCleanupRunning(true);
    try {
      const report = await runPostImportCleanup({
        termCodes,
        transactionId: resultsSummary.transactionId,
      });
      setCleanupReport(report);
      const repaired = report?.spaceLinkRepairs?.schedulesUpdated || 0;
      showNotification?.(
        "success",
        "Cleanup Complete",
        `Merged ${report.scheduleDuplicatesMerged || 0} schedule duplicates, created ${report.roomsCreated || 0} rooms, repaired ${repaired} schedules.`,
      );
    } catch (e) {
      console.error("Post-import cleanup failed:", e);
      showNotification?.(
        "error",
        "Cleanup Failed",
        e.message || "Post-import cleanup failed.",
      );
    } finally {
      setIsCleanupRunning(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          {embedded ? (
            <h2 className="text-2xl font-semibold text-gray-900">
              Import Wizard
            </h2>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Import Wizard
            </h1>
          )}
          <p className="text-gray-600">
            Upload a CLSS CSV and apply changes with a simple, safe workflow
          </p>
        </div>
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <History className="w-4 h-4" />
          <span>Import History</span>
        </button>
      </div>

      <div className="flex items-center mb-6 text-sm">
        <div
          className={`flex items-center ${step >= 1 ? "text-baylor-green" : "text-gray-400"}`}
        >
          <span className="font-semibold">1. Upload</span>
        </div>
        <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
        <div
          className={`flex items-center ${step >= 2 ? "text-baylor-green" : "text-gray-400"}`}
        >
          <span className="font-semibold">2. Validate</span>
        </div>
        <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
        <div
          className={`flex items-center ${step >= 3 ? "text-baylor-green" : "text-gray-400"}`}
        >
          <span className="font-semibold">3. Preview</span>
        </div>
        <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
        <div
          className={`flex items-center ${step >= 4 ? "text-baylor-green" : "text-gray-400"}`}
        >
          <span className="font-semibold">4. Results</span>
        </div>
      </div>

      {step === 1 && (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center bg-gray-50/50">
          <div className="bg-white rounded-lg p-4 inline-block mb-4 shadow-sm">
            <Upload className="w-8 h-8 text-baylor-green mx-auto" />
          </div>
          <div>
            <label className="cursor-pointer">
              <span className="text-xl font-semibold text-gray-700 hover:text-baylor-green">
                Select CSV File
              </span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <p className="text-gray-500 mt-3">
              Supported: CLSS export CSV (.csv)
            </p>
          </div>
          {fileName && (
            <div className="mt-6 inline-flex items-center px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700">
              <CheckCircle className="w-5 h-5 mr-2" />
              <span className="font-medium">{fileName}</span>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">
                  Detected Import Type
                </div>
                <div className="text-lg font-semibold text-gray-900 capitalize">
                  {isCLSS ? "CLSS Schedule Import" : "Directory Import"}
                </div>
              </div>
              <div className="text-sm text-gray-600 flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>
                  {detectedTerm || selectedSemester || "Semester not detected"}
                </span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
              {isCLSS ? (
                <div>
                  <div className="font-semibold mb-1">
                    Column mapping (auto):
                  </div>
                  <div>CRN → CRN (5-digit enforced)</div>
                  <div>
                    Section # → Section (strips redundant CRN e.g., "01 (33038)"
                    → "01")
                  </div>
                  <div>
                    Instructor, Course, Course Title, Meeting Pattern, Room,
                    Semester
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>
                    Directory fields: First Name, Last Name, E-mail Address
                  </span>
                </div>
              )}
            </div>
          </div>

          {parsedPreviewRows.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="text-md font-semibold text-baylor-green mb-3">
                Data Preview (all rows)
              </div>
              <div className="overflow-x-auto">
                <table className="university-table university-table--compact min-w-full">
                  <thead>
                    <tr>
                      {previewHeaders.map((h) => (
                        <th
                          key={h}
                          className="table-header-cell align-top"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedPreviewRows.map((row, idx) => (
                      <tr key={idx}>
                        {previewHeaders.map((header) => {
                          const value = row[header];
                          const display =
                            value === null || value === undefined
                              ? ""
                              : String(value);
                          return (
                            <td
                              key={header}
                              className="table-cell text-gray-800 whitespace-pre-wrap break-words align-top"
                            >
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center">
                {validateDetected() ? (
                  <div className="flex items-center p-2 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                    <CheckCircle className="w-4 h-4 mr-2" /> CSV looks valid for{" "}
                    {isCLSS ? "CLSS schedule" : "directory"} import
                  </div>
                ) : (
                  <div className="flex items-center p-2 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                    <AlertCircle className="w-4 h-4 mr-2" /> CSV columns don’t
                    match expected format
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={resetWizard}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Start Over
            </button>
            <button
              onClick={startPreview}
              disabled={!validateDetected() || isProcessing}
              className="px-6 py-3 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50"
            >
              {isProcessing ? "Generating Preview..." : "Generate Preview"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && resultsSummary && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-lg font-semibold text-gray-900 mb-2">
            Import Complete
          </div>
          <div className="text-gray-700">
            Applied {resultsSummary.total} changes to{" "}
            {resultsSummary.semester || "selected semester"}.
          </div>
          <div className="mt-4 flex items-center space-x-3">
            <button
              onClick={() => setShowHistory(true)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
            >
              <History className="w-4 h-4" />
              <span>View Import History</span>
            </button>
            {importType === "schedule" && (
              <button
                onClick={handlePostImportCleanup}
                disabled={isCleanupRunning}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {isCleanupRunning
                  ? "Running Cleanup..."
                  : "Run Post-Import Cleanup"}
              </button>
            )}
            <button
              onClick={resetWizard}
              className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90"
            >
              Import Another File
            </button>
          </div>
          {cleanupReport && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Cleanup Details
              </summary>
              <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(cleanupReport, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {showPreviewModal && previewTransaction && (
        <ImportPreviewModal
          transaction={previewTransaction}
          onClose={() => setShowPreviewModal(false)}
          onCommit={handleCommit}
          onCancel={() => setShowPreviewModal(false)}
          isCommitting={isCommitting}
        />
      )}

      {showHistory && (
        <ImportHistoryModal
          onClose={() => setShowHistory(false)}
          showNotification={showNotification}
          onDataRefresh={handleDataRefresh}
        />
      )}
    </div>
  );
};

export default ImportWizard;
