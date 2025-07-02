import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Users, 
  Calendar, 
  MapPin, 
  AlertTriangle, 
  CheckCircle, 
  RotateCcw, 
  Trash2, 
  Eye, 
  Settings,
  Download,
  Upload,
  RefreshCw,
  TrendingUp,
  Shield,
  Link,
  Unlink,
  FileText,
  BarChart3
} from 'lucide-react';
import {
  comprehensiveDuplicateDetection,
  mergePeopleRecords,
  mergeScheduleRecords,
  mergeRoomRecords,
  standardizeAllData,
  generateDataHygieneReport
} from '../utils/comprehensiveDataHygiene';

const ComprehensiveDataHygieneManager = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [hygieneReport, setHygieneReport] = useState(null);
  const [selectedDuplicates, setSelectedDuplicates] = useState([]);
  const [mergeProgress, setMergeProgress] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showConfirmMerge, setShowConfirmMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null);

  // Load comprehensive data hygiene report
  const loadHygieneReport = async () => {
    setIsLoading(true);
    try {
      console.log('🔍 Generating comprehensive data hygiene report...');
      const report = await generateDataHygieneReport();
      setHygieneReport(report);
      console.log('✅ Data hygiene report generated:', report);
    } catch (error) {
      console.error('❌ Error generating hygiene report:', error);
      alert('Error generating data hygiene report: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-load report on component mount
  useEffect(() => {
    loadHygieneReport();
  }, []);

  // Handle duplicate selection
  const toggleDuplicateSelection = (duplicate) => {
    setSelectedDuplicates(prev => {
      const exists = prev.find(d => 
        d.type === duplicate.type && 
        d.records[0].id === duplicate.records[0].id &&
        d.records[1].id === duplicate.records[1].id
      );
      
      if (exists) {
        return prev.filter(d => d !== exists);
      } else {
        return [...prev, duplicate];
      }
    });
  };

  // Handle bulk merge
  const handleBulkMerge = async () => {
    if (selectedDuplicates.length === 0) {
      alert('Please select duplicates to merge');
      return;
    }

    setShowConfirmMerge(true);
  };

  // Execute bulk merge
  const executeBulkMerge = async () => {
    setShowConfirmMerge(false);
    setMergeProgress({ current: 0, total: selectedDuplicates.length, type: 'merge' });
    
    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < selectedDuplicates.length; i++) {
        const duplicate = selectedDuplicates[i];
        setMergeProgress({ current: i + 1, total: selectedDuplicates.length, type: 'merge' });

        try {
          switch (duplicate.mergeStrategy) {
            case 'merge_people':
              await mergePeopleRecords(duplicate);
              break;
            case 'merge_schedules':
              await mergeScheduleRecords(duplicate);
              break;
            case 'merge_rooms':
              await mergeRoomRecords(duplicate);
              break;
            default:
              console.warn('Unknown merge strategy:', duplicate.mergeStrategy);
          }
          successCount++;
        } catch (error) {
          console.error('Error merging duplicate:', error);
          errorCount++;
        }
      }

      setMergeProgress(null);
      alert(`Merge complete: ${successCount} successful, ${errorCount} failed`);
      
      // Reload report
      await loadHygieneReport();
      setSelectedDuplicates([]);

    } catch (error) {
      console.error('Error in bulk merge:', error);
      setMergeProgress(null);
      alert('Error during bulk merge: ' + error.message);
    }
  };

  // Handle data standardization
  const handleStandardizeData = async () => {
    if (!confirm('This will standardize all data in the database. Continue?')) {
      return;
    }

    setMergeProgress({ current: 0, total: 1, type: 'standardize' });
    
    try {
      const result = await standardizeAllData();
      setMergeProgress(null);
      alert(`Data standardization complete: ${result.recordsUpdated} records updated`);
      
      // Reload report
      await loadHygieneReport();
    } catch (error) {
      console.error('Error standardizing data:', error);
      setMergeProgress(null);
      alert('Error standardizing data: ' + error.message);
    }
  };

  // Export report
  const exportReport = () => {
    if (!hygieneReport) return;
    
    const reportData = {
      ...hygieneReport,
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-hygiene-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hygieneReport && !isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center">
          <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Data Hygiene Report</h2>
          <p className="text-gray-600 mb-4">Click the button below to generate a comprehensive data hygiene report.</p>
          <button
            onClick={loadHygieneReport}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Generate Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Cleanup</h1>
          <p className="text-gray-600">Find and fix duplicate records in your database</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadHygieneReport}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportReport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Analyzing data quality...</p>
        </div>
      )}

      {/* Progress Indicator */}
      {mergeProgress && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-blue-900">
              {mergeProgress.type === 'merge' ? 'Merging Duplicates' : 'Standardizing Data'}
            </span>
            <span className="text-sm text-blue-700">
              {mergeProgress.current} / {mergeProgress.total}
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(mergeProgress.current / mergeProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {hygieneReport && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Issues Found</p>
                  <p className="text-2xl font-bold text-red-600">{hygieneReport.summary.totalIssues}</p>
                  <p className="text-xs text-gray-500 mt-1">Duplicates and broken connections</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Data Quality</p>
                  <p className="text-2xl font-bold text-green-600">
                    {hygieneReport.dataQualityScore}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Overall data cleanliness</p>
                </div>
                <Shield className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Ready to Fix</p>
                  <p className="text-2xl font-bold text-blue-600">{selectedDuplicates.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Selected for merging</p>
                </div>
                <CheckCircle className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <nav className="flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'people', label: 'Duplicate People', icon: Users },
                { id: 'schedules', label: 'Duplicate Schedules', icon: Calendar },
                { id: 'rooms', label: 'Duplicate Rooms', icon: MapPin },
                { id: 'relationships', label: 'Broken Links', icon: Link },
                { id: 'recommendations', label: 'How to Fix', icon: FileText }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-lg shadow border">
            {activeTab === 'overview' && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-2">Data Health Summary</h3>
                <p className="text-gray-600 text-sm mb-6">
                  Here's what we found in your database and what needs attention.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h4 className="font-medium mb-3 text-blue-900">Your Database Contains</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center">
                          <Users className="w-4 h-4 mr-2 text-blue-600" />
                          Faculty & Staff
                        </span>
                        <span className="font-medium text-blue-900">{hygieneReport.details.people.total}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-blue-600" />
                          Course Schedules
                        </span>
                        <span className="font-medium text-blue-900">{hygieneReport.details.schedules.total}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center">
                          <MapPin className="w-4 h-4 mr-2 text-blue-600" />
                          Rooms & Locations
                        </span>
                        <span className="font-medium text-blue-900">{hygieneReport.details.rooms.total}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-red-50 rounded-lg p-4">
                    <h4 className="font-medium mb-3 text-red-900">Issues That Need Fixing</h4>
                    <div className="space-y-2">
                      {hygieneReport.details.people.duplicateCount > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-red-700">Duplicate People</span>
                          <span className="font-medium text-red-900 bg-red-200 px-2 py-1 rounded text-sm">
                            {hygieneReport.details.people.duplicateCount}
                          </span>
                        </div>
                      )}
                      {hygieneReport.details.schedules.duplicateCount > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-red-700">Duplicate Schedules</span>
                          <span className="font-medium text-red-900 bg-red-200 px-2 py-1 rounded text-sm">
                            {hygieneReport.details.schedules.duplicateCount}
                          </span>
                        </div>
                      )}
                      {hygieneReport.details.rooms.duplicateCount > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-red-700">Duplicate Rooms</span>
                          <span className="font-medium text-red-900 bg-red-200 px-2 py-1 rounded text-sm">
                            {hygieneReport.details.rooms.duplicateCount}
                          </span>
                        </div>
                      )}
                      {hygieneReport.details.crossCollection.length > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-red-700">Broken Connections</span>
                          <span className="font-medium text-red-900 bg-red-200 px-2 py-1 rounded text-sm">
                            {hygieneReport.details.crossCollection.length}
                          </span>
                        </div>
                      )}
                      {hygieneReport.summary.totalIssues === 0 && (
                        <div className="text-center py-4">
                          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                          <p className="text-green-700 font-medium">No issues found!</p>
                          <p className="text-green-600 text-sm">Your data is clean and well-organized.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {hygieneReport.summary.totalIssues > 0 && (
                  <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-900 mb-2">What This Means</h4>
                    <p className="text-yellow-800 text-sm">
                      Having duplicates means some information appears multiple times in your system. 
                      This can cause confusion when looking up people or schedules. The tabs above will 
                      show you exactly what's duplicated so you can choose to merge them into single, 
                      accurate records.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'people' && (
              <DuplicateList
                title="People Duplicates"
                duplicates={hygieneReport.details.people.duplicates}
                selectedDuplicates={selectedDuplicates}
                onToggleSelection={toggleDuplicateSelection}
                recordType="people"
              />
            )}

            {activeTab === 'schedules' && (
              <DuplicateList
                title="Schedule Duplicates"
                duplicates={hygieneReport.details.schedules.duplicates}
                selectedDuplicates={selectedDuplicates}
                onToggleSelection={toggleDuplicateSelection}
                recordType="schedules"
              />
            )}

            {activeTab === 'rooms' && (
              <DuplicateList
                title="Room Duplicates"
                duplicates={hygieneReport.details.rooms.duplicates}
                selectedDuplicates={selectedDuplicates}
                onToggleSelection={toggleDuplicateSelection}
                recordType="rooms"
              />
            )}

            {activeTab === 'relationships' && (
              <RelationshipIssues
                issues={hygieneReport.details.crossCollection}
              />
            )}

            {activeTab === 'recommendations' && (
              <Recommendations
                recommendations={hygieneReport.recommendations}
                onStandardizeData={handleStandardizeData}
                onBulkMerge={handleBulkMerge}
                selectedCount={selectedDuplicates.length}
              />
            )}
          </div>
        </>
      )}

      {/* Confirm Merge Modal */}
      {showConfirmMerge && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Fix These Issues?</h3>
            <p className="text-gray-600 mb-4">
              You're about to merge {selectedDuplicates.length} duplicate records into single, clean records.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-6">
              <p className="text-blue-800 text-sm">
                <strong>What this does:</strong> Combines duplicate records and updates all references. 
                The duplicates will be removed, keeping the most complete information.
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmMerge(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkMerge}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Fix {selectedDuplicates.length} Issues
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Duplicate List Component
const DuplicateList = ({ title, duplicates, selectedDuplicates, onToggleSelection, recordType }) => {
  if (duplicates.length === 0) {
    return (
      <div className="p-6 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Duplicates Found!</h3>
        <p className="text-gray-600">All {recordType} records are unique and clean.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <span className="text-sm text-gray-500">{duplicates.length} issues found</span>
        </div>
        <p className="text-sm text-gray-600">
          Check the boxes next to duplicates you want to merge, then go to "How to Fix" tab to apply changes.
        </p>
      </div>
      
      <div className="space-y-4">
        {duplicates.map((duplicate, index) => {
          const isSelected = selectedDuplicates.some(d => 
            d.type === duplicate.type && 
            d.records[0].id === duplicate.records[0].id &&
            d.records[1].id === duplicate.records[1].id
          );

          return (
            <div
              key={index}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => onToggleSelection(duplicate)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelection(duplicate)}
                    className="rounded"
                  />
                  <span className="font-medium text-gray-900">{duplicate.reason}</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  duplicate.confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                  duplicate.confidence >= 0.7 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {Math.round(duplicate.confidence * 100)}% match
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Record 1</h4>
                  <RecordDisplay record={duplicate.records[0]} type={recordType} />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Record 2</h4>
                  <RecordDisplay record={duplicate.records[1]} type={recordType} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Record Display Component
const RecordDisplay = ({ record, type }) => {
  const getDisplayFields = () => {
    switch (type) {
      case 'people':
        return [
          { label: 'Name', value: `${record.firstName} ${record.lastName}` },
          { label: 'Email', value: record.email },
          { label: 'Program', value: record.program?.name || 'Unassigned' },
          { label: 'Job Title', value: record.jobTitle }
        ];
      case 'schedules':
        return [
          { label: 'Course', value: record.courseCode },
          { label: 'Section', value: record.section },
          { label: 'Term', value: record.term },
          { label: 'Instructor', value: record.instructorName }
        ];
      case 'rooms':
        return [
          { label: 'Name', value: record.name || record.displayName },
          { label: 'Building', value: record.building },
          { label: 'Room Number', value: record.roomNumber },
          { label: 'Type', value: record.type }
        ];
      default:
        return [];
    }
  };

  return (
    <div className="text-sm space-y-1">
      {getDisplayFields().map((field, index) => (
        <div key={index} className="flex justify-between">
          <span className="text-gray-600">{field.label}:</span>
          <span className="font-medium">{field.value || 'N/A'}</span>
        </div>
      ))}
    </div>
  );
};

// Relationship Issues Component
const RelationshipIssues = ({ issues }) => {
  if (issues.length === 0) {
    return (
      <div className="p-6 text-center">
        <Link className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Relationship Issues</h3>
        <p className="text-gray-600">All cross-collection relationships are intact!</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold mb-4">Relationship Issues</h3>
      <div className="space-y-4">
        {issues.map((issue, index) => (
          <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-red-900 mb-1">{issue.type.replace(/_/g, ' ').toUpperCase()}</h4>
                <p className="text-red-700 text-sm mb-2">{issue.reason}</p>
                <p className="text-red-600 text-xs">Severity: {issue.severity}</p>
              </div>
              <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                {issue.fix.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Recommendations Component
const Recommendations = ({ recommendations, onStandardizeData, onBulkMerge, selectedCount }) => {
  if (recommendations.length === 0) {
    return (
      <div className="p-6 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Data Looks Great!</h3>
        <p className="text-gray-600">No issues found that need attention.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold mb-2">What Should I Fix?</h3>
      <p className="text-gray-600 text-sm mb-6">Here's what we found and how to fix it:</p>
      
      <div className="space-y-4 mb-8">
        {recommendations.map((rec, index) => (
          <div key={index} className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  rec.priority === 'high' ? 'bg-red-100 text-red-800' :
                  rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {rec.priority === 'high' ? 'Important' : rec.priority === 'medium' ? 'Recommended' : 'Optional'}
                </span>
                <h4 className="font-medium text-gray-900">{rec.action}</h4>
              </div>
              <span className="text-sm font-medium text-gray-900 bg-white px-2 py-1 rounded">
                {rec.count} {rec.count === 1 ? 'item' : 'items'}
              </span>
            </div>
            <p className="text-gray-700 text-sm mb-2">{rec.description}</p>
            <p className="text-green-700 text-sm font-medium">✓ {rec.benefit}</p>
          </div>
        ))}
      </div>

      <div className="border-t pt-6 bg-blue-50 -mx-6 px-6 -mb-6 pb-6">
        <h4 className="font-medium mb-2">How to Fix These Issues</h4>
        <p className="text-sm text-gray-600 mb-4">
          Select the duplicates you want to merge using the checkboxes in the tabs above, then click "Fix Selected Issues" below.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={onBulkMerge}
            disabled={selectedCount === 0}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Fix Selected Issues ({selectedCount})
          </button>
          <button
            onClick={onStandardizeData}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center font-medium"
          >
            <Settings className="w-4 h-4 mr-2" />
            Clean Up Formatting
          </button>
        </div>
        {selectedCount === 0 && (
          <p className="text-sm text-gray-500 mt-2">
            Go to the People, Schedules, or Rooms tabs above to select items to fix.
          </p>
        )}
      </div>
    </div>
  );
};

export default ComprehensiveDataHygieneManager;