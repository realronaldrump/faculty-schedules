import React, { useState, useEffect, useCallback } from "react";
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
  Edit,
  Zap,
  ArrowRight,
  Check,
  GitMerge,
} from "lucide-react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  getDataHealthReport,
  findOrphanedSchedules,
  backfillInstructorIdsFromNames,
  previewOfficeRoomBackfill,
  applyOfficeRoomBackfillPlan,
  mergePeople,
  mergeScheduleRecords,
  mergeRoomRecords,
  linkScheduleToPerson,
  generateDataHygieneReport,
  standardizeAllData,
  previewStandardizationPlan,
  markNotDuplicate,
  previewLocationMigration,
  applyLocationMigration,
  getLocationHealthStats,
} from "../../utils/dataHygiene";
import { normalizeSpaceRecord } from "../../utils/spaceUtils";
import {
  collection as fbCollection,
  getDocs as fbGetDocs,
  writeBatch as fbWriteBatch,
  doc as fbDoc,
} from "firebase/firestore";
import { logBulkUpdate } from "../../utils/changeLogger";
import { fetchPeople } from "../../utils/dataAdapter";
import MissingDataReviewModal from "./MissingDataReviewModal";
// DeduplicationReviewModal removed from wizard-first UI
import { ConfirmationDialog } from "../CustomAlert";
import OrphanedDataCleanupModal from "./OrphanedDataCleanupModal";
import { logUpdate } from "../../utils/changeLogger";
import { useUI } from "../../contexts/UIContext";
import OfficeRoomBackfillPreviewModal from "./OfficeRoomBackfillPreviewModal";
import { useAuth } from "../../contexts/AuthContext.jsx";

// Link Person Modal Component
const LinkPersonModal = ({ isOpen, onClose, onConfirm, schedule }) => {
  const [people, setPeople] = useState([]);
  const [filteredPeople, setFilteredPeople] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load people data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPeople();
      setSearchTerm("");
      setSelectedPerson(null);
    }
  }, [isOpen]);

  // Filter people based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPeople(people);
    } else {
      const search = searchTerm.toLowerCase();
      const filtered = people.filter((person) => {
        const fullName =
          `${person.firstName || ""} ${person.lastName || ""}`.toLowerCase();
        const email = (person.email || "").toLowerCase();
        const jobTitle = (person.jobTitle || "").toLowerCase();

        return (
          fullName.includes(search) ||
          email.includes(search) ||
          jobTitle.includes(search)
        );
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
        const nameA = `${a.firstName || ""} ${a.lastName || ""}`.trim();
        const nameB = `${b.firstName || ""} ${b.lastName || ""}`.trim();
        return nameA.localeCompare(nameB);
      });
      setPeople(sortedPeople);
      setFilteredPeople(sortedPeople);
    } catch (error) {
      console.error("Error loading people:", error);
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
      return roles.length > 0 ? roles.join(", ") : "No role";
    }
    return (
      Object.keys(roles)
        .filter((key) => roles[key])
        .join(", ") || "No role"
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Link Schedule to Person
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Select a person to link to:{" "}
              <span className="font-medium">
                {schedule?.courseCode} - {schedule?.courseTitle}
              </span>
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
              {searchTerm
                ? "No people found matching your search"
                : "No people available"}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredPeople.map((person) => (
                <div
                  key={person.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedPerson?.id === person.id
                      ? "bg-blue-50 border-l-4 border-blue-500"
                      : ""
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
                          <p className="text-sm text-gray-600">
                            {person.jobTitle}
                          </p>
                        )}
                        {person.email && (
                          <p className="text-sm text-gray-500">
                            {person.email}
                          </p>
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
              <span>
                Selected:{" "}
                <strong>
                  {selectedPerson.firstName} {selectedPerson.lastName}
                </strong>
              </span>
            ) : (
              "Please select a person to link"
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadRooms();
      setSearchTerm("");
      setSelectedRoom(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredRooms(rooms);
    } else {
      const search = searchTerm.toLowerCase();
      const filtered = rooms.filter((room) => {
        const name = (room.displayName || room.name || "").toLowerCase();
        const building = (room.building || "").toLowerCase();
        const roomNumber = (room.roomNumber || "").toString().toLowerCase();
        return (
          name.includes(search) ||
          building.includes(search) ||
          roomNumber.includes(search)
        );
      });
      setFilteredRooms(filtered);
    }
  }, [searchTerm, rooms]);

  const loadRooms = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, "rooms"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const sorted = data.sort((a, b) => {
        const aName = `${a.displayName || a.name || ""}`.trim();
        const bName = `${b.displayName || b.name || ""}`.trim();
        return aName.localeCompare(bName);
      });
      setRooms(sorted);
      setFilteredRooms(sorted);
    } catch (e) {
      console.error("Error loading rooms:", e);
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
            <h3 className="text-lg font-semibold text-gray-900">
              Link Schedule to Room
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Select a room for:{" "}
              <span className="font-medium">
                {schedule?.courseCode} - {schedule?.courseTitle}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
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
              {searchTerm
                ? "No rooms found matching your search"
                : "No rooms available"}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedRoom?.id === room.id
                      ? "bg-blue-50 border-l-4 border-blue-500"
                      : ""
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
                        {room.building}
                        {room.roomNumber ? ` ${room.roomNumber}` : ""}
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
              <span>
                Selected:{" "}
                <strong>{selectedRoom.displayName || selectedRoom.name}</strong>
              </span>
            ) : (
              "Please select a room"
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
              disabled={!selectedRoom}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Link Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Standardization preview removed

// Field Diff Component - shows side-by-side comparison with highlighting
const FieldDiff = ({ label, value1, value2, icon: Icon }) => {
  const v1 = value1 ?? "";
  const v2 = value2 ?? "";
  const isDifferent = String(v1).trim() !== String(v2).trim();
  const v1Empty = !v1 || String(v1).trim() === "";
  const v2Empty = !v2 || String(v2).trim() === "";

  return (
    <div
      className={`grid grid-cols-[120px_1fr_1fr] gap-2 py-1.5 px-2 rounded ${isDifferent ? "bg-amber-50" : ""}`}
    >
      <div className="flex items-center text-xs text-gray-500 font-medium">
        {Icon && <Icon className="w-3 h-3 mr-1" />}
        {label}
      </div>
      <div
        className={`text-sm truncate ${v1Empty ? "text-gray-400 italic" : isDifferent ? "font-medium text-blue-700" : "text-gray-700"}`}
      >
        {v1Empty ? "Empty" : v1}
      </div>
      <div
        className={`text-sm truncate ${v2Empty ? "text-gray-400 italic" : isDifferent ? "font-medium text-purple-700" : "text-gray-700"}`}
      >
        {v2Empty ? "Empty" : v2}
      </div>
    </div>
  );
};

// Enhanced Duplicate Card with side-by-side field comparison
const DuplicateComparisonCard = ({
  duplicate,
  onMerge,
  onIgnore,
  isSelected,
  onToggleSelection,
  recordType = "people",
}) => {
  const { records, confidence, reason, type } = duplicate;
  const [primary, secondary] = records || [];

  const getConfidenceColor = (conf) => {
    if (conf >= 0.98) return "bg-green-100 text-green-800 border-green-200";
    if (conf >= 0.9) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-orange-100 text-orange-800 border-orange-200";
  };

  const getConfidenceLabel = (conf) => {
    if (conf >= 0.98) return "High Confidence";
    if (conf >= 0.9) return "Medium Confidence";
    return "Review Needed";
  };

  const getFieldsForType = () => {
    switch (recordType) {
      case "people":
        return [
          { key: "firstName", label: "First Name", icon: User },
          { key: "lastName", label: "Last Name", icon: User },
          { key: "email", label: "Email", icon: Mail },
          { key: "phone", label: "Phone", icon: Phone },
          { key: "jobTitle", label: "Job Title" },
          { key: "office", label: "Office", icon: Building },
          { key: "baylorId", label: "Baylor ID" },
        ];
      case "schedules":
        return [
          { key: "courseCode", label: "Course" },
          { key: "section", label: "Section" },
          { key: "term", label: "Semester" },
          { key: "crn", label: "CRN" },
          { key: "courseTitle", label: "Title" },
          { key: "instructorId", label: "Instructor ID" },
          { key: "instructorName", label: "Instructor Name" },
          { key: "roomName", label: "Room" },
        ];
      case "rooms":
        return [
          { key: "displayName", label: "Name", fallback: "name" },
          { key: "building", label: "Building", icon: Building },
          { key: "roomNumber", label: "Room #" },
          { key: "type", label: "Type" },
          { key: "capacity", label: "Capacity" },
        ];
      default:
        return [];
    }
  };

  const getValue = (record, field) => {
    if (!record) return "";
    let value = record[field.key];
    if (
      (value === undefined || value === null || value === "") &&
      field.fallback
    ) {
      value = record[field.fallback];
    }
    if (Array.isArray(value)) return value.join(", ");
    return value;
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-all ${isSelected ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-300"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
        <div className="flex items-center gap-3">
          {onToggleSelection && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelection(duplicate)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          )}
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="font-medium text-gray-900">{reason}</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getConfidenceColor(confidence)}`}
          >
            {getConfidenceLabel(confidence)} ({Math.round(confidence * 100)}%)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onIgnore && (
            <button
              onClick={() => onIgnore(duplicate)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
              Not Duplicate
            </button>
          )}
          <button
            onClick={() => onMerge(duplicate)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <GitMerge className="w-4 h-4" />
            Merge
          </button>
        </div>
      </div>

      {/* Field Comparison Grid */}
      <div className="p-4">
        {/* Column Headers */}
        <div className="grid grid-cols-[120px_1fr_1fr] gap-2 mb-2 pb-2 border-b">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Field
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-blue-600 uppercase tracking-wider">
            <Check className="w-3 h-3" /> Keep (Primary)
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-purple-600 uppercase tracking-wider">
            <X className="w-3 h-3" /> Merge From (Secondary)
          </div>
        </div>

        {/* Field Rows */}
        <div className="space-y-0.5">
          {getFieldsForType().map((field) => (
            <FieldDiff
              key={field.key}
              label={field.label}
              value1={getValue(primary, field)}
              value2={getValue(secondary, field)}
              icon={field.icon}
            />
          ))}
        </div>

        {/* IDs for reference */}
        <div className="mt-3 pt-3 border-t text-xs text-gray-400 flex justify-between">
          <span>ID: {primary?.id?.substring(0, 12)}...</span>
          <span>ID: {secondary?.id?.substring(0, 12)}...</span>
        </div>
      </div>
    </div>
  );
};

// Batch Merge Progress Modal
const BatchMergeProgressModal = ({ isOpen, onClose, progress, results }) => {
  if (!isOpen) return null;

  const isComplete = progress.current >= progress.total;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="text-center mb-4">
          {isComplete ? (
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
          ) : (
            <RefreshCw className="w-12 h-12 text-blue-500 mx-auto mb-2 animate-spin" />
          )}
          <h3 className="text-lg font-semibold text-gray-900">
            {isComplete ? "Merge Complete!" : "Merging Duplicates..."}
          </h3>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>

        {/* Results Summary */}
        {isComplete && results && (
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Successfully merged:</span>
              <span className="font-medium text-green-600">
                {results.success}
              </span>
            </div>
            {results.failed > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Failed:</span>
                <span className="font-medium text-red-600">
                  {results.failed}
                </span>
              </div>
            )}
            {results.errors && results.errors.length > 0 && (
              <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700 max-h-32 overflow-y-auto">
                {results.errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {isComplete && (
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
};

const DataHygieneManager = () => {
  const { showNotification } = useUI();
  const [healthReport, setHealthReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [duplicateSchedules, setDuplicateSchedules] = useState([]);
  const [duplicateRooms, setDuplicateRooms] = useState([]);
  const [ignoredPairs, setIgnoredPairs] = useState({
    people: 0,
    schedules: 0,
    rooms: 0,
  });
  const [relationshipIssues, setRelationshipIssues] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [orphanedSchedules, setOrphanedSchedules] = useState([]);
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [officeRoomBackfillPlan, setOfficeRoomBackfillPlan] = useState(null);
  const [showOfficeRoomBackfillModal, setShowOfficeRoomBackfillModal] =
    useState(false);
  const [
    officeRoomBackfillPreviewLoading,
    setOfficeRoomBackfillPreviewLoading,
  ] = useState(false);
  const [officeRoomBackfillApplying, setOfficeRoomBackfillApplying] =
    useState(false);

  // Professional modal states
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);
  const [missingDataType, setMissingDataType] = useState("email");
  // removed: legacy deduplication modal state

  // Link person modal states
  const [showLinkPersonModal, setShowLinkPersonModal] = useState(false);
  const [scheduleToLink, setScheduleToLink] = useState(null);
  const [showLinkRoomModal, setShowLinkRoomModal] = useState(false);
  const [scheduleToLinkRoom, setScheduleToLinkRoom] = useState(null);

  // Standardization states
  const [standardizationPreview, setStandardizationPreview] = useState(null);
  const [standardizationLoading, setStandardizationLoading] = useState(false);
  const [standardizationApplying, setStandardizationApplying] = useState(false);
  const [standardizationResult, setStandardizationResult] = useState(null);
  const [showStandardizationConfirm, setShowStandardizationConfirm] =
    useState(false);
  const [mergePeopleConfirm, setMergePeopleConfirm] = useState({
    isOpen: false,
    primaryId: null,
    duplicateId: null,
  });
  const [mergePeopleLoading, setMergePeopleLoading] = useState(false);
  const [notDuplicateDialog, setNotDuplicateDialog] = useState({
    isOpen: false,
    entityType: "",
    duplicate: null,
  });
  const [notDuplicateReason, setNotDuplicateReason] = useState("");
  const [notDuplicateSaving, setNotDuplicateSaving] = useState(false);

  // Wizard state
  const steps = [
    "analyze",
    "standardize",
    "locations",
    "duplicates",
    "links",
    "missing",
    "finish",
  ];
  const [wizardStep, setWizardStep] = useState("analyze");
  // advanced tabs removed
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  // Section/CRN cleanup preview state
  const [cleanupPreviewOpen, setCleanupPreviewOpen] = useState(false);
  const [cleanupPreviewItems, setCleanupPreviewItems] = useState([]);
  const [cleanupPreviewLoading, setCleanupPreviewLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();

  // Location migration state
  const [locationPreview, setLocationPreview] = useState(null);
  const [locationPreviewLoading, setLocationPreviewLoading] = useState(false);
  const [locationMigrationApplying, setLocationMigrationApplying] = useState(false);
  const [locationMigrationResult, setLocationMigrationResult] = useState(null);
  const [showLocationMigrationConfirm, setShowLocationMigrationConfirm] = useState(false);

  // Batch merge state
  const [selectedDuplicates, setSelectedDuplicates] = useState([]);
  const [batchMergeProgress, setBatchMergeProgress] = useState({
    current: 0,
    total: 0,
  });
  const [batchMergeResults, setBatchMergeResults] = useState(null);
  const [showBatchMergeModal, setShowBatchMergeModal] = useState(false);

  // Load health report
  const loadHealthReport = async () => {
    setIsLoading(true);
    try {
      const [basicReport, comprehensiveReport] = await Promise.all([
        getDataHealthReport(),
        generateDataHygieneReport(),
      ]);
      setHealthReport(basicReport);
      setDuplicates(basicReport.duplicates);
      setOrphanedSchedules(basicReport.orphaned);

      // Comprehensive details
      setDuplicateSchedules(comprehensiveReport.details.schedules.duplicates);
      setDuplicateRooms(comprehensiveReport.details.rooms.duplicates);
      setRelationshipIssues(comprehensiveReport.details.crossCollection);
      setRecommendations(comprehensiveReport.recommendations);
      setIgnoredPairs({
        people: comprehensiveReport.details.people.ignoredPairs || 0,
        schedules: comprehensiveReport.details.schedules.ignoredPairs || 0,
        rooms: comprehensiveReport.details.rooms.ignoredPairs || 0,
      });

      console.log("✅ Data health reports loaded:", {
        basicReport,
        comprehensiveReport,
      });
    } catch (error) {
      console.error("❌ Error loading health report:", error);
      showNotification(
        "error",
        "Analysis Error",
        `Error loading data health report: ${error.message}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-load once auth state is ready
  useEffect(() => {
    if (authLoading || !user) return;
    loadHealthReport();
  }, [authLoading, user]);

  useEffect(() => {
    if (
      wizardStep === "standardize" &&
      !standardizationPreview &&
      !standardizationLoading
    ) {
      loadStandardizationPreview();
    }
  }, [wizardStep, standardizationPreview, standardizationLoading]);

  // Toggle duplicate selection for batch merge
  const toggleDuplicateSelection = useCallback((duplicate) => {
    setSelectedDuplicates((prev) => {
      const exists = prev.some(
        (d) =>
          d.records[0].id === duplicate.records[0].id &&
          d.records[1].id === duplicate.records[1].id,
      );
      if (exists) {
        return prev.filter(
          (d) =>
            !(
              d.records[0].id === duplicate.records[0].id &&
              d.records[1].id === duplicate.records[1].id
            ),
        );
      }
      return [...prev, duplicate];
    });
  }, []);

  // Select all high-confidence duplicates
  const selectHighConfidenceDuplicates = useCallback(
    (type) => {
      let allDuplicates = [];
      if (type === "people") allDuplicates = duplicates;
      else if (type === "schedules") allDuplicates = duplicateSchedules;
      else if (type === "rooms") allDuplicates = duplicateRooms;

      const highConfidence = allDuplicates.filter((d) => d.confidence >= 0.98);
      setSelectedDuplicates(highConfidence);
    },
    [duplicates, duplicateSchedules, duplicateRooms],
  );

  // Batch merge selected duplicates
  const handleBatchMerge = async (type) => {
    if (selectedDuplicates.length === 0) return;

    setShowBatchMergeModal(true);
    setBatchMergeProgress({ current: 0, total: selectedDuplicates.length });
    setBatchMergeResults(null);

    const results = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < selectedDuplicates.length; i++) {
      const dup = selectedDuplicates[i];
      try {
        if (type === "people") {
          await mergePeople(dup.records[0].id, dup.records[1].id);
        } else if (type === "schedules") {
          await mergeScheduleRecords(dup);
        } else if (type === "rooms") {
          await mergeRoomRecords(dup);
        }
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to merge: ${error.message}`);
      }
      setBatchMergeProgress({
        current: i + 1,
        total: selectedDuplicates.length,
      });
    }

    setBatchMergeResults(results);
    setSelectedDuplicates([]);
    await loadHealthReport();
  };

  const closeBatchMergeModal = () => {
    setShowBatchMergeModal(false);
    setBatchMergeProgress({ current: 0, total: 0 });
    setBatchMergeResults(null);
  };

  // Merge duplicate people
  const handleMergePeople = (primaryId, duplicateId) => {
    setMergePeopleConfirm({
      isOpen: true,
      primaryId,
      duplicateId,
    });
  };

  const handleConfirmMergePeople = async () => {
    if (
      mergePeopleLoading ||
      !mergePeopleConfirm.primaryId ||
      !mergePeopleConfirm.duplicateId
    ) {
      return;
    }
    setMergePeopleLoading(true);
    try {
      await mergePeople(
        mergePeopleConfirm.primaryId,
        mergePeopleConfirm.duplicateId,
      );
      showNotification(
        "success",
        "Merge Complete",
        "Records merged successfully",
      );
      loadHealthReport(); // Refresh
      setMergePeopleConfirm({
        isOpen: false,
        primaryId: null,
        duplicateId: null,
      });
    } catch (error) {
      console.error("Error merging records:", error);
      showNotification(
        "error",
        "Merge Failed",
        `Error merging records: ${error.message}`,
      );
    } finally {
      setMergePeopleLoading(false);
    }
  };

  const handleCancelMergePeople = () => {
    if (mergePeopleLoading) return;
    setMergePeopleConfirm({
      isOpen: false,
      primaryId: null,
      duplicateId: null,
    });
  };

  // Merge duplicate schedules
  const handleMergeSchedules = async (duplicateGroup) => {
    try {
      await mergeScheduleRecords(duplicateGroup);
      showNotification(
        "success",
        "Schedules Merged",
        "Duplicate schedules merged successfully",
      );
      await loadHealthReport();
    } catch (e) {
      console.error("Error merging schedules:", e);
      showNotification(
        "error",
        "Merge Failed",
        e.message || "Could not merge schedules",
      );
    }
  };

  // Merge duplicate rooms
  const handleMergeRooms = async (duplicateGroup) => {
    try {
      await mergeRoomRecords(duplicateGroup);
      showNotification(
        "success",
        "Rooms Merged",
        "Duplicate rooms merged successfully",
      );
      await loadHealthReport();
    } catch (e) {
      console.error("Error merging rooms:", e);
      showNotification(
        "error",
        "Merge Failed",
        e.message || "Could not merge rooms",
      );
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
        "success",
        "Schedule Linked",
        `Successfully linked ${scheduleToLink.courseCode} to selected person.`,
      );
      setShowLinkPersonModal(false);
      setScheduleToLink(null);
      loadHealthReport(); // Refresh
    } catch (error) {
      console.error("Error linking schedule:", error);
      showNotification(
        "error",
        "Link Failed",
        "Failed to link schedule to person. Please try again.",
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
      const scheduleRef = doc(db, "schedules", scheduleToLinkRoom.id);
      const normalizedRoom = normalizeSpaceRecord(roomObj || {}, roomId);
      const displayName = normalizedRoom.displayName || roomObj?.displayName || roomObj?.name || "";
      const spaceKey = normalizedRoom.spaceKey || "";
      await updateDoc(scheduleRef, {
        roomId: roomId,
        roomIds: [roomId],
        roomName: displayName,
        roomNames: [displayName],
        ...(spaceKey ? {
          spaceIds: [spaceKey],
          spaceDisplayNames: [displayName]
        } : {}),
        updatedAt: new Date().toISOString(),
      });

      await logUpdate(
        `Schedule Room Link - ${scheduleToLinkRoom.courseCode} ${scheduleToLinkRoom.section}`,
        "schedules",
        scheduleToLinkRoom.id,
        {
          roomId,
          roomIds: [roomId],
          roomName: displayName,
          roomNames: [displayName],
          ...(spaceKey ? {
            spaceIds: [spaceKey],
            spaceDisplayNames: [displayName]
          } : {})
        },
        scheduleToLinkRoom,
        "DataHygieneManager.jsx - handleLinkRoom",
      );

      showNotification("success", "Room Linked", "Room linked to schedule");
      setShowLinkRoomModal(false);
      setScheduleToLinkRoom(null);
      loadHealthReport();
    } catch (error) {
      console.error("Error linking room:", error);
      showNotification(
        "error",
        "Link Failed",
        "Failed to link room to schedule.",
      );
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

  const loadStandardizationPreview = async () => {
    setStandardizationLoading(true);
    try {
      const preview = await previewStandardizationPlan();
      setStandardizationPreview(preview);
      setStandardizationResult(null);
    } catch (error) {
      console.error("Error loading standardization preview:", error);
      showNotification(
        "error",
        "Preview Failed",
        error.message || "Unable to generate standardization preview.",
      );
    } finally {
      setStandardizationLoading(false);
    }
  };

  const handleApplyStandardization = async () => {
    setStandardizationApplying(true);
    try {
      const result = await standardizeAllData();
      setStandardizationResult(result);
      showNotification(
        "success",
        "Standardization Complete",
        `Updated ${result.updatedRecords} records.`,
      );
      await loadHealthReport();
    } catch (error) {
      console.error("Error applying standardization:", error);
      showNotification(
        "error",
        "Standardization Failed",
        error.message || "Unable to apply standardization changes.",
      );
    } finally {
      setStandardizationApplying(false);
    }
  };

  const getDuplicateKey = (duplicate) => {
    const [primary, secondary] = duplicate.records || [];
    if (!primary?.id || !secondary?.id) return "";
    return [primary.id, secondary.id].sort().join("__");
  };

  const handleMarkNotDuplicate = (entityType, duplicate) => {
    setNotDuplicateReason("");
    setNotDuplicateDialog({ isOpen: true, entityType, duplicate });
  };

  const handleConfirmNotDuplicate = async () => {
    if (notDuplicateSaving) return;
    const { entityType, duplicate } = notDuplicateDialog;
    const [primary, secondary] = duplicate?.records || [];
    if (!primary?.id || !secondary?.id) {
      setNotDuplicateDialog({ isOpen: false, entityType: "", duplicate: null });
      setNotDuplicateReason("");
      return;
    }
    setNotDuplicateSaving(true);
    try {
      await markNotDuplicate({
        entityType,
        idA: primary.id,
        idB: secondary.id,
        reason: notDuplicateReason.trim(),
      });
      setSelectedDuplicates((prev) =>
        prev.filter(
          (item) => getDuplicateKey(item) !== getDuplicateKey(duplicate),
        ),
      );
      if (entityType === "people") {
        setDuplicates((prev) =>
          prev.filter(
            (item) => getDuplicateKey(item) !== getDuplicateKey(duplicate),
          ),
        );
      } else if (entityType === "schedules") {
        setDuplicateSchedules((prev) =>
          prev.filter(
            (item) => getDuplicateKey(item) !== getDuplicateKey(duplicate),
          ),
        );
      } else if (entityType === "rooms") {
        setDuplicateRooms((prev) =>
          prev.filter(
            (item) => getDuplicateKey(item) !== getDuplicateKey(duplicate),
          ),
        );
      }
      showNotification(
        "success",
        "Marked as Not Duplicate",
        "We won't flag this pair again.",
      );
      await loadHealthReport();
      setNotDuplicateDialog({ isOpen: false, entityType: "", duplicate: null });
      setNotDuplicateReason("");
    } catch (error) {
      console.error("Error marking not duplicate:", error);
      showNotification(
        "error",
        "Update Failed",
        error.message || "Unable to save not-duplicate decision.",
      );
    } finally {
      setNotDuplicateSaving(false);
    }
  };

  const handleCancelNotDuplicate = () => {
    if (notDuplicateSaving) return;
    setNotDuplicateDialog({ isOpen: false, entityType: "", duplicate: null });
    setNotDuplicateReason("");
  };

  const handleAutoLinkInstructors = async () => {
    setIsAutoLinking(true);
    try {
      const result = await backfillInstructorIdsFromNames();
      showNotification(
        "success",
        "Auto-Link Complete",
        `Linked ${result.linked} schedules. Skipped ${result.skippedAmbiguous} ambiguous and ${result.skippedMissing} unmatched names.`,
      );
      await loadHealthReport();
    } catch (error) {
      console.error("Error auto-linking instructors:", error);
      showNotification(
        "error",
        "Auto-Link Failed",
        error.message || "Unable to auto-link instructors.",
      );
    } finally {
      setIsAutoLinking(false);
    }
  };

  const handleBackfillOfficeRooms = async () => {
    try {
      setOfficeRoomBackfillPreviewLoading(true);
      const plan = await previewOfficeRoomBackfill();
      setOfficeRoomBackfillPlan(plan);
      setShowOfficeRoomBackfillModal(true);
    } catch (error) {
      console.error("Error backfilling office rooms:", error);
      showNotification(
        "error",
        "Preview Failed",
        error.message || "Unable to preview office-room backfill.",
      );
    } finally {
      setOfficeRoomBackfillPreviewLoading(false);
    }
  };

  const handleApplyOfficeRoomBackfill = async (selectedIds) => {
    if (!officeRoomBackfillPlan) return;
    setOfficeRoomBackfillApplying(true);

    try {
      const result = await applyOfficeRoomBackfillPlan(
        officeRoomBackfillPlan,
        selectedIds,
      );
      showNotification(
        "success",
        "Office Rooms Backfilled",
        `Created ${result.roomsCreated} rooms · Updated ${result.roomsUpdated} rooms · Updated ${result.peopleUpdated} people`,
      );
      setShowOfficeRoomBackfillModal(false);
      setOfficeRoomBackfillPlan(null);
      await loadHealthReport();
    } catch (error) {
      console.error("Error applying office backfill plan:", error);
      showNotification(
        "error",
        "Backfill Failed",
        error.message || "Unable to apply office-room backfill.",
      );
    } finally {
      setOfficeRoomBackfillApplying(false);
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

  // Get health score color
  const getHealthScoreColor = (score) => {
    if (score >= 90) return "text-baylor-green";
    if (score >= 70) return "text-baylor-gold";
    return "text-red-600";
  };

  // Get health score description
  const getHealthScoreDescription = (score) => {
    if (score >= 90) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Fair";
    return "Needs Attention";
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
              analyze: "Analyze",
              standardize: "Standardize",
              duplicates: "Duplicates",
              links: "Links",
              missing: "Missing Data",
              finish: "Finish",
            };
            const active = wizardStep === s;
            return (
              <div key={s} className="flex items-center">
                <button
                  onClick={() => setWizardStep(s)}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  {labels[s]}
                </button>
                {i < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />
                )}
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
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh Analysis
          </button>

          {/* legacy header buttons removed to focus on wizard */}
        </div>
      </div>

      {/* Progress Indicator */}
      {/* merge progress removed */}

      {/* Health Score Card */}
      {wizardStep === "analyze" && healthReport && (
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif font-semibold text-baylor-green">
              Data Health Score
            </h2>
            <div className="flex items-center">
              <span
                className={`text-3xl font-bold ${getHealthScoreColor(healthReport?.summary?.healthScore || 0)}`}
              >
                {healthReport?.summary?.healthScore || 0}%
              </span>
              <span className="ml-2 text-gray-600">
                (
                {getHealthScoreDescription(
                  healthReport?.summary?.healthScore || 0,
                )}
                )
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {healthReport?.summary?.totalPeople || 0}
              </div>
              <div className="text-sm text-gray-600">People</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {healthReport?.summary?.totalSchedules || 0}
              </div>
              <div className="text-sm text-gray-600">Schedules</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {duplicates.length}
              </div>
              <div className="text-sm text-gray-600">Potential Duplicates</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {orphanedSchedules.length}
              </div>
              <div className="text-sm text-gray-600">Orphaned Schedules</div>
            </div>
          </div>
        </div>
      )}

      {/* Data Quality Actions */}
      {wizardStep === "analyze" && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Recommended Next Steps
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center mb-2">
                <RefreshCw className="w-5 h-5 text-baylor-green mr-2" />
                <h4 className="font-medium text-gray-900">Standardize & Validate</h4>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Normalize names, semester codes, and room labels so the app uses one consistent format.
              </p>
              <button
                onClick={() => setWizardStep("standardize")}
                className="w-full px-3 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200"
              >
                Preview Standardization
              </button>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center mb-2">
                <Users className="w-5 h-5 text-blue-600 mr-2" />
                <h4 className="font-medium text-gray-900">Review Duplicates</h4>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {duplicates.length + duplicateSchedules.length + duplicateRooms.length} potential duplicates found.
              </p>
              <button
                onClick={() => setWizardStep("duplicates")}
                className="w-full px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200"
              >
                Review Duplicates
              </button>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center mb-2">
                <Link className="w-5 h-5 text-red-600 mr-2" />
                <h4 className="font-medium text-gray-900">
                  Repair Links
                </h4>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Fix schedules without instructors or rooms and repair broken references.
              </p>
              <button
                onClick={() => setWizardStep("links")}
                className="w-full px-3 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200"
              >
                Fix Links
              </button>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center mb-2">
                <Edit className="w-5 h-5 text-purple-600 mr-2" />
                <h4 className="font-medium text-gray-900">
                  Complete Missing Data
                </h4>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Add missing email, phone, office, and job title information.
              </p>
              <button
                onClick={() => setWizardStep("missing")}
                className="w-full px-3 py-2 bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200"
              >
                Review Missing Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Missing Data Summary */}
      {wizardStep === "missing" && healthReport && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Missing Contact Information
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Click on any category below to review and manually add the missing
            information.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <button
              onClick={() => openMissingDataReview("email")}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
            >
              <div className="flex items-center">
                <Mail className="w-5 h-5 text-blue-600 mr-2" />
                <span className="text-gray-700">Missing Email</span>
              </div>
              <span className="font-medium text-red-600">
                {healthReport?.summary?.missingEmail || 0}
              </span>
            </button>
            <button
              onClick={() => openMissingDataReview("phone")}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
            >
              <div className="flex items-center">
                <Phone className="w-5 h-5 text-green-600 mr-2" />
                <span className="text-gray-700">Missing Phone</span>
              </div>
              <span className="font-medium text-red-600">
                {healthReport?.summary?.missingPhone || 0}
              </span>
            </button>
            <button
              onClick={() => openMissingDataReview("office")}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
            >
              <div className="flex items-center">
                <Building className="w-5 h-5 text-purple-600 mr-2" />
                <span className="text-gray-700">Missing Office</span>
              </div>
              <span className="font-medium text-red-600">
                {healthReport?.summary?.missingOffice || 0}
              </span>
            </button>
            <button
              onClick={() => openMissingDataReview("jobTitle")}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
            >
              <div className="flex items-center">
                <User className="w-5 h-5 text-orange-600 mr-2" />
                <span className="text-gray-700">Missing Job Title</span>
              </div>
              <span className="font-medium text-red-600">
                {healthReport?.summary?.missingJobTitle || 0}
              </span>
            </button>
            <button
              onClick={() => openMissingDataReview("program")}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-blue-200"
            >
              <div className="flex items-center">
                <BookUser className="w-5 h-5 text-indigo-600 mr-2" />
                <span className="text-gray-700">Missing Program</span>
              </div>
              <span className="font-medium text-red-600">
                {healthReport?.summary?.missingProgram || 0}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Standardize Step */}
      {wizardStep === "standardize" && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Standardize & Validate
              </h3>
              <p className="text-gray-600">
                Normalize names, semester codes, instructor assignments, and room
                labels so every record matches the canonical model.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={loadStandardizationPreview}
                disabled={standardizationLoading}
                className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50"
              >
                {standardizationLoading ? "Analyzing…" : "Generate Preview"}
              </button>
              <button
                onClick={() => setShowStandardizationConfirm(true)}
                disabled={standardizationApplying}
                className="px-3 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50"
              >
                {standardizationApplying ? "Applying…" : "Apply Standardization"}
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {standardizationResult && (
              <div className="p-4 rounded-lg border border-green-200 bg-green-50 text-green-800">
                Updated {standardizationResult.updatedRecords} records with the
                canonical format.
              </div>
            )}

            {standardizationPreview ? (
              <StandardizationPreview preview={standardizationPreview} />
            ) : (
              <div className="p-6 text-center text-gray-600 bg-gray-50 rounded-lg">
                Generate a preview to see examples of the changes before you
                apply them.
              </div>
            )}

            <div className="border-t pt-6">
              <h4 className="text-md font-semibold text-gray-900 mb-2">
                Section/CRN Cleanup
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                Remove embedded CRNs from section labels and capture them in the
                CRN field for consistent matching.
              </p>
              <button
                onClick={async () => {
                  setCleanupPreviewLoading(true);
                  try {
                    const snap = await fbGetDocs(fbCollection(db, "schedules"));
                    const preview = [];
                    for (const d of snap.docs) {
                      const s = d.data();
                      const rawSection = (s.section || "").toString();
                      const match = rawSection.match(/\((\d{5,6})\)/);
                      const parsedCrn = match ? match[1] : "";
                      const normalizedSection = (() => {
                        const cut = rawSection.split(" ")[0];
                        const idx = cut.indexOf("(");
                        return idx > -1
                          ? cut.substring(0, idx).trim()
                          : cut.trim();
                      })();
                      const newCrn =
                        s.crn && /^\d{5,6}$/.test(String(s.crn))
                          ? s.crn
                          : parsedCrn;
                      const shouldUpdate =
                        normalizedSection !== s.section ||
                        (!!newCrn && String(newCrn) !== String(s.crn || ""));
                      if (shouldUpdate) {
                        preview.push({
                          id: d.id,
                          courseCode: s.courseCode,
                          term: s.term,
                          before: { section: s.section || "", crn: s.crn || "" },
                          after: { section: normalizedSection, crn: newCrn || "" },
                        });
                      }
                    }
                    setCleanupPreviewItems(preview);
                    setCleanupPreviewOpen(true);
                  } catch (e) {
                    console.error("Preview error:", e);
                    showNotification(
                      "error",
                      "Preview Failed",
                      e.message || "Could not prepare preview",
                    );
                  }
                  setCleanupPreviewLoading(false);
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {cleanupPreviewLoading ? "Preparing…" : "Clean Up Section/CRN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Locations Step */}
      {wizardStep === "locations" && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Location Migration
              </h3>
              <p className="text-gray-600">
                Normalize room/space records, fix combined room strings, and backfill space IDs on schedules and people.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={async () => {
                  setLocationPreviewLoading(true);
                  try {
                    const preview = await previewLocationMigration();
                    setLocationPreview(preview);
                  } catch (e) {
                    showNotification?.("error", "Preview Failed", e.message);
                  } finally {
                    setLocationPreviewLoading(false);
                  }
                }}
                disabled={locationPreviewLoading}
                className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50"
              >
                {locationPreviewLoading ? "Analyzing…" : "Generate Preview"}
              </button>
              <button
                onClick={() => setShowLocationMigrationConfirm(true)}
                disabled={locationMigrationApplying || !locationPreview}
                className="px-3 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50"
              >
                {locationMigrationApplying ? "Applying…" : "Apply Migration"}
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {locationMigrationResult && (
              <div className="p-4 rounded-lg border border-green-200 bg-green-50 text-green-800">
                <p className="font-medium">Migration Complete</p>
                <ul className="mt-2 text-sm space-y-1">
                  <li>• Rooms split from combined strings: {locationMigrationResult.roomsSplit}</li>
                  <li>• Rooms updated with spaceKey: {locationMigrationResult.roomsUpdated}</li>
                  <li>• Rooms seeded from schedules/people: {locationMigrationResult.roomsSeeded}</li>
                  <li>• Schedules updated with spaceIds: {locationMigrationResult.schedulesUpdated}</li>
                  <li>• People updated with officeSpaceId: {locationMigrationResult.peopleUpdated}</li>
                </ul>
                {locationMigrationResult.errors?.length > 0 && (
                  <div className="mt-3 text-red-700">
                    <p className="font-medium">Errors:</p>
                    <ul className="text-sm">
                      {locationMigrationResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {locationMigrationResult.errors.length > 5 && (
                        <li>... and {locationMigrationResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {locationPreview ? (
              <div className="space-y-4">
                {/* Rooms Issues */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <MapPin size={16} />
                      Rooms ({locationPreview.rooms.total} total)
                    </h4>
                  </div>
                  <div className="p-4 space-y-3">
                    {locationPreview.rooms.multiRoom.length > 0 && (
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="font-medium text-yellow-800">
                          {locationPreview.rooms.multiRoom.length} combined multi-room records to split
                        </p>
                        <ul className="mt-2 text-sm text-yellow-700 space-y-1 max-h-40 overflow-y-auto">
                          {locationPreview.rooms.multiRoom.slice(0, 10).map((r, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="font-mono text-xs bg-yellow-100 px-1 rounded">{r.currentName}</span>
                              <ArrowRight size={14} className="mt-0.5 flex-shrink-0" />
                              <span>{r.parsedParts.join(", ")}</span>
                            </li>
                          ))}
                          {locationPreview.rooms.multiRoom.length > 10 && (
                            <li className="text-gray-500">... and {locationPreview.rooms.multiRoom.length - 10} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {locationPreview.rooms.missingSpaceKey.length > 0 && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="font-medium text-blue-800">
                          {locationPreview.rooms.missingSpaceKey.length} rooms missing spaceKey
                        </p>
                      </div>
                    )}
                    {(locationPreview.rooms.toSeedFromSchedules?.length > 0 || locationPreview.rooms.toSeedFromPeople?.length > 0) && (
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <p className="font-medium text-green-800">
                          {(locationPreview.rooms.toSeedFromSchedules?.length || 0) + (locationPreview.rooms.toSeedFromPeople?.length || 0)} new room records to create
                        </p>
                        <ul className="mt-2 text-sm text-green-700 space-y-1">
                          {locationPreview.rooms.toSeedFromSchedules?.length > 0 && (
                            <li>• {locationPreview.rooms.toSeedFromSchedules.length} from schedule classrooms</li>
                          )}
                          {locationPreview.rooms.toSeedFromPeople?.length > 0 && (
                            <li>• {locationPreview.rooms.toSeedFromPeople.length} from faculty/staff offices</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {locationPreview.rooms.multiRoom.length === 0 && 
                     locationPreview.rooms.missingSpaceKey.length === 0 && 
                     (locationPreview.rooms.toSeedFromSchedules?.length || 0) === 0 &&
                     (locationPreview.rooms.toSeedFromPeople?.length || 0) === 0 && (
                      <div className="text-green-700 flex items-center gap-2">
                        <CheckCircle size={16} />
                        All rooms have valid spaceKeys
                      </div>
                    )}
                  </div>
                </div>

                {/* Schedules Issues */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <Calendar size={16} />
                      Schedules ({locationPreview.schedules.total} total)
                    </h4>
                  </div>
                  <div className="p-4 space-y-3">
                    {locationPreview.schedules.missingSpaceIds.length > 0 && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="font-medium text-blue-800">
                          {locationPreview.schedules.missingSpaceIds.length} schedules need spaceIds backfill
                        </p>
                        <ul className="mt-2 text-sm text-blue-700 space-y-1 max-h-40 overflow-y-auto">
                          {locationPreview.schedules.missingSpaceIds.slice(0, 5).map((s, i) => (
                            <li key={i}>
                              {s.courseCode} - {s.room}
                            </li>
                          ))}
                          {locationPreview.schedules.missingSpaceIds.length > 5 && (
                            <li className="text-gray-500">... and {locationPreview.schedules.missingSpaceIds.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {locationPreview.schedules.hasVirtualLocation.length > 0 && (
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-gray-600">
                          {locationPreview.schedules.hasVirtualLocation.length} schedules have virtual/TBA locations (no action needed)
                        </p>
                      </div>
                    )}
                    {locationPreview.schedules.missingSpaceIds.length === 0 && (
                      <div className="text-green-700 flex items-center gap-2">
                        <CheckCircle size={16} />
                        All physical schedules have spaceIds
                      </div>
                    )}
                  </div>
                </div>

                {/* People Issues */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <Users size={16} />
                      People ({locationPreview.people.total} total)
                    </h4>
                  </div>
                  <div className="p-4 space-y-3">
                    {locationPreview.people.hasOfficeRoom.length > 0 && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="font-medium text-blue-800">
                          {locationPreview.people.hasOfficeRoom.length} people with officeRoomId need officeSpaceId
                        </p>
                      </div>
                    )}
                    {locationPreview.people.missingOfficeSpaceId.length > 0 && (
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="font-medium text-yellow-800">
                          {locationPreview.people.missingOfficeSpaceId.length} people with office string need officeSpaceId
                        </p>
                      </div>
                    )}
                    {locationPreview.people.hasOfficeRoom.length === 0 && locationPreview.people.missingOfficeSpaceId.length === 0 && (
                      <div className="text-green-700 flex items-center gap-2">
                        <CheckCircle size={16} />
                        All people with offices have officeSpaceId
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-gray-600 bg-gray-50 rounded-lg">
                Click "Generate Preview" to analyze your location data and see what needs to be migrated.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Location Migration Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showLocationMigrationConfirm}
        title="Apply Location Migration"
        message={`This will:\n• Split combined room records into individual spaces\n• Add spaceKey to rooms missing it\n• Backfill spaceIds on schedules\n• Backfill officeSpaceId on people\n\nThis operation cannot be undone. Continue?`}
        confirmLabel="Apply Migration"
        confirmVariant="primary"
        onConfirm={async () => {
          setShowLocationMigrationConfirm(false);
          setLocationMigrationApplying(true);
          try {
            const result = await applyLocationMigration({
              splitMultiRooms: true,
              backfillSpaceKeys: true,
              seedRoomsFromSchedules: true,
              seedRoomsFromPeople: true,
              backfillScheduleSpaceIds: true,
              backfillPeopleOfficeSpaceIds: true
            });
            setLocationMigrationResult(result);
            showNotification?.("success", "Migration Complete", `Created ${result.roomsSeeded} rooms, updated ${result.roomsSplit + result.roomsUpdated + result.schedulesUpdated + result.peopleUpdated} records.`);
            // Refresh preview
            const preview = await previewLocationMigration();
            setLocationPreview(preview);
          } catch (e) {
            showNotification?.("error", "Migration Failed", e.message);
          } finally {
            setLocationMigrationApplying(false);
          }
        }}
        onCancel={() => setShowLocationMigrationConfirm(false)}
      />

      {/* Duplicates Step */}
      {wizardStep === "duplicates" && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Review Duplicates
                </h3>
                <p className="text-gray-600">
                  Records that may represent the same entity - review and merge
                </p>
              </div>
              {/* Batch Action Buttons */}
              {duplicates.length +
                duplicateSchedules.length +
                duplicateRooms.length >
                0 && (
                  <div className="flex items-center gap-2">
                    {selectedDuplicates.length > 0 && (
                      <>
                        <span className="text-sm text-gray-600">
                          {selectedDuplicates.length} selected
                        </span>
                        <button
                          onClick={() =>
                            handleBatchMerge(
                              duplicates.some((d) =>
                                selectedDuplicates.includes(d),
                              )
                                ? "people"
                                : duplicateSchedules.some((d) =>
                                  selectedDuplicates.includes(d),
                                )
                                  ? "schedules"
                                  : "rooms",
                            )
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                        >
                          <Zap className="w-4 h-4" />
                          Merge Selected ({selectedDuplicates.length})
                        </button>
                      </>
                    )}
                  </div>
                )}
            </div>
          </div>
          <div className="p-6">
            {/* People duplicates */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  People Duplicates
                  <span className="text-sm font-normal text-gray-500">
                    ({duplicates.length} found)
                  </span>
                  {ignoredPairs.people > 0 && (
                    <span className="text-xs text-gray-400">
                      Ignored: {ignoredPairs.people}
                    </span>
                  )}
                </h4>
                {duplicates.length > 0 &&
                  duplicates.some((d) => d.confidence >= 0.98) && (
                    <button
                      onClick={() => selectHighConfidenceDuplicates("people")}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Select all high-confidence (
                      {duplicates.filter((d) => d.confidence >= 0.98).length})
                    </button>
                  )}
              </div>
              {duplicates.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h4 className="text-lg font-medium text-gray-900 mb-1">
                    No Duplicate People
                  </h4>
                  <p className="text-gray-600">All person records are unique</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {duplicates.map((duplicate, index) => (
                    <DuplicateComparisonCard
                      key={`people-${index}`}
                      duplicate={duplicate}
                      recordType="people"
                      isSelected={selectedDuplicates.some(
                        (d) =>
                          d.records[0].id === duplicate.records[0].id &&
                          d.records[1].id === duplicate.records[1].id,
                      )}
                      onToggleSelection={toggleDuplicateSelection}
                      onMerge={(dup) =>
                        handleMergePeople(dup.records[0].id, dup.records[1].id)
                      }
                      onIgnore={(dup) =>
                        handleMarkNotDuplicate("people", dup)
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Schedule duplicates */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-green-600" />
                  Schedule Duplicates
                  <span className="text-sm font-normal text-gray-500">
                    ({duplicateSchedules.length} found)
                  </span>
                  {ignoredPairs.schedules > 0 && (
                    <span className="text-xs text-gray-400">
                      Ignored: {ignoredPairs.schedules}
                    </span>
                  )}
                </h4>
                {duplicateSchedules.length > 0 &&
                  duplicateSchedules.some((d) => d.confidence >= 0.98) && (
                    <button
                      onClick={() =>
                        selectHighConfidenceDuplicates("schedules")
                      }
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Select all high-confidence (
                      {
                        duplicateSchedules.filter((d) => d.confidence >= 0.98)
                          .length
                      }
                      )
                    </button>
                  )}
              </div>
              {duplicateSchedules.length === 0 ? (
                <div className="text-center py-6 text-gray-600 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  No duplicate schedules found
                </div>
              ) : (
                <div className="space-y-4">
                  {duplicateSchedules.slice(0, 20).map((dup, idx) => (
                    <DuplicateComparisonCard
                      key={`schedule-${idx}`}
                      duplicate={dup}
                      recordType="schedules"
                      isSelected={selectedDuplicates.some(
                        (d) =>
                          d.records[0].id === dup.records[0].id &&
                          d.records[1].id === dup.records[1].id,
                      )}
                      onToggleSelection={toggleDuplicateSelection}
                      onMerge={handleMergeSchedules}
                      onIgnore={(dup) =>
                        handleMarkNotDuplicate("schedules", dup)
                      }
                    />
                  ))}
                  {duplicateSchedules.length > 20 && (
                    <div className="text-center text-gray-500 py-2">
                      Showing 20 of {duplicateSchedules.length} - merge some to
                      see more
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Room duplicates */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-purple-600" />
                  Room Duplicates
                  <span className="text-sm font-normal text-gray-500">
                    ({duplicateRooms.length} found)
                  </span>
                  {ignoredPairs.rooms > 0 && (
                    <span className="text-xs text-gray-400">
                      Ignored: {ignoredPairs.rooms}
                    </span>
                  )}
                </h4>
                {duplicateRooms.length > 0 &&
                  duplicateRooms.some((d) => d.confidence >= 0.98) && (
                    <button
                      onClick={() => selectHighConfidenceDuplicates("rooms")}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Select all high-confidence (
                      {
                        duplicateRooms.filter((d) => d.confidence >= 0.98)
                          .length
                      }
                      )
                    </button>
                  )}
              </div>
              {duplicateRooms.length === 0 ? (
                <div className="text-center py-6 text-gray-600 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  No duplicate rooms found
                </div>
              ) : (
                <div className="space-y-4">
                  {duplicateRooms.slice(0, 20).map((dup, idx) => (
                    <DuplicateComparisonCard
                      key={`room-${idx}`}
                      duplicate={dup}
                      recordType="rooms"
                      isSelected={selectedDuplicates.some(
                        (d) =>
                          d.records[0].id === dup.records[0].id &&
                          d.records[1].id === dup.records[1].id,
                      )}
                      onToggleSelection={toggleDuplicateSelection}
                      onMerge={handleMergeRooms}
                      onIgnore={(dup) =>
                        handleMarkNotDuplicate("rooms", dup)
                      }
                    />
                  ))}
                  {duplicateRooms.length > 20 && (
                    <div className="text-center text-gray-500 py-2">
                      Showing 20 of {duplicateRooms.length} - merge some to see
                      more
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Advanced duplicates sections removed */}

      {/* Links Step */}
      {wizardStep === "links" && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Unlinked Schedules
              </h3>
              <p className="text-gray-600">
                Schedules missing instructor links or pointing to missing people
              </p>
            </div>
            <div className="p-6">
              {orphanedSchedules.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">
                    All Schedules Linked
                  </h4>
                  <p className="text-gray-600">
                    Every schedule has a valid instructor.
                  </p>
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
                            Instructor:{" "}
                            {(schedule.instructorName || schedule.Instructor || "").trim() ||
                              "Unassigned"}
                          </p>
                          <p className="text-sm text-gray-600">
                            Semester: {schedule.term} | Section: {schedule.section}
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
                      Showing 10 of {orphanedSchedules.length} unlinked schedules
                    </p>
                  )}
                </div>
              )}
              {orphanedSchedules.length > 0 && (
                <div className="mt-6">
                  <button
                    onClick={handleAutoLinkInstructors}
                    disabled={isAutoLinking}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAutoLinking
                      ? "Auto-Linking..."
                      : "Auto-Link by Exact Name"}
                  </button>
                </div>
              )}
              <div className="mt-8 border-t pt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-2">
                  Cleanup Orphaned Imported Data (by semester)
                </h4>
                <p className="text-sm text-gray-600 mb-3">
                  Remove imported schedules, people, and rooms that are only used
                  in a selected semester and not referenced elsewhere.
                </p>
                <button
                  onClick={() => setShowCleanupModal(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Open Cleanup Tool
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Broken Space Links
              </h3>
              <p className="text-gray-600">
                Schedules referencing spaces that no longer exist
              </p>
            </div>
            <RelationshipIssues
              issues={relationshipIssues.filter(
                (issue) => issue.type !== "orphaned_schedule",
              )}
              onLinkPerson={openLinkPersonModal}
              onLinkRoom={openLinkRoomModal}
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Office Room Backfill
              </h3>
              <p className="text-gray-600">
                Create canonical room records for office locations and link
                people via officeSpaceId.
              </p>
            </div>
            <div className="p-6">
              <button
                onClick={handleBackfillOfficeRooms}
                disabled={
                  officeRoomBackfillPreviewLoading || officeRoomBackfillApplying
                }
                className="px-3 py-2 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {officeRoomBackfillPreviewLoading
                  ? "Preparing…"
                  : officeRoomBackfillApplying
                    ? "Applying…"
                    : "Backfill Office Rooms"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced relationship tab removed */}

      {/* Finish Step */}
      {wizardStep === "finish" && (
        <Recommendations recommendations={recommendations} />
      )}

      {/* Merge confirmation removed */}

      {/* Professional Review Modals */}
      <MissingDataReviewModal
        isOpen={showMissingDataModal}
        onClose={() => setShowMissingDataModal(false)}
        missingDataType={missingDataType}
        onDataUpdated={handleDataUpdated}
      />

      <ConfirmationDialog
        isOpen={showStandardizationConfirm}
        title="Apply Standardization?"
        message="This will normalize names, semester codes, instructor assignments, and room labels across people, schedules, and rooms."
        confirmText={standardizationApplying ? "Applying…" : "Apply Standardization"}
        cancelText="Cancel"
        onConfirm={() => {
          setShowStandardizationConfirm(false);
          handleApplyStandardization();
        }}
        onCancel={() => setShowStandardizationConfirm(false)}
        type="warning"
      />

      <ConfirmationDialog
        isOpen={mergePeopleConfirm.isOpen}
        title="Merge Duplicate People?"
        message="Merge these people records? This will permanently remove the duplicate record."
        confirmText={mergePeopleLoading ? "Merging..." : "Merge Records"}
        cancelText="Cancel"
        onConfirm={handleConfirmMergePeople}
        onCancel={handleCancelMergePeople}
        type="danger"
      />

      <ConfirmationDialog
        isOpen={notDuplicateDialog.isOpen}
        title="Mark as Not Duplicate?"
        message="We will stop flagging this pair. Add a note if helpful."
        confirmText={notDuplicateSaving ? "Saving..." : "Mark Not Duplicate"}
        cancelText="Cancel"
        onConfirm={handleConfirmNotDuplicate}
        onCancel={handleCancelNotDuplicate}
        type="info"
      >
        <div className="space-y-2">
          <label
            htmlFor="not-duplicate-reason"
            className="text-sm font-medium text-gray-700"
          >
            Reason (optional)
          </label>
          <textarea
            id="not-duplicate-reason"
            value={notDuplicateReason}
            onChange={(e) => setNotDuplicateReason(e.target.value)}
            disabled={notDuplicateSaving}
            rows={3}
            placeholder="Example: distinct departments or different employee IDs"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green disabled:opacity-60"
          />
          <p className="text-xs text-gray-500">
            This note is optional and only visible to admins reviewing data
            hygiene history.
          </p>
        </div>
      </ConfirmationDialog>

      {/* Deduplication modal removed */}

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

      <OfficeRoomBackfillPreviewModal
        isOpen={showOfficeRoomBackfillModal}
        plan={officeRoomBackfillPlan}
        onClose={() => {
          setShowOfficeRoomBackfillModal(false);
          setOfficeRoomBackfillPlan(null);
        }}
        onApply={handleApplyOfficeRoomBackfill}
        applying={officeRoomBackfillApplying}
      />

      {/* Batch Merge Progress Modal */}
      <BatchMergeProgressModal
        isOpen={showBatchMergeModal}
        onClose={closeBatchMergeModal}
        progress={batchMergeProgress}
        results={batchMergeResults}
      />

      {/* Cleanup Preview Modal */}
      {cleanupPreviewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Preview: Clean Up Section/CRN
              </h3>
              <button
                onClick={() => setCleanupPreviewOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto" style={{ maxHeight: "60vh" }}>
              {cleanupPreviewItems.length === 0 ? (
                <div className="text-center text-gray-600">
                  No changes needed
                </div>
              ) : (
                <div className="space-y-2">
                  {cleanupPreviewItems.slice(0, 200).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm border rounded p-2"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {item.courseCode} • {item.term}
                        </div>
                        <div className="text-gray-600">
                          Section: {item.before.section || "—"} →{" "}
                          <span className="font-medium">
                            {item.after.section || "—"}
                          </span>
                        </div>
                        <div className="text-gray-600">
                          CRN: {item.before.crn || "—"} →{" "}
                          <span className="font-medium">
                            {item.after.crn || "—"}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 text-gray-400">{item.id}</div>
                    </div>
                  ))}
                  {cleanupPreviewItems.length > 200 && (
                    <div className="text-center text-gray-500">
                      Showing 200 of {cleanupPreviewItems.length}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-6 border-t bg-gray-50">
              <div className="text-sm text-gray-600">
                {cleanupPreviewItems.length} schedules will be updated
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setCleanupPreviewOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      if (cleanupPreviewItems.length === 0) {
                        setCleanupPreviewOpen(false);
                        return;
                      }
                      const batch = fbWriteBatch(db);
                      cleanupPreviewItems.forEach((item) => {
                        batch.update(fbDoc(db, "schedules", item.id), {
                          section: item.after.section,
                          crn: item.after.crn,
                          updatedAt: new Date().toISOString(),
                        });
                      });
                      await batch.commit();
                      await logBulkUpdate(
                        "Normalize section/CRN",
                        "schedules",
                        cleanupPreviewItems.length,
                        "DataHygieneManager.jsx - normalizeSectionCrn",
                      );
                      setCleanupPreviewOpen(false);
                      showNotification(
                        "success",
                        "Sections/CRN Normalized",
                        `Updated ${cleanupPreviewItems.length} schedules`,
                      );
                      await loadHealthReport();
                    } catch (e) {
                      console.error("Apply cleanup error:", e);
                      showNotification(
                        "error",
                        "Cleanup Failed",
                        e.message || "Could not apply cleanup",
                      );
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

/* ===== Additional Components ===== */

const formatPreviewValue = (value) => {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value) || typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }
  return String(value);
};

const StandardizationPreview = ({ preview }) => {
  if (!preview) return null;

  const { counts = {}, changeCounts = {}, samples = {} } = preview;
  const sections = [
    { key: "people", label: "People" },
    { key: "schedules", label: "Schedules" },
    { key: "rooms", label: "Rooms" },
  ];
  const maxItems = 6;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map((section) => (
          <div
            key={section.key}
            className="p-4 rounded-lg border bg-gray-50"
          >
            <div className="text-sm text-gray-500">{section.label}</div>
            <div className="text-2xl font-semibold text-gray-900">
              {changeCounts[section.key] || 0}
            </div>
            <div className="text-xs text-gray-500">
              out of {counts[section.key] || 0} total
            </div>
          </div>
        ))}
      </div>

      {sections.map((section) => {
        const items = Array.isArray(samples[section.key])
          ? samples[section.key]
          : [];
        return (
          <div key={section.key} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">
                {section.label} examples
              </h4>
              <span className="text-xs text-gray-500">
                Showing {Math.min(items.length, maxItems)} of {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <div className="text-sm text-gray-600">
                No changes detected for {section.label.toLowerCase()}.
              </div>
            ) : (
              <div className="space-y-3">
                {items.slice(0, maxItems).map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-3 bg-white"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {item.label || item.id}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      {(item.diffs || []).map((diff) => (
                        <div key={diff.field} className="flex gap-2">
                          <span className="font-medium text-gray-500">
                            {diff.field}:
                          </span>
                          <span>
                            {formatPreviewValue(diff.before)} &rarr;{" "}
                            {formatPreviewValue(diff.after)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {items.length > maxItems && (
                  <div className="text-xs text-gray-400">
                    Showing first {maxItems} examples.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const RelationshipIssues = ({ issues, onLinkPerson, onLinkRoom }) => {
  if (issues.length === 0) {
    return (
      <div className="p-6 text-center">
        <Link className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Relationship Issues
        </h3>
        <p className="text-gray-600">
          All cross-collection relationships are intact!
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold mb-4">Relationship Issues</h3>
      <div className="space-y-4">
        {issues.map((issue, index) => (
          <div
            key={index}
            className="border border-red-200 rounded-lg p-4 bg-red-50"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-red-900 mb-1">
                  {issue.type.replace(/_/g, " ").toUpperCase()}
                </h4>
                <p className="text-red-700 text-sm mb-2">{issue.reason}</p>
                <p className="text-red-600 text-xs">
                  Severity: {issue.severity}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {issue.type === "orphaned_schedule" && (
                  <button
                    onClick={() => onLinkPerson(issue.record)}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                  >
                    Link Person
                  </button>
                )}
                {(issue.type === "orphaned_room" || issue.type === "orphaned_space") && (
                  <button
                    onClick={() => onLinkRoom(issue.record)}
                    className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs"
                  >
                    Link Space
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
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Your Data Looks Great!
        </h3>
        <p className="text-gray-600">No issues found that need attention.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold mb-2">What Should I Fix?</h3>
      <p className="text-gray-600 text-sm mb-6">
        Here's what we found and how to fix it:
      </p>
      <div className="space-y-4 mb-8">
        {recommendations.map((rec, index) => (
          <div key={index} className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-2">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${rec.priority === "high"
                      ? "bg-red-100 text-red-800"
                      : rec.priority === "medium"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                >
                  {rec.priority === "high"
                    ? "Important"
                    : rec.priority === "medium"
                      ? "Recommended"
                      : "Optional"}
                </span>
                <h4 className="font-medium text-gray-900">{rec.action}</h4>
              </div>
              <span className="text-sm font-medium text-gray-900 bg-white px-2 py-1 rounded">
                {rec.count} {rec.count === 1 ? "item" : "items"}
              </span>
            </div>
            <p className="text-gray-700 text-sm mb-2">{rec.description}</p>
            <p className="text-green-700 text-sm font-medium">
              ✓ {rec.benefit}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DataHygieneManager;
