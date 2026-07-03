import { useState, useMemo, useEffect } from "react";
import { Users, Edit, Save, X, Plus, Search, GripVertical, UserCog, Building2, ChevronDown, ChevronUp, ArrowRightLeft, Trash2, GraduationCap, Star, Move, Eye } from "lucide-react";
import FacultyContactCard from "../FacultyContactCard";
import Modal from "../shared/Modal";
import ConfirmDialog from "../shared/ConfirmDialog";
import DirectorRoleBadge from "../shared/DirectorRoleBadge";
import { doc, deleteDoc } from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase";
import { logDelete } from "../../utils/changeLogger";
import { usePermissions } from "../../utils/permissions";
import {
  getProgramNameKey,
  isReservedProgramName,
  normalizeProgramName,
} from "../../utils/programUtils";
import {
  DIRECTOR_ROLE_META,
  DIRECTOR_ROLE_ORDER,
  getDirectorRoleAbbreviation,
  getProgramDirectors,
  hasDirector,
} from "../../utils/directorAssignments";
import { useData } from "../../contexts/DataContext";
import { usePeople } from "../../contexts/PeopleContext";
import { usePeopleOperations } from "../../hooks";
import { useUI } from "../../contexts/UIContext";

import SelectDropdown from "../SelectDropdown";
const ProgramManagement = ({ embedded = false }) => {
  const { facultyData = [], programs = [], rawPeople = [], loadPrograms } = useData();
  const { loadPeople } = usePeople();
  const {
    handleProgramCreate,
    handleProgramUpdate,
    handleFacultyUpdate,
    handleDirectorAssignmentChange,
  } = usePeopleOperations();
  const { showNotification } = useUI();
  const { canEdit } = usePermissions();
  const canEditHere = canEdit("people/programs");

  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [managingDirectorsFor, setManagingDirectorsFor] = useState(null);
  const [extraDirectorCandidates, setExtraDirectorCandidates] = useState({});
  const [searchText, setSearchText] = useState("");
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [newProgramName, setNewProgramName] = useState("");
  const [newProgramCode, setNewProgramCode] = useState("");
  const [isCreatingProgram, setIsCreatingProgram] = useState(false);
  const [draggedFaculty, setDraggedFaculty] = useState(null);
  const [dragOverProgram, setDragOverProgram] = useState(null);
  const [showAdjuncts, setShowAdjuncts] = useState(false);
  const [expandedPrograms, setExpandedPrograms] = useState(new Set());
  const [editingProgramName, setEditingProgramName] = useState(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [editingProgramCode, setEditingProgramCode] = useState(null);
  const [editCodeValue, setEditCodeValue] = useState("");
  const [isUpdatingCode, setIsUpdatingCode] = useState(false);
  const [selectedProgramFilter, setSelectedProgramFilter] = useState("all");
  const [programToDelete, setProgramToDelete] = useState(null);
  const [isDeletingProgram, setIsDeletingProgram] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    loadPeople();
    loadPrograms();
  }, [loadPeople, loadPrograms]);

  const peopleById = useMemo(
    () => new Map((rawPeople || []).map((person) => [person.id, person])),
    [rawPeople],
  );

  // Organize faculty by program using the reliable program data. Director
  // assignments come straight from the canonical programs/{id}.directors
  // relationship — never from person-side flags.
  const programData = useMemo(() => {
    if (!facultyData || !Array.isArray(facultyData)) return {};

    const programGroups = {};

    // Initialize with all programs from the database
    programs.forEach((p) => {
      programGroups[p.name] = {
        name: p.name,
        faculty: [],
        directors: getProgramDirectors(p),
        programId: p.id,
        rawProgram: p,
      };
    });

    // Add an 'Unassigned' group for faculty without a program
    if (!programGroups["Unassigned"]) {
      programGroups["Unassigned"] = {
        name: "Unassigned",
        faculty: [],
        directors: [],
        programId: null,
        rawProgram: null,
      };
    }

    // Filter out adjuncts if the toggle is off
    const facultyToProcess = showAdjuncts
      ? facultyData
      : facultyData.filter((f) => !f.isAdjunct);

    facultyToProcess.forEach((faculty) => {
      let programName = "Unassigned";

      if (faculty.programId) {
        const program = programs.find((p) => p.id === faculty.programId);
        if (program) {
          programName = program.name;
        }
      }

      if (!programGroups[programName]) {
        programGroups[programName] = {
          name: programName,
          faculty: [],
          directors: [],
          programId: faculty.programId,
          rawProgram: null,
        };
      }

      programGroups[programName].faculty.push(faculty);
    });

    return programGroups;
  }, [facultyData, showAdjuncts, programs]);

  // Separate unassigned from regular programs
  const { regularPrograms, unassignedProgram } = useMemo(() => {
    const allPrograms = Object.keys(programData).sort();
    const unassigned = allPrograms.find((p) => p === "Unassigned");
    const regular = allPrograms.filter((p) => p !== "Unassigned");

    return {
      regularPrograms: regular,
      unassignedProgram: unassigned ? programData[unassigned] : null,
    };
  }, [programData]);

  // Filter programs based on search
  const filteredPrograms = useMemo(() => {
    let programList = [...regularPrograms];

    if (
      selectedProgramFilter !== "all" &&
      selectedProgramFilter !== "Unassigned"
    ) {
      programList = programList.filter((p) => p === selectedProgramFilter);
    }

    if (searchText) {
      const searchLower = searchText.toLowerCase();
      programList = programList.filter((programName) => {
        const program = programData[programName];
        // Search in program name
        if (programName.toLowerCase().includes(searchLower)) return true;
        // Search in faculty names
        return program.faculty.some(
          (f) =>
            f.name?.toLowerCase().includes(searchLower) ||
            f.email?.toLowerCase().includes(searchLower) ||
            f.jobTitle?.toLowerCase().includes(searchLower),
        );
      });
    }

    return programList;
  }, [programData, searchText, selectedProgramFilter, regularPrograms]);

  // Check if unassigned should be shown based on filters
  const shouldShowUnassigned = useMemo(() => {
    if (!unassignedProgram) return false;
    if (
      selectedProgramFilter !== "all" &&
      selectedProgramFilter !== "Unassigned"
    )
      return false;

    if (searchText) {
      const searchLower = searchText.toLowerCase();
      return unassignedProgram.faculty.some(
        (f) =>
          f.name?.toLowerCase().includes(searchLower) ||
          f.email?.toLowerCase().includes(searchLower) ||
          f.jobTitle?.toLowerCase().includes(searchLower),
      );
    }

    return true;
  }, [unassignedProgram, selectedProgramFilter, searchText]);

  // Toggle a director role (UPD/GPD) for a person on a program. All
  // validation and the single-document write live in usePeopleOperations.
  const handleToggleDirector = async (program, person, role) => {
    if (!program?.programId || !person?.id) return;
    const assign = !hasDirector(program.rawProgram?.directors, person.id, role);
    await handleDirectorAssignmentChange({
      programId: program.programId,
      personId: person.id,
      role,
      assign,
    });
  };

  // Resolve a director entry to a person record for display. Directors can
  // belong to other programs (or be inactive), so resolve against all people.
  const resolveDirectorPerson = (personId) => {
    const person = peopleById.get(personId);
    if (person) {
      return {
        id: person.id,
        name:
          person.name ||
          `${person.firstName || ""} ${person.lastName || ""}`.trim() ||
          person.email ||
          personId,
        jobTitle: person.jobTitle || "",
        isAdjunct: person.isAdjunct === true,
      };
    }
    return { id: personId, name: "Unknown person", jobTitle: "", missing: true };
  };

  // Candidates offered in the manage view: the program's own non-adjunct
  // faculty, anyone currently holding a role, plus any faculty explicitly
  // added via the cross-program picker.
  const getDirectorCandidates = (program) => {
    const candidates = new Map();
    program.faculty
      .filter((f) => !f.isAdjunct)
      .forEach((f) => candidates.set(f.id, f));
    program.directors.forEach(({ personId }) => {
      if (!candidates.has(personId)) {
        candidates.set(personId, resolveDirectorPerson(personId));
      }
    });
    (extraDirectorCandidates[program.programId] || []).forEach((personId) => {
      if (!candidates.has(personId)) {
        candidates.set(personId, resolveDirectorPerson(personId));
      }
    });
    return Array.from(candidates.values());
  };

  const addExtraDirectorCandidate = (program, personId) => {
    if (!personId) return;
    setExtraDirectorCandidates((prev) => {
      const current = prev[program.programId] || [];
      if (current.includes(personId)) return prev;
      return { ...prev, [program.programId]: [...current, personId] };
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e, faculty) => {
    if (!faculty || !faculty.id) {
      e.preventDefault();
      return;
    }
    setDraggedFaculty(faculty);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", faculty.id);
  };

  const handleDragOver = (e, programName) => {
    e.preventDefault();
    if (draggedFaculty && programName) {
      setDragOverProgram(programName);
    }
  };

  const handleDragLeave = () => {
    setDragOverProgram(null);
  };

  const handleDrop = async (e, targetProgramName) => {
    e.preventDefault();
    setDragOverProgram(null);

    if (!draggedFaculty || !targetProgramName) {
      setDraggedFaculty(null);
      return;
    }

    const currentProgram = Object.keys(programData).find((prog) =>
      programData[prog].faculty.some((f) => f.id === draggedFaculty.id),
    );

    if (currentProgram === targetProgramName) {
      setDraggedFaculty(null);
      return;
    }

    try {
      const targetProgram = programData[targetProgramName];
      if (!targetProgram || !targetProgram.programId) {
        showNotification(
          "error",
          "Program Error",
          "Cannot find target program information.",
        );
        setDraggedFaculty(null);
        return;
      }

      const updateData = {
        ...draggedFaculty,
        programId: targetProgram.programId,
        updatedAt: new Date().toISOString(),
      };

      await handleFacultyUpdate(updateData);

      showNotification(
        "success",
        "Faculty Moved",
        `${draggedFaculty.name} moved to ${targetProgramName} program`,
      );
    } catch (error) {
      console.error("Error moving faculty:", error);
      showNotification(
        "error",
        "Error",
        "Failed to move faculty member. Please try again.",
      );
    }

    setDraggedFaculty(null);
  };

  // Toggle program card expansion
  const toggleProgramExpansion = (programName) => {
    const newExpanded = new Set(expandedPrograms);
    if (newExpanded.has(programName)) {
      newExpanded.delete(programName);
    } else {
      newExpanded.add(programName);
    }
    setExpandedPrograms(newExpanded);
  };

  // Start editing program name
  const startEditingProgramName = (program) => {
    if (!canEditHere) {
      showNotification(
        "warning",
        "Permission Denied",
        "You do not have permission to edit program names.",
      );
      return;
    }
    setEditingProgramName(program.name);
    setEditNameValue(program.name);
  };

  // Save edited program name
  const saveProgramName = async (program) => {
    if (!editNameValue.trim() || editNameValue.trim() === program.name) {
      setEditingProgramName(null);
      setEditNameValue("");
      return;
    }

    setIsUpdatingName(true);
    const result = await handleProgramUpdate(
      program.rawProgram || { id: program.programId, name: program.name },
      editNameValue.trim(),
    );
    setIsUpdatingName(false);

    if (result) {
      setEditingProgramName(null);
      setEditNameValue("");
    }
  };

  const startEditingProgramCode = (program) => {
    if (!canEditHere) {
      showNotification(
        "warning",
        "Permission Denied",
        "You do not have permission to edit program codes.",
      );
      return;
    }

    setEditingProgramCode(program.programId || program.name);
    setEditCodeValue(String(program.rawProgram?.code || ""));
  };

  const saveProgramCode = async (program) => {
    const currentCode = String(program.rawProgram?.code || "")
      .trim()
      .toUpperCase();
    const nextCode = (editCodeValue || "").trim().toUpperCase();

    if (nextCode === currentCode) {
      setEditingProgramCode(null);
      setEditCodeValue("");
      return;
    }

    setIsUpdatingCode(true);
    const result = await handleProgramUpdate(
      program.rawProgram || { id: program.programId, name: program.name },
      program.name,
      nextCode,
    );
    setIsUpdatingCode(false);

    if (result) {
      setEditingProgramCode(null);
      setEditCodeValue("");
    }
  };

  const cancelEditingProgramCode = () => {
    setEditingProgramCode(null);
    setEditCodeValue("");
  };

  // Cancel editing program name
  const cancelEditingProgramName = () => {
    setEditingProgramName(null);
    setEditNameValue("");
  };

  // Create new program
  const createNewProgram = async () => {
    if (!canEditHere) {
      showNotification(
        "warning",
        "Permission Denied",
        "You do not have permission to create programs.",
      );
      return;
    }

    const programName = normalizeProgramName(newProgramName);

    if (!programName) {
      showNotification("error", "Invalid Name", "Program name cannot be empty");
      return;
    }

    if (isReservedProgramName(programName)) {
      showNotification(
        "error",
        "Invalid Name",
        '"Unassigned" is reserved for faculty without a program',
      );
      return;
    }

    const programKey = getProgramNameKey(programName);
    const duplicate = programs.find(
      (p) => getProgramNameKey(p.name) === programKey,
    );
    if (duplicate) {
      showNotification(
        "error",
        "Program Exists",
        "A program with this name already exists",
      );
      return;
    }

    setIsCreatingProgram(true);
    try {
      const created = await handleProgramCreate({
        name: programName,
        code: newProgramCode,
      });
      if (created) {
        setNewProgramName("");
        setNewProgramCode("");
        setShowCreateProgram(false);
      }
    } catch (error) {
      console.error("Error creating program:", error);
      showNotification(
        "error",
        "Error",
        "Failed to create program. Please try again.",
      );
    } finally {
      setIsCreatingProgram(false);
    }
  };

  // Delete program
  const deleteProgram = async () => {
    if (!programToDelete || !canEditHere) return;

    const program = programData[programToDelete];
    if (!program) return;

    // Check if program has faculty
    if (program.faculty.length > 0) {
      showNotification(
        "error",
        "Cannot Delete",
        "Cannot delete a program that has faculty members. Please reassign all faculty first.",
      );
      setProgramToDelete(null);
      return;
    }

    setIsDeletingProgram(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS.PROGRAMS, program.programId));

      await logDelete(
        `Program - ${program.name}`,
        COLLECTIONS.PROGRAMS,
        program.programId,
        program.rawProgram,
        "ProgramManagement.jsx - deleteProgram",
      );

      await loadPrograms();
      showNotification(
        "success",
        "Program Deleted",
        `${program.name} has been deleted successfully.`,
      );
    } catch (error) {
      console.error("Error deleting program:", error);
      showNotification(
        "error",
        "Error",
        "Failed to delete program. Please try again.",
      );
    } finally {
      setIsDeletingProgram(false);
      setProgramToDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              {embedded ? (
                <h2 className="text-xl font-semibold text-gray-900">
                  Programs & Directors
                </h2>
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">
                  Programs & Directors
                </h1>
              )}
              <p className="text-sm text-gray-500 mt-1">
                Manage programs, assign UPDs and GPDs, and organize faculty
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Edit Mode Toggle */}
              {canEditHere && (
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    isEditMode
                      ? "bg-amber-100 text-amber-800 border-2 border-amber-300"
                      : "bg-white text-gray-700 border-2 border-gray-300 hover:border-[#154734] hover:text-[#154734]"
                  }`}
                  title={
                    isEditMode
                      ? "Exit edit mode"
                      : "Enter edit mode to reorganize faculty"
                  }
                >
                  {isEditMode ? (
                    <>
                      <Eye size={18} />
                      <span className="hidden sm:inline">View Mode</span>
                      <span className="sm:hidden">Done</span>
                    </>
                  ) : (
                    <>
                      <Move size={18} />
                      <span className="hidden sm:inline">Edit Mode</span>
                      <span className="sm:hidden">Edit</span>
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => {
                  if (!canEditHere) {
                    showNotification(
                      "warning",
                      "Permission Denied",
                      "You do not have permission to create programs.",
                    );
                    return;
                  }
                  setShowCreateProgram(true);
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  canEditHere
                    ? "bg-[#154734] text-white hover:bg-[#0f3526] shadow-sm hover:shadow"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
                disabled={!canEditHere}
              >
                <Plus size={18} />
                Add Program
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Mode Banner */}
      {isEditMode && canEditHere && (
        <div className="bg-amber-50 border-b-2 border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <Move size={16} className="text-amber-700" />
                </div>
                <div>
                  <p className="font-medium text-amber-900">Edit Mode Active</p>
                  <p className="text-sm text-amber-700">
                    Drag and drop faculty members between programs to reorganize
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditMode(false)}
                className="px-4 py-2 bg-white text-amber-800 border border-amber-300 rounded-lg font-medium hover:bg-amber-100 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search programs or faculty..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#154734] focus:border-transparent transition-all"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <SelectDropdown
                value={selectedProgramFilter}
                onChange={(e) => setSelectedProgramFilter(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#154734] focus:border-transparent bg-white text-sm"
              >
                <option value="all">All Programs</option>
                {regularPrograms.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
                {unassignedProgram && unassignedProgram.faculty.length > 0 && (
                  <option value="Unassigned">Unassigned</option>
                )}
              </SelectDropdown>

              <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-300 rounded-lg bg-white cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={showAdjuncts}
                  onChange={(e) => setShowAdjuncts(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#154734] focus:ring-[#154734]"
                />
                <span className="text-sm text-gray-700">Show Adjuncts</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Programs Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {filteredPrograms.length === 0 && !shouldShowUnassigned ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Building2 className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {searchText ? "No programs match your search" : "No programs yet"}
            </h3>
            <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
              {searchText
                ? "Try adjusting your search terms or filters to find what you're looking for."
                : "Get started by creating your first program to organize your faculty."}
            </p>
            {!searchText && canEditHere && (
              <button
                onClick={() => setShowCreateProgram(true)}
                className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[#154734] text-white rounded-lg font-medium hover:bg-[#0f3526] transition-colors"
              >
                <Plus size={18} />
                Create First Program
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredPrograms.map((programName) => {
              const program = programData[programName];
              const isDragOver = dragOverProgram === programName;
              const isExpanded = expandedPrograms.has(programName);
              const isEditingName = editingProgramName === programName;
              const isEditingCode =
                editingProgramCode === (program.programId || program.name);
              const facultyCount = program.faculty.length;
              const displayFaculty = isExpanded
                ? program.faculty
                : program.faculty.slice(0, 4);
              const programCode = String(program.rawProgram?.code || "")
                .trim()
                .toUpperCase();

              return (
                <div
                  key={programName}
                  className={`bg-white rounded-xl border-2 transition-all duration-200 relative ${
                    isDragOver
                      ? "border-[#154734] bg-[#154734]/5 shadow-lg scale-[1.02]"
                      : "border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md"
                  }`}
                  onDragOver={(e) => handleDragOver(e, programName)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, programName)}
                >
                  {/* Card Header */}
                  <div className="p-5 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 group">
                        {isEditingName ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              className="flex-1 px-2 py-1 text-lg font-semibold border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#154734]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveProgramName(program);
                                if (e.key === "Escape")
                                  cancelEditingProgramName();
                              }}
                            />
                            <button
                              onClick={() => saveProgramName(program)}
                              disabled={isUpdatingName}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={cancelEditingProgramName}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-900 truncate">
                              {programName}
                            </h3>
                            {canEditHere && (
                              <button
                                onClick={() => startEditingProgramName(program)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-[#154734]"
                                title="Edit program name"
                              >
                                <Edit size={14} />
                              </button>
                            )}
                          </div>
                        )}

                        <div className="mt-2">
                          {isEditingCode ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400 uppercase tracking-wide">
                                Code
                              </span>
                              <input
                                type="text"
                                value={editCodeValue}
                                onChange={(e) => setEditCodeValue(e.target.value)}
                                className="w-24 px-2 py-1 text-xs font-mono uppercase border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#154734]"
                                maxLength={12}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveProgramCode(program);
                                  if (e.key === "Escape")
                                    cancelEditingProgramCode();
                                }}
                              />
                              <button
                                onClick={() => saveProgramCode(program)}
                                disabled={isUpdatingCode}
                                className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                                title="Save program code"
                              >
                                <Save size={14} />
                              </button>
                              <button
                                onClick={cancelEditingProgramCode}
                                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Cancel editing program code"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400 uppercase tracking-wide">
                                Code
                              </span>
                              <code className="text-xs text-gray-500">
                                {programCode || "None"}
                              </code>
                              {canEditHere && (
                                <button
                                  onClick={() => startEditingProgramCode(program)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-[#154734]"
                                  title="Edit program code"
                                >
                                  <Edit size={12} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FFB81C]/20 text-[#154734]">
                            <Users size={12} className="mr-1" />
                            {facultyCount} faculty
                          </span>
                          {DIRECTOR_ROLE_ORDER.map((role) => {
                            const count = program.directors.filter(
                              (entry) => entry.role === role,
                            ).length;
                            if (count === 0) return null;
                            return (
                              <span
                                key={role}
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  role === "upd"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800"
                                }`}
                              >
                                <Star size={12} className="mr-1" />
                                {count} {getDirectorRoleAbbreviation(role)}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Actions Menu */}
                      {canEditHere && (
                        <div className="relative">
                          <button
                            onClick={() =>
                              setProgramToDelete(
                                programToDelete === programName
                                  ? null
                                  : programName,
                              )
                            }
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete program"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Directors Section */}
                  <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <UserCog size={16} className="text-amber-600" />
                        Program Directors
                      </div>
                      {canEditHere && program.programId && (
                        <button
                          onClick={() =>
                            setManagingDirectorsFor(
                              managingDirectorsFor === programName
                                ? null
                                : programName,
                            )
                          }
                          className="text-xs text-[#154734] hover:text-[#0f3526] font-medium transition-colors"
                        >
                          {managingDirectorsFor === programName
                            ? "Done"
                            : "Manage"}
                        </button>
                      )}
                    </div>

                    {managingDirectorsFor === programName ? (
                      <div className="space-y-2">
                        <div className="space-y-2 max-h-52 overflow-y-auto">
                          {getDirectorCandidates(program).map((person) => (
                            <div
                              key={person.id}
                              className="flex items-center justify-between gap-3 p-2.5 bg-white rounded-lg border border-gray-200"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-gray-900 truncate">
                                  {person.name}
                                </div>
                                <div className="text-gray-500 text-xs truncate">
                                  {person.jobTitle}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {DIRECTOR_ROLE_ORDER.map((role) => {
                                  const assigned = hasDirector(
                                    program.rawProgram?.directors,
                                    person.id,
                                    role,
                                  );
                                  const abbreviation =
                                    getDirectorRoleAbbreviation(role);
                                  return (
                                    <button
                                      key={role}
                                      onClick={() =>
                                        handleToggleDirector(
                                          program,
                                          person,
                                          role,
                                        )
                                      }
                                      title={`${assigned ? "Remove" : "Assign"} ${DIRECTOR_ROLE_META[role].label}`}
                                      className={`px-2 py-1 rounded-md border text-xs font-medium transition-colors ${
                                        assigned
                                          ? role === "upd"
                                            ? "bg-amber-100 text-amber-800 border-amber-300"
                                            : "bg-sky-100 text-sky-800 border-sky-300"
                                          : "bg-white text-gray-400 border-gray-200 hover:text-gray-700 hover:border-gray-300"
                                      }`}
                                    >
                                      {abbreviation}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          {getDirectorCandidates(program).length === 0 && (
                            <div className="text-sm text-gray-500 italic p-2">
                              No eligible faculty members (adjuncts cannot hold
                              director roles)
                            </div>
                          )}
                        </div>
                        <SelectDropdown
                          value=""
                          onChange={(e) =>
                            addExtraDirectorCandidate(program, e.target.value)
                          }
                          className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 bg-white"
                        >
                          <option value="">
                            Add faculty from another program…
                          </option>
                          {facultyData
                            .filter(
                              (f) =>
                                !f.isAdjunct &&
                                !getDirectorCandidates(program).some(
                                  (candidate) => candidate.id === f.id,
                                ),
                            )
                            .sort((a, b) =>
                              (a.name || "").localeCompare(b.name || ""),
                            )
                            .map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                        </SelectDropdown>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {program.directors.length === 0 ? (
                          <div className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-dashed border-gray-300">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <UserCog size={14} className="text-gray-400" />
                            </div>
                            <div className="text-sm text-gray-500">
                              No program directors assigned
                            </div>
                          </div>
                        ) : (
                          DIRECTOR_ROLE_ORDER.map((role) => {
                            const roleDirectors = program.directors.filter(
                              (entry) => entry.role === role,
                            );
                            return (
                              <div key={role}>
                                <div className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1.5">
                                  {DIRECTOR_ROLE_META[role].groupLabel}
                                </div>
                                {roleDirectors.length === 0 ? (
                                  <div className="text-xs text-gray-400 italic px-1">
                                    None assigned
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {roleDirectors.map(({ personId }) => {
                                      const person =
                                        resolveDirectorPerson(personId);
                                      return (
                                        <div
                                          key={`${personId}-${role}`}
                                          className={`flex items-center gap-3 p-2.5 bg-white rounded-lg border ${
                                            role === "upd"
                                              ? "border-amber-200"
                                              : "border-sky-200"
                                          }`}
                                        >
                                          <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                              role === "upd"
                                                ? "bg-amber-100"
                                                : "bg-sky-100"
                                            }`}
                                          >
                                            <Star
                                              size={14}
                                              className={
                                                role === "upd"
                                                  ? "text-amber-700"
                                                  : "text-sky-700"
                                              }
                                            />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm text-gray-900 truncate">
                                              {person.name}
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">
                                              {person.jobTitle}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Faculty List */}
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">
                        Faculty Members
                      </span>
                      <span className="text-xs text-gray-500">
                        {facultyCount} total
                      </span>
                    </div>

                    {facultyCount === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <GraduationCap className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                        <p className="text-sm text-gray-500">
                          No faculty assigned
                        </p>
                        {isEditMode && (
                          <p className="text-xs text-amber-600 mt-1">
                            Drag faculty here to assign them
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div
                          className={`space-y-2 ${isEditMode ? "p-2 bg-amber-50/50 rounded-lg border-2 border-dashed border-amber-200" : ""}`}
                        >
                          {displayFaculty.map((faculty) => (
                            <div
                              key={faculty.id}
                              draggable={isEditMode && canEditHere}
                              onDragStart={(e) => handleDragStart(e, faculty)}
                              className={`group flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                isEditMode && canEditHere
                                  ? "cursor-move bg-white border-gray-300 shadow-sm hover:border-[#154734] hover:shadow-md"
                                  : "bg-white border-gray-200 hover:border-gray-300"
                              } ${draggedFaculty?.id === faculty.id ? "opacity-50" : ""}`}
                            >
                              {/* Drag Handle - only visible in edit mode */}
                              {isEditMode && canEditHere ? (
                                <div className="flex-shrink-0 w-6 h-6 rounded bg-gray-100 flex items-center justify-center">
                                  <GripVertical
                                    size={14}
                                    className="text-gray-500"
                                  />
                                </div>
                              ) : (
                                /* View-only indicator */
                                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-gray-300" />
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-gray-900 truncate">
                                    {faculty.name}
                                  </span>
                                  {program.directors
                                    .filter(
                                      (entry) => entry.personId === faculty.id,
                                    )
                                    .map((entry) => (
                                      <DirectorRoleBadge
                                        key={entry.role}
                                        role={entry.role}
                                        programName={programName}
                                      />
                                    ))}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {faculty.jobTitle}
                                  {faculty.isAdjunct && (
                                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                                      Adjunct
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* View details button - always visible */}
                              <button
                                onClick={() =>
                                  setSelectedFacultyForCard(faculty)
                                }
                                className="p-1.5 text-gray-400 hover:text-[#154734] hover:bg-[#154734]/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                title="View details"
                              >
                                <Users size={14} />
                              </button>
                            </div>
                          ))}
                        </div>

                        {facultyCount > 4 && (
                          <button
                            onClick={() => toggleProgramExpansion(programName)}
                            className="mt-3 w-full py-2 text-sm text-[#154734] hover:text-[#0f3526] font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp size={16} />
                                Show Less
                              </>
                            ) : (
                              <>
                                <ChevronDown size={16} />
                                Show {facultyCount - 4} More
                              </>
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Drag Overlay Hint */}
                  {isDragOver && (
                    <div className="absolute inset-0 bg-[#154734]/10 border-2 border-[#154734] border-dashed rounded-xl flex items-center justify-center pointer-events-none">
                      <div className="bg-white px-4 py-2 rounded-lg shadow-lg text-[#154734] font-medium">
                        <ArrowRightLeft size={16} className="inline mr-2" />
                        Drop to move faculty here
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unassigned Section */}
      {shouldShowUnassigned && unassignedProgram && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="border-t-2 border-dashed border-gray-300 pt-8 mt-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                <Users size={20} className="text-gray-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-700">
                  Unassigned Faculty
                </h2>
                <p className="text-sm text-gray-500">
                  Faculty members not currently assigned to any program
                </p>
              </div>
              <span className="ml-auto inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-700">
                {unassignedProgram.faculty.length} faculty
              </span>
            </div>

            <div
              className={`rounded-xl border-2 border-dashed p-6 transition-all duration-200 relative ${
                isEditMode
                  ? "bg-amber-50/50 border-amber-300"
                  : "bg-gray-100/50 border-gray-300"
              } ${
                dragOverProgram === "Unassigned"
                  ? "border-[#154734] bg-[#154734]/5"
                  : ""
              }`}
              onDragOver={(e) => handleDragOver(e, "Unassigned")}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, "Unassigned")}
            >
              {unassignedProgram.faculty.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">
                    All faculty members are assigned to programs
                  </p>
                  {isEditMode && (
                    <p className="text-sm text-amber-600 mt-1">
                      Drag faculty here to unassign them
                    </p>
                  )}
                </div>
              ) : (
                <div
                  className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 ${isEditMode ? "p-3 bg-amber-100/30 rounded-lg" : ""}`}
                >
                  {unassignedProgram.faculty.map((faculty) => (
                    <div
                      key={faculty.id}
                      draggable={isEditMode && canEditHere}
                      onDragStart={(e) => handleDragStart(e, faculty)}
                      className={`group bg-white rounded-lg border p-4 transition-all ${
                        isEditMode && canEditHere
                          ? "cursor-move border-gray-300 shadow-sm hover:border-[#154734] hover:shadow-md"
                          : "border-gray-200 hover:border-gray-300"
                      } ${draggedFaculty?.id === faculty.id ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Drag Handle - only visible in edit mode */}
                        {isEditMode && canEditHere ? (
                          <div className="flex-shrink-0 w-6 h-6 rounded bg-gray-100 flex items-center justify-center mt-0.5">
                            <GripVertical size={14} className="text-gray-500" />
                          </div>
                        ) : (
                          /* View-only indicator */
                          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-gray-300 mt-2" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900">
                            {faculty.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {faculty.jobTitle}
                          </div>
                          {faculty.isAdjunct && (
                            <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                              Adjunct
                            </span>
                          )}
                        </div>
                        {/* View details button - always visible */}
                        <button
                          onClick={() => setSelectedFacultyForCard(faculty)}
                          className="p-1.5 text-gray-400 hover:text-[#154734] hover:bg-[#154734]/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title="View details"
                        >
                          <Users size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Drag Overlay for Unassigned */}
              {dragOverProgram === "Unassigned" && (
                <div className="absolute inset-0 bg-[#154734]/10 border-2 border-[#154734] border-dashed rounded-xl flex items-center justify-center pointer-events-none">
                  <div className="bg-white px-4 py-2 rounded-lg shadow-lg text-[#154734] font-medium">
                    <ArrowRightLeft size={16} className="inline mr-2" />
                    Drop to unassign from current program
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Program Modal */}
      <Modal
        isOpen={showCreateProgram}
        onClose={() => setShowCreateProgram(false)}
        size="sm"
        title="Create New Program"
        footer={
          <>
            <button
              onClick={() => setShowCreateProgram(false)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createNewProgram}
              disabled={!newProgramName.trim() || isCreatingProgram}
              className="px-4 py-2 bg-baylor-green text-white rounded-lg font-medium hover:bg-baylor-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreatingProgram ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={18} />
                  Create Program
                </>
              )}
            </button>
          </>
        }
      >
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Program Name
        </label>
        <input
          type="text"
          value={newProgramName}
          onChange={(e) => setNewProgramName(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-baylor-green focus:border-transparent"
          placeholder="Enter program name..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") createNewProgram();
          }}
        />
        <p className="mt-2 text-xs text-gray-500">
          Program names must be unique and cannot be "Unassigned".
        </p>

        <label className="block text-sm font-medium text-gray-700 mt-4 mb-2">
          Program Code (optional)
        </label>
        <input
          type="text"
          value={newProgramCode}
          onChange={(e) => setNewProgramCode(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-baylor-green focus:border-transparent font-mono uppercase"
          placeholder="Example: ADM"
          maxLength={12}
          onKeyDown={(e) => {
            if (e.key === "Enter") createNewProgram();
          }}
        />
        <p className="mt-2 text-xs text-gray-500">
          Rarely used, but available for exports and filters.
        </p>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!programToDelete}
        title="Delete Program"
        message={
          <>
            Are you sure you want to delete <strong>{programToDelete}</strong>?
            <span className="mt-2 block text-sm text-gray-500">
              This action cannot be undone. Programs with faculty members cannot
              be deleted.
            </span>
          </>
        }
        confirmText={isDeletingProgram ? "Deleting..." : "Delete Program"}
        confirmDisabled={isDeletingProgram}
        variant="danger"
        icon={Trash2}
        onConfirm={deleteProgram}
        onCancel={() => setProgramToDelete(null)}
      />

      {/* Faculty Contact Card Modal */}
      {selectedFacultyForCard && (
        <FacultyContactCard
          person={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
          onUpdate={handleFacultyUpdate}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default ProgramManagement;
