import React, { useState, useMemo } from 'react';
import { usePermissions } from '../../utils/permissions';
import { Upload, CheckCircle, AlertCircle, Eye, History, ChevronRight, Calendar, Users } from 'lucide-react';
import { parseCLSSCSV } from '../../utils/dataImportUtils';
import { previewImportChanges, commitTransaction, projectSchedulePreviewRow } from '../../utils/importTransactionUtils';
import ImportPreviewModal from './ImportPreviewModal';
import ImportHistoryModal from './ImportHistoryModal';
import { useSchedules } from '../../contexts/ScheduleContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePeople } from '../../contexts/PeopleContext';
import { useUI } from '../../contexts/UIContext';
import { normalizeTermLabel } from '../../utils/termUtils';

const ImportWizard = () => {
  const { selectedSemester, refreshSchedules, refreshTerms, isTermLocked } = useSchedules();
  const { isAdmin } = useAuth();
  const { loadPeople } = usePeople();
  const { showNotification } = useUI();
  const { canImportData, canImportSchedule, canCreateRoom } = usePermissions();
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [csvData, setCsvData] = useState([]);
  const [importType, setImportType] = useState(null); // 'schedule' | 'directory'
  const [detectedTerm, setDetectedTerm] = useState('');
  const [previewTransaction, setPreviewTransaction] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [resultsSummary, setResultsSummary] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDataRefresh = async () => {
    await Promise.all([
      refreshSchedules(),
      refreshTerms?.(),
      loadPeople({ force: true })
    ]);
  };

  const isCLSS = useMemo(() => {
    if (!rawText) return false;
    const has = rawText.includes('CLSS ID') && rawText.includes('CRN') && rawText.includes('Course') && rawText.includes('Section #');
    return has;
  }, [rawText]);

  const parsedPreviewRows = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];
    if (importType === 'schedule') {
      const fallbackTerm = detectedTerm || selectedSemester || '';
      return csvData.map((row) => projectSchedulePreviewRow(row, fallbackTerm));
    }
    if (importType === 'directory') {
      return csvData.map((row) => ({
        'First Name': row['First Name'] || '',
        'Last Name': row['Last Name'] || '',
        'Preferred Name': row['Preferred First Name'] || row['Preferred Name'] || '',
        'E-mail Address': row['E-mail Address'] || '',
        'Phone': row['Phone'] || row['Business Phone'] || row['Home Phone'] || '',
        'Office': row['Office'] || row['Office Location'] || ''
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
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showNotification?.('warning', 'Invalid File', 'Please select a CSV file (.csv)');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      setRawText(text);
      try {
        if (text.includes('CLSS ID') && text.includes('CRN') && text.includes('Course')) {
          const clssRows = parseCLSSCSV(text);
          setCsvData(clssRows);
          setImportType('schedule');
          const term = (clssRows[0]?.Semester || clssRows[0]?.Term || '').trim();
          setDetectedTerm(term);
        } else {
          // Simple CSV parser for directory
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) throw new Error('CSV has no data rows');
          const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
          const data = lines.slice(1).map((line) => {
            const values = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const ch = line[i];
              if (ch === '"') inQuotes = !inQuotes; else if (ch === ',' && !inQuotes) { values.push(current); current = ''; } else current += ch;
            }
            values.push(current);
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = (values[idx] || '').replace(/"/g, '').trim(); });
            return obj;
          });
          setCsvData(data);
          setImportType('directory');
        }
        setStep(2);
      } catch (err) {
        console.error('CSV parse error:', err);
        showNotification?.('error', 'CSV Parse Error', err.message || 'Failed to parse CSV file');
        setFileName('');
        setRawText('');
        setCsvData([]);
        setImportType(null);
      }
    };
    reader.readAsText(file);
  };

  const validateDetected = () => {
    if (!csvData || csvData.length === 0) return false;
    if (importType === 'schedule') {
      const headers = Object.keys(csvData[0] || {});
      const required = ['Instructor', 'Course', 'Section #', 'CRN'];
      const hasSemester = headers.includes('Semester') || headers.includes('Term');
      return hasSemester && required.every(h => headers.includes(h));
    }
    if (importType === 'directory') {
      const headers = Object.keys(csvData[0] || {});
      const required = ['First Name', 'Last Name', 'E-mail Address'];
      return required.every(h => headers.includes(h));
    }
    return false;
  };

  const startPreview = async () => {
    if (!validateDetected()) {
      showNotification?.('warning', 'Invalid CSV', 'CSV columns do not match the detected import type');
      return;
    }
    setIsProcessing(true);
    try {
      let semester = detectedTerm || selectedSemester;
      if (importType === 'schedule') {
        const tx = await previewImportChanges(csvData, 'schedule', semester, { persist: true });
        setPreviewTransaction(tx);
        setShowPreviewModal(true);
      } else {
        const tx = await previewImportChanges(csvData, 'directory', semester || '', {
          persist: true,
          includeOfficeRooms: typeof canCreateRoom === 'function' ? canCreateRoom() : isAdmin
        });
        setPreviewTransaction(tx);
        setShowPreviewModal(true);
      }
      setStep(3);
    } catch (e) {
      console.error('Preview error:', e);
      showNotification?.('error', 'Preview Failed', e.message || 'Could not generate preview');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async (transactionId, selectedChanges = null, selectedFieldMap = null, matchResolutions = null) => {
    if (importType === 'schedule' && !canImportSchedule()) {
      showNotification?.('warning', 'Permission Denied', 'You do not have permission to import schedules.');
      return;
    }
    if (importType !== 'schedule' && !canImportData()) {
      showNotification?.('warning', 'Permission Denied', 'You do not have permission to import data.');
      return;
    }
    const importTerm = normalizeTermLabel(detectedTerm || selectedSemester || '');
    if (importType === 'schedule' && importTerm && isTermLocked?.(importTerm) && !isAdmin) {
      showNotification?.('warning', 'Semester Locked', `Schedules for ${importTerm} are archived or locked. Import is disabled.`);
      return;
    }
    setIsCommitting(true);
    try {
      const result = await commitTransaction(transactionId, selectedChanges, selectedFieldMap, matchResolutions);
      const stats = result.getSummary().stats;
      setResultsSummary({ total: stats.totalChanges, schedulesAdded: stats.schedulesAdded, peopleAdded: stats.peopleAdded, roomsAdded: stats.roomsAdded, semester: result.getSummary().semester });
      showNotification?.('success', 'Import Applied', `Applied ${stats.totalChanges} changes`);
      setShowPreviewModal(false);
      setPreviewTransaction(null);
      setStep(4);
      if (importType === 'schedule') {
        await refreshSchedules();
        await refreshTerms?.();
      } else {
        await loadPeople({ force: true });
      }
    } catch (e) {
      console.error('Commit error:', e);
      showNotification?.('error', 'Import Failed', e.message || 'Failed to apply changes');
    } finally {
      setIsCommitting(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setFileName('');
    setRawText('');
    setCsvData([]);
    setImportType(null);
    setDetectedTerm('');
    setPreviewTransaction(null);
    setShowPreviewModal(false);
    setIsCommitting(false);
    setResultsSummary(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-baylor-green">Import Wizard</h1>
          <p className="text-gray-600">Upload a CLSS CSV and apply changes with a simple, safe workflow</p>
        </div>
        <button onClick={() => setShowHistory(true)} className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          <History className="w-4 h-4" />
          <span>Import History</span>
        </button>
      </div>

      <div className="flex items-center mb-6 text-sm">
        <div className={`flex items-center ${step >= 1 ? 'text-baylor-green' : 'text-gray-400'}`}>
          <span className="font-semibold">1. Upload</span>
        </div>
        <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
        <div className={`flex items-center ${step >= 2 ? 'text-baylor-green' : 'text-gray-400'}`}>
          <span className="font-semibold">2. Validate</span>
        </div>
        <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
        <div className={`flex items-center ${step >= 3 ? 'text-baylor-green' : 'text-gray-400'}`}>
          <span className="font-semibold">3. Preview</span>
        </div>
        <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
        <div className={`flex items-center ${step >= 4 ? 'text-baylor-green' : 'text-gray-400'}`}>
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
              <span className="text-xl font-semibold text-gray-700 hover:text-baylor-green">Select CSV File</span>
              <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            </label>
            <p className="text-gray-500 mt-3">Supported: CLSS export CSV (.csv)</p>
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
                <div className="text-sm text-gray-600">Detected Import Type</div>
                <div className="text-lg font-semibold text-gray-900 capitalize">{isCLSS ? 'CLSS Schedule Import' : 'Directory Import'}</div>
              </div>
              <div className="text-sm text-gray-600 flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{detectedTerm || selectedSemester || 'Semester not detected'}</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
              {isCLSS ? (
                <div>
                  <div className="font-semibold mb-1">Column mapping (auto):</div>
                  <div>CRN → CRN (5-digit enforced)</div>
                  <div>Section # → Section (strips redundant CRN e.g., "01 (33038)" → "01")</div>
                  <div>Instructor, Course, Course Title, Meeting Pattern, Room, Semester</div>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>Directory fields: First Name, Last Name, E-mail Address</span>
                </div>
              )}
            </div>
          </div>

          {parsedPreviewRows.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="text-md font-semibold text-baylor-green mb-3">Data Preview (all rows)</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      {previewHeaders.map((h) => (
                        <th key={h} className="text-left py-2 px-3 font-medium text-gray-700 align-top">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedPreviewRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        {previewHeaders.map((header) => {
                          const value = row[header];
                          const display = value === null || value === undefined ? '' : String(value);
                          return (
                            <td key={header} className="py-2 px-3 text-gray-800 whitespace-pre-wrap break-words align-top">
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
                    <CheckCircle className="w-4 h-4 mr-2" /> CSV looks valid for {isCLSS ? 'CLSS schedule' : 'directory'} import
                  </div>
                ) : (
                  <div className="flex items-center p-2 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                    <AlertCircle className="w-4 h-4 mr-2" /> CSV columns don’t match expected format
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={resetWizard} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Start Over</button>
            <button onClick={startPreview} disabled={!validateDetected() || isProcessing} className="px-6 py-3 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:bg-gray-400">
              {isProcessing ? 'Generating Preview...' : 'Generate Preview'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && resultsSummary && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-lg font-semibold text-gray-900 mb-2">Import Complete</div>
          <div className="text-gray-700">Applied {resultsSummary.total} changes to {resultsSummary.semester || 'selected semester'}.</div>
          <div className="mt-4 flex items-center space-x-3">
            <button onClick={() => setShowHistory(true)} className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2">
              <History className="w-4 h-4" />
              <span>View Import History</span>
            </button>
            <button onClick={resetWizard} className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90">Import Another File</button>
          </div>
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
