import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle, 
  AlertTriangle, 
  Trash2, 
  Link, 
  RefreshCw,
  Shield,
  TrendingUp,
  Users,
  Calendar
} from 'lucide-react';
import {
  getDataHealthReport,
  findDuplicatePeople,
  findOrphanedSchedules,
  mergePeople,
  linkScheduleToPerson,
  standardizeAllData,
  autoMergeObviousDuplicates
} from '../utils/dataHygiene';

const DataHygieneManager = () => {
  const [healthReport, setHealthReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [duplicates, setDuplicates] = useState([]);
  const [orphanedSchedules, setOrphanedSchedules] = useState([]);

  // Load health report
  const loadHealthReport = async () => {
    setIsLoading(true);
    try {
      const report = await getDataHealthReport();
      setHealthReport(report);
      setDuplicates(report.duplicates);
      setOrphanedSchedules(report.orphaned);
      console.log('✅ Data health report loaded:', report);
    } catch (error) {
      console.error('❌ Error loading health report:', error);
      alert('Error loading data health report: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-load on mount
  useEffect(() => {
    loadHealthReport();
  }, []);

  // Merge duplicate people
  const handleMergePeople = async (primaryId, duplicateId) => {
    if (!confirm('Are you sure you want to merge these records? This cannot be undone.')) {
      return;
    }

    try {
      await mergePeople(primaryId, duplicateId);
      alert('Records merged successfully');
      loadHealthReport(); // Refresh
    } catch (error) {
      console.error('Error merging records:', error);
      alert('Error merging records: ' + error.message);
    }
  };

  // Link schedule to person
  const handleLinkSchedule = async (scheduleId, personId) => {
    try {
      await linkScheduleToPerson(scheduleId, personId);
      alert('Schedule linked successfully');
      loadHealthReport(); // Refresh
    } catch (error) {
      console.error('Error linking schedule:', error);
      alert('Error linking schedule: ' + error.message);
    }
  };

  // Standardize all data
  const handleStandardizeAll = async () => {
    if (!confirm('This will standardize all data formats. Continue?')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await standardizeAllData();
      alert(`Data standardized successfully. ${result.updatedRecords} records updated.`);
      loadHealthReport(); // Refresh
    } catch (error) {
      console.error('Error standardizing data:', error);
      alert('Error standardizing data: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-fix obvious duplicates
  const handleAutoFix = async () => {
    if (!confirm('This will automatically merge obvious duplicates (95%+ confidence). Continue?')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await autoMergeObviousDuplicates();
      let message = `Auto-fix complete!\n\n`;
      message += `✅ Merged: ${result.merged} obvious duplicates\n`;
      message += `⏭️ Skipped: ${result.skipped} lower confidence matches\n`;
      
      if (result.errors.length > 0) {
        message += `❌ Errors: ${result.errors.length}\n`;
      }
      
      if (result.mergedPairs.length > 0) {
        message += `\nMerged pairs:\n`;
        result.mergedPairs.forEach(pair => {
          message += `• Kept "${pair.kept}", removed "${pair.removed}"\n`;
        });
      }
      
      alert(message);
      loadHealthReport(); // Refresh
    } catch (error) {
      console.error('Error in auto-fix:', error);
      alert('Error during auto-fix: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Get health score color
  const getHealthScoreColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get health score description
  const getHealthScoreDescription = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Needs Attention';
  };

  if (isLoading && !healthReport) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-2 text-lg">Analyzing data health...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Hygiene</h1>
          <p className="text-gray-600">Keep your data clean and organized</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={loadHealthReport}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleAutoFix}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            Auto-Fix Obvious
          </button>
          <button
            onClick={handleStandardizeAll}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Standardize All
          </button>
        </div>
      </div>

      {/* Health Score Card */}
      {healthReport && (
        <div className="bg-white rounded-lg shadow-sm border mb-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Data Health Score</h2>
              <div className="flex items-center space-x-4">
                <div className={`text-3xl font-bold ${getHealthScoreColor(healthReport.summary.healthScore)}`}>
                  {healthReport.summary.healthScore}%
                </div>
                <div className="text-gray-600">
                  {getHealthScoreDescription(healthReport.summary.healthScore)}
                </div>
              </div>
            </div>
            <Shield className={`w-16 h-16 ${getHealthScoreColor(healthReport.summary.healthScore)}`} />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{healthReport.summary.totalPeople}</div>
              <div className="text-sm text-gray-600">People</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{healthReport.summary.totalSchedules}</div>
              <div className="text-sm text-gray-600">Schedules</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{healthReport.summary.duplicatePeople}</div>
              <div className="text-sm text-gray-600">Duplicates</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Link className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{healthReport.summary.orphanedSchedules}</div>
              <div className="text-sm text-gray-600">Orphaned</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'duplicates', label: `Duplicates (${duplicates.length})` },
          { id: 'orphaned', label: `Orphaned (${orphanedSchedules.length})` }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && healthReport && (
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Fix Duplicates</h4>
                <p className="text-sm text-gray-600 mb-3">
                  {duplicates.length} duplicate records found
                </p>
                <button
                  onClick={() => setActiveTab('duplicates')}
                  className="w-full px-3 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200"
                >
                  Review Duplicates
                </button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Link Orphaned Schedules</h4>
                <p className="text-sm text-gray-600 mb-3">
                  {orphanedSchedules.length} schedules need linking
                </p>
                <button
                  onClick={() => setActiveTab('orphaned')}
                  className="w-full px-3 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200"
                >
                  Fix Orphaned
                </button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Auto-Fix Issues</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Automatically merge obvious duplicates (95%+ confidence)
                </p>
                <button
                  onClick={handleAutoFix}
                  className="w-full px-3 py-2 bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200"
                >
                  Auto-Fix Obvious
                </button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Standardize Data</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Fix formatting and consistency
                </p>
                <button
                  onClick={handleStandardizeAll}
                  className="w-full px-3 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200"
                >
                  Standardize All
                </button>
              </div>
            </div>
          </div>

          {/* Missing Data Summary */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Missing Data</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">Missing Email</span>
                <span className="font-medium text-gray-900">{healthReport.summary.missingEmail}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">Missing Phone</span>
                <span className="font-medium text-gray-900">{healthReport.summary.missingPhone}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicates Tab */}
      {activeTab === 'duplicates' && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Duplicate People</h3>
            <p className="text-gray-600">Review and merge duplicate records</p>
          </div>
          <div className="p-6">
            {duplicates.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">No Duplicates Found</h4>
                <p className="text-gray-600">Your data looks clean!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {duplicates.map((duplicate, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
                        <span className="font-medium text-gray-900">{duplicate.reason}</span>
                        <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          {duplicate.confidence}% match
                        </span>
                      </div>
                      <button
                        onClick={() => handleMergePeople(duplicate.primary.id, duplicate.duplicate.id)}
                        className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                      >
                        Merge Records
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border rounded p-3">
                        <h5 className="font-medium text-gray-900 mb-2">Keep This Record</h5>
                        <p className="text-sm text-gray-600">
                          {duplicate.primary.firstName} {duplicate.primary.lastName}
                        </p>
                        <p className="text-sm text-gray-600">{duplicate.primary.email}</p>
                        <p className="text-sm text-gray-600">{duplicate.primary.phone}</p>
                      </div>
                      <div className="border rounded p-3 bg-red-50">
                        <h5 className="font-medium text-gray-900 mb-2">Delete This Record</h5>
                        <p className="text-sm text-gray-600">
                          {duplicate.duplicate.firstName} {duplicate.duplicate.lastName}
                        </p>
                        <p className="text-sm text-gray-600">{duplicate.duplicate.email}</p>
                        <p className="text-sm text-gray-600">{duplicate.duplicate.phone}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Orphaned Schedules Tab */}
      {activeTab === 'orphaned' && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Orphaned Schedules</h3>
            <p className="text-gray-600">Schedules without linked instructor records</p>
          </div>
          <div className="p-6">
            {orphanedSchedules.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">All Schedules Linked</h4>
                <p className="text-gray-600">Every schedule has a valid instructor!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orphanedSchedules.slice(0, 10).map((schedule) => (
                  <div key={schedule.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {schedule.courseCode} - {schedule.courseTitle}
                        </h4>
                        <p className="text-sm text-gray-600">
                          Instructor: {schedule.instructorName || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-600">
                          Term: {schedule.term} | Section: {schedule.section}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const personId = prompt('Enter person ID to link this schedule to:');
                          if (personId) {
                            handleLinkSchedule(schedule.id, personId);
                          }
                        }}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Link to Person
                      </button>
                    </div>
                  </div>
                ))}
                {orphanedSchedules.length > 10 && (
                  <p className="text-center text-gray-600">
                    Showing 10 of {orphanedSchedules.length} orphaned schedules
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataHygieneManager; 