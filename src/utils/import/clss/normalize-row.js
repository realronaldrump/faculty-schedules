import { normalizeTermLabel } from "../../termUtils";

const asString = (value) =>
  value === undefined || value === null ? "" : String(value).replace(/\r/g, "").trim();

const CLSS_CANONICAL_TO_LEGACY = {
  clss_id: "CLSS ID",
  course_code: "Course",
  section: "Section #",
  crn: "CRN",
  instructor: "Instructor",
  term: "Term",
  term_code: "Term Code",
  course_title: "Course Title",
  meeting_pattern: "Meeting Pattern",
  room: "Room",
  status: "Status",
  instruction_method: "Inst. Method",
  catalog_number: "Catalog Number",
  credit_hours: "Credit Hrs",
  subject_code: "Subject Code",
  department_code: "Department Code",
  enrollment: "Enrollment",
  maximum_enrollment: "Maximum Enrollment",
  wait_cap: "Wait Cap",
  wait_total: "Wait Total",
  open_seats: "Open Seats",
  wait_available: "Wait Available",
  reserved_seats: "Reserved Seats",
  reserved_seats_enrollment: "Reserved Seats - Enrollment",
  schedule_type: "Schedule Type",
  part_of_term: "Part of Semester",
  campus: "Campus",
  visible_on_web: "Visible on Web",
  special_approval: "Special Approval",
  cross_list_crns: "Cross-list CRNs",
};

export const normalizeClssRow = (
  rowValues = [],
  {
    fieldToIndex = {},
    detectedTerm = "",
    includeOriginalColumns = true,
    rawHeaders = [],
  } = {},
) => {
  const readField = (fieldId) => {
    const index = fieldToIndex[fieldId];
    if (index === undefined) return "";
    return asString(rowValues[index]);
  };

  const canonical = {
    clss_id: readField("clss_id"),
    course_code: readField("course_code"),
    section: readField("section"),
    crn: readField("crn"),
    instructor: readField("instructor"),
    term: readField("term"),
    term_code: readField("term_code"),
    course_title: readField("course_title"),
    meeting_pattern: readField("meeting_pattern"),
    room: readField("room"),
    status: readField("status"),
    instruction_method: readField("instruction_method"),
    catalog_number: readField("catalog_number"),
    credit_hours: readField("credit_hours"),
    subject_code: readField("subject_code"),
    department_code: readField("department_code"),
    enrollment: readField("enrollment"),
    maximum_enrollment: readField("maximum_enrollment"),
    wait_cap: readField("wait_cap"),
    wait_total: readField("wait_total"),
    open_seats: readField("open_seats"),
    wait_available: readField("wait_available"),
    reserved_seats: readField("reserved_seats"),
    reserved_seats_enrollment: readField("reserved_seats_enrollment"),
    schedule_type: readField("schedule_type"),
    part_of_term: readField("part_of_term"),
    campus: readField("campus"),
    visible_on_web: readField("visible_on_web"),
    special_approval: readField("special_approval"),
    cross_list_crns: readField("cross_list_crns"),
  };

  const normalizedDetectedTerm = normalizeTermLabel(detectedTerm || "");
  const normalizedRawTerm = normalizeTermLabel(canonical.term || "");
  canonical.term = normalizedRawTerm || normalizedDetectedTerm || canonical.term || "";

  const legacyRow = {
    __clssCanonical: canonical,
  };

  Object.entries(CLSS_CANONICAL_TO_LEGACY).forEach(([fieldId, legacyKey]) => {
    legacyRow[legacyKey] = canonical[fieldId] || "";
  });

  // Mirror aliases consumed in existing downstream paths.
  legacyRow.Semester = legacyRow.Term;
  legacyRow["Semester Code"] = legacyRow["Term Code"];
  legacyRow.Meetings = legacyRow["Meeting Pattern"];
  legacyRow["Instruction Method"] = legacyRow["Inst. Method"];
  legacyRow["Course Type"] = legacyRow["Subject Code"];

  if (includeOriginalColumns && Array.isArray(rawHeaders)) {
    rawHeaders.forEach((header, index) => {
      const trimmedHeader = asString(header);
      if (!trimmedHeader) return;
      if (legacyRow[trimmedHeader] !== undefined) return;
      legacyRow[trimmedHeader] = asString(rowValues[index]);
    });
  }

  return legacyRow;
};
