import React, { useMemo, useState, useEffect } from 'react';
import { Database, RefreshCw, AlertCircle, Upload, Filter, Save, Search } from 'lucide-react';
import { analyzeCRNCoverage, backfillCRNData, reimportCRNFromCSV } from '../utils/crnMigrationUtils';
import { fetchSchedulesWithRelationalData } from '../utils/dataImportUtils';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { logUpdate } from '../utils/changeLogger';
import MultiSelectDropdown from './MultiSelectDropdown';

const CRNQualityTools = ({ showNotification }) => {
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [results, setResults] = useState(null);
  const [csvName, setCsvName] = useState('');
  const [csvRows, setCsvRows] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [editingCrn, setEditingCrn] = useState({}); // { [scheduleId]: crn }
  const [filters, setFilters] = useState({
    terms: [],
    programs: [],
    instructors: [],
    searchTerm: '',
    showMissingOnly: false
  });

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const a = await analyzeCRNCoverage();
      setAnalysis(a);
      showNotification?.('info', 'CRN Analysis', `${a.coveragePercentage}% coverage (${a.withCRN}/${a.total})`);
      // Load enriched schedules for detailed listing
      setLoadingSchedules(true);
      const { schedules: enriched } = await fetchSchedulesWithRelationalData();
      setSchedules(enriched || []);
    } catch (e) {
      console.error(e);
      showNotification?.('error', 'Analysis failed', e.message || 'Unable to analyze CRN coverage');
    } finally {
      setIsAnalyzing(false);
      setLoadingSchedules(false);
    }
  };

  const handleBackfill = async () => {
    if (!analysis || analysis.recordsNeedingCRN.length === 0) {
      showNotification?.('info', 'Nothing to backfill', 'No records need CRN backfill');
      return;
    }
    setIsMigrating(true);
    try {
      const r = await backfillCRNData(csvRows || null);
      setResults(r);
      showNotification?.('success', 'Backfill Completed', `Updated ${r.updated} records`);
      await handleAnalyze();
    } catch (e) {
      console.error(e);
      showNotification?.('error', 'Backfill failed', e.message || 'Unable to backfill CRNs');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleReimport = async () => {
    if (!csvRows) {
      showNotification?.('warning', 'No CSV Loaded', 'Upload a CLSS CSV to re-import CRNs');
      return;
    }
    setIsMigrating(true);
    try {
      const r = await reimportCRNFromCSV(csvRows);
      setResults(r);
      showNotification?.('success', 'CRN Re-import', `Updated ${r.updated} records (matched ${r.matched})`);
      await handleAnalyze();
    } catch (e) {
      console.error(e);
      showNotification?.('error', 'Re-import failed', e.message || 'Unable to re-import CRNs');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showNotification?.('warning', 'Invalid File', 'Please select a CSV file (.csv)');
      return;
    }
    setCsvName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) return setCsvRows([]);
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
      setCsvRows(data);
    };
    reader.readAsText(file);
  };

  // Derived filter options
  const uniqueTerms = useMemo(() => {
    return Array.from(new Set((schedules || []).map(s => (s.term || '').trim()).filter(Boolean))).sort();
  }, [schedules]);

  const uniqueInstructors = useMemo(() => {
    return Array.from(new Set((schedules || []).map(s => (s.instructorName || 'Staff')).filter(Boolean))).sort();
  }, [schedules]);

  const uniquePrograms = useMemo(() => {
    return Array.from(new Set((schedules || []).map(s => (s.program || s.instructor?.program?.name || '')).filter(Boolean))).sort();
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    let data = [...(schedules || [])];
    // Search
    const term = (filters.searchTerm || '').toLowerCase().trim();
    if (term) {
      data = data.filter(item => {
        const values = [
          item.courseCode,
          item.section,
          item.term,
          item.crn || item.CRN || '',
          item.instructorName || '',
          item.program || item.instructor?.program?.name || ''
        ].map(v => (v || '').toString().toLowerCase());
        return values.some(v => v.includes(term));
      });
    }
    // Term filter
    if (filters.terms.length > 0) {
      data = data.filter(item => item && filters.terms.includes(item.term));
    }
    // Program filter
    if (filters.programs.length > 0) {
      data = data.filter(item => {
        const programName = item.program || item.instructor?.program?.name || '';
        return filters.programs.includes(programName);
      });
    }
    // Instructor filter
    if (filters.instructors.length > 0) {
      data = data.filter(item => item && filters.instructors.includes(item.instructorName || 'Staff'));
    }
    // Missing only
    if (filters.showMissingOnly) {
      data = data.filter(item => !((item.crn || item.CRN || '').toString().trim()));
    }
    return data;
  }, [schedules, filters]);

  const handleCrnInputChange = (id, value) => {
    // Enforce digits only in the field, but allow incomplete until save
    const digitsOnly = value.replace(/\D/g, '').slice(0, 5);
    setEditingCrn(prev => ({ ...prev, [id]: digitsOnly }));
  };

  const handleCrnSave = async (row) => {
    const newCrn = (editingCrn[row.id] ?? '').trim();
    if (!/^\d{5}$/.test(newCrn)) {
      showNotification?.('warning', 'Invalid CRN', 'CRN must be exactly 5 digits.');
      return;
    }
    try {
      const scheduleRef = doc(db, 'schedules', row.id);
      const updateData = { crn: newCrn, updatedAt: new Date().toISOString() };
      const originalData = row;
      await updateDoc(scheduleRef, updateData);
      await logUpdate(
        `Schedule - ${row.courseCode} ${row.section}`,
        'schedules',
        row.id,
        updateData,
        originalData,
        'CRNQualityTools.jsx - handleCrnSave'
      );
      // Update local state
      setSchedules(prev => prev.map(s => (s.id === row.id ? { ...s, ...updateData } : s)));
      setEditingCrn(prev => ({ ...prev, [row.id]: '' }));
      showNotification?.('success', 'CRN Updated', `Saved CRN ${newCrn} for ${row.courseCode} ${row.section}.`);
      // Refresh analysis metrics
      await handleAnalyze();
    } catch (e) {
      console.error(e);
      showNotification?.('error', 'Save failed', e.message || 'Unable to save CRN');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-baylor-green">CRN Quality Tools</h1>
        <p className="text-gray-600">Analyze coverage, find duplicates, and safely backfill from authoritative CSV.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div className="text-sm text-amber-800">
          CRNs are 5-digit numbers as provided by the Registrar's CLSS export. This view shows sections exactly as imported; if a CRN is missing here, it was missing in the source export.
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={handleAnalyze} disabled={isAnalyzing} className="px-6 py-3 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 disabled:bg-gray-400 flex items-center">
          {isAnalyzing ? 'Analyzing...' : (<><Database className="w-4 h-4 mr-2"/>Analyze CRN Coverage</>)}
        </button>
        {analysis && (
          <button onClick={handleBackfill} disabled={isMigrating || analysis.recordsNeedingCRN.length === 0} className="px-6 py-3 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:bg-gray-400 flex items-center">
            {isMigrating ? 'Migrating...' : (<><RefreshCw className="w-4 h-4 mr-2"/>Smart Backfill ({analysis.recordsNeedingCRN.length})</>)}
          </button>
        )}
        <label className="px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center cursor-pointer">
          <Upload className="w-4 h-4 mr-2" />
          <span>{csvName || 'Upload CLSS CSV for Re-import'}</span>
          <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
        </label>
        <button onClick={handleReimport} disabled={isMigrating || !csvRows} className="px-6 py-3 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 disabled:bg-gray-400 flex items-center">
          {isMigrating ? 'Re-importing...' : (<><Upload className="w-4 h-4 mr-2"/>Re-import CRNs from CSV</>)}
        </button>
      </div>

      {analysis && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-900 mb-3">CRN Coverage Analysis</h3>
          <div className="grid md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-baylor-green">{analysis.coveragePercentage}%</div>
              <div className="text-sm text-gray-600">Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-baylor-green">{analysis.withCRN}</div>
              <div className="text-sm text-gray-600">With CRN</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{analysis.missingCRN + analysis.emptyCRN}</div>
              <div className="text-sm text-gray-600">Missing CRN</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{analysis.total}</div>
              <div className="text-sm text-gray-600">Total Records</div>
            </div>
          </div>
          {analysis.duplicateCRNs.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center mb-2">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <h4 className="font-semibold text-red-800">Duplicate CRNs Detected</h4>
              </div>
              <div className="text-sm text-red-700">
                {analysis.duplicateCRNs.length} CRN(s) appear in multiple records from the import. Correct via CSV re-import or registrar-provided data.
              </div>
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-md font-semibold text-blue-900 mb-2">Operation Results</h3>
          <div className="text-sm text-blue-800">
            <p>Processed: {results.processed}</p>
            <p>Updated: {results.updated}</p>
            {results.matched !== undefined && <p>Matched from CSV: {results.matched}</p>}
            {results.errors && results.errors.length > 0 && (
              <p className="text-red-600">Errors: {results.errors.length}</p>
            )}
          </div>
        </div>
      )}

      {analysis && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-gray-900">All Sections and CRNs</h3>
            <div className="text-sm text-gray-500">{loadingSchedules ? 'Loading…' : `${filteredSchedules.length} of ${schedules.length}`}</div>
          </div>

          <div className="grid md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Terms</label>
              <MultiSelectDropdown
                options={uniqueTerms}
                selected={filters.terms}
                onChange={(selected) => setFilters(prev => ({ ...prev, terms: selected }))}
                placeholder="Filter by term..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Programs</label>
              <MultiSelectDropdown
                options={uniquePrograms}
                selected={filters.programs}
                onChange={(selected) => setFilters(prev => ({ ...prev, programs: selected }))}
                placeholder="Filter by program..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instructors</label>
              <MultiSelectDropdown
                options={uniqueInstructors}
                selected={filters.instructors}
                onChange={(selected) => setFilters(prev => ({ ...prev, instructors: selected }))}
                placeholder="Filter by instructor..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="flex items-center border border-gray-300 rounded-lg bg-white px-2">
                <Search className="w-4 h-4 text-gray-500 mr-1" />
                <input
                  type="text"
                  className="w-full py-1.5 outline-none text-sm"
                  placeholder="Search course, section, CRN, term..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                />
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <input
                  id="missingOnly"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                  checked={filters.showMissingOnly}
                  onChange={(e) => setFilters(prev => ({ ...prev, showMissingOnly: e.target.checked }))}
                />
                <label htmlFor="missingOnly" className="text-gray-700">Show missing CRN only</label>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Term</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Course</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Section</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">CRN</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Instructor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Program</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSchedules.map((row) => {
                  const effectiveCrn = (row.crn || row.CRN || '').toString();
                  const isMissing = !effectiveCrn.trim();
                  const programName = row.program || row.instructor?.program?.name || '';
                  return (
                    <tr key={row.id} className={isMissing ? 'bg-red-50/40' : ''}>
                      <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{row.term}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap font-medium">{row.courseCode}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{row.section}</td>
                      <td className={`px-4 py-2 text-sm whitespace-nowrap ${isMissing ? 'text-red-700' : 'text-gray-900'}`}>
                        {isMissing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="\\d{5}"
                              placeholder="Enter 5-digit CRN"
                              className="w-32 p-1 border border-red-300 rounded-md focus:ring-baylor-green focus:border-baylor-green text-gray-900"
                              value={editingCrn[row.id] ?? ''}
                              onChange={(e) => handleCrnInputChange(row.id, e.target.value)}
                            />
                            <button
                              onClick={() => handleCrnSave(row)}
                              className="inline-flex items-center px-2 py-1 bg-baylor-green text-white rounded-md hover:bg-baylor-green/90"
                            >
                              <Save className="w-4 h-4 mr-1" /> Save
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold">{effectiveCrn}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{row.instructorName || 'Staff'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{programName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRNQualityTools;


