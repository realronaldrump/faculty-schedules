/**
 * Utilities used by "Now View" style screens (faculty/room occupancy).
 *
 * Note: These are intentionally dependency-free and are safe to use in tests.
 */

const DAY_CODE_BY_JS_DAY = {
  0: null, // Sunday
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'R',
  5: 'F',
  6: null, // Saturday
};

const getDayCode = (date) => DAY_CODE_BY_JS_DAY[date?.getDay?.()] || null;

const parseDateOnly = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // Interpret as local date to avoid UTC skew.
  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Parse a time string into minutes since midnight.
 *
 * Supports:
 * - 12h format: "2:00 PM", "9:30 am"
 * - 24h format: "14:00", "09:30"
 * - compact: "1400", "930"
 */
export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const raw = String(timeStr).trim();
  if (!raw) return null;

  // Compact: 3-4 digits (HMM or HHMM)
  if (/^\d{3,4}$/.test(raw)) {
    const digits = raw.padStart(4, '0');
    const hours = Number(digits.slice(0, 2));
    const minutes = Number(digits.slice(2));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3] ? match[3].toUpperCase() : null;

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  } else {
    // 24h
    if (hours < 0 || hours > 23) return null;
  }

  return hours * 60 + minutes;
};

export const formatMinutesToTime = (minutes) => {
  if (!Number.isFinite(minutes)) return '';
  const normalized = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;

  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const padded = String(mins).padStart(2, '0');
  return `${hours12}:${padded} ${period}`;
};

export const doesPatternApplyToDate = (pattern, date) => {
  if (!pattern || !date) return false;
  const day = (pattern.day || '').toString().trim();
  if (!day) return false;

  const code = getDayCode(date);
  if (!code) return false;

  // Date-range boundaries are inclusive.
  if (pattern.startDate) {
    const start = parseDateOnly(pattern.startDate);
    if (start) {
      if (startOfDay(date) < startOfDay(start)) return false;
    }
  }
  if (pattern.endDate) {
    const end = parseDateOnly(pattern.endDate);
    if (end) {
      if (startOfDay(date) > startOfDay(end)) return false;
    }
  }

  return day.includes(code);
};

export const isTimeInPattern = (pattern, timestamp) => {
  if (!pattern || !timestamp) return false;

  const start = parseTimeToMinutes(pattern.startTime);
  const end = parseTimeToMinutes(pattern.endTime);
  if (start === null || end === null) return false;

  const minutes = timestamp.getHours() * 60 + timestamp.getMinutes();

  // Overnight: spans midnight (e.g., 11:00 PM -> 1:00 AM)
  const isOvernight = end <= start;

  if (!isOvernight) {
    if (!doesPatternApplyToDate(pattern, timestamp)) return false;
    return minutes >= start && minutes < end;
  }

  // Part 1: on the start-day, from start -> midnight
  if (doesPatternApplyToDate(pattern, timestamp) && minutes >= start) {
    return true;
  }

  // Part 2: after midnight on the following day, from 0 -> end.
  const prevDay = new Date(timestamp);
  prevDay.setDate(prevDay.getDate() - 1);
  if (doesPatternApplyToDate(pattern, prevDay) && minutes < end) {
    return true;
  }

  return false;
};

export const findActiveAssignments = (schedules = [], facultyId, timestamp) => {
  if (!facultyId || !timestamp) return [];
  if (!Array.isArray(schedules) || schedules.length === 0) return [];

  const results = [];

  schedules.forEach((schedule) => {
    if (!schedule) return;
    const instructorIds = Array.isArray(schedule.instructorIds)
      ? schedule.instructorIds
      : [];
    if (!instructorIds.includes(facultyId)) return;

    const patterns = Array.isArray(schedule.meetingPatterns)
      ? schedule.meetingPatterns
      : [];

    patterns.forEach((pattern) => {
      if (!pattern) return;
      const mode = (pattern.mode || '').toString().toLowerCase();
      if (mode === 'online' || mode === 'arranged') return;

      if (!isTimeInPattern(pattern, timestamp)) return;

      results.push({
        scheduleId: schedule.id,
        schedule,
        pattern,
        courseCode: schedule.courseCode,
        courseTitle: schedule.courseTitle,
        startTime: pattern.startTime,
        endTime: pattern.endTime,
        spaceIds: schedule.spaceIds || [],
      });
    });
  });

  return results;
};

export const findNextAssignment = (schedules = [], facultyId, timestamp) => {
  if (!facultyId || !timestamp) return null;
  if (!Array.isArray(schedules) || schedules.length === 0) return null;

  const candidates = [];
  const currentMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();

  for (const schedule of schedules) {
    if (!schedule) continue;
    const instructorIds = Array.isArray(schedule.instructorIds)
      ? schedule.instructorIds
      : [];
    if (!instructorIds.includes(facultyId)) continue;

    const patterns = Array.isArray(schedule.meetingPatterns)
      ? schedule.meetingPatterns
      : [];

    for (const pattern of patterns) {
      if (!pattern) continue;
      const mode = (pattern.mode || '').toString().toLowerCase();
      if (mode === 'online' || mode === 'arranged') continue;

      const startMinutes = parseTimeToMinutes(pattern.startTime);
      if (startMinutes === null) continue;

      // "Next" is scoped to the same calendar day.
      if (!doesPatternApplyToDate(pattern, timestamp)) continue;
      const diffMinutes = startMinutes - currentMinutes;
      if (diffMinutes <= 0) continue;

      candidates.push({
        scheduleId: schedule.id,
        schedule,
        pattern,
        startTime: pattern.startTime,
        endTime: pattern.endTime,
        minutesUntil: diffMinutes,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.minutesUntil - b.minutesUntil);
  return candidates[0];
};

export const detectConflicts = (activeAssignments = []) => {
  if (!Array.isArray(activeAssignments) || activeAssignments.length < 2) {
    return [];
  }

  const conflicts = [];
  const parsed = activeAssignments
    .map((a) => ({
      ...a,
      _start: parseTimeToMinutes(a.startTime),
      _end: parseTimeToMinutes(a.endTime),
    }))
    .filter((a) => a._start !== null && a._end !== null)
    .sort((a, b) => a._start - b._start);

  for (let i = 0; i < parsed.length; i += 1) {
    for (let j = i + 1; j < parsed.length; j += 1) {
      const a = parsed[i];
      const b = parsed[j];

      // Same schedule can have multiple patterns; don't treat that as a conflict.
      if (a.scheduleId && b.scheduleId && a.scheduleId === b.scheduleId) continue;

      // Since sorted by start, once b starts after a ends (half-open), no later overlaps.
      if (b._start >= a._end) break;

      const overlapStart = Math.max(a._start, b._start);
      const overlapEnd = Math.min(a._end, b._end);
      if (overlapStart < overlapEnd) {
        conflicts.push({
          scheduleId1: a.scheduleId,
          scheduleId2: b.scheduleId,
          overlapStart,
          overlapEnd,
          assignment1: a,
          assignment2: b,
        });
      }
    }
  }

  return conflicts;
};

export const determineStatus = (activeAssignments = [], conflicts = []) => {
  if (Array.isArray(conflicts) && conflicts.length > 0) return 'conflict';
  if (!Array.isArray(activeAssignments) || activeAssignments.length === 0) return 'free';

  const hasOnline = activeAssignments.some((a) => {
    const mode = (a?.pattern?.mode || '').toString().toLowerCase();
    return mode === 'online' || mode === 'arranged';
  });
  if (hasOnline) return 'online';

  return 'in-class';
};

export const getLocationDisplay = (spaceIds, spacesIndex = {}) => {
  const ids = Array.isArray(spaceIds) ? spaceIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return {
      spaceId: null,
      room: 'Unknown',
      building: '',
      fullLocation: 'Unknown Location',
      additionalRooms: [],
    };
  }

  const primary = ids[0];
  const space = spacesIndex ? spacesIndex[primary] : null;
  const room =
    space?.roomNumber ||
    space?.spaceNumber ||
    space?.room ||
    primary;
  const building = space?.buildingName || space?.building || '';
  const fullLocation = building
    ? `${building} ${room}`.trim()
    : room || 'Unknown Location';

  return {
    spaceId: primary,
    room,
    building,
    fullLocation,
    additionalRooms: ids.slice(1),
  };
};

export const buildFacultyLocationStatus = ({
  schedules = [],
  faculty = [],
  spacesIndex = {},
  timestamp = new Date(),
}) => {
  if (!Array.isArray(faculty) || faculty.length === 0) return [];

  return faculty.map((person) => {
    const personId = person?.id;
    const name = `${person?.firstName || ''} ${person?.lastName || ''}`.trim() || '(unknown)';

    const activeAssignments = findActiveAssignments(schedules, personId, timestamp);
    const conflicts = detectConflicts(activeAssignments);
    const status = determineStatus(activeAssignments, conflicts);

    const primarySpaceIds =
      activeAssignments[0]?.spaceIds ||
      activeAssignments[0]?.schedule?.spaceIds ||
      [];
    const location = getLocationDisplay(primarySpaceIds, spacesIndex);

    const nextAssignment = status === 'free'
      ? findNextAssignment(schedules, personId, timestamp)
      : null;

    return {
      personId,
      name,
      department: person?.department,
      status,
      location,
      activeAssignments,
      conflicts: conflicts.length > 0 ? conflicts : null,
      nextAssignment,
    };
  });
};

export const buildRoomOccupancy = ({
  schedules = [],
  faculty = [],
  spacesIndex = {},
  timestamp = new Date(),
}) => {
  if (!Array.isArray(faculty) || faculty.length === 0) return [];

  const occupancy = new Map();

  faculty.forEach((person) => {
    const personId = person?.id;
    const name = `${person?.firstName || ''} ${person?.lastName || ''}`.trim() || '(unknown)';

    const activeAssignments = findActiveAssignments(schedules, personId, timestamp);
    activeAssignments.forEach((assignment) => {
      const spaceId = Array.isArray(assignment.spaceIds) && assignment.spaceIds.length > 0
        ? assignment.spaceIds[0]
        : null;
      if (!spaceId) return;

      if (!occupancy.has(spaceId)) {
        const loc = getLocationDisplay([spaceId], spacesIndex);
        occupancy.set(spaceId, {
          spaceId,
          ...loc,
          occupants: [],
        });
      }

      occupancy.get(spaceId).occupants.push({
        personId,
        name,
        scheduleId: assignment.scheduleId,
        courseCode: assignment.courseCode,
        courseTitle: assignment.courseTitle,
      });
    });
  });

  const rooms = Array.from(occupancy.values());
  rooms.sort((a, b) => (a.fullLocation || '').localeCompare(b.fullLocation || ''));
  return rooms;
};

const STATUS_DISPLAY = {
  'in-class': {
    label: 'In class',
    color: 'green',
    bgColor: 'bg-green-50',
    textColor: 'text-green-800',
  },
  free: {
    label: 'Free',
    color: 'gray',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
  },
  conflict: {
    label: 'Conflict',
    color: 'red',
    bgColor: 'bg-red-50',
    textColor: 'text-red-800',
  },
  online: {
    label: 'Online',
    color: 'blue',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-800',
  },
};

export const getStatusDisplay = (status) => {
  const key = (status || '').toString();
  return STATUS_DISPLAY[key] || STATUS_DISPLAY.free;
};
