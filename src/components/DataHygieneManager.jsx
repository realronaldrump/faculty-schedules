import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle, 
  AlertTriangle, 
  Trash2, 
  Link, 
  RefreshCw,
  Shield,
  Settings,
  TrendingUp,
  Users,
  Calendar,
  Mail,
  Phone,
  Building,
  User,
  Edit,
  BookUser,
  Eye,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  getDataHealthReport,
  findDuplicatePeople,
  findOrphanedSchedules,
  mergePeople,
  linkScheduleToPerson,
  previewStandardization,
  applyTargetedStandardization
} from '../utils/dataHygiene';
import MissingDataReviewModal from './MissingDataReviewModal';
import DeduplicationReviewModal from './DeduplicationReviewModal';
import { ConfirmationDialog } from './CustomAlert';

// Standardization Preview Component
const StandardizationPreview = ({ preview, onClose, onConfirm, isLoading }) => {
  const [expandedChanges, setExpandedChanges] = useState(new Set());
  
  const toggleExpanded = (personId) => {
    const newExpanded = new Set(expandedChanges);
    if (newExpanded.has(personId)) {
      newExpanded.delete(personId);
    } else {
      newExpanded.add(personId);
    }
    setExpandedChanges(newExpanded);
  };

  if (!preview) return null;

  return (
    <ConfirmationDialog
      isOpen={true}
      title="Data Standardization Preview"
      message={`Found ${preview.recordsToChange} records that can be improved. Review the changes below:`}
      type="info"
      confirmText={isLoading ? "Applying..." : `Apply ${preview.recordsToChange} Changes`}
      cancelText="Cancel"
      onConfirm={onConfirm}
      onCancel={onClose}
    >
      <div className="max-h-96 overflow-y-auto">
        {/* Summary */}
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Summary of Changes</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {preview.summary.nameParsingFixes > 0 && (
              <div>• Name parsing fixes: {preview.summary.nameParsingFixes}</div>
            )}
            {preview.summary.brokenNameFixes > 0 && (
              <div>• Broken name fixes: {preview.summary.brokenNameFixes}</div>
            )}
            {preview.summary.phoneFormatFixes > 0 && (
              <div>• Phone formatting: {preview.summary.phoneFormatFixes}</div>
            )}
            {preview.summary.emailFormatFixes > 0 && (
              <div>• Email formatting: {preview.summary.emailFormatFixes}</div>
            )}
            {preview.summary.rolesFormatFixes > 0 && (
              <div>• Roles format fixes: {preview.summary.rolesFormatFixes}</div>
            )}
          </div>
        </div>

        {/* Detailed Changes */}
        <div className="space-y-2">
          {preview.changes.slice(0, 10).map((change) => (
            <div key={change.personId} className="border rounded-lg p-3">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpanded(change.personId)}
              >
                <div className="flex items-center">
                  <User className="w-4 h-4 text-blue-600 mr-2" />
                  <span className="font-medium">{change.personName}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({change.differences.length} change{change.differences.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {expandedChanges.has(change.personId) ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </div>
              
              {expandedChanges.has(change.personId) && (
                <div className="mt-3 space-y-2">
                  {change.differences.map((diff, index) => (
                    <div key={index} className="text-sm bg-gray-50 p-2 rounded">
                      <div className="font-medium text-gray-700 mb-1">{diff.description}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-red-600 font-medium">Before:</div>
                          <div className="text-xs font-mono bg-red-50 p-1 rounded">
                            {JSON.stringify(diff.before, null, 1)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-green-600 font-medium">After:</div>
                          <div className="text-xs font-mono bg-green-50 p-1 rounded">
                            {JSON.stringify(diff.after, null, 1)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          
          {preview.changes.length > 10 && (
            <div className="text-center text-sm text-gray-500 py-2">
              ... and {preview.changes.length - 10} more records
            </div>
          )}
        </div>

        {preview.recordsToChange === 0 && (
          <div className="text-center py-4 text-gray-500">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
            All records are already properly formatted!
          </div>
        )}
      </div>
    </ConfirmationDialog>
  );
};

const DataHygieneManager = ({ showNotification }) => {
  const [healthReport, setHealthReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [duplicates, setDuplicates] = useState([]);
  const [orphanedSchedules, setOrphanedSchedules] = useState([]);
  
  // Professional modal states
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);
  const [missingDataType, setMissingDataType] = useState('email');
  const [showDeduplicationModal, setShowDeduplicationModal] = useState(false);
  
  // Standardization states
  const [showStandardizationPreview, setShowStandardizationPreview] = useState(false);
  const [standardizationPreview, setStandardizationPreview] = useState(null);
  const [isStandardizing, setIsStandardizing] = useState(false);

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

  // Professional handlers for data review
  const openMissingDataReview = (dataType) => {
    setMissingDataType(dataType);
    setShowMissingDataModal(true);
  };

  const openDeduplicationReview = () => {
    setShowDeduplicationModal(true);
  };

  const handleDataUpdated = () => {
    // Refresh health report when data is updated
    loadHealthReport();
  };

  // Preview standardization changes
  const handlePreviewStandardization = async () => {
    setIsLoading(true);
    try {
      const preview = await previewStandardization();
      setStandardizationPreview(preview);
      setShowStandardizationPreview(true);
    } catch (error) {
      console.error('Error previewing standardization:', error);
      showNotification(
        'error',
        'Preview Error',
        'Failed to generate standardization preview. Please try again.'
      );
    }
    setIsLoading(false);
  };

  // Apply standardization changes
  const handleApplyStandardization = async () => {
    if (!standardizationPreview) return;
    
    setIsStandardizing(true);
    try {
      const result = await applyTargetedStandardization();
      
      showNotification(
        'success',
        'Standardization Complete',
        `Successfully updated ${result.applied} records. ${result.errors.length > 0 ? `${result.errors.length} errors occurred.` : ''}`
      );
      
      setShowStandardizationPreview(false);
      setStandardizationPreview(null);
      await loadHealthReport();
      
    } catch (error) {
      console.error('Error applying standardization:', error);
      showNotification(
        'error',
        'Standardization Error',
        'An error occurred during standardization. Please check the console for details.'
      );
    }
    setIsStandardizing(false);
  };

  // Get health score color
  const getHealthScoreColor = (score) => {
    if (score >= 90) return 'text-baylor-green';
    if (score >= 70) return 'text-baylor-gold';
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
          <RefreshCw className="w-8 h-8 animate-spin text-baylor-green" />
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
            className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50 flex items-center"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Analysis
          </button>
          <button
            onClick={handlePreviewStandardization}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Data Cleanup
          </button>
          <button
            onClick={openDeduplicationReview}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            <Users className="w-4 h-4 mr-2" />
            Review Duplicates
          </button>
          <button
            onClick={() => openMissingDataReview('all')}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
          >
            <Edit className="w-4 h-4 mr-2" />
            Fix Missing Data
          </button>
        </div>
      </div>

      {/* Health Score Card */}
      {healthReport && (
        <>
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-serif font-semibold text-baylor-green">Data Health Score</h2>
              <div className="flex items-center">
                <span className={`text-3xl font-bold ${getHealthScoreColor(healthReport.summary.healthScore)}`}>
                  {healthReport.summary.healthScore}%
                </span>
                <span className="ml-2 text-gray-600">
                  ({getHealthScoreDescription(healthReport.summary.healthScore)})
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{healthReport.summary.totalPeople}</div>
                <div className="text-sm text-gray-600">People</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{healthReport.summary.totalSchedules}</div>
                <div className="text-sm text-gray-600">Schedules</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{duplicates.length}</div>
                <div className="text-sm text-gray-600">Potential Duplicates</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{orphanedSchedules.length}</div>
                <div className="text-sm text-gray-600">Orphaned Schedules</div>
              </div>
            </div>
          </div>

          {/* Data Quality Actions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Quality Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Users className="w-5 h-5 text-blue-600 mr-2" />
                  <h4 className="font-medium text-gray-900">Review Duplicates</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  {duplicates.length} potential duplicate records found. Review and manually merge.
                </p>
                <button
                  onClick={openDeduplicationReview}
                  className="w-full px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200"
                >
                  Review & Merge Duplicates
                </button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Link className="w-5 h-5 text-red-600 mr-2" />
                  <h4 className="font-medium text-gray-900">Fix Orphaned Records</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  {orphanedSchedules.length} schedules need to be linked to faculty
                </p>
                <button
                  onClick={() => setActiveTab('orphaned')}
                  className="w-full px-3 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200"
                >
                  Fix Orphaned Schedules
                </button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Edit className="w-5 h-5 text-purple-600 mr-2" />
                  <h4 className="font-medium text-gray-900">Complete Missing Data</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Review records and manually add missing contact information
                </p>
                <button
                  onClick={() => openMissingDataReview('all')}
                  className="w-full px-3 py-2 bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200"
                >
                  Review Missing Data
                </button>
              </div>

              {/* Safe Data Cleanup card */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Eye className="w-5 h-5 text-blue-600 mr-2" />
                  <h4 className="font-medium text-gray-900">Smart Data Cleanup</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Preview and apply safe formatting fixes like name parsing and phone numbers
                </p>
                <button
                  onClick={handlePreviewStandardization}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                >
                  {isLoading ? 'Analyzing...' : 'Preview Cleanup Changes'}
                </button>
              </div>
            </div>
          </div>
        </>
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
          {/* Professional Data Review Actions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Quality Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Users className="w-5 h-5 text-blue-600 mr-2" />
                  <h4 className="font-medium text-gray-900">Review Duplicates</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  {duplicates.length} potential duplicate records found. Review and manually merge.
                </p>
                <button
                  onClick={openDeduplicationReview}
                  className="w-full px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200"
                >
                  Review & Merge Duplicates
                </button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Link className="w-5 h-5 text-red-600 mr-2" />
                  <h4 className="font-medium text-gray-900">Fix Orphaned Records</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  {orphanedSchedules.length} schedules need to be linked to faculty
                </p>
                <button
                  onClick={() => setActiveTab('orphaned')}
                  className="w-full px-3 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200"
                >
                  Fix Orphaned Schedules
                </button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Edit className="w-5 h-5 text-purple-600 mr-2" />
                  <h4 className="font-medium text-gray-900">Complete Missing Data</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Review records and manually add missing contact information
                </p>
                <button
                  onClick={() => openMissingDataReview('all')}
                  className="w-full px-3 py-2 bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200"
                >
                  Review Missing Data
                </button>
              </div>

              {/* Clean Up Formatting card */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center mb-2">
                  <Settings className="w-5 h-5 text-blue-600 mr-2" />
                  <h4 className="font-medium text-gray-900">Standardize All Data</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Enforce a consistent schema for all records. Adds missing fields, removes obsolete ones, and cleans up formatting.
                </p>
                <button
                  onClick={handlePreviewStandardization}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200"
                >
                  Preview Standardization
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Missing Data Summary */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Missing Contact Information</h3>
            <p className="text-sm text-gray-600 mb-4">
              Click on any category below to review and manually add the missing information.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <button
                onClick={() => openMissingDataReview('email')}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
              >
                <div className="flex items-center">
                  <Mail className="w-5 h-5 text-blue-600 mr-2" />
                  <span className="text-gray-700">Missing Email</span>
                </div>
                <span className="font-medium text-red-600">{healthReport.summary.missingEmail}</span>
              </button>
              <button
                onClick={() => openMissingDataReview('phone')}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
              >
                <div className="flex items-center">
                  <Phone className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-gray-700">Missing Phone</span>
                </div>
                <span className="font-medium text-red-600">{healthReport.summary.missingPhone}</span>
              </button>
              <button
                onClick={() => openMissingDataReview('office')}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
              >
                <div className="flex items-center">
                  <Building className="w-5 h-5 text-purple-600 mr-2" />
                  <span className="text-gray-700">Missing Office</span>
                </div>
                <span className="font-medium text-red-600">{healthReport.summary.missingOffice || 0}</span>
              </button>
              <button
                onClick={() => openMissingDataReview('jobTitle')}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
              >
                <div className="flex items-center">
                  <User className="w-5 h-5 text-orange-600 mr-2" />
                  <span className="text-gray-700">Missing Job Title</span>
                </div>
                <span className="font-medium text-red-600">{healthReport.summary.missingJobTitle || 0}</span>
              </button>
              <button
                onClick={() => openMissingDataReview('program')}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
              >
                <div className="flex items-center">
                  <BookUser className="w-5 h-5 text-indigo-600 mr-2" />
                  <span className="text-gray-700">Missing Program</span>
                </div>
                <span className="font-medium text-red-600">{healthReport.summary.missingProgram || 0}</span>
              </button>
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

      {/* Professional Review Modals */}
      <MissingDataReviewModal
        isOpen={showMissingDataModal}
        onClose={() => setShowMissingDataModal(false)}
        missingDataType={missingDataType}
        onDataUpdated={handleDataUpdated}
      />

      <DeduplicationReviewModal
        isOpen={showDeduplicationModal}
        onClose={() => setShowDeduplicationModal(false)}
        onDuplicatesResolved={handleDataUpdated}
      />

      {/* Standardization Preview */}
      {showStandardizationPreview && (
        <StandardizationPreview
          preview={standardizationPreview}
          onClose={() => {
            setShowStandardizationPreview(false);
            setStandardizationPreview(null);
          }}
          onConfirm={handleApplyStandardization}
          isLoading={isStandardizing}
        />
      )}
    </div>
  );
};

export default DataHygieneManager; 