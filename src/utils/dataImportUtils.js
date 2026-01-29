/**
 * Smart Data Import Processing Utilities
 * Implements normalized data model with unified 'people' collection and ID-based references
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../firebase";
import {
  standardizePerson,
  standardizeSchedule,
  validateAndCleanBeforeSave,
  autoMergeObviousDuplicates,
} from "./dataHygiene";
import { getInstructorDisplayName, UNASSIGNED } from "./dataAdapter";
import { buildPeopleIndex } from "./peopleUtils";
import { parseCourseCode, deriveCreditsFromCatalogNumber } from "./courseUtils";
import { logCreate, logUpdate, logImport, logBulkUpdate } from "./changeLogger";
import { parseFullName } from "./nameUtils";
import { parseMeetingPatterns, normalizeTime } from "./meetingPatternUtils";
import { findPersonMatch } from "./personMatchUtils";
import { fetchTermOptions } from "./termDataUtils";
import {
  buildTermLabelRegex,
  deriveTermInfo,
  getTermConfig,
  normalizeTermLabel,
  termCodeFromLabel,
} from "./termUtils";
import { normalizeSectionNumber, extractCrnFromSection } from "./canonicalSchema";
// Import from centralized location service
import {
  parseMultiRoom,
  isSkippableLocation,
  LOCATION_TYPE,
  buildSpaceKey,
  normalizeSpaceNumber,
  resolveBuildingDisplayName
} from "./locationService";
import { resolveScheduleSpaces } from "./spaceUtils";
import { hashRecord } from "./hashUtils";
import {
  buildScheduleDocId,
  buildScheduleIdentityIndex,
  deriveScheduleIdentityFromSchedule,
  resolveScheduleIdentityMatch,
} from "./importIdentityUtils";

// ==================== PROGRAM MAPPING ====================

/**
 * Program mapping based on course code prefixes
 */
const PROGRAM_MAPPING = {
  ADM: "apparel",
  CFS: "child-family-studies",
  NUTR: "nutrition",
  ID: "interior-design",
};

/**
 * Determine program ID from course data
 */
const determineProgramIdFromCourses = (courses) => {
  const prefixes = new Set();

  // Extract course code prefixes
  courses.forEach((course) => {
    const courseCode = course.courseCode || course.Course || "";
    const parsed = parseCourseCode(courseCode);
    if (parsed && !parsed.error) {
      prefixes.add(parsed.program);
    }
  });

  // Return the first valid program ID we find
  for (const prefix of prefixes) {
    if (PROGRAM_MAPPING[prefix]) {
      return PROGRAM_MAPPING[prefix];
    }
  }

  return null;
};

// ==================== CORE DATA MODELS ====================

/**
 * Unified Person Model (Single Source of Truth)
 */
export const createPersonModel = (rawData) => {
  // Create basic person model
  const person = {
    firstName: (rawData.firstName || "").trim(),
    lastName: (rawData.lastName || "").trim(),
    title: (rawData.title || "").trim(),
    email: (rawData.email || "").toLowerCase().trim(),
    phone: rawData.hasNoPhone ? "" : (rawData.phone || "").replace(/\D/g, ""),
    jobTitle: (rawData.jobTitle || "").trim(),
    department: (rawData.department || "").trim(),
    office: rawData.hasNoOffice ? "" : (rawData.office || "").trim(),
    roles: Array.isArray(rawData.roles) ? rawData.roles : [],
    isAdjunct: rawData.isAdjunct || false,
    isFullTime: rawData.isFullTime !== undefined ? rawData.isFullTime : true,
    isTenured:
      (Array.isArray(rawData.roles) && rawData.roles.includes("faculty")) ||
        (typeof rawData.roles === "object" && rawData.roles?.faculty)
        ? rawData.isTenured || false
        : false,
    isUPD:
      (Array.isArray(rawData.roles) && rawData.roles.includes("faculty")) ||
        (typeof rawData.roles === "object" && rawData.roles?.faculty)
        ? rawData.isUPD || false
        : false,
    programId: rawData.programId || null, // Reference to programs collection
    externalIds: {
      clssInstructorId: rawData.clssInstructorId || null,
      baylorId: rawData.baylorId || null,
      emails: rawData.email ? [rawData.email.toLowerCase().trim()] : [],
    },
    baylorId: rawData.baylorId || "", // 9-digit Baylor ID number
    hasNoPhone: rawData.hasNoPhone || false,
    hasNoOffice: rawData.hasNoOffice || false,
    createdAt: rawData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Apply data hygiene standardization
  return standardizePerson(person);
};

/**
 * Schedule Model with ID-based references
 */
const normalizeNumericField = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value).replace(/[^0-9-]/g, ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const createScheduleModel = (rawData) => {
  const toTrimmedString = (value) =>
    value === undefined || value === null ? "" : String(value).trim();
  const normalizedTerm = normalizeTermLabel(rawData.term || "");
  const normalizedTermCode = termCodeFromLabel(
    rawData.termCode || normalizedTerm,
  );
  const enrollmentValue = rawData.enrollment ?? rawData.Enrollment;
  const maxEnrollmentValue =
    rawData.maxEnrollment ??
    rawData.maximumEnrollment ??
    rawData["Maximum Enrollment"] ??
    rawData.MaxEnrollment;
  const instructorAssignments = Array.isArray(rawData.instructorAssignments)
    ? rawData.instructorAssignments
    : [];
  const instructorIds = Array.isArray(rawData.instructorIds)
    ? rawData.instructorIds
    : instructorAssignments
      .map((assignment) => assignment?.personId)
      .filter(Boolean);

  // Create basic schedule model
  const schedule = {
    instructorId: rawData.instructorId || "",
    instructorIds,
    instructorAssignments,
    instructorName: (rawData.instructorName || "").trim(),
    courseId: (rawData.courseId || "").trim(),
    courseCode: (rawData.courseCode || "").trim(),
    courseTitle: toTrimmedString(rawData.courseTitle),
    program: toTrimmedString(rawData.program),
    subjectCode: toTrimmedString(rawData.subjectCode),
    subject: toTrimmedString(
      rawData.subject || rawData.subjectCode || rawData.program,
    ),
    catalogNumber: toTrimmedString(rawData.catalogNumber),
    courseLevel: rawData.courseLevel || 0,
    section: (rawData.section || "").trim(),
    crn: rawData.crn || "", // Add CRN field
    enrollment: normalizeNumericField(enrollmentValue),
    maxEnrollment: normalizeNumericField(maxEnrollmentValue),
    meetingPatterns: Array.isArray(rawData.meetingPatterns)
      ? rawData.meetingPatterns
      : [],
    // Multi-room support (canonical):
    // - spaceIds: array of canonical spaceKeys
    // - spaceDisplayNames: array of display names
    spaceIds: Array.isArray(rawData.spaceIds)
      ? rawData.spaceIds.filter(Boolean)
      : [],
    spaceDisplayNames: Array.isArray(rawData.spaceDisplayNames)
      ? rawData.spaceDisplayNames.filter(Boolean)
      : [],
    term: normalizedTerm || (rawData.term || "").trim(),
    termCode: normalizedTermCode || "",
    academicYear: (rawData.academicYear || "").trim(),
    credits: parseInt(rawData.credits) || 0,
    scheduleType: (rawData.scheduleType || "Class Instruction").trim(),
    instructionMethod: (rawData.instructionMethod || "").trim(),
    // Online flags
    isOnline: Boolean(rawData.isOnline) || false,
    onlineMode: rawData.onlineMode || null, // 'synchronous' | 'asynchronous' | null
    locationType: rawData.locationType || "room",
    locationLabel: (rawData.locationLabel || "").trim(),
    status: (rawData.status || "Active").trim(),
    createdAt: rawData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Apply data hygiene standardization
  return standardizeSchedule(schedule);
};

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

const identityStrength = (key) => {
  if (!key) return 0;
  if (key.startsWith("clss:")) return 4;
  if (key.startsWith("crn:")) return 3;
  if (key.startsWith("section:")) return 2;
  if (key.startsWith("composite:")) return 1;
  return 0;
};

const mergeIdentityKeys = (existingKeys, incomingKeys) => {
  const merged = new Set();
  (Array.isArray(existingKeys) ? existingKeys : []).forEach((key) => {
    if (key) merged.add(key);
  });
  (Array.isArray(incomingKeys) ? incomingKeys : []).forEach((key) => {
    if (key) merged.add(key);
  });
  return Array.from(merged);
};

const preferIdentityKey = (existingKey, incomingKey) => {
  if (!incomingKey) return existingKey || "";
  if (!existingKey) return incomingKey;
  return identityStrength(incomingKey) >= identityStrength(existingKey)
    ? incomingKey
    : existingKey;
};

/**
 * Meeting Pattern Model
 */
export const createMeetingPattern = ({
  day = "",
  startTime = "",
  endTime = "",
  startDate = null,
  endDate = null,
}) => ({
  day: day.trim(),
  startTime: startTime.trim(),
  endTime: endTime.trim(),
  startDate,
  endDate,
});

/**
 * Room Model for relational linking
 */
export const createRoomModel = ({
  displayName = "",
  buildingCode = "",
  buildingDisplayName = "",
  spaceNumber = "",
  spaceKey = "",
  capacity = null,
  type = "Classroom",
  equipment = [],
  isActive = true,
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString(),
}) => ({
  displayName: displayName.trim(),
  spaceKey: spaceKey.trim(),
  spaceNumber: spaceNumber.trim(),
  buildingCode: buildingCode.trim(),
  buildingDisplayName: buildingDisplayName.trim(),
  capacity: capacity ? parseInt(capacity) : null,
  type: type.trim(),
  equipment: Array.isArray(equipment) ? equipment : [],
  isActive,
  createdAt,
  updatedAt,
});

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
 * Extract cross-listed CRNs from CLSS row (if present)
 * Looks at fields like "Cross-listings", "Cross-list Enrollment", and textual hints like "Also ... (CRN)"
 */
export const parseCrossListCrns = (row) => {
  const fields = [
    "Cross-listings",
    "Cross-list Enrollment",
    "Cross-list Maximum",
    "Cross-list Wait Total",
    "Also",
  ];
  const crns = new Set();
  for (const f of fields) {
    const val = row && row[f];
    if (!val || typeof val !== "string") continue;
    const matches = val.match(/\b(\d{5})\b/g);
    if (matches) matches.forEach((m) => crns.add(m));
  }
  return Array.from(crns);
};

// ==================== ROLE DETERMINATION ====================

/**
 * Determine roles based on job title patterns
 */
export const determineRoles = (jobTitle) => {
  if (!jobTitle) return ["staff"];

  const title = jobTitle.toLowerCase();
  const roles = [];

  // Faculty indicators
  const facultyKeywords = [
    "professor",
    "lecturer",
    "instructor",
    "teacher",
    "faculty",
    "chair",
    "associate",
    "assistant",
    "clinical",
    "adjunct",
    "visiting",
    "emeritus",
    "postdoc",
  ];

  // Staff indicators
  const staffKeywords = [
    "coordinator",
    "administrator",
    "assistant",
    "associate",
    "director",
    "manager",
    "specialist",
    "analyst",
    "clerk",
    "secretary",
    "technician",
    "support",
  ];

  if (facultyKeywords.some((keyword) => title.includes(keyword))) {
    roles.push("faculty");
  }

  if (staffKeywords.some((keyword) => title.includes(keyword))) {
    roles.push("staff");
  }

  // Default to staff if no matches
  if (roles.length === 0) {
    roles.push("staff");
  }

  return roles;
};

// ==================== MATCHING ALGORITHMS ====================

/**
 * STRICT person matching algorithm - NO fuzzy matching
 *
 * IMPORTANT: This function now uses strict matching only to prevent data corruption.
 * It matches ONLY on:
 * 1. Baylor ID (exact match - highest priority)
 * 2. Email address (exact match - high priority)
 * 3. External CLSS ID (exact match)
 * 4. Exact first name + last name (exact match)
 *
 * Fuzzy matching has been REMOVED to prevent false positives that could merge
 * different people (e.g., "John Smith" and "John Smyth").
 *
 * If no match is found, returns null - the record should be flagged for manual review.
 */
export const findMatchingPerson = async (personData, existingPeople = null) => {
  // If existing people not provided, fetch from database
  if (!existingPeople) {
    const peopleSnapshot = await getDocs(collection(db, "people"));
    existingPeople = peopleSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  const match = findPersonMatch(personData, existingPeople, {
    minScore: 0.85,
    maxCandidates: 5,
  });
  if (match.status === "exact" && match.person) {
    console.log(
      `🎯 Exact match: ${match.matchType || "person"} → ${match.person.firstName} ${match.person.lastName}`,
    );
    return {
      person: match.person,
      confidence: "exact",
      matchType: match.matchType || "exact",
    };
  }

  // NO FUZZY MATCHING - If we can't find an exact match, return null
  console.log(
    `❓ No exact match found for: ${personData?.firstName || ""} ${personData?.lastName || ""} (email: ${personData?.email || "none"})`,
  );
  return null;
};

/**
 * Flag a record for manual review during import
 * This is used when strict matching fails and fuzzy matching is disabled
 */
export const flagForManualReview = (record, reason, context = {}) => {
  return {
    ...record,
    _needsReview: true,
    _reviewReason: reason,
    _reviewContext: context,
    _reviewedAt: null,
    _reviewedBy: null,
  };
};

// ==================== DATA CLEANING UTILITIES ====================

/**
 * Detect and potentially fix column misalignment issues in directory CSV
 */
export const cleanDirectoryData = (csvData) => {
  const cleanedData = [];
  const issues = [];

  for (let i = 0; i < csvData.length; i++) {
    const row = { ...csvData[i] };
    let hasIssues = false;

    // Check for job title keywords in unexpected columns
    const homeCity = (row["Home City"] || "").trim();
    const jobTitle = (row["Job Title"] || "").trim();

    // Common job title keywords that shouldn't be in Home City
    const jobTitleKeywords = [
      "professor",
      "lecturer",
      "instructor",
      "coordinator",
      "assistant",
      "associate",
      "director",
      "manager",
      "clinical",
      "adjunct",
      "visiting",
      "emeritus",
    ];

    const suspiciousHomeCity =
      homeCity &&
      jobTitleKeywords.some((keyword) =>
        homeCity.toLowerCase().includes(keyword),
      );

    if (suspiciousHomeCity && !jobTitle) {
      // Likely column shift - move Home City to Job Title
      row["Job Title"] = homeCity;
      row["Home City"] = "";
      hasIssues = true;
      issues.push({
        rowIndex: i,
        person: `${row["First Name"]} ${row["Last Name"]}`,
        issue: `Moved "${homeCity}" from Home City to Job Title (likely column misalignment)`,
        fixed: true,
      });
    } else if (suspiciousHomeCity && jobTitle) {
      // Both fields have data, but Home City looks like a job title
      hasIssues = true;
      issues.push({
        rowIndex: i,
        person: `${row["First Name"]} ${row["Last Name"]}`,
        issue: `Home City "${homeCity}" looks like job title, but Job Title already has "${jobTitle}"`,
        fixed: false,
      });
    }

    // Check for other potential issues
    const email = (row["E-mail Address"] || "").trim();
    if (email && !email.includes("@") && email.includes(".")) {
      // Might be a misplaced website or other data
      issues.push({
        rowIndex: i,
        person: `${row["First Name"]} ${row["Last Name"]}`,
        issue: `Email "${email}" doesn't look like a valid email address`,
        fixed: false,
      });
    }

    cleanedData.push(row);
  }

  return { cleanedData, issues };
};

// ==================== SMART IMPORT PROCESSORS ====================

/**
 * Process Directory CSV Import
 */
export const processDirectoryImport = async (csvData, options = {}) => {
  const { defaultRole = "faculty", validateData = true } = options;

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    warnings: [],
    people: [],
  };

  // Clean and validate data first
  let dataToProcess = csvData;
  if (validateData) {
    const { cleanedData, issues } = cleanDirectoryData(csvData);
    dataToProcess = cleanedData;

    // Add cleaning issues to results
    issues.forEach((issue) => {
      if (issue.fixed) {
        results.warnings.push(
          `Row ${issue.rowIndex + 1} (${issue.person}): ${issue.issue}`,
        );
      } else {
        results.errors.push(
          `Row ${issue.rowIndex + 1} (${issue.person}): ${issue.issue}`,
        );
      }
    });
  }

  // Fetch existing people
  const peopleSnapshot = await getDocs(collection(db, "people"));
  const existingPeople = peopleSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  for (let i = 0; i < dataToProcess.length; i++) {
    const row = dataToProcess[i];
    try {
      // Parse name components with better validation
      const title = (row["Title"] || "").trim();
      const firstName = (row["First Name"] || "").trim();
      const lastName = (row["Last Name"] || "").trim();
      const email = (row["E-mail Address"] || "").trim();
      const phone = (row["Business Phone"] || row["Home Phone"] || "").trim();
      const jobTitle = (row["Job Title"] || "").trim();
      const department = (row["Department"] || "").trim();
      const office = (row["Office Location"] || "").trim();

      // Skip rows with no meaningful data
      if (!firstName && !lastName && !email) {
        results.skipped++;
        continue;
      }

      // Data validation for column misalignment
      if (validateData) {
        // Check if job title appears in unexpected fields (like Home City)
        const homeCity = (row["Home City"] || "").trim();
        const suspiciousJobTitleInHomeCity =
          homeCity &&
          (homeCity.toLowerCase().includes("professor") ||
            homeCity.toLowerCase().includes("lecturer") ||
            homeCity.toLowerCase().includes("instructor") ||
            homeCity.toLowerCase().includes("coordinator") ||
            homeCity.toLowerCase().includes("assistant") ||
            homeCity.toLowerCase().includes("associate"));

        if (suspiciousJobTitleInHomeCity && !jobTitle) {
          // Likely column misalignment - use Home City as Job Title
          results.errors.push(
            `Row ${i + 1}: Detected possible column misalignment for ${firstName} ${lastName}. Using "${homeCity}" as job title.`,
          );
          // We could fix this automatically, but for now just flag it
        }

        // Validate email format
        if (email && !email.includes("@")) {
          results.errors.push(
            `Row ${i + 1}: Invalid email format for ${firstName} ${lastName}: ${email}`,
          );
        }
      }

      // Determine roles - use job title analysis with fallback to default
      let roles = [];
      if (jobTitle) {
        roles = determineRoles(jobTitle);
      } else {
        // No job title provided - use default role
        if (defaultRole === "both") {
          roles = ["faculty", "staff"];
        } else {
          roles = [defaultRole];
        }
      }

      // Create person data
      const personData = createPersonModel({
        firstName,
        lastName,
        title,
        email,
        phone,
        jobTitle,
        department,
        office,
        roles,
        isAdjunct: jobTitle.toLowerCase().includes("adjunct"),
        isFullTime:
          !jobTitle.toLowerCase().includes("part") &&
          !jobTitle.toLowerCase().includes("adjunct"),
      });

      // Match strictly by email for idempotent upsert behavior
      const existingMatch = personData.email
        ? existingPeople.find(
          (p) => (p.email || "").toLowerCase() === personData.email,
        )
        : null;

      if (existingMatch) {
        // Upsert: only overwrite with non-empty CSV values; skip if identical
        const { updates, hasChanges } = buildUpsertUpdates(
          existingMatch,
          personData,
        );
        if (!hasChanges) {
          results.skipped++;
          continue;
        }

        await updateDoc(doc(db, "people", existingMatch.id), updates);

        // Log update (no await to avoid slowing bulk import)
        logUpdate(
          `Directory Import - ${personData.firstName} ${personData.lastName}`,
          "people",
          existingMatch.id,
          updates,
          existingMatch,
          "dataImportUtils.js - processDirectoryImport",
        ).catch((err) => console.error("Change logging error:", err));

        results.updated++;
        results.people.push({ ...existingMatch, ...updates });
      } else {
        // Create new person
        const docRef = await addDoc(collection(db, "people"), personData);

        // Log creation (no await to avoid slowing bulk import)
        logCreate(
          `Directory Import - ${personData.firstName} ${personData.lastName}`,
          "people",
          docRef.id,
          personData,
          "dataImportUtils.js - processDirectoryImport",
        ).catch((err) => console.error("Change logging error:", err));

        results.created++;
        results.people.push({ ...personData, id: docRef.id });
        existingPeople.push({ ...personData, id: docRef.id });
      }
    } catch (error) {
      results.errors.push(
        `Row ${i + 1}: Error processing ${row["First Name"]} ${row["Last Name"]}: ${error.message}`,
      );
    }
  }

  // After import, run automatic duplicate cleanup
  await autoMergeObviousDuplicates();

  return results;
};

/**
 * Enhanced CLSS Schedule CSV Import with Full Relational Linking
 */
export const processScheduleImport = async (csvData) => {
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    schedules: [],
    peopleCreated: 0,
    peopleUpdated: 0,
    roomsCreated: 0,
  };

  console.log("🔗 Starting enhanced relational schedule import...");

  const fetchExistingSchedulesForImport = async () => {
    const termCodes = new Set();
    const termLabels = new Set();

    csvData.forEach((row) => {
      const rawTerm = (row["Semester"] || row["Term"] || "").toString().trim();
      const normalized = normalizeTermLabel(rawTerm);
      const termCode = termCodeFromLabel(
        row["Semester Code"] || row["Term Code"] || normalized || rawTerm,
      );
      if (termCode) termCodes.add(termCode);
      if (rawTerm) termLabels.add(rawTerm);
      if (normalized) termLabels.add(normalized);
    });

    if (termCodes.size === 0 && termLabels.size === 0) {
      return [];
    }

    const chunkItems = (items) => {
      const chunks = [];
      for (let i = 0; i < items.length; i += 10) {
        chunks.push(items.slice(i, i + 10));
      }
      return chunks;
    };

    const schedules = [];
    const seenIds = new Set();
    const queries = [];

    if (termCodes.size > 0) {
      chunkItems(Array.from(termCodes)).forEach((chunk) => {
        queries.push(
          query(
            collection(db, COLLECTIONS.SCHEDULES),
            where("termCode", "in", chunk),
          ),
        );
      });
    }

    if (termLabels.size > 0) {
      chunkItems(Array.from(termLabels)).forEach((chunk) => {
        queries.push(
          query(
            collection(db, COLLECTIONS.SCHEDULES),
            where("term", "in", chunk),
          ),
        );
      });
    }

    for (const q of queries) {
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((docSnap) => {
        if (!seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          schedules.push({ id: docSnap.id, ...docSnap.data() });
        }
      });
    }

    return schedules;
  };

  // Fetch existing data
  const [
    peopleSnapshot,
    existingSchedulesResult,
    roomsSnapshot,
    coursesSnapshot,
    termsSnapshot,
  ] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.PEOPLE)),
    fetchExistingSchedulesForImport(),
    getDocs(collection(db, COLLECTIONS.ROOMS)),
    getDocs(collection(db, COLLECTIONS.COURSES)),
    getDocs(collection(db, COLLECTIONS.TERMS)),
  ]);

  const existingPeople = peopleSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const existingSchedules = Array.isArray(existingSchedulesResult)
    ? existingSchedulesResult
    : [];
  const existingRooms = roomsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const existingCourses = coursesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const existingTerms = termsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  console.log(
    `📊 Found ${existingPeople.length} existing people, ${existingRooms.length} rooms`,
  );

  const { index: scheduleIdentityIndex, collisions: scheduleIdentityCollisions } =
    buildScheduleIdentityIndex(existingSchedules);
  if (scheduleIdentityCollisions.length > 0) {
    console.warn(
      `⚠️ Schedule identity collisions detected: ${scheduleIdentityCollisions.length}`,
    );
  }
  const seenIdentityKeys = new Set();

  // Normalize section strings like "01 (33070)" → "01"
  const normalizeSection = (sectionField) =>
    normalizeSectionNumber(sectionField);

  for (const row of csvData) {
    try {
      // Extract key fields
      const instructorField = row["Instructor"] || "";
      const courseCode = row["Course"] || "";
      const courseTitle = row["Course Title"] || row["Long Title"] || "";
      const section = normalizeSection(row["Section #"] || "");
      const crn = row["CRN"] || ""; // Extract CRN field
      const meetingPattern = row["Meeting Pattern"] || "";
      const meetings = row["Meetings"] || "";
      const spaceLabel = (row["Room"] || "").trim();
      const instructionMethod = (
        row["Inst. Method"] ||
        row["Instruction Method"] ||
        ""
      ).trim();
      const rawTerm = row["Semester"] || row["Term"] || "";
      const normalizedTerm = normalizeTermLabel(rawTerm);
      const termCode = termCodeFromLabel(
        row["Semester Code"] || row["Term Code"] || normalizedTerm,
      );
      const term = normalizedTerm || rawTerm;
      const catalogNumber = (row["Catalog Number"] || "").trim();
      const creditsFromCsv = row["Credit Hrs"] || row["Credit Hrs Min"];
      const scheduleType = row["Schedule Type"] || "Class Instruction";
      const status = row["Status"] || "Active";
      const enrollment = normalizeNumericField(row["Enrollment"]);
      const maxEnrollment = normalizeNumericField(row["Maximum Enrollment"]);

      if (!courseCode || !instructorField) {
        results.skipped++;
        continue;
      }

      // Parse instructor information (supports multiple instructors)
      const instructorInfos = parseInstructorFieldList(instructorField);
      if (!instructorInfos || instructorInfos.length === 0) {
        results.errors.push(`Could not parse instructor: ${instructorField}`);
        continue;
      }

      // === ENHANCED INSTRUCTOR LINKING ===
      let instructorId = null;
      let instructorData = null;
      const instructorAssignments = [];
      const instructorPeople = new Map();
      const updatedPeople = new Set();

      const ensureFacultyRole = async (person) => {
        if (!person || updatedPeople.has(person.id)) return;
        const hasRoles =
          person.roles &&
          ((Array.isArray(person.roles) && person.roles.includes("faculty")) ||
            (typeof person.roles === "object" && person.roles.faculty === true));

        if (!hasRoles) {
          const currentRoles = Array.isArray(person.roles)
            ? person.roles
            : Object.keys(person.roles || {}).filter((key) => person.roles[key]);
          const updatedRoles = [...new Set([...currentRoles, "faculty"])];
          await updateDoc(doc(db, "people", person.id), {
            roles: updatedRoles,
            updatedAt: new Date().toISOString(),
          });

          person.roles = updatedRoles;
          results.peopleUpdated++;
          console.log(
            `✅ Added faculty role to ${person.firstName} ${person.lastName}`,
          );
        }

        updatedPeople.add(person.id);
      };

      const ensureProgramAssignment = async (person) => {
        if (!person || updatedPeople.has(`${person.id}-program`)) return;
        if (!person.programId) {
          const programId = determineProgramIdFromCourses([{ courseCode }]);
          if (programId) {
            await updateDoc(doc(db, "people", person.id), {
              programId: programId,
              updatedAt: new Date().toISOString(),
            });

            person.programId = programId;
            console.log(
              `🎯 Assigned ${programId} program to ${person.firstName} ${person.lastName} based on course ${courseCode}`,
            );
          }
        }
        updatedPeople.add(`${person.id}-program`);
      };

      const resolveInstructor = async (info) => {
        if (!info || info.lastName === "Staff") return null;
        const match = await findBestInstructorMatch(info, existingPeople);
        let person = null;

        if (match) {
          person = match.person;
          await ensureFacultyRole(person);
          await ensureProgramAssignment(person);
        } else {
          const programId = determineProgramIdFromCourses([{ courseCode }]);
          const newPerson = createPersonModel({
            firstName: info.firstName,
            lastName: info.lastName,
            title: info.title,
            roles: ["faculty"],
            isAdjunct: true,
            department: "Human Sciences & Design", // Default from CLSS context
            jobTitle: "Instructor", // Default
            programId: programId, // Set program based on course
            clssInstructorId: info.id || null,
          });

          const docRef = await addDoc(
            collection(db, COLLECTIONS.PEOPLE),
            newPerson,
          );
          person = { ...newPerson, id: docRef.id };
          existingPeople.push(person);
          results.peopleCreated++;
          console.log(
            `➕ Created new instructor: ${info.firstName} ${info.lastName}${programId ? ` (${programId} program)` : ""}`,
          );
        }

        if (!person?.id) return null;
        return {
          person,
          assignment: {
            personId: person.id,
            isPrimary: info.isPrimary || false,
            percentage:
              Number.isFinite(info.percentage) && info.percentage > 0
                ? info.percentage
                : 100,
          },
        };
      };

      for (const info of instructorInfos) {
        const resolved = await resolveInstructor(info);
        if (!resolved) continue;
        instructorAssignments.push(resolved.assignment);
        instructorPeople.set(resolved.assignment.personId, resolved.person);
      }

      if (
        instructorAssignments.length > 0 &&
        !instructorAssignments.some((a) => a.isPrimary)
      ) {
        instructorAssignments[0].isPrimary = true;
      }

      const assignmentMap = new Map();
      instructorAssignments.forEach((assignment) => {
        if (!assignment?.personId) return;
        const existing = assignmentMap.get(assignment.personId);
        if (!existing) {
          assignmentMap.set(assignment.personId, assignment);
          return;
        }
        assignmentMap.set(assignment.personId, {
          ...existing,
          ...assignment,
          isPrimary: existing.isPrimary || assignment.isPrimary || false,
          percentage: Math.max(
            existing.percentage || 0,
            assignment.percentage || 0,
          ),
        });
      });

      const dedupedAssignments = Array.from(assignmentMap.values());
      const instructorIds = dedupedAssignments.map((a) => a.personId);
      const primaryAssignment =
        dedupedAssignments.find((a) => a.isPrimary) ||
        dedupedAssignments.sort(
          (a, b) => (b.percentage || 0) - (a.percentage || 0),
        )[0];
      instructorId = primaryAssignment?.personId || null;
      instructorData = instructorId
        ? instructorPeople.get(instructorId) ||
        existingPeople.find((p) => p.id === instructorId)
        : null;

      const normalizedSpaceLabel = (spaceLabel || "").trim();

      // Use centralized location service for detection
      const locationType = isSkippableLocation(normalizedSpaceLabel) ? "no_room" : "room";
      const inferredIsOnline =
        normalizedSpaceLabel.toUpperCase().includes("ONLINE") ||
        (instructionMethod &&
          instructionMethod.toLowerCase().includes("online"));
      const hasPhysicalRoom = locationType === "room" && normalizedSpaceLabel;
      const locationLabel =
        locationType === "no_room"
          ? inferredIsOnline
            ? "Online"
            : normalizedSpaceLabel || "No Room Needed"
          : "";

      // === ENHANCED ROOM LINKING using centralized locationService ===
      let spaceIds = [];
      let spaceDisplayNames = [];

      if (hasPhysicalRoom) {
        // Use centralized multi-room parsing
        const parsed = parseMultiRoom(normalizedSpaceLabel);

        for (const roomData of parsed.rooms) {
          const buildingCode = (roomData.buildingCode || roomData.building?.code || '').toString().trim().toUpperCase();
          const spaceNumber = normalizeSpaceNumber(roomData.spaceNumber || '');
          const spaceKey = roomData.spaceKey || (buildingCode && spaceNumber ? buildSpaceKey(buildingCode, spaceNumber) : '');
          if (!spaceKey) continue;

          const buildingDisplayName = roomData.building?.displayName
            || resolveBuildingDisplayName(buildingCode)
            || buildingCode;
          const displayName = roomData.displayName || `${buildingDisplayName} ${spaceNumber}`.trim();

          spaceDisplayNames.push(displayName);
          spaceIds.push(spaceKey);

          const existingRoom = existingRooms.find(
            (r) =>
              r.spaceKey === spaceKey ||
              r.id === spaceKey ||
              r.displayName === displayName,
          );

          if (!existingRoom) {
            const newRoom = createRoomModel({
              displayName,
              buildingCode,
              buildingDisplayName,
              spaceNumber,
              spaceKey,
              type: "Classroom",
            });

            const roomRef = doc(db, COLLECTIONS.ROOMS, spaceKey);
            await setDoc(roomRef, newRoom, { merge: true });
            logCreate(
              `Room - ${displayName}`,
              COLLECTIONS.ROOMS,
              roomRef.id,
              newRoom,
              "dataImportUtils.js - processScheduleImport",
            ).catch((err) =>
              console.error("Change logging error (room):", err),
            );
            existingRooms.push({ ...newRoom, id: roomRef.id });
            results.roomsCreated++;
            console.log(`🏛️ Created new room: ${displayName} (spaceKey: ${spaceKey})`);
          }
        }

        // Log any parse errors
        if (parsed.errors?.length > 0) {
          console.warn(`⚠️ Room parsing warnings for "${normalizedRoomLabel}":`, parsed.errors);
        }
      }

      // Deduplicate to guard against repeated room references
      spaceIds = Array.from(new Set(spaceIds));
      spaceDisplayNames = Array.from(new Set(spaceDisplayNames));

      // Parse meeting patterns
      const meetingPatterns = parseMeetingPatterns(meetingPattern, meetings);

      // Parse course code for additional details
      const parsedCourse = parseCourseCode(courseCode);
      const parsedProgram = parsedCourse?.error
        ? ""
        : parsedCourse?.program || "";
      const subjectCode =
        (row["Subject Code"] || "").trim().toUpperCase() || parsedProgram;
      const programCode = parsedProgram || subjectCode;

      const rawCatalogForCredits =
        catalogNumber || courseCode.replace(/^[A-Z]{2,4}\s?/, "");
      const derivedCredits = deriveCreditsFromCatalogNumber(
        rawCatalogForCredits,
        creditsFromCsv,
      );
      const finalCredits = derivedCredits ?? parsedCourse.credits ?? null;

      // === COURSE UPSERT WITH DETERMINISTIC ID ===
      let courseId = "";
      if (courseCode) {
        const courseDeterministicId = courseCode
          .replace(/\s+/g, "_")
          .toUpperCase();
        const existingCourse = existingCourses.find(
          (c) => c.id === courseDeterministicId,
        );
        const courseDoc = {
          courseCode,
          title: courseTitle,
          departmentCode: (row["Department Code"] || "").trim(),
          subjectCode: subjectCode || null,
          catalogNumber,
          credits: finalCredits ?? null,
          program: programCode || null,
          updatedAt: new Date().toISOString(),
        };
        if (!existingCourse) {
          await setDoc(doc(db, COLLECTIONS.COURSES, courseDeterministicId), {
            ...courseDoc,
            createdAt: new Date().toISOString(),
          });
          // Log course creation
          logCreate(
            `Course - ${courseCode}`,
            COLLECTIONS.COURSES,
            courseDeterministicId,
            courseDoc,
            "dataImportUtils.js - processScheduleImport",
          ).catch((err) =>
            console.error("Change logging error (course):", err),
          );
          existingCourses.push({ id: courseDeterministicId, ...courseDoc });
        } else {
          await setDoc(
            doc(db, COLLECTIONS.COURSES, courseDeterministicId),
            courseDoc,
            { merge: true },
          );
        }
        courseId = courseDeterministicId;
      }

      // === TERM UPSERT WITH DETERMINISTIC ID ===
      let termId = "";
      if (termCode) {
        const termDeterministicId = termCode;
        const existingTerm = existingTerms.find(
          (t) => t.id === termDeterministicId,
        );
        const termInfo = deriveTermInfo({ term, termCode }, getTermConfig());
        const termDoc = {
          term: termInfo.term || term,
          termCode: termInfo.termCode || termCode,
          season: termInfo.season || null,
          year: termInfo.year ?? null,
          sortKey: termInfo.sortKey ?? null,
          updatedAt: new Date().toISOString(),
        };
        if (!existingTerm) {
          await setDoc(doc(db, COLLECTIONS.TERMS, termDeterministicId), {
            ...termDoc,
            status: "active",
            locked: false,
            createdAt: new Date().toISOString(),
          });
          // Log term creation
          logCreate(
            `Semester - ${term} (${termCode})`,
            COLLECTIONS.TERMS,
            termDeterministicId,
            termDoc,
            "dataImportUtils.js - processScheduleImport",
          ).catch((err) => console.error("Change logging error (term):", err));
          existingTerms.push({ id: termDeterministicId, ...termDoc });
        } else {
          await setDoc(
            doc(db, COLLECTIONS.TERMS, termDeterministicId),
            termDoc,
            { merge: true },
          );
        }
        termId = termDeterministicId;
      }

      // Create schedule data with full relational links
      const scheduleData = createScheduleModel({
        instructorId,
        instructorIds,
        instructorAssignments: dedupedAssignments,
        instructorName: instructorData
          ? `${instructorData.firstName} ${instructorData.lastName}`.trim()
          : "Staff",
        courseId,
        courseCode,
        courseTitle,
        program: programCode,
        subjectCode,
        subject: subjectCode,
        catalogNumber,
        courseLevel: parsedCourse.level,
        section,
        clssId: row["CLSS ID"] || "",
        crn, // Pass CRN to the model
        enrollment,
        maxEnrollment,
        meetingPatterns,
        // Multi-room fields (new canonical format)
        spaceIds,
        spaceDisplayNames,
        term,
        termCode,
        credits: finalCredits,
        scheduleType,
        instructionMethod,
        // Online flags
        isOnline: inferredIsOnline,
        onlineMode: inferredIsOnline
          ? meetingPatterns && meetingPatterns.length > 0
            ? "synchronous"
            : "asynchronous"
          : null,
        locationType,
        locationLabel,
        status,
      });

      const identity = deriveScheduleIdentityFromSchedule(scheduleData);
      if (!identity.primaryKey) {
        results.errors.push(`Missing identity key for ${courseCode} ${section} (${term})`);
        continue;
      }
      if (seenIdentityKeys.has(identity.primaryKey)) {
        results.skipped++;
        continue;
      }
      seenIdentityKeys.add(identity.primaryKey);
      scheduleData.identityKey = identity.primaryKey;
      scheduleData.identityKeys = identity.keys;
      scheduleData.identitySource = identity.source;

      // Parse cross-listings from CSV text (store related CRNs if present)
      const crossListCrns = parseCrossListCrns(row);

      // Omit redundant display fields from writes; keep on read via joins
      const {
        instructorName: _omitInstructorName,
        courseTitle: _omitCourseTitle,
        ...scheduleWrite
      } = scheduleData;
      if (crossListCrns && crossListCrns.length > 0) {
        scheduleWrite.crossListCrns = Array.from(new Set(crossListCrns));
      }

      const matchResult = resolveScheduleIdentityMatch(
        identity.keys,
        scheduleIdentityIndex,
      );
      const existingMatch = matchResult.schedule || null;

      if (existingMatch) {
        scheduleWrite.identityKeys = mergeIdentityKeys(
          existingMatch.identityKeys,
          scheduleData.identityKeys,
        );
        const resolvedIdentityKey = preferIdentityKey(
          existingMatch.identityKey,
          scheduleData.identityKey,
        );
        if (resolvedIdentityKey) {
          scheduleWrite.identityKey = resolvedIdentityKey;
          scheduleWrite.identitySource = resolvedIdentityKey.split(":")[0];
        }
        // Upsert: only overwrite with non-empty CSV values; skip if identical
        const { updates, hasChanges } = buildUpsertUpdates(
          existingMatch,
          scheduleWrite,
        );
        if (!hasChanges) {
          results.skipped++;
          continue;
        }

        await updateDoc(
          doc(db, COLLECTIONS.SCHEDULES, existingMatch.id),
          updates,
        );

        logUpdate(
          `Schedule Import - ${courseCode} ${section} (${term})`,
          "schedules",
          existingMatch.id,
          updates,
          existingMatch,
          "dataImportUtils.js - processScheduleImport",
        ).catch((err) => console.error("Change logging error:", err));

        results.updated++;
        results.schedules.push({ ...existingMatch, ...updates });
      } else {
        // Create new schedule with full relational integrity
        const fallbackTerm =
          scheduleData.termCode || termCodeFromLabel(scheduleData.term) || "TERM";
        const fallbackId = scheduleData.crn
          ? `${fallbackTerm}_${scheduleData.crn}`
          : `${fallbackTerm}_${(scheduleData.courseCode || "COURSE").replace(/\s+/g, "_").toUpperCase()}_${normalizeSectionNumber(scheduleData.section) || "SECTION"}`;
        const scheduleDeterministicId =
          buildScheduleDocId({ primaryKey: scheduleData.identityKey }) ||
          fallbackId;
        const schedRef = doc(db, COLLECTIONS.SCHEDULES, scheduleDeterministicId);
        await setDoc(schedRef, scheduleWrite, { merge: true });
        results.created++;
        results.schedules.push({ ...scheduleWrite, id: schedRef.id });
        existingSchedules.push({ ...scheduleWrite, id: schedRef.id });

        logCreate(
          `Schedule Import - ${courseCode} ${section} (${term})`,
          "schedules",
          schedRef.id,
          scheduleData,
          "dataImportUtils.js - processScheduleImport",
        ).catch((err) => console.error("Change logging error:", err));
      }
    } catch (error) {
      results.errors.push(`Error processing schedule: ${error.message}`);
      console.error("❌ Schedule import error:", error);
    }
  }

  // After import, run automatic duplicate cleanup
  await autoMergeObviousDuplicates();

  console.log(
    `🎉 Schedule import complete: ${results.created} schedules, ${results.peopleCreated} new people, ${results.roomsCreated} new rooms`,
  );
  return results;
};

/**
 * STRICT instructor matching - NO fuzzy matching
 *
 * IMPORTANT: This function now uses strict matching only to prevent data corruption.
 * Fuzzy matching has been REMOVED because it can incorrectly merge different people
 * (e.g., "Robert Smith" matching "Bob Smith" or "John Smith" matching "John Smyth").
 *
 * Matching strategies (in order of priority):
 * 1. CLSS External ID (exact match - highest priority)
 * 2. Baylor ID (exact match)
 * 3. Email (exact match)
 * 4. Exact first name + last name (case-insensitive, trimmed)
 *
 * If no match is found, returns null - a new person record will be created
 * with _needsReview flag for manual verification.
 */
const findBestInstructorMatch = async (instructorInfo, existingPeople) => {
  const { firstName, lastName, id: clssId, email, baylorId } = instructorInfo;

  const match = findPersonMatch(
    {
      firstName,
      lastName,
      email,
      baylorId,
      clssInstructorId: clssId,
    },
    existingPeople,
    { minScore: 0.85, maxCandidates: 5 },
  );

  if (match.status === "exact" && match.person) {
    console.log(
      `🎯 Exact match: ${match.matchType || "person"} → ${match.person.firstName} ${match.person.lastName} (${match.person.id})`,
    );
    return {
      person: match.person,
      confidence: "exact",
      matchType: match.matchType || "exact",
    };
  }

  // NO FUZZY MATCHING - Return null if no exact match found
  console.log(
    `❓ No exact match found for instructor: ${firstName} ${lastName} (CLSS ID: ${clssId || "none"})`,
  );
  return null;
};

// ==================== CLSS CSV PARSING ====================

/**
 * Parse CLSS CSV export format
 * Handles the complex structure of CLSS exports including:
 * - Header rows that need to be skipped
 * - Course title rows vs actual schedule data rows
 * - Many empty columns and rows
 */
export const parseCLSSCSV = (csvText) => {
  console.log("🔍 Starting CLSS CSV parsing...");

  const rows = parseCSVRecords(csvText || "");
  let headerRowIndex = -1;
  const scheduleData = [];
  let detectedSemester = null;

  if (rows.length === 0) {
    console.log("⚠️ No rows detected in CSV payload.");
    return scheduleData;
  }

  // Extract semester from the very first cell (CLSS exports typically include it)
  const firstCell = (rows[0]?.[0] || "").replace(/"/g, "").trim();
  const semesterPattern = buildTermLabelRegex(getTermConfig());
  if (semesterPattern.test(firstCell)) {
    detectedSemester = normalizeTermLabel(firstCell);
    console.log("🎓 Detected semester from first line:", detectedSemester);
  }

  // Find the actual header row (contains column definitions)
  for (let i = 0; i < rows.length; i++) {
    const rowValues = rows[i].map((cell) => (cell || "").toLowerCase());
    const includesRequiredHeaders =
      rowValues.some((cell) => cell.includes("clss id")) &&
      rowValues.some((cell) => cell.includes("instructor")) &&
      rowValues.some((cell) => cell.includes("course"));
    if (includesRequiredHeaders) {
      headerRowIndex = i;
      console.log("📋 Found header row at index:", i);
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      "Could not find CLSS header row. Expected headers: CLSS ID, Instructor, Course",
    );
  }

  // Parse header row
  const headers = rows[headerRowIndex].map((h) =>
    (h || "").replace(/"/g, "").trim(),
  );
  console.log(
    "📊 CLSS Headers found:",
    headers.slice(0, 10),
    "... (showing first 10)",
  );

  // Process data rows (skip header and any rows before it)
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const values = rows[i];
    const isCompletelyEmpty = values.every(
      (value) => !String(value || "").trim(),
    );
    if (isCompletelyEmpty) continue;

    if (isCourseTitleRow(values)) {
      console.log(
        "📚 Skipping course title row:",
        values[0]?.substring(0, 50) || "",
      );
      continue;
    }

    const rowData = {};
    headers.forEach((header, index) => {
      const rawValue = values[index] ?? "";
      rowData[header] = String(rawValue).replace(/\r/g, "").trim();
    });
    rowData.__rowIndex = i + 1;
    const rowHashInput = { ...rowData };
    delete rowHashInput.__rowIndex;
    rowData.__rowHash = hashRecord(rowHashInput);

    const rawSemester = rowData["Semester"] || rowData["Term"] || "";
    if (rawSemester) {
      const normalizedSemester = normalizeTermLabel(rawSemester);
      rowData["Term"] = normalizedSemester;
      if (rowData["Semester"] !== undefined) {
        rowData["Semester"] = normalizedSemester;
      }
    } else if (detectedSemester) {
      rowData["Term"] = detectedSemester;
      if (rowData["Semester"] !== undefined) {
        rowData["Semester"] = detectedSemester;
      }
    }

    if (isValidScheduleRow(rowData)) {
      scheduleData.push(rowData);
    }
  }

  console.log(
    "✅ CLSS CSV parsing complete. Found",
    scheduleData.length,
    "schedule records",
  );
  console.log("🎓 All records tagged with semester:", detectedSemester);
  return scheduleData;
};

/**
 * Robust CSV parser that handles escaped quotes and multiline fields
 */
const parseCSVRecords = (text) => {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;
  let lastCharWasLineBreak = false;

  for (let i = 0; i < text.length; i++) {
    let char = text[i];

    if (i === 0 && char === "\ufeff") {
      // Strip BOM if present
      continue;
    }

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      lastCharWasLineBreak = false;
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      lastCharWasLineBreak = false;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      lastCharWasLineBreak = true;
    } else {
      currentValue += char;
      lastCharWasLineBreak = false;
    }
  }

  if (!lastCharWasLineBreak || currentRow.length > 0 || currentValue) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
};

/**
 * Check if a line is a course title row (not actual schedule data)
 */
const isCourseTitleRow = (values) => {
  if (!Array.isArray(values) || values.length === 0) return false;

  const firstValue = (values[0] || "").trim();
  if (firstValue && firstValue.match(/^[A-Z]{2,4}\s+\d{4}\s*-/)) {
    const nonEmptyCount = values.filter((v) => v && String(v).trim()).length;
    return nonEmptyCount < 5;
  }

  return false;
};

/**
 * Check if a row contains valid schedule data
 */
const isValidScheduleRow = (rowData) => {
  // Must have instructor and course information
  const hasInstructor = rowData["Instructor"] && rowData["Instructor"].trim();
  const hasCourse = rowData["Course"] && rowData["Course"].trim();
  const hasValidCRN =
    rowData["CRN"] && rowData["CRN"].trim() && !isNaN(rowData["CRN"]);

  return hasInstructor && hasCourse && hasValidCRN;
};

// ==================== RELATIONAL DATA FETCHING ====================

const enrichSchedules = (schedules, people, rooms, programs, courses = []) => {
  const { peopleMap, resolvePersonId, canonicalPeople } =
    buildPeopleIndex(people);
  const roomsMap = new Map(rooms.map((r) => [r.id, r]));
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

/**
 * Fetch schedules with full relational data (people and rooms populated)
 */
export const fetchSchedulesWithRelationalData = async () => {
  try {
    const [schedulesSnapshot, relational] = await Promise.all([
      getDocs(collection(db, "schedules")),
      fetchRelationalCollections(),
    ]);

    const schedules = schedulesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return enrichSchedules(
      schedules,
      relational.people,
      relational.rooms,
      relational.programs,
      relational.courses,
    );
  } catch (error) {
    console.error("Error fetching relational schedule data:", error);
    throw error;
  }
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
 * This is the performance-optimized alternative to fetchSchedulesWithRelationalData().
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

/**
 * Fetch available semesters efficiently from the terms collection.
 * Falls back to extracting unique terms from schedules if terms collection is empty.
 * @returns {Promise<string[]>} Array of term strings sorted by recency
 */
export const fetchAvailableSemesters = async ({
  includeArchived = false,
} = {}) => {
  try {
    const terms = await fetchTermOptions({ includeArchived });
    const labels = terms.map((term) => term.term).filter(Boolean);
    console.log(`📅 Available semesters: ${labels.join(", ")}`);
    return labels;
  } catch (error) {
    console.error("Error fetching available semesters:", error);
    throw error;
  }
};

export { parseFullName };

export default {
  createPersonModel,
  createScheduleModel,
  createMeetingPattern,
  createRoomModel,
  parseFullName,
  parseInstructorField,
  parseInstructorFieldList,
  parseMeetingPatterns,
  normalizeTime,
  determineRoles,
  findMatchingPerson,
  cleanDirectoryData,
  processDirectoryImport,
  processScheduleImport,
  parseCLSSCSV,
  fetchSchedulesWithRelationalData,
  fetchSchedulesByTerms,
  fetchSchedulesByTerm,
  fetchAvailableSemesters,
};
