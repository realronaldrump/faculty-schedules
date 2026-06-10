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


import { collection, getDocs } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';

// ==================== CONSTANTS ====================

/**
 * Display constant for unresolved references
 */
export const UNASSIGNED = 'Unassigned';

// ==================== DATA FETCHING ====================

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

// ==================== COMPONENT ADAPTERS ====================

/**
 * Convert normalized people data to faculty format for components
 */
export const adaptPeopleToFaculty = (
  people,
  _scheduleData = [],
  programs = [],
  options = {},
) => {
  const { includeInactive = false } = options;
  // Create lookup map for programs
  const programsMap = new Map(programs.map(program => [program.id, program]));
  const normalizedPeople = people.filter(person => !person?.mergedInto);

  return normalizedPeople
    .filter(person => {
      if (!includeInactive && person?.isActive === false) return false;
      const hasFacultyRole = Array.isArray(person.roles)
        ? person.roles.includes('faculty')
        : (typeof person.roles === 'object' && person.roles !== null
          ? person.roles.faculty === true
          : false);
      return hasFacultyRole || person.isAdjunct === true || person.isUPD === true;
    })
    .map(person => {
      const facultyName = `${person.firstName || ""} ${person.lastName || ""}`.trim();
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
        isActive: person.isActive !== false,
        inactiveAt: person.inactiveAt || '',
        inactiveReason: person.inactiveReason || '',
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
export const adaptPeopleToStaff = (people, _scheduleData = [], _programs = [], options = {}) => {
  const { includeInactive = false } = options;
  const normalizedPeople = people.filter(person => !person?.mergedInto);
  return normalizedPeople
    .filter(person => {
      if (!includeInactive && person?.isActive === false) return false;
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

      const staffName = `${person.firstName || ""} ${person.lastName || ""}`.trim();
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
        isActive: person.isActive !== false,
        inactiveAt: person.inactiveAt || '',
        inactiveReason: person.inactiveReason || '',
        hasNoPhone: person.hasNoPhone || false,
        hasNoOffice: person.hasNoOffice || false
      };
    });
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
