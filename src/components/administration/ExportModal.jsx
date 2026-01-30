import { useEffect, useState } from "react";
import { X, FileText, AlertTriangle } from "lucide-react";

const EXPORT_ROOT_ATTR = "data-export-root";

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

const waitForFonts = async (doc) => {
  if (doc?.fonts?.ready) {
    try {
      await doc.fonts.ready;
    } catch {
      // Ignore font readiness errors and proceed with export.
    }
  }
};

const waitForImages = async (doc) => {
  const images = Array.from(doc?.images || []);
  if (images.length === 0) return;
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }),
  );
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
      await waitForFonts(document);
      if (onExport) {
        await onExport("pdf");
      }

      const cleanTitle = (title || "schedule").replace(/[^a-zA-Z0-9-_]/g, "-");
      const styleNodes = Array.from(
        document.querySelectorAll('link[rel="stylesheet"], style'),
      );
      const styles = styleNodes.map((node) => node.outerHTML).join("\n");
      const exportHtml = targets
        .map(
          (target) =>
            `<div class="export-print-page">${target.outerHTML}</div>`,
        )
        .join("");
      const baseHref = document.baseURI || window.location.href;

      const printFrame = document.createElement("iframe");
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "0";
      printFrame.style.opacity = "0";
      printFrame.setAttribute("title", "Print frame");
      printFrame.setAttribute("aria-hidden", "true");
      document.body.appendChild(printFrame);

      const printDoc = printFrame.contentDocument;
      const printWindow = printFrame.contentWindow;
      if (!printDoc || !printWindow) {
        printFrame.remove();
        throw new Error("Print frame unavailable.");
      }

      printDoc.open();
      printDoc.write(`<!doctype html>
<html>
  <head>
    <title>${cleanTitle}</title>
    <base href="${baseHref}">
    ${styles}
    <style>
      body { margin: 0; background: #ffffff; }
      .export-print-root { box-sizing: border-box; }
      .export-print-page { display: flex; justify-content: center; align-items: flex-start; padding: 16px; box-sizing: border-box; break-after: page; page-break-after: always; }
      .export-print-page:last-child { break-after: auto; page-break-after: auto; }
      @media print { .export-print-page { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="export-print-root">${exportHtml}</div>
  </body>
</html>`);
      printDoc.close();

      const cleanup = () => {
        if (printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame);
        }
      };

      await waitForFonts(printDoc);
      await waitForImages(printDoc);
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = cleanup;
      setTimeout(cleanup, 1000);

      onClose();
    } catch (err) {
      console.error("PDF export failed:", err);
      setExportError("PDF export failed. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Export to PDF</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-6">
            Export the current schedule(s) as a print-ready PDF. The PDF will
            open in your browser&apos;s print dialog where you can save it or
            send it to a printer.
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
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
