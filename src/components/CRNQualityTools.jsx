import React, { useState } from 'react';
import { Database, RefreshCw, AlertCircle, Upload } from 'lucide-react';
import { analyzeCRNCoverage, backfillCRNData, reimportCRNFromCSV } from '../utils/crnMigrationUtils';

const CRNQualityTools = ({ showNotification }) => {
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [results, setResults] = useState(null);
  const [csvName, setCsvName] = useState('');
  const [csvRows, setCsvRows] = useState(null);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const a = await analyzeCRNCoverage();
      setAnalysis(a);
      showNotification?.('info', 'CRN Analysis', `${a.coveragePercentage}% coverage (${a.withCRN}/${a.total})`);
    } catch (e) {
      console.error(e);
      showNotification?.('error', 'Analysis failed', e.message || 'Unable to analyze CRN coverage');
    } finally {
      setIsAnalyzing(false);
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-baylor-green">CRN Quality Tools</h1>
        <p className="text-gray-600">Analyze coverage, find duplicates, and safely backfill from authoritative CSV.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div className="text-sm text-amber-800">
          CRNs are always 5-digit numbers and come from the CLSS CSV. We do not guess CRNs.
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
                {analysis.duplicateCRNs.length} CRN(s) are used by multiple records. Resolve in CLSS or correct via CSV re-import.
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
    </div>
  );
};

export default CRNQualityTools;


