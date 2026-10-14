/**
 * studentScheduleFilters.js - the building / job / student filters shared by
 * the Student Worker Schedules page and its printable sign, so both always
 * show the same shifts for the same filters.
 */
import {
  getStudentAssignments,
  isAssignmentActiveDuringSemester,
} from "./studentWorkers";

export const DAY_ORDER = ["M", "T", "W", "R", "F"];
export const DAY_LABELS = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

export const EMPTY_FILTERS = { buildings: [], jobTitles: [], studentIds: [] };

export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hh, mm] = timeStr.split(":").map((v) => parseInt(v, 10));
  return hh * 60 + (mm || 0);
};

const firstNameKey = (name) => {
  const n = String(name || "").trim();
  if (!n) return "";
  const given = n.includes(",") ? n.split(",")[1]?.trim() || "" : n;
  return (given.split(/\s+/)[0] || "").toLowerCase();
};

/**
 * Choices for the filter menus: buildings and job titles (sorted), and
 * student ids sorted by first name with an id → name map for labels.
 */
export const getStudentFilterOptions = (studentData) => {
  const buildings = new Set();
  const jobTitles = new Set();
  studentData.forEach((student) => {
    getStudentAssignments(student).forEach((assignment) => {
      (assignment.buildings || []).forEach((b) => b && buildings.add(b));
      if (assignment.jobTitle) jobTitles.add(assignment.jobTitle);
    });
  });

  const studentNames = {};
  const students = studentData
    .filter((s) => s?.id)
    .map((s) => {
      studentNames[s.id] = s.name || s.id;
      return { id: s.id, name: s.name || "", key: firstNameKey(s.name) };
    })
    .sort(
      (a, b) =>
        (a.key ? 0 : 1) - (b.key ? 0 : 1) ||
        a.key.localeCompare(b.key, undefined, { sensitivity: "base" }) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
        String(a.id).localeCompare(String(b.id), undefined, {
          sensitivity: "base",
        }),
    );

  return {
    buildings: [...buildings].sort(),
    jobTitles: [...jobTitles].sort(),
    studentIds: students.map((s) => s.id),
    studentNames,
  };
};

/** Each student with their scheduled assignments in scope for the semester. */
export const getScheduledStudents = (
  studentData,
  semesterMeta,
  includeInactive,
) =>
  studentData.map((student) => ({
    student,
    assignments: getStudentAssignments(student).filter(
      (a) =>
        Array.isArray(a.schedule) &&
        a.schedule.length > 0 &&
        (includeInactive ||
          isAssignmentActiveDuringSemester(a, student, semesterMeta)),
    ),
  }));

/**
 * Students matching the filters, each with `visibleAssignments`. Empty
 * filter lists match everything.
 */
export const filterScheduledStudents = (
  scheduledStudents,
  { buildings, jobTitles, studentIds },
) =>
  scheduledStudents
    .map(({ student, assignments }) => {
      if (studentIds.length > 0 && !studentIds.includes(student.id)) return null;
      const visibleAssignments = assignments.filter(
        (a) =>
          (jobTitles.length === 0 || jobTitles.includes(a.jobTitle)) &&
          (buildings.length === 0 ||
            (a.buildings || []).some((b) => buildings.includes(b))),
      );
      return visibleAssignments.length > 0
        ? { ...student, visibleAssignments }
        : null;
    })
    .filter(Boolean);

/** Monday–Friday, each with the filtered students' shifts that day. */
export const buildWeekDays = (filteredStudents) => {
  const byDay = Object.fromEntries(DAY_ORDER.map((day) => [day, []]));
  filteredStudents.forEach((student) => {
    student.visibleAssignments.forEach((assignment) => {
      (assignment.schedule || []).forEach((entry) => {
        if (!byDay[entry?.day]) return;
        const startMinutes = parseTimeToMinutes(entry.start);
        const endMinutes = parseTimeToMinutes(entry.end);
        if (startMinutes >= endMinutes) return;
        byDay[entry.day].push({
          student,
          assignment,
          entry,
          startMinutes,
          endMinutes,
          colorKey: `${student.id}-${assignment.jobTitle}`,
        });
      });
    });
  });
  return DAY_ORDER.map((day) => ({
    id: day,
    label: DAY_LABELS[day],
    events: byDay[day],
  }));
};
