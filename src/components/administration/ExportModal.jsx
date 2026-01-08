import { X, Image } from 'lucide-react';
import html2canvas from 'html2canvas';

const ExportModal = ({ isOpen, onClose, scheduleTableRef, title, onExport }) => {
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
        const container = scheduleTableRef.current;
        if (!container) {
            console.error('Nothing to export.');
            onClose();
            return;
        }

        // Call the onExport callback if provided (for legacy HTML schedules)
        if (onExport) {
            await onExport('png');
        }

        try {
            // Target dimensions: 7 x 5 inches
            // We use 96 DPI as the base for layout, but capture at 2x scale for print quality
            const BASE_DPI = 96;
            const targetWidthPx = 7 * BASE_DPI;   // 672px
            const targetHeightPx = 5 * BASE_DPI;  // 480px

            // Store original styles
            const originalWidth = container.style.width;
            const originalHeight = container.style.height;
            const originalMaxWidth = container.style.maxWidth;
            const originalMaxHeight = container.style.maxHeight;
            const originalMinWidth = container.style.minWidth;
            const originalMinHeight = container.style.minHeight;
            const originalOverflow = container.style.overflow;

            // Force the container to exact dimensions
            container.style.width = `${targetWidthPx}px`;
            container.style.height = `${targetHeightPx}px`;
            container.style.maxWidth = `${targetWidthPx}px`;
            container.style.maxHeight = `${targetHeightPx}px`;
            container.style.minWidth = `${targetWidthPx}px`;
            container.style.minHeight = `${targetHeightPx}px`;
            container.style.overflow = 'hidden';

            // Give the browser a moment to apply the styles
            await new Promise(resolve => setTimeout(resolve, 50));

            try {
                // Capture at 2x scale for high quality (effective 192 DPI)
                // This produces a 1344 x 960 pixel image which prints sharply at 7x5 inches
                const canvas = await html2canvas(container, {
                    width: targetWidthPx,
                    height: targetHeightPx,
                    scale: 2,
                    backgroundColor: '#ffffff',
                    useCORS: true,
                    logging: false,
                    allowTaint: false,
                    ignoreElements: (el) => {
                        if (!el || !el.classList) return false;
                        return el.classList.contains('export-ignore');
                    }
                });

                // Convert to PNG blob and download
                const dataUrl = canvas.toDataURL('image/png', 1.0);
                const res = await fetch(dataUrl);
                const blob = await res.blob();

                // Clean filename
                const cleanTitle = (title || 'schedule').replace(/[^a-zA-Z0-9-_]/g, '-');
                downloadBlob(blob, `${cleanTitle}.png`);
            } finally {
                // Restore original styles
                container.style.width = originalWidth;
                container.style.height = originalHeight;
                container.style.maxWidth = originalMaxWidth;
                container.style.maxHeight = originalMaxHeight;
                container.style.minWidth = originalMinWidth;
                container.style.minHeight = originalMinHeight;
                container.style.overflow = originalOverflow;
            }
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. Please try again.');
        } finally {
            onClose();
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
                        Export your room schedule as a high-quality PNG image sized for door tags.
                    </p>
                    <div className="grid grid-cols-1 gap-4">
                        <button onClick={handleExport} className="export-option" title="Export as PNG image">
                            <Image className="w-8 h-8 mx-auto mb-2 text-baylor-green" />
                            <span className="font-medium">PNG Image</span>
                            <span className="text-xs text-gray-500 block mt-1">7 × 5 inches (1344 × 960 px)</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportModal;
