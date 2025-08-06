import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle, 
  AlertTriangle, 
  Trash2, 
  Link, 
  MapPin,
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
  FileText,
  ChevronDown,
  ChevronRight,
  Search,
  X
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
import {
  generateDataHygieneReport,
  mergePeopleRecords,
  mergeScheduleRecords,
  mergeRoomRecords,
  standardizeAllData as standardizeAllDataComprehensive
} from '../utils/comprehensiveDataHygiene';
import { fetchPeople } from '../utils/dataAdapter';
import MissingDataReviewModal from './MissingDataReviewModal';
import DeduplicationReviewModal from './DeduplicationReviewModal';
import { ConfirmationDialog } from './CustomAlert';

// Link Person Modal Component
const LinkPersonModal = ({ isOpen, onClose, onConfirm, schedule }) => {
  const [people, setPeople] = useState([]);
  const [filteredPeople, setFilteredPeople] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load people data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPeople();
      setSearchTerm('');
      setSelectedPerson(null);
    }
  }, [isOpen]);

  // Filter people based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPeople(people);
    } else {
      const search = searchTerm.toLowerCase();
      const filtered = people.filter(person => {
        const fullName = `${person.firstName || ''} ${person.lastName || ''}`.toLowerCase();
        const email = (person.email || '').toLowerCase();
        const jobTitle = (person.jobTitle || '').toLowerCase();
        
        return fullName.includes(search) || 
               email.includes(search) || 
               jobTitle.includes(search);
      });
      setFilteredPeople(filtered);
    }
  }, [searchTerm, people]);

  const loadPeople = async () => {
    setIsLoading(true);
    try {
      const allPeople = await fetchPeople();
      // Sort people by name for easier browsing
      const sortedPeople = allPeople.sort((a, b) => {
        const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim();
        const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim();
        return nameA.localeCompare(nameB);
      });
      setPeople(sortedPeople);
      setFilteredPeople(sortedPeople);
    } catch (error) {
      console.error('Error loading people:', error);
    }
    setIsLoading(false);
  };

  const handleConfirm = () => {
    if (selectedPerson) {
      onConfirm(selectedPerson.id);
      onClose();
    }
  };

  const getRoleDisplay = (person) => {
    const roles = person.roles || [];
    if (Array.isArray(roles)) {
      return roles.length > 0 ? roles.join(', ') : 'No role';
    }
    return Object.keys(roles).filter(key => roles[key]).join(', ') || 'No role';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Link Schedule to Person</h3>
            <p className="text-sm text-gray-600 mt-1">
              Select a person to link to: <span className="font-medium">{schedule?.courseCode} - {schedule?.courseTitle}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, email, or job title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* People List */}
        <div className="flex-1 overflow-y-auto max-h-96">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading people...</span>
            </div>
          ) : filteredPeople.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              {searchTerm ? 'No people found matching your search' : 'No people available'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredPeople.map((person) => (
                <div
                  key={person.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedPerson?.id === person.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => setSelectedPerson(person)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <User className="w-4 h-4 text-gray-400 mr-2" />
                        <h4 className="font-medium text-gray-900">
                          {person.firstName} {person.lastName}
                        </h4>
                        {selectedPerson?.id === person.id && (
                          <CheckCircle className="w-4 h-4 text-blue-600 ml-2" />
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {person.jobTitle && (
                          <p className="text-sm text-gray-600">{person.jobTitle}</p>
                        )}
                        {person.email && (
                          <p className="text-sm text-gray-500">{person.email}</p>
                        )}
                        <div className="flex items-center text-xs text-gray-500">
                          <span className="bg-gray-100 px-2 py-1 rounded">
                            {getRoleDisplay(person)}
                          </span>
                          {person.office && (
                            <span className="ml-2">• {person.office}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {selectedPerson ? (
              <span>Selected: <strong>{selectedPerson.firstName} {selectedPerson.lastName}</strong></span>
            ) : (
              'Please select a person to link'
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedPerson}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Link Schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const [duplicateSchedules, setDuplicateSchedules] = useState([]);
  const [duplicateRooms, setDuplicateRooms] = useState([]);
  const [relationshipIssues, setRelationshipIssues] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedDuplicates, setSelectedDuplicates] = useState([]);
  const [mergeProgress, setMergeProgress] = useState(null);
  const [showConfirmMerge, setShowConfirmMerge] = useState(false);
  const [orphanedSchedules, setOrphanedSchedules] = useState([]);
  
  // Professional modal states
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);
  const [missingDataType, setMissingDataType] = useState('email');
  const [showDeduplicationModal, setShowDeduplicationModal] = useState(false);
  
  // Link person modal states
  const [showLinkPersonModal, setShowLinkPersonModal] = useState(false);
  const [scheduleToLink, setScheduleToLink] = useState(null);
  
  // Standardization states
  const [showStandardizationPreview, setShowStandardizationPreview] = useState(false);
  const [standardizationPreview, setStandardizationPreview] = useState(null);
  const [isStandardizing, setIsStandardizing] = useState(false);

  // Load health report
  const loadHealthReport = async () => {
    setIsLoading(true);
    try {
      const [basicReport, comprehensiveReport] = await Promise.all([
        getDataHealthReport(),
        generateDataHygieneReport()
      ]);
      setHealthReport(basicReport);
      setDuplicates(basicReport.duplicates);
      setOrphanedSchedules(basicReport.orphaned);

      // Comprehensive details
      setDuplicateSchedules(comprehensiveReport.details.schedules.duplicates);
      setDuplicateRooms(comprehensiveReport.details.rooms.duplicates);
      setRelationshipIssues(comprehensiveReport.details.crossCollection);
      setRecommendations(comprehensiveReport.recommendations);

      console.log('✅ Data health reports loaded:', { basicReport, comprehensiveReport });
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

  // Open link person modal
  const openLinkPersonModal = (schedule) => {
    setScheduleToLink(schedule);
    setShowLinkPersonModal(true);
  };

  // Link schedule to person
  const handleLinkSchedule = async (personId) => {
    if (!scheduleToLink) return;
    
    try {
      await linkScheduleToPerson(scheduleToLink.id, personId);
      showNotification(
        'success',
        'Schedule Linked',
        `Successfully linked ${scheduleToLink.courseCode} to selected person.`
      );
      setShowLinkPersonModal(false);
      setScheduleToLink(null);
      loadHealthReport(); // Refresh
    } catch (error) {
      console.error('Error linking schedule:', error);
      showNotification(
        'error',
        'Link Failed',
        'Failed to link schedule to person. Please try again.'
      );
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

  // ==== Duplicate Selection & Bulk Merge ====
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

  const handleBulkMerge = () => {
    if (selectedDuplicates.length === 0) {
      alert('Please select duplicates to merge');
      return;
    }
    setShowConfirmMerge(true);
  };

  const executeBulkMerge = async () => {
    setShowConfirmMerge(false);
    setMergeProgress({ current: 0, total: selectedDuplicates.length, type: 'merge' });
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
    await loadHealthReport();
    setSelectedDuplicates([]);
  };

  const handleStandardizeAllData = async () => {
    if (!confirm('This will standardize all data in the database. Continue?')) {
      return;
    }
    setMergeProgress({ current: 0, total: 1, type: 'standardize' });
    try {
      const result = await standardizeAllDataComprehensive();
      setMergeProgress(null);
      alert(`Data standardization complete: ${result.recordsUpdated} records updated`);
      await loadHealthReport();
    } catch (error) {
      console.error('Error standardizing data:', error);
      setMergeProgress(null);
      alert('Error standardizing data: ' + error.message);
    }
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
          { id: 'duplicates', label: `People (${duplicates.length})` },
          { id: 'duplicateSchedules', label: `Schedules (${duplicateSchedules.length})` },
          { id: 'duplicateRooms', label: `Rooms (${duplicateRooms.length})` },
          { id: 'orphaned', label: `Orphaned (${orphanedSchedules.length})` },
          { id: 'relationships', label: `Broken Links (${relationshipIssues.length})` },
          { id: 'recommendations', label: 'Fix Guide' }
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

      {/* Duplicate Schedules Tab */}
      {activeTab === 'duplicateSchedules' && (
        <DuplicateList
          title="Schedule Duplicates"
          duplicates={duplicateSchedules}
          selectedDuplicates={selectedDuplicates}
          onToggleSelection={toggleDuplicateSelection}
          recordType="schedules"
        />
      )}

      {/* Duplicate Rooms Tab */}
      {activeTab === 'duplicateRooms' && (
        <DuplicateList
          title="Room Duplicates"
          duplicates={duplicateRooms}
          selectedDuplicates={selectedDuplicates}
          onToggleSelection={toggleDuplicateSelection}
          recordType="rooms"
        />
      )}

      {/* Relationship Issues Tab */}
      {activeTab === 'relationships' && (
        <RelationshipIssues issues={relationshipIssues} />
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <Recommendations
          recommendations={recommendations}
          onStandardizeData={handleStandardizeAllData}
          onBulkMerge={handleBulkMerge}
          selectedCount={selectedDuplicates.length}
        />
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
                        onClick={() => openLinkPersonModal(schedule)}
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

      {/* Link Person Modal */}
      <LinkPersonModal
        isOpen={showLinkPersonModal}
        onClose={() => {
          setShowLinkPersonModal(false);
          setScheduleToLink(null);
        }}
        onConfirm={handleLinkSchedule}
        schedule={scheduleToLink}
      />
    </div>
  );
};

/* ===== Additional Components from ComprehensiveDataHygieneManager ===== */

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
          Check the boxes next to duplicates you want to merge, then go to "Fix Guide" tab to apply changes.
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
                  duplicate.confidence >= 0.9
                    ? 'bg-green-100 text-green-800'
                    : duplicate.confidence >= 0.7
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
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
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    rec.priority === 'high'
                      ? 'bg-red-100 text-red-800'
                      : rec.priority === 'medium'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
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
          Select the duplicates you want to merge using the checkboxes in the tabs above, then click "Fix Selected Issues"
          below.
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

export default DataHygieneManager; 