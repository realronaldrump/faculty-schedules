import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Users,
  Edit,
  Save,
  X,
  Plus,
  Search,
  GripVertical,
  MoreVertical,
  UserCog,
  Building2,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft,
  Trash2,
  GraduationCap,
  Star,
  Move,
  Eye,
} from "lucide-react";
import FacultyContactCard from "../FacultyContactCard";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db, COLLECTIONS } from "../../firebase";
import { logUpdate, logDelete } from "../../utils/changeLogger";
import { usePermissions } from "../../utils/permissions";
import {
  getProgramNameKey,
  isReservedProgramName,
  normalizeProgramName,
} from "../../utils/programUtils";
import { useData } from "../../contexts/DataContext";
import { usePeople } from "../../contexts/PeopleContext";
import { usePeopleOperations } from "../../hooks";
import { useUI } from "../../contexts/UIContext";

const ProgramManagement = ({ embedded = false }) => {
  const { facultyData = [], programs = [], loadPrograms } = useData();
  const { loadPeople } = usePeople();
  const { handleProgramCreate, handleProgramUpdate, handleFacultyUpdate } =
    usePeopleOperations();
  const { showNotification } = useUI();
  const { canEdit } = usePermissions();
  const canEditHere = canEdit("people/programs");

  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [editingUPD, setEditingUPD] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [newProgramName, setNewProgramName] = useState("");
  const [isCreatingProgram, setIsCreatingProgram] = useState(false);
  const [draggedFaculty, setDraggedFaculty] = useState(null);
  const [dragOverProgram, setDragOverProgram] = useState(null);
  const [showAdjuncts, setShowAdjuncts] = useState(false);
  const [expandedPrograms, setExpandedPrograms] = useState(new Set());
  const [editingProgramName, setEditingProgramName] = useState(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [selectedProgramFilter, setSelectedProgramFilter] = useState("all");
  const [programToDelete, setProgramToDelete] = useState(null);
  const [isDeletingProgram, setIsDeletingProgram] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    loadPeople();
    loadPrograms();
  }, [loadPeople, loadPrograms]);

  // Organize faculty by program using the reliable program data
  const programData = useMemo(() => {
    if (!facultyData || !Array.isArray(facultyData)) return {};

    const programGroups = {};

    // Initialize with all programs from the database
    programs.forEach((p) => {
      programGroups[p.name] = {
        name: p.name,
        faculty: [],
        upds: [],
        programId: p.id,
        rawProgram: p,
      };
    });

    // Add an 'Unassigned' group for faculty without a program
    if (!programGroups["Unassigned"]) {
      programGroups["Unassigned"] = {
        name: "Unassigned",
        faculty: [],
        upds: [],
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
          upds: [],
          programId: faculty.programId,
          rawProgram: null,
        };
      }

      programGroups[programName].faculty.push(faculty);

      // Check if this faculty member is marked as UPD
      if (faculty.isUPD) {
        const programInfo = programs.find((p) => p.id === faculty.programId);
        const updIds = Array.isArray(programInfo?.updIds)
          ? programInfo.updIds
          : programInfo?.updId
            ? [programInfo.updId]
            : [];
        if (updIds.includes(faculty.id)) {
          const existing = programGroups[programName].upds || [];
          if (!existing.some((u) => u.id === faculty.id)) {
            existing.push(faculty);
            programGroups[programName].upds = existing.slice(0, 2);
          }
        }
      }
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

  // Handle UPD designation
  const handleSetUPD = async (programName, faculty) => {
    if (!canEditHere) {
      showNotification(
        "warning",
        "Permission Denied",
        "You do not have permission to assign Undergraduate Program Directors.",
      );
      return;
    }

    try {
      if (faculty.isAdjunct) {
        showNotification(
          "error",
          "Cannot Assign UPD",
          "Adjunct faculty cannot be assigned as Undergraduate Program Director",
        );
        return;
      }

      const program = programData[programName];
      if (!program || !program.programId) {
        showNotification(
          "error",
          "Program Error",
          "Cannot find program information. Please refresh and try again.",
        );
        return;
      }

      const currentUPDs = Array.isArray(program.upds) ? program.upds : [];
      if (currentUPDs.some((u) => u.id === faculty.id)) {
        showNotification(
          "info",
          "Already UPD",
          `${faculty.name} is already an Undergraduate Program Director for ${programName}`,
        );
        setEditingUPD(null);
        return;
      }
      if (currentUPDs.length >= 2) {
        showNotification(
          "error",
          "UPD Limit Reached",
          "This program already has two UPDs. Remove one before adding another.",
        );
        return;
      }

      await handleFacultyUpdate({
        ...faculty,
        isUPD: true,
        updatedAt: new Date().toISOString(),
      });

      const programRef = doc(db, COLLECTIONS.PROGRAMS, program.programId);
      const prevUpdIds = currentUPDs.map((u) => u.id);
      const newUpdIds = [...prevUpdIds, faculty.id];
      const updateData = {
        updIds: newUpdIds,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(programRef, updateData);

      await logUpdate(
        `Program UPD Assignment - ${programName} → ${faculty.name}`,
        "programs",
        program.programId,
        updateData,
        { updIds: prevUpdIds },
        "ProgramManagement.jsx - handleSetUPD",
      );

      showNotification(
        "success",
        "UPD Updated",
        `${faculty.name} is now an Undergraduate Program Director for ${programName}`,
      );

      setEditingUPD(null);
    } catch (error) {
      console.error("Error setting UPD:", error);
      showNotification(
        "error",
        "Error",
        "Failed to update UPD designation. Please try again.",
      );
    }
  };

  // Handle removing UPD
  const handleRemoveUPD = async (programName, faculty) => {
    if (!canEditHere) {
      showNotification(
        "warning",
        "Permission Denied",
        "You do not have permission to remove Undergraduate Program Directors.",
      );
      return;
    }

    try {
      const program = programData[programName];
      if (!program || !program.programId) return;

      const currentUPDs = Array.isArray(program.upds) ? program.upds : [];
      const newUpdIds = currentUPDs
        .filter((u) => u.id !== faculty.id)
        .map((u) => u.id);

      const programRef = doc(db, COLLECTIONS.PROGRAMS, program.programId);
      await updateDoc(programRef, {
        updIds: newUpdIds,
        updatedAt: new Date().toISOString(),
      });

      await handleFacultyUpdate({
        ...faculty,
        isUPD: false,
        updatedAt: new Date().toISOString(),
      });

      showNotification(
        "success",
        "UPD Removed",
        `${faculty.name} is no longer an Undergraduate Program Director for ${programName}`,
      );
    } catch (error) {
      console.error("Error removing UPD:", error);
      showNotification(
        "error",
        "Error",
        "Failed to remove UPD designation. Please try again.",
      );
    }
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

  // Handle program change via dropdown
  const handleProgramChange = async (faculty, newProgramName) => {
    if (!faculty || !newProgramName) return;

    const currentProgram = Object.keys(programData).find((program) =>
      programData[program].faculty.some((f) => f.id === faculty.id),
    );

    if (currentProgram === newProgramName) return;

    try {
      const targetProgram = programData[newProgramName];
      if (!targetProgram || !targetProgram.programId) {
        showNotification(
          "error",
          "Program Error",
          "Cannot find target program information.",
        );
        return;
      }

      const updateData = {
        ...faculty,
        programId: targetProgram.programId,
        updatedAt: new Date().toISOString(),
      };

      await handleFacultyUpdate(updateData);

      showNotification(
        "success",
        "Faculty Moved",
        `${faculty.name} moved to ${newProgramName} program`,
      );
    } catch (error) {
      console.error("Error moving faculty:", error);
      showNotification(
        "error",
        "Error",
        "Failed to move faculty member. Please try again.",
      );
    }
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
      const created = await handleProgramCreate({ name: programName });
      if (created) {
        setNewProgramName("");
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

  // Get all program names for dropdown
  const allProgramNames = useMemo(() => {
    return Object.keys(programData)
      .filter((p) => p !== "Unassigned")
      .sort();
  }, [programData]);

  const programList = Object.keys(programData).sort();

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              {embedded ? (
                <h2 className="text-xl font-semibold text-gray-900">
                  Programs & UPDs
                </h2>
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">
                  Programs & UPDs
                </h1>
              )}
              <p className="text-sm text-gray-500 mt-1">
                Manage programs, assign UPDs, and organize faculty
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
              <select
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
              </select>

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
              const facultyCount = program.faculty.length;
              const displayFaculty = isExpanded
                ? program.faculty
                : program.faculty.slice(0, 4);

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

                        {/* Stats */}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FFB81C]/20 text-[#154734]">
                            <Users size={12} className="mr-1" />
                            {facultyCount} faculty
                          </span>
                          {program.upds.length > 0 && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              <Star size={12} className="mr-1" />
                              {program.upds.length} UPD
                            </span>
                          )}
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

                  {/* UPD Section */}
                  <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <UserCog size={16} className="text-amber-600" />
                        Program Directors
                      </div>
                      {canEditHere && (
                        <button
                          onClick={() =>
                            setEditingUPD(
                              editingUPD === programName ? null : programName,
                            )
                          }
                          className="text-xs text-[#154734] hover:text-[#0f3526] font-medium transition-colors"
                        >
                          {editingUPD === programName ? "Done" : "Manage"}
                        </button>
                      )}
                    </div>

                    {editingUPD === programName ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {program.faculty
                          .filter((f) => !f.isAdjunct)
                          .map((faculty) => {
                            const isUPD = program.upds.some(
                              (u) => u.id === faculty.id,
                            );
                            return (
                              <button
                                key={faculty.id}
                                onClick={() =>
                                  isUPD
                                    ? handleRemoveUPD(programName, faculty)
                                    : handleSetUPD(programName, faculty)
                                }
                                className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                                  isUPD
                                    ? "bg-amber-50 border-amber-200"
                                    : "bg-white border-gray-200 hover:border-[#154734]/30 hover:bg-[#154734]/5"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div
                                      className={`font-medium text-sm ${isUPD ? "text-amber-900" : "text-gray-900"}`}
                                    >
                                      {faculty.name}
                                    </div>
                                    <div className="text-gray-500 text-xs">
                                      {faculty.jobTitle}
                                    </div>
                                  </div>
                                  {isUPD && (
                                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded">
                                      Current UPD
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        {program.faculty.filter((f) => !f.isAdjunct).length ===
                          0 && (
                          <div className="text-sm text-gray-500 italic p-2">
                            No eligible faculty members (adjuncts cannot be
                            UPDs)
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {program.upds.length > 0 ? (
                          program.upds.map((upd) => (
                            <div
                              key={upd.id}
                              className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-amber-200"
                            >
                              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <Star size={14} className="text-amber-700" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-gray-900 truncate">
                                  {upd.name}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {upd.jobTitle}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-dashed border-gray-300">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <UserCog size={14} className="text-gray-400" />
                            </div>
                            <div className="text-sm text-gray-500">
                              No UPD assigned
                            </div>
                          </div>
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
                                  {program.upds.some(
                                    (u) => u.id === faculty.id,
                                  ) && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                      <Star size={10} className="mr-0.5" />
                                      UPD
                                    </span>
                                  )}
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
      {showCreateProgram && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Create New Program
              </h3>
              <button
                onClick={() => setShowCreateProgram(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Program Name
              </label>
              <input
                type="text"
                value={newProgramName}
                onChange={(e) => setNewProgramName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#154734] focus:border-transparent"
                placeholder="Enter program name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") createNewProgram();
                }}
              />
              <p className="mt-2 text-xs text-gray-500">
                Program names must be unique and cannot be "Unassigned".
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateProgram(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createNewProgram}
                disabled={!newProgramName.trim() || isCreatingProgram}
                className="px-4 py-2 bg-[#154734] text-white rounded-lg font-medium hover:bg-[#0f3526] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {programToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Program
              </h3>
            </div>

            <div className="p-6">
              <p className="text-gray-700">
                Are you sure you want to delete{" "}
                <strong>{programToDelete}</strong>?
              </p>
              <p className="mt-2 text-sm text-gray-500">
                This action cannot be undone. Programs with faculty members
                cannot be deleted.
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setProgramToDelete(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteProgram}
                disabled={isDeletingProgram}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeletingProgram ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    Delete Program
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Faculty Contact Card Modal */}
      {selectedFacultyForCard && (
        <FacultyContactCard
          faculty={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
          onUpdate={handleFacultyUpdate}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default ProgramManagement;
