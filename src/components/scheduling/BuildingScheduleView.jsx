import React, { useMemo, useRef } from "react";
import { Building, Clock, Users, Briefcase, Download } from "lucide-react";

/**
 * BuildingScheduleView - Building-focused schedule grid for printing and display
 *
 * Key features:
 * - Organizes schedules by building in a clear weekly grid
 * - Shows student worker, job title, and time ranges clearly
 * - Print-optimized layout
 * - Job filtering support
 * - Handles overlapping schedules with stacked display
 * - Responsive: fits viewport without scrolling
 */

const DAY_ORDER = ["M", "T", "W", "R", "F"];
const DAY_LABELS = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
};

const FULL_DAY_LABELS = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

// Color accents for different job titles (consistent per job)
const JOB_ACCENTS = [
  { bg: "#E8F5E9", border: "#2E7D32", text: "#1B5E20" },
  { bg: "#E3F2FD", border: "#1565C0", text: "#0D47A1" },
  { bg: "#FFF3E0", border: "#EF6C00", text: "#E65100" },
  { bg: "#F3E5F5", border: "#7B1FA2", text: "#4A148C" },
  { bg: "#E0F2F1", border: "#00897B", text: "#00695C" },
  { bg: "#FFF8E1", border: "#F9A825", text: "#F57F17" },
  { bg: "#ECEFF1", border: "#546E7A", text: "#37474F" },
  { bg: "#FBE9E7", border: "#D84315", text: "#BF360C" },
];

const getJobAccent = (jobTitle) => {
  if (!jobTitle) return JOB_ACCENTS[0];
  let hash = 0;
  for (let i = 0; i < jobTitle.length; i++) {
    hash = jobTitle.charCodeAt(i) + ((hash << 5) - hash);
  }
  return JOB_ACCENTS[Math.abs(hash) % JOB_ACCENTS.length];
};

const parseTime = (timeStr) => {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const formatTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hr12 = ((h + 11) % 12) + 1;
  return `${hr12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

const formatTimeRange = (start, end) => {
  const startStr = formatTime(parseTime(start));
  const endStr = formatTime(parseTime(end));
  return `${startStr} - ${endStr}`;
};

const BuildingScheduleView = ({
  students = [],
  selectedBuildings = [],
  selectedJobTitles = [],
  dayView = "All",
  onPrint,
  onExport,
}) => {
  const printRef = useRef(null);

  // Group students and their schedules by building
  const buildingSchedules = useMemo(() => {
    const buildingMap = new Map();

    students.forEach((student) => {
      const assignments = student.visibleAssignments || [];

      assignments.forEach((assignment) => {
        // Filter by job title if specified
        if (
          selectedJobTitles.length > 0 &&
          !selectedJobTitles.includes(assignment.jobTitle)
        ) {
          return;
        }

        const buildings = Array.isArray(assignment.buildings)
          ? assignment.buildings
          : [];

        buildings.forEach((building) => {
          if (!building) return;

          // Filter by building if specified
          if (
            selectedBuildings.length > 0 &&
            !selectedBuildings.includes(building)
          ) {
            return;
          }

          if (!buildingMap.has(building)) {
            buildingMap.set(building, []);
          }

          const scheduleEntries = Array.isArray(assignment.schedule)
            ? assignment.schedule
            : [];

          scheduleEntries.forEach((entry) => {
            if (!entry || !entry.day) return;
            if (dayView !== "All" && entry.day !== dayView) return;
            if (!DAY_ORDER.includes(entry.day)) return;

            buildingMap.get(building).push({
              student,
              assignment,
              entry,
              day: entry.day,
              startMinutes: parseTime(entry.start),
              endMinutes: parseTime(entry.end),
            });
          });
        });
      });
    });

    // Sort entries within each building by day, then by start time
    buildingMap.forEach((entries) => {
      entries.sort((a, b) => {
        const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
        if (dayDiff !== 0) return dayDiff;
        return a.startMinutes - b.startMinutes;
      });
    });

    // Convert to array and sort buildings
    return Array.from(buildingMap.entries())
      .map(([building, entries]) => ({ building, entries }))
      .sort((a, b) => a.building.localeCompare(b.building));
  }, [students, selectedBuildings, selectedJobTitles, dayView]);

  // Group entries by day within each building
  const getEntriesByDay = (entries) => {
    const byDay = {};
    DAY_ORDER.forEach((day) => {
      byDay[day] = entries.filter((e) => e.day === day);
    });
    return byDay;
  };

  // Calculate time range for a day's entries
  const getDayTimeRange = (entries) => {
    if (entries.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    entries.forEach((e) => {
      if (e.startMinutes !== null) min = Math.min(min, e.startMinutes);
      if (e.endMinutes !== null) max = Math.max(max, e.endMinutes);
    });
    return { start: min, end: max };
  };

  const handleExport = () => {
    if (onExport) {
      onExport(buildingSchedules);
    }
  };

  if (buildingSchedules.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <Building size={48} className="mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">
          No Building Schedules Found
        </h3>
        <p className="text-gray-500">
          Adjust your filters to see student worker schedules by building.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-300px)] min-h-[400px]">
      {/* Header with actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 print:hidden shrink-0">
        <div className="flex items-center gap-2">
          <Building size={20} className="text-baylor-green" />
          <span className="font-semibold text-gray-800">
            Building Schedule View
          </span>
          <span className="text-sm text-gray-500">
            ({buildingSchedules.length} building
            {buildingSchedules.length !== 1 ? "s" : ""})
          </span>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-baylor-green bg-white border border-baylor-green rounded-lg hover:bg-baylor-green hover:text-white transition-colors"
          title="Export building schedules"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      {/* Legend for job colors */}
      {selectedJobTitles.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 print:hidden shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              Job Legend
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedJobTitles.map((jobTitle) => {
              const accent = getJobAccent(jobTitle);
              return (
                <span
                  key={jobTitle}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: accent.bg,
                    color: accent.text,
                    border: `1px solid ${accent.border}`,
                  }}
                >
                  {jobTitle}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Building schedules - scrollable container */}
      <div ref={printRef} className="flex-1 overflow-y-auto space-y-6 pr-2">
        {buildingSchedules.map(({ building, entries }) => {
          const entriesByDay = getEntriesByDay(entries);
          const visibleDays =
            dayView === "All"
              ? DAY_ORDER.filter((d) => entriesByDay[d].length > 0)
              : [dayView].filter((d) => entriesByDay[d].length > 0);

          if (visibleDays.length === 0) return null;

          return (
            <div
              key={building}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden building-schedule-sheet"
              data-export-name={`Building-${building.replace(/\s+/g, "-")}`}
            >
              {/* Building Header */}
              <div className="bg-gradient-to-r from-baylor-green to-baylor-green-dark px-6 py-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building size={24} className="text-white" />
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        {building}
                      </h2>
                      <p className="text-baylor-gold text-sm">
                        {entries.length} scheduled shift
                        {entries.length !== 1 ? "s" : ""} ·{" "}
                        {new Set(entries.map((e) => e.student.id)).size} student
                        {new Set(entries.map((e) => e.student.id)).size !== 1
                          ? "s"
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="hidden print:block text-white text-sm">
                    Generated: {new Date().toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Weekly Grid - Responsive columns */}
              <div className="p-4 md:p-6 overflow-x-auto">
                <div
                  className="grid gap-3 md:gap-4 min-w-fit"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(visibleDays.length, 5)}, minmax(160px, 1fr))`,
                  }}
                >
                  {visibleDays.map((day) => {
                    const dayEntries = entriesByDay[day];
                    const timeRange = getDayTimeRange(dayEntries);

                    return (
                      <div
                        key={day}
                        className="border border-gray-200 rounded-lg overflow-hidden flex flex-col"
                      >
                        {/* Day Header */}
                        <div className="bg-gray-50 px-3 md:px-4 py-2 md:py-3 border-b border-gray-200 shrink-0">
                          <div className="font-semibold text-baylor-green text-sm md:text-base">
                            {FULL_DAY_LABELS[day]}
                          </div>
                          <div className="text-xs text-gray-500">
                            {dayEntries.length} shift
                            {dayEntries.length !== 1 ? "s" : ""}
                            {timeRange && (
                              <span className="ml-1">
                                · {formatTime(timeRange.start)} -{" "}
                                {formatTime(timeRange.end)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Day Entries - Compact layout */}
                        <div className="p-2 md:p-3 space-y-2">
                          {dayEntries.map((item, idx) => {
                            const accent = getJobAccent(
                              item.assignment.jobTitle,
                            );
                            return (
                              <div
                                key={idx}
                                className="rounded-md p-2 md:p-3 text-xs md:text-sm transition-shadow hover:shadow-md"
                                style={{
                                  backgroundColor: accent.bg,
                                  borderLeft: `4px solid ${accent.border}`,
                                }}
                              >
                                {/* Student Name */}
                                <div className="font-semibold text-gray-900 mb-0.5 md:mb-1 truncate">
                                  {item.student.name}
                                </div>

                                {/* Time */}
                                <div className="flex items-center gap-1 text-gray-700">
                                  <Clock
                                    size={10}
                                    className="text-gray-500 md:hidden"
                                  />
                                  <Clock
                                    size={12}
                                    className="text-gray-500 hidden md:block"
                                  />
                                  <span className="text-xs">
                                    {formatTimeRange(
                                      item.entry.start,
                                      item.entry.end,
                                    )}
                                  </span>
                                </div>

                                {/* Job Title */}
                                {item.assignment.jobTitle && (
                                  <div
                                    className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded text-[10px] md:text-xs font-medium mt-1"
                                    style={{
                                      backgroundColor: accent.border,
                                      color: "white",
                                    }}
                                  >
                                    <Briefcase size={8} className="md:hidden" />
                                    <Briefcase
                                      size={10}
                                      className="hidden md:block"
                                    />
                                    <span className="truncate max-w-[100px] md:max-w-none">
                                      {item.assignment.jobTitle}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary Footer */}
              <div className="bg-gray-50 px-4 md:px-6 py-2 md:py-3 border-t border-gray-200 shrink-0">
                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs md:text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Users size={12} className="md:hidden" />
                    <Users size={14} className="hidden md:block" />
                    <span>
                      {new Set(entries.map((e) => e.student.id)).size} student
                      {new Set(entries.map((e) => e.student.id)).size !== 1
                        ? "s"
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Briefcase size={12} className="md:hidden" />
                    <Briefcase size={14} className="hidden md:block" />
                    <span>
                      {new Set(entries.map((e) => e.assignment.jobTitle)).size}{" "}
                      job{" "}
                      {new Set(entries.map((e) => e.assignment.jobTitle))
                        .size !== 1
                        ? "types"
                        : "type"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="md:hidden" />
                    <Clock size={14} className="hidden md:block" />
                    <span>
                      {entries.length} total shift
                      {entries.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .building-schedule-sheet {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 20px;
          }
          
          .building-schedule-sheet + .building-schedule-sheet {
            page-break-before: always;
          }
        }
      `}</style>
    </div>
  );
};

export default BuildingScheduleView;
