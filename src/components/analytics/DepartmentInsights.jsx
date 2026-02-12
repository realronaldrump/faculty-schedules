import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Users,
  Clock,
  MapPin,
  BookOpen,
  ArrowUpDown,
  X,
  TrendingUp,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import FacultyContactCard from "../FacultyContactCard";
import { parseTime, formatMinutesToTime } from "../../utils/timeUtils";
import { useData } from "../../contexts/DataContext";
import { usePeople } from "../../contexts/PeopleContext";
import { splitMultiRoom, isSkippableLocation } from "../../utils/locationService";

const DepartmentInsights = () => {
  const navigate = useNavigate();
  const {
    scheduleData = [],
    facultyData = [],
    analytics,
    selectedSemester,
  } = useData();
  const { loadPeople } = usePeople();
  const [showWarning, setShowWarning] = useState(
    () => localStorage.getItem("insightsWarningDismissed") !== "true",
  );
  const [facultySort, setFacultySort] = useState({
    key: "totalHours",
    direction: "desc",
  });
  const [roomSort, setRoomSort] = useState({ key: "hours", direction: "desc" });
  const [hourlyUsageDayFilter, setHourlyUsageDayFilter] = useState("All");
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [selectedHourPopup, setSelectedHourPopup] = useState(null);
  const [popupAnchor, setPopupAnchor] = useState(null);
  const [popupPosition, setPopupPosition] = useState(null);
  const popupPanelRef = useRef(null);

  const dayNames = {
    M: "Monday",
    T: "Tuesday",
    W: "Wednesday",
    R: "Thursday",
    F: "Friday",
  };

  const handleNavigate = useCallback(
    (path) => {
      const normalized = path.startsWith("/") ? path : `/${path}`;
      navigate(normalized);
    },
    [navigate],
  );

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  // Calculate hourly usage (specific to this component)
  const filteredHourCounts = useMemo(() => {
    const isDayMatch = (rawDay) => {
      if (hourlyUsageDayFilter === "All") return true;
      if (!rawDay) return false;
      const normalized = String(rawDay)
        .toUpperCase()
        .replace(/[^MTWRF]/g, "");
      return normalized.includes(hourlyUsageDayFilter);
    };

    const dataToProcess =
      hourlyUsageDayFilter === "All"
        ? scheduleData
        : scheduleData.filter((item) => isDayMatch(item.Day));

    const hourCourseMap = {};

    if (dataToProcess.length === 0) {
      const emptyCounts = {};
      for (let hour = 8; hour <= 17; hour++) emptyCounts[hour] = 0;
      for (let hour = 8; hour <= 17; hour++) {
        hourCourseMap[hour] = [];
      }
      return {
        hourCounts: emptyCounts,
        latestEndTime: 17 * 60,
        peakHour: { hour: 8, count: 0 },
        hourCourseMap,
      };
    }

    let latestEndTime = 17 * 60;
    dataToProcess.forEach((item) => {
      const start = parseTime(item["Start Time"]);
      const end = parseTime(item["End Time"]);
      if (start == null || end == null || end <= start) return;
      if (end && end > latestEndTime) latestEndTime = end;
      const roomCandidates = (splitMultiRoom(item.Room || "")
        .filter((room) => !isSkippableLocation(room))
        .filter(Boolean));

      if (roomCandidates.length === 0) return;

      const startHour = Math.floor(start / 60);
      const endHour = Math.ceil(end / 60);
      if (endHour < 8 || startHour > 23) return;

      const normalizedCourse = {
        course: item.Course || "Unknown Course",
        section: item.Section || "",
        title: item["Course Title"] || item.Title || "",
        instructor: item.Instructor || "",
        startMinutes: start,
        endMinutes: end,
        timeRange: `${formatMinutesToTime(start)} - ${formatMinutesToTime(end)}`,
      };

      roomCandidates.forEach((room) => {
        for (let hour = Math.max(8, startHour); hour < endHour; hour++) {
          if (!hourCourseMap[hour]) hourCourseMap[hour] = [];
          hourCourseMap[hour].push({
            ...normalizedCourse,
            room,
            id: `${normalizedCourse.course}-${normalizedCourse.section}-${start}-${end}-${room}-${hour}`,
          });
        }
      });
    });

    const minHour = 8;
    const maxHour = Math.max(Math.ceil(latestEndTime / 60), 17);
    const hourCounts = {};
    for (let hour = minHour; hour <= maxHour; hour++) {
      const entries = hourCourseMap[hour] || [];
      const sorted = [...entries].sort((a, b) => {
        const roomCompare = (a.room || "").localeCompare(b.room || "", undefined, {
          numeric: true,
          sensitivity: "base",
        });
        if (roomCompare !== 0) return roomCompare;
        return a.startMinutes - b.startMinutes;
      });
      hourCourseMap[hour] = sorted;
      hourCounts[hour] = sorted.length;
    }

    const peakHour = Object.entries(hourCounts).reduce(
      (max, [hour, count]) =>
        count > max.count ? { hour: parseInt(hour), count } : max,
      { hour: 8, count: 0 },
    );

    return { hourCounts, latestEndTime, peakHour, hourCourseMap };
  }, [scheduleData, hourlyUsageDayFilter]);

  const adjunctFacultyCount = useMemo(() => {
    if (!scheduleData || scheduleData.length === 0) return 0;
    const adjunctFacultyIds = new Set();

    scheduleData.forEach((item) => {
      const instructors = Array.isArray(item.instructors)
        ? item.instructors
        : [];
      instructors.forEach((instructor) => {
        if (!instructor?.isAdjunct) return;
        if (instructor.id) {
          adjunctFacultyIds.add(instructor.id);
          return;
        }
        if (instructor.name) {
          adjunctFacultyIds.add(instructor.name);
          return;
        }
        const fallbackName = `${instructor.firstName || ""} ${
          instructor.lastName || ""
        }`.trim();
        if (fallbackName) {
          adjunctFacultyIds.add(fallbackName);
        }
      });
    });

    return adjunctFacultyIds.size;
  }, [scheduleData]);

  // Sort faculty workload from the analytics prop
  const sortedFacultyWorkload = useMemo(() => {
    if (!analytics || !analytics.facultyWorkload) return [];
    const { key, direction } = facultySort;
    return Object.entries(analytics.facultyWorkload).sort(
      ([profA, dataA], [profB, dataB]) => {
        let valA, valB;
        if (key === "name") {
          valA = profA;
          valB = profB;
        } else {
          valA = dataA[key];
          valB = dataB[key];
        }
        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
      },
    );
  }, [analytics, facultySort]);

  // Sort room utilization from the analytics prop
  const sortedRoomUtilization = useMemo(() => {
    if (!analytics || !analytics.roomUtilization) return [];
    const { key, direction } = roomSort;
    return Object.entries(analytics.roomUtilization).sort(
      ([roomA, dataA], [roomB, dataB]) => {
        let valA, valB;
        if (key === "name") {
          valA = roomA;
          valB = roomB;
        } else {
          valA = dataA[key];
          valB = dataB[key];
        }
        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
      },
    );
  }, [analytics, roomSort]);

  // Event handlers
  const handleFacultySort = (key) => {
    setFacultySort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  const handleDismissWarning = () => {
    setShowWarning(false);
    localStorage.setItem("insightsWarningDismissed", "true");
  };

  const handleShowContactCard = (facultyName) => {
    const faculty = facultyData.find((f) => f.name === facultyName);
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    }
  };

  const closeHourPopup = useCallback(() => {
    setSelectedHourPopup(null);
    setPopupAnchor(null);
    setPopupPosition(null);
  }, []);

  const openHourPopup = useCallback(
    (hour, items, event) => {
      if (!event?.currentTarget) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      setSelectedHourPopup({
        hour,
        items,
      });
      setPopupAnchor({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      });
      setPopupPosition(null);
    },
    [],
  );

  useEffect(() => {
    if (!selectedHourPopup || !popupAnchor) return;

    const placePopup = () => {
      const panel = popupPanelRef.current;
      if (!panel) return;

      const margin = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelRect = panel.getBoundingClientRect();
      const panelWidth = panelRect.width;
      const panelHeight = panelRect.height;

      let left;
      let top;

      if (viewportWidth < 768) {
        left = margin;
        top = Math.max(margin, viewportHeight - panelHeight - margin);
      } else {
        left = popupAnchor.right + 12;
        if (left + panelWidth > viewportWidth - margin) {
          left = popupAnchor.left - panelWidth - 12;
        }
        if (left < margin) {
          left = Math.max(
            margin,
            Math.min(
              popupAnchor.left + (popupAnchor.width - panelWidth) / 2,
              viewportWidth - panelWidth - margin,
            ),
          );
        }

        top = popupAnchor.top + popupAnchor.height / 2 - panelHeight / 2;
        top = Math.max(margin, Math.min(top, viewportHeight - panelHeight - margin));
      }

      setPopupPosition({ left, top });
    };

    const raf = window.requestAnimationFrame(placePopup);
    const handleViewportChange = () => placePopup();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [selectedHourPopup, popupAnchor]);

  useEffect(() => {
    if (!selectedHourPopup) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeHourPopup();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedHourPopup, closeHourPopup]);

  useEffect(() => {
    closeHourPopup();
  }, [hourlyUsageDayFilter, closeHourPopup]);

  const SortableHeader = ({ label, sortKey, currentSort, onSort }) => {
    const isActive = currentSort.key === sortKey;
    const Icon = isActive ? (
      currentSort.direction === "asc" ? (
        "▲"
      ) : (
        "▼"
      )
    ) : (
      <ArrowUpDown size={14} className="inline-block text-gray-400" />
    );
    return (
      <th className="table-header-cell">
        <button
          className="flex items-center gap-2 hover:text-baylor-green/80 transition-colors"
          onClick={() => onSort(sortKey)}
        >
          {label}
          <span className="w-4">{Icon}</span>
        </button>
      </th>
    );
  };

  if (!analytics) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Department Insights
          </h1>
          <p className="text-gray-600">
            Analytics and metrics for faculty scheduling
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No Data Available
          </h2>
          <p className="text-gray-600 mb-6">
            Import schedule data to view department analytics and insights
          </p>
          <button
            onClick={() => handleNavigate("admin-tools/import-wizard")}
            className="px-6 py-3 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors font-medium"
          >
            Import Schedule Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Department Insights
        </h1>
        <p className="text-gray-600">
          Analytics and metrics for faculty scheduling
        </p>
      </div>

      {/* Warning Banner */}
      {showWarning && (
        <div className="bg-baylor-gold/10 border border-baylor-gold/30 rounded-lg p-4 text-baylor-green relative">
          <button
            onClick={handleDismissWarning}
            className="absolute top-2 right-2 p-1 hover:bg-baylor-gold/20 rounded-full transition-colors"
          >
            <X size={16} className="text-baylor-green" />
          </button>
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-baylor-gold mr-3 mt-0.5 flex-shrink-0" />
            <div className="pr-6">
              <p className="text-sm font-medium">Data Verification Notice</p>
              <p className="text-sm mt-1">
                This data is still being refined and may not reflect the final
                schedule. Please verify any critical information with the
                department and official University{" "}
                <button
                  onClick={() => handleNavigate("help/baylor-systems")}
                  className="text-baylor-gold hover:text-baylor-green underline transition-colors"
                >
                  systems
                </button>
                .
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Faculty Members
              </p>
              <p className="text-3xl font-bold text-baylor-green">
                {analytics.facultyCount}
              </p>
              <button
                className="block text-sm text-gray-500 hover:text-baylor-green transition-colors underline decoration-transparent hover:decoration-baylor-gold/60 underline-offset-4"
                onClick={() => handleNavigate("people/directory?tab=faculty")}
              >
                Teaching this semester
              </button>
              <button
                className="mt-1 block text-sm text-gray-500 hover:text-baylor-green transition-colors underline decoration-transparent hover:decoration-baylor-gold/60 underline-offset-4"
                onClick={() => handleNavigate("people/directory?tab=adjunct")}
              >
                {adjunctFacultyCount} adjunct faculty
              </button>
            </div>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <Users className="w-6 h-6 text-baylor-green" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Weekly Sessions
              </p>
              <p className="text-3xl font-bold text-baylor-green">
                {analytics.totalSessions}
              </p>
              <p className="text-sm text-gray-500">
                {analytics.adjunctTaughtSessions} adjunct-taught
              </p>
            </div>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <BookOpen className="w-6 h-6 text-baylor-green" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Classrooms</p>
              <p className="text-3xl font-bold text-baylor-green">
                {analytics.roomsInUse}
              </p>
              <p className="text-sm text-gray-500">In active use</p>
            </div>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <MapPin className="w-6 h-6 text-baylor-green" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Peak Hour</p>
              <p className="text-3xl font-bold text-baylor-green">
                {formatMinutesToTime(
                  filteredHourCounts.peakHour.hour * 60,
                ).replace(":00", "")}
              </p>
              <p className="text-sm text-gray-500">
                {filteredHourCounts.peakHour.count} rooms in use
              </p>
            </div>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <Clock className="w-6 h-6 text-baylor-green" />
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Usage Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 border-b border-baylor-gold/30 pb-4 gap-4">
          <div>
            <h3 className="text-lg font-serif font-semibold text-baylor-green">
              Hourly Room Usage
            </h3>
            <p className="text-sm text-gray-600">
              Room utilization throughout the day • Showing until{" "}
              {formatMinutesToTime(filteredHourCounts.latestEndTime)}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            {["All", "M", "T", "W", "R", "F"].map((day) => (
              <button
                key={day}
                onClick={() => setHourlyUsageDayFilter(day)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  hourlyUsageDayFilter === day
                    ? "bg-baylor-green text-white shadow"
                    : "text-gray-600 hover:bg-gray-200"
                }`}
              >
                {day === "All" ? "All" : dayNames[day]?.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {Object.entries(filteredHourCounts.hourCounts).map(
            ([hour, count]) => {
              const maxCount = Math.max(
                ...Object.values(filteredHourCounts.hourCounts),
                1,
              );
              const hourCourses = filteredHourCounts.hourCourseMap?.[hour] || [];
              return (
                <div
                  key={hour}
                  role="button"
                  tabIndex={0}
                  onClick={(event) =>
                    openHourPopup(parseInt(hour, 10), hourCourses, event)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openHourPopup(parseInt(hour, 10), hourCourses, event);
                    }
                  }}
                  className="flex items-center w-full text-left group p-2 rounded-md hover:bg-baylor-gold/10 transition-colors"
                >
                  <div className="w-20 text-sm text-baylor-green font-medium">
                    {formatMinutesToTime(parseInt(hour) * 60).replace(
                      ":00",
                      "",
                    )}
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-gray-200 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="bg-baylor-green h-6 rounded-full transition-all duration-500 group-hover:bg-baylor-gold relative"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      >
                        {count > 0 && (
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                            {count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="w-24 text-sm text-baylor-green font-medium text-right">
                    {count} {count === 1 ? "room" : "rooms"}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>

      {selectedHourPopup ? (
        <div
          className="fixed inset-0 z-40"
          onClick={closeHourPopup}
          role="presentation"
        >
          <div className="absolute inset-0 bg-black/10" />
          <div
            ref={popupPanelRef}
            style={{
              top: `${popupPosition?.top ?? popupAnchor?.top ?? 16}px`,
              left: `${popupPosition?.left ?? popupAnchor?.left ?? 16}px`,
            }}
            className={`fixed z-50 w-[min(420px,calc(100vw-1.5rem))] max-h-[min(70vh,560px)] bg-white border border-gray-200 rounded-lg shadow-2xl overflow-hidden transition-opacity duration-100 ${popupPosition ? "opacity-100" : "opacity-0"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-1 bg-baylor-gold" />
            <div className="px-4 py-3 border-b border-gray-200 bg-baylor-green/5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  Hourly Room Usage
                </div>
                <h4 className="text-lg font-serif font-semibold text-baylor-green">
                  {formatMinutesToTime(selectedHourPopup.hour * 60).replace(":00", "")}
                </h4>
                <p className="text-sm text-gray-600 mt-0.5">
                  {selectedHourPopup.items.length}{" "}
                  {selectedHourPopup.items.length === 1 ? "course" : "courses"} in rooms
                </p>
              </div>
              <button
                type="button"
                onClick={closeHourPopup}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
                aria-label="Close room usage popup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4">
              <div className="mb-3 text-xs text-gray-600">
                Day filter: {hourlyUsageDayFilter === "All" ? "All days" : hourlyUsageDayFilter}
              </div>

              {selectedHourPopup.items.length > 0 ? (
                <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                  {selectedHourPopup.items.map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                    >
                      <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2">
                        <div className="w-full sm:w-24 shrink-0 text-sm font-semibold text-baylor-green">
                          {entry.room || "—"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-baylor-green truncate">
                            {entry.course}
                            {entry.section ? ` Sec ${entry.section}` : null}
                          </div>
                          {entry.title ? (
                            <div className="text-xs text-gray-600 truncate">
                              {entry.title}
                            </div>
                          ) : null}
                          {entry.instructor ? (
                            <div className="text-xs text-gray-500 truncate">
                              {entry.instructor}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-700 font-medium whitespace-nowrap">
                          {entry.timeRange}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-sm text-gray-600 py-8">
                  No in-room sessions at this hour for this filter.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Faculty Workload */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6 border-b border-baylor-gold/30 pb-4">
          <div>
            <h3 className="text-lg font-serif font-semibold text-baylor-green">
              Faculty Teaching Load
            </h3>
            <p className="text-sm text-gray-600">
              Credit hours and course assignments by faculty member
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="university-table">
            <thead>
              <tr>
                <SortableHeader
                  label="Professor"
                  sortKey="name"
                  currentSort={facultySort}
                  onSort={handleFacultySort}
                />
                <SortableHeader
                  label="Unique Courses"
                  sortKey="courses"
                  currentSort={facultySort}
                  onSort={handleFacultySort}
                />
                <SortableHeader
                  label="Credit Hours"
                  sortKey="totalHours"
                  currentSort={facultySort}
                  onSort={handleFacultySort}
                />
                <th className="table-header-cell">
                  Load Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFacultyWorkload.map(([instructor, data]) => {
                const loadStatus =
                  data.totalHours >= 12
                    ? "high"
                    : data.totalHours >= 6
                      ? "moderate"
                      : "light";
                const statusColors = {
                  high: "bg-red-100 text-red-800",
                  moderate: "bg-yellow-100 text-yellow-800",
                  light: "bg-green-100 text-green-800",
                };

                return (
                  <tr
                    key={instructor}
                    className="transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-baylor-green font-medium">
                      <button
                        className="hover:underline text-left"
                        onClick={() => handleShowContactCard(instructor)}
                      >
                        {instructor}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-baylor-green/80 text-center font-medium">
                      {data.courses}
                    </td>
                    <td className="px-4 py-3 text-sm text-baylor-green/80 font-bold text-center">
                      {data.totalHours.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[loadStatus]}`}
                      >
                        {loadStatus} load
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Room Utilization */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6 border-b border-baylor-gold/30 pb-4">
          <div>
            <h3 className="text-lg font-serif font-semibold text-baylor-green">
              Room Utilization
            </h3>
            <p className="text-sm text-gray-600">
              Weekly usage statistics by classroom
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedRoomUtilization.map(([room, data]) => (
            <div
              key={room}
              className="border border-baylor-green/20 rounded-lg p-4 bg-baylor-green/5 hover:bg-baylor-green/10 transition-all"
            >
              <div className="font-medium text-baylor-green text-sm mb-2">
                {room}
              </div>
              <div className="text-2xl font-bold text-baylor-green">
                {data.hours.toFixed(1)}h
              </div>
              <div className="text-sm text-baylor-green/80">
                {data.classes} sessions/week
                {data.adjunctTaughtClasses > 0 && (
                  <span className="ml-2 text-baylor-gold font-medium">
                    ({data.adjunctTaughtClasses} adjunct)
                  </span>
                )}
              </div>
              <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-baylor-green h-2 rounded-full"
                    style={{
                      width: `${Math.min((data.hours / 40) * 100, 100)}%`,
                    }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {((data.hours / 40) * 100).toFixed(0)}% utilization
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Faculty Contact Card Modal */}
      {selectedFacultyForCard && (
        <FacultyContactCard
          person={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
        />
      )}
    </div>
  );
};

export default DepartmentInsights;
