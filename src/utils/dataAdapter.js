/**
 * Data Adapter Utilities
 * Bridge between normalized data model and existing component interfaces
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { parseTime } from './timeUtils';

// ==================== DATA FETCHING ====================

/**
 * Fetch all people from the unified collection
 */
export const fetchPeople = async () => {
  try {
    const peopleSnapshot = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    return peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

    // Create lookup map for people
    const peopleMap = new Map(people.map(person => [person.id, person]));

    // Populate schedules with instructor data
    return schedules.map(schedule => ({
      ...schedule,
      instructor: peopleMap.get(schedule.instructorId) || null
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

  return people
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
        isAdjunct: person.isAdjunct,
        isTenured: person.isTenured || false,
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
  return people
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

      return {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`.trim(),
        firstName: person.firstName,
        lastName: person.lastName,
        title: person.title,
        email: person.email,
        phone: person.phone,
        jobTitle: person.jobTitle,
        office: person.office,
        isFullTime: person.isFullTime,
        isTenured: hasRole('faculty') ? (person.isTenured || false) : false, // Only display tenure for dual-role staff
        isAlsoFaculty: hasRole('faculty'),
        hasNoPhone: person.hasNoPhone || false,
        hasNoOffice: person.hasNoOffice || false,
        ...person // Include any additional fields
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
  const facultyWorkload = {};
  const roomUtilization = {};
  const dayStats = {};

  // Process schedules
  const processedSessions = new Set();

  for (const schedule of schedulesWithInstructors) {
    for (const pattern of schedule.meetingPatterns || []) {
      const sessionKey = `${schedule.instructorId}-${schedule.courseCode}-${pattern.day}-${pattern.startTime}-${pattern.endTime}`;

      if (!processedSessions.has(sessionKey)) {
        processedSessions.add(sessionKey);

        // Faculty workload (excluding adjunct faculty for workload tracking)
        const instructor = people.find(p => p.id === schedule.instructorId);
        if (schedule.instructorId && !instructor?.isAdjunct) {
          if (!facultyWorkload[schedule.instructorName]) {
            facultyWorkload[schedule.instructorName] = {
              courseSet: new Set(),
              totalHours: 0
            };
          }

          facultyWorkload[schedule.instructorName].courseSet.add(schedule.courseCode);

          // Calculate duration
          const duration = calculateDuration(pattern.startTime, pattern.endTime);
          facultyWorkload[schedule.instructorName].totalHours += duration;
        }

        // Room utilization
        // Multi-room aware utilization
        const roomNamesArr = Array.isArray(schedule.roomNames) && schedule.roomNames.length > 0
          ? schedule.roomNames
          : (schedule.roomName ? [schedule.roomName] : []);
        roomNamesArr
          .filter(rn => rn && rn.toLowerCase() !== 'online')
          .forEach((rn) => {
            if (!roomUtilization[rn]) {
              roomUtilization[rn] = { classes: 0, hours: 0, adjunctTaughtClasses: 0 };
            }
            roomUtilization[rn].classes++;
            const duration = calculateDuration(pattern.startTime, pattern.endTime);
            roomUtilization[rn].hours += duration;
            const instructor = people.find(p => p.id === schedule.instructorId);
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
  const facultyPeople = people.filter(p => hasRole(p, 'faculty'));
  const uniqueRooms = Object.keys(roomUtilization);
  const totalSessions = processedSessions.size;
  const adjunctTaughtSessions = schedulesWithInstructors.filter(s => {
    const instructor = people.find(p => p.id === s.instructorId);
    return instructor?.isAdjunct;
  }).length;
  const uniqueCourses = [...new Set(schedulesWithInstructors.map(s => s.courseCode))].length;

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
    uniqueInstructors: [...new Set(schedulesWithInstructors.map(s => s.instructorName))].filter(Boolean),
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
 */
export const getInstructorDisplayName = (person) => {
  if (!person) return 'Staff';
  return `${person.firstName} ${person.lastName}`.trim() || 'Unknown';
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
  fetchPeople,
  fetchPrograms,
  fetchSchedulesWithInstructors,
  adaptPeopleToFaculty,
  adaptPeopleToStaff,
  searchPeople,
  filterPeopleByRole,
  getDualRolePeople,
  generateAnalyticsFromNormalizedData,
  getFullName,
  getInstructorDisplayName,
  isNormalizedDataAvailable
}; 