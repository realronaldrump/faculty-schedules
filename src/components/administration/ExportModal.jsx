import { useEffect, useState } from 'react';
import { X, Image, FileText, AlertTriangle } from 'lucide-react';
import html2canvas from 'html2canvas';

const EXPORT_ROOT_ATTR = 'data-export-root';
const MAX_EXPORT_SCALE = 4;

const resolveExportElement = (root) => {
    if (!root) return null;
    if (root.classList?.contains('exportable-room-schedule') || root.classList?.contains('schedule-sheet')) {
        return root;
    }
    const candidate = root.querySelector?.('.exportable-room-schedule, .schedule-sheet');
    return candidate || root;
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
    await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    }));
};

const getExportScale = (exportScale) => {
    if (Number.isFinite(exportScale) && exportScale > 0) {
        return Math.min(MAX_EXPORT_SCALE, exportScale);
    }
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    return Math.min(MAX_EXPORT_SCALE, Math.max(2, dpr));
};

const getElementDimensions = (element) => {
    const width = element.offsetWidth || Math.round(element.getBoundingClientRect().width);
    const height = element.offsetHeight || Math.round(element.getBoundingClientRect().height);
    return {
        width: Math.max(1, width),
        height: Math.max(1, height),
    };
};

const ExportModal = ({ isOpen, onClose, scheduleTableRef, title, onExport, exportScale }) => {
    const [exportError, setExportError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setExportError('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const downloadBlob = (blob, filename) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 0);
    };

    const handleExport = async () => {
        setExportError('');
        const container = resolveExportElement(scheduleTableRef.current);
        if (!container) {
            console.error('Nothing to export.');
            setExportError('Nothing to export yet.');
            return;
        }

        try {
            await waitForFonts(document);
            if (onExport) {
                await onExport('png');
            }
            await new Promise(resolve => requestAnimationFrame(resolve));

            const { width, height } = getElementDimensions(container);
            const scale = getExportScale(exportScale);

            container.setAttribute(EXPORT_ROOT_ATTR, 'true');
            const canvas = await html2canvas(container, {
                width,
                height,
                scale,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
                allowTaint: false,
                ignoreElements: (el) => {
                    if (!el || !el.classList) return false;
                    return el.classList.contains('export-ignore');
                },
                onclone: (doc) => {
                    const cloneRoot = doc.querySelector(`[${EXPORT_ROOT_ATTR}]`);
                    if (cloneRoot) {
                        cloneRoot.style.width = `${width}px`;
                        cloneRoot.style.height = `${height}px`;
                    }
                    doc.querySelectorAll('.weekly-grid .day-header').forEach((el) => {
                        el.style.position = 'static';
                        el.style.top = 'auto';
                    });
                }
            });

            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob((result) => {
                    if (result) resolve(result);
                    else reject(new Error('Failed to create export image.'));
                }, 'image/png', 1.0);
            });

            const cleanTitle = (title || 'schedule').replace(/[^a-zA-Z0-9-_]/g, '-');
            downloadBlob(blob, `${cleanTitle}.png`);
            onClose();
        } catch (err) {
            console.error('Export failed:', err);
            setExportError('Export failed. Please try again.');
        } finally {
            container.removeAttribute(EXPORT_ROOT_ATTR);
        }
    };

    const handlePrintExport = async () => {
        setExportError('');
        const container = resolveExportElement(scheduleTableRef.current);
        if (!container) {
            console.error('Nothing to export.');
            setExportError('Nothing to export yet.');
            return;
        }

        try {
            await waitForFonts(document);
            if (onExport) {
                await onExport('pdf');
            }

            const cleanTitle = (title || 'schedule').replace(/[^a-zA-Z0-9-_]/g, '-');
            const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
            const styles = styleNodes.map(node => node.outerHTML).join('\n');
            const exportHtml = container.outerHTML;
            const baseHref = document.baseURI || window.location.href;

            const printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            printFrame.style.opacity = '0';
            printFrame.setAttribute('title', 'Print frame');
            printFrame.setAttribute('aria-hidden', 'true');
            document.body.appendChild(printFrame);

            const printDoc = printFrame.contentDocument;
            const printWindow = printFrame.contentWindow;
            if (!printDoc || !printWindow) {
                printFrame.remove();
                throw new Error('Print frame unavailable.');
            }

            printDoc.open();
            printDoc.write(`<!doctype html>
<html>
  <head>
    <title>${cleanTitle}</title>
    <base href="${baseHref}">
    ${styles}
    <style>
      body { margin: 0; display: flex; justify-content: center; align-items: flex-start; background: #ffffff; }
      .export-print-root { padding: 16px; box-sizing: border-box; }
      @media print { .export-print-root { padding: 0; } }
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
            console.error('Print export failed:', err);
            setExportError('Print export failed. Please try again.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-semibold text-gray-900">Export Schedule</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-gray-600 mb-4">
                        Export the current schedule as a high-resolution PNG or a print-ready PDF.
                    </p>
                    {exportError && (
                        <div className="alert alert-error mb-4 flex items-start gap-2" role="alert">
                            <AlertTriangle className="w-4 h-4 mt-0.5" />
                            <span className="text-sm">{exportError}</span>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button onClick={handleExport} className="export-option" title="Export as PNG image">
                            <Image className="w-8 h-8 mx-auto mb-2 text-baylor-green" />
                            <span className="font-medium">PNG Image</span>
                            <span className="text-xs text-gray-500 block mt-1">High-resolution raster export</span>
                        </button>
                        <button onClick={handlePrintExport} className="export-option" title="Print or save as PDF">
                            <FileText className="w-8 h-8 mx-auto mb-2 text-baylor-green" />
                            <span className="font-medium">PDF / Print</span>
                            <span className="text-xs text-gray-500 block mt-1">Vector-friendly print output</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportModal;
