import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap,
  Search,
  Plus,
  RotateCcw,
  History,
  Filter,
  Download,
  BarChart3,
  ArrowRight,
  X,
} from "lucide-react";
import MultiSelectDropdown from "./MultiSelectDropdown";
import FacultyContactCard from "./FacultyContactCard";
import { DeleteConfirmDialog } from "./shared";
import PersonDirectory from "./PersonDirectory";
import SortableHeader from "./shared/SortableHeader";
import {
  StudentAddWizard,
  StudentEditModal,
  StatusBadge,
  getStudentStatus,
} from "./student";
import {
  Edit,
  Trash2,
  Mail,
  Phone,
  PhoneOff,
  Clock,
  Briefcase,
} from "lucide-react";
import {
  calculateWeeklyHoursFromSchedule,
  buildSemesterKey,
  getStudentAssignments,
  getStudentStatusForSemester,
} from "../utils/studentWorkers";
import {
  normalizeWeeklySchedule,
  sortWeeklySchedule,
} from "../utils/studentScheduleUtils";
import { formatPhoneNumber } from "../utils/directoryUtils";
import {
  getCanonicalBuildingList,
  normalizeBuildingName,
} from "../utils/locationService";
import { useData } from "../contexts/DataContext";
import { usePeopleOperations } from "../hooks";
import { useUI } from "../contexts/UIContext";
import { useAppConfig } from "../contexts/AppConfigContext";

const trimValue = (value) => (typeof value === "string" ? value.trim() : value);

const normalizeBuildingLabel = (value) => {
  const trimmed = trimValue(value) || "";
  const normalized = normalizeBuildingName(trimmed);
  return (normalized || trimmed || "").trim();
};

const normalizeBuildingList = (value) => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = list
    .map((item) => normalizeBuildingLabel(item))
    .filter(Boolean);
  return Array.from(new Set(normalized));
};

const sanitizeWeeklyEntries = (entries) =>
  sortWeeklySchedule(normalizeWeeklySchedule(entries));

const prepareStudentPayload = (student) => {
  if (!student) return {};

  const jobsArray = Array.isArray(student.jobs) ? student.jobs : [];
  const normalizedJobs = jobsArray
    .map((job) => {
      if (!job) return null;
      const buildingSource =
        job.buildings !== undefined && job.buildings !== null
          ? job.buildings
          : job.location;
      const locations = normalizeBuildingList(buildingSource);
      return {
        jobTitle: trimValue(job.jobTitle || ""),
        supervisor: trimValue(job.supervisor || ""),
        hourlyRate: trimValue(job.hourlyRate || ""),
        location: locations,
        buildings: locations, // Keep both for compatibility
        weeklySchedule: sanitizeWeeklyEntries(job.weeklySchedule),
        startDate: trimValue(job.startDate || ""),
        endDate: trimValue(job.endDate || ""),
      };
    })
    .filter(Boolean)
    .filter(
      (job) =>
        job.jobTitle ||
        job.supervisor ||
        job.hourlyRate ||
        (Array.isArray(job.location) && job.location.length > 0) ||
        (Array.isArray(job.weeklySchedule) && job.weeklySchedule.length > 0),
    );

  const hasJobs = normalizedJobs.length > 0;
  const fallbackWeeklySchedule = sanitizeWeeklyEntries(student.weeklySchedule);
  const fallbackBuildings = normalizeBuildingList(
    Array.isArray(student.primaryBuildings) && student.primaryBuildings.length > 0
      ? student.primaryBuildings
      : student.primaryBuilding,
  );
  const aggregatedWeeklySchedule = hasJobs
    ? sanitizeWeeklyEntries(normalizedJobs.flatMap((job) => job.weeklySchedule))
    : fallbackWeeklySchedule;
  const aggregatedBuildings = hasJobs
    ? Array.from(new Set(normalizedJobs.flatMap((job) => job.location)))
    : fallbackBuildings;

  const primaryJob = normalizedJobs[0] || {};
  const primaryBuildings = aggregatedBuildings;
  const primaryBuilding = primaryBuildings[0] || "";

  return {
    ...student,
    name: trimValue(student.name || ""),
    email: trimValue(student.email || ""),
    phone: student.hasNoPhone ? "" : trimValue(student.phone || ""),
    jobs: normalizedJobs,
    weeklySchedule: aggregatedWeeklySchedule,
    primaryBuildings,
    primaryBuilding,
    jobTitle: hasJobs ? primaryJob.jobTitle || "" : trimValue(student.jobTitle || ""),
    supervisor: hasJobs
      ? primaryJob.supervisor || ""
      : trimValue(student.supervisor || ""),
    hourlyRate: hasJobs
      ? primaryJob.hourlyRate || ""
      : trimValue(student.hourlyRate || ""),
  };
};

const toComparableValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) return value.join(" ").toLowerCase();
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).toLowerCase();
};

/**
 * Refactored StudentDirectory Component
 *
 * Uses new UI components:
 * - StudentAddWizard for creating new students
 * - StudentEditModal for editing existing students
 * - ImprovedStudentTable for displaying students
 * - StatusBadge for visual status indicators
 */
const StudentDirectory = () => {
  const navigate = useNavigate();
  const { studentData, selectedSemester, selectedSemesterMeta } = useData();
  const { handleStudentUpdate, handleStudentDelete } = usePeopleOperations();
  const { showNotification } = useUI();
  const { buildingConfigVersion } = useAppConfig();

  // State management
  const [filterText, setFilterText] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "name",
    direction: "ascending",
  });
  const [nameSort, setNameSort] = useState("firstName");
  const [selectedStudentForCard, setSelectedStudentForCard] = useState(null);

  // Modal states
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [studentToDelete, setStudentToDelete] = useState(null);

  // Undo functionality
  const [changeHistory, setChangeHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const defaultFilters = {
    jobTitles: [],
    buildings: [],
    supervisors: { include: [], exclude: [] },
    activeOnly: true,
    includeEnded: false,
  };
  const [filters, setFilters] = useState(defaultFilters);

  const semesterInfo = useMemo(
    () => buildSemesterKey(selectedSemester),
    [selectedSemester],
  );
  const semesterLabel =
    semesterInfo.semesterLabel || selectedSemester || "Selected semester";

  // Get available buildings
  const availableBuildings = useMemo(() => {
    const buildings = new Set(getCanonicalBuildingList());
    const addBuildings = (value) => {
      normalizeBuildingList(value).forEach((b) => buildings.add(b));
    };
    (studentData || []).forEach((student) => {
      if (Array.isArray(student.jobs)) {
        student.jobs.forEach((job) => {
          addBuildings(job?.location || job?.buildings);
        });
      }
    });
    return Array.from(buildings).filter(Boolean).sort();
  }, [studentData, buildingConfigVersion]);

  // Get available supervisors and job titles
  const availableSupervisors = useMemo(() => {
    const supervisors = new Set();
    studentData.forEach((student) => {
      if (student.supervisor) supervisors.add(student.supervisor);
      if (Array.isArray(student.jobs)) {
        student.jobs.forEach((j) => {
          if (j?.supervisor) supervisors.add(j.supervisor);
        });
      }
    });
    return Array.from(supervisors).sort();
  }, [studentData]);

  const availableJobTitles = useMemo(() => {
    const titles = new Set();
    studentData.forEach((student) => {
      if (student.jobTitle) titles.add(student.jobTitle);
      if (Array.isArray(student.jobs)) {
        student.jobs.forEach((j) => {
          if (j?.jobTitle) titles.add(j.jobTitle);
        });
      }
    });
    return Array.from(titles).sort();
  }, [studentData]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = studentData.filter((student) => {
      if (!student) return false;

      // Text filter
      if (filterText) {
        const searchText = filterText.toLowerCase();
        const matchesText =
          student.name?.toLowerCase().includes(searchText) ||
          student.email?.toLowerCase().includes(searchText) ||
          student.supervisor?.toLowerCase().includes(searchText) ||
          student.jobTitle?.toLowerCase().includes(searchText) ||
          (Array.isArray(student.jobs) &&
            student.jobs.some(
              (j) =>
                (j?.jobTitle || "").toLowerCase().includes(searchText) ||
                (j?.supervisor || "").toLowerCase().includes(searchText),
            ));
        if (!matchesText) return false;
      }

      // Status filters
      if (filters.activeOnly) {
        const semesterStatus = getStudentStatusForSemester(
          student,
          selectedSemesterMeta,
        );
        const isActive = semesterStatus?.isActive;
        if (!filters.includeEnded && !isActive) return false;
      }

      // Job Titles filter
      if ((filters.jobTitles || []).length > 0) {
        const titlesSet = new Set();
        if (student.jobTitle) titlesSet.add(student.jobTitle);
        if (Array.isArray(student.jobs)) {
          student.jobs.forEach((j) => {
            if (j?.jobTitle) titlesSet.add(j.jobTitle);
          });
        }
        const titles = Array.from(titlesSet);
        if (!titles.some((t) => filters.jobTitles.includes(t))) return false;
      }

      // Buildings filter
      if ((filters.buildings || []).length > 0) {
        const bldgSet = new Set();
        if (Array.isArray(student.jobs)) {
          student.jobs.forEach((j) => {
            normalizeBuildingList(j?.location || j?.buildings).forEach((b) =>
              bldgSet.add(b),
            );
          });
        }
        const studentBuildings = normalizeBuildingList(Array.from(bldgSet));
        const normalizedFilterBuildings = normalizeBuildingList(
          filters.buildings,
        );
        if (
          !studentBuildings.some((b) => normalizedFilterBuildings.includes(b))
        )
          return false;
      }

      return true;
    });

    // Sort data
    return filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortConfig.key) {
        case "name":
          if (nameSort === "firstName") {
            aValue = a.firstName || a.name?.split(" ")[0] || "";
            bValue = b.firstName || b.name?.split(" ")[0] || "";
          } else {
            aValue = a.lastName || a.name?.split(" ").slice(-1)[0] || "";
            bValue = b.lastName || b.name?.split(" ").slice(-1)[0] || "";
          }
          break;
        case "email":
          aValue = a.email || "";
          bValue = b.email || "";
          break;
        default:
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
      }

      const normalizedA = toComparableValue(aValue);
      const normalizedB = toComparableValue(bValue);

      if (typeof normalizedA === "number" && typeof normalizedB === "number") {
        const diff = normalizedA - normalizedB;
        if (diff === 0) return 0;
        return sortConfig.direction === "ascending" ? diff : -diff;
      }

      const comparison = normalizedA
        .toString()
        .localeCompare(normalizedB.toString());
      return sortConfig.direction === "ascending" ? comparison : -comparison;
    });
  }, [
    studentData,
    filterText,
    sortConfig,
    nameSort,
    filters,
    selectedSemesterMeta,
  ]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
  };

  const goToAnalyticsPage = () => {
    navigate("/analytics/student-worker-analytics");
  };

  // Save handlers with undo tracking
  const handleCreateStudent = async (studentData) => {
    try {
      const payload = prepareStudentPayload(studentData);

      // Add semester schedule if applicable
      const scheduleEntry = {
        semester: semesterLabel,
        semesterCode: semesterInfo.semesterCode || "",
        jobs: payload.jobs,
        weeklySchedule: payload.weeklySchedule,
        primaryBuildings: payload.primaryBuildings,
        primaryBuilding: payload.primaryBuilding,
        jobTitle: payload.jobTitle,
        supervisor: payload.supervisor,
        hourlyRate: payload.hourlyRate,
        updatedAt: new Date().toISOString(),
      };

      const nextSchedules = semesterInfo.semesterKey
        ? { [semesterInfo.semesterKey]: scheduleEntry }
        : {};

      await handleStudentUpdate({
        ...payload,
        isActive: payload.isActive !== undefined ? payload.isActive : true,
        semesterSchedules: nextSchedules,
      });

      setIsWizardOpen(false);
      showNotification("Student worker added successfully", "success");
    } catch (error) {
      console.error("Error creating student:", error);
      showNotification("Failed to create student. Please try again.", "error");
    }
  };

  const handleEditStudent = async (updatedStudent) => {
    try {
      const originalStudent =
        editingStudent ||
        studentData.find((student) => student.id === updatedStudent.id) ||
        updatedStudent;
      const originalSnapshot = JSON.parse(JSON.stringify(originalStudent));
      const payload = prepareStudentPayload(updatedStudent);

      // Track change for undo
      setChangeHistory((prev) => [
        ...prev,
        {
          type: "update",
          timestamp: new Date().toISOString(),
          originalData: originalSnapshot,
          newData: updatedStudent,
        },
      ]);

      // Update semester schedule
      const existingSchedules = originalSnapshot?.semesterSchedules || {};
      const scheduleEntry = {
        semester: semesterLabel,
        semesterCode: semesterInfo.semesterCode || "",
        jobs: payload.jobs,
        weeklySchedule: payload.weeklySchedule,
        primaryBuildings: payload.primaryBuildings,
        primaryBuilding: payload.primaryBuilding,
        jobTitle: payload.jobTitle,
        supervisor: payload.supervisor,
        hourlyRate: payload.hourlyRate,
        updatedAt: new Date().toISOString(),
      };

      const nextSchedules = semesterInfo.semesterKey
        ? { ...existingSchedules, [semesterInfo.semesterKey]: scheduleEntry }
        : existingSchedules;

      await handleStudentUpdate({
        ...payload,
        semesterSchedules: nextSchedules,
      });

      setEditingStudent(null);
      showNotification("Student worker updated successfully", "success");
    } catch (error) {
      console.error("Error updating student:", error);
      showNotification("Failed to update student. Please try again.", "error");
    }
  };

  const confirmDelete = (student) => {
    if (
      typeof window !== "undefined" &&
      window?.appPermissions &&
      window.appPermissions.canDeleteStudent === false
    ) {
      return;
    }
    setStudentToDelete(student);
  };

  const executeDelete = async () => {
    if (studentToDelete) {
      try {
        setChangeHistory((prev) => [
          ...prev,
          {
            type: "delete",
            timestamp: new Date().toISOString(),
            originalData: studentToDelete,
          },
        ]);

        await handleStudentDelete(studentToDelete.id);
        setStudentToDelete(null);
        showNotification("Student worker deleted successfully", "success");
      } catch (error) {
        console.error("Error deleting student:", error);
        showNotification(
          "Failed to delete student. Please try again.",
          "error",
        );
      }
    }
  };

  const undoLastChange = () => {
    const lastChange = changeHistory[changeHistory.length - 1];
    if (lastChange) {
      if (lastChange.type === "update" || lastChange.type === "delete") {
        handleStudentUpdate(lastChange.originalData);
        showNotification("Change undone", "success");
      }
      setChangeHistory((prev) => prev.slice(0, -1));
    }
  };

  const clearAllFilters = () => {
    setFilters(defaultFilters);
    setFilterText("");
  };

  const exportToCSV = () => {
    const headers = [
      "Type",
      "Name",
      "Job Title",
      "Supervisor",
      "Email",
      "Phone",
      "Building(s)",
      "Start Date",
      "End Date",
      "Hourly Rate",
      "Weekly Hours",
      "Weekly Pay",
      "Weekly Schedule",
      "Status",
    ];

    const escapeCell = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = [];

    filteredAndSortedData.forEach((student) => {
      const assignments = getStudentAssignments(student);
      const status = getStudentStatus(student, selectedSemesterMeta);

      if (assignments.length === 0) {
        rows.push([
          "Student Worker",
          student.name || "",
          "",
          "",
          student.email || "",
          student.hasNoPhone ? "No Phone" : formatPhoneNumber(student.phone),
          "",
          student.startDate || "",
          student.endDate || "",
          "",
          "0.00",
          "0.00",
          "",
          status,
        ]);
        return;
      }

      assignments.forEach((assignment) => {
        rows.push([
          "Student Worker",
          student.name || "",
          assignment.jobTitle || "",
          assignment.supervisor || "",
          student.email || "",
          student.hasNoPhone ? "No Phone" : formatPhoneNumber(student.phone),
          (assignment.buildings || []).join("; "),
          student.startDate || "",
          student.endDate || "",
          assignment.hourlyRateNumber
            ? assignment.hourlyRateNumber.toFixed(2)
            : "",
          assignment.weeklyHours ? assignment.weeklyHours.toFixed(2) : "0.00",
          assignment.weeklyPay ? assignment.weeklyPay.toFixed(2) : "0.00",
          formatWeeklySchedule(assignment.schedule),
          status,
        ]);
      });
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `student-worker-directory-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatWeeklySchedule = (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return "";
    const dayOrder = ["M", "T", "W", "R", "F"];
    const dayLabels = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
    const to12Hour = (timeStr) => {
      if (!timeStr || typeof timeStr !== "string") return timeStr || "";
      const [hStr, mStr = "00"] = timeStr.split(":");
      let hour = parseInt(hStr, 10);
      if (Number.isNaN(hour)) return timeStr;
      const ampm = hour >= 12 ? "PM" : "AM";
      hour = hour % 12;
      if (hour === 0) hour = 12;
      const minutes = (mStr || "00").padStart(2, "0");
      return `${hour}:${minutes} ${ampm}`;
    };
    const grouped = {};
    entries.forEach((e) => {
      const key = `${e.start}-${e.end}`;
      grouped[key] = grouped[key] || [];
      grouped[key].push(e.day);
    });
    return Object.entries(grouped)
      .map(([time, days]) => {
        const orderedDays = days.sort(
          (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b),
        );
        const dayStr = orderedDays.map((d) => dayLabels[d]).join(",");
        const [s, e] = time.split("-");
        return `${dayStr} ${to12Hour(s)}-${to12Hour(e)}`;
      })
      .join("; ");
  };

  // Define table columns to match standard directory format
  const columns = [
    {
      key: "name",
      label: "Name",
      headerClassName: "w-[20%]",
      render: (student) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-baylor-green/10 flex items-center justify-center flex-shrink-0">
            <Briefcase size={16} className="text-baylor-green" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{student.name}</p>
            {student.startDate && (
              <p className="text-xs text-gray-500">
                Started {new Date(student.startDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      headerClassName: "w-[20%]",
      render: (student) => (
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-gray-400" />
          <span className="text-gray-700">{student.email || "-"}</span>
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      headerClassName: "w-[15%]",
      render: (student) => (
        <div className="flex items-center gap-2">
          {student.hasNoPhone ? (
            <>
              <PhoneOff size={16} className="text-gray-400" />
              <span className="text-gray-500">No phone</span>
            </>
          ) : (
            <>
              <Phone size={16} className="text-gray-400" />
              <span className="text-gray-700">
                {formatPhoneNumber(student.phone) || "-"}
              </span>
            </>
          )}
        </div>
      ),
    },
    {
      key: "schedule",
      label: "Schedule",
      headerClassName: "w-[25%]",
      render: (student) => {
        const jobs = student.jobs || [];
        const primaryJob = jobs[0];
        const totalHours = jobs.reduce(
          (sum, job) => sum + calculateWeeklyHoursFromSchedule(job.weeklySchedule),
          0,
        );

        return (
          <div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-gray-400" />
              <span className="text-gray-700">
                {totalHours > 0 ? `${totalHours.toFixed(1)} hrs/week` : "-"}
              </span>
            </div>
            {primaryJob?.jobTitle && (
              <p className="text-xs text-gray-500 mt-1">
                {primaryJob.jobTitle}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      headerClassName: "w-[15%]",
      render: (student) => {
        const status = getStudentStatus(student, selectedSemesterMeta);
        return <StatusBadge status={status} size="sm" />;
      },
    },
  ];

  return (
    <>
      <PersonDirectory
        type="people"
        countLabel=""
        title="Student Directory"
        icon={GraduationCap}
        data={filteredAndSortedData}
        columns={columns}
        sortConfig={sortConfig}
        onSort={handleSort}
        nameSort={nameSort}
        onNameSortChange={setNameSort}
        filterText={filterText}
        onFilterTextChange={setFilterText}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onClearFilters={clearAllFilters}
        useHtmlTable={true}
        searchNode={
          <div className="relative min-w-[220px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Filter directory..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
            />
          </div>
        }
        trailingActions={
          <>
            <div className="min-w-[200px]">
              <MultiSelectDropdown
                options={availableJobTitles}
                selected={filters.jobTitles}
                onChange={(selected) =>
                  setFilters((prev) => ({ ...prev, jobTitles: selected }))
                }
                placeholder="Filter by title"
              />
            </div>
            <div className="min-w-[200px]">
              <MultiSelectDropdown
                options={availableBuildings}
                selected={filters.buildings}
                onChange={(selected) =>
                  setFilters((prev) => ({ ...prev, buildings: selected }))
                }
                placeholder="Filter by building"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                showFilters
                  ? "bg-baylor-green text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <Filter size={16} />
              Filters
            </button>
            {changeHistory.length > 0 && (
              <>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-2 px-3 py-2 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 transition-colors"
                >
                  <History size={16} />
                  Changes ({changeHistory.length})
                </button>
                <button
                  onClick={undoLastChange}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <RotateCcw size={16} />
                  Undo
                </button>
              </>
            )}
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.activeOnly}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      activeOnly: e.target.checked,
                    }))
                  }
                />
                Active in semester
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.includeEnded}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      includeEnded: e.target.checked,
                    }))
                  }
                />
                Include outside semester
              </label>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              onClick={() => setIsWizardOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
              disabled={
                typeof window !== "undefined" &&
                window?.appPermissions?.canCreateStudent === false
              }
            >
              <Plus size={18} />
              Add Student
            </button>
          </>
        }
        filterContent={
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supervisor
              </label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setFilters((prev) => ({
                      ...prev,
                      supervisors: {
                        ...prev.supervisors,
                        include: [e.target.value],
                      },
                    }));
                  }
                }}
              >
                <option value="">All Supervisors</option>
                {availableSupervisors.map((supervisor) => (
                  <option key={supervisor} value={supervisor}>
                    {supervisor}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Titles
              </label>
              <MultiSelectDropdown
                options={availableJobTitles}
                selected={filters.jobTitles}
                onChange={(selected) =>
                  setFilters((prev) => ({ ...prev, jobTitles: selected }))
                }
                placeholder="Select job titles..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buildings
              </label>
              <MultiSelectDropdown
                options={availableBuildings}
                selected={filters.buildings}
                onChange={(selected) =>
                  setFilters((prev) => ({ ...prev, buildings: selected }))
                }
                placeholder="Select buildings..."
              />
            </div>
          </div>
        }
        bodyTop={
          <>
            {/* Analytics Banner */}
            <div className="mb-6">
              <div className="flex flex-col gap-3 rounded-lg border border-baylor-gold/60 bg-baylor-gold/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-baylor-gold/20 p-2 text-baylor-gold">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-baylor-green">
                      Payroll insights moved!
                    </p>
                    <p className="text-sm text-gray-700">
                      View wages, hours, and analytics for student workers on
                      the Student Worker Analytics page.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={goToAnalyticsPage}
                  className="inline-flex items-center gap-2 self-start rounded-lg bg-baylor-green px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-baylor-green/90"
                >
                  Open analytics
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        }
        bodyBottom={
          <>
            {/* Change History */}
            {showHistory && changeHistory.length > 0 && (
              <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-gray-900">Recent Changes</h4>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {changeHistory
                    .slice()
                    .reverse()
                    .map((change, index) => (
                      <div
                        key={index}
                        className="text-sm flex items-center justify-between p-2 bg-white rounded border"
                      >
                        <div>
                          <span className="font-medium capitalize">
                            {change.type}
                          </span>
                          : {change.originalData?.name}
                        </div>
                        <span className="text-gray-500 text-xs">
                          {new Date(change.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Contact Card Modal */}
            {selectedStudentForCard && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                  <FacultyContactCard
                    person={selectedStudentForCard}
                    onClose={() => setSelectedStudentForCard(null)}
                    personType="student"
                    onUpdate={handleStudentUpdate}
                  />
                </div>
              </div>
            )}

            {/* Delete Confirmation */}
            <DeleteConfirmDialog
              isOpen={!!studentToDelete}
              record={studentToDelete}
              recordType="student worker"
              onConfirm={executeDelete}
              onCancel={() => setStudentToDelete(null)}
            />
          </>
        }
        tableProps={{
          renderActions: (student) => (
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingStudent(student);
                }}
                className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full transition-colors"
                title="Edit"
              >
                <Edit size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(student);
                }}
                className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ),
          emptyMessage: "No student workers found.",
        }}
      />

      {/* Student Add Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <StudentAddWizard
            onSave={handleCreateStudent}
            onCancel={() => setIsWizardOpen(false)}
            availableBuildings={availableBuildings}
            existingSupervisors={availableSupervisors}
            semesterLabel={semesterLabel}
          />
        </div>
      )}

      {/* Student Edit Modal */}
      {editingStudent && (
        <StudentEditModal
          student={editingStudent}
          onSave={handleEditStudent}
          onClose={() => setEditingStudent(null)}
          onDelete={handleStudentDelete}
          availableBuildings={availableBuildings}
          existingSupervisors={availableSupervisors}
          semesterLabel={semesterLabel}
        />
      )}
    </>
  );
};

export default StudentDirectory;
