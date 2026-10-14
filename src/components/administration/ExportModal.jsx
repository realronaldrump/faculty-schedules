import { useEffect, useState } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import Modal from "../shared/Modal";
import { trackAction, trackFailure } from "../../utils/activityTracking";
import { printSheets } from "../../utils/printSheets";

const resolveExportTargets = (root) => {
  if (!root) return [];
  const targets = new Set();
  if (
    root.classList?.contains("exportable-room-schedule") ||
    root.classList?.contains("schedule-sheet")
  ) {
    targets.add(root);
  }
  if (root.querySelectorAll) {
    root
      .querySelectorAll(".exportable-room-schedule, .schedule-sheet")
      .forEach((el) => targets.add(el));
  }
  if (targets.size > 0) return Array.from(targets);
  return [root];
};

const ExportModal = ({
  isOpen,
  onClose,
  scheduleTableRef,
  title,
  onExport,
}) => {
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setExportError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExportPDF = async () => {
    setExportError("");
    const targets = resolveExportTargets(scheduleTableRef.current);
    if (targets.length === 0) {
      console.error("Nothing to export.");
      setExportError("Nothing to export yet.");
      return;
    }

    try {
      if (onExport) {
        await onExport("pdf");
      }
      const cleanTitle = await printSheets(targets, title || "schedule");

      trackAction("schedule_pdf_exported", { title: cleanTitle });
      onClose();
    } catch (err) {
      console.error("PDF export failed:", err);
      trackFailure("pdf_export", err);
      setExportError("PDF export failed. Please try again.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title="Export to PDF">
      <p className="text-sm text-gray-600 mb-6">
        Export the current schedule(s) as a print-ready PDF. The PDF will open in
        your browser&apos;s print dialog where you can save it or send it to a
        printer.
      </p>
      {exportError && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 text-red-600" />
          <span className="text-sm text-red-800">{exportError}</span>
        </div>
      )}
      <button
        onClick={handleExportPDF}
        className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-baylor-green hover:bg-baylor-green/5 transition-colors"
      >
        <FileText className="w-12 h-12 mb-3 text-baylor-green" />
        <span className="font-semibold text-gray-900">Export as PDF</span>
        <span className="text-xs text-gray-500 mt-1">
          Opens print dialog to save as PDF
        </span>
      </button>
    </Modal>
  );
};

export default ExportModal;
