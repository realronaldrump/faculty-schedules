import React from 'react';
import { X, FileText, Image, Grid, File } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

const ExportModal = ({ isOpen, onClose, scheduleTableRef, title }) => {
    if (!isOpen) return null;

    const handleExport = (format) => {
        const container = scheduleTableRef.current;
        const table = container ? container.querySelector('table') : null;
        if (!table) {
            console.error('No table to export.');
            onClose();
            return;
        }

        if (format === 'csv') {
            const wb = XLSX.utils.table_to_book(table);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const csv = XLSX.utils.sheet_to_csv(ws);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `${title}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (format === 'excel') {
            const wb = XLSX.utils.table_to_book(table);
            XLSX.writeFile(wb, `${title}.xlsx`);
        } else if (format === 'pdf') {
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
            autoTable(doc, { html: table, styles: { overflow: 'linebreak' }, bodyStyles: { valign: 'top' } });
            doc.save(`${title}.pdf`);
        } else if (format === 'png') {
            html2canvas(table).then(canvas => {
                const link = document.createElement('a');
                link.download = `${title}.png`;
                link.href = canvas.toDataURL();
                link.click();
            });
        }
        onClose();
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
                        <button onClick={() => handleExport('excel')} className="export-option" title="Export as Excel (.xlsx)">
                            <Grid className="w-8 h-8 mx-auto mb-2" />
                            <span>Excel</span>
                        </button>
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
