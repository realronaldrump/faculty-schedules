/**
 * Canonical Data Schema for Faculty Schedules
 *
 * This establishes the single source of truth for all entities in the system.
 * The key principle: Each entity has a clear, deterministic identity that
 * prevents duplicate records while preserving legitimately distinct records.
 *
 * SECTION IDENTITY:
 * A section is uniquely identified by: courseCode + sectionNumber + termCode
 *
 * Example of DISTINCT records (should NOT be merged):
 *   - ID 4433 Section 01 Spring 2026 (Theriot) - unique identity: "ID_4433_01_202610"
 *   - ID 4433 Section 03 Spring 2026 (Burgess) - unique identity: "ID_4433_03_202610"
 *
 * Example of DUPLICATE records (should be merged):
 *   - ID 4433 Section 01 Spring 2026 imported twice with different data completeness
 */

// ============================================================================
// CANONICAL IDENTIFIERS
// ============================================================================

/**
 * Generate a deterministic section ID from its canonical identity components.
 * This ensures that the same logical section always has the same ID.
 *
 * Format: {termCode}_{courseCode}_{sectionNumber}
 * Example: "202610_ID_4433_01"
 */
export const generateSectionId = ({ termCode, courseCode, sectionNumber }) => {
  const normalizedTerm = (termCode || "").toString().trim();
  const normalizedCourse = (courseCode || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  const normalizedSection = normalizeSectionNumber(sectionNumber);

  if (!normalizedTerm || !normalizedCourse || !normalizedSection) {
    return null;
  }

  return `${normalizedTerm}_${normalizedCourse}_${normalizedSection}`;
};

/**
 * Normalize a section number by removing embedded CRN and extra whitespace.
 * "01 (33070)" -> "01"
 * "N1 (53131)" -> "N1"
 * "A" -> "A"
 */
export const normalizeSectionNumber = (sectionField) => {
  if (!sectionField) return "";
  const raw = sectionField.toString().trim();
  // Remove anything in parentheses (embedded CRN)
  const withoutParens = raw.replace(/\s*\([^)]*\)\s*/g, "").trim();
  // Take just the first token if there's still a space
  const firstToken = withoutParens.split(/\s+/)[0];
  return firstToken.toUpperCase();
};

/**
 * Extract CRN from section field if embedded.
 * "01 (33070)" -> "33070"
 */
export const extractCrnFromSection = (sectionField) => {
  if (!sectionField) return null;
  const match = sectionField.toString().match(/\((\d{5,6})\)/);
  return match ? match[1] : null;
};

/**
 * Generate a deterministic room ID.
 * Format: {building}_{roomNumber} (normalized, lowercase, underscores)
 */
export const generateRoomId = ({ building, roomNumber, displayName }) => {
  if (building && roomNumber) {
    const normalizedBuilding = building
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const normalizedNumber = roomNumber.toString().trim();
    return `${normalizedBuilding}_${normalizedNumber}`;
  }

  // Fallback: use display name
  if (displayName) {
    return displayName.toString().trim().toLowerCase().replace(/\s+/g, "_");
  }

  return null;
};

/**
 * Generate a deterministic person ID from CLSS instructor ID or email.
 * Priority: CLSS ID > Baylor ID > Email
 */
export const generatePersonId = ({ clssInstructorId, baylorId, email }) => {
  if (clssInstructorId) {
    return `clss_${clssInstructorId}`;
  }
  if (baylorId) {
    return `baylor_${baylorId}`;
  }
  if (email) {
    return `email_${email.toLowerCase().trim()}`;
  }
  return null;
};

// ============================================================================
// CANONICAL ENTITY SCHEMAS
// ============================================================================

/**
 * Canonical Section Schema
 *
 * A section represents a specific offering of a course in a specific term.
 * Key fields that define identity are marked with [IDENTITY].
 */
export const SECTION_SCHEMA = {
  // [IDENTITY] - These fields together form the unique identity
  courseCode: "", // [IDENTITY] e.g., "ID 4433"
  sectionNumber: "", // [IDENTITY] e.g., "01", "03", "N1", "A"
  termCode: "", // [IDENTITY] e.g., "202610"

  // Additional identifiers from source system
  crn: "", // Course Reference Number from CLSS (5-6 digits)
  clssId: "", // CLSS internal ID

  // Denormalized term label for display
  term: "", // e.g., "Spring 2026"

  // Course information (could be normalized to courses collection)
  courseTitle: "",
  subjectCode: "", // e.g., "ID"
  catalogNumber: "", // e.g., "4433"
  courseLevel: 0, // 1000, 2000, 3000, 4000, 5000
  credits: 0,

  // Instructor assignment (supports single instructor; for team-teaching, use instructor assignments)
  instructorId: "", // Reference to people collection
  instructorIds: [], // Array of referenced people IDs (team-taught support)
  instructorAssignments: [], // Array of { personId, isPrimary, percentage }
  // Note: instructorName is NOT stored - it's derived from instructorId at read time

  // Room assignments (supports multiple rooms)
  roomIds: [], // References to rooms collection
  // Note: roomNames are NOT stored - they're derived from roomIds at read time

  // Meeting patterns
  meetingPatterns: [], // Array of { day, startTime, endTime, startDate?, endDate? }

  // Schedule metadata
  scheduleType: "Class Instruction", // Class Instruction, Lab, Studio, etc.
  instructionMethod: "Face-to-Face", // Face-to-Face, Online, Hybrid, Synchronous Online
  isOnline: false,
  onlineMode: null, // 'synchronous' | 'asynchronous' | null
  locationType: "room", // "room" | "no_room"
  locationLabel: "", // Display label for roomless classes (e.g., "No Room Needed")

  // Enrollment
  enrollment: 0,
  maxEnrollment: 0,
  waitCap: 0,
  waitTotal: 0,

  // Status
  status: "Active", // Active, Cancelled, etc.

  // Cross-listing
  crossListCrns: [], // CRNs of cross-listed sections

  // Part of term (for summer sessions, etc.)
  partOfTerm: "",
  customStartDate: null,
  customEndDate: null,

  // Timestamps
  createdAt: "",
  updatedAt: "",
  lastImportedAt: "",
};

/**
 * Canonical Person Schema
 *
 * A person represents a faculty member, staff member, or student worker.
 * Identity is determined by external IDs (CLSS ID, Baylor ID, email).
 */
export const PERSON_SCHEMA = {
  // Identity fields (any of these can identify a person)
  clssInstructorId: "", // From CLSS system
  baylorId: "", // 9-digit Baylor ID
  email: "", // Primary email

  // Name
  firstName: "",
  lastName: "",
  title: "", // Dr., Prof., etc.
  // Note: full name is derived at read time as `${firstName} ${lastName}`

  // Employment
  jobTitle: "",
  department: "",
  office: "", // Office location string (for display)
  officeRoomId: "", // Reference to rooms collection

  // Roles
  roles: [], // ['faculty', 'staff', etc.]
  isAdjunct: false,
  isFullTime: true,
  isTenured: false,
  isUPD: false,
  isActive: true,

  // Program assignment
  programId: "", // Reference to programs collection

  // Contact
  phone: "",
  hasNoPhone: false, // Explicitly marked as no phone
  hasNoOffice: false, // Explicitly marked as no office

  // Additional emails (for matching)
  additionalEmails: [],

  // Timestamps
  createdAt: "",
  updatedAt: "",

  // Merge tracking
  mergedInto: null, // If merged, ID of primary record
  mergeStatus: null, // 'complete', 'in_progress', 'pending_cleanup'
};

/**
 * Canonical Room Schema
 */
export const ROOM_SCHEMA = {
  // Identity (building + room number)
  building: "", // e.g., "Goebel Building"
  roomNumber: "", // e.g., "101"

  // Display
  displayName: "", // e.g., "Goebel Building 101"
  name: "", // Legacy field, same as displayName

  // Derived key for matching
  roomKey: "", // e.g., "goebel_building_101"

  // Properties
  capacity: null,
  type: "Classroom", // Classroom, Lab, Studio, Office, etc.
  equipment: [],

  // Status
  isActive: true,

  // Timestamps
  createdAt: "",
  updatedAt: "",
};

// ============================================================================
// VALIDATION RULES
// ============================================================================

/**
 * Validation rules for data integrity
 */
export const VALIDATION_RULES = {
  section: {
    required: ["courseCode", "sectionNumber", "termCode"],
    formats: {
      termCode: /^\d{6}$/, // YYYYTT format
      crn: /^\d{5,6}$/, // 5-6 digit number
      sectionNumber: /^[A-Z0-9]+$/i, // Alphanumeric
    },
  },
  person: {
    required: [], // At least one of clssInstructorId, baylorId, or email should be present
    formats: {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^\d{10}$/, // After normalization
      baylorId: /^\d{9}$/, // 9-digit number
    },
  },
  room: {
    required: ["building", "roomNumber"],
    formats: {},
  },
};

/**
 * Validate a section record
 */
export const validateSection = (section) => {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!section.courseCode) errors.push("Course code is required");
  if (!section.sectionNumber) errors.push("Section number is required");
  if (!section.termCode) errors.push("Term code is required");

  // Check formats
  if (
    section.termCode &&
    !VALIDATION_RULES.section.formats.termCode.test(section.termCode)
  ) {
    warnings.push(
      `Term code "${section.termCode}" doesn't match expected format YYYYTT`,
    );
  }

  if (section.crn && !VALIDATION_RULES.section.formats.crn.test(section.crn)) {
    warnings.push(
      `CRN "${section.crn}" doesn't match expected 5-6 digit format`,
    );
  }

  // Check referential integrity
  const hasInstructor =
    section.instructorId ||
    (Array.isArray(section.instructorIds) && section.instructorIds.length > 0) ||
    (Array.isArray(section.instructorAssignments) &&
      section.instructorAssignments.length > 0);
  if (!hasInstructor && section.status === "Active") {
    warnings.push("Active section has no assigned instructor");
  }

  const isRoomless = section.locationType === "no_room";
  if (
    (!section.roomIds || section.roomIds.length === 0) &&
    !section.isOnline &&
    !isRoomless &&
    section.status === "Active"
  ) {
    warnings.push("Active in-person section has no assigned room");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Validate a person record
 */
export const validatePerson = (person) => {
  const errors = [];
  const warnings = [];

  // At least one identifier should be present
  if (!person.clssInstructorId && !person.baylorId && !person.email) {
    warnings.push(
      "Person has no external identifier (CLSS ID, Baylor ID, or email)",
    );
  }

  // Check name
  if (!person.firstName && !person.lastName) {
    errors.push("Person must have at least a first or last name");
  }

  // Check email format
  if (
    person.email &&
    !VALIDATION_RULES.person.formats.email.test(person.email)
  ) {
    warnings.push(`Email "${person.email}" doesn't appear to be valid`);
  }

  // Check phone format
  if (
    person.phone &&
    !VALIDATION_RULES.person.formats.phone.test(person.phone)
  ) {
    warnings.push(
      `Phone "${person.phone}" doesn't match expected 10-digit format`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

// ============================================================================
// DEDUPLICATION RULES
// ============================================================================

/**
 * Determine if two sections represent the same logical section.
 *
 * Two sections are the same if they have the same:
 * - courseCode (normalized)
 * - sectionNumber (normalized)
 * - termCode
 *
 * Different instructors or rooms do NOT make them different sections.
 * Those are updates to the same section.
 */
export const areSameSectionIdentity = (section1, section2) => {
  const id1 = generateSectionId({
    termCode: section1.termCode,
    courseCode: section1.courseCode,
    sectionNumber: section1.sectionNumber,
  });

  const id2 = generateSectionId({
    termCode: section2.termCode,
    courseCode: section2.courseCode,
    sectionNumber: section2.sectionNumber,
  });

  return id1 && id2 && id1 === id2;
};

/**
 * Determine if two persons represent the same individual.
 *
 * Match priority:
 * 1. CLSS Instructor ID (exact match - definitive)
 * 2. Baylor ID (exact match - definitive)
 * 3. Email (exact match - high confidence)
 * 4. First name + Last name (exact match, case-insensitive - needs verification)
 */
export const areSamePersonIdentity = (person1, person2) => {
  // CLSS ID match (definitive)
  if (person1.clssInstructorId && person2.clssInstructorId) {
    return person1.clssInstructorId === person2.clssInstructorId;
  }

  // Baylor ID match (definitive)
  if (person1.baylorId && person2.baylorId) {
    return person1.baylorId === person2.baylorId;
  }

  // Email match (high confidence)
  const email1 = (person1.email || "").toLowerCase().trim();
  const email2 = (person2.email || "").toLowerCase().trim();
  if (email1 && email2 && email1 === email2) {
    return true;
  }

  // Name match (needs verification - could be different people with same name)
  const name1 =
    `${(person1.firstName || "").trim()} ${(person1.lastName || "").trim()}`
      .toLowerCase()
      .trim();
  const name2 =
    `${(person2.firstName || "").trim()} ${(person2.lastName || "").trim()}`
      .toLowerCase()
      .trim();
  if (name1 && name2 && name1 === name2 && name1.length > 3) {
    return "possible"; // Needs manual verification
  }

  return false;
};

/**
 * Determine if two rooms represent the same physical location.
 */
export const areSameRoomIdentity = (room1, room2) => {
  const id1 = generateRoomId(room1);
  const id2 = generateRoomId(room2);

  return id1 && id2 && id1 === id2;
};

// ============================================================================
// MERGE STRATEGIES
// ============================================================================

/**
 * Merge strategy for sections.
 * When two records for the same section exist, prefer:
 * - More recent data for enrollment numbers
 * - Non-empty values over empty values
 * - Larger arrays (more room IDs, more meeting patterns)
 */
export const mergeSections = (primary, secondary) => {
  const merged = { ...primary };

  // Take non-empty values from secondary if primary is empty
  const stringFields = [
    "crn",
    "clssId",
    "courseTitle",
    "instructorId",
    "scheduleType",
    "instructionMethod",
    "locationType",
    "locationLabel",
  ];
  stringFields.forEach((field) => {
    if (!merged[field] && secondary[field]) {
      merged[field] = secondary[field];
    }
  });

  const mergeAssignments = (primaryAssignments, secondaryAssignments) => {
    const mergedAssignments = new Map();
    const addAssignment = (assignment) => {
      if (!assignment) return;
      const personId = assignment.personId || assignment.instructorId || "";
      if (!personId) return;
      const existing = mergedAssignments.get(personId);
      if (!existing) {
        mergedAssignments.set(personId, { ...assignment, personId });
        return;
      }
      mergedAssignments.set(personId, {
        ...existing,
        ...assignment,
        isPrimary: existing.isPrimary || assignment.isPrimary || false,
        percentage: Math.max(
          existing.percentage || 0,
          assignment.percentage || 0,
        ),
      });
    };
    (primaryAssignments || []).forEach(addAssignment);
    (secondaryAssignments || []).forEach(addAssignment);
    return Array.from(mergedAssignments.values());
  };

  merged.instructorAssignments = mergeAssignments(
    merged.instructorAssignments,
    secondary.instructorAssignments,
  );
  const combinedInstructorIds = new Set([
    ...(Array.isArray(merged.instructorIds) ? merged.instructorIds : []),
    ...(Array.isArray(secondary.instructorIds) ? secondary.instructorIds : []),
    ...merged.instructorAssignments.map((assignment) => assignment.personId),
  ]);
  merged.instructorIds = Array.from(combinedInstructorIds).filter(Boolean);

  // Merge arrays (combine and deduplicate)
  if (secondary.roomIds && secondary.roomIds.length > 0) {
    merged.roomIds = [
      ...new Set([...(merged.roomIds || []), ...secondary.roomIds]),
    ];
  }

  if (secondary.meetingPatterns && secondary.meetingPatterns.length > 0) {
    // Deduplicate meeting patterns by day+time
    const patternKey = (p) => `${p.day}|${p.startTime}|${p.endTime}`;
    const seen = new Set((merged.meetingPatterns || []).map(patternKey));
    const newPatterns = secondary.meetingPatterns.filter(
      (p) => !seen.has(patternKey(p)),
    );
    merged.meetingPatterns = [
      ...(merged.meetingPatterns || []),
      ...newPatterns,
    ];
  }

  if (secondary.crossListCrns && secondary.crossListCrns.length > 0) {
    merged.crossListCrns = [
      ...new Set([...(merged.crossListCrns || []), ...secondary.crossListCrns]),
    ];
  }

  // Take higher enrollment numbers (more recent data)
  merged.enrollment = Math.max(
    merged.enrollment || 0,
    secondary.enrollment || 0,
  );
  merged.maxEnrollment = Math.max(
    merged.maxEnrollment || 0,
    secondary.maxEnrollment || 0,
  );

  merged.updatedAt = new Date().toISOString();

  return merged;
};

/**
 * Merge strategy for persons.
 * Prefer more complete records.
 */
export const mergePersons = (primary, secondary) => {
  const merged = { ...primary };

  // Take non-empty values from secondary
  const fields = [
    "firstName",
    "lastName",
    "title",
    "email",
    "phone",
    "jobTitle",
    "department",
    "office",
    "officeRoomId",
    "programId",
    "baylorId",
    "clssInstructorId",
  ];

  fields.forEach((field) => {
    const primaryValue = merged[field];
    const secondaryValue = secondary[field];
    const isEmpty = (v) => v === null || v === undefined || v === "";

    if (isEmpty(primaryValue) && !isEmpty(secondaryValue)) {
      merged[field] = secondaryValue;
    }
  });

  // Merge roles (combine and deduplicate)
  if (secondary.roles && secondary.roles.length > 0) {
    merged.roles = [...new Set([...(merged.roles || []), ...secondary.roles])];
  }

  // Merge additional emails
  const allEmails = new Set(
    [
      merged.email,
      secondary.email,
      ...(merged.additionalEmails || []),
      ...(secondary.additionalEmails || []),
    ]
      .filter(Boolean)
      .map((e) => e.toLowerCase().trim()),
  );

  // Primary email stays, others go to additionalEmails
  allEmails.delete((merged.email || "").toLowerCase().trim());
  merged.additionalEmails = [...allEmails];

  // Take true over false for boolean flags (if they were ever marked as tenured, etc.)
  const boolFields = ["isAdjunct", "isTenured", "isUPD"];
  boolFields.forEach((field) => {
    if (secondary[field] === true) {
      merged[field] = true;
    }
  });

  merged.updatedAt = new Date().toISOString();

  return merged;
};

export default {
  generateSectionId,
  normalizeSectionNumber,
  extractCrnFromSection,
  generateRoomId,
  generatePersonId,
  SECTION_SCHEMA,
  PERSON_SCHEMA,
  ROOM_SCHEMA,
  VALIDATION_RULES,
  validateSection,
  validatePerson,
  areSameSectionIdentity,
  areSamePersonIdentity,
  areSameRoomIdentity,
  mergeSections,
  mergePersons,
};
