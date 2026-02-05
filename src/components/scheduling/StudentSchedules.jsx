import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Calendar,
  List,
  Building,
  Filter,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  Briefcase,
  Download,
  X,
} from "lucide-react";
import MultiSelectDropdown from "../MultiSelectDropdown";
import FacultyContactCard from "../FacultyContactCard";
import { useData } from "../../contexts/DataContext";
import { usePeople } from "../../contexts/PeopleContext";
import ExportModal from "../administration/ExportModal";
import {
  getStudentAssignments,
  isAssignmentActiveDuringSemester,
} from "../../utils/studentWorkers";

const DAY_ORDER = ["M", "T", "W", "R", "F"];
const DAY_LABELS = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

// Calendar grid configuration - 8 AM to 5 PM business hours
const START_HOUR = 8;
const END_HOUR = 17;
const HOUR_HEIGHT = 48; // pixels per hour - fits 9 hours in ~432px

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm] = timeStr.split(":").map((v) => parseInt(v, 10));
  return hh * 60 + (mm || 0);
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hr12 = ((h + 11) % 12) + 1;
  if (m === 0) return `${hr12} ${ampm}`;
  return `${hr12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatTimeCompact(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "p" : "a";
  const hr12 = ((h + 11) % 12) + 1;
  if (m === 0) return `${hr12}${ampm}`;
  return `${hr12}:${m.toString().padStart(2, "0")}${ampm}`;
}

const summarizeList = (items = [], emptyLabel = "All") => {
  const cleaned = (items || []).filter(Boolean);
  if (cleaned.length === 0) return emptyLabel;
  if (cleaned.length <= 3) return cleaned.join(", ");
  return `${cleaned.slice(0, 3).join(", ")} +${cleaned.length - 3} more`;
};

// PMS Color Palette for schedule events
// Green family
const COLORS = [
  // Deep greens (PMS 7743, 7729 family)
  { bg: "rgba(74, 93, 58, 0.12)", border: "#4A5D3A", text: "#3A4D2A" }, // PMS 7743 - deep forest
  { bg: "rgba(45, 90, 82, 0.12)", border: "#2D5A52", text: "#1D4A42" }, // PMS 7729 - dark teal
  // Medium greens (PMS 575, 356 family)
  { bg: "rgba(122, 139, 90, 0.12)", border: "#7A8B5A", text: "#5A6B3A" }, // PMS 575 - olive
  { bg: "rgba(11, 107, 62, 0.10)", border: "#0B6B3E", text: "#08582F" }, // PMS 356 - green
  { bg: "rgba(15, 122, 110, 0.10)", border: "#0F7A6E", text: "#0C6358" }, // PMS 3298 - teal
  // Bright greens (PMS 377, 390, 362 family)
  { bg: "rgba(127, 160, 40, 0.12)", border: "#7FA028", text: "#5F7A1E" }, // PMS 377 - lime
  { bg: "rgba(74, 155, 46, 0.10)", border: "#4A9B2E", text: "#3A7B1E" }, // PMS 362 - bright green
  { bg: "rgba(154, 170, 28, 0.12)", border: "#9AAA1C", text: "#7A8A0C" }, // PMS 390 - yellow-green
  // Gold/Yellow family (PMS 7555, Yellow, 7753)
  { bg: "rgba(201, 162, 39, 0.14)", border: "#C9A227", text: "#8B6D17" }, // PMS 7555 - golden
  { bg: "rgba(255, 215, 0, 0.14)", border: "#C9A010", text: "#8B7000" }, // PMS Yellow - bright
  { bg: "rgba(184, 149, 47, 0.14)", border: "#B8952F", text: "#7A6517" }, // PMS 7753 - deep gold
];

function getColorForKey(key) {
  if (!key) return COLORS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

// Layout algorithm for overlapping events in a day
function layoutEventsForDay(events) {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => {
    if (a.startMinutes !== b.startMinutes)
      return a.startMinutes - b.startMinutes;
    return b.endMinutes - b.startMinutes - (a.endMinutes - a.startMinutes);
  });

  const columns = [];
  const placements = [];

  sorted.forEach((event) => {
    let placed = -1;
    for (let col = 0; col < columns.length; col++) {
      if (columns[col] <= event.startMinutes) {
        placed = col;
        columns[col] = event.endMinutes;
        break;
      }
    }
    if (placed === -1) {
      placed = columns.length;
      columns.push(event.endMinutes);
    }
    placements.push({ ...event, column: placed });
  });

  const totalColumns = columns.length;
  return placements.map((e) => ({ ...e, totalColumns }));
}

const StudentSchedules = ({ embedded = false }) => {
  const { studentData = [], selectedSemesterMeta } = useData();
  const { loadPeople } = usePeople();

  const [selectedBuildings, setSelectedBuildings] = useState([]);
  const [selectedJobTitles, setSelectedJobTitles] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [activeTab, setActiveTab] = useState("calendar");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selectedStudentForCard, setSelectedStudentForCard] = useState(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const buildingOptions = useMemo(() => {
    const set = new Set();
    studentData.forEach((s) => {
      getStudentAssignments(s).forEach((a) => {
        (a.buildings || []).forEach((b) => b && set.add(b));
      });
    });
    return Array.from(set).sort();
  }, [studentData]);

  const jobTitleOptions = useMemo(() => {
    const set = new Set();
    studentData.forEach((s) => {
      getStudentAssignments(s).forEach((a) => {
        if (a?.jobTitle) set.add(a.jobTitle);
      });
    });
    return Array.from(set).sort();
  }, [studentData]);

  const studentIdOptions = useMemo(
    () => studentData.map((s) => s.id).filter(Boolean),
    [studentData],
  );

  const studentIdToNameMap = useMemo(() => {
    const map = {};
    studentData.forEach((s) => {
      if (s.id) map[s.id] = s.name || s.id;
    });
    return map;
  }, [studentData]);

  const semesterLabel = useMemo(() => {
    const label =
      selectedSemesterMeta?.term ||
      selectedSemesterMeta?.label ||
      selectedSemesterMeta?.name ||
      selectedSemesterMeta?.termCode;
    return label || "All Semesters";
  }, [selectedSemesterMeta]);

  const viewLabel = activeTab === "calendar" ? "Weekly Calendar" : "Student List";

  const exportTitle = useMemo(
    () => `Student-Worker-Schedules-${activeTab}-${semesterLabel || "semester"}`,
    [activeTab, semesterLabel],
  );

  const filterSummary = useMemo(() => {
    const studentNames = selectedStudentIds.map(
      (id) => studentIdToNameMap[id] || id,
    );
    return {
      buildings: summarizeList(selectedBuildings),
      jobs: summarizeList(selectedJobTitles),
      students: summarizeList(studentNames),
      includeInactive: includeInactive ? "Yes" : "No",
    };
  }, [
    selectedBuildings,
    selectedJobTitles,
    selectedStudentIds,
    studentIdToNameMap,
    includeInactive,
  ]);

  const filteredStudents = useMemo(() => {
    return studentData
      .map((student) => {
        const assignments = getStudentAssignments(student).map(
          (assignment) => ({
            ...assignment,
            isActiveDuringSemester: isAssignmentActiveDuringSemester(
              assignment,
              student,
              selectedSemesterMeta,
            ),
          }),
        );

        let filtered = assignments.filter(
          (a) => Array.isArray(a.schedule) && a.schedule.length > 0,
        );
        if (!includeInactive)
          filtered = filtered.filter((a) => a.isActiveDuringSemester);
        if (selectedJobTitles.length > 0)
          filtered = filtered.filter((a) =>
            selectedJobTitles.includes(a.jobTitle),
          );
        if (selectedBuildings.length > 0) {
          filtered = filtered.filter((a) =>
            (a.buildings || []).some((b) => selectedBuildings.includes(b)),
          );
        }
        if (
          selectedStudentIds.length > 0 &&
          !selectedStudentIds.includes(student.id)
        )
          return null;
        if (filtered.length === 0) return null;

        return { ...student, visibleAssignments: filtered };
      })
      .filter(Boolean);
  }, [
    studentData,
    selectedBuildings,
    selectedJobTitles,
    selectedStudentIds,
    includeInactive,
    selectedSemesterMeta,
  ]);

  const eventsByDay = useMemo(() => {
    const byDay = { M: [], T: [], W: [], R: [], F: [] };
    filteredStudents.forEach((student) => {
      (student.visibleAssignments || []).forEach((assignment) => {
        (assignment.schedule || []).forEach((entry) => {
          if (!entry?.day || !DAY_ORDER.includes(entry.day)) return;
          const start = parseTimeToMinutes(entry.start);
          const end = parseTimeToMinutes(entry.end);
          if (start >= end) return;
          byDay[entry.day].push({
            student,
            assignment,
            entry,
            startMinutes: start,
            endMinutes: end,
            colorKey: `${student.id}-${assignment.jobTitle}`,
          });
        });
      });
    });
    return byDay;
  }, [filteredStudents]);

  const layoutByDay = useMemo(() => {
    const layout = {};
    DAY_ORDER.forEach((day) => {
      layout[day] = layoutEventsForDay(eventsByDay[day]);
    });
    return layout;
  }, [eventsByDay]);

  const stats = useMemo(() => {
    const students = new Set();
    const jobs = new Set();
    let shifts = 0;
    filteredStudents.forEach((s) => {
      students.add(s.id);
      s.visibleAssignments.forEach((a) => {
        if (a.jobTitle) jobs.add(a.jobTitle);
        shifts += (a.schedule || []).length;
      });
    });
    return { students: students.size, jobs: jobs.size, shifts };
  }, [filteredStudents]);

  const activeFilterCount =
    [selectedBuildings, selectedJobTitles, selectedStudentIds].filter(
      (a) => a.length > 0,
    ).length + (includeInactive ? 1 : 0);

  const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {embedded ? (
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              Student Worker Schedules
            </h2>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Student Worker Schedules
            </h1>
          )}
          <p className="text-gray-600">
            Review student worker assignments and availability
          </p>
        </div>
        <button
          onClick={() => setIsExportModalOpen(true)}
          className="no-print inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-baylor-green bg-white border border-baylor-green rounded-lg hover:bg-baylor-green hover:text-white transition-colors"
          title="Export student schedules"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            setFiltersExpanded(!filtersExpanded)
          }
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-baylor-green/10 rounded-lg">
              <Filter size={18} className="text-baylor-green" />
            </div>
            <span className="font-semibold text-gray-800">
              Filters & Search
            </span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-baylor-gold/20 text-baylor-green text-xs font-medium rounded-full">
                {activeFilterCount} active
              </span>
            )}
          </div>
          {filtersExpanded ? (
            <ChevronUp size={20} className="text-gray-500" />
          ) : (
            <ChevronDown size={20} className="text-gray-500" />
          )}
        </div>

        {filtersExpanded && (
          <div className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Buildings
                </label>
                <MultiSelectDropdown
                  options={buildingOptions}
                  selected={selectedBuildings}
                  onChange={setSelectedBuildings}
                  placeholder="All Buildings"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Job Titles
                </label>
                <MultiSelectDropdown
                  options={jobTitleOptions}
                  selected={selectedJobTitles}
                  onChange={setSelectedJobTitles}
                  placeholder="All Job Titles"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">
                  Students
                </label>
                <MultiSelectDropdown
                  options={studentIdOptions}
                  selected={selectedStudentIds}
                  onChange={setSelectedStudentIds}
                  placeholder="All Students"
                  displayMap={studentIdToNameMap}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="w-4 h-4 text-baylor-green rounded"
                />
                Include assignments outside semester
              </label>
              <button
                onClick={() => {
                  setSelectedBuildings([]);
                  setSelectedJobTitles([]);
                  setSelectedStudentIds([]);
                  setIncludeInactive(false);
                }}
                className="px-4 py-2 text-sm text-baylor-green font-medium rounded-lg border border-baylor-green/30 hover:bg-baylor-green/10"
              >
                Reset all filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200 no-print">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold relative ${activeTab === "calendar" ? "text-baylor-green bg-baylor-green/5" : "text-gray-600 hover:text-baylor-green hover:bg-gray-50"}`}
          >
            <Calendar size={18} />
            Weekly Calendar
            {activeTab === "calendar" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-baylor-gold" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold relative ${activeTab === "list" ? "text-baylor-green bg-baylor-green/5" : "text-gray-600 hover:text-baylor-green hover:bg-gray-50"}`}
          >
            <List size={18} />
            Student List
            {activeTab === "list" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-baylor-gold" />
            )}
          </button>
        </div>

        <div ref={exportRef} className="student-schedule-export">
          <div className="hidden print-only border-b border-gray-200 pb-3 mb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-baylor-green">
                  Student Worker Schedules
                </h2>
                <div className="text-sm text-gray-600">
                  Semester:{" "}
                  <span className="font-semibold text-gray-900">
                    {semesterLabel}
                  </span>
                </div>
              </div>
              <div className="text-sm text-gray-500 text-right">
                <div>{viewLabel}</div>
                <div>Exported {new Date().toLocaleDateString()}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Buildings:</span>{" "}
                {filterSummary.buildings}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Job Titles:</span>{" "}
                {filterSummary.jobs}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Students:</span>{" "}
                {filterSummary.students}
              </div>
              <div>
                <span className="font-semibold text-gray-900">
                  Include Inactive:
                </span>{" "}
                {filterSummary.includeInactive}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Users size={16} className="text-baylor-green" />
              <strong className="text-gray-900">{stats.students}</strong>{" "}
              Students
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Briefcase size={16} className="text-baylor-green" />
              <strong className="text-gray-900">{stats.jobs}</strong> Job Types
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock size={16} className="text-baylor-green" />
              <strong className="text-gray-900">{stats.shifts}</strong>{" "}
              Shifts/Week
            </div>
          </div>

          <div className="p-4">
            {activeTab === "calendar" && (
              <>
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">
                      No Schedules Found
                    </h3>
                    <p className="text-gray-500">
                      Adjust filters to view student schedules.
                    </p>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col gap-0.5">
                    {/* Header - separate from grid body */}
                    <div className="flex bg-baylor-green text-white shrink-0">
                      <div className="w-[50px] py-2 text-xs font-medium text-center border-r border-baylor-green/50 shrink-0"></div>
                      {DAY_ORDER.map((day) => (
                        <div
                          key={day}
                          className="flex-1 py-2 text-center border-r border-baylor-green/50 last:border-r-0"
                        >
                          <div className="font-bold text-sm">
                            {DAY_LABELS[day]}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Grid Body */}
                    <div className="grid grid-cols-[50px_repeat(5,1fr)]">
                      {/* Time Column */}
                      <div className="border-r border-gray-200 bg-gray-50">
                        {Array.from(
                          { length: END_HOUR - START_HOUR },
                          (_, i) => (
                            <div
                              key={i}
                              className="border-b border-gray-100 text-[11px] text-gray-500 text-right pr-1 flex items-start justify-end"
                              style={{ height: `${HOUR_HEIGHT}px` }}
                            >
                              <span className="mt-[-0.5em]">
                                {formatTime((START_HOUR + i) * 60)}
                              </span>
                            </div>
                          ),
                        )}
                      </div>

                      {/* Day Columns */}
                      {DAY_ORDER.map((day, dayIndex) => {
                        // Day backgrounds using PMS palette - alternating warm/cool tones
                        const dayBackgrounds = [
                          "rgba(74, 93, 58, 0.04)", // PMS 7743 - subtle forest (Mon)
                          "rgba(201, 162, 39, 0.05)", // PMS 7555 - subtle golden (Tue)
                          "rgba(45, 90, 82, 0.04)", // PMS 7729 - subtle teal (Wed)
                          "rgba(184, 149, 47, 0.05)", // PMS 7753 - subtle deep gold (Thu)
                          "rgba(122, 139, 90, 0.04)", // PMS 575 - subtle olive (Fri)
                        ];
                        const bgColor = dayBackgrounds[dayIndex];

                        return (
                          <div
                            key={day}
                            className="relative border-r border-gray-200 last:border-r-0"
                            style={{
                              height: `${totalHeight}px`,
                              backgroundColor: bgColor,
                            }}
                          >
                            {/* Hour grid lines */}
                            {Array.from(
                              { length: END_HOUR - START_HOUR },
                              (_, i) => (
                                <div
                                  key={i}
                                  className="absolute left-0 right-0 border-b border-gray-100"
                                  style={{
                                    top: `${i * HOUR_HEIGHT}px`,
                                    height: `${HOUR_HEIGHT}px`,
                                  }}
                                />
                              ),
                            )}

                            {/* Events */}
                            {layoutByDay[day].map((event, idx) => {
                              const top =
                                ((event.startMinutes - START_HOUR * 60) / 60) *
                                HOUR_HEIGHT;
                              const height = Math.max(
                                ((event.endMinutes - event.startMinutes) / 60) *
                                  HOUR_HEIGHT,
                                28,
                              );
                              const color = getColorForKey(event.colorKey);
                              const widthPercent = 100 / event.totalColumns;
                              const leftPercent =
                                (event.column / event.totalColumns) * 100;

                              return (
                                <div
                                  key={`${event.student.id}-${idx}`}
                                  className="absolute rounded shadow-sm cursor-pointer hover:shadow-md hover:z-20 transition-shadow overflow-hidden"
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                    width: `calc(${widthPercent}% - 3px)`,
                                    left: `calc(${leftPercent}% + 1px)`,
                                    backgroundColor: color.bg,
                                    borderLeft: `3px solid ${color.border}`,
                                  }}
                                  onClick={() =>
                                    setSelectedStudentForCard(event.student)
                                  }
                                  title={`${event.student.name}\n${formatTime(event.startMinutes)} - ${formatTime(event.endMinutes)}\n${event.assignment.jobTitle || ""}`}
                                >
                                  <div className="px-1.5 py-0.5 h-full flex flex-col justify-center overflow-hidden">
                                    <div
                                      className="font-semibold text-xs leading-tight"
                                      style={{ color: color.text }}
                                    >
                                      {event.student.name}
                                    </div>
                                    <div className="text-[10px] text-gray-600 leading-tight">
                                      {formatTimeCompact(event.startMinutes)}-
                                      {formatTimeCompact(event.endMinutes)}
                                    </div>
                                    {height > 44 &&
                                      event.assignment.jobTitle && (
                                        <div className="text-[10px] text-gray-500 leading-tight truncate">
                                          {event.assignment.jobTitle}
                                        </div>
                                      )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "list" && (
              <div className="space-y-4">
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-12">
                    <List size={48} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">
                      No Students Found
                    </h3>
                    <p className="text-gray-500">
                      Adjust filters to view student schedules.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredStudents.map((student) => {
                      const color = getColorForKey(student.id);
                      return (
                        <div
                          key={student.id}
                          className="student-schedule-card bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md cursor-pointer"
                          style={{
                            borderLeftWidth: "4px",
                            borderLeftColor: color.border,
                          }}
                          onClick={() => setSelectedStudentForCard(student)}
                        >
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="font-semibold text-gray-900">
                                  {student.name}
                                </h3>
                                {student.email && (
                                  <p className="text-sm text-gray-500">
                                    {student.email}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                {student.visibleAssignments.length} job
                                {student.visibleAssignments.length !== 1
                                  ? "s"
                                  : ""}
                              </span>
                            </div>
                            <div className="space-y-3">
                              {student.visibleAssignments.map(
                                (assignment, idx) => (
                                  <div
                                    key={idx}
                                    className="bg-gray-50 rounded-lg p-3 text-sm"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium text-gray-800">
                                        {assignment.jobTitle || "Unnamed Job"}
                                      </span>
                                      {assignment.buildings?.length > 0 && (
                                        <span className="text-xs text-gray-500 flex items-center gap-1">
                                          <Building size={12} />
                                          {assignment.buildings.join(", ")}
                                        </span>
                                      )}
                                    </div>
                                    {assignment.schedule?.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {DAY_ORDER.map((day) => {
                                          const daySchedules =
                                            assignment.schedule.filter(
                                              (s) => s.day === day,
                                            );
                                          if (daySchedules.length === 0)
                                            return null;
                                          return (
                                            <span
                                              key={day}
                                              className="inline-flex items-center bg-white border border-gray-200 rounded px-2 py-0.5 text-xs"
                                            >
                                              <span className="font-medium text-baylor-green mr-1">
                                                {day}
                                              </span>
                                              <span className="text-gray-600">
                                                {daySchedules
                                                  .map(
                                                    (s) =>
                                                      `${formatTimeCompact(parseTimeToMinutes(s.start))}-${formatTimeCompact(parseTimeToMinutes(s.end))}`,
                                                  )
                                                  .join(", ")}
                                              </span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedStudentForCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 relative">
            <button
              onClick={() => setSelectedStudentForCard(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            <div className="p-6">
              <FacultyContactCard
                person={selectedStudentForCard}
                onClose={() => setSelectedStudentForCard(null)}
                personType="student"
              />
            </div>
          </div>
        </div>
      )}

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        scheduleTableRef={exportRef}
        title={exportTitle}
      />

      <style>{`
        @media print {
          @page { size: 11in 8.5in; margin: 0.35in; }
          .student-schedule-export {
            width: 11in;
            min-height: 8.5in;
            margin: 0 auto;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .student-schedule-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default StudentSchedules;
