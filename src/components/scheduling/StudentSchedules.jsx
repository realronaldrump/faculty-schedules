import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Download,
  Calendar,
  List,
  Grid,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
  Building,
  Filter,
} from "lucide-react";
import MultiSelectDropdown from "../MultiSelectDropdown";
import ExportModal from "../administration/ExportModal";
import FacultyContactCard from "../FacultyContactCard";
import BuildingScheduleView from "./BuildingScheduleView";
import { useData } from "../../contexts/DataContext";
import { usePeople } from "../../contexts/PeopleContext";
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

// Layout tuning for readability and export quality
const TIME_COLUMN_WIDTH = 104;
const BASE_PX_PER_HOUR = 56;
const MAX_PX_PER_HOUR = 220;
const MIN_EVENT_HEIGHT_PX = 44;

function minutesSinceStartOfDay(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm] = timeStr.split(":").map((v) => parseInt(v, 10));
  return hh * 60 + (mm || 0);
}

function formatTimeLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hr12 = ((h + 11) % 12) + 1;
  return `${hr12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// Brand-aligned accent mapping
const ACCENTS = [
  { border: "#154734", bg: "rgba(21, 71, 52, 0.08)" },
  { border: "#1F7A1F", bg: "rgba(31, 122, 31, 0.07)" },
  { border: "#B68B00", bg: "rgba(182, 139, 0, 0.12)" },
  { border: "#0E6E6E", bg: "rgba(14, 110, 110, 0.08)" },
  { border: "#3F4C5A", bg: "rgba(63, 76, 90, 0.08)" },
];

const accentForString = (str) => {
  const key = String(str || "accent");
  let hash = 0;
  for (let i = 0; i < key.length; i++)
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  const idx = Math.abs(hash) % ACCENTS.length;
  return ACCENTS[idx];
};

const accentForStudentAndJob = (studentId, jobTitle) => {
  const combinedKey = `${studentId || "unknown"}|${jobTitle || "no-title"}`;
  return accentForString(combinedKey);
};

const StudentSchedules = ({ embedded = false }) => {
  const { studentData = [], selectedSemesterMeta } = useData();
  const { loadPeople } = usePeople();

  // Filters
  const [selectedBuildings, setSelectedBuildings] = useState([]);
  const [selectedJobTitles, setSelectedJobTitles] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [dayView, setDayView] = useState("All");
  const [includeInactive, setIncludeInactive] = useState(false);

  // View state
  const [activeTab, setActiveTab] = useState("calendar");
  const [viewMode, setViewMode] = useState("calendar");
  const [zoom, setZoom] = useState(1);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Modals
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedStudentForCard, setSelectedStudentForCard] = useState(null);

  // Refs
  const calendarRef = useRef(null);
  const listRef = useRef(null);
  const buildingRef = useRef(null);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  // Get filter options
  const buildingOptions = useMemo(() => {
    const set = new Set();
    studentData.forEach((s) => {
      const assignments = getStudentAssignments(s);
      assignments.forEach((assignment) => {
        const buildings = Array.isArray(assignment.buildings)
          ? assignment.buildings
          : [];
        buildings.forEach((building) => {
          if (building) set.add(building);
        });
      });
    });
    return Array.from(set).sort();
  }, [studentData]);

  const jobTitleOptions = useMemo(() => {
    const set = new Set();
    studentData.forEach((s) => {
      const assignments = getStudentAssignments(s);
      assignments.forEach((assignment) => {
        if (assignment?.jobTitle) set.add(assignment.jobTitle);
      });
    });
    return Array.from(set).sort();
  }, [studentData]);

  const studentIdOptions = useMemo(() => {
    return studentData.map((s) => s.id).filter(Boolean);
  }, [studentData]);

  const studentIdToNameMap = useMemo(() => {
    const map = {};
    studentData.forEach((s) => {
      if (s.id) map[s.id] = s.name || s.id;
    });
    return map;
  }, [studentData]);

  // Filter students
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

        const assignmentsWithSchedule = assignments.filter(
          (assignment) =>
            Array.isArray(assignment.schedule) &&
            assignment.schedule.length > 0,
        );

        const activeAssignments = includeInactive
          ? assignmentsWithSchedule
          : assignmentsWithSchedule.filter(
            (assignment) => assignment.isActiveDuringSemester,
          );

        const filteredAssignments = activeAssignments.filter((assignment) => {
          if (selectedJobTitles.length > 0) {
            if (
              !assignment.jobTitle ||
              !selectedJobTitles.includes(assignment.jobTitle)
            ) {
              return false;
            }
          }

          if (selectedBuildings.length > 0) {
            const buildings = Array.isArray(assignment.buildings)
              ? assignment.buildings
              : [];
            if (
              !buildings.some((building) =>
                selectedBuildings.includes(building),
              )
            ) {
              return false;
            }
          }

          return true;
        });

        if (
          selectedStudentIds.length > 0 &&
          !selectedStudentIds.includes(student.id)
        ) {
          return null;
        }

        if (filteredAssignments.length === 0) return null;

        return {
          ...student,
          visibleAssignments: filteredAssignments,
        };
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

  // Calendar calculations
  const { minStart, maxEnd } = useMemo(() => {
    let min = 8 * 60;
    let max = 18 * 60;
    filteredStudents.forEach((s) => {
      const assignments = Array.isArray(s.visibleAssignments)
        ? s.visibleAssignments
        : [];
      assignments.forEach((assignment) => {
        (assignment.schedule || []).forEach((entry) => {
          const start = minutesSinceStartOfDay(entry.start);
          const end = minutesSinceStartOfDay(entry.end);
          if (!isNaN(start)) min = Math.min(min, start);
          if (!isNaN(end)) max = Math.max(max, end);
        });
      });
    });
    min = Math.max(6 * 60, Math.min(min, 9 * 60));
    max = Math.min(22 * 60, Math.max(max, 17 * 60));
    return { minStart: min, maxEnd: max };
  }, [filteredStudents]);

  const totalMinutes = Math.max(60, maxEnd - minStart);

  const entriesByDayWithLayout = useMemo(() => {
    const layoutMap = { M: [], T: [], W: [], R: [], F: [] };

    const layoutDay = (entries) => {
      const sorted = [...entries].sort(
        (a, b) =>
          minutesSinceStartOfDay(a.start) - minutesSinceStartOfDay(b.start),
      );
      const results = [];
      let groupItems = [];
      let groupEndMax = -Infinity;
      let colEndTimes = [];
      let maxCols = 0;

      const finalizeGroup = () => {
        groupItems.forEach((item) =>
          results.push({ ...item, columns: Math.max(1, maxCols) }),
        );
        groupItems = [];
        groupEndMax = -Infinity;
        colEndTimes = [];
        maxCols = 0;
      };

      sorted.forEach((entry) => {
        const start = minutesSinceStartOfDay(entry.start);
        const end = minutesSinceStartOfDay(entry.end);
        if (groupItems.length > 0 && start >= groupEndMax) {
          finalizeGroup();
        }

        let assignedCol = -1;
        for (let i = 0; i < colEndTimes.length; i++) {
          if (colEndTimes[i] <= start) {
            assignedCol = i;
            break;
          }
        }
        if (assignedCol === -1) {
          assignedCol = colEndTimes.length;
          colEndTimes.push(end);
        } else {
          colEndTimes[assignedCol] = end;
        }
        maxCols = Math.max(maxCols, colEndTimes.length);
        groupEndMax = Math.max(groupEndMax, end);
        groupItems.push({ entry, start, end, col: assignedCol });
      });

      if (groupItems.length > 0) finalizeGroup();
      return results;
    };

    const temp = { M: [], T: [], W: [], R: [], F: [] };
    filteredStudents.forEach((s) => {
      const assignments = Array.isArray(s.visibleAssignments)
        ? s.visibleAssignments
        : [];
      assignments.forEach((assignment) => {
        (assignment.schedule || []).forEach((entry) => {
          if (!entry || !entry.day) return;
          if (temp[entry.day]) {
            temp[entry.day].push({
              ...entry,
              student: s,
              jobTitle: assignment.jobTitle,
            });
          }
        });
      });
    });

    Object.keys(temp).forEach((day) => {
      layoutMap[day] = layoutDay(temp[day]);
    });

    return layoutMap;
  }, [filteredStudents]);

  const pixelsPerHour = useMemo(() => {
    let minDuration = Infinity;
    const days = dayView === "All" ? DAY_ORDER : [dayView];
    days.forEach((d) => {
      (entriesByDayWithLayout[d] || []).forEach((item) => {
        const duration = Math.max(1, item.end - item.start);
        if (duration < minDuration) minDuration = duration;
      });
    });

    if (!isFinite(minDuration)) return BASE_PX_PER_HOUR;

    const required = Math.ceil(
      (MIN_EVENT_HEIGHT_PX * 60) / Math.max(15, minDuration),
    );
    return Math.min(MAX_PX_PER_HOUR, Math.max(BASE_PX_PER_HOUR, required));
  }, [entriesByDayWithLayout, dayView]);

  const calendarPxPerHour = useMemo(() => {
    const scaled = Math.round(pixelsPerHour * zoom);
    return Math.min(
      MAX_PX_PER_HOUR * 2,
      Math.max(Math.floor(BASE_PX_PER_HOUR / 2), scaled),
    );
  }, [pixelsPerHour, zoom]);

  const visibleDays = dayView === "All" ? DAY_ORDER : [dayView];

  const gridTemplateColumns = useMemo(() => {
    const maxOverlapsByDay = {};
    visibleDays.forEach((day) => {
      const items = entriesByDayWithLayout[day] || [];
      let max = 0;
      items.forEach((item) => {
        if (item.columns > max) max = item.columns;
      });
      maxOverlapsByDay[day] = max;
    });

    const minWidthPerCol = 60;
    const minDayWidth = 180;
    const widths = visibleDays.map((day) => {
      const overlaps = maxOverlapsByDay[day] || 1;
      const required = Math.max(minDayWidth, overlaps * minWidthPerCol);
      return `minmax(${required}px, 1fr)`;
    });

    return `${TIME_COLUMN_WIDTH}px ${widths.join(" ")}`;
  }, [entriesByDayWithLayout, visibleDays]);

  const handleScheduleClick = (student) => {
    setSelectedStudentForCard(student);
  };

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedBuildings.length > 0) count++;
    if (selectedJobTitles.length > 0) count++;
    if (selectedStudentIds.length > 0) count++;
    if (dayView !== "All") count++;
    if (includeInactive) count++;
    return count;
  }, [
    selectedBuildings,
    selectedJobTitles,
    selectedStudentIds,
    dayView,
    includeInactive,
  ]);

  // Get appropriate ref for export based on active tab
  const getExportRef = () => {
    switch (activeTab) {
      case "calendar":
        return viewMode === "calendar" ? calendarRef : listRef;
      case "building":
        return buildingRef;
      default:
        return calendarRef;
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
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

      {/* Collapsible Filters Section */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFiltersExpanded(!filtersExpanded);
            }
          }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-baylor-green/20"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-baylor-green/10 rounded-lg">
              <Filter size={18} className="text-baylor-green" />
            </div>
            <div className="text-left">
              <span className="font-semibold text-gray-800">
                Filters & Search
              </span>
              {activeFilterCount > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-baylor-gold/20 text-baylor-green text-xs font-medium rounded-full">
                  {activeFilterCount} active
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowExportModal(true);
              }}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-baylor-green bg-white border border-baylor-green rounded-lg hover:bg-baylor-green hover:text-white transition-colors"
              title="Export schedule"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
            {filtersExpanded ? (
              <ChevronUp size={20} className="text-gray-500" />
            ) : (
              <ChevronDown size={20} className="text-gray-500" />
            )}
          </div>
        </div>

        {filtersExpanded && (
          <div className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-4 animate-fade-in">
            {/* View Mode Toggle */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Display Mode:</span>
                <div className="flex rounded-md border">
                  <button
                    onClick={() => setViewMode("calendar")}
                    className={`px-3 py-1.5 text-xs rounded-l-md flex items-center gap-1 ${viewMode === "calendar"
                        ? "bg-baylor-green text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    <Calendar size={14} />
                    Calendar
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`px-3 py-1.5 text-xs rounded-r-md flex items-center gap-1 ${viewMode === "list"
                        ? "bg-baylor-green text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    <List size={14} />
                    List
                  </button>
                </div>
                {viewMode === "calendar" && (
                  <div className="ml-2 inline-flex items-center gap-1">
                    <button
                      onClick={() =>
                        setZoom((z) =>
                          Math.min(2.5, Math.round((z + 0.1) * 10) / 10),
                        )
                      }
                      className="p-1.5 text-xs border rounded hover:bg-gray-50 text-gray-700"
                      title="Zoom in"
                    >
                      <ZoomIn size={14} />
                    </button>
                    <button
                      onClick={() =>
                        setZoom((z) =>
                          Math.max(0.5, Math.round((z - 0.1) * 10) / 10),
                        )
                      }
                      className="p-1.5 text-xs border rounded hover:bg-gray-50 text-gray-700"
                      title="Zoom out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <span className="text-xs text-gray-600 ml-1">
                      {Math.round(zoom * 100)}%
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Day View:</span>
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={dayView}
                  onChange={(e) => setDayView(e.target.value)}
                >
                  <option value="All">All Days</option>
                  {DAY_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {DAY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter Grid */}
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

            {/* Additional Options */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-4 text-sm text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                    className="w-4 h-4 text-baylor-green rounded focus:ring-baylor-green"
                  />
                  Include assignments outside semester
                </label>
              </div>
              <button
                onClick={() => {
                  setSelectedBuildings([]);
                  setSelectedJobTitles([]);
                  setSelectedStudentIds([]);
                  setDayView("All");
                  setIncludeInactive(false);
                }}
                className="px-4 py-2 text-sm text-baylor-green font-medium rounded-lg border border-baylor-green/30 hover:bg-baylor-green/10 transition-colors"
              >
                Reset all filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Tab Navigation */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-colors relative ${activeTab === "calendar"
                ? "text-baylor-green bg-baylor-green/5"
                : "text-gray-600 hover:text-baylor-green hover:bg-gray-50"
              }`}
          >
            <Calendar size={18} />
            Weekly Calendar
            {activeTab === "calendar" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-baylor-gold" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("building")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-colors relative ${activeTab === "building"
                ? "text-baylor-green bg-baylor-green/5"
                : "text-gray-600 hover:text-baylor-green hover:bg-gray-50"
              }`}
          >
            <Building size={18} />
            By Building
            <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
              Print
            </span>
            {activeTab === "building" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-baylor-gold" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-colors relative ${activeTab === "list"
                ? "text-baylor-green bg-baylor-green/5"
                : "text-gray-600 hover:text-baylor-green hover:bg-gray-50"
              }`}
          >
            <Grid size={18} />
            All Schedules
            {activeTab === "list" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-baylor-gold" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "calendar" && (
            <>
              {viewMode === "calendar" ? (
                <div
                  className="flex flex-col h-[calc(100vh-280px)] min-h-[400px] overflow-hidden"
                  ref={calendarRef}
                >
                  {/* Calendar Header */}
                  <div
                    className="grid gap-x-2 min-w-max mb-2 flex-shrink-0"
                    style={{
                      gridTemplateColumns: `minmax(80px, 0.5fr) repeat(${visibleDays.length}, minmax(120px, 1fr))`,
                    }}
                  >
                    <div></div>
                    {visibleDays.map((d) => (
                      <div
                        key={d}
                        className="text-center text-sm font-serif font-semibold text-baylor-green py-2 bg-gray-50 rounded"
                      >
                        {DAY_LABELS[d]}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid - fills remaining space */}
                  <div className="flex-1 overflow-auto">
                    <div
                      className="grid gap-x-2 min-w-max h-full"
                      style={{
                        gridTemplateColumns: `minmax(80px, 0.5fr) repeat(${visibleDays.length}, minmax(120px, 1fr))`,
                      }}
                    >
                      {/* Time scale */}
                      <div className="relative h-full">
                        {Array.from({
                          length: Math.floor(totalMinutes / 60) + 1,
                        }).map((_, i) => {
                          const m = minStart + i * 60;
                          const top = ((i * 60) / totalMinutes) * 100;
                          return (
                            <div
                              key={i}
                              className="absolute left-0 right-0 flex items-center"
                              style={{
                                top: `${top}%`,
                                transform: "translateY(-50%)",
                              }}
                            >
                              <div className="text-xs text-gray-600 w-full pr-2 text-right font-medium">
                                {formatTimeLabel(m)}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Day columns */}
                      {visibleDays.map((d) => (
                        <div
                          key={d}
                          className="relative border-l border-gray-200 bg-white h-full"
                        >
                          {/* Hour lines */}
                          {Array.from({
                            length: Math.floor(totalMinutes / 60) + 1,
                          }).map((_, i) => {
                            const top = ((i * 60) / totalMinutes) * 100;
                            return (
                              <div
                                key={i}
                                className="absolute left-0 right-0 border-t border-gray-100"
                                style={{ top: `${top}%` }}
                              />
                            );
                          })}

                          {/* Half-hour lines */}
                          {Array.from({
                            length: Math.floor(totalMinutes / 30),
                          }).map((_, i) => {
                            const minutes = (i + 1) * 30;
                            if (minutes % 60 === 0) return null;
                            const top = (minutes / totalMinutes) * 100;
                            return (
                              <div
                                key={`half-${i}`}
                                className="absolute left-0 right-0 border-t border-gray-100 border-dashed"
                                style={{
                                  top: `${top}%`,
                                  opacity: 0.5,
                                }}
                              />
                            );
                          })}

                          {/* Schedule Entries */}
                          {(entriesByDayWithLayout[d] || []).map(
                            (item, idx) => {
                              const { entry, start, end, col, columns } = item;
                              const top =
                                ((start - minStart) / totalMinutes) * 100;
                              const height = Math.max(
                                3,
                                ((end - start) / totalMinutes) * 100,
                              );
                              const durationMinutes = end - start;
                              const accent = accentForStudentAndJob(
                                entry.student.id,
                                entry.jobTitle,
                              );
                              const gap = 4;
                              const widthCalc = `calc((100% - ${(columns - 1) * gap}px) / ${columns})`;
                              const leftCalc = `calc(${(col * 100) / columns}% + ${col * gap}px)`;
                              const eventHeightPercent =
                                ((end - start) / totalMinutes) * 100;
                              let fontSizeClass = "text-xs";
                              let showJob = !!entry.jobTitle;

                              // Responsive font sizing based on event height percentage
                              if (eventHeightPercent < 6) {
                                fontSizeClass = "text-[10px]";
                                showJob = false;
                              } else if (eventHeightPercent < 10) {
                                fontSizeClass = "text-[11px]";
                                showJob = false;
                              } else if (eventHeightPercent < 14) {
                                fontSizeClass = "text-xs";
                                showJob = eventHeightPercent >= 12;
                              } else {
                                fontSizeClass = "text-sm";
                              }

                              const studentName = entry.student.name || "";
                              const timeRange = `${formatTimeLabel(start)} - ${formatTimeLabel(end)}`;

                              return (
                                <div
                                  key={idx}
                                  lang="en"
                                  className={`absolute rounded-md shadow-sm ring-1 ring-black/5 text-gray-900 bg-white hover:shadow-md cursor-pointer flex flex-col justify-center items-stretch transition-shadow ${fontSizeClass} p-1`}
                                  style={{
                                    top: `${top}%`,
                                    height: `${height}%`,
                                    width: widthCalc,
                                    left: leftCalc,
                                    background: accent.bg,
                                    borderLeft: `3px solid ${accent.border}`,
                                    overflow: "hidden",
                                    minHeight: "20px",
                                  }}
                                  title={`${entry.student.name} • ${formatTimeLabel(start)} - ${formatTimeLabel(end)}${entry.jobTitle ? ` • ${entry.jobTitle}` : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleScheduleClick(entry.student);
                                  }}
                                >
                                  <div
                                    className="font-semibold leading-tight text-center truncate"
                                    title={entry.student.name}
                                  >
                                    {studentName}
                                  </div>
                                  <div
                                    className="leading-tight text-center truncate"
                                    title={timeRange}
                                  >
                                    {timeRange}
                                  </div>
                                  {showJob && (
                                    <div
                                      className="leading-tight text-center truncate opacity-85 text-[10px]"
                                      title={entry.jobTitle}
                                    >
                                      {entry.jobTitle}
                                    </div>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div ref={listRef}>
                  {visibleDays.map((day) => {
                    const dayEntries = (entriesByDayWithLayout[day] || [])
                      .slice()
                      .sort((a, b) => a.start - b.start);
                    if (dayEntries.length === 0) return null;
                    return (
                      <div key={day} className="mb-6 last:mb-0">
                        <h4 className="text-md font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-200">
                          {DAY_LABELS[day]}
                        </h4>
                        <div className="space-y-3">
                          {dayEntries.map((item, idx) => {
                            const { entry, start, end } = item;
                            const accent = accentForStudentAndJob(
                              entry.student.id,
                              entry.jobTitle,
                            );
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:shadow-md cursor-pointer transition-shadow"
                                style={{
                                  background: accent.bg,
                                  borderLeft: `4px solid ${accent.border}`,
                                }}
                                onClick={() =>
                                  handleScheduleClick(entry.student)
                                }
                                title={`Click to view ${entry.student.name}'s contact information`}
                              >
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900 text-base">
                                    {entry.student.name}
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    {formatTimeLabel(start)} -{" "}
                                    {formatTimeLabel(end)}
                                    {entry.jobTitle && (
                                      <span className="ml-2 text-gray-500">
                                        • {entry.jobTitle}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No schedule entries found with current filters.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === "building" && (
            <div ref={buildingRef}>
              <BuildingScheduleView
                students={filteredStudents}
                selectedBuildings={selectedBuildings}
                selectedJobTitles={selectedJobTitles}
                dayView={dayView}
                onPrint={() => window.print()}
                onExport={() => setShowExportModal(true)}
              />
            </div>
          )}

          {activeTab === "list" && (
            <div className="space-y-6">
              {filteredStudents.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No students found with current filters.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredStudents.map((student) => (
                    <div
                      key={student.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleScheduleClick(student)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {student.name}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {student.email}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {student.visibleAssignments.length} job
                          {student.visibleAssignments.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {student.visibleAssignments.map((assignment, idx) => (
                          <div
                            key={idx}
                            className="text-sm p-2 rounded bg-gray-50"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-700">
                                {assignment.jobTitle || "Unnamed Job"}
                              </span>
                              <span className="text-xs text-gray-500">
                                {Array.isArray(assignment.buildings) &&
                                  assignment.buildings.length > 0
                                  ? assignment.buildings.join(", ")
                                  : "No building"}
                              </span>
                            </div>
                            {Array.isArray(assignment.schedule) &&
                              assignment.schedule.length > 0 && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {assignment.schedule
                                    .filter(
                                      (s) =>
                                        dayView === "All" || s.day === dayView,
                                    )
                                    .map((s) => `${s.day}: ${s.start}-${s.end}`)
                                    .join(", ")}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        scheduleTableRef={getExportRef()}
        title={`Student Worker Schedules - ${dayView === "All" ? "All Days" : DAY_LABELS[dayView]} (${activeTab === "building" ? "Building View" : viewMode === "calendar" ? "Calendar" : "List"} View)`}
      />

      {/* Contact Card Modal */}
      {selectedStudentForCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <FacultyContactCard
              person={selectedStudentForCard}
              onClose={() => setSelectedStudentForCard(null)}
              personType="student"
            />
          </div>
        </div>
      )}

      {/* Global Print Styles */}
      <style>{`
        @media print {
          /* Hide UI elements when printing */
          .print\\:hidden,
          button,
          select,
          input[type="checkbox"],
          .fixed {
            display: none !important;
          }
          
          /* Ensure building schedules print nicely */
          .building-schedule-sheet {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 20px;
          }
          
          /* Page breaks between buildings */
          .building-schedule-sheet + .building-schedule-sheet {
            page-break-before: always;
          }
          
          /* Remove shadows and borders for cleaner print */
          .shadow-sm,
          .shadow-md,
          .shadow-lg {
            box-shadow: none !important;
          }
          
          /* Ensure backgrounds print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* Expand collapsed sections for printing */
          [class*="overflow-hidden"] {
            overflow: visible !important;
            height: auto !important;
          }
        }
      `}</style>
    </div>
  );
};

export default StudentSchedules;
