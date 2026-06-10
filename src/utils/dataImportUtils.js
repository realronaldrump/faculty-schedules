/**
 * Smart Data Import Processing Utilities
 * Implements normalized data model with unified 'people' collection and ID-based references
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db, COLLECTIONS } from "../firebase";
import { getInstructorDisplayName, UNASSIGNED } from "./dataAdapter";
import { buildPeopleIndex } from "./peopleUtils";
import { parseFullName } from "./nameUtils";
import { normalizeTermLabel, termCodeFromLabel } from "./termUtils";
// Import from centralized location service
import { resolveScheduleSpaces } from "./spaceUtils";

// ==================== CORE DATA MODELS ====================

/**
 * Schedule Model with ID-based references
 */
// ==================== UPSERT HELPERS ====================

/**
 * Determine whether a value should be considered "empty" for merge purposes
 */
const isEmptyForMerge = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

/**
 * Build an updates object applying upsert rules:
 * - If CSV has a non-empty value, it overwrites existing
 * - If CSV value is empty, leave existing field unchanged (omit from updates)
 * - Always refresh updatedAt
 */
export const buildUpsertUpdates = (
  existingRecord,
  incomingRecord,
  options = {},
) => {
  const allowEmptyFields = new Set(options.allowEmptyFields || []);
  const updates = {};
  let hasChanges = false;

  const deepEqual = (a, b) => {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === "object") {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  Object.keys(incomingRecord).forEach((key) => {
    if (key === "createdAt" || key === "updatedAt") return; // ignore timestamps for diff

    const incoming = incomingRecord[key];
    if (isEmptyForMerge(incoming) && !allowEmptyFields.has(key)) return; // don't overwrite with empty

    const existing = existingRecord[key];
    const valuesEqual = deepEqual(incoming, existing);

    if (!valuesEqual) {
      updates[key] = incoming;
      hasChanges = true;
    }
  });

  if (hasChanges) {
    updates.updatedAt = new Date().toISOString();
  }

  return { updates, hasChanges };
};

/**
 * Parse instructor field from CLSS format: "LastName, FirstName (ID) [Primary, 100%]"
 */
export const parseInstructorField = (instructorField) => {
  if (!instructorField) return null;

  const cleanField = instructorField.trim();

  // Handle "Staff" case
  if (cleanField.toLowerCase().includes("staff")) {
    return {
      lastName: "Staff",
      firstName: "",
      title: "",
      id: null,
      percentage: 100,
      isPrimary: true,
      isStaff: true,
    };
  }

  // Parse format: "LastName, FirstName (ID) [Primary, 100%]" or "[50%]"
  const match = cleanField.match(
    /^([^,]+),\s*([^([]+?)(?:\s*\(([^)]+)\))?(?:\s*\[([^\]]+)\])?$/,
  );

  if (match) {
    const [, lastName, firstName, id, bracket] = match;
    let percentage = 100;
    let isPrimary = false;

    if (bracket) {
      const parts = bracket
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      let role = "";
      let percentRaw = "";
      if (parts.length === 2) {
        [role, percentRaw] = parts;
      } else if (parts.length === 1) {
        if (parts[0].toLowerCase().includes("primary")) {
          role = parts[0];
        } else {
          percentRaw = parts[0];
        }
      }
      if (role) {
        isPrimary = role.toLowerCase().includes("primary");
      }
      if (percentRaw) {
        const numeric = percentRaw.replace(/[^0-9]/g, "");
        if (numeric) percentage = parseInt(numeric, 10);
      }
    }

    return {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      title: "",
      id: id ? id.trim() : null,
      percentage,
      isPrimary,
      isStaff: false,
    };
  }

  // Fallback: try to parse as "LastName, FirstName"
  const simpleMatch = cleanField.match(/^([^,]+),\s*(.+)$/);
  if (simpleMatch) {
    const [, lastName, firstName] = simpleMatch;
    return {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      title: "",
      id: null,
      percentage: 100,
      isPrimary: true,
      isStaff: false,
    };
  }

  // Last resort: treat as full name
  const parsed = parseFullName(cleanField);
  return {
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    title: parsed.title,
    id: null,
    percentage: 100,
    isPrimary: true,
    isStaff: false,
  };
};

/**
 * Parse one or more instructors from CLSS format (semicolon-delimited).
 */
export const parseInstructorFieldList = (instructorField) => {
  if (!instructorField) return [];
  const raw = instructorField.toString();
  const parts = raw
    .split(/\s*(?:;|\n|\s+and\s+|\s+&\s+|\s+\/\s+)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const parsed = parts.map((part) => parseInstructorField(part)).filter(Boolean);
  return parsed;
};

/**
 * Extract cross-listed CRNs from CLSS row (if present).
 *
 * Supports fixed CLSS fields and a defensive fallback that scans any key
 * containing "cross-list". Returns a sorted, unique CRN array.
 */
export const parseCrossListCrns = (row, options = {}) => {
  const { includePrimaryCrn = true } = options;
  const crns = new Set();
  const addCrnsFromValue = (value) => {
    if (!value) return;
    const text = String(value);
    const matches = text.match(/\b(\d{5,6})\b/g);
    if (matches) {
      matches.forEach((token) => {
        const normalized = String(token).trim();
        if (normalized) crns.add(normalized);
      });
    }
  };

  if (includePrimaryCrn) {
    addCrnsFromValue(row?.CRN);
  }

  const fixedFields = [
    "Cross-listings",
    "Cross-list Enrollment",
    "Cross-list Maximum",
    "Cross-list Wait Total",
    "Also",
  ];
  fixedFields.forEach((field) => addCrnsFromValue(row?.[field]));

  if (row && typeof row === "object") {
    Object.entries(row).forEach(([key, value]) => {
      if (!key || !/cross[-\s]?list/i.test(String(key))) return;
      addCrnsFromValue(value);
    });
  }

  return Array.from(crns).sort();
};

// ==================== CLSS CSV PARSING ====================

// ==================== RELATIONAL DATA FETCHING ====================

const enrichSchedules = (schedules, people, rooms, programs, courses = []) => {
  const { peopleMap, resolvePersonId, canonicalPeople } =
    buildPeopleIndex(people);
  const spacesByKey = new Map();
  rooms.forEach((room) => {
    if (room?.spaceKey && !spacesByKey.has(room.spaceKey)) {
      spacesByKey.set(room.spaceKey, room);
    }
  });
  const programsMap = new Map(programs.map((p) => [p.id, p]));
  const coursesById = new Map();
  const coursesByCode = new Map();
  const normalizeCourseCode = (value) => {
    if (!value) return "";
    return String(value).trim().toUpperCase().replace(/\s+/g, " ");
  };
  const normalizeCourseId = (value) => {
    if (!value) return "";
    return String(value).trim().toUpperCase().replace(/\s+/g, "_");
  };

  courses.forEach((course) => {
    if (!course) return;
    if (course.id) coursesById.set(course.id, course);
    const code = course.courseCode || course.code || "";
    const normalizedCode = normalizeCourseCode(code);
    if (normalizedCode) coursesByCode.set(normalizedCode, course);
    const normalizedId = normalizeCourseId(code);
    if (normalizedId && !coursesById.has(normalizedId)) {
      coursesById.set(normalizedId, course);
    }
  });

  const enrichedSchedules = schedules.map((schedule) => {
    const resolvedInstructorId = schedule.instructorId
      ? resolvePersonId(schedule.instructorId)
      : null;
    const instructor = resolvedInstructorId
      ? peopleMap.get(resolvedInstructorId)
      : null;

    let instructorWithProgram = instructor;
    if (instructor && instructor.programId) {
      const program = programsMap.get(instructor.programId);
      if (program) {
        instructorWithProgram = {
          ...instructor,
          program: {
            id: program.id,
            name: program.name,
          },
        };
      }
    }

    const resolvedRooms = Array.isArray(schedule.spaceIds) && schedule.spaceIds.length > 0
      ? schedule.spaceIds.map((sid) => spacesByKey.get(sid)).filter(Boolean)
      : [];

    const primaryRoom = resolvedRooms[0] || null;
    const resolvedLocation = resolveScheduleSpaces(schedule, spacesByKey);
    const locationDisplay = resolvedLocation.display || '';
    const locationDisplayNames = Array.isArray(resolvedLocation.displayNames)
      ? resolvedLocation.displayNames
      : [];

    const instructorName = instructorWithProgram
      ? getInstructorDisplayName(instructorWithProgram)
      : schedule.instructorId
        ? UNASSIGNED
        : schedule.instructorName || UNASSIGNED;

    const resolvedCourse =
      (schedule.courseId
        ? coursesById.get(schedule.courseId) ||
          coursesById.get(normalizeCourseId(schedule.courseId))
        : null) ||
      (schedule.courseCode
        ? coursesByCode.get(normalizeCourseCode(schedule.courseCode)) ||
          coursesById.get(normalizeCourseId(schedule.courseCode))
        : null);
    const baseCourseTitle =
      schedule.courseTitle ||
      schedule["Course Title"] ||
      schedule.Title ||
      schedule.title ||
      "";
    const resolvedCourseTitle =
      baseCourseTitle ||
      resolvedCourse?.title ||
      resolvedCourse?.courseTitle ||
      resolvedCourse?.["Course Title"] ||
      "";

    return {
      ...schedule,
      courseTitle: resolvedCourseTitle,
      instructorId: resolvedInstructorId || schedule.instructorId,
      instructor: instructorWithProgram,
      rooms: resolvedRooms,
      room: primaryRoom || null,
      instructorName,
      locationDisplay,
      locationDisplayNames,
    };
  });

  return {
    schedules: enrichedSchedules,
    people: canonicalPeople,
    rooms,
    programs,
    courses,
  };
};

const fetchRelationalCollections = async () => {
  const [peopleSnapshot, roomsSnapshot, programsSnapshot, coursesSnapshot] = await Promise.all([
    getDocs(collection(db, "people")),
    getDocs(collection(db, "rooms")),
    getDocs(collection(db, COLLECTIONS.PROGRAMS)),
    getDocs(collection(db, COLLECTIONS.COURSES)),
  ]);

  return {
    people: peopleSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    rooms: roomsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    programs: programsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })),
    courses: coursesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })),
  };
};

export const fetchSchedulesByTerms = async ({
  terms = [],
  termCodes = [],
  allowAll = false,
} = {}) => {
  try {
    const normalizedTerms = Array.isArray(terms)
      ? terms.map((t) => normalizeTermLabel(t)).filter(Boolean)
      : [];
    const normalizedTermCodes = Array.isArray(termCodes)
      ? termCodes.map((t) => termCodeFromLabel(t)).filter(Boolean)
      : [];

    if (
      !allowAll &&
      normalizedTerms.length === 0 &&
      normalizedTermCodes.length === 0
    ) {
      return { schedules: [], people: [], rooms: [], programs: [], courses: [] };
    }
    const shouldFetchAll = allowAll;
    const schedules = [];
    const seenIds = new Set();

    if (shouldFetchAll) {
      const schedulesSnapshot = await getDocs(collection(db, "schedules"));
      schedulesSnapshot.docs.forEach((docSnap) => {
        if (!seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          schedules.push({ id: docSnap.id, ...docSnap.data() });
        }
      });
    } else {
      const chunkItems = (items) => {
        const result = [];
        for (let i = 0; i < items.length; i += 10) {
          result.push(items.slice(i, i + 10));
        }
        return result;
      };

      const queries =
        normalizedTermCodes.length > 0
          ? chunkItems(normalizedTermCodes).map((chunk) =>
            query(
              collection(db, "schedules"),
              where("termCode", "in", chunk),
            ),
          )
          : chunkItems(normalizedTerms).map((chunk) =>
            query(collection(db, "schedules"), where("term", "in", chunk)),
          );

      for (const q of queries) {
        const schedulesSnapshot = await getDocs(q);
        schedulesSnapshot.docs.forEach((docSnap) => {
          if (!seenIds.has(docSnap.id)) {
            seenIds.add(docSnap.id);
            schedules.push({ id: docSnap.id, ...docSnap.data() });
          }
        });
      }
    }

    const relational = await fetchRelationalCollections();
    return enrichSchedules(
      schedules,
      relational.people,
      relational.rooms,
      relational.programs,
      relational.courses,
    );
  } catch (error) {
    console.error("Error fetching schedules by terms:", error);
    throw error;
  }
};

/**
 * Fetch schedules for a specific term with server-side filtering (Firestore where query).
 * Fetches only the schedules for the requested terms plus related collections.
 * @param {string} term - The term to filter by (e.g., "Fall 2025", "Spring 2026")
 * @returns {Promise<{schedules: Array, people: Array, rooms: Array, programs: Array}>}
 */
export const fetchSchedulesByTerm = async (termInput) => {
  try {
    const term =
      typeof termInput === "string" ? termInput : termInput?.term || "";
    const termCode =
      typeof termInput === "string" ? "" : termInput?.termCode || "";
    const normalizedTerm = normalizeTermLabel(term);
    const resolvedTermCode = termCodeFromLabel(termCode || normalizedTerm);

    if (!resolvedTermCode && !normalizedTerm) {
      return { schedules: [], people: [], rooms: [], programs: [], courses: [] };
    }

    // console.log(`📡 Loading schedules for term: ${normalizedTerm || term}`);

    let schedulesSnapshot = null;
    if (resolvedTermCode) {
      const byCode = query(
        collection(db, "schedules"),
        where("termCode", "==", resolvedTermCode),
      );
      schedulesSnapshot = await getDocs(byCode);
      if (schedulesSnapshot.empty && normalizedTerm) {
        const byTerm = query(
          collection(db, "schedules"),
          where("term", "==", normalizedTerm),
        );
        schedulesSnapshot = await getDocs(byTerm);
      }
    } else {
      const byTerm = query(
        collection(db, "schedules"),
        where("term", "==", normalizedTerm || term),
      );
      schedulesSnapshot = await getDocs(byTerm);
    }

    const schedules = schedulesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    // console.log(
    //   `✅ Fetched ${schedules.length} schedules for "${normalizedTerm || term}"`,
    // );

    const relational = await fetchRelationalCollections();
    return enrichSchedules(
      schedules,
      relational.people,
      relational.rooms,
      relational.programs,
      relational.courses,
    );
  } catch (error) {
    console.error(`Error fetching schedules for term "${termInput}":`, error);
    throw error;
  }
};
