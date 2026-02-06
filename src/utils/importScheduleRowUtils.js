/**
 * Schedule row extraction and normalization helpers.
 *
 * These are shared across:
 * - import preview/commit pipeline (importTransactionUtils)
 * - within-batch preprocessing (importPreprocessor)
 *
 * Keeping them in a standalone module avoids circular dependencies.
 */

import { parseCourseCode, deriveCreditsFromCatalogNumber } from "./courseUtils";
import { parseMeetingPatterns } from "./meetingPatternUtils";
import { normalizeBaylorId } from "./personMatchUtils";
import { normalizeTermLabel, termCodeFromLabel } from "./termUtils";
import { hashRecord } from "./hashUtils";
import { standardizeCourseCode, isCancelledStatus } from "./hygieneCore";
import { normalizeSectionNumber } from "./canonicalSchema";
import {
  LOCATION_TYPE,
  parseMultiRoom,
  splitMultiRoom,
} from "./locationService";
import { parseInstructorField, parseInstructorFieldList } from "./dataImportUtils";

export const normalizeSectionIdentifier = (sectionField) =>
  normalizeSectionNumber(sectionField);

export const extractCrnFromSectionField = (sectionField) => {
  if (!sectionField) return "";
  const match = String(sectionField).match(/\((\d{5,6})\)/);
  return match ? match[1] : "";
};

export const extractAcademicYear = (term) => {
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

  const courseCode = standardizeCourseCode(row.Course || "");
  const courseTitle =
    row["Course Title"] || row["Long Title"] || row["Title/Topic"] || "";
  const section = normalizeSectionIdentifier(row["Section #"] || "");

  const clssId = (row["CLSS ID"] || "").toString().trim();
  const directCrn = (row["CRN"] || "").toString().trim();
  const sectionCrn = extractCrnFromSectionField(row["Section #"] || "");
  const crn = /^\d{5,6}$/.test(directCrn)
    ? directCrn
    : /^\d{5,6}$/.test(sectionCrn)
      ? sectionCrn
      : "";

  const rawCredits =
    row["Credit Hrs"] ??
    row["Credit Hrs Min"] ??
    row["Credit Hrs Max"] ??
    null;
  const catalogNumber = (row["Catalog Number"] || "")
    .toString()
    .trim()
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
    (row["Subject Code"] || "").toString().trim().toUpperCase() || parsedProgram;
  const program = parsedProgram || subjectCode;
  const departmentCode = (row["Department Code"] || "")
    .toString()
    .trim()
    .toUpperCase();
  const courseLevel = Number.isFinite(parsedCourse?.level) ? parsedCourse.level : 0;
  const enrollment = normalizeNumericField(row["Enrollment"]);
  const maxEnrollment = normalizeNumericField(row["Maximum Enrollment"]);
  const waitCap = normalizeNumericField(row["Wait Cap"]);
  const waitTotal = normalizeNumericField(row["Wait Total"]);
  const openSeats = normalizeNumericField(row["Open Seats"]);
  const waitAvailable = normalizeNumericField(row["Wait Available"]);
  const reservedSeats = normalizeNumericField(row["Reserved Seats"]);
  const reservedSeatsEnrollment = normalizeNumericField(
    row["Reserved Seats - Enrollment"],
  );

  const rawTerm = row.Semester || row.Term || fallbackTerm || "";
  const normalizedTerm = normalizeTermLabel(rawTerm);
  const term = normalizedTerm || rawTerm;
  const termCode = termCodeFromLabel(
    row["Semester Code"] || row["Term Code"] || normalizedTerm,
  );
  const academicYear = extractAcademicYear(term);

  const instructorField = row.Instructor || "";
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

  const meetingPatternRaw = (row["Meeting Pattern"] || row["Meetings"] || "")
    .toString()
    .trim();
  const meetingPatterns = parseMeetingPatterns(row);

  const instructionMethod = (row["Inst. Method"] || row["Instruction Method"] || "")
    .toString()
    .trim();

  const roomRaw = (row.Room || "").toString().trim();
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
    scheduleType: row["Schedule Type"] || "Class Instruction",
    status: row.Status || "Active",
    partOfTerm: row["Part of Semester"] || row["Part of Term"] || "",
    instructionMethod,
    campus: row.Campus || "",
    visibleOnWeb: row["Visible on Web"] || "",
    specialApproval: row["Special Approval"] || "",
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
    Status: base.status,
    "Inst. Method": base.instructionMethod,
    Enrollment: base.enrollment ?? "",
    "Max Enrollment": base.maxEnrollment ?? "",
  };
};

export default {
  extractScheduleRowBaseData,
  normalizeSectionIdentifier,
  extractCrnFromSectionField,
  extractAcademicYear,
  projectSchedulePreviewRow,
};
