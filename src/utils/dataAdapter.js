/**
 * Data Adapter Utilities
 *
 * FULLY RELATIONAL MODEL - This adapter commits to ID-based references only.
 *
 * Key principles:
 * 1. Names are ALWAYS resolved via ID lookups (no string fallbacks)
 * 2. If instructorId is missing, display "Unassigned" not cached string names
 * 3. Programs are resolved via programId, not string matching
 * 4. Spaces are resolved via spaceIds, not string parsing
 *
 * This prevents data inconsistencies where cached string names diverge from
 * the actual person/room records.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { parseTime } from './timeUtils';
import { buildCourseSectionKey } from './courseUtils';
import { buildPeopleIndex } from './peopleUtils';

// ==================== CONSTANTS ====================

/**
 * Display constants for unresolved references
 */
export const UNASSIGNED = 'Unassigned';
export const UNKNOWN_ROOM = 'TBA';
export const UNKNOWN_PROGRAM = 'Unassigned';

// ==================== DATA FETCHING ====================

/**
 * Fetch all people from the unified collection
 */
export const fetchPeople = async () => {
  try {
    const peopleSnapshot = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const { canonicalPeople } = buildPeopleIndex(people);
    return canonicalPeople;
  } catch (error) {
    console.error('Error fetching people:', error);
    return [];
  }
};

/**
 * Fetch all programs from the programs collection
 */
export const fetchPrograms = async () => {
  try {
    const programsSnapshot = await getDocs(collection(db, COLLECTIONS.PROGRAMS));
    return programsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching programs:', error);
    return [];
  }
};

/**
 * Fetch all schedules with populated instructor data
 */
export const fetchSchedulesWithInstructors = async () => {
  try {
    const [schedulesSnapshot, peopleSnapshot] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.SCHEDULES)),
      getDocs(collection(db, COLLECTIONS.PEOPLE))
    ]);

    const schedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const { peopleMap, resolvePersonId } = buildPeopleIndex(people);

    // Populate schedules with instructor data
    return schedules.map(schedule => ({
      ...schedule,
      instructorId: schedule.instructorId ? resolvePersonId(schedule.instructorId) : schedule.instructorId,
      instructor: schedule.instructorId ? peopleMap.get(schedule.instructorId) || null : null
    }));
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return [];
  }
};

// ==================== COMPONENT ADAPTERS ====================

/**
 * Convert normalized people data to faculty format for components
 */
export const adaptPeopleToFaculty = (people, scheduleData = [], programs = []) => {
  // Create lookup map for programs
  const programsMap = new Map(programs.map(program => [program.id, program]));
  const normalizedPeople = people.filter(person => !person?.mergedInto);

  return normalizedPeople
    .filter(person => {
      // Handle both array and object formats for roles
      if (Array.isArray(person.roles)) {
        return person.roles.includes('faculty');
      } else if (typeof person.roles === 'object' && person.roles !== null) {
        return person.roles.faculty === true;
      }
      return false;
    })
    .map(person => {
      const facultyName = `${person.firstName} ${person.lastName}`.trim();
      const isAdjunct = person.isAdjunct === true;

      // Single source of truth for program: use programId to lookup program
      let program = null;
      if (person.programId && programsMap.has(person.programId)) {
        const programData = programsMap.get(person.programId);
        program = {
          id: programData.id,
          name: programData.name,
          code: programData.code
        };
      }

      // Helper function to check if person has role (handles both formats)
      const hasRole = (role) => {
        if (Array.isArray(person.roles)) {
          return person.roles.includes(role);
        } else if (typeof person.roles === 'object' && person.roles !== null) {
          return person.roles[role] === true;
        }
        return false;
      };

      return {
        ...person, // Spread original data first
        id: person.id,
        name: facultyName,
        firstName: person.firstName,
        lastName: person.lastName,
        title: person.title,
        email: person.email,
        phone: person.phone,
        jobTitle: person.jobTitle,
        office: person.office,
        department: person.department || 'Human Sciences and Design', // Default department
        programId: person.programId || null, // Reference to programs collection
        isAdjunct,
        isTenured: isAdjunct ? false : (person.isTenured || false),
        isAlsoStaff: hasRole('staff'),
        isUPD: person.isUPD || false,
        baylorId: person.baylorId || '', // 9-digit Baylor ID number
        hasNoPhone: person.hasNoPhone || false,
        hasNoOffice: person.hasNoOffice || false,
        program: program // Ensure program is set last so it isn't overwritten
      };
    });
};

/**
 * Convert normalized people data to staff format for components
 */
export const adaptPeopleToStaff = (people) => {
  const normalizedPeople = people.filter(person => !person?.mergedInto);
  return normalizedPeople
    .filter(person => {
      // Handle both array and object formats for roles
      if (Array.isArray(person.roles)) {
        return person.roles.includes('staff');
      } else if (typeof person.roles === 'object' && person.roles !== null) {
        return person.roles.staff === true;
      }
      return false;
    })
    .map(person => {
      // Helper function to check if person has role (handles both formats)
      const hasRole = (role) => {
        if (Array.isArray(person.roles)) {
          return person.roles.includes(role);
        } else if (typeof person.roles === 'object' && person.roles !== null) {
          return person.roles[role] === true;
        }
        return false;
      };

      const staffName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
      const isAdjunct = person.isAdjunct === true;

      return {
        ...person, // Spread original data first (same pattern as adaptPeopleToFaculty)
        id: person.id,
        name: staffName,
        firstName: person.firstName,
        lastName: person.lastName,
        title: person.title,
        email: person.email,
        phone: person.phone,
        jobTitle: person.jobTitle,
        office: person.office,
        isFullTime: person.isFullTime,
        isTenured: hasRole('faculty') && !isAdjunct ? (person.isTenured || false) : false,
        isAlsoFaculty: hasRole('faculty'),
        hasNoPhone: person.hasNoPhone || false,
        hasNoOffice: person.hasNoOffice || false
      };
    });
};

// ==================== SEARCH AND FILTERING ====================

/**
 * Search people by name, email, or job title
 */
export const searchPeople = (people, searchTerm) => {
  if (!searchTerm) return people;

  const term = searchTerm.toLowerCase();
  return people.filter(person =>
    person.firstName.toLowerCase().includes(term) ||
    person.lastName.toLowerCase().includes(term) ||
    person.email.toLowerCase().includes(term) ||
    person.jobTitle.toLowerCase().includes(term) ||
    person.department.toLowerCase().includes(term)
  );
};

/**
 * Helper function to check if person has role (handles both formats)
 */
const hasRole = (person, role) => {
  if (Array.isArray(person.roles)) {
    return person.roles.includes(role);
  } else if (typeof person.roles === 'object' && person.roles !== null) {
    return person.roles[role] === true;
  }
  return false;
};

/**
 * Filter people by role
 */
export const filterPeopleByRole = (people, role) => {
  if (!role) return people;
  return people.filter(person => hasRole(person, role));
};

/**
 * Get people with dual roles (both faculty and staff)
 */
export const getDualRolePeople = (people) => {
  return people.filter(person =>
    hasRole(person, 'faculty') && hasRole(person, 'staff')
  );
};

// ==================== ANALYTICS ADAPTERS ====================

/**
 * Generate analytics data from normalized schedules
 */
export const generateAnalyticsFromNormalizedData = (schedulesWithInstructors, people) => {
  const { peopleMap, canonicalPeople } = buildPeopleIndex(people);
  const facultyWorkload = {};
  const roomUtilization = {};
  const dayStats = {};

  // Process schedules
  const processedSessions = new Set();

  for (const schedule of schedulesWithInstructors) {
    const courseKey = buildCourseSectionKey(schedule) || schedule.courseCode || '';
    for (const pattern of schedule.meetingPatterns || []) {
      const sessionKey = `${schedule.instructorId}-${courseKey}-${pattern.day}-${pattern.startTime}-${pattern.endTime}`;

      if (!processedSessions.has(sessionKey)) {
        processedSessions.add(sessionKey);

        // Faculty workload (excluding adjunct faculty for workload tracking)
        const instructor = schedule.instructorId ? peopleMap.get(schedule.instructorId) : null;
        const instructorName = getInstructorDisplayName(instructor);
        if (schedule.instructorId && instructor && !instructor.isAdjunct) {
          if (!facultyWorkload[instructorName]) {
            facultyWorkload[instructorName] = {
              courseSet: new Set(),
              totalHours: 0
            };
          }

          if (courseKey) {
            facultyWorkload[instructorName].courseSet.add(courseKey);
          }

          // Calculate duration
          const duration = calculateDuration(pattern.startTime, pattern.endTime);
          facultyWorkload[instructorName].totalHours += duration;
        }

        // Room utilization
        // Multi-room aware utilization
        const spaceLabels = Array.isArray(schedule.spaceDisplayNames) && schedule.spaceDisplayNames.length > 0
          ? schedule.spaceDisplayNames
          : [];
        spaceLabels
          .filter(rn => rn && rn.toLowerCase() !== 'online')
          .forEach((rn) => {
            if (!roomUtilization[rn]) {
              roomUtilization[rn] = { classes: 0, hours: 0, adjunctTaughtClasses: 0 };
            }
            roomUtilization[rn].classes++;
            const duration = calculateDuration(pattern.startTime, pattern.endTime);
            roomUtilization[rn].hours += duration;
            const instructor = schedule.instructorId ? peopleMap.get(schedule.instructorId) : null;
            if (instructor?.isAdjunct) {
              roomUtilization[rn].adjunctTaughtClasses++;
            }
          });

        // Day statistics
        if (pattern.day) {
          dayStats[pattern.day] = (dayStats[pattern.day] || 0) + 1;
        }
      }
    }
  }

  // Convert faculty workload to final format
  const finalFacultyWorkload = Object.fromEntries(
    Object.entries(facultyWorkload).map(([instructor, data]) => [
      instructor,
      { courses: data.courseSet.size, totalHours: data.totalHours }
    ])
  );

  // Calculate additional metrics
  const facultyPeople = canonicalPeople.filter(p => hasRole(p, 'faculty'));
  const uniqueRooms = Object.keys(roomUtilization);
  const totalSessions = processedSessions.size;
  const adjunctTaughtSessions = schedulesWithInstructors.filter(s => {
    const instructor = s.instructorId ? peopleMap.get(s.instructorId) : null;
    return instructor?.isAdjunct;
  }).length;
  const uniqueCourseKeys = new Set();
  schedulesWithInstructors.forEach((schedule) => {
    const key = buildCourseSectionKey(schedule);
    if (!key) return;
    uniqueCourseKeys.add(key);
  });
  const uniqueCourses = uniqueCourseKeys.size;

  const busiestDay = Object.entries(dayStats).reduce(
    (max, [day, count]) => count > max.count ? { day, count } : max,
    { day: '', count: 0 }
  );

  return {
    facultyCount: facultyPeople.length,
    adjunctTaughtSessions,
    roomsInUse: uniqueRooms.length,
    totalSessions,
    uniqueCourses,
    busiestDay,
    facultyWorkload: finalFacultyWorkload,
    roomUtilization,
    uniqueRooms,
    uniqueInstructors: [...new Set(schedulesWithInstructors.map(s => getInstructorDisplayName(s.instructor || null)))].filter(Boolean),
  };
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Calculate duration between two time strings
 */
const calculateDuration = (startTime, endTime) => {
  const start = parseTime(startTime);
  const end = parseTime(endTime);

  if (start !== null && end !== null && end > start) {
    return (end - start) / 60; // Return hours
  }

  return 0;
};

/**
 * Get full name from person object
 */
export const getFullName = (person) => {
  if (!person) return '';

  const parts = [];
  if (person.title) parts.push(person.title);
  if (person.firstName) parts.push(person.firstName);
  if (person.lastName) parts.push(person.lastName);

  return parts.join(' ');
};

/**
 * Get display name for instructor (used in schedules)
 *
 * RELATIONAL MODEL: Always resolve from person object, never from cached strings.
 * If person is null/undefined, return "Unassigned" to indicate missing reference.
 */
export const getInstructorDisplayName = (person) => {
  if (!person) return UNASSIGNED;
  const name = `${person.firstName || ''} ${person.lastName || ''}`.trim();
  return name || UNASSIGNED;
};

/**
 * Resolve instructor name from schedule using ID lookup
 *
 * @param {Object} schedule - The schedule object
 * @param {Map|Object} peopleMap - Map of person ID to person object
 * @returns {string} The instructor's display name or "Unassigned"
 */
export const resolveInstructorName = (schedule, peopleMap) => {
  if (!schedule?.instructorId) {
    return UNASSIGNED;
  }

  const person = peopleMap instanceof Map
    ? peopleMap.get(schedule.instructorId)
    : peopleMap[schedule.instructorId];

  return getInstructorDisplayName(person);
};

/**
 * Resolve room display name from schedule using ID lookup
 *
 * @param {Object} schedule - The schedule object
 * @param {Map|Object} roomsMap - Map of room ID to room object
 * @returns {string} The room display name or "TBA"
 */
export const resolveLocationDisplay = (schedule, roomsMap, spacesByKey = null) => {
  if (schedule?.locationType === 'no_room' || schedule?.isOnline) {
    return schedule?.locationLabel || 'No Room Needed';
  }

  // Prefer canonical spaceIds
  if (Array.isArray(schedule?.spaceIds) && schedule.spaceIds.length > 0) {
    const map = spacesByKey instanceof Map ? spacesByKey : null;
    const names = schedule.spaceIds
      .map((key) => {
        const room = map ? map.get(key) : spacesByKey?.[key];
        return room ? (room.displayName || room.name) : null;
      })
      .filter(Boolean);
    if (names.length > 0) {
      return names.join('; ');
    }
  }

  if (Array.isArray(schedule?.spaceDisplayNames) && schedule.spaceDisplayNames.length > 0) {
    return schedule.spaceDisplayNames.join('; ');
  }

  return UNKNOWN_ROOM;
};

/**
 * Enrich schedule with resolved display names
 *
 * This function resolves all ID references to display names using lookup maps.
 * It should be used when preparing schedules for UI display.
 *
 * @param {Object} schedule - The schedule object with ID references
 * @param {Map} peopleMap - Map of person ID to person object
 * @param {Map} roomsMap - Map of room ID to room object
 * @param {Map} programsMap - Map of program ID to program object
 * @returns {Object} Schedule with resolved display names
 */
export const enrichScheduleForDisplay = (schedule, peopleMap, roomsMap, programsMap) => {
  if (!schedule) return null;

  const instructor = schedule.instructorId ? peopleMap.get(schedule.instructorId) : null;
  const instructorName = getInstructorDisplayName(instructor);
  const spaceMap = new Map();
  if (roomsMap instanceof Map) {
    roomsMap.forEach((room) => {
      if (room?.spaceKey && !spaceMap.has(room.spaceKey)) {
        spaceMap.set(room.spaceKey, room);
      }
    });
  } else if (roomsMap && typeof roomsMap === 'object') {
    Object.values(roomsMap).forEach((room) => {
      if (room?.spaceKey && !spaceMap.has(room.spaceKey)) {
        spaceMap.set(room.spaceKey, room);
      }
    });
  }

  const locationDisplay = resolveLocationDisplay(schedule, roomsMap, spaceMap);

  // Resolve program from instructor if available
  let programName = UNKNOWN_PROGRAM;
  if (instructor?.programId && programsMap) {
    const program = programsMap.get(instructor.programId);
    if (program) {
      programName = program.name;
    }
  }

  return {
    ...schedule,
    // Resolved display fields
    instructorName,
    locationDisplay,
    programName,
    // Include full instructor object for detailed views
    instructor,
    // Flag indicating if instructor is properly linked
    _hasValidInstructor: !!instructor,
    _hasValidRoom: schedule.locationType === 'no_room' ||
      schedule.isOnline ||
      (Array.isArray(schedule.spaceIds) && schedule.spaceIds.length > 0)
  };
};

// ==================== MIGRATION HELPERS ====================

/**
 * Check if system is using normalized data model
 */
export const isNormalizedDataAvailable = async () => {
  try {
    const peopleSnapshot = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    return peopleSnapshot.docs.length > 0;
  } catch (error) {
    return false;
  }
};

export default {
  // Constants
  UNASSIGNED,
  UNKNOWN_ROOM,
  UNKNOWN_PROGRAM,
  // Data fetching
  fetchPeople,
  fetchPrograms,
  fetchSchedulesWithInstructors,
  // Component adapters
  adaptPeopleToFaculty,
  adaptPeopleToStaff,
  // Search and filtering
  searchPeople,
  filterPeopleByRole,
  getDualRolePeople,
  // Analytics
  generateAnalyticsFromNormalizedData,
  // Display helpers (relational model)
  getFullName,
  getInstructorDisplayName,
  resolveInstructorName,
  resolveLocationDisplay,
  enrichScheduleForDisplay,
  // Migration helpers
  isNormalizedDataAvailable
}; 
