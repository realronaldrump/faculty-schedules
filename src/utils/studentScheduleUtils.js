import { parseTime, formatMinutesTo24Hour } from "./timeUtils";

const DAY_MAP = {
  M: "M",
  MON: "M",
  MONDAY: "M",
  T: "T",
  TU: "T",
  TUE: "T",
  TUESDAY: "T",
  W: "W",
  WED: "W",
  WEDNESDAY: "W",
  R: "R",
  TH: "R",
  THU: "R",
  THUR: "R",
  THURS: "R",
  THURSDAY: "R",
  F: "F",
  FRI: "F",
  FRIDAY: "F",
  S: "S",
  SAT: "S",
  SATURDAY: "S",
  U: "U",
  SU: "U",
  SUN: "U",
  SUNDAY: "U",
};

const clampMinutes = (minutes) => {
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 0) return 0;
  if (minutes > 1439) return 1439;
  return Math.round(minutes);
};

export const normalizeScheduleDay = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const key = raw.length === 1
    ? raw.toUpperCase()
    : raw.toUpperCase().replace(/[^A-Z]/g, "");
  return DAY_MAP[key] || "";
};

export const STUDENT_SCHEDULE_RULES = {
  allowedDays: ["M", "T", "W", "R", "F"],
  startMinutes: 8 * 60,
  endMinutes: 17 * 60,
};

export const toScheduleMinutes = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return clampMinutes(value);
  }
  const minutes = parseTime(String(value));
  if (minutes === null || Number.isNaN(minutes)) return null;
  return clampMinutes(minutes);
};

export const normalizeScheduleTime = (value) => {
  const minutes = toScheduleMinutes(value);
  if (minutes === null) return "";
  return formatMinutesTo24Hour(minutes);
};

export const normalizeWeeklySchedule = (entries) => {
  if (!Array.isArray(entries)) return [];
  const normalized = [];
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const day = normalizeScheduleDay(entry.day);
    const startMinutes = toScheduleMinutes(entry.start);
    const endMinutes = toScheduleMinutes(entry.end);
    if (!day || startMinutes === null || endMinutes === null) return;
    if (startMinutes >= endMinutes) return;
    const start = formatMinutesTo24Hour(startMinutes);
    const end = formatMinutesTo24Hour(endMinutes);
    normalized.push({ day, start, end });
  });

  const seen = new Set();
  return normalized.filter((entry) => {
    const key = `${entry.day}|${entry.start}|${entry.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const isWithinStudentScheduleWindow = (entry) => {
  if (!entry) return false;
  const day = normalizeScheduleDay(entry.day);
  if (!day || !STUDENT_SCHEDULE_RULES.allowedDays.includes(day)) return false;
  const startMinutes = toScheduleMinutes(entry.start);
  const endMinutes = toScheduleMinutes(entry.end);
  if (startMinutes === null || endMinutes === null) return false;
  return (
    startMinutes >= STUDENT_SCHEDULE_RULES.startMinutes &&
    endMinutes <= STUDENT_SCHEDULE_RULES.endMinutes &&
    startMinutes < endMinutes
  );
};

export const normalizeStudentWeeklySchedule = (entries) => {
  const normalized = normalizeWeeklySchedule(entries);
  return normalized.filter((entry) => isWithinStudentScheduleWindow(entry));
};

export const sortWeeklySchedule = (entries = []) => {
  const dayOrder = ["M", "T", "W", "R", "F", "S", "U"];
  const copy = [...entries];
  copy.sort((a, b) => {
    const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    const aStart = toScheduleMinutes(a.start) ?? 0;
    const bStart = toScheduleMinutes(b.start) ?? 0;
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = toScheduleMinutes(a.end) ?? 0;
    const bEnd = toScheduleMinutes(b.end) ?? 0;
    return aEnd - bEnd;
  });
  return copy;
};
