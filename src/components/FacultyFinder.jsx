/**
 * FacultyFinder.jsx - "Where is X right now?" Dashboard
 *
 * A centralized, low-friction experience that answers instantly
 * where faculty members are at the current moment (or any given time).
 *
 * Features:
 * - Typeahead faculty search (keyboard-first)
 * - Time travel control (date/time picker + Now button)
 * - Spotlight card for selected faculty
 * - Faculty view with sortable table
 * - Room view with building grouping
 * - Quick stats bar
 * - Live auto-refresh every 60 seconds
 */

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Search,
  Clock,
  MapPin,
  User,
  Calendar,
  RefreshCw,
  ChevronRight,
  Building2,
  Users,
  GraduationCap,
  BookOpen,
  X,
  Coffee,
  Moon,
  ArrowUpDown,
  Filter,
  Zap,
  AlertTriangle,
  Folder,
} from "lucide-react";
import { useData } from "../contexts/DataContext";
import { usePeople } from "../contexts/PeopleContext";
import { useSchedules } from "../contexts/ScheduleContext";
import { parseTermDate } from "../utils/termUtils";
import {
  getFacultyLocationAtTime,
  getAllFacultyLocations,
  getRoomOccupancy,
  getLocationStats,
  sortFacultyLocations,
  groupRoomsByBuilding,
  LOCATION_STATUS,
} from "../utils/facultyLocationUtils";
import { formatMinutesToTime, parseTime } from "../utils/timeUtils";

// ===================== HELPER COMPONENTS =====================

/**
 * Status badge with appropriate styling
 */
const StatusBadge = ({ status, label, small = false }) => {
  const baseClasses = small
    ? "px-2 py-0.5 text-xs font-medium rounded-full inline-flex items-center gap-1"
    : "px-3 py-1 text-sm font-medium rounded-full inline-flex items-center gap-1.5";

  const statusStyles = {
    [LOCATION_STATUS.TEACHING]: "bg-baylor-green/10 text-baylor-green",
    [LOCATION_STATUS.IN_OFFICE]: "bg-blue-100 text-blue-700",
    [LOCATION_STATUS.FREE]: "bg-gray-100 text-gray-600",
    [LOCATION_STATUS.NOT_AVAILABLE]: "bg-gray-50 text-gray-400",
    [LOCATION_STATUS.UNKNOWN]: "bg-gray-50 text-gray-400",
  };

  const statusIcons = {
    [LOCATION_STATUS.TEACHING]: (
      <GraduationCap className={small ? "w-3 h-3" : "w-4 h-4"} />
    ),
    [LOCATION_STATUS.IN_OFFICE]: (
      <Coffee className={small ? "w-3 h-3" : "w-4 h-4"} />
    ),
    [LOCATION_STATUS.FREE]: <Clock className={small ? "w-3 h-3" : "w-4 h-4"} />,
    [LOCATION_STATUS.NOT_AVAILABLE]: (
      <Moon className={small ? "w-3 h-3" : "w-4 h-4"} />
    ),
    [LOCATION_STATUS.UNKNOWN]: (
      <AlertTriangle className={small ? "w-3 h-3" : "w-4 h-4"} />
    ),
  };

  return (
    <span
      className={`${baseClasses} ${statusStyles[status] || statusStyles[LOCATION_STATUS.UNKNOWN]}`}
    >
      {statusIcons[status]}
      {label}
    </span>
  );
};

/**
 * Quick stats bar showing teaching/office/free counts
 */
const QuickStats = ({ stats, isWeekend }) => {
  if (isWeekend) {
    return (
      <div className="flex items-center gap-6 text-sm text-gray-500">
        <span className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Weekend - No scheduled classes
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-baylor-green rounded-full animate-pulse" />
        <span className="text-gray-600">
          <span className="font-semibold text-baylor-green">
            {stats.teaching}
          </span>{" "}
          teaching
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-blue-500 rounded-full" />
        <span className="text-gray-600">
          <span className="font-semibold text-blue-600">{stats.inOffice}</span>{" "}
          in office
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-gray-400 rounded-full" />
        <span className="text-gray-600">
          <span className="font-semibold text-gray-600">
            {stats.free + stats.notAvailable}
          </span>{" "}
          free/away
        </span>
      </div>
      {stats.conflicts > 0 && (
        <div className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">
            {stats.conflicts} conflict{stats.conflicts > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * Spotlight card showing selected faculty details
 */
const SpotlightCard = ({ faculty, locationStatus, onClose }) => {
  if (!faculty) return null;

  const {
    currentLocation,
    nextLocation,
    office,
    hasConflict,
    conflictDetails,
    statusLabel,
  } = locationStatus;

  return (
    <div className="university-card border-2 border-baylor-green/20 bg-gradient-to-r from-baylor-green/5 to-transparent animate-fade-in">
      <div className="university-card-content">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 bg-baylor-green rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
              <span className="text-white font-bold text-xl">
                {faculty.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2) || "?"}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-xl font-bold text-gray-900">
                  {faculty.name}
                </h3>
                <StatusBadge
                  status={locationStatus.status}
                  label={statusLabel}
                />
                {hasConflict && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Schedule Conflict
                  </span>
                )}
              </div>

              {faculty.program?.name && (
                <p className="text-sm text-gray-500 mt-1">
                  {faculty.program.name}
                </p>
              )}

              {/* Current Location / Conflict Details */}
              <div className="mt-4 space-y-2">
                {hasConflict && conflictDetails ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Conflicting Assignments detected:
                    </div>
                    <div className="grid gap-2">
                      {conflictDetails.map((conflict, idx) => (
                        <div
                          key={idx}
                          className="bg-amber-50/50 border border-amber-100 rounded-lg p-2 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-gray-900">
                              {conflict.course} {conflict.section}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {conflict.startTime} - {conflict.endTime}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-gray-700 font-medium bg-white px-2 py-1 rounded shadow-sm">
                            <MapPin className="w-3 h-3 text-baylor-green" />
                            {conflict.room}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  currentLocation && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <MapPin className="w-4 h-4 text-baylor-green flex-shrink-0" />
                      <span className="font-medium">
                        {currentLocation.room}
                      </span>
                      {currentLocation.course && (
                        <span className="text-gray-500">
                          ({currentLocation.course} {currentLocation.section})
                        </span>
                      )}
                      {currentLocation.endTime && !currentLocation.isOffice && (
                        <span className="text-sm text-gray-400">
                          until {currentLocation.endTime}
                        </span>
                      )}
                    </div>
                  )
                )}

                {!currentLocation &&
                  office &&
                  locationStatus.status === LOCATION_STATUS.FREE && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      <span>Office: {office} (may not be present)</span>
                    </div>
                  )}

                {/* Next Location */}
                {nextLocation && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Next:{" "}
                      <span className="font-medium">{nextLocation.room}</span>{" "}
                      at {nextLocation.startTime}
                      {nextLocation.course && (
                        <span className="text-gray-400 ml-1">
                          ({nextLocation.course} {nextLocation.section})
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Contact info */}
                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                  {faculty.email && (
                    <a
                      href={`mailto:${faculty.email}`}
                      className="hover:text-baylor-green"
                    >
                      {faculty.email}
                    </a>
                  )}
                  {faculty.phone && <span>{faculty.phone}</span>}
                  {office && !currentLocation?.isOffice && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      Office: {office}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Faculty row in the table
 */
const FacultyRow = ({ faculty, locationStatus, onSelect, isSelected }) => {
  const {
    currentLocation,
    nextLocation,
    statusLabel,
    status,
    hasConflict,
    conflictDetails,
  } = locationStatus;

  return (
    <tr
      onClick={() => onSelect(faculty)}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? "bg-baylor-green/5 border-l-2 border-baylor-green"
          : "hover:bg-gray-50 border-l-2 border-transparent"
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-gray-600 font-medium text-xs">
              {faculty.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2) || "?"}
            </span>
          </div>
          <div>
            <div className="font-medium text-gray-900">{faculty.name}</div>
            {faculty.program?.name && (
              <div className="text-xs text-gray-500">
                {faculty.program.name}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={status} label={statusLabel} small />
        {hasConflict && (
          <AlertTriangle
            className="w-3 h-3 text-amber-500 inline ml-1"
            title={
              conflictDetails
                ? `Conflict between:\n${conflictDetails
                    .map(
                      (c) =>
                        `${c.course} (${c.room}) @ ${c.startTime}-${c.endTime}`,
                    )
                    .join("\n")}`
                : "Schedule conflict"
            }
          />
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {currentLocation ? (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-gray-400" />
            <span className="font-medium">{currentLocation.room}</span>
            {currentLocation.course && (
              <span className="text-gray-400 text-xs ml-1">
                ({currentLocation.course})
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {currentLocation?.endTime && !currentLocation.isOffice ? (
          currentLocation.endTime
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {nextLocation ? (
          <div>
            <span className="font-medium text-gray-700">
              {nextLocation.room}
            </span>
            <span className="text-gray-400 text-xs ml-1">
              at {nextLocation.startTime}
            </span>
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
};

/**
 * Room card for room view
 */
const RoomCard = ({ roomData, onRoomClick }) => {
  const { room, occupants } = roomData;

  return (
    <div
      onClick={() => onRoomClick(room)}
      className="p-3 bg-white rounded-lg border border-gray-200 hover:border-baylor-green/30 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900">{room}</span>
        <span
          className="w-2 h-2 bg-baylor-green rounded-full animate-pulse"
          title="In use"
        />
      </div>
      {occupants.map((occ, idx) => (
        <div key={idx} className="text-sm text-gray-600">
          <span className="font-medium">{occ.facultyName}</span>
          {occ.course && (
            <span className="text-gray-400 ml-1">({occ.course})</span>
          )}
          <div className="text-xs text-gray-400">
            {occ.startTime} - {occ.endTime}
          </div>
        </div>
      ))}
    </div>
  );
};

// ===================== MAIN COMPONENT =====================

const FacultyFinder = () => {
  // ========== Contexts ==========
  const {
    scheduleData = [],
    facultyData = [],
    rawScheduleData = [],
    selectedSemester,
  } = useData();
  const { loadPeople } = usePeople();
  const { selectedTermMeta } = useSchedules();

  // ========== State ==========
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isNowMode, setIsNowMode] = useState(true);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedFaculty, setSelectedFaculty] = useState(null);

  const [viewMode, setViewMode] = useState("faculty"); // 'faculty' | 'room'
  const [showAdjuncts, setShowAdjuncts] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'teaching' | 'in-office' | 'active'
  const [roomFilter, setRoomFilter] = useState(null);
  const [programFilter, setProgramFilter] = useState("all"); // 'all' | program ID

  const searchInputRef = useRef(null);

  // ========== Effects ==========

  // Load people on mount
  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  // Auto-refresh every 60 seconds in "Now" mode
  useEffect(() => {
    if (!isNowMode) return;

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, [isNowMode]);

  // Reset highlighted index when search changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  // ========== Derived Data ==========

  // Effective "as of" time
  const asOfTime = useMemo(() => {
    if (isNowMode) return currentTime;

    if (customDate && customTime) {
      const [hours, minutes] = customTime.split(":").map(Number);
      const date = new Date(customDate + "T12:00:00"); // Avoid timezone issues
      date.setHours(hours, minutes, 0, 0);
      return date;
    }

    return currentTime;
  }, [isNowMode, currentTime, customDate, customTime]);

  // Check if current time is within semester dates
  const isWithinSemester = useMemo(() => {
    if (!selectedTermMeta?.startDate || !selectedTermMeta?.endDate) return true;

    const start = parseTermDate(selectedTermMeta.startDate);
    const end = parseTermDate(selectedTermMeta.endDate);
    const checkDate = new Date(asOfTime);
    checkDate.setHours(0, 0, 0, 0);

    return !start || !end || (checkDate >= start && checkDate <= end);
  }, [selectedTermMeta, asOfTime]);

  // Check if it's a weekend
  const isWeekend = useMemo(() => {
    const day = asOfTime.getDay();
    return day === 0 || day === 6;
  }, [asOfTime]);

  // Filter faculty to only those teaching in current semester
  const activeFaculty = useMemo(() => {
    const teachingFacultyNames = new Set();

    scheduleData.forEach((schedule) => {
      const names = Array.isArray(schedule.instructorNames)
        ? schedule.instructorNames
        : [];
      const fallback = schedule.Instructor || schedule.instructorName || "";
      const allNames = names.length > 0 ? names : [fallback];

      allNames.forEach((name) => {
        if (name && name !== "Staff" && name !== "TBA") {
          teachingFacultyNames.add(name.toLowerCase());
        }
      });
    });

    return facultyData.filter((f) => {
      const name = f.name?.toLowerCase() || "";
      return teachingFacultyNames.has(name);
    });
  }, [facultyData, scheduleData]);

  // Get all faculty locations
  const facultyLocations = useMemo(() => {
    // Convert status filter string to array for the utility function
    let statusFilterArray = null;
    if (statusFilter === "teaching") {
      statusFilterArray = [LOCATION_STATUS.TEACHING];
    } else if (statusFilter === "in-office") {
      statusFilterArray = [LOCATION_STATUS.IN_OFFICE];
    } else if (statusFilter === "active") {
      statusFilterArray = [LOCATION_STATUS.TEACHING, LOCATION_STATUS.IN_OFFICE];
    }

    return getAllFacultyLocations({
      facultyData: activeFaculty,
      scheduleData,
      asOfTime,
      options: {
        excludeAdjuncts: !showAdjuncts,
        statusFilter: statusFilterArray,
      },
    });
  }, [activeFaculty, scheduleData, asOfTime, showAdjuncts, statusFilter]);

  // Extract unique programs from faculty data
  const availablePrograms = useMemo(() => {
    const programs = new Map();
    activeFaculty.forEach((faculty) => {
      if (faculty.program?.id && faculty.program?.name) {
        programs.set(faculty.program.id, {
          id: faculty.program.id,
          name: faculty.program.name,
          code: faculty.program.code,
        });
      }
    });
    return Array.from(programs.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [activeFaculty]);

  // Sort and filter
  const sortedLocations = useMemo(() => {
    let filtered = facultyLocations;

    // Apply room filter
    if (roomFilter) {
      filtered = filtered.filter(({ locationStatus }) => {
        return locationStatus.currentLocation?.room === roomFilter;
      });
    }

    // Apply program filter
    if (programFilter !== "all") {
      filtered = filtered.filter(({ faculty }) => {
        return faculty.program?.id === programFilter;
      });
    }

    return sortFacultyLocations(filtered, sortBy, sortOrder);
  }, [facultyLocations, sortBy, sortOrder, roomFilter, programFilter]);

  // Stats
  const stats = useMemo(() => {
    return getLocationStats(facultyLocations);
  }, [facultyLocations]);

  // Room occupancy for room view
  const roomOccupancy = useMemo(() => {
    return getRoomOccupancy({ scheduleData, asOfTime });
  }, [scheduleData, asOfTime]);

  // Grouped rooms by building
  const groupedRooms = useMemo(() => {
    return groupRoomsByBuilding(roomOccupancy);
  }, [roomOccupancy]);

  // Search suggestions
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    return activeFaculty
      .filter((f) => {
        if (!showAdjuncts && f.isAdjunct) return false;
        return f.name?.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [searchQuery, activeFaculty, showAdjuncts]);

  // Selected faculty location status
  const selectedFacultyLocation = useMemo(() => {
    if (!selectedFaculty) return null;

    return getFacultyLocationAtTime({
      faculty: selectedFaculty,
      scheduleData,
      asOfTime,
    });
  }, [selectedFaculty, scheduleData, asOfTime]);

  // ========== Handlers ==========

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setCurrentTime(new Date());
    setIsNowMode(true);
    setCustomDate("");
    setCustomTime("");
    setTimeout(() => setIsRefreshing(false), 500);
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

  const handleSortChange = useCallback((field) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortOrder("asc");
      return field;
    });
  }, []);

  const handleRoomClick = useCallback((room) => {
    setRoomFilter((prev) => (prev === room ? null : room));
    setViewMode("faculty");
  }, []);

  const handleSetStatusFilter = useCallback((filter) => {
    setStatusFilter(filter);
  }, []);

  const handleSetProgramFilter = useCallback((filter) => {
    setProgramFilter(filter);
  }, []);

  // ========== Formatting ==========

  const formatTime = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  // ========== Render ==========

  return (
    <div className="page-content space-y-6">
      {/* Header */}
      <div className="university-header rounded-xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Faculty Finder</h1>
              <p className="text-white/80 text-sm mt-1">
                Find any faculty member instantly •{" "}
                {selectedSemester || "All semesters"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-white flex items-center gap-2">
                {formatTime(asOfTime)}
                {isNowMode && (
                  <span
                    className="w-2 h-2 bg-baylor-gold rounded-full animate-pulse"
                    title="Live"
                  />
                )}
              </div>
              <div className="text-sm text-baylor-gold">
                {formatDate(asOfTime)}
                {!isNowMode && (
                  <span className="ml-2 text-white/60">(custom time)</span>
                )}
              </div>
            </div>
            <button
              onClick={handleRefresh}
              className={`p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-all ${
                isRefreshing ? "animate-spin" : ""
              }`}
              title="Refresh to now"
            >
              <RefreshCw className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Search + Time Control Row */}
      <div className="university-card">
        <div className="university-card-content">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
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

              {/* Search Suggestions Dropdown */}
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

              {/* Program Filter Dropdown */}
              {availablePrograms.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                    <Folder className="w-4 h-4 text-gray-500" />
                    <select
                      value={programFilter}
                      onChange={(e) => handleSetProgramFilter(e.target.value)}
                      className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none cursor-pointer min-w-[120px] max-w-[200px]"
                      title="Filter by program"
                    >
                      <option value="all">All Programs</option>
                      {availablePrograms.map((program) => (
                        <option key={program.id} value={program.id}>
                          {program.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Program filter badge */}
                  {programFilter !== "all" && (
                    <button
                      onClick={() => setProgramFilter("all")}
                      className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
                    >
                      <Folder className="w-4 h-4" />
                      <span className="max-w-[150px] truncate">
                        {availablePrograms.find((p) => p.id === programFilter)
                          ?.name || "Program"}
                      </span>
                      <X className="w-4 h-4 ml-1" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Time Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={customDate || asOfTime.toISOString().split("T")[0]}
                  onChange={(e) => handleTimeChange(e.target.value, customTime)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                />
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={
                    customTime ||
                    `${String(asOfTime.getHours()).padStart(2, "0")}:${String(
                      asOfTime.getMinutes(),
                    ).padStart(2, "0")}`
                  }
                  onChange={(e) => handleTimeChange(customDate, e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                />
              </div>
              <button
                onClick={handleNowClick}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isNowMode
                    ? "bg-baylor-green text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-baylor-green/10 hover:text-baylor-green"
                }`}
              >
                Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Spotlight Card (when faculty selected) */}
      {selectedFaculty && selectedFacultyLocation && (
        <SpotlightCard
          faculty={selectedFaculty}
          locationStatus={selectedFacultyLocation}
          onClose={handleClearSelection}
        />
      )}

      {/* Quick Stats + View Toggle + Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <QuickStats stats={stats} isWeekend={isWeekend} />

        <div className="flex items-center gap-3 flex-wrap">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("faculty")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === "faculty"
                  ? "bg-white text-baylor-green shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Users className="w-4 h-4" />
              Faculty
            </button>
            <button
              onClick={() => setViewMode("room")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === "room"
                  ? "bg-white text-baylor-green shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Building2 className="w-4 h-4" />
              Rooms
            </button>
          </div>

          {/* Status Availability Filter */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleSetStatusFilter("all")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === "all"
                  ? "bg-white text-baylor-green shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Show all faculty"
            >
              All
            </button>
            <button
              onClick={() => handleSetStatusFilter("teaching")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilter === "teaching"
                  ? "bg-baylor-green text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Show only faculty currently teaching"
            >
              <GraduationCap className="w-3 h-3" />
              Teaching
            </button>
            <button
              onClick={() => handleSetStatusFilter("in-office")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilter === "in-office"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Show only faculty in their office"
            >
              <Coffee className="w-3 h-3" />
              In Office
            </button>
            <button
              onClick={() => handleSetStatusFilter("active")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilter === "active"
                  ? "bg-baylor-green text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              title="Show faculty who are teaching or in office"
            >
              <Zap className="w-3 h-3" />
              Both
            </button>
          </div>

          {/* Adjunct Toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showAdjuncts}
              onChange={(e) => setShowAdjuncts(e.target.checked)}
              className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
            />
            <span>Include Adjuncts</span>
          </label>

          {/* Room filter badge */}
          {roomFilter && (
            <button
              onClick={() => setRoomFilter(null)}
              className="px-3 py-1.5 bg-baylor-green/10 text-baylor-green rounded-full text-sm font-medium flex items-center gap-1.5"
            >
              <MapPin className="w-3 h-3" />
              {roomFilter}
              <X className="w-3 h-3 ml-1" />
            </button>
          )}
        </div>
      </div>

      {/* Outside Semester Warning */}
      {!isWithinSemester && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            The selected date is outside the {selectedSemester} semester dates.
            Schedule data may not be accurate.
          </span>
        </div>
      )}

      {/* Main Content */}
      {viewMode === "faculty" ? (
        /* Faculty View */
        <div className="university-card overflow-hidden">
          {isWeekend ? (
            <div className="university-card-content text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                It's the Weekend!
              </h3>
              <p className="text-gray-600">
                No scheduled classes on {formatDate(asOfTime)}.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Try selecting a weekday to see faculty locations.
              </p>
            </div>
          ) : sortedLocations.length === 0 ? (
            <div className="university-card-content text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Faculty Found
              </h3>
              <p className="text-gray-600">
                {!showAdjuncts
                  ? "Try enabling 'Include Adjuncts' to see more faculty."
                  : "No faculty are teaching courses this semester."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="university-table w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSortChange("name")}
                    >
                      <div className="flex items-center gap-1 text-sm font-semibold text-baylor-green">
                        Faculty
                        {sortBy === "name" && (
                          <ArrowUpDown className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSortChange("status")}
                    >
                      <div className="flex items-center gap-1 text-sm font-semibold text-baylor-green">
                        Status
                        {sortBy === "status" && (
                          <ArrowUpDown className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSortChange("room")}
                    >
                      <div className="flex items-center gap-1 text-sm font-semibold text-baylor-green">
                        Location
                        {sortBy === "room" && (
                          <ArrowUpDown className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-baylor-green">
                      Until
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-baylor-green">
                      Next
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedLocations.map(({ faculty, locationStatus }) => (
                    <FacultyRow
                      key={faculty.id}
                      faculty={faculty}
                      locationStatus={locationStatus}
                      onSelect={setSelectedFaculty}
                      isSelected={selectedFaculty?.id === faculty.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Room View */
        <div className="space-y-6">
          {isWeekend ? (
            <div className="university-card">
              <div className="university-card-content text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  It's the Weekend!
                </h3>
                <p className="text-gray-600">No rooms are in scheduled use.</p>
              </div>
            </div>
          ) : groupedRooms.length === 0 ? (
            <div className="university-card">
              <div className="university-card-content text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No Rooms in Use
                </h3>
                <p className="text-gray-600">
                  No classes are currently in session at {formatTime(asOfTime)}.
                </p>
              </div>
            </div>
          ) : (
            groupedRooms.map(({ building, rooms }) => (
              <div key={building} className="university-card">
                <div className="university-card-header">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-baylor-green" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {building}
                    </h3>
                    <span className="text-sm text-gray-500">
                      ({rooms.length} room{rooms.length !== 1 ? "s" : ""} in
                      use)
                    </span>
                  </div>
                </div>
                <div className="university-card-content">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {rooms.map((roomData) => (
                      <RoomCard
                        key={roomData.room}
                        roomData={roomData}
                        onRoomClick={handleRoomClick}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Footer info */}
      <div className="text-center text-sm text-gray-400">
        {isNowMode ? (
          <span>
            Auto-refreshes every 60 seconds • Last updated{" "}
            {formatTime(currentTime)}
          </span>
        ) : (
          <span>
            Viewing schedule as of {formatDate(asOfTime)} at{" "}
            {formatTime(asOfTime)}
          </span>
        )}
      </div>
    </div>
  );
};

export default FacultyFinder;
