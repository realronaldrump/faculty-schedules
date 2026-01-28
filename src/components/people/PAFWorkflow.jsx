import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Eye,
  EyeOff,
  Edit,
  Save,
  X,
  FileText,
  Users,
  AlertCircle,
} from "lucide-react";
import { usePeople } from "../../contexts/PeopleContext";
import { useData } from "../../contexts/DataContext";
import { usePeopleOperations } from "../../hooks";
import { useUI } from "../../contexts/UIContext";
import { usePermissions } from "../../utils/permissions";
import {
  PAF_DEFAULTS,
  formatCourseForPAF,
  copyToClipboard,
} from "../../utils/pafUtils";

const PAFWorkflow = ({ embedded = false }) => {
  const { people: directoryData, loadPeople } = usePeople();
  const { scheduleData, selectedSemester, availableSemesters, setSelectedSemester } = useData();
  const { handleFacultyUpdate } = usePeopleOperations();
  const { showNotification } = useUI();
  const { canEdit } = usePermissions();
  const canEditPeople = canEdit("people/directory");

  const [searchText, setSearchText] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [copiedField, setCopiedField] = useState(null);
  const [revealedIgniteIds, setRevealedIgniteIds] = useState(new Set());
  const [editingIgniteId, setEditingIgniteId] = useState(null);
  const [igniteIdDraft, setIgniteIdDraft] = useState("");
  const [igniteIdError, setIgniteIdError] = useState("");

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  // Get adjuncts only
  const adjuncts = useMemo(() => {
    if (!Array.isArray(directoryData)) return [];
    return directoryData
      .filter((p) => p && p.isAdjunct === true && p.isActive !== false)
      .sort((a, b) => {
        const nameA = (a.lastName || "").toLowerCase();
        const nameB = (b.lastName || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [directoryData]);

  // Build a map of instructorId -> courses for current semester
  const coursesByInstructorId = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(scheduleData)) return map;

    // Get unique sections (de-duplicate by _originalId since scheduleData is flattened by meeting patterns)
    const seenSections = new Set();
    scheduleData.forEach((schedule) => {
      const sectionId = schedule._originalId || schedule.id;
      if (seenSections.has(sectionId)) return;
      seenSections.add(sectionId);

      const instructorIds = Array.isArray(schedule.instructorIds)
        ? schedule.instructorIds
        : schedule.instructorId
          ? [schedule.instructorId]
          : [];

      instructorIds.forEach((instructorId) => {
        if (!instructorId) return;
        if (!map.has(instructorId)) {
          map.set(instructorId, []);
        }
        map.get(instructorId).push(schedule);
      });
    });

    return map;
  }, [scheduleData]);

  // Adjuncts with their courses for this semester
  const adjunctsWithCourses = useMemo(() => {
    return adjuncts.map((adjunct) => {
      const courses = coursesByInstructorId.get(adjunct.id) || [];
      return {
        ...adjunct,
        courses,
        courseCount: courses.length,
      };
    });
  }, [adjuncts, coursesByInstructorId]);

  // Filter by search text
  const filteredAdjuncts = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return adjunctsWithCourses;

    return adjunctsWithCourses.filter((a) => {
      const name = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
      const email = (a.email || "").toLowerCase();
      const baylorId = (a.baylorId || "").toLowerCase();
      return (
        name.includes(term) ||
        email.includes(term) ||
        baylorId.includes(term)
      );
    });
  }, [adjunctsWithCourses, searchText]);

  // Adjuncts with at least one course this semester
  const adjunctsWithCoursesThisTerm = useMemo(() => {
    return filteredAdjuncts.filter((a) => a.courseCount > 0);
  }, [filteredAdjuncts]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopy = useCallback(async (text, fieldKey) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  const toggleIgniteReveal = (id) => {
    setRevealedIgniteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startEditIgniteId = (adjunct) => {
    setEditingIgniteId(adjunct.id);
    setIgniteIdDraft(adjunct.ignitePersonNumber || "");
    setIgniteIdError("");
  };

  const cancelEditIgniteId = () => {
    setEditingIgniteId(null);
    setIgniteIdDraft("");
    setIgniteIdError("");
  };

  const validateIgniteId = (value) => {
    if (!value) return ""; // Allow empty to clear
    if (!/^\d+$/.test(value)) return "Ignite # must be numeric only";
    return "";
  };

  const saveIgniteId = async (adjunct) => {
    const validation = validateIgniteId(igniteIdDraft);
    if (validation) {
      setIgniteIdError(validation);
      return;
    }
    if (!canEditPeople) {
      showNotification?.(
        "warning",
        "Permission Denied",
        "You do not have permission to modify person records."
      );
      return;
    }

    try {
      await handleFacultyUpdate(
        {
          id: adjunct.id,
          ignitePersonNumber: igniteIdDraft.trim(),
        },
        adjunct
      );
      setEditingIgniteId(null);
      setIgniteIdDraft("");
      setIgniteIdError("");
      showNotification?.(
        "success",
        "Updated",
        `Ignite # updated for ${adjunct.firstName} ${adjunct.lastName}`
      );
    } catch (e) {
      setIgniteIdError(e?.message || "Failed to save");
    }
  };

  const CopyButton = ({ text, fieldKey, label }) => {
    const isCopied = copiedField === fieldKey;
    return (
      <button
        onClick={() => handleCopy(text, fieldKey)}
        className="p-1 text-gray-400 hover:text-baylor-green hover:bg-baylor-green/10 rounded transition-colors"
        title={`Copy ${label || "to clipboard"}`}
      >
        {isCopied ? (
          <Check size={14} className="text-green-600" />
        ) : (
          <Copy size={14} />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        {embedded ? (
          <h2 className="text-xl font-semibold text-gray-900">PAF Workflow</h2>
        ) : (
          <h1 className="text-2xl font-bold text-gray-900">PAF Workflow</h1>
        )}
        <p className="text-gray-600">
          Generate PAF data for adjunct faculty with copy-paste friendly output.
        </p>
      </div>

      <div className="university-card">
        <div className="university-card-header flex justify-between items-center">
          <div>
            <h2 className="university-card-title">Adjunct Faculty PAF Data</h2>
            <p className="text-sm text-gray-500 mt-1">
              {adjunctsWithCoursesThisTerm.length} adjunct
              {adjunctsWithCoursesThisTerm.length !== 1 ? "s" : ""} with courses
              this semester
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-baylor-green focus:border-baylor-green"
            >
              {availableSemesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <FileText className="h-6 w-6 text-baylor-green" />
            </div>
          </div>
        </div>

        <div className="university-card-content">
          <div className="mb-4">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search by name, email, or Baylor ID..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full md:w-80 pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
              />
            </div>
          </div>

          {adjunctsWithCoursesThisTerm.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No adjuncts with courses
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {filteredAdjuncts.length > 0
                  ? "No adjuncts match your search and have courses this semester."
                  : `No adjuncts have courses assigned for ${selectedSemester}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {adjunctsWithCoursesThisTerm.map((adjunct) => {
                const isExpanded = expandedIds.has(adjunct.id);
                const isIgniteRevealed = revealedIgniteIds.has(adjunct.id);
                const isEditingIgnite = editingIgniteId === adjunct.id;
                const fullName = `${adjunct.lastName || ""}, ${adjunct.firstName || ""}`.trim();

                return (
                  <div
                    key={adjunct.id}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    {/* Header row */}
                    <div
                      className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => toggleExpand(adjunct.id)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown size={18} className="text-gray-500" />
                        ) : (
                          <ChevronRight size={18} className="text-gray-500" />
                        )}
                        <div>
                          <div className="font-medium text-gray-900">
                            {fullName || "Unknown"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {adjunct.courseCount} course
                            {adjunct.courseCount !== 1 ? "s" : ""} this semester
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="p-4 border-t border-gray-200 bg-white space-y-4">
                        {/* Contact info */}
                        <div className="grid gap-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-24">Last Name:</span>
                            <span className="font-mono text-gray-800">
                              {adjunct.lastName || "-"}
                            </span>
                            {adjunct.lastName && (
                              <CopyButton
                                text={adjunct.lastName}
                                fieldKey={`lastname-${adjunct.id}`}
                                label="last name"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-24">First Name:</span>
                            <span className="font-mono text-gray-800">
                              {adjunct.firstName || "-"}
                            </span>
                            {adjunct.firstName && (
                              <CopyButton
                                text={adjunct.firstName}
                                fieldKey={`firstname-${adjunct.id}`}
                                label="first name"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-24">Email:</span>
                            <span className="font-mono text-gray-800">
                              {adjunct.email || "-"}
                            </span>
                            {adjunct.email && (
                              <CopyButton
                                text={adjunct.email}
                                fieldKey={`email-${adjunct.id}`}
                                label="email"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-24">Baylor ID:</span>
                            <span className="font-mono text-gray-800">
                              {adjunct.baylorId || "-"}
                            </span>
                            {adjunct.baylorId && (
                              <CopyButton
                                text={adjunct.baylorId}
                                fieldKey={`baylorid-${adjunct.id}`}
                                label="Baylor ID"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-24">Ignite #:</span>
                            {isEditingIgnite ? (
                              <div className="flex items-center gap-2">
                                <input
                                  value={igniteIdDraft}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, "");
                                    setIgniteIdDraft(v);
                                    if (igniteIdError) setIgniteIdError("");
                                  }}
                                  placeholder="Numeric ID"
                                  className={`w-32 px-2 py-1 border rounded text-sm font-mono ${
                                    igniteIdError
                                      ? "border-red-500"
                                      : "border-gray-300"
                                  }`}
                                  autoFocus
                                />
                                <button
                                  onClick={() => saveIgniteId(adjunct)}
                                  className="p-1 text-baylor-green hover:bg-baylor-green/10 rounded"
                                  title="Save"
                                >
                                  <Save size={14} />
                                </button>
                                <button
                                  onClick={cancelEditIgniteId}
                                  className="p-1 text-red-600 hover:bg-red-100 rounded"
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                                {igniteIdError && (
                                  <span className="text-xs text-red-600 flex items-center gap-1">
                                    <AlertCircle size={12} />
                                    {igniteIdError}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <>
                                {adjunct.ignitePersonNumber ? (
                                  isIgniteRevealed ? (
                                    <>
                                      <span className="font-mono text-gray-800">
                                        {adjunct.ignitePersonNumber}
                                      </span>
                                      <CopyButton
                                        text={adjunct.ignitePersonNumber}
                                        fieldKey={`ignite-${adjunct.id}`}
                                        label="Ignite #"
                                      />
                                      <button
                                        onClick={() => toggleIgniteReveal(adjunct.id)}
                                        className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                        title="Hide"
                                      >
                                        <EyeOff size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => toggleIgniteReveal(adjunct.id)}
                                      className="flex items-center gap-1 text-sm text-baylor-green hover:text-baylor-green/80"
                                    >
                                      <Eye size={14} />
                                      Click to reveal
                                    </button>
                                  )
                                ) : (
                                  <span className="text-gray-400 italic">
                                    Not set
                                  </span>
                                )}
                                {canEditPeople && (
                                  <button
                                    onClick={() => startEditIgniteId(adjunct)}
                                    className="p-1 text-gray-400 hover:text-baylor-green rounded"
                                    title="Edit Ignite #"
                                  >
                                    <Edit size={14} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Courses */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            Courses:
                          </h4>
                          <div className="space-y-1">
                            {adjunct.courses.map((course, idx) => {
                              const formattedCourse = formatCourseForPAF(course);
                              if (!formattedCourse) return null;
                              const displayLine = formattedCourse.displayLine;
                              return (
                                <div
                                  key={`${adjunct.id}-course-${idx}`}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <span className="font-mono text-gray-800 flex-1">
                                    {displayLine}
                                  </span>
                                  <CopyButton
                                    text={displayLine}
                                    fieldKey={`course-${adjunct.id}-${idx}`}
                                    label="course"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Costing info */}
                        <div className="border-t border-gray-200 pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            Costing:
                          </h4>
                          <div className="grid gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 w-24">Costing:</span>
                              <span className="font-mono text-gray-800">
                                {PAF_DEFAULTS.costing}
                              </span>
                              <CopyButton
                                text={PAF_DEFAULTS.costing}
                                fieldKey={`costing-${adjunct.id}`}
                                label="costing"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 w-24">FTE:</span>
                              <span className="font-mono text-gray-800">
                                {PAF_DEFAULTS.fte}
                              </span>
                              <CopyButton
                                text={PAF_DEFAULTS.fte}
                                fieldKey={`fte-${adjunct.id}`}
                                label="FTE"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 w-24">Pay:</span>
                              <span className="font-mono text-gray-800">
                                {PAF_DEFAULTS.pay}
                              </span>
                              <CopyButton
                                text={PAF_DEFAULTS.pay}
                                fieldKey={`pay-${adjunct.id}`}
                                label="pay"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 w-24">Monthly Pay:</span>
                              <span className="font-mono text-gray-800">
                                {PAF_DEFAULTS.monthlyPay}
                              </span>
                              <CopyButton
                                text={PAF_DEFAULTS.monthlyPay}
                                fieldKey={`monthlypay-${adjunct.id}`}
                                label="monthly pay"
                              />
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PAFWorkflow;
