import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Clock,
  Users,
  MapPin,
  Calendar,
  BookOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  GraduationCap,
  Building2,
  Radio,
  Filter,
  Search,
  User,
  X,
} from "lucide-react";
import {
  getBuildingDisplay,
  normalizeBuildingName,
  getCanonicalBuildingList,
  getLocationDisplay,
} from "../utils/locationService";
import { formatMinutesToTime } from "../utils/timeUtils";
import { useData } from "../contexts/DataContext";
import { usePeople } from "../contexts/PeopleContext";
import { useAppConfig } from "../contexts/AppConfigContext";
import { useSchedules } from "../contexts/ScheduleContext";
import { parseTermDate } from "../utils/termUtils";
import { isAssignmentActiveOnDate } from "../utils/studentWorkers";
import { getActiveFacultyList } from "../utils/facultyFinderUtils";
import { getFacultyLocationAtTime } from "../utils/facultyLocationUtils";
import FacultyExplorer from "./today/FacultyExplorer";
import FacultySpotlightCard from "./today/FacultySpotlightCard";

const LiveView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    scheduleData = [],
    studentData = [],
    facultyData = [],
    selectedSemester,
  } = useData();
  const { loadPeople } = usePeople();
  const { buildingConfigVersion } = useAppConfig();
  const { selectedTermMeta } = useSchedules();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [isNowMode, setIsNowMode] = useState(true);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [showAsOfPopover, setShowAsOfPopover] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [isExplorerOpen, setIsExplorerOpen] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get("explore") === "1";
  });
  const [explorerTab, setExplorerTab] = useState(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    return tab === "rooms" ? "rooms" : "faculty";
  });
  const [explorerStatusFilter, setExplorerStatusFilter] = useState(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("status");
    return ["all", "teaching", "in-office", "active"].includes(status)
      ? status
      : "active";
  });

  const explorerRef = useRef(null);
  const asOfRef = useRef(null);
  const searchInputRef = useRef(null);

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

  // Auto-refresh every 60 seconds (live mode only)
  useEffect(() => {
    if (!isNowMode) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, [isNowMode]);

  // Manual refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    setCurrentTime(new Date());
    setIsNowMode(true);
    setCustomDate("");
    setCustomTime("");
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const explore = params.get("explore") === "1";
    const tab = params.get("tab");
    const status = params.get("status");
    if (explore) setIsExplorerOpen(true);
    if (tab === "rooms" || tab === "faculty") setExplorerTab(tab);
    if (["all", "teaching", "in-office", "active"].includes(status)) {
      setExplorerStatusFilter(status);
    }
  }, [location.search]);

  useEffect(() => {
    if (!showAsOfPopover) return;
    const handleClickOutside = (event) => {
      if (!asOfRef.current?.contains(event.target)) {
        setShowAsOfPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAsOfPopover]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  // Get current day code (M, T, W, R, F)
  const getCurrentDayCode = (date) => {
    const dayMap = {
      0: null,
      1: "M",
      2: "T",
      3: "W",
      4: "R",
      5: "F",
      6: null,
    };
    return dayMap[date.getDay()];
  };

  // Parse time string to minutes since midnight (slightly different format handling)
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3]?.toUpperCase();

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  };

  // Effective "as of" time
  const asOfTime = useMemo(() => {
    if (isNowMode) return currentTime;

    if (customDate && customTime) {
      const [hours, minutes] = customTime.split(":").map(Number);
      const date = new Date(`${customDate}T12:00:00`);
      date.setHours(hours, minutes, 0, 0);
      return date;
    }

    return currentTime;
  }, [isNowMode, currentTime, customDate, customTime]);

  // Get current time in minutes since midnight
  const currentMinutes = asOfTime.getHours() * 60 + asOfTime.getMinutes();
  const currentDayCode = getCurrentDayCode(asOfTime);

  // getBuildingDisplay is imported from locationService

  // Helper to check if schedule meets on a given day
  const scheduleMeetsOnDay = (schedule, dayCode) => {
    if (schedule.meetingPatterns && Array.isArray(schedule.meetingPatterns)) {
      return schedule.meetingPatterns.some(
        (pattern) => pattern.day === dayCode,
      );
    }
    const days = schedule.Day || schedule.days || schedule.meetingDays || "";
    return days.includes(dayCode);
  };

  // Helper to get start/end times for schedule
  const getScheduleTimes = (schedule, dayCode) => {
    if (schedule.meetingPatterns && Array.isArray(schedule.meetingPatterns)) {
      const pattern = schedule.meetingPatterns.find((p) => p.day === dayCode);
      if (pattern) {
        return { startTime: pattern.startTime, endTime: pattern.endTime };
      }
    }
    return {
      startTime: schedule["Start Time"] || schedule.startTime,
      endTime: schedule["End Time"] || schedule.endTime,
    };
  };

  // Helper to get room from schedule
  const getScheduleRoom = (schedule) => {
    return getLocationDisplay(schedule) || schedule.Room || "";
  };

  const getCourseCode = (schedule) =>
    schedule.Course || schedule.courseCode || "";

  const getInstructorName = (schedule) => {
    if (
      Array.isArray(schedule.instructorNames) &&
      schedule.instructorNames.length > 0
    ) {
      return schedule.instructorNames.join(" / ");
    }
    if (schedule.instructor) {
      return `${schedule.instructor.firstName || ""} ${schedule.instructor.lastName || ""}`.trim();
    }
    return schedule.Instructor || schedule.instructorName || "";
  };

  const isWithinSemester = useMemo(() => {
    if (!selectedTermMeta?.startDate || !selectedTermMeta?.endDate) return true;

    const start = parseTermDate(selectedTermMeta.startDate);
    const end = parseTermDate(selectedTermMeta.endDate);
    const checkDate = new Date(asOfTime);
    checkDate.setHours(0, 0, 0, 0);

    return !start || !end || (checkDate >= start && checkDate <= end);
  }, [selectedTermMeta, asOfTime]);

  const isWeekend = useMemo(() => {
    const day = asOfTime.getDay();
    return day === 0 || day === 6;
  }, [asOfTime]);

  const activeFaculty = useMemo(
    () => getActiveFacultyList(facultyData, scheduleData),
    [facultyData, scheduleData],
  );

  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    return activeFaculty
      .filter((f) => f.name?.toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchQuery, activeFaculty]);

  const selectedFacultyLocation = useMemo(() => {
    if (!selectedFaculty) return null;

    return getFacultyLocationAtTime({
      faculty: selectedFaculty,
      scheduleData,
      asOfTime,
    });
  }, [selectedFaculty, scheduleData, asOfTime]);

  const handleTimeChange = useCallback((date, time) => {
    setIsNowMode(false);
    if (date) setCustomDate(date);
    if (time) setCustomTime(time);
  }, []);

  const handleNowClick = useCallback(() => {
    setIsNowMode(true);
    setCurrentTime(new Date());
    setCustomDate("");
    setCustomTime("");
  }, []);

  const handleSearchKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < searchSuggestions.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIndex >= 0 && searchSuggestions[highlightedIndex]) {
          setSelectedFaculty(searchSuggestions[highlightedIndex]);
          setSearchQuery("");
          setSearchFocused(false);
        }
      } else if (e.key === "Escape") {
        setSearchFocused(false);
        setSearchQuery("");
      }
    },
    [searchSuggestions, highlightedIndex],
  );

  const handleSelectSuggestion = useCallback((faculty) => {
    setSelectedFaculty(faculty);
    setSearchQuery("");
    setSearchFocused(false);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedFaculty(null);
  }, []);

  const handleOpenExplorer = useCallback(
    (tab) => {
      if (tab === "rooms" || tab === "faculty") setExplorerTab(tab);
      setIsExplorerOpen(true);
      setTimeout(() => {
        explorerRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    },
    [explorerRef],
  );

  const handleToggleExplorer = useCallback(() => {
    setIsExplorerOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          explorerRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
      return next;
    });
  }, [explorerRef]);

  // Filter schedules for today and selected semester
  const todaySchedules = useMemo(() => {
    if (!currentDayCode) return [];

    if (!isWithinSemester) return [];

    return scheduleData.filter((schedule) => {
      const term = schedule.Term || schedule.term || "";
      if (selectedSemester && term !== selectedSemester) return false;
      if (!scheduleMeetsOnDay(schedule, currentDayCode)) return false;

      const times = getScheduleTimes(schedule, currentDayCode);
      if (!times.startTime || !times.endTime) return false;

      const room = getScheduleRoom(schedule);
      if (room.toLowerCase() === "tba") return false;

      return true;
    });
  }, [scheduleData, selectedSemester, currentDayCode, isWithinSemester]);

  // Get unique buildings for filter - use canonical list + any found in data
  const availableBuildings = useMemo(() => {
    const buildings = new Set(getCanonicalBuildingList());

    // Also add any non-canonical buildings found in schedule data
    todaySchedules.forEach((s) => {
      const room = getScheduleRoom(s);
      const building = getBuildingDisplay(room);
      if (building && building !== "Online" && building !== "Off Campus") {
        buildings.add(building);
      }
    });

    // Also add normalized buildings from student workers
    studentData.forEach((student) => {
      const buildings_arr = student.primaryBuildings || [];
      buildings_arr.forEach((b) => {
        const normalized = normalizeBuildingName(b);
        if (normalized && normalized !== "Online") buildings.add(normalized);
      });
      (student.jobs || []).forEach((job) => {
        const locs = Array.isArray(job.location)
          ? job.location
          : [job.location];
        locs.forEach((loc) => {
          const normalized = normalizeBuildingName(loc);
          if (normalized && normalized !== "Online") buildings.add(normalized);
        });
      });
    });

    return Array.from(buildings).sort();
  }, [todaySchedules, studentData, buildingConfigVersion]);

  // Classes currently in session
  const currentClasses = useMemo(() => {
    let classes = todaySchedules.filter((schedule) => {
      const times = getScheduleTimes(schedule, currentDayCode);
      const start = parseTimeToMinutes(times.startTime);
      const end = parseTimeToMinutes(times.endTime);
      if (start === null || end === null) return false;
      return currentMinutes >= start && currentMinutes < end;
    });

    // Filter by building if selected
    if (selectedBuilding) {
      classes = classes.filter((s) => {
        const room = getScheduleRoom(s);
        return getBuildingDisplay(room) === selectedBuilding;
      });
    }

    return classes.sort((a, b) => {
      const roomA = getScheduleRoom(a);
      const roomB = getScheduleRoom(b);
      return roomA.localeCompare(roomB);
    });
  }, [todaySchedules, currentMinutes, currentDayCode, selectedBuilding]);

  // Classes starting in next 90 minutes
  const upcomingClasses = useMemo(() => {
    let classes = todaySchedules.filter((schedule) => {
      const times = getScheduleTimes(schedule, currentDayCode);
      const start = parseTimeToMinutes(times.startTime);
      if (start === null) return false;
      const diff = start - currentMinutes;
      return diff > 0 && diff <= 90;
    });

    if (selectedBuilding) {
      classes = classes.filter((s) => {
        const room = getScheduleRoom(s);
        return getBuildingDisplay(room) === selectedBuilding;
      });
    }

    return classes.sort((a, b) => {
      const timesA = getScheduleTimes(a, currentDayCode);
      const timesB = getScheduleTimes(b, currentDayCode);
      return (
        (parseTimeToMinutes(timesA.startTime) || 0) -
        (parseTimeToMinutes(timesB.startTime) || 0)
      );
    });
  }, [todaySchedules, currentMinutes, currentDayCode, selectedBuilding]);

  // Student workers on duty now with shift details
  const studentsOnDutyNow = useMemo(() => {
    if (!currentDayCode) return [];

    const results = [];

    studentData.forEach((student) => {
      if (student.isActive === false) return;

      // Check jobs array for current shift
      const jobs = student.jobs || [];
      for (const job of jobs) {
        if (!isAssignmentActiveOnDate(job, student, asOfTime)) continue;
        const schedule = job.weeklySchedule || [];
        for (const shift of schedule) {
          if (shift.day !== currentDayCode) continue;

          const start = parseTimeToMinutes(shift.startTime || shift.start);
          const end = parseTimeToMinutes(shift.endTime || shift.end);
          if (
            start !== null &&
            end !== null &&
            currentMinutes >= start &&
            currentMinutes < end
          ) {
            const location = Array.isArray(job.location)
              ? job.location[0]
              : job.location || "";

            // Filter by building if selected
            if (selectedBuilding && location !== selectedBuilding) continue;

            results.push({
              ...student,
              currentJob: {
                title: job.jobTitle || student.jobTitle || "",
                location,
                shiftStart: start,
                shiftEnd: end,
                shiftTimeStr: `${formatMinutesToTime(start)} - ${formatMinutesToTime(end)}`,
              },
            });
            return; // Only add student once
          }
        }
      }

      // Legacy format
      const weeklySchedule = student.weeklySchedule || [];
      if (!isAssignmentActiveOnDate({}, student, asOfTime)) return;
      for (const shift of weeklySchedule) {
        if (shift.day !== currentDayCode) continue;

        const start = parseTimeToMinutes(shift.startTime || shift.start);
        const end = parseTimeToMinutes(shift.endTime || shift.end);
        if (
          start !== null &&
          end !== null &&
          currentMinutes >= start &&
          currentMinutes < end
        ) {
          const location = student.primaryBuildings?.[0] || "";

          if (selectedBuilding && location !== selectedBuilding) continue;

          results.push({
            ...student,
            currentJob: {
              title: student.jobTitle || "",
              location,
              shiftStart: start,
              shiftEnd: end,
              shiftTimeStr: `${formatMinutesToTime(start)} - ${formatMinutesToTime(end)}`,
            },
          });
          return;
        }
      }
    });

    return results;
  }, [studentData, currentDayCode, currentMinutes, asOfTime, selectedBuilding]);

  // Real-time statistics (current, not daily)
  const liveStats = useMemo(() => {
    const uniqueInstructors = new Set(
      currentClasses.map((s) => getInstructorName(s)).filter(Boolean),
    );
    const uniqueRooms = new Set(
      currentClasses
        .map((s) => getScheduleRoom(s))
        .filter((r) => r && r.toLowerCase() !== "online"),
    );

    return {
      classesNow: currentClasses.length,
      facultyNow: uniqueInstructors.size,
      roomsNow: uniqueRooms.size,
      studentsNow: studentsOnDutyNow.length,
    };
  }, [currentClasses, studentsOnDutyNow]);

  const formatTime = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const asOfDateValue = customDate || asOfTime.toISOString().split("T")[0];
  const asOfTimeValue =
    customTime ||
    `${String(asOfTime.getHours()).padStart(2, "0")}:${String(
      asOfTime.getMinutes(),
    ).padStart(2, "0")}`;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="university-header rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Today</h1>
              <p className="text-white/80 text-sm mt-1">
                Live snapshot • {selectedSemester || "All semesters"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative" ref={asOfRef}>
              <button
                onClick={() => setShowAsOfPopover((prev) => !prev)}
                className="text-right"
                title="Set as-of time"
              >
                <div className="text-2xl font-bold text-white flex items-center justify-end gap-2">
                  {formatTime(asOfTime)}
                  {isNowMode && (
                    <span
                      className="w-2 h-2 bg-baylor-gold rounded-full animate-pulse"
                      title="Live"
                    />
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-white/70 transition-transform ${
                      showAsOfPopover ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <div className="text-sm text-baylor-gold">
                  {asOfTime.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                  {!isNowMode && (
                    <span className="ml-2 text-white/60">(custom)</span>
                  )}
                </div>
              </button>
              {showAsOfPopover && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
                  <div className="p-4 space-y-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide">
                      As of
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={asOfDateValue}
                        onChange={(e) =>
                          handleTimeChange(
                            e.target.value,
                            customTime || asOfTimeValue,
                          )
                        }
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <input
                        type="time"
                        value={asOfTimeValue}
                        onChange={(e) =>
                          handleTimeChange(
                            customDate || asOfDateValue,
                            e.target.value,
                          )
                        }
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleNowClick}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          isNowMode
                            ? "bg-baylor-green text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-baylor-green/10 hover:text-baylor-green"
                        }`}
                      >
                        Now
                      </button>
                      <span className="text-xs text-gray-500">
                        {isNowMode ? "Auto-refreshing" : "Custom time"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleRefresh}
              className={`p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-all ${
                isRefreshing ? "animate-spin" : ""
              }`}
              title={isNowMode ? "Refresh data" : "Back to now"}
            >
              <RefreshCw className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Finder Row */}
      <div className="university-card mb-6">
        <div className="university-card-content">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search faculty by name..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green transition-all text-lg"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>

              {searchFocused && searchSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  {searchSuggestions.map((faculty, idx) => (
                    <button
                      key={faculty.id || idx}
                      onClick={() => handleSelectSuggestion(faculty)}
                      className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${
                        idx === highlightedIndex
                          ? "bg-baylor-green/10 text-baylor-green"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-500" />
                      </div>
                      <div>
                        <div className="font-medium">{faculty.name}</div>
                        {faculty.program?.name && (
                          <div className="text-xs text-gray-500">
                            {faculty.program.name}
                          </div>
                        )}
                      </div>
                      {faculty.isAdjunct && (
                        <span className="ml-auto text-xs text-gray-400">
                          Adjunct
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenExplorer("faculty")}
                className="w-full lg:w-auto px-4 py-3 rounded-xl text-sm font-medium bg-baylor-green text-white hover:bg-baylor-green/90 transition-all flex items-center justify-center gap-2"
              >
                Explore faculty & rooms
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    isExplorerOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedFaculty && selectedFacultyLocation && (
        <div className="mb-6">
          <FacultySpotlightCard
            faculty={selectedFaculty}
            locationStatus={selectedFacultyLocation}
            onClose={handleClearSelection}
          />
        </div>
      )}

      {!isWithinSemester && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>
            The selected date is outside the {selectedSemester} semester dates.
            Schedule data may not be accurate.
          </span>
        </div>
      )}

      {isWeekend && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 flex items-center gap-2">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>
            Weekend schedule view — use the As-of control to preview a weekday.
          </span>
        </div>
      )}

      {/* Building Filter */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter className="w-4 h-4" />
          <span>Filter by building:</span>
        </div>
        <select
          value={selectedBuilding}
          onChange={(e) => setSelectedBuilding(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
        >
          <option value="">All Buildings</option>
          {availableBuildings.map((building) => (
            <option key={building} value={building}>
              {building}
            </option>
          ))}
        </select>
        {selectedBuilding && (
          <button
            onClick={() => setSelectedBuilding("")}
            className="p-1 hover:bg-gray-100 rounded"
            title="Clear filter"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Quick Stats Row - NOW shows real-time counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="university-card">
          <div className="university-card-content flex items-center gap-4">
            <div className="p-3 bg-baylor-green/10 rounded-xl relative">
              <BookOpen className="w-5 h-5 text-baylor-green" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {liveStats.classesNow}
              </div>
              <div className="text-sm text-gray-500">Classes Now</div>
            </div>
          </div>
        </div>

        <div className="university-card">
          <div className="university-card-content flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-xl relative">
              <GraduationCap className="w-5 h-5 text-green-600" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {liveStats.facultyNow}
              </div>
              <div className="text-sm text-gray-500">Faculty Teaching</div>
            </div>
          </div>
        </div>

        <div className="university-card">
          <div className="university-card-content flex items-center gap-4">
            <div className="p-3 bg-baylor-gold/20 rounded-xl relative">
              <Building2 className="w-5 h-5 text-baylor-gold" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {liveStats.roomsNow}
              </div>
              <div className="text-sm text-gray-500">Rooms in Use</div>
            </div>
          </div>
        </div>

        <div className="university-card">
          <div className="university-card-content flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-xl relative">
              <Users className="w-5 h-5 text-amber-600" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {liveStats.studentsNow}
              </div>
              <div className="text-sm text-gray-500">Students On Duty</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Happening Now Section */}
        <div className="university-card">
          <div className="university-card-header border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Classes in Session
                </h2>
              </div>
              <span className="text-sm text-gray-500">
                {currentClasses.length} active
              </span>
            </div>
          </div>
          <div className="university-card-content max-h-80 overflow-y-auto">
            {currentClasses.length > 0 ? (
              <div className="space-y-3">
                {currentClasses.slice(0, 10).map((cls, idx) => (
                  <div
                    key={cls.id || idx}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {getCourseCode(cls)} {cls.Section || cls.section}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {getInstructorName(cls) || "TBA"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-baylor-green">
                        {getScheduleRoom(cls) || "TBA"}
                      </span>
                    </div>
                  </div>
                ))}
                {currentClasses.length > 10 && (
                  <div className="text-center text-sm text-gray-500 py-2">
                    + {currentClasses.length - 10} more
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  No classes in session right now
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Coming Up Section */}
        <div className="university-card">
          <div className="university-card-header border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-baylor-green" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Coming Up
                </h2>
              </div>
              <span className="text-sm text-gray-500">Next 90 min</span>
            </div>
          </div>
          <div className="university-card-content max-h-80 overflow-y-auto">
            {upcomingClasses.length > 0 ? (
              <div className="space-y-3">
                {upcomingClasses.slice(0, 10).map((cls, idx) => {
                  const times = getScheduleTimes(cls, currentDayCode);
                  const startMins = parseTimeToMinutes(times.startTime);
                  const minsUntil = startMins - currentMinutes;

                  return (
                    <div
                      key={cls.id || idx}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {getCourseCode(cls)} {cls.Section || cls.section}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                          {getInstructorName(cls) || "TBA"} •{" "}
                          {getScheduleRoom(cls)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-baylor-green">
                          {times.startTime}
                        </div>
                        <div className="text-xs text-gray-400">
                          in {minsUntil} min
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  No classes in the next 90 minutes
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Students On Duty - Enhanced with job title and shift times */}
        <div className="university-card lg:col-span-2">
          <div className="university-card-header border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Student Workers On Duty
                </h2>
              </div>
              <button
                onClick={() => handleNavigate("scheduling/student-workers")}
                className="text-sm text-baylor-green hover:text-baylor-gold flex items-center gap-1"
              >
                View all
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="university-card-content">
            {studentsOnDutyNow.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {studentsOnDutyNow.map((student, idx) => (
                  <div
                    key={student.id || idx}
                    className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg"
                  >
                    <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-amber-800 font-medium text-sm">
                        {student.name
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2) || "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {student.name}
                      </div>
                      {student.currentJob?.title && (
                        <div className="text-xs text-gray-600 truncate">
                          {student.currentJob.title}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        {student.currentJob?.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {student.currentJob.location}
                          </span>
                        )}
                        {student.currentJob?.shiftTimeStr && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {student.currentJob.shiftTimeStr}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">
                  No student workers on shift right now
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => handleNavigate("scheduling/faculty")}
          className="university-card group cursor-pointer hover:shadow-md transition-all"
        >
          <div className="university-card-content flex items-center gap-3">
            <Calendar className="w-5 h-5 text-baylor-green group-hover:text-baylor-gold transition-colors" />
            <span className="text-sm font-medium text-gray-700">
              Faculty Schedules
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 ml-auto group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
        <button
          onClick={() => handleNavigate("scheduling/rooms")}
          className="university-card group cursor-pointer hover:shadow-md transition-all"
        >
          <div className="university-card-content flex items-center gap-3">
            <Building2 className="w-5 h-5 text-baylor-green group-hover:text-baylor-gold transition-colors" />
            <span className="text-sm font-medium text-gray-700">
              Room Schedules
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 ml-auto group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
        <button
          onClick={() => handleNavigate("scheduling/student-workers")}
          className="university-card group cursor-pointer hover:shadow-md transition-all"
        >
          <div className="university-card-content flex items-center gap-3">
            <Users className="w-5 h-5 text-baylor-green group-hover:text-baylor-gold transition-colors" />
            <span className="text-sm font-medium text-gray-700">
              Student Worker Schedules
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 ml-auto group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
        <button
          onClick={() => handleNavigate("people/directory")}
          className="university-card group cursor-pointer hover:shadow-md transition-all"
        >
          <div className="university-card-content flex items-center gap-3">
            <GraduationCap className="w-5 h-5 text-baylor-green group-hover:text-baylor-gold transition-colors" />
            <span className="text-sm font-medium text-gray-700">
              People Directory
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 ml-auto group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      {/* Explorer */}
      <div ref={explorerRef} className="mt-6 university-card">
        <button
          onClick={handleToggleExplorer}
          className="w-full university-card-header flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <div>
            <div className="text-lg font-semibold text-gray-900">Explore</div>
            <div className="text-sm text-gray-500">
              Browse all faculty locations and rooms in use.
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {isExplorerOpen ? "Hide" : "Expand"}
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                isExplorerOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>
        {isExplorerOpen && (
          <div className="university-card-content space-y-4">
            <div className="text-xs text-gray-500 flex items-center gap-2">
              {isNowMode ? (
                <>
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Live view • Updates every 60s
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3" />
                  Viewing {asOfTime.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  at {formatTime(asOfTime)}
                </>
              )}
            </div>
            <FacultyExplorer
              asOfTime={asOfTime}
              defaultTab={explorerTab}
              initialStatusFilter={explorerStatusFilter}
              selectedBuilding={selectedBuilding}
              selectedFaculty={selectedFaculty}
              onSelectFaculty={setSelectedFaculty}
              showSemesterWarning={false}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveView;
