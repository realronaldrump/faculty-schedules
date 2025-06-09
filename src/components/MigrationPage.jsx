// src/components/MigrationPage.jsx
import React, { useState } from 'react';
import { ArrowLeft, Database, AlertTriangle, CheckCircle, PlayCircle, Eye } from 'lucide-react';
import { DataMigration } from '../utils/migration';

const MigrationPage = ({ onNavigate }) => {
  const [migrationStatus, setMigrationStatus] = useState('idle'); // idle, analyzing, running, completed, error
  const [migrationResults, setMigrationResults] = useState(null);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [showDryRun, setShowDryRun] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const analyzeDatabase = async () => {
    setMigrationStatus('analyzing');
    setLogs([]);
    addLog('Starting database analysis...', 'info');

    try {
      const migration = new DataMigration();
      const existingData = await migration.loadExistingData();
      const analysis = await migration.analyzeDataStructure(existingData);
      
      setAnalysisResults(analysis);
      addLog(`Analysis complete: ${analysis.isNormalized ? 'Already normalized' : 'Migration needed'}`, 'success');
      setMigrationStatus('idle');
    } catch (error) {
      addLog(`Analysis failed: ${error.message}`, 'error');
      setMigrationStatus('error');
    }
  };

  const runMigration = async (dryRun = false) => {
    setMigrationStatus('running');
    setMigrationResults(null);
    addLog(`Starting ${dryRun ? 'dry run' : 'live'} migration...`, 'info');

    try {
      const migration = new DataMigration();
      const results = await migration.migrateToNormalizedStructure({
        dryRun,
        batchSize: 50,
        preserveOriginal: true,
        logProgress: true
      });

      setMigrationResults(results);
      
      if (results.alreadyNormalized) {
        addLog('Database is already normalized - no migration needed', 'success');
      } else if (dryRun) {
        addLog('Dry run completed successfully - no changes made', 'success');
      } else {
        addLog('Migration completed successfully!', 'success');
      }
      
      setMigrationStatus('completed');
    } catch (error) {
      addLog(`Migration failed: ${error.message}`, 'error');
      setMigrationStatus('error');
    }
  };

  const StatusIcon = () => {
    switch (migrationStatus) {
      case 'analyzing':
      case 'running':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-baylor-green"></div>;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default:
        return <Database className="w-5 h-5 text-baylor-green" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <button 
        onClick={() => onNavigate('dashboard')}
        className="flex items-center text-baylor-green hover:text-baylor-green/80 transition-colors font-medium"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Dashboard
      </button>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Database Migration</h1>
        <p className="text-gray-600">Convert from flat data structure to normalized database with referential integrity</p>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <StatusIcon />
          <h2 className="text-lg font-serif font-semibold text-baylor-green ml-3">
            Migration Status: {migrationStatus.charAt(0).toUpperCase() + migrationStatus.slice(1)}
          </h2>
        </div>

        {/* Analysis Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={analyzeDatabase}
              disabled={migrationStatus === 'analyzing' || migrationStatus === 'running'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Eye className="mr-2" size={16} />
              Analyze Database Structure
            </button>

            {analysisResults && !analysisResults.isNormalized && (
              <>
                <button
                  onClick={() => runMigration(true)}
                  disabled={migrationStatus === 'analyzing' || migrationStatus === 'running'}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <Eye className="mr-2" size={16} />
                  Dry Run (Test Only)
                </button>

                <button
                  onClick={() => runMigration(false)}
                  disabled={migrationStatus === 'analyzing' || migrationStatus === 'running'}
                  className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <PlayCircle className="mr-2" size={16} />
                  Run Migration
                </button>
              </>
            )}
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-amber-800 mb-1">Important Notes</h3>
                <ul className="text-sm text-amber-700 space-y-1">
                  <li>• Always run "Analyze" first to check your current database structure</li>
                  <li>• Use "Dry Run" to test the migration without making changes</li>
                  <li>• The migration will automatically backup your original data</li>
                  <li>• Migration is safe to run multiple times</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Results */}
      {analysisResults && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4">Database Analysis Results</h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Current Structure</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Schedule Entries:</span>
                  <span className="font-medium">{analysisResults.schedules.count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Unique Instructors:</span>
                  <span className="font-medium">{analysisResults.instructors.count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Unique Courses:</span>
                  <span className="font-medium">{analysisResults.courses.count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Unique Rooms:</span>
                  <span className="font-medium">{analysisResults.rooms.count}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-3">Structure Status</h4>
              <div className={`p-3 rounded-lg border-2 ${
                analysisResults.isNormalized 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-orange-50 border-orange-200 text-orange-800'
              }`}>
                <div className="font-medium">
                  {analysisResults.isNormalized ? '✅ Normalized' : '⚠️ Needs Migration'}
                </div>
                <div className="text-sm mt-1">
                  {analysisResults.isNormalized 
                    ? 'Your database is already using the normalized structure with referential integrity.'
                    : 'Your database is using a flat structure and would benefit from normalization.'
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Migration Results */}
      {migrationResults && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4">Migration Results</h3>
          
          {migrationResults.alreadyNormalized ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-blue-800">
                <strong>Database Already Normalized</strong>
                <p className="mt-1 text-sm">No migration was needed as your database is already using the normalized structure.</p>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Entities Created</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Faculty:</span>
                    <span className="font-medium text-green-600">{migrationResults.faculty.created}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Courses:</span>
                    <span className="font-medium text-green-600">{migrationResults.courses.created}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rooms:</span>
                    <span className="font-medium text-green-600">{migrationResults.rooms.created}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Schedules Updated:</span>
                    <span className="font-medium text-blue-600">{migrationResults.schedules.updated}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Performance</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="font-medium">{Math.round(migrationResults.summary.duration / 1000)}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Operations:</span>
                    <span className="font-medium">{migrationResults.summary.totalOperations}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Validation</h4>
                {migrationResults.validation && (
                  <div className={`p-3 rounded-lg border ${
                    migrationResults.validation.isValid 
                      ? 'bg-green-50 border-green-200 text-green-800' 
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    <div className="font-medium">
                      {migrationResults.validation.isValid ? '✅ Passed' : '❌ Issues Found'}
                    </div>
                    {migrationResults.validation.issues.length > 0 && (
                      <div className="text-sm mt-1">
                        {migrationResults.validation.issues.length} issues detected
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Logs */}
      {logs.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4">Migration Log</h3>
          <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
            <div className="font-mono text-sm space-y-1">
              {logs.map((log, index) => (
                <div key={index} className={`flex ${
                  log.type === 'error' ? 'text-red-400' : 
                  log.type === 'success' ? 'text-green-400' : 
                  'text-gray-300'
                }`}>
                  <span className="text-gray-500 mr-3">[{log.timestamp}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MigrationPage;