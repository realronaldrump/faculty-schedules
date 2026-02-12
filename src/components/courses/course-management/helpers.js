import { parseCourseCode } from "../../../utils/courseUtils";
import { getBuildingDisplay } from "../../../utils/locationService";
import { normalizeTermLabel, termCodeFromLabel } from "../../../utils/termUtils";
import { parseTime } from "../../../utils/timeUtils";

export const computeCourseMetadata = (courseCode) => {
  if (!courseCode || typeof courseCode !== "string") {
    return { credits: "", program: "", catalogNumber: "" };
  }
  const parsed = parseCourseCode(courseCode);
  if (parsed?.error) {
    return { credits: "", program: "", catalogNumber: "" };
  }
  const programCode = parsed.program ? parsed.program.toUpperCase() : "";
  return {
    credits: parsed.credits,
    program: programCode,
    catalogNumber: parsed.catalogNumber || "",
  };
};

export const resolveScheduleTermKey = (schedule) => {
  if (!schedule) return "";
  const term = normalizeTermLabel(schedule.term || schedule.Term || "");
  const termCode =
    schedule.termCode ||
    schedule.TermCode ||
    termCodeFromLabel(term) ||
    termCodeFromLabel(schedule.term || "") ||
    "";
  return termCode || term || "";
};

export const extractBuildingNameFromLocation = (locationLabel) => {
  if (!locationLabel || typeof locationLabel !== "string") {
    return "Other";
  }
  const lowered = locationLabel.toLowerCase();
  if (lowered.includes("no room needed")) {
    return "No Room Needed";
  }
  const building = getBuildingDisplay(locationLabel);
  return building || "Other";
};

export const normalizeEnrollmentInput = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const getTimeOfDay = (timeStr) => {
  const minutes = parseTime(timeStr);
  if (!minutes) return "unknown";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
};
