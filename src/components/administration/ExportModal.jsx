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

        // Call the onExport callback if provided
        if (onExport) {
            await onExport('png');
        }

        try {
            // Calculate target dimensions for PNG export
            const DPI = 96; // Standard screen DPI
            const targetWidthPx = 7 * DPI;
            const targetHeightPx = 5 * DPI;

            // Store original styles
            const originalWidth = container.style.width;
            const originalHeight = container.style.height;
            const originalMaxWidth = container.style.maxWidth;
            const originalMaxHeight = container.style.maxHeight;

            // Temporarily set container to target size
            container.style.width = `${targetWidthPx}px`;
            container.style.height = `${targetHeightPx}px`;
            container.style.maxWidth = `${targetWidthPx}px`;
            container.style.maxHeight = `${targetHeightPx}px`;
            container.style.overflow = 'hidden';

            try {
                // Capture with size constraints
                const canvas = await html2canvas(container, {
                    width: targetWidthPx,
                    height: targetHeightPx,
                    scale: 2,
                    backgroundColor: null,
                    useCORS: true,
                    ignoreElements: (el) => el && el.classList && el.classList.contains('export-ignore')
                });

                const dataUrl = canvas.toDataURL('image/png');
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                downloadBlob(blob, `${title}.png`);
            } finally {
                // Restore original styles
                container.style.width = originalWidth;
                container.style.height = originalHeight;
                container.style.maxWidth = originalMaxWidth;
                container.style.maxHeight = originalMaxHeight;
                container.style.overflow = '';
            }
        } catch (err) {
            console.error('Export failed:', err);
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
                    <div className="grid grid-cols-1 gap-4">
                        <button onClick={handleExport} className="export-option" title="Export as PNG image">
                            <Image className="w-8 h-8 mx-auto mb-2" />
                            <span>PNG (7 x 5 in)</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportModal;
