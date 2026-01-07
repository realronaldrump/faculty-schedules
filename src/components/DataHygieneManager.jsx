import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Link,
  MapPin,
  RefreshCw,
  Users,
  Calendar,
  Mail,
  Phone,
  Building,
  User,
  BookUser,
  ChevronRight,
  Search,
  X,
  Edit
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import {
  getDataHealthReport,
  findOrphanedSchedules,
  mergePeople,
  linkScheduleToPerson
} from '../utils/dataHygiene';
import { generateDataHygieneReport, mergeScheduleRecords, mergeRoomRecords } from '../utils/comprehensiveDataHygiene';
import { collection as fbCollection, getDocs as fbGetDocs, writeBatch as fbWriteBatch, doc as fbDoc } from 'firebase/firestore';
import { logBulkUpdate } from '../utils/changeLogger';
import { fetchPeople } from '../utils/dataAdapter';
import MissingDataReviewModal from './MissingDataReviewModal';
// DeduplicationReviewModal removed from wizard-first UI
import { ConfirmationDialog } from './CustomAlert';
import OrphanedDataCleanupModal from './admin/OrphanedDataCleanupModal';
import { logUpdate } from '../utils/changeLogger';
import { useUI } from '../contexts/UIContext';

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

// Link Room Modal Component
const LinkRoomModal = ({ isOpen, onClose, onConfirm, schedule }) => {
  const [rooms, setRooms] = useState([]);
  const [filteredRooms, setFilteredRooms] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadRooms();
      setSearchTerm('');
      setSelectedRoom(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredRooms(rooms);
    } else {
      const search = searchTerm.toLowerCase();
      const filtered = rooms.filter(room => {
        const name = (room.displayName || room.name || '').toLowerCase();
        const building = (room.building || '').toLowerCase();
        const roomNumber = (room.roomNumber || '').toString().toLowerCase();
        return name.includes(search) || building.includes(search) || roomNumber.includes(search);
      });
      setFilteredRooms(filtered);
    }
  }, [searchTerm, rooms]);

  const loadRooms = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'rooms'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sorted = data.sort((a, b) => {
        const aName = `${a.displayName || a.name || ''}`.trim();
        const bName = `${b.displayName || b.name || ''}`.trim();
        return aName.localeCompare(bName);
      });
      setRooms(sorted);
      setFilteredRooms(sorted);
    } catch (e) {
      console.error('Error loading rooms:', e);
    }
    setIsLoading(false);
  };

  const handleConfirm = () => {
    if (selectedRoom) {
      onConfirm(selectedRoom.id, selectedRoom);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Link Schedule to Room</h3>
            <p className="text-sm text-gray-600 mt-1">
              Select a room for: <span className="font-medium">{schedule?.courseCode} - {schedule?.courseTitle}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, building, or room number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto max-h-96">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading rooms...</span>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              {searchTerm ? 'No rooms found matching your search' : 'No rooms available'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedRoom?.id === room.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => setSelectedRoom(room)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                        <h4 className="font-medium text-gray-900">
                          {room.displayName || room.name}
                        </h4>
                        {selectedRoom?.id === room.id && (
                          <CheckCircle className="w-4 h-4 text-blue-600 ml-2" />
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {room.building}{room.roomNumber ? ` ${room.roomNumber}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {selectedRoom ? (
              <span>Selected: <strong>{selectedRoom.displayName || selectedRoom.name}</strong></span>
            ) : (
              'Please select a room'
            )}
          </div>
          <div className="flex space-x-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={!selectedRoom} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Link Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Standardization preview removed

const DataHygieneManager = () => {
  const { showNotification } = useUI();
  const [healthReport, setHealthReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [duplicateSchedules, setDuplicateSchedules] = useState([]);
  const [duplicateRooms, setDuplicateRooms] = useState([]);
  const [relationshipIssues, setRelationshipIssues] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [orphanedSchedules, setOrphanedSchedules] = useState([]);
  
  // Professional modal states
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);
  const [missingDataType, setMissingDataType] = useState('email');
  // removed: legacy deduplication modal state
  
  // Link person modal states
  const [showLinkPersonModal, setShowLinkPersonModal] = useState(false);
  const [scheduleToLink, setScheduleToLink] = useState(null);
  const [showLinkRoomModal, setShowLinkRoomModal] = useState(false);
  const [scheduleToLinkRoom, setScheduleToLinkRoom] = useState(null);
  
  // Standardization states
  // removed: standardization preview state

  // Wizard state
  const steps = ['analyze', 'duplicates', 'orphaned', 'missing', 'links', 'finish'];
  const [wizardStep, setWizardStep] = useState('analyze');
  // advanced tabs removed
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  // Section/CRN cleanup preview state
  const [cleanupPreviewOpen, setCleanupPreviewOpen] = useState(false);
  const [cleanupPreviewItems, setCleanupPreviewItems] = useState([]);
  const [cleanupPreviewLoading, setCleanupPreviewLoading] = useState(false);

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
      showNotification(
        'error',
        'Analysis Error',
        `Error loading data health report: ${error.message}`
      );
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
    // Use styled confirmation dialog instead of native confirm
    setShowConfirmMerge(true);
    return;

    try {
      await mergePeople(primaryId, duplicateId);
      showNotification('success', 'Merge Complete', 'Records merged successfully');
      loadHealthReport(); // Refresh
    } catch (error) {
      console.error('Error merging records:', error);
      showNotification('error', 'Merge Failed', `Error merging records: ${error.message}`);
    }
  };

  // Merge duplicate schedules
  const handleMergeSchedules = async (duplicateGroup) => {
    try {
      await mergeScheduleRecords(duplicateGroup);
      showNotification('success', 'Schedules Merged', 'Duplicate schedules merged successfully');
      await loadHealthReport();
    } catch (e) {
      console.error('Error merging schedules:', e);
      showNotification('error', 'Merge Failed', e.message || 'Could not merge schedules');
    }
  };

  // Merge duplicate rooms
  const handleMergeRooms = async (duplicateGroup) => {
    try {
      await mergeRoomRecords(duplicateGroup);
      showNotification('success', 'Rooms Merged', 'Duplicate rooms merged successfully');
      await loadHealthReport();
    } catch (e) {
      console.error('Error merging rooms:', e);
      showNotification('error', 'Merge Failed', e.message || 'Could not merge rooms');
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

  // Open link room modal
  const openLinkRoomModal = (schedule) => {
    setScheduleToLinkRoom(schedule);
    setShowLinkRoomModal(true);
  };

  // Link schedule to room (single selection for now)
  const handleLinkRoom = async (roomId, roomObj) => {
    if (!scheduleToLinkRoom) return;
    try {
      const scheduleRef = doc(db, 'schedules', scheduleToLinkRoom.id);
      const displayName = roomObj?.displayName || roomObj?.name || '';
      await updateDoc(scheduleRef, {
        roomId: roomId,
        roomIds: [roomId],
        roomName: displayName,
        roomNames: [displayName],
        updatedAt: new Date().toISOString()
      });

      await logUpdate(
        `Schedule Room Link - ${scheduleToLinkRoom.courseCode} ${scheduleToLinkRoom.section}`,
        'schedules',
        scheduleToLinkRoom.id,
        { roomId, roomIds: [roomId], roomName: displayName, roomNames: [displayName] },
        scheduleToLinkRoom,
        'DataHygieneManager.jsx - handleLinkRoom'
      );

      showNotification('success', 'Room Linked', 'Room linked to schedule');
      setShowLinkRoomModal(false);
      setScheduleToLinkRoom(null);
      loadHealthReport();
    } catch (error) {
      console.error('Error linking room:', error);
      showNotification('error', 'Link Failed', 'Failed to link room to schedule.');
    }
  };

  // Professional handlers for data review
  const openMissingDataReview = (dataType) => {
    setMissingDataType(dataType);
    setShowMissingDataModal(true);
  };

  // removed: deduplication review modal opener

  const handleDataUpdated = () => {
    // Refresh health report when data is updated
    loadHealthReport();
  };

  // Preview standardization changes
  // removed: preview standardization

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
  // removed: bulk merge selection and progress UI

  const handleStandardizeAllData = async () => {
    // Reuse merge confirmation modal for standardization flow
    setShowConfirmMerge(true);
    return;
    setMergeProgress({ current: 0, total: 1, type: 'standardize' });
    try {
      const result = await standardizeAllDataComprehensive();
      setMergeProgress(null);
      showNotification('success', 'Standardization Complete', `${result.recordsUpdated} records updated`);
      await loadHealthReport();
    } catch (error) {
      console.error('Error standardizing data:', error);
      setMergeProgress(null);
      showNotification('error', 'Standardization Error', `Error: ${error.message}`);
    }
  };

  const goNext = () => {
    const idx = steps.indexOf(wizardStep);
    if (idx < steps.length - 1) setWizardStep(steps[idx + 1]);
  };
  const goBack = () => {
    const idx = steps.indexOf(wizardStep);
    if (idx > 0) setWizardStep(steps[idx - 1]);
  };

  // Fix inconsistent instructor name across schedules
  const standardizeInstructorNameForId = async (instructorId) => {
    try {
      const personSnap = await getDocs(query(collection(db, 'people'), where('__name__', '==', instructorId)));
      const person = personSnap.docs[0]?.data();
      if (!person) throw new Error('Instructor not found');
      const instructorName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
      const schedulesSnap = await getDocs(query(collection(db, 'schedules'), where('instructorId', '==', instructorId)));
      let updated = 0;
      for (const sDoc of schedulesSnap.docs) {
        const before = sDoc.data();
        await updateDoc(sDoc.ref, { instructorName, updatedAt: new Date().toISOString() });
        await logUpdate(
          `Standardize Instructor Name - ${instructorName}`,
          'schedules',
          sDoc.id,
          { instructorName },
          before,
          'DataHygieneManager.jsx - standardizeInstructorNameForId'
        );
        updated++;
      }
      showNotification('success', 'Instructor Names Standardized', `Updated ${updated} schedules`);
      await loadHealthReport();
    } catch (e) {
      console.error('Error standardizing instructor names:', e);
      showNotification('error', 'Action Failed', e.message);
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
      {/* Wizard Stepper */}
      <div className="mb-4">
        <div className="flex items-center overflow-x-auto">
          {steps.map((s, i) => {
            const labels = {
              analyze: 'Analyze',
              duplicates: 'Duplicates',
              orphaned: 'Orphaned',
              missing: 'Missing Data',
              links: 'Broken Links',
              finish: 'Finish'
            };
            const active = wizardStep === s;
            return (
              <div key={s} className="flex items-center">
                <button
                  onClick={() => setWizardStep(s)}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {labels[s]}
                </button>
                {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />}
              </div>
            );
          })}
        </div>
      </div>
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
            onClick={async () => {
              setCleanupPreviewLoading(true);
              try {
                const snap = await fbGetDocs(fbCollection(db, 'schedules'));
                const preview = [];
                for (const d of snap.docs) {
                  const s = d.data();
                  const rawSection = (s.section || '').toString();
                  const match = rawSection.match(/\((\d{5,6})\)/);
                  const parsedCrn = match ? match[1] : '';
                  const normalizedSection = (() => {
                    const cut = rawSection.split(' ')[0];
                    const idx = cut.indexOf('(');
                    return idx > -1 ? cut.substring(0, idx).trim() : cut.trim();
                  })();
                  const newCrn = (s.crn && /^\d{5,6}$/.test(String(s.crn))) ? s.crn : parsedCrn;
                  const shouldUpdate = (normalizedSection !== s.section) || (!!newCrn && String(newCrn) !== String(s.crn || ''));
                  if (shouldUpdate) {
                    preview.push({
                      id: d.id,
                      courseCode: s.courseCode,
                      term: s.term,
                      before: { section: s.section || '', crn: s.crn || '' },
                      after: { section: normalizedSection, crn: newCrn || '' }
                    });
                  }
                }
                setCleanupPreviewItems(preview);
                setCleanupPreviewOpen(true);
              } catch (e) {
                console.error('Preview error:', e);
                showNotification('error', 'Preview Failed', e.message || 'Could not prepare preview');
              }
              setCleanupPreviewLoading(false);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {cleanupPreviewLoading ? 'Preparing…' : 'Clean Up Section/CRN'}
          </button>
          
          {/* legacy header buttons removed to focus on wizard */}
        </div>
      </div>

      {/* Progress Indicator */}
      {/* merge progress removed */}

      {/* Health Score Card */}
      {healthReport && (
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif font-semibold text-baylor-green">Data Health Score</h2>
            <div className="flex items-center">
              <span className={`text-3xl font-bold ${getHealthScoreColor(healthReport?.summary?.healthScore || 0)}`}>
                {healthReport?.summary?.healthScore || 0}%
              </span>
              <span className="ml-2 text-gray-600">
                ({getHealthScoreDescription(healthReport?.summary?.healthScore || 0)})
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{healthReport?.summary?.totalPeople || 0}</div>
              <div className="text-sm text-gray-600">People</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{healthReport?.summary?.totalSchedules || 0}</div>
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
      )}

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
            
          </div>
          
          <div className="p-4 border rounded-lg">
            <div className="flex items-center mb-2">
              <Link className="w-5 h-5 text-red-600 mr-2" />
              <h4 className="font-medium text-gray-900">Fix Orphaned Records</h4>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              {orphanedSchedules.length} schedules need to be linked to faculty
            </p>
            
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
          {/* standardization card removed */}
        </div>
      </div>

      {/* Interactive Missing Data Summary */}
      {healthReport && (
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
            <span className="font-medium text-red-600">{healthReport?.summary?.missingEmail || 0}</span>
          </button>
          <button
            onClick={() => openMissingDataReview('phone')}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
          >
            <div className="flex items-center">
              <Phone className="w-5 h-5 text-green-600 mr-2" />
              <span className="text-gray-700">Missing Phone</span>
            </div>
            <span className="font-medium text-red-600">{healthReport?.summary?.missingPhone || 0}</span>
          </button>
          <button
            onClick={() => openMissingDataReview('office')}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
          >
            <div className="flex items-center">
              <Building className="w-5 h-5 text-purple-600 mr-2" />
              <span className="text-gray-700">Missing Office</span>
            </div>
            <span className="font-medium text-red-600">{healthReport?.summary?.missingOffice || 0}</span>
          </button>
          <button
            onClick={() => openMissingDataReview('jobTitle')}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
          >
            <div className="flex items-center">
              <User className="w-5 h-5 text-orange-600 mr-2" />
              <span className="text-gray-700">Missing Job Title</span>
            </div>
            <span className="font-medium text-red-600">{healthReport?.summary?.missingJobTitle || 0}</span>
          </button>
          <button
            onClick={() => openMissingDataReview('program')}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
          >
            <div className="flex items-center">
              <BookUser className="w-5 h-5 text-indigo-600 mr-2" />
              <span className="text-gray-700">Missing Program</span>
            </div>
            <span className="font-medium text-red-600">{healthReport?.summary?.missingProgram || 0}</span>
          </button>
        </div>
      </div>
      )}

      {/* Duplicates Step */}
      {wizardStep === 'duplicates' && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Review Duplicates</h3>
            <p className="text-gray-600">Deterministic duplicates across people, schedules, and rooms</p>
          </div>
          <div className="p-6">
            {/* People duplicates */}
            <h4 className="text-md font-semibold text-gray-900 mb-3">People</h4>
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

            {/* Schedule duplicates */}
            <div className="mt-10">
              <h4 className="text-md font-semibold text-gray-900 mb-3">Schedules</h4>
              {duplicateSchedules.length === 0 ? (
                <div className="text-center py-6 text-gray-600">No duplicate schedules</div>
              ) : (
                <div className="space-y-4">
                  {duplicateSchedules.slice(0, 20).map((dup, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
                          <span className="font-medium text-gray-900">{dup.reason}</span>
                        </div>
                        <button
                          onClick={() => handleMergeSchedules(dup)}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Merge Schedules
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="border rounded p-3">
                          <div className="font-medium text-gray-900 mb-1">Record 1</div>
                          <div>Course: <span className="font-medium">{dup.records[0].courseCode}</span></div>
                          <div>Section: <span className="font-medium">{dup.records[0].section}</span></div>
                          <div>Term: <span className="font-medium">{dup.records[0].term}</span></div>
                          <div>Instructor: <span className="font-medium">{dup.records[0].instructorName}</span></div>
                          <div>Room: <span className="font-medium">{(dup.records[0].roomNames || [dup.records[0].roomName]).filter(Boolean).join('; ')}</span></div>
                        </div>
                        <div className="border rounded p-3 bg-blue-50">
                          <div className="font-medium text-gray-900 mb-1">Record 2</div>
                          <div>Course: <span className="font-medium">{dup.records[1].courseCode}</span></div>
                          <div>Section: <span className="font-medium">{dup.records[1].section}</span></div>
                          <div>Term: <span className="font-medium">{dup.records[1].term}</span></div>
                          <div>Instructor: <span className="font-medium">{dup.records[1].instructorName}</span></div>
                          <div>Room: <span className="font-medium">{(dup.records[1].roomNames || [dup.records[1].roomName]).filter(Boolean).join('; ')}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {duplicateSchedules.length > 20 && (
                    <div className="text-center text-gray-500">Showing 20 of {duplicateSchedules.length}</div>
                  )}
                </div>
              )}
            </div>

            {/* Room duplicates */}
            <div className="mt-10">
              <h4 className="text-md font-semibold text-gray-900 mb-3">Rooms</h4>
              {duplicateRooms.length === 0 ? (
                <div className="text-center py-6 text-gray-600">No duplicate rooms</div>
              ) : (
                <div className="space-y-4">
                  {duplicateRooms.slice(0, 20).map((dup, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
                          <span className="font-medium text-gray-900">{dup.reason}</span>
                        </div>
                        <button
                          onClick={() => handleMergeRooms(dup)}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Merge Rooms
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="border rounded p-3">
                          <div className="font-medium text-gray-900 mb-1">Record 1</div>
                          <div>Name: <span className="font-medium">{dup.records[0].displayName || dup.records[0].name}</span></div>
                          <div>Building: <span className="font-medium">{dup.records[0].building}</span></div>
                          <div>Room #: <span className="font-medium">{dup.records[0].roomNumber}</span></div>
                        </div>
                        <div className="border rounded p-3 bg-blue-50">
                          <div className="font-medium text-gray-900 mb-1">Record 2</div>
                          <div>Name: <span className="font-medium">{dup.records[1].displayName || dup.records[1].name}</span></div>
                          <div>Building: <span className="font-medium">{dup.records[1].building}</span></div>
                          <div>Room #: <span className="font-medium">{dup.records[1].roomNumber}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {duplicateRooms.length > 20 && (
                    <div className="text-center text-gray-500">Showing 20 of {duplicateRooms.length}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Advanced duplicates sections removed */}

      {/* Broken Links Step */}
      {wizardStep === 'links' && (
        <RelationshipIssues
          issues={relationshipIssues}
          onLinkPerson={openLinkPersonModal}
          onLinkRoom={openLinkRoomModal}
          onStandardizeInstructorName={standardizeInstructorNameForId}
        />
      )}

      {/* Advanced relationship tab removed */}

      {/* Finish Step */}
      {wizardStep === 'finish' && (
        <Recommendations
          recommendations={recommendations}
        />
      )}

      {/* Orphaned Step */}
      {wizardStep === 'orphaned' && (
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
                      <div className="flex gap-2">
                        <button
                          onClick={() => openLinkPersonModal(schedule)}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Link Person
                        </button>
                        <button
                          onClick={() => openLinkRoomModal(schedule)}
                          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                          Link Room
                        </button>
                      </div>
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
            {/* Cleanup orphaned imported data */}
            <div className="mt-8 border-t pt-6">
              <h4 className="text-md font-semibold text-gray-900 mb-2">Cleanup Orphaned Imported Data (by term)</h4>
              <p className="text-sm text-gray-600 mb-3">Remove imported schedules, people, and rooms that are only used in a selected term and not referenced elsewhere.</p>
              <button
                onClick={() => setShowCleanupModal(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Open Cleanup Tool
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge confirmation removed */}

      {/* Professional Review Modals */}
      <MissingDataReviewModal
        isOpen={showMissingDataModal}
        onClose={() => setShowMissingDataModal(false)}
        missingDataType={missingDataType}
        onDataUpdated={handleDataUpdated}
      />

      {/* Deduplication modal removed */}

      {/* standardization preview removed */}

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

      {/* Link Room Modal */}
      <LinkRoomModal
        isOpen={showLinkRoomModal}
        onClose={() => {
          setShowLinkRoomModal(false);
          setScheduleToLinkRoom(null);
        }}
        onConfirm={handleLinkRoom}
        schedule={scheduleToLinkRoom}
      />

      {/* Orphaned Data Cleanup Modal */}
      <OrphanedDataCleanupModal
        isOpen={showCleanupModal}
        onClose={() => setShowCleanupModal(false)}
        showNotification={showNotification}
      />

      {/* Cleanup Preview Modal */}
      {cleanupPreviewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Preview: Clean Up Section/CRN</h3>
              <button onClick={() => setCleanupPreviewOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {cleanupPreviewItems.length === 0 ? (
                <div className="text-center text-gray-600">No changes needed</div>
              ) : (
                <div className="space-y-2">
                  {cleanupPreviewItems.slice(0, 200).map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm border rounded p-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.courseCode} • {item.term}</div>
                        <div className="text-gray-600">Section: {item.before.section || '—'} → <span className="font-medium">{item.after.section || '—'}</span></div>
                        <div className="text-gray-600">CRN: {item.before.crn || '—'} → <span className="font-medium">{item.after.crn || '—'}</span></div>
                      </div>
                      <div className="ml-4 text-gray-400">{item.id}</div>
                    </div>
                  ))}
                  {cleanupPreviewItems.length > 200 && (
                    <div className="text-center text-gray-500">Showing 200 of {cleanupPreviewItems.length}</div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-6 border-t bg-gray-50">
              <div className="text-sm text-gray-600">{cleanupPreviewItems.length} schedules will be updated</div>
              <div className="flex space-x-3">
                <button onClick={() => setCleanupPreviewOpen(false)} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button
                  onClick={async () => {
                    try {
                      if (cleanupPreviewItems.length === 0) { setCleanupPreviewOpen(false); return; }
                      const batch = fbWriteBatch(db);
                      cleanupPreviewItems.forEach((item) => {
                        batch.update(fbDoc(db, 'schedules', item.id), {
                          section: item.after.section,
                          crn: item.after.crn,
                          updatedAt: new Date().toISOString()
                        });
                      });
                      await batch.commit();
                      await logBulkUpdate('Normalize section/CRN', 'schedules', cleanupPreviewItems.length, 'DataHygieneManager.jsx - normalizeSectionCrn');
                      setCleanupPreviewOpen(false);
                      showNotification('success', 'Sections/CRN Normalized', `Updated ${cleanupPreviewItems.length} schedules`);
                      await loadHealthReport();
                    } catch (e) {
                      console.error('Apply cleanup error:', e);
                      showNotification('error', 'Cleanup Failed', e.message || 'Could not apply cleanup');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={cleanupPreviewItems.length === 0}
                >
                  Apply Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Controls */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={goBack}
          disabled={wizardStep === steps[0]}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={goNext}
          disabled={wizardStep === steps[steps.length - 1]}
          className="px-4 py-2 bg-baylor-green text-white rounded-lg disabled:opacity-50"
        >
          Next
        </button>
      </div>
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
                  duplicate.confidence >= 0.98
                    ? 'bg-green-100 text-green-800'
                    : duplicate.confidence >= 0.9
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

const RelationshipIssues = ({ issues, onLinkPerson, onLinkRoom, onStandardizeInstructorName }) => {
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
              <div className="flex items-center gap-2">
                {issue.type === 'orphaned_schedule' && (
                  <button
                    onClick={() => onLinkPerson(issue.record)}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                  >
                    Link Person
                  </button>
                )}
                {issue.type === 'orphaned_room' && (
                  <button
                    onClick={() => onLinkRoom(issue.record)}
                    className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs"
                  >
                    Link Room
                  </button>
                )}
                {issue.type === 'inconsistent_instructor_name' && issue.record?.instructorId && (
                  <button
                    onClick={() => onStandardizeInstructorName(issue.record.instructorId)}
                    className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 text-xs"
                  >
                    Standardize Names
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Recommendations = ({ recommendations }) => {
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
      
    </div>
  );
};

export default DataHygieneManager; 
