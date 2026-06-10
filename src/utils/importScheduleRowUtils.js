/**
 * Schedule row extraction and normalization helpers.
 *
 * These are shared across:
 * - import preview/commit pipeline (import/core)
 * - within-batch preprocessing (importPreprocessor)
 *
 * Keeping them in a standalone module avoids circular dependencies.
 */

import { parseCourseCode, deriveCreditsFromCatalogNumber } from "./courseUtils";
import { parseMeetingPatterns } from "./meetingPatternUtils";
import { normalizeBaylorId } from "./personMatchUtils";
import { normalizeTermLabel, termCodeFromLabel } from "./termUtils";
import { hashRecord } from "./hashUtils";
import { standardizeCourseCode } from "./hygieneCore";
import { normalizeSectionNumber } from "./canonicalSchema";
import {
  LOCATION_TYPE,
  parseMultiRoom,
  splitMultiRoom,
} from "./locationService";
import {
  parseInstructorField,
  parseInstructorFieldList,
  parseCrossListCrns,
} from "./dataImportUtils";

const normalizeSectionIdentifier = (sectionField) =>
  normalizeSectionNumber(sectionField);

const extractCrnFromSectionField = (sectionField) => {
  if (!sectionField) return "";
  const match = String(sectionField).match(/\((\d{5,6})\)/);
  return match ? match[1] : "";
};

const extractAcademicYear = (term) => {
  const match = String(term || "").match(/(\d{4})/);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return new Date().getFullYear();
};

const normalizeNumericField = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value).replace(/[^0-9-]/g, ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const readCanonicalValue = (row, fieldId) => {
  const canonical = row?.__clssCanonical;
  if (!canonical || typeof canonical !== "object") return "";
  const value = canonical[fieldId];
  return value === undefined || value === null ? "" : String(value).trim();
};

const readField = (row, fieldId, legacyKeys = []) => {
  const canonicalValue = readCanonicalValue(row, fieldId);
  if (canonicalValue) return canonicalValue;

  for (const key of legacyKeys) {
    const value = row?.[key];
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return "";
};

/**
 * Extract normalized schedule data from a raw CLSS row (or CLSS-like object).
 *
 * @param {Object} row
 * @param {string} fallbackTerm
 */
export const extractScheduleRowBaseData = (row, fallbackTerm = "") => {
  const rowHashInput = { ...(row || {}) };
  delete rowHashInput.__rowIndex;
  delete rowHashInput.__rowHash;
  const rowHash = row?.__rowHash || hashRecord(rowHashInput);

  const courseCode = standardizeCourseCode(
    readField(row, "course_code", ["Course", "Course Code"]),
  );
  const courseTitle = readField(row, "course_title", [
    "Course Title",
    "Long Title",
    "Title/Topic",
  ]);
  const sectionRaw = readField(row, "section", ["Section #", "Section"]);
  const section = normalizeSectionIdentifier(sectionRaw);

  const clssId = readField(row, "clss_id", ["CLSS ID"]);
  const directCrn = readField(row, "crn", ["CRN"]);
  const sectionCrn = extractCrnFromSectionField(sectionRaw);
  const crn = /^\d{5,6}$/.test(directCrn)
    ? directCrn
    : /^\d{5,6}$/.test(sectionCrn)
      ? sectionCrn
      : "";

  const rawCredits =
    readField(row, "credit_hours", [
      "Credit Hrs",
      "Credit Hrs Min",
      "Credit Hrs Max",
      "Credits",
    ]) || null;
  const catalogNumber = readField(row, "catalog_number", ["Catalog Number"])
    .toUpperCase();
  const parsedCourse = parseCourseCode(courseCode || "");
  const catalogForCredits = catalogNumber || parsedCourse?.catalogNumber || "";
  const derivedCredits = deriveCreditsFromCatalogNumber(
    catalogForCredits,
    rawCredits,
  );
  const numericFallback =
    rawCredits === null || rawCredits === undefined
      ? null
      : Number.parseFloat(rawCredits);
  const credits =
    derivedCredits ??
    (Number.isNaN(numericFallback) ? null : numericFallback) ??
    (parsedCourse?.credits ?? null);
  const parsedProgram = parsedCourse?.error ? "" : parsedCourse?.program || "";
  const subjectCode =
    readField(row, "subject_code", ["Subject Code"]).toUpperCase() ||
    parsedProgram;
  const program = parsedProgram || subjectCode;
  const departmentCode = readField(row, "department_code", [
    "Department Code",
  ]).toUpperCase();
  const courseLevel = Number.isFinite(parsedCourse?.level) ? parsedCourse.level : 0;
  const enrollment = normalizeNumericField(
    readField(row, "enrollment", ["Enrollment"]),
  );
  const maxEnrollment = normalizeNumericField(
    readField(row, "maximum_enrollment", ["Maximum Enrollment", "Max Enrollment"]),
  );
  const waitCap = normalizeNumericField(readField(row, "wait_cap", ["Wait Cap"]));
  const waitTotal = normalizeNumericField(
    readField(row, "wait_total", ["Wait Total"]),
  );
  const openSeats = normalizeNumericField(
    readField(row, "open_seats", ["Open Seats"]),
  );
  const waitAvailable = normalizeNumericField(
    readField(row, "wait_available", ["Wait Available"]),
  );
  const reservedSeats = normalizeNumericField(
    readField(row, "reserved_seats", ["Reserved Seats"]),
  );
  const reservedSeatsEnrollment = normalizeNumericField(
    readField(row, "reserved_seats_enrollment", ["Reserved Seats - Enrollment"]),
  );

  const rawTerm =
    readField(row, "term", ["Semester", "Term"]) || fallbackTerm || "";
  const normalizedTerm = normalizeTermLabel(rawTerm);
  const term = normalizedTerm || rawTerm;
  const termCode = termCodeFromLabel(
    readField(row, "term_code", ["Semester Code", "Term Code"]) || normalizedTerm,
  );
  const academicYear = extractAcademicYear(term);

  const instructorField = readField(row, "instructor", ["Instructor", "Faculty"]);
  const parsedInstructors = parseInstructorFieldList(instructorField);
  const primaryInstructor =
    parsedInstructors.find((info) => info.isPrimary) ||
    parsedInstructors[0] ||
    null;
  const formatInstructorName = (info) => {
    if (!info) return "";
    const firstName = (info.firstName || "").trim();
    const lastName = (info.lastName || "").trim();
    if (firstName && lastName) return `${lastName}, ${firstName}`;
    return lastName || firstName;
  };
  const normalizedInstructorName =
    parsedInstructors.length > 1
      ? parsedInstructors.map(formatInstructorName).filter(Boolean).join("; ")
      : formatInstructorName(primaryInstructor) || instructorField.trim();
  const instructorBaylorId = normalizeBaylorId(primaryInstructor?.id);
  const parsedInstructor =
    primaryInstructor ||
    parseInstructorField(instructorField) || { firstName: "", lastName: "", id: "" };

  const meetingPatternRaw = readField(row, "meeting_pattern", [
    "Meeting Pattern",
    "Meetings",
  ]);
  const meetingPatterns = parseMeetingPatterns(row);

  const instructionMethod = readField(row, "instruction_method", [
    "Inst. Method",
    "Instruction Method",
  ]);

  const roomRaw = readField(row, "room", ["Room", "Location"]);
  const parsedRooms = parseMultiRoom(roomRaw);
  const parsedRoomNames = Array.isArray(parsedRooms.displayNames)
    ? parsedRooms.displayNames
    : [];
  const locationNames =
    parsedRoomNames.length > 0
      ? parsedRoomNames
      : roomRaw
        ? splitMultiRoom(roomRaw)
        : [];
  const inferredIsOnline =
    parsedRooms.locationType === LOCATION_TYPE.VIRTUAL ||
    roomRaw.toUpperCase().includes("ONLINE") ||
    instructionMethod.toLowerCase().includes("online");
  const isPhysical =
    parsedRooms.locationType === LOCATION_TYPE.PHYSICAL ||
    (parsedRooms.locationType === LOCATION_TYPE.UNKNOWN &&
      locationNames.length > 0);
  const locationType = isPhysical ? "room" : "no_room";
  const locationLabel = inferredIsOnline
    ? "Online"
    : locationType === "no_room"
      ? parsedRooms.locationLabel || roomRaw || "No Room Needed"
      : "";
  const filteredRoomNames = locationType === "no_room" ? [] : locationNames;
  const spaceIds =
    locationType === "no_room"
      ? []
      : Array.from(new Set(parsedRooms.spaceKeys || []));
  const spaceDisplayNames =
    locationType === "no_room"
      ? []
      : parsedRoomNames.length > 0
        ? parsedRoomNames
        : filteredRoomNames;
  const crossListCrns = parseCrossListCrns(row, { includePrimaryCrn: false });

  return {
    courseCode,
    courseTitle,
    section,
    clssId,
    crn,
    credits: credits ?? null,
    creditRaw: rawCredits,
    subjectCode,
    catalogNumber,
    program,
    departmentCode,
    courseLevel,
    term,
    termCode,
    academicYear,
    instructorField,
    parsedInstructor,
    parsedInstructors,
    normalizedInstructorName,
    instructorBaylorId,
    meetingPatternRaw,
    meetingPatterns,
    roomRaw,
    spaceIds,
    spaceDisplayNames,
    crossListCrns,
    locationType,
    locationLabel,
    isOnline: inferredIsOnline,
    enrollment,
    maxEnrollment,
    waitCap,
    waitTotal,
    openSeats,
    waitAvailable,
    reservedSeats,
    reservedSeatsEnrollment,
    scheduleType:
      readField(row, "schedule_type", ["Schedule Type"]) || "Class Instruction",
    status: readField(row, "status", ["Status"]) || "Active",
    partOfTerm: readField(row, "part_of_term", ["Part of Semester", "Part of Term"]) || "",
    instructionMethod,
    campus: readField(row, "campus", ["Campus"]) || "",
    visibleOnWeb: readField(row, "visible_on_web", ["Visible on Web"]) || "",
    specialApproval: readField(row, "special_approval", ["Special Approval"]) || "",
    rowHash,
  };
};

export const projectSchedulePreviewRow = (row, fallbackTerm = "") => {
  const base = extractScheduleRowBaseData(row, fallbackTerm);
  const meetingSummary = Array.isArray(base.meetingPatterns)
    ? base.meetingPatterns
        .map((pattern) => {
          if (pattern.day && pattern.startTime && pattern.endTime) {
            return `${pattern.day} ${pattern.startTime}-${pattern.endTime}`;
          }
          return pattern.raw || "";
        })
        .filter(Boolean)
        .join("\n")
    : "";

  return {
    "Course Code": base.courseCode,
    "Course Title": base.courseTitle,
    Section: base.section,
    CRN: base.crn,
    "Credits (parsed)": base.credits ?? "",
    "Credits (raw)": base.creditRaw ?? "",
    Semester: base.term,
    "Semester Code": base.termCode,
    Instructor: base.normalizedInstructorName,
    "Instructor ID": base.instructorBaylorId,
    "Meeting Pattern": meetingSummary,
    Room:
      Array.isArray(base.spaceDisplayNames) && base.spaceDisplayNames.length > 0
        ? base.spaceDisplayNames.join("; ")
        : base.locationLabel,
    "Cross-list CRNs": Array.isArray(base.crossListCrns)
      ? base.crossListCrns.join(", ")
      : "",
    Status: base.status,
    "Inst. Method": base.instructionMethod,
    Enrollment: base.enrollment ?? "",
    "Max Enrollment": base.maxEnrollment ?? "",
  };
};
