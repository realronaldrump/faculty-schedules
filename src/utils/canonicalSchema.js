/**
 * Canonical Data Schema for Faculty Schedules
 *
 * This establishes the single source of truth for all entities in the system.
 * The key principle: Each entity has a clear, deterministic identity that
 * prevents duplicate records while preserving legitimately distinct records.
 *
 * ENTITY HIERARCHY:
 * - Building: Physical structure (first-class entity with stable buildingId)
 * - Space: Room/Office/Lab within a building (unified model, spaceKey uniqueness)
 * - Section: Course offering in a term (identity: courseCode + sectionNumber + termCode)
 * - Person: Faculty/Staff/Student (identity: clssId > baylorId > email)
 *
 * LOCATION MODEL:
 * - All physical locations are "Spaces" (classrooms, offices, labs, studios)
 * - Virtual/Online is a locationType, NOT a space record
 * - SpaceKey format: "BUILDING_CODE:SPACE_NUMBER" (e.g., "GOEBEL:101")
 * - Never create combined multi-room space records
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

import { SPACE_TYPE } from './locationService';

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

// ============================================================================
// VALIDATION RULES
// ============================================================================

/**
 * Validation rules for data integrity
 */
const VALIDATION_RULES = {
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
      ignitePersonNumber: /^\d+$/, // Numeric only
    },
  },
  building: {
    required: ["code", "displayName"],
    formats: {
      code: /^[A-Z0-9_]+$/, // Uppercase alphanumeric with underscores
    },
  },
  space: {
    required: ["buildingCode", "spaceNumber", "spaceKey"],
    formats: {
      spaceKey: /^[A-Z0-9_]+:[A-Z0-9./-]+$/, // BUILDING_CODE:SPACE_NUMBER
      spaceNumber: /^[\dA-Za-z./-]+$/, // Alphanumeric with decimals, dashes, slashes
    },
  },
};

/**
 * Validate a section record
 */
export const validateSection = (section) => {
  const errors = [];
  const warnings = [];
  const sectionNumber = section.sectionNumber || section.section || "";

  // Check required fields
  if (!section.courseCode) errors.push("Course code is required");
  if (!sectionNumber) errors.push("Section number is required");
  if (!section.termCode) errors.push("Semester code is required");

  // Check formats
  if (
    section.termCode &&
    !VALIDATION_RULES.section.formats.termCode.test(section.termCode)
  ) {
    warnings.push(
      `Semester code "${section.termCode}" doesn't match expected format YYYYTT`,
    );
  }

  if (section.crn && !VALIDATION_RULES.section.formats.crn.test(section.crn)) {
    warnings.push(
      `CRN "${section.crn}" doesn't match expected 5-6 digit format`,
    );
  }

  if (
    sectionNumber &&
    !VALIDATION_RULES.section.formats.sectionNumber.test(sectionNumber)
  ) {
    warnings.push(
      `Section "${sectionNumber}" doesn't match expected format`,
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
    (!section.spaceIds || section.spaceIds.length === 0) &&
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
  const clssInstructorId =
    person.clssInstructorId || person.externalIds?.clssInstructorId;
  const baylorId = person.baylorId || person.externalIds?.baylorId;
  const email =
    person.email ||
    (Array.isArray(person.externalIds?.emails) ? person.externalIds.emails[0] : "");
  if (!clssInstructorId && !baylorId && !email) {
    errors.push(
      "Person must have an external identifier (CLSS ID, Baylor ID, or email)",
    );
  }

  // Check name
  if (!person.firstName && !person.lastName) {
    errors.push("Person must have at least a first or last name");
  }

  // Require timestamps for new writes (import/create-time hygiene)
  if (!person.createdAt || !String(person.createdAt).trim()) {
    errors.push("createdAt timestamp is required");
  }
  if (!person.updatedAt || !String(person.updatedAt).trim()) {
    errors.push("updatedAt timestamp is required");
  }

  // Check email format
  if (
    email &&
    !VALIDATION_RULES.person.formats.email.test(email)
  ) {
    warnings.push(`Email "${email}" doesn't appear to be valid`);
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

/**
 * Validate a space record
 */
export const validateSpace = (space) => {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!space.buildingCode) errors.push("Building code is required");
  if (!space.spaceNumber) errors.push("Space number is required");
  if (!space.spaceKey) errors.push("Space key is required");

  // Check spaceKey format
  if (space.spaceKey && !VALIDATION_RULES.space.formats.spaceKey.test(space.spaceKey)) {
    errors.push(`Space key "${space.spaceKey}" must be in format "BUILDING_CODE:SPACE_NUMBER"`);
  }

  // Check spaceKey consistency
  if (space.spaceKey && space.buildingCode && space.spaceNumber) {
    const expectedKey = `${space.buildingCode}:${space.spaceNumber}`;
    if (space.spaceKey !== expectedKey) {
      warnings.push(`Space key "${space.spaceKey}" doesn't match expected "${expectedKey}"`);
    }
  }

  if (!space.buildingId && space.buildingCode) {
    warnings.push("Space is missing buildingId (optional but recommended)");
  }

  // Check type
  const validTypes = Object.values(SPACE_TYPE);
  if (space.type && !validTypes.includes(space.type)) {
    warnings.push(`Space type "${space.type}" is not a standard type`);
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

