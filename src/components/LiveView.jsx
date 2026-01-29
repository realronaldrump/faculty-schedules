import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  Users,
  MapPin,
  Calendar,
  BookOpen,
  ChevronRight,
  RefreshCw,
  GraduationCap,
  Building2,
  Radio,
  Filter,
  X,
} from "lucide-react";
import {
  getBuildingDisplay,
  normalizeBuildingName,
  getCanonicalBuildingList,
  buildingMatches,
  getLocationDisplay,
} from "../utils/locationService";
import { formatMinutesToTime } from "../utils/timeUtils";
import { useData } from "../contexts/DataContext";
import { usePeople } from "../contexts/PeopleContext";
import { useAppConfig } from "../contexts/AppConfigContext";
import { useSchedules } from "../contexts/ScheduleContext";
import { parseTermDate } from "../utils/termUtils";
import { isAssignmentActiveOnDate } from "../utils/studentWorkers";

const LiveView = () => {
  const navigate = useNavigate();
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState("");

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

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Manual refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    setCurrentTime(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Get current day code (M, T, W, R, F)
  const getCurrentDayCode = () => {
    const dayMap = { 0: null, 1: "M", 2: "T", 3: "W", 4: "R", 5: "F", 6: null };
    return dayMap[currentTime.getDay()];
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

  // Get current time in minutes since midnight
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const currentDayCode = getCurrentDayCode();

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

  // Filter schedules for today and selected semester
  const todaySchedules = useMemo(() => {
    if (!currentDayCode) return [];

    // Check if current date is within semester dates
    if (selectedTermMeta?.startDate && selectedTermMeta?.endDate) {
      const start = parseTermDate(selectedTermMeta.startDate);
      const end = parseTermDate(selectedTermMeta.endDate);
      const now = new Date(currentTime);
      now.setHours(0, 0, 0, 0); // Normalize to date only

      if (start && end && (now < start || now > end)) {
        return []; // Outside of semester dates
      }
    }

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
  }, [
    scheduleData,
    selectedSemester,
    currentDayCode,
    selectedTermMeta,
    currentTime,
  ]);

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
        if (!isAssignmentActiveOnDate(job, student, currentTime)) continue;
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
      if (!isAssignmentActiveOnDate({}, student, currentTime)) return;
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
  }, [studentData, currentDayCode, currentMinutes, currentTime, selectedBuilding]);

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

  const isWeekend = !currentDayCode;

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
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {formatTime(currentTime)}
              </div>
              <div className="text-sm text-baylor-gold">
                {currentTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
            <button
              onClick={handleRefresh}
              className={`p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-all ${isRefreshing ? "animate-spin" : ""}`}
              title="Refresh data"
            >
              <RefreshCw className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {isWeekend ? (
        <div className="university-card">
          <div className="university-card-content text-center py-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-3">
              It's the Weekend!
            </h2>
            <p className="text-gray-600 max-w-md mx-auto">
              No regularly scheduled classes today. Enjoy your time off!
            </p>
          </div>
        </div>
      ) : (
        <>
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
                    onClick={() =>
                      handleNavigate("scheduling/student-workers")
                    }
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
        </>
      )}
    </div>
  );
};

export default LiveView;
