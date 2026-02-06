import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Users,
  Calendar,
  MapPin,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
  GitMerge,
  Link,
  Mail,
  Phone,
  Building,
  User,
  Search,
  X,
  Check,
  Eye,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { collection, getDocs, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import {
  scanDataHealth,
  autoFixAllIssues,
  mergePeople,
  mergeScheduleRecords,
  mergeRoomRecords,
  linkScheduleToPerson,
  markNotDuplicate,
  standardizeAllData,
  previewScheduleIdentityBackfill,
  applyScheduleIdentityBackfill,
  backfillInstructorIdsFromNames,
  repairScheduleSpaceLinks,
  previewScheduleSpaceLinks,
} from "../../utils/dataHygiene";
import { linkSchedules } from "../../utils/scheduleLinkUtils";
import { logUpdate } from "../../utils/changeLogger";
import { fetchPeople } from "../../utils/dataAdapter";
import MissingDataReviewModal from "./MissingDataReviewModal";
import ConfirmDialog from "../shared/ConfirmDialog";
import OrphanedDataCleanupModal from "./OrphanedDataCleanupModal";
import { useUI } from "../../contexts/UIContext";
import { useAuth } from "../../contexts/AuthContext.jsx";
import MultiSelectDropdown from "../MultiSelectDropdown";

// ============================================================================
// DATA HYGIENE MANAGER
//
// A complete workflow for managing data quality:
// 1. Scan - Detect all data issues
// 2. Preview - See exactly what will be changed before any action
// 3. Fix - Execute fixes with full control (individual or batch)
// ============================================================================

// Health Score Display
const HealthScore = ({ score }) => {
  const getColor = (s) => {
    if (s >= 90) return "text-green-600 bg-green-50 border-green-200";
    if (s >= 70) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    if (s >= 50) return "text-orange-600 bg-orange-50 border-orange-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getLabel = (s) => {
    if (s >= 90) return "Excellent";
    if (s >= 70) return "Good";
    if (s >= 50) return "Fair";
    return "Needs Attention";
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${getColor(score)}`}
    >
      <span className="text-xl font-bold">{score}%</span>
      <span className="text-sm">{getLabel(score)}</span>
    </div>
  );
};

// Stats Card
const StatCard = ({ icon: Icon, label, value, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className={`p-4 rounded-lg ${colors[color]}`}>
      <Icon className="w-5 h-5 mb-1" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-75">{label}</div>
    </div>
  );
};

// Issue Type Badge
const IssueBadge = ({ type, count }) => {
  const config = {
    duplicates: { label: "Duplicates", color: "bg-yellow-100 text-yellow-800" },
    orphaned: { label: "Unlinked", color: "bg-orange-100 text-orange-800" },
    conflicts: { label: "Conflicts", color: "bg-red-100 text-red-800" },
    missing: { label: "Missing Data", color: "bg-blue-100 text-blue-800" },
  };

  const { label, color } = config[type] || {
    label: type,
    color: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {count} {label}
    </span>
  );
};

// Fix Preview Panel - Shows what will happen before executing
const FixPreviewPanel = ({ scanResult, onExecute, isExecuting }) => {
  if (!scanResult?.canAutoFix) return null;

  const { autoFixable } = scanResult;
  const totalAutoFixable =
    (autoFixable.highConfidencePeopleDuplicates || 0) +
    (autoFixable.highConfidenceScheduleDuplicates || 0) +
    (autoFixable.highConfidenceRoomDuplicates || 0) +
    (autoFixable.orphanedSchedulesWithName || 0) +
    (autoFixable.orphanedSpaceLinks || 0);

  if (totalAutoFixable === 0) return null;

  return (
    <div className="bg-white border rounded-lg p-4 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-600" />
            Auto-Fix Preview
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            The following actions will be performed automatically:
          </p>
        </div>
          <button
            onClick={onExecute}
            disabled={isExecuting}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
          {isExecuting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Fixing...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Execute All ({totalAutoFixable})
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {autoFixable.highConfidencePeopleDuplicates > 0 && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <GitMerge className="w-5 h-5 text-blue-600" />
            <div>
              <div className="font-medium text-gray-900">
                Merge {autoFixable.highConfidencePeopleDuplicates} people
                duplicates
              </div>
              <div className="text-xs text-gray-500">
                ≥95% confidence matches
              </div>
            </div>
          </div>
        )}

        {autoFixable.highConfidenceScheduleDuplicates > 0 && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <GitMerge className="w-5 h-5 text-green-600" />
            <div>
              <div className="font-medium text-gray-900">
                Merge {autoFixable.highConfidenceScheduleDuplicates} schedule
                duplicates
              </div>
              <div className="text-xs text-gray-500">
                ≥98% confidence matches
              </div>
            </div>
          </div>
        )}

        {autoFixable.highConfidenceRoomDuplicates > 0 && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <GitMerge className="w-5 h-5 text-purple-600" />
            <div>
              <div className="font-medium text-gray-900">
                Merge {autoFixable.highConfidenceRoomDuplicates} room duplicates
              </div>
              <div className="text-xs text-gray-500">
                ≥95% confidence matches
              </div>
            </div>
          </div>
        )}

        {autoFixable.orphanedSchedulesWithName > 0 && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Link className="w-5 h-5 text-orange-600" />
            <div>
              <div className="font-medium text-gray-900">
                Link {autoFixable.orphanedSchedulesWithName} schedules to
                instructors
              </div>
              <div className="text-xs text-gray-500">
                By matching instructor names
              </div>
            </div>
          </div>
        )}

        {autoFixable.orphanedSpaceLinks > 0 && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <MapPin className="w-5 h-5 text-purple-600" />
            <div>
              <div className="font-medium text-gray-900">
                Fix {autoFixable.orphanedSpaceLinks} schedule space links
              </div>
              <div className="text-xs text-gray-500">
                Repair missing or invalid room references
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Issue Section - Collapsible section for each issue type
const IssueSection = ({
  title,
  icon: Icon,
  iconColor,
  count,
  children,
  isExpanded,
  onToggle,
  actions,
}) => {
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${iconColor}`} />
          <span className="font-medium text-gray-900">{title}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${count > 0
              ? "bg-yellow-100 text-yellow-800"
              : "bg-green-100 text-green-800"
              }`}
          >
            {count}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>
      {isExpanded && count > 0 && (
        <div className="border-t p-4 bg-gray-50">{children}</div>
      )}
      {isExpanded && count === 0 && (
        <div className="border-t p-6 text-center text-gray-500 bg-gray-50">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          No issues found
        </div>
      )}
    </div>
  );
};

// Duplicate Item Card - For reviewing individual duplicates
const DuplicateItemCard = ({
  duplicate,
  type,
  onMerge,
  onIgnore,
  onLink,
  isProcessing,
  showPreview,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [primary, secondary] = duplicate.records || [];

  const getDisplayInfo = () => {
    if (type === "people") {
      return {
        title:
          `${primary?.firstName || ""} ${primary?.lastName || ""}`.trim() ||
          "Unknown",
        subtitle: primary?.email || primary?.jobTitle || "",
        secondaryTitle:
          `${secondary?.firstName || ""} ${secondary?.lastName || ""}`.trim(),
        secondarySubtitle: secondary?.email || secondary?.jobTitle || "",
      };
    }
    if (type === "schedules") {
      return {
        title: `${primary?.courseCode || ""} - ${primary?.section || ""}`,
        subtitle: `${primary?.term || ""} • ${primary?.instructorName || "No instructor"}`,
        secondaryTitle: `${secondary?.courseCode || ""} - ${secondary?.section || ""}`,
        secondarySubtitle: `${secondary?.term || ""} • ${secondary?.instructorName || "No instructor"}`,
      };
    }
    if (type === "rooms") {
      return {
        title: primary?.displayName || primary?.name || "Unknown Room",
        subtitle: primary?.buildingDisplayName || primary?.buildingCode || "",
        secondaryTitle: secondary?.displayName || secondary?.name || "",
        secondarySubtitle:
          secondary?.buildingDisplayName || secondary?.buildingCode || "",
      };
    }
    return {
      title: "Unknown",
      subtitle: "",
      secondaryTitle: "",
      secondarySubtitle: "",
    };
  };

  const info = getDisplayInfo();
  const confidencePercent = Math.round((duplicate.confidence || 0) * 100);
  const isHighConfidence =
    duplicate.confidence >= (type === "schedules" ? 0.98 : 0.95);

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${isHighConfidence
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
                  }`}
              >
                {confidencePercent}% match
              </span>
              <span className="text-xs text-gray-500">{duplicate.reason}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="text-xs text-blue-600 font-medium mb-1">
                  Keep (Primary)
                </div>
                <div className="font-medium text-gray-900 truncate">
                  {info.title}
                </div>
                {info.subtitle && (
                  <div className="text-sm text-gray-600 truncate">
                    {info.subtitle}
                  </div>
                )}
              </div>
              <div className="p-3 bg-gray-100 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 font-medium mb-1">
                  Merge From
                </div>
                <div className="font-medium text-gray-700 truncate">
                  {info.secondaryTitle}
                </div>
                {info.secondarySubtitle && (
                  <div className="text-sm text-gray-500 truncate">
                    {info.secondarySubtitle}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {showDetails && (
          <div className="mt-4 pt-4 border-t text-sm">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-medium text-gray-700 mb-1">
                  Primary Record
                </div>
                <pre className="bg-gray-50 p-2 rounded overflow-auto max-h-32 text-xs">
                  {JSON.stringify(primary, null, 2)}
                </pre>
              </div>
              <div>
                <div className="font-medium text-gray-700 mb-1">
                  Secondary Record
                </div>
                <pre className="bg-gray-50 p-2 rounded overflow-auto max-h-32 text-xs">
                  {JSON.stringify(secondary, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onIgnore(duplicate)}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm text-gray-700 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Not a duplicate
          </button>
          {type === "schedules" && (
            <button
              onClick={() => onLink?.(duplicate)}
              disabled={isProcessing}
              className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Link className="w-4 h-4" />
              Link sections
            </button>
          )}
          <button
            onClick={() => onMerge(duplicate)}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            <GitMerge className="w-4 h-4" />
            Merge
          </button>
        </div>
      </div>
    </div>
  );
};

// Orphaned Schedule Card
const OrphanedScheduleCard = ({ issue, onLink, onFixSpace, isProcessing }) => {
  const schedule = issue.record || {};
  const isSpaceIssue = issue.type === "orphaned_space";

  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium text-gray-900">
            {schedule.courseCode} - {schedule.courseTitle || "Untitled"}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {schedule.term} • Section {schedule.section}
          </div>
          {schedule.instructorName && (
            <div className="text-sm text-orange-600 mt-1">
              Has instructor name: "{schedule.instructorName}" but no link
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1">{issue.reason}</div>
        </div>
        {isSpaceIssue ? (
          <button
            onClick={() => onFixSpace?.(issue)}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
          >
            <MapPin className="w-4 h-4" />
            Fix Spaces
          </button>
        ) : (
          <button
            onClick={() => onLink(schedule)}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Link className="w-4 h-4" />
            Link Person
          </button>
        )}
      </div>
    </div>
  );
};

// Teaching Conflict Card
const TeachingConflictCard = ({ conflict, onLink, isProcessing }) => {
  const { instructorId, schedules, reason, likelyCause } = conflict;

  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-gray-900">
                {schedules?.[0]?.instructorName || "Unknown Instructor"}
              </div>
              <div className="text-sm text-gray-600 mt-1">{reason}</div>
            </div>
            {Array.isArray(schedules) && schedules.length >= 2 && (
              <button
                onClick={() => onLink?.(conflict)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
              >
                <Link className="w-4 h-4" />
                Link sections
              </button>
            )}
          </div>
          {likelyCause === "duplicate_schedule" && (
            <div className="text-xs text-orange-600 mt-2">
              Likely caused by duplicate schedule records. Merge duplicates to
              resolve.
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {schedules?.map((s, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 rounded text-xs">
                {s.courseCode} {s.section}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Link Person Modal
const LinkPersonModal = ({ isOpen, onClose, onConfirm, schedule }) => {
  const [people, setPeople] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPeople();
      setSearchTerm("");
      setSelectedPerson(null);
    }
  }, [isOpen]);

  const loadPeople = async () => {
    setIsLoading(true);
    try {
      const allPeople = await fetchPeople();
      setPeople(
        allPeople.sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(
            `${b.firstName} ${b.lastName}`,
          ),
        ),
      );
    } catch (error) {
      console.error("Error loading people:", error);
    }
    setIsLoading(false);
  };

  const filteredPeople = useMemo(() => {
    if (!searchTerm.trim()) return people.slice(0, 50);
    const search = searchTerm.toLowerCase();
    return people
      .filter((p) => {
        const fullName =
          `${p.firstName || ""} ${p.lastName || ""}`.toLowerCase();
        return (
          fullName.includes(search) ||
          (p.email || "").toLowerCase().includes(search)
        );
      })
      .slice(0, 50);
  }, [searchTerm, people]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] mx-4 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Link Schedule to Person</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {schedule?.courseCode} - {schedule?.courseTitle}
          </p>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="divide-y">
              {filteredPeople.map((person) => (
                <button
                  key={person.id}
                  onClick={() => setSelectedPerson(person)}
                  className={`w-full p-3 text-left hover:bg-gray-50 transition-colors ${selectedPerson?.id === person.id
                    ? "bg-blue-50 border-l-4 border-blue-500"
                    : ""
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {person.firstName} {person.lastName}
                      </div>
                      {person.email && (
                        <div className="text-sm text-gray-500">
                          {person.email}
                        </div>
                      )}
                    </div>
                    {selectedPerson?.id === person.id && (
                      <Check className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedPerson && onConfirm(selectedPerson)}
            disabled={!selectedPerson}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Link Person
          </button>
        </div>
      </div>
    </div>
  );
};

// Fix Results Modal
const FixResultsModal = ({ isOpen, onClose, results, isFixing }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {isFixing ? (
          <div className="text-center py-8">
            <RefreshCw className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold">Fixing Issues...</h3>
            <p className="text-gray-600 mt-2">
              Standardizing data, merging duplicates, and linking records...
            </p>
          </div>
        ) : results ? (
          <>
            <div className="text-center mb-6">
              {results.success ? (
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              ) : (
                <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              )}
              <h3 className="text-lg font-semibold">
                {results.success
                  ? "Fix Complete!"
                  : "Fix Completed with Issues"}
              </h3>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Total Fixed</span>
                <span className="font-semibold text-green-600">
                  {results.totalFixed || 0}
                </span>
              </div>

              {results.standardization?.updated > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Records standardized</span>
                  <span>{results.standardization.updated}</span>
                </div>
              )}

              {(results.duplicates?.peopleMerged || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">People merged</span>
                  <span>{results.duplicates.peopleMerged}</span>
                </div>
              )}

              {(results.duplicates?.schedulesMerged || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Schedules merged</span>
                  <span>{results.duplicates.schedulesMerged}</span>
                </div>
              )}

              {(results.duplicates?.roomsMerged || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Rooms merged</span>
                  <span>{results.duplicates.roomsMerged}</span>
                </div>
              )}

              {(results.instructorLinks?.linked || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Instructors linked</span>
                  <span>{results.instructorLinks.linked}</span>
                </div>
              )}

              {results.errors?.length > 0 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="text-sm font-medium text-red-800 mb-1">
                    Errors:
                  </div>
                  <ul className="text-xs text-red-700 space-y-1">
                    {results.errors.slice(0, 3).map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                    {results.errors.length > 3 && (
                      <li>...and {results.errors.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90"
            >
              Done
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
};

const SpaceFixPreviewModal = ({
  isOpen,
  title,
  items,
  options,
  displayMap,
  selections,
  onSelectionChange,
  onConfirm,
  onClose,
  isProcessing,
  confirmDisabled,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">
              Review the detected spaces and override if needed.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {items.map((item) => {
            const schedule = item.schedule || {};
            const selected = selections[item.scheduleId] || [];
            const proposed = item.proposedDisplayNames || [];
            const currentDisplay =
              Array.isArray(schedule.spaceDisplayNames) &&
              schedule.spaceDisplayNames.length > 0
                ? schedule.spaceDisplayNames.join("; ")
                : schedule.locationLabel || "—";
            return (
              <div
                key={item.scheduleId}
                className="border rounded-lg p-4 bg-gray-50"
              >
                <div className="font-medium text-gray-900">
                  {schedule.courseCode || "Course"} • Section{" "}
                  {schedule.section || "?"} • {schedule.term || ""}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Current: {currentDisplay}
                </div>
                {proposed.length > 0 ? (
                  <div className="text-xs text-gray-500 mt-1">
                    Proposed: {proposed.join("; ")}
                  </div>
                ) : (
                  <div className="text-xs text-orange-600 mt-1">
                    No matching space detected. Please select one below.
                  </div>
                )}
                {item.missingSpaceIds?.length > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    Missing IDs: {item.missingSpaceIds.join(", ")}
                  </div>
                )}
                <div className="mt-3">
                  <MultiSelectDropdown
                    options={options}
                    selected={selected}
                    onChange={(next) =>
                      onSelectionChange(item.scheduleId, next)
                    }
                    placeholder="Select room(s)..."
                    displayMap={displayMap}
                    showSelectedLabels
                    menuPortal
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled || isProcessing}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {isProcessing ? "Fixing..." : "Apply Fix"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Main Component
const DataHygieneManager = () => {
  const { showNotification } = useUI();
  const { user, loading: authLoading } = useAuth();

  // Core state
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixResults, setFixResults] = useState(null);
  const [showFixModal, setShowFixModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(null);
  // Backfill (no merges)
  const [backfillTermCode, setBackfillTermCode] = useState("");
  const [identityBackfillPreview, setIdentityBackfillPreview] = useState(null);
  const [isBackfillRunning, setIsBackfillRunning] = useState(false);

  // Expanded sections
  const [expandedSection, setExpandedSection] = useState(null);

  // Modal states
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);
  const [missingDataType, setMissingDataType] = useState("email");
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [showLinkPersonModal, setShowLinkPersonModal] = useState(false);
  const [scheduleToLink, setScheduleToLink] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [spaceFixModal, setSpaceFixModal] = useState({
    isOpen: false,
    title: "",
    items: [],
    options: [],
    displayMap: {},
  });
  const [spaceFixSelections, setSpaceFixSelections] = useState({});

  // Run scan on mount
  useEffect(() => {
    if (!authLoading && user) {
      handleScan();
    }
  }, [authLoading, user]);

  // Scan data health
  const handleScan = async () => {
    setIsScanning(true);
    try {
      const result = await scanDataHealth();
      setScanResult(result);
      setLastScanTime(new Date());
    } catch (error) {
      console.error("Scan failed:", error);
      showNotification("error", "Scan Failed", error.message);
    } finally {
      setIsScanning(false);
    }
  };

  const fetchSchedulesForTermCode = useCallback(async (termCode) => {
    const normalized = (termCode || "").toString().trim();
    if (!normalized) return [];
    const snapshot = await getDocs(
      query(collection(db, "schedules"), where("termCode", "==", normalized)),
    );
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  }, []);

  const handlePreviewIdentityBackfill = async () => {
    const termCode = backfillTermCode.trim();
    if (!termCode) {
      showNotification("warning", "Missing Term Code", "Enter a term code (e.g., 202610).");
      return;
    }
    setIsBackfillRunning(true);
    try {
      const preview = await previewScheduleIdentityBackfill({ termCode });
      setIdentityBackfillPreview(preview);
      showNotification(
        "success",
        "Identity Backfill Preview",
        `Found ${preview.recordsToUpdate || 0} schedules to update.`,
      );
    } catch (error) {
      console.error("Identity backfill preview failed:", error);
      showNotification("error", "Preview Failed", error.message);
    } finally {
      setIsBackfillRunning(false);
    }
  };

  const handleApplyIdentityBackfill = async () => {
    const changes = identityBackfillPreview?.changes || [];
    if (!Array.isArray(changes) || changes.length === 0) {
      showNotification("info", "No Changes", "No schedule identity changes to apply.");
      return;
    }
    setIsBackfillRunning(true);
    try {
      const result = await applyScheduleIdentityBackfill(changes);
      showNotification(
        "success",
        "Identity Backfill Applied",
        `Updated ${result.updated || 0} schedules.`,
      );
      setIdentityBackfillPreview(null);
      await handleScan();
    } catch (error) {
      console.error("Identity backfill apply failed:", error);
      showNotification("error", "Apply Failed", error.message);
    } finally {
      setIsBackfillRunning(false);
    }
  };

  const handleStandardizeTermSchedules = async () => {
    const termCode = backfillTermCode.trim();
    if (!termCode) {
      showNotification("warning", "Missing Term Code", "Enter a term code (e.g., 202610).");
      return;
    }
    setIsBackfillRunning(true);
    try {
      const result = await standardizeAllData({
        termCode,
        includePeople: false,
        includeRooms: false,
        includeSchedules: true,
      });
      showNotification(
        "success",
        "Standardization Complete",
        `Updated ${result.updatedRecords || 0} schedules in ${termCode}.`,
      );
      await handleScan();
    } catch (error) {
      console.error("Standardize term schedules failed:", error);
      showNotification("error", "Standardization Failed", error.message);
    } finally {
      setIsBackfillRunning(false);
    }
  };

  const handlePreviewTermSpaceLinks = async () => {
    const termCode = backfillTermCode.trim();
    if (!termCode) {
      showNotification("warning", "Missing Term Code", "Enter a term code (e.g., 202610).");
      return;
    }
    setIsProcessing(true);
    try {
      const schedules = await fetchSchedulesForTermCode(termCode);
      await openSpaceFixPreview({
        schedules,
        title: `Fix Space Links (${termCode})`,
      });
    } catch (error) {
      console.error("Space link preview failed:", error);
      showNotification("error", "Preview Failed", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const openConfirm = (config) => {
    setConfirmAction(config);
  };

  const closeConfirm = () => {
    setConfirmAction(null);
  };

  // Execute auto-fix
  const executeAutoFix = async () => {
    setShowFixModal(true);
    setIsFixing(true);
    setFixResults(null);

    try {
      const results = await autoFixAllIssues();
      setFixResults(results);
      await handleScan(); // Re-scan after fix
      if (results.success && results.totalFixed > 0) {
        showNotification(
          "success",
          "Issues Fixed",
          `Fixed ${results.totalFixed} issues.`,
        );
      }
    } catch (error) {
      console.error("Fix failed:", error);
      setFixResults({ success: false, errors: [error.message], totalFixed: 0 });
      showNotification("error", "Fix Failed", error.message);
    } finally {
      setIsFixing(false);
    }
  };

  const requestAutoFix = () => {
    const autoFixable = scanResult?.autoFixable || {};
    const totalAutoFixable =
      (autoFixable.highConfidencePeopleDuplicates || 0) +
      (autoFixable.highConfidenceScheduleDuplicates || 0) +
      (autoFixable.highConfidenceRoomDuplicates || 0) +
      (autoFixable.orphanedSchedulesWithName || 0) +
      (autoFixable.orphanedSpaceLinks || 0);
    openConfirm({
      title: "Execute Auto-Fix?",
      confirmText: `Execute All (${totalAutoFixable || 0})`,
      variant: "warning",
      message: (
        <div className="space-y-2 text-sm">
          <div>
            This will automatically fix high-confidence issues and repair space
            links using existing rooms.
          </div>
          <ul className="list-disc pl-5 text-gray-600 space-y-1">
            {autoFixable.highConfidencePeopleDuplicates > 0 && (
              <li>
                Merge {autoFixable.highConfidencePeopleDuplicates} people
                duplicates
              </li>
            )}
            {autoFixable.highConfidenceScheduleDuplicates > 0 && (
              <li>
                Merge {autoFixable.highConfidenceScheduleDuplicates} schedule
                duplicates
              </li>
            )}
            {autoFixable.highConfidenceRoomDuplicates > 0 && (
              <li>
                Merge {autoFixable.highConfidenceRoomDuplicates} room duplicates
              </li>
            )}
            {autoFixable.orphanedSchedulesWithName > 0 && (
              <li>
                Link {autoFixable.orphanedSchedulesWithName} schedules to
                instructors
              </li>
            )}
            {autoFixable.orphanedSpaceLinks > 0 && (
              <li>
                Fix {autoFixable.orphanedSpaceLinks} schedule space links
              </li>
            )}
          </ul>
          {autoFixable.orphanedSpaceLinks > 0 && (
            <div className="text-xs text-gray-500">
              To review or override room selections, run "Fix space links"
              first.
            </div>
          )}
        </div>
      ),
      onConfirm: executeAutoFix,
    });
  };

  const closeSpaceFixModal = () => {
    setSpaceFixModal((prev) => ({ ...prev, isOpen: false }));
    setSpaceFixSelections({});
  };

  const openSpaceFixPreview = async ({
    schedules = [],
    title = "Fix Space Links",
    issueMap = {},
  }) => {
    if (!Array.isArray(schedules) || schedules.length === 0) {
      showNotification("info", "No schedules", "No schedules to fix.");
      return;
    }
    setIsProcessing(true);
    try {
      const preview = await previewScheduleSpaceLinks({ schedules });
      const items = preview.items.map((item) => ({
        ...item,
        missingSpaceIds:
          issueMap[item.scheduleId]?.missingSpaceIds ||
          item.unresolvedSpaceIds ||
          [],
      }));
      const selections = {};
      items.forEach((item) => {
        selections[item.scheduleId] = item.proposedSpaceIds || [];
      });
      setSpaceFixSelections(selections);
      setSpaceFixModal({
        isOpen: true,
        title,
        items,
        options: preview.roomOptions || [],
        displayMap: preview.displayMap || {},
      });
    } catch (error) {
      showNotification("error", "Preview Failed", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmSpaceFix = async () => {
    if (!spaceFixModal.items || spaceFixModal.items.length === 0) return;
    setIsProcessing(true);
    try {
      const overrides = {};
      const schedules = spaceFixModal.items.map((item) => item.schedule);
      Object.entries(spaceFixSelections).forEach(([scheduleId, spaceIds]) => {
        if (Array.isArray(spaceIds) && spaceIds.length > 0) {
          overrides[scheduleId] = { spaceIds };
        }
      });
      const result = await repairScheduleSpaceLinks({
        schedules,
        overrides,
        normalizeRoomDisplayNames: true,
      });
      showNotification(
        "success",
        "Space Links Repaired",
        `Updated ${result.schedulesUpdated || 0} schedules.`,
      );
      closeSpaceFixModal();
      await handleScan();
    } catch (error) {
      showNotification("error", "Fix Failed", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSpaceFixSelectionChange = (scheduleId, next) => {
    setSpaceFixSelections((prev) => ({ ...prev, [scheduleId]: next }));
  };

  // Handle individual merge
  const executeMerge = async (duplicate, type) => {
    setIsProcessing(true);
    try {
      if (type === "people") {
        await mergePeople(duplicate.records[0].id, duplicate.records[1].id);
      } else if (type === "schedules") {
        await mergeScheduleRecords(duplicate);
      } else if (type === "rooms") {
        await mergeRoomRecords(duplicate);
      }
      showNotification("success", "Merged", "Records merged successfully.");
      await handleScan();
    } catch (error) {
      showNotification("error", "Merge Failed", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle mark as not duplicate
  const executeIgnore = async (duplicate, type) => {
    setIsProcessing(true);
    try {
      await markNotDuplicate({
        entityType: type,
        idA: duplicate.records[0].id,
        idB: duplicate.records[1].id,
        reason: "Marked as not duplicate by user",
      });
      showNotification(
        "success",
        "Marked",
        "This pair won't be flagged again.",
      );
      await handleScan();
    } catch (error) {
      showNotification("error", "Failed", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeLinkSections = async (scheduleIds) => {
    if (!Array.isArray(scheduleIds) || scheduleIds.length < 2) return;
    setIsProcessing(true);
    try {
      await linkSchedules({
        scheduleIds,
        reason: "Linked by user",
        source: "DataHygieneManager",
      });
      showNotification(
        "success",
        "Linked",
        "Sections linked successfully.",
      );
      await handleScan();
    } catch (error) {
      showNotification("error", "Link Failed", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const requestMerge = (duplicate, type) => {
    const [primary, secondary] = duplicate.records || [];
    const label =
      type === "people"
        ? `${primary?.firstName || ""} ${primary?.lastName || ""}`.trim() ||
          primary?.name ||
          "Person"
        : type === "rooms"
          ? primary?.displayName || primary?.spaceKey || "Room"
          : `${primary?.courseCode || ""} ${primary?.section || ""}`.trim() ||
            "Schedule";
    openConfirm({
      title: `Merge ${type.slice(0, -1)} records?`,
      confirmText: "Merge",
      variant: "warning",
      message: (
        <div className="text-sm space-y-2">
          <div>
            You are about to merge <strong>{label}</strong> with a duplicate
            record. This will keep the most complete data and remove the
            secondary record.
          </div>
        </div>
      ),
      onConfirm: () => executeMerge(duplicate, type),
    });
  };

  const requestIgnore = (duplicate, type) => {
    const [primary, secondary] = duplicate.records || [];
    const label =
      type === "people"
        ? `${primary?.firstName || ""} ${primary?.lastName || ""}`.trim() ||
          primary?.name ||
          "Person"
        : type === "rooms"
          ? primary?.displayName || primary?.spaceKey || "Room"
          : `${primary?.courseCode || ""} ${primary?.section || ""}`.trim() ||
            "Schedule";
    openConfirm({
      title: "Mark as Not Duplicate?",
      confirmText: "Mark Not Duplicate",
      variant: "info",
      message: (
        <div className="text-sm space-y-2">
          <div>
            This will keep both records and prevent this pair from being flagged
            again.
          </div>
          <div>
            Primary: <strong>{label}</strong>
          </div>
          <div className="text-xs text-gray-500">
            Secondary ID: {secondary?.id || "Unknown"}
          </div>
        </div>
      ),
      onConfirm: () => executeIgnore(duplicate, type),
    });
  };

  const requestLinkDuplicate = (duplicate) => {
    const [primary, secondary] = duplicate.records || [];
    if (!primary?.id || !secondary?.id) return;
    const labelPrimary = `${primary?.courseCode || ""} ${primary?.section || ""}`.trim();
    const labelSecondary = `${secondary?.courseCode || ""} ${secondary?.section || ""}`.trim();
    openConfirm({
      title: "Link Sections?",
      confirmText: "Link Sections",
      variant: "info",
      message: (
        <div className="text-sm space-y-2">
          <div>
            This will link the two sections so they are not flagged as
            duplicates or teaching conflicts.
          </div>
          <div>
            Primary: <strong>{labelPrimary || primary?.id}</strong>
          </div>
          <div>
            Secondary: <strong>{labelSecondary || secondary?.id}</strong>
          </div>
        </div>
      ),
      onConfirm: () => executeLinkSections([primary.id, secondary.id]),
    });
  };

  const requestLinkConflict = (conflict) => {
    const schedules = Array.isArray(conflict?.schedules)
      ? conflict.schedules
      : [];
    const scheduleIds = schedules.map((s) => s?.id).filter(Boolean);
    if (scheduleIds.length < 2) return;
    openConfirm({
      title: "Link Sections?",
      confirmText: "Link Sections",
      variant: "info",
      message: (
        <div className="text-sm space-y-2">
          <div>
            Link these sections so they are not flagged as teaching conflicts.
          </div>
          <div className="flex flex-wrap gap-2">
            {schedules.map((s, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 rounded text-xs">
                {s.courseCode} {s.section}
              </span>
            ))}
          </div>
        </div>
      ),
      onConfirm: () => executeLinkSections(scheduleIds),
    });
  };

  // Handle link schedule to person
  const executeLinkSchedule = async (person) => {
    if (!scheduleToLink || !person?.id) return;
    try {
      await linkScheduleToPerson(scheduleToLink.id, person.id);
      showNotification("success", "Linked", "Schedule linked to person.");
      setShowLinkPersonModal(false);
      setScheduleToLink(null);
      await handleScan();
    } catch (error) {
      showNotification("error", "Link Failed", error.message);
    }
  };

  const handleLinkSchedule = async (person) => {
    if (!scheduleToLink || !person?.id) return;
    openConfirm({
      title: "Link Schedule to Person?",
      confirmText: "Link",
      variant: "info",
      message: (
        <div className="text-sm space-y-2">
          <div>
            <strong>{scheduleToLink.courseCode}</strong> • Section{" "}
            {scheduleToLink.section || "?"} • {scheduleToLink.term || ""}
          </div>
          <div>
            Link to:{" "}
            <strong>
              {person.firstName || ""} {person.lastName || ""} (
              {person.email || person.id})
            </strong>
          </div>
        </div>
      ),
      onConfirm: () => executeLinkSchedule(person),
    });
  };

  const handleFixSpaceLinks = () => {
    const issues = scanResult?.issues?.orphaned || [];
    const spaceIssues = issues.filter((issue) => issue.type === "orphaned_space");
    const schedules = spaceIssues.map((issue) => issue.record).filter(Boolean);
    const issueMap = spaceIssues.reduce((acc, issue) => {
      if (issue?.record?.id) {
        acc[issue.record.id] = issue;
      }
      return acc;
    }, {});
    openSpaceFixPreview({
      schedules,
      title: "Fix Space Links",
      issueMap,
    });
  };

  const handleFixSpaceLinksForSchedule = (issue) => {
    const schedule = issue?.record || issue;
    if (!schedule?.id) return;
    const issueMap = issue?.record?.id ? { [issue.record.id]: issue } : {};
    openSpaceFixPreview({
      schedules: [schedule],
      title: "Fix Schedule Spaces",
      issueMap,
    });
  };

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Calculate totals
  const totals = useMemo(() => {
    if (!scanResult)
      return { duplicates: 0, orphaned: 0, conflicts: 0, missing: 0 };
    return {
      duplicates: scanResult.issues?.duplicates?.total || 0,
      orphaned: scanResult.issues?.orphaned?.length || 0,
      conflicts: scanResult.issues?.teachingConflicts?.length || 0,
      missing: Object.values(scanResult.issues?.missingData || {}).reduce(
        (a, b) => a + b,
        0,
      ),
    };
  }, [scanResult]);

  const totalIssues = totals.duplicates + totals.orphaned + totals.conflicts;
  const orphanedSpaceCount = useMemo(() => {
    return scanResult?.issues?.orphaned?.filter(
      (issue) => issue.type === "orphaned_space",
    ).length || 0;
  }, [scanResult]);

  const orphanedScheduleCount = useMemo(() => {
    return scanResult?.issues?.orphaned?.filter(
      (issue) => issue.type === "orphaned_schedule",
    ).length || 0;
  }, [scanResult]);

  const spaceFixConfirmDisabled = useMemo(() => {
    if (!spaceFixModal.isOpen) return true;
    return spaceFixModal.items.some((item) => {
      if (!item?.isPhysical) return false;
      const selected = spaceFixSelections[item.scheduleId] || [];
      return selected.length === 0;
    });
  }, [spaceFixModal, spaceFixSelections]);

  // Loading state
  if (isScanning && !scanResult) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64">
          <RefreshCw className="w-12 h-12 animate-spin text-baylor-green mb-4" />
          <h2 className="text-xl font-semibold">Scanning Data Health...</h2>
          <p className="text-gray-600 mt-2">Analyzing records for issues</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Hygiene</h1>
          <p className="text-gray-600">Maintain clean, consistent data</p>
          {lastScanTime && (
            <p className="text-sm text-gray-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last scan: {lastScanTime.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw
            className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`}
          />
          {isScanning ? "Scanning..." : "Scan Now"}
        </button>
      </div>

      {/* Backfill (No Merges) */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Backfill Canonical Fields (No Merges)
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              Term-scoped utilities to bring legacy data up to current import
              invariants without merging records.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Term Code
            </label>
            <input
              value={backfillTermCode}
              onChange={(e) => setBackfillTermCode(e.target.value)}
              placeholder="e.g., 202610"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handlePreviewIdentityBackfill}
              disabled={isBackfillRunning}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              Preview Identity Backfill
            </button>
            <button
              onClick={handleApplyIdentityBackfill}
              disabled={
                isBackfillRunning ||
                !(identityBackfillPreview?.recordsToUpdate > 0)
              }
              className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 text-sm"
            >
              Apply
            </button>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleStandardizeTermSchedules}
              disabled={isBackfillRunning}
              className="px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm"
            >
              Standardize Term Schedules
            </button>
            <button
              onClick={handlePreviewTermSpaceLinks}
              disabled={isProcessing}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
            >
              Fix Space Links (Term)
            </button>
          </div>
        </div>

        {identityBackfillPreview && (
          <div className="mt-4 text-xs text-gray-600">
            Identity backfill preview:{" "}
            <span className="font-medium text-gray-900">
              {identityBackfillPreview.recordsToUpdate || 0}
            </span>{" "}
            schedules would be updated out of{" "}
            <span className="font-medium text-gray-900">
              {identityBackfillPreview.totalRecords || 0}
            </span>
            .
          </div>
        )}
      </div>

      {scanResult && (
        <>
          {/* Summary Row */}
          <div className="bg-white border rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <HealthScore score={scanResult.healthScore} />
                <div className="flex gap-4">
                  <StatCard
                    icon={Users}
                    label="People"
                    value={scanResult.counts.people}
                    color="blue"
                  />
                  <StatCard
                    icon={Calendar}
                    label="Schedules"
                    value={scanResult.counts.schedules}
                    color="green"
                  />
                  <StatCard
                    icon={MapPin}
                    label="Rooms"
                    value={scanResult.counts.rooms}
                    color="purple"
                  />
                </div>
              </div>
              <div className="text-right">
                {totalIssues > 0 ? (
                  <div className="text-orange-600 font-medium">
                    {totalIssues} issues found
                  </div>
                ) : (
                  <div className="text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    All clear
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Auto-Fix Preview */}
          <FixPreviewPanel
            scanResult={scanResult}
            onExecute={requestAutoFix}
            isExecuting={isFixing}
          />

          {/* Issue Sections */}
          <div className="space-y-3">
            {/* Duplicates Section */}
            <IssueSection
              title="Duplicate Records"
              icon={GitMerge}
              iconColor="text-yellow-600"
              count={totals.duplicates}
              isExpanded={expandedSection === "duplicates"}
              onToggle={() => toggleSection("duplicates")}
            >
              <div className="space-y-6">
                {/* People duplicates */}
                {scanResult.issues.duplicates.people.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      People ({scanResult.issues.duplicates.people.length})
                    </h4>
                    <div className="space-y-3">
                      {scanResult.issues.duplicates.people.map((dup, i) => (
                        <DuplicateItemCard
                          key={i}
                          duplicate={dup}
                          type="people"
                          onMerge={(d) => requestMerge(d, "people")}
                          onIgnore={(d) => requestIgnore(d, "people")}
                          onLink={requestLinkDuplicate}
                          isProcessing={isProcessing}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Schedule duplicates */}
                {scanResult.issues.duplicates.schedules.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Schedules ({scanResult.issues.duplicates.schedules.length}
                      )
                    </h4>
                    <div className="space-y-3">
                      {scanResult.issues.duplicates.schedules
                        .slice(0, 20)
                        .map((dup, i) => (
                          <DuplicateItemCard
                            key={i}
                            duplicate={dup}
                            type="schedules"
                            onMerge={(d) => requestMerge(d, "schedules")}
                            onIgnore={(d) => requestIgnore(d, "schedules")}
                            onLink={requestLinkDuplicate}
                            isProcessing={isProcessing}
                          />
                        ))}
                      {scanResult.issues.duplicates.schedules.length > 20 && (
                        <div className="text-sm text-gray-500 text-center py-2">
                          Showing 20 of{" "}
                          {scanResult.issues.duplicates.schedules.length}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Room duplicates */}
                {scanResult.issues.duplicates.rooms.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Rooms ({scanResult.issues.duplicates.rooms.length})
                    </h4>
                    <div className="space-y-3">
                      {scanResult.issues.duplicates.rooms
                        .slice(0, 20)
                        .map((dup, i) => (
                          <DuplicateItemCard
                            key={i}
                            duplicate={dup}
                            type="rooms"
                            onMerge={(d) => requestMerge(d, "rooms")}
                            onIgnore={(d) => requestIgnore(d, "rooms")}
                            onLink={requestLinkDuplicate}
                            isProcessing={isProcessing}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </IssueSection>

            {/* Orphaned/Unlinked Section */}
            <IssueSection
              title="Unlinked Schedules"
              icon={Link}
              iconColor="text-orange-600"
              count={totals.orphaned}
              isExpanded={expandedSection === "orphaned"}
              onToggle={() => toggleSection("orphaned")}
              actions={
                totals.orphaned > 0 && (
                  <div className="flex items-center gap-2">
                    {orphanedScheduleCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openConfirm({
                            title: "Auto-link instructors?",
                            confirmText: "Auto-link",
                            variant: "warning",
                            message: (
                              <div className="text-sm space-y-2">
                                <div>
                                  This will link schedules to instructors using
                                  exact name matches. Only unambiguous matches
                                  will be linked.
                                </div>
                                <div className="text-xs text-gray-500">
                                  Detected {orphanedScheduleCount} schedule(s)
                                  with missing instructor links.
                                </div>
                              </div>
                            ),
                            onConfirm: async () => {
                              setIsProcessing(true);
                              try {
                                const result = await backfillInstructorIdsFromNames();
                                showNotification(
                                  "success",
                                  "Auto-Linked",
                                  `Linked ${result.linked} schedules by instructor name.`,
                                );
                                await handleScan();
                              } catch (error) {
                                showNotification("error", "Failed", error.message);
                              } finally {
                                setIsProcessing(false);
                              }
                            },
                          });
                        }}
                        disabled={isProcessing}
                        className="px-3 py-1 text-xs bg-orange-100 text-orange-800 rounded hover:bg-orange-200 disabled:opacity-50"
                      >
                        Auto-link by name
                      </button>
                    )}
                    {orphanedSpaceCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFixSpaceLinks();
                        }}
                        disabled={isProcessing}
                        className="px-3 py-1 text-xs bg-purple-100 text-purple-800 rounded hover:bg-purple-200 disabled:opacity-50"
                      >
                        Fix space links
                      </button>
                    )}
                  </div>
                )
              }
            >
              <div className="space-y-3">
                {scanResult.issues.orphaned
                  .slice(0, 20)
                  .map((issue, i) => (
                    <OrphanedScheduleCard
                      key={i}
                      issue={issue}
                      onLink={(schedule) => {
                        setScheduleToLink(schedule);
                        setShowLinkPersonModal(true);
                      }}
                      onFixSpace={handleFixSpaceLinksForSchedule}
                      isProcessing={isProcessing}
                    />
                  ))}
                {scanResult.issues.orphaned.length > 20 && (
                  <div className="text-sm text-gray-500 text-center py-2">
                    Showing 20 of {scanResult.issues.orphaned.length}
                  </div>
                )}
              </div>
            </IssueSection>

            {/* Teaching Conflicts Section */}
            <IssueSection
              title="Teaching Conflicts"
              icon={AlertTriangle}
              iconColor="text-red-600"
              count={totals.conflicts}
              isExpanded={expandedSection === "conflicts"}
              onToggle={() => toggleSection("conflicts")}
            >
              <div className="space-y-3">
                {scanResult.issues.teachingConflicts
                  .slice(0, 20)
                  .map((conflict, i) => (
                    <TeachingConflictCard
                      key={i}
                      conflict={conflict}
                      onLink={requestLinkConflict}
                      isProcessing={isProcessing}
                    />
                  ))}
              </div>
            </IssueSection>

            {/* Missing Data Section */}
            <IssueSection
              title="Missing Data"
              icon={AlertCircle}
              iconColor="text-blue-600"
              count={totals.missing}
              isExpanded={expandedSection === "missing"}
              onToggle={() => toggleSection("missing")}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={() => {
                    setMissingDataType("email");
                    setShowMissingDataModal(true);
                  }}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-500" />
                    <span className="text-sm">Email</span>
                  </div>
                  <span className="font-medium text-red-600">
                    {scanResult.issues.missingData.email}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMissingDataType("phone");
                    setShowMissingDataModal(true);
                  }}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Phone</span>
                  </div>
                  <span className="font-medium text-red-600">
                    {scanResult.issues.missingData.phone}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMissingDataType("office");
                    setShowMissingDataModal(true);
                  }}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-purple-500" />
                    <span className="text-sm">Office</span>
                  </div>
                  <span className="font-medium text-red-600">
                    {scanResult.issues.missingData.office}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setMissingDataType("jobTitle");
                    setShowMissingDataModal(true);
                  }}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-orange-500" />
                    <span className="text-sm">Job Title</span>
                  </div>
                  <span className="font-medium text-red-600">
                    {scanResult.issues.missingData.jobTitle}
                  </span>
                </button>
              </div>
            </IssueSection>
          </div>

          {/* Advanced Tools */}
          <div className="mt-6 pt-6 border-t">
            <button
              onClick={() => setShowCleanupModal(true)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" />
              Advanced: Cleanup orphaned data by semester
            </button>
          </div>
        </>
      )}

      {/* Modals */}
      <FixResultsModal
        isOpen={showFixModal}
        onClose={() => setShowFixModal(false)}
        results={fixResults}
        isFixing={isFixing}
      />

      <MissingDataReviewModal
        isOpen={showMissingDataModal}
        onClose={() => setShowMissingDataModal(false)}
        missingDataType={missingDataType}
        onDataUpdated={handleScan}
      />

      <OrphanedDataCleanupModal
        isOpen={showCleanupModal}
        onClose={() => setShowCleanupModal(false)}
        showNotification={showNotification}
      />

      <LinkPersonModal
        isOpen={showLinkPersonModal}
        onClose={() => {
          setShowLinkPersonModal(false);
          setScheduleToLink(null);
        }}
        onConfirm={handleLinkSchedule}
        schedule={scheduleToLink}
      />

      <SpaceFixPreviewModal
        isOpen={spaceFixModal.isOpen}
        title={spaceFixModal.title}
        items={spaceFixModal.items}
        options={spaceFixModal.options}
        displayMap={spaceFixModal.displayMap}
        selections={spaceFixSelections}
        onSelectionChange={handleSpaceFixSelectionChange}
        onConfirm={confirmSpaceFix}
        onClose={closeSpaceFixModal}
        isProcessing={isProcessing}
        confirmDisabled={spaceFixConfirmDisabled}
      />

      <ConfirmDialog
        isOpen={!!confirmAction}
        title={confirmAction?.title || ""}
        message={confirmAction?.message || ""}
        confirmText={confirmAction?.confirmText || "Confirm"}
        cancelText={confirmAction?.cancelText || "Cancel"}
        variant={confirmAction?.variant || "info"}
        confirmDisabled={confirmAction?.confirmDisabled || false}
        onConfirm={async () => {
          const action = confirmAction;
          closeConfirm();
          if (action?.onConfirm) {
            await action.onConfirm();
          }
        }}
        onCancel={closeConfirm}
      />
    </div>
  );
};

export default DataHygieneManager;
