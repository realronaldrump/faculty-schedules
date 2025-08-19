import React, { useState } from 'react';
import { X, FileText, Image, File } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import html2pdf from 'html2pdf.js';
// Excel export removed per request

const ExportModal = ({ isOpen, onClose, scheduleTableRef, title }) => {
    if (!isOpen) return null;

    const [presetSize, setPresetSize] = useState('7x5');
    const [customUnit, setCustomUnit] = useState('in');
    const [customWidth, setCustomWidth] = useState(7);
    const [customHeight, setCustomHeight] = useState(5);
    const [orientation, setOrientation] = useState('portrait');
    const [margin, setMargin] = useState(0.25);

    // Determine if the rendered content contains a table (MWF/TR views)
    const containerForCheck = scheduleTableRef?.current;
    const hasTable = !!(containerForCheck && containerForCheck.querySelector('table'));

    const downloadBlob = (blob, filename) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 0);
    };

    const handleExport = async (format) => {
        const container = scheduleTableRef.current;
        const table = container ? container.querySelector('table') : null;
        if (!container) {
            console.error('Nothing to export.');
            onClose();
            return;
        }

        try {
            if (format === 'csv') {
                if (!table) {
                    console.warn('CSV export requires a table.');
                    onClose();
                    return;
                }
                const wb = XLSX.utils.table_to_book(table);
                const ws = wb.Sheets[wb.SheetNames[0]];
                const csv = XLSX.utils.sheet_to_csv(ws);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                downloadBlob(blob, `${title}.csv`);
            } else if (format === 'pdf') {
                // Determine size settings
                let unit = 'in';
                let formatSize = [7, 5];
                if (presetSize === 'letter') {
                    formatSize = [8.5, 11];
                } else if (presetSize === 'custom') {
                    unit = customUnit;
                    formatSize = [Number(customWidth) || 7, Number(customHeight) || 5];
                }

                // Swap if landscape selected
                const finalFormat = orientation === 'landscape' ? [formatSize[1], formatSize[0]] : formatSize;

                await html2pdf().set({
                    filename: `${title}.pdf`,
                    margin: margin || 0,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, backgroundColor: null },
                    jsPDF: { unit, format: finalFormat, orientation }
                }).from(container).save();
            } else if (format === 'png') {
                const canvas = await html2canvas(container, { scale: 2, backgroundColor: null });
                const dataUrl = canvas.toDataURL('image/png');
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                downloadBlob(blob, `${title}.png`);
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
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => handleExport('csv')} disabled={!hasTable} className={`export-option ${!hasTable ? 'opacity-50 cursor-not-allowed' : ''}`} title="Export as CSV">
                            <FileText className="w-8 h-8 mx-auto mb-2" />
                            <span>CSV</span>
                        </button>
                        {/* Excel export removed */}
                        <button onClick={() => handleExport('pdf')} className="export-option" title="Export as PDF">
                            <File className="w-8 h-8 mx-auto mb-2" />
                            <span>PDF</span>
                        </button>
                        <button onClick={() => handleExport('png')} className="export-option" title="Export as PNG image">
                            <Image className="w-8 h-8 mx-auto mb-2" />
                            <span>PNG</span>
                        </button>
                    </div>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Page size</label>
                            <select value={presetSize} onChange={(e) => setPresetSize(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                <option value="7x5">7 x 5 in (default)</option>
                                <option value="letter">Letter 8.5 x 11 in</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>
                        {presetSize === 'custom' && (
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-600 mb-1">Width</label>
                                    <input type="number" step="0.01" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 mb-1">Height</label>
                                    <input type="number" step="0.01" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 mb-1">Units</label>
                                    <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                                        <option value="in">in</option>
                                        <option value="mm">mm</option>
                                        <option value="pt">pt</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Orientation</label>
                                <select value={orientation} onChange={(e) => setOrientation(e.target.value)} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                    <option value="portrait">Portrait</option>
                                    <option value="landscape">Landscape</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Margins</label>
                                <input type="number" step="0.05" value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
                                <p className="text-xs text-gray-500 mt-1">inches</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                .export-option {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                    border-radius: 0.5rem;
                    background-color: #f9fafb;
                    border: 1px solid #e5e7eb;
                    transition: all 0.2s;
                }
                .export-option:hover {
                    background-color: #f3f4f6;
                    border-color: #d1d5db;
                    color: #1f2937;
                }
            `}</style>
        </div>
    );
};

export default ExportModal;
