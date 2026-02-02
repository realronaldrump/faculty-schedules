/**
 * Faculty Location Utilities
 *
 * Core logic for determining faculty locations at a given timestamp.
 * Used by the Faculty Finder feature to answer "Where is X right now?"
 *
 * Time conventions:
 * - All times use 12-hour AM/PM format (e.g., "9:30 AM")
 * - Day codes: M, T, W, R, F (Saturday/Sunday = null)
 * - Interval matching: start <= T < end (exclusive end)
 * - Office hours: 8 AM - 5 PM Central Time
 */

import { parseTime, formatMinutesToTime } from "./timeUtils";
import { getLocationDisplay } from "./locationService";

// Day code mapping from JavaScript Date.getDay()
const DAY_CODE_MAP = {
  0: null, // Sunday
  1: "M", // Monday
  2: "T", // Tuesday
  3: "W", // Wednesday
  4: "R", // Thursday
  5: "F", // Friday
  6: null, // Saturday
};

// Office hours in minutes from midnight (8 AM - 5 PM)
const OFFICE_HOURS_START = 8 * 60; // 8:00 AM = 480 minutes
const OFFICE_HOURS_END = 17 * 60; // 5:00 PM = 1020 minutes

/**
 * Get the day code for a given Date object
 * @param {Date} date
 * @returns {string|null} Day code (M, T, W, R, F) or null for weekend
 */
export const getDayCodeFromDate = (date) => {
  if (!date || !(date instanceof Date)) return null;
  return DAY_CODE_MAP[date.getDay()];
};

/**
 * Check if a time (in minutes from midnight) is within office hours
 * @param {number} minutes - Minutes from midnight
 * @returns {boolean}
 */
export const isWithinOfficeHours = (minutes) => {
  return minutes >= OFFICE_HOURS_START && minutes < OFFICE_HOURS_END;
};

/**
 * Check if a schedule item is active at a given time
 * @param {Object} schedule - Schedule item with meetingPatterns
 * @param {string} dayCode - Day code (M, T, W, R, F)
 * @param {number} currentMinutes - Current time in minutes from midnight
 * @returns {Object|null} Matching pattern with times, or null
 */
export const getActiveSchedulePattern = (schedule, dayCode, currentMinutes) => {
  if (!schedule || !dayCode) return null;

  // Check meetingPatterns array
  if (schedule.meetingPatterns && Array.isArray(schedule.meetingPatterns)) {
    for (const pattern of schedule.meetingPatterns) {
      if (pattern.day !== dayCode) continue;

      const startMinutes = parseTime(pattern.startTime);
      const endMinutes = parseTime(pattern.endTime);

      if (startMinutes === null || endMinutes === null) continue;

      // Interval: start <= currentMinutes < end
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return {
          ...pattern,
          startMinutes,
          endMinutes,
        };
      }
    }
  }

  return null;
};

/**
 * Find the next scheduled assignment for a faculty member after the given time
 * @param {Object} params
 * @param {string} params.facultyName - Faculty name to match
 * @param {Array} params.scheduleData - All schedule data
 * @param {string} params.dayCode - Current day code
 * @param {number} params.currentMinutes - Current time in minutes
 * @param {number} [params.horizonMinutes=1440] - How far ahead to look (default: 24 hours)
 * @returns {Object|null} Next assignment info or null
 */
export const getNextAssignment = ({
  facultyName,
  scheduleData,
  dayCode,
  currentMinutes,
  horizonMinutes = 1440,
}) => {
  if (!facultyName || !scheduleData || !dayCode) return null;

  let nextAssignment = null;
  let nextStartMinutes = Infinity;

  for (const schedule of scheduleData) {
    // Check if this faculty teaches this schedule
    const instructorNames = Array.isArray(schedule.instructorNames)
      ? schedule.instructorNames
      : [];
    const fallbackName = schedule.Instructor || schedule.instructorName || "";
    const allNames =
      instructorNames.length > 0 ? instructorNames : [fallbackName];

    const matchesFaculty = allNames.some(
      (name) => name && name.toLowerCase() === facultyName.toLowerCase(),
    );

    if (!matchesFaculty) continue;

    // Check meeting patterns for today
    if (schedule.meetingPatterns && Array.isArray(schedule.meetingPatterns)) {
      for (const pattern of schedule.meetingPatterns) {
        if (pattern.day !== dayCode) continue;

        const startMinutes = parseTime(pattern.startTime);
        if (startMinutes === null) continue;

        // Must be after current time and within horizon
        if (startMinutes > currentMinutes && startMinutes < nextStartMinutes) {
          if (startMinutes - currentMinutes <= horizonMinutes) {
            nextStartMinutes = startMinutes;
            nextAssignment = {
              course: schedule.Course || schedule.courseCode || "",
              section: schedule.Section || schedule.section || "",
              room: getLocationDisplay(schedule) || schedule.Room || "",
              startTime: pattern.startTime,
              endTime: pattern.endTime,
              startMinutes,
            };
          }
        }
      }
    }
  }

  return nextAssignment;
};

/**
 * Status types for faculty location
 */
export const LOCATION_STATUS = {
  TEACHING: "teaching",
  IN_OFFICE: "in-office",
  FREE: "free",
  NOT_AVAILABLE: "not-available",
  UNKNOWN: "unknown",
};

/**
 * Get the location status for a single faculty member at a given time
 * @param {Object} params
 * @param {Object} params.faculty - Faculty member object
 * @param {Array} params.scheduleData - All schedule data
 * @param {Date} [params.asOfTime] - Timestamp to check (default: now)
 * @returns {Object} Location status object
 */
export const getFacultyLocationAtTime = ({
  faculty,
  scheduleData,
  asOfTime = new Date(),
}) => {
  if (!faculty) {
    return {
      status: LOCATION_STATUS.UNKNOWN,
      statusLabel: "Unknown",
      currentLocation: null,
      nextLocation: null,
      office: null,
      hasConflict: false,
      conflictDetails: null,
    };
  }

  const dayCode = getDayCodeFromDate(asOfTime);
  const currentMinutes = asOfTime.getHours() * 60 + asOfTime.getMinutes();
  const facultyName =
    faculty.name ||
    `${faculty.firstName || ""} ${faculty.lastName || ""}`.trim();

  // Get faculty's office if assigned
  const office = faculty.office || faculty.officeSpaceId || null;

  // Weekend handling
  if (!dayCode) {
    return {
      status: LOCATION_STATUS.NOT_AVAILABLE,
      statusLabel: "Weekend",
      currentLocation: null,
      nextLocation: null,
      office,
      hasConflict: false,
      conflictDetails: null,
    };
  }

  // Find current teaching assignments
  const currentAssignments = [];

  for (const schedule of scheduleData || []) {
    // Check if this faculty teaches this schedule
    const instructorNames = Array.isArray(schedule.instructorNames)
      ? schedule.instructorNames
      : [];
    const fallbackName = schedule.Instructor || schedule.instructorName || "";
    const allNames =
      instructorNames.length > 0 ? instructorNames : [fallbackName];

    const matchesFaculty = allNames.some(
      (name) => name && name.toLowerCase() === facultyName.toLowerCase(),
    );

    if (!matchesFaculty) continue;

    // Check if currently active
    const activePattern = getActiveSchedulePattern(
      schedule,
      dayCode,
      currentMinutes,
    );
    if (activePattern) {
      currentAssignments.push({
        course: schedule.Course || schedule.courseCode || "",
        section: schedule.Section || schedule.section || "",
        room: getLocationDisplay(schedule) || schedule.Room || "",
        startTime: activePattern.startTime,
        endTime: activePattern.endTime,
        startMinutes: activePattern.startMinutes,
        endMinutes: activePattern.endMinutes,
        isOnline:
          schedule.isOnline ||
          (schedule.Room || "").toLowerCase().includes("online"),
      });
    }
  }

  // Get next assignment
  const nextLocation = getNextAssignment({
    facultyName,
    scheduleData,
    dayCode,
    currentMinutes,
    horizonMinutes: 1440, // Look ahead 24 hours
  });

  // Determine status
  if (currentAssignments.length > 0) {
    // Currently teaching
    const hasConflict = currentAssignments.length > 1;
    // Pick primary: earliest start, then alphabetically by course
    const primary = currentAssignments.sort((a, b) => {
      if (a.startMinutes !== b.startMinutes)
        return a.startMinutes - b.startMinutes;
      return (a.course || "").localeCompare(b.course || "");
    })[0];

    return {
      status: primary.isOnline
        ? LOCATION_STATUS.TEACHING
        : LOCATION_STATUS.TEACHING,
      statusLabel: primary.isOnline ? "Teaching (Online)" : "Teaching",
      currentLocation: primary,
      nextLocation,
      office,
      hasConflict,
      conflictDetails: hasConflict ? currentAssignments : null,
    };
  }

  // Not teaching - check office hours
  const withinOfficeHours = isWithinOfficeHours(currentMinutes);

  if (withinOfficeHours && office) {
    return {
      status: LOCATION_STATUS.IN_OFFICE,
      statusLabel: "In Office",
      currentLocation: {
        room: office,
        isOffice: true,
      },
      nextLocation,
      office,
      hasConflict: false,
      conflictDetails: null,
    };
  }

  if (withinOfficeHours) {
    return {
      status: LOCATION_STATUS.FREE,
      statusLabel: "Free",
      currentLocation: null,
      nextLocation,
      office,
      hasConflict: false,
      conflictDetails: null,
    };
  }

  // Outside office hours
  return {
    status: LOCATION_STATUS.NOT_AVAILABLE,
    statusLabel: "Not Available",
    currentLocation: null,
    nextLocation,
    office,
    hasConflict: false,
    conflictDetails: null,
  };
};

/**
 * Get location status for all faculty members
 * @param {Object} params
 * @param {Array} params.facultyData - All faculty data
 * @param {Array} params.scheduleData - All schedule data
 * @param {Date} [params.asOfTime] - Timestamp to check
 * @param {Object} [params.options] - Filter options
 * @returns {Array} Array of { faculty, locationStatus }
 */
export const getAllFacultyLocations = ({
  facultyData,
  scheduleData,
  asOfTime = new Date(),
  options = {},
}) => {
  const {
    excludeAdjuncts = true,
    programFilter = null,
    statusFilter = null,
  } = options;

  const results = [];

  for (const faculty of facultyData || []) {
    // Filter by adjunct status
    if (excludeAdjuncts && faculty.isAdjunct) continue;

    // Filter by program
    if (programFilter && programFilter.length > 0) {
      const programName = faculty.program?.name || faculty.program || "";
      if (!programFilter.includes(programName)) continue;
    }

    const locationStatus = getFacultyLocationAtTime({
      faculty,
      scheduleData,
      asOfTime,
    });

    // Filter by status
    if (statusFilter && statusFilter.length > 0) {
      if (!statusFilter.includes(locationStatus.status)) continue;
    }

    results.push({
      faculty,
      locationStatus,
    });
  }

  return results;
};

/**
 * Get room occupancy at a given time
 * @param {Object} params
 * @param {Array} params.scheduleData - All schedule data
 * @param {Date} [params.asOfTime] - Timestamp to check
 * @param {Object} [params.options] - Options
 * @returns {Map} Map of room -> { occupants, isOccupied }
 */
export const getRoomOccupancy = ({
  scheduleData,
  asOfTime = new Date(),
  options = {},
}) => {
  const dayCode = getDayCodeFromDate(asOfTime);
  const currentMinutes = asOfTime.getHours() * 60 + asOfTime.getMinutes();

  const roomMap = new Map();

  if (!dayCode) {
    // Weekend - no scheduled occupancy
    return roomMap;
  }

  for (const schedule of scheduleData || []) {
    const activePattern = getActiveSchedulePattern(
      schedule,
      dayCode,
      currentMinutes,
    );
    if (!activePattern) continue;

    const room = getLocationDisplay(schedule) || schedule.Room || "";
    if (
      !room ||
      room.toLowerCase() === "tba" ||
      room.toLowerCase().includes("online")
    )
      continue;

    const instructorNames = Array.isArray(schedule.instructorNames)
      ? schedule.instructorNames
      : [];
    const fallbackName = schedule.Instructor || schedule.instructorName || "";
    const displayName =
      instructorNames.length > 0 ? instructorNames.join(" / ") : fallbackName;

    if (!roomMap.has(room)) {
      roomMap.set(room, {
        room,
        occupants: [],
        isOccupied: true,
      });
    }

    roomMap.get(room).occupants.push({
      facultyName: displayName,
      course: schedule.Course || schedule.courseCode || "",
      section: schedule.Section || schedule.section || "",
      startTime: activePattern.startTime,
      endTime: activePattern.endTime,
    });
  }

  return roomMap;
};

/**
 * Get quick statistics for the current view
 * @param {Array} facultyLocations - Result from getAllFacultyLocations
 * @returns {Object} Stats object
 */
export const getLocationStats = (facultyLocations) => {
  const stats = {
    total: facultyLocations.length,
    teaching: 0,
    inOffice: 0,
    free: 0,
    notAvailable: 0,
    conflicts: 0,
  };

  for (const { locationStatus } of facultyLocations) {
    switch (locationStatus.status) {
      case LOCATION_STATUS.TEACHING:
        stats.teaching++;
        break;
      case LOCATION_STATUS.IN_OFFICE:
        stats.inOffice++;
        break;
      case LOCATION_STATUS.FREE:
        stats.free++;
        break;
      case LOCATION_STATUS.NOT_AVAILABLE:
        stats.notAvailable++;
        break;
      default:
        break;
    }

    if (locationStatus.hasConflict) {
      stats.conflicts++;
    }
  }

  return stats;
};

/**
 * Sort faculty locations by various criteria
 * @param {Array} facultyLocations - Array from getAllFacultyLocations
 * @param {string} sortBy - Sort field: 'name', 'room', 'status'
 * @param {string} sortOrder - 'asc' or 'desc'
 * @returns {Array} Sorted array
 */
export const sortFacultyLocations = (
  facultyLocations,
  sortBy = "name",
  sortOrder = "asc",
) => {
  const sorted = [...facultyLocations];

  const statusOrder = {
    [LOCATION_STATUS.TEACHING]: 1,
    [LOCATION_STATUS.IN_OFFICE]: 2,
    [LOCATION_STATUS.FREE]: 3,
    [LOCATION_STATUS.NOT_AVAILABLE]: 4,
    [LOCATION_STATUS.UNKNOWN]: 5,
  };

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "name":
        comparison = (a.faculty.name || "").localeCompare(b.faculty.name || "");
        break;
      case "room": {
        const roomA = a.locationStatus.currentLocation?.room || "";
        const roomB = b.locationStatus.currentLocation?.room || "";
        comparison = roomA.localeCompare(roomB);
        break;
      }
      case "status": {
        const orderA = statusOrder[a.locationStatus.status] || 99;
        const orderB = statusOrder[b.locationStatus.status] || 99;
        comparison = orderA - orderB;
        break;
      }
      default:
        comparison = 0;
    }

    return sortOrder === "desc" ? -comparison : comparison;
  });

  return sorted;
};

/**
 * Extract unique buildings from room occupancy map
 * @param {Map} roomOccupancy - Result from getRoomOccupancy
 * @returns {Array} Array of { building, rooms: [] }
 */
export const groupRoomsByBuilding = (roomOccupancy) => {
  const buildingMap = new Map();

  for (const [room, data] of roomOccupancy) {
    // Extract building from room string (e.g., "FCS 103" -> "FCS")
    const match = room.match(/^([A-Z]+)/i);
    const building = match ? match[1].toUpperCase() : "Other";

    if (!buildingMap.has(building)) {
      buildingMap.set(building, []);
    }

    buildingMap.get(building).push(data);
  }

  // Sort buildings alphabetically, then rooms within each
  const result = [];
  const sortedBuildings = [...buildingMap.keys()].sort();

  for (const building of sortedBuildings) {
    const rooms = buildingMap
      .get(building)
      .sort((a, b) => a.room.localeCompare(b.room));
    result.push({ building, rooms });
  }

  return result;
};
