import React from 'react';
import { X, FileText, Image, File } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import html2pdf from 'html2pdf.js';
// Excel export removed per request

const ExportModal = ({ isOpen, onClose, scheduleTableRef, title }) => {
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

    const handleExport = async (format) => {
        const container = scheduleTableRef.current;
        const table = container ? container.querySelector('table') : null;
        if (!table) {
            console.error('No table to export.');
            onClose();
            return;
        }

        try {
            if (format === 'csv') {
                const wb = XLSX.utils.table_to_book(table);
                const ws = wb.Sheets[wb.SheetNames[0]];
                const csv = XLSX.utils.sheet_to_csv(ws);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                downloadBlob(blob, `${title}.csv`);
            } else if (format === 'pdf') {
                // Use html2pdf to render the styled DOM to PDF for fidelity with the app's look
                await html2pdf().set({
                    filename: `${title}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
                }).from(table).save();
            } else if (format === 'png') {
                const canvas = await html2canvas(table, { scale: 2 });
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
                        <button onClick={() => handleExport('csv')} className="export-option" title="Export as CSV">
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
