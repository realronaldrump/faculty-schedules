import React, { useState, useMemo } from "react";
import { Search, Filter, ChevronsUpDown, Download } from "lucide-react";
import MultiSelectDropdown from "../MultiSelectDropdown";
import FacultyContactCard from "../FacultyContactCard";
import CourseDetailModal from "../scheduling/CourseDetailModal";
import { parseCourseCode } from "../../utils/courseUtils";
import { parseTime } from "../../utils/timeUtils";
import { getBuildingDisplay } from "../../utils/locationService";
import { getMaxEnrollment } from "../../utils/enrollmentUtils";
import { useData } from "../../contexts/DataContext";
import { useAppConfig } from "../../contexts/AppConfigContext";

const CourseBrowser = ({ embedded = false }) => {
  const { scheduleData = [], facultyData = [] } = useData();
  const { buildingConfigVersion } = useAppConfig();

  const [filters, setFilters] = useState({
    instructor: [],
    day: [],
    room: [],
    program: [],
    searchTerm: "",
    maxEnrollmentMin: "",
    maxEnrollmentMax: "",
  });

  const [sortConfig, setSortConfig] = useState({
    key: "Course",
    direction: "ascending",
  });

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);

  const computeCourseMetadata = (courseCode) => {
    if (!courseCode || typeof courseCode !== "string") {
      return { credits: "", program: "", catalogNumber: "" };
    }
    const parsed = parseCourseCode(courseCode);
    if (parsed?.error) {
      return { credits: "", program: "", catalogNumber: "" };
    }
    const programCode = parsed.program ? parsed.program.toUpperCase() : "";
    return {
      credits: parsed.credits,
      program: programCode,
      catalogNumber: parsed.catalogNumber || "",
    };
  };

  const extractBuildingNameFromLocation = (locationLabel) => {
    if (!locationLabel || typeof locationLabel !== "string") {
      return "Other";
    }
    const lowered = locationLabel.toLowerCase();
    if (lowered.includes("no room needed")) {
      return "No Room Needed";
    }
    const building = getBuildingDisplay(locationLabel);
    return building || "Other";
  };

  // Get unique values for filters
  const uniqueInstructors = useMemo(() => {
    const names = new Set();
    scheduleData.forEach((item) => {
      if (!item) return;
      const list =
        Array.isArray(item.instructorNames) && item.instructorNames.length > 0
          ? item.instructorNames
          : item.Instructor
            ? [item.Instructor]
            : [];
      list.forEach((name) => {
        if (name) names.add(name);
      });
    });
    return Array.from(names).sort();
  }, [scheduleData]);

  const uniqueRooms = useMemo(() => {
    const all = [];
    scheduleData.forEach((item) => {
      if (!item) return;
      if (item.Room && typeof item.Room === "string") {
        item.Room.split(";")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((r) => all.push(r));
      }
    });
    return [...new Set(all)]
      .filter((r) => {
        const lower = r.toLowerCase();
        return lower !== "online" && !lower.includes("no room needed");
      })
      .sort();
  }, [scheduleData]);

  const uniquePrograms = useMemo(() => {
    const programs = new Set();
    scheduleData.forEach((item) => {
      if (!item) return;
      const rawProgram =
        item.program ??
        item.Program ??
        item.subjectCode ??
        item.subject ??
        item["Course Type"];
      if (rawProgram !== undefined && rawProgram !== null) {
        const normalizedProgram = String(rawProgram).trim().toUpperCase();
        if (normalizedProgram) {
          programs.add(normalizedProgram);
        }
      }
    });
    return Array.from(programs).sort();
  }, [scheduleData]);

  const DAYS = ["M", "T", "W", "R", "F"];

  const normalizeEnrollmentInput = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const getMaxEnrollmentDisplay = (item) => {
    const value = getMaxEnrollment(item);
    return value === null ? "—" : value;
  };

  const groupedScheduleData = useMemo(() => {
    const dayOrderMap = { M: 1, T: 2, W: 3, R: 4, F: 5 };
    const groupedMap = {};
    scheduleData.forEach((item) => {
      if (!item) return;
      const baseScheduleId = item._originalId || item.id;
      const instructorKey =
        Array.isArray(item.instructorNames) && item.instructorNames.length > 0
          ? item.instructorNames.join(" / ")
          : item.Instructor || "";
      const key = `${item.Course}|${item.Section}|${item.Term}|${item.CRN}|${instructorKey}|${item["Start Time"]}|${item["End Time"]}|${item.Room || ""}`;
      if (!groupedMap[key]) {
        groupedMap[key] = {
          ...item,
          _daySet: new Set(item.Day ? [item.Day] : []),
          _originalIds: new Set(baseScheduleId ? [baseScheduleId] : []),
        };
      } else if (item.Day) {
        groupedMap[key]._daySet.add(item.Day);
        if (baseScheduleId) groupedMap[key]._originalIds.add(baseScheduleId);
      } else if (baseScheduleId) {
        groupedMap[key]._originalIds.add(baseScheduleId);
      }
    });
    return Object.values(groupedMap).map((entry, index) => {
      const dayPattern = Array.from(entry._daySet)
        .sort((a, b) => dayOrderMap[a] - dayOrderMap[b])
        .join("");
      const { _daySet, _originalIds, ...rest } = entry;
      const originalIds = Array.from(_originalIds || []);
      const uniqueId =
        originalIds.length > 1
          ? `grouped::${index}::${originalIds.join("::")}`
          : originalIds[0] || entry.id;
      return { ...rest, Day: dayPattern, id: uniqueId };
    });
  }, [scheduleData]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [...groupedScheduleData];

    // Search filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      data = data.filter((item) => {
        if (!item) return false;
        const course = (item.Course || "").toLowerCase();
        const title = (item.Title || item["Course Title"] || "").toLowerCase();
        const crn = String(item.CRN || "").toLowerCase();
        const instructorNames = Array.isArray(item.instructorNames)
          ? item.instructorNames.join(" ").toLowerCase()
          : (item.Instructor || "").toLowerCase();
        return (
          course.includes(term) ||
          title.includes(term) ||
          crn.includes(term) ||
          instructorNames.includes(term)
        );
      });
    }

    // Instructor filter
    if (filters.instructor.length > 0) {
      data = data.filter((item) => {
        if (!item) return false;
        const names = Array.isArray(item.instructorNames)
          ? item.instructorNames
          : [item.Instructor];
        return names.some((name) => filters.instructor.includes(name));
      });
    }

    // Day filter
    if (filters.day.length > 0) {
      data = data.filter((item) => {
        if (!item || !item.Day) return false;
        const itemDays = item.Day.toUpperCase();
        return filters.day.some((d) => itemDays.includes(d));
      });
    }

    // Room filter
    if (filters.room.length > 0) {
      data = data.filter((item) => {
        if (!item || !item.Room) return false;
        const itemRooms = item.Room.split(";").map((s) => s.trim());
        return itemRooms.some((r) => filters.room.includes(r));
      });
    }

    // Program filter
    if (filters.program.length > 0) {
      data = data.filter((item) => {
        if (!item) return false;
        const meta = computeCourseMetadata(item.Course);
        return filters.program.includes(meta.program);
      });
    }

    const minMaxEnrollment = normalizeEnrollmentInput(filters.maxEnrollmentMin);
    const maxMaxEnrollment = normalizeEnrollmentInput(filters.maxEnrollmentMax);
    if (minMaxEnrollment !== null || maxMaxEnrollment !== null) {
      data = data.filter((item) => {
        const value = getMaxEnrollment(item);
        if (value === null) return false;
        if (minMaxEnrollment !== null && value < minMaxEnrollment) return false;
        if (maxMaxEnrollment !== null && value > maxMaxEnrollment) return false;
        return true;
      });
    }

    return data;
  }, [groupedScheduleData, filters]);

  // Sort data
  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      let aVal, bVal;

      if (sortConfig.key === "Instructor") {
        aVal = Array.isArray(a?.instructorNames)
          ? a.instructorNames[0] || ""
          : a?.Instructor || "";
        bVal = Array.isArray(b?.instructorNames)
          ? b.instructorNames[0] || ""
          : b?.Instructor || "";
      } else if (sortConfig.key === "Time") {
        aVal = parseTime(a?.["Start Time"]);
        bVal = parseTime(b?.["Start Time"]);
        if (aVal === null) aVal = 9999;
        if (bVal === null) bVal = 9999;
      } else if (sortConfig.key === "Max Enrollment") {
        aVal = getMaxEnrollment(a);
        bVal = getMaxEnrollment(b);
        if (aVal === null) aVal = 9999;
        if (bVal === null) bVal = 9999;
      } else {
        aVal = a?.[sortConfig.key] ?? "";
        bVal = b?.[sortConfig.key] ?? "";
      }

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortConfig.direction === "ascending" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "ascending" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
  };

  const clearFilters = () => {
    setFilters({
      instructor: [],
      day: [],
      room: [],
      program: [],
      searchTerm: "",
      maxEnrollmentMin: "",
      maxEnrollmentMax: "",
    });
  };

  const hasActiveFilters =
    filters.instructor.length > 0 ||
    filters.day.length > 0 ||
    filters.room.length > 0 ||
    filters.program.length > 0 ||
    filters.searchTerm ||
    filters.maxEnrollmentMin ||
    filters.maxEnrollmentMax;

  const handleDownloadCSV = () => {
    const headers = [
      "Course",
      "Section",
      "Title",
      "Instructor",
      "Days",
      "Time",
      "Room",
      "Max Enrollment",
    ];
    const rows = sortedData.map((item) => {
      const instructorDisplay = Array.isArray(item.instructorNames)
        ? item.instructorNames.join(", ")
        : item.Instructor || "";
      const startTime = item["Start Time"] || "";
      const endTime = item["End Time"] || "";
      const timeDisplay =
        startTime && endTime
          ? `${startTime} - ${endTime}`
          : startTime || endTime || "";
      return [
        item.Course || "",
        item.Section || "",
        item.Title || item["Course Title"] || "",
        instructorDisplay,
        item.Day || "",
        timeDisplay,
        item.Room || "",
        getMaxEnrollment(item) ?? "",
      ];
    });
    const escapeCell = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `course-browse-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleShowContactCard = (facultyIdOrName, displayName) => {
    const faculty = facultyData.find(
      (f) => f.id === facultyIdOrName || f.name === facultyIdOrName,
    );
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    } else {
      setSelectedFacultyForCard({ name: displayName || facultyIdOrName });
    }
  };

  const SortableHeader = ({ label, sortKey }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ChevronsUpDown
          size={14}
          className={`text-gray-400 ${sortConfig.key === sortKey ? "text-baylor-green" : ""}`}
        />
      </div>
    </th>
  );

  return (
    <div className={`space-y-4 ${embedded ? "" : "p-6"}`}>
      {/* Header */}
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Course Browser
          </h1>
          <p className="text-gray-600">
            Browse and search course schedules across the department.
          </p>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by course, title, CRN, or instructor..."
              value={filters.searchTerm}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))
              }
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap gap-2">
            <MultiSelectDropdown
              options={uniqueInstructors}
              selected={filters.instructor}
              onChange={(values) =>
                setFilters((prev) => ({ ...prev, instructor: values }))
              }
              placeholder="All Instructors"
            />
            <MultiSelectDropdown
              options={DAYS}
              selected={filters.day}
              onChange={(values) =>
                setFilters((prev) => ({ ...prev, day: values }))
              }
              placeholder="All Days"
            />
            <MultiSelectDropdown
              options={uniqueRooms}
              selected={filters.room}
              onChange={(values) =>
                setFilters((prev) => ({ ...prev, room: values }))
              }
              placeholder="All Rooms"
            />
            <MultiSelectDropdown
              options={uniquePrograms}
              selected={filters.program}
              onChange={(values) =>
                setFilters((prev) => ({ ...prev, program: values }))
              }
              placeholder="All Programs"
            />
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 bg-white">
              <span className="text-xs text-gray-500 whitespace-nowrap">
                Max Enroll
              </span>
              <input
                type="number"
                min="0"
                value={filters.maxEnrollmentMin}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    maxEnrollmentMin: e.target.value,
                  }))
                }
                className="w-16 text-sm text-gray-700 focus:outline-none"
                placeholder="Min"
              />
              <span className="text-gray-300">–</span>
              <input
                type="number"
                min="0"
                value={filters.maxEnrollmentMax}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    maxEnrollmentMax: e.target.value,
                  }))
                }
                className="w-16 text-sm text-gray-700 focus:outline-none"
                placeholder="Max"
              />
            </div>
          </div>
        </div>

        {/* Active Filters Summary */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {hasActiveFilters && <Filter size={14} className="text-gray-500" />}
          <span className="text-gray-600">
            Showing {sortedData.length} of {groupedScheduleData.length} courses
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-baylor-green hover:underline ml-2"
            >
              Clear filters
            </button>
          )}
          <button
            onClick={handleDownloadCSV}
            className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Course Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortableHeader label="Course" sortKey="Course" />
                <SortableHeader label="Section" sortKey="Section" />
                <SortableHeader label="Title" sortKey="Title" />
                <SortableHeader label="Instructor" sortKey="Instructor" />
                <SortableHeader label="Days" sortKey="Day" />
                <SortableHeader label="Time" sortKey="Time" />
                <SortableHeader label="Room" sortKey="Room" />
                <SortableHeader label="Max Enrollment" sortKey="Max Enrollment" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {hasActiveFilters
                      ? "No courses match your filters."
                      : "No courses found."}
                  </td>
                </tr>
              ) : (
                sortedData.map((item, index) => {
                  const instructorDisplay = Array.isArray(item.instructorNames)
                    ? item.instructorNames.join(", ")
                    : item.Instructor || "—";

                  const startTime = item["Start Time"] || "";
                  const endTime = item["End Time"] || "";
                  const timeDisplay =
                    startTime && endTime
                      ? `${startTime} - ${endTime}`
                      : startTime || endTime || "—";

                  return (
                    <tr
                      key={item.id || `${item.Course}-${item.Section}-${index}`}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedCourse(item)}
                    >
                      <td className="px-4 py-3 font-medium text-baylor-green">
                        {item.Course || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.Section || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                        {item.Title || item["Course Title"] || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {instructorDisplay}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.Day || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {timeDisplay}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.Room || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {getMaxEnrollmentDisplay(item)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Results count footer */}
        {sortedData.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            Showing {sortedData.length} course
            {sortedData.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Course Detail Modal */}
      {selectedCourse && (
        <CourseDetailModal
          item={selectedCourse}
          pattern={selectedCourse.Day}
          room={selectedCourse.Room}
          building={extractBuildingNameFromLocation(selectedCourse.Room)}
          onClose={() => setSelectedCourse(null)}
          onShowContactCard={handleShowContactCard}
        />
      )}

      {/* Faculty Contact Card Modal */}
      {selectedFacultyForCard && (
        <FacultyContactCard
          faculty={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
        />
      )}
    </div>
  );
};

export default CourseBrowser;
