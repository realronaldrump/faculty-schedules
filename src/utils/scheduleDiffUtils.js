/**
 * Term-over-term schedule diff
 *
 * Compares two terms of the (read-only) CLSS schedule and reports what changed:
 * sections added, dropped, or modified (instructor / room / meeting time / cap).
 * Pure functions for testability.
 */

import { getMaxEnrollment } from "./enrollmentUtils";

const DAY_ORDER = ["M", "T", "W", "R", "F", "SA", "SU"];

const sectionKey = (course, section) =>
  `${(course || "").toString().trim().toUpperCase()}|${(section || "")
    .toString()
    .trim()
    .toUpperCase()}`;

/** Build a readable meeting pattern from a section's meeting rows. */
const formatMeetingPattern = (meetings = []) => {
  if (meetings.length === 0) return "—";
  const byTime = new Map();
  meetings.forEach((m) => {
    const time = `${m.start || ""}-${m.end || ""}`;
    if (!byTime.has(time)) byTime.set(time, new Set());
    if (m.day) byTime.get(time).add(m.day.toString().trim().toUpperCase());
  });
  return Array.from(byTime.entries())
    .map(([time, daySet]) => {
      const days = DAY_ORDER.filter((d) => daySet.has(d)).join("");
      const [start, end] = time.split("-");
      const label = start && start !== "undefined" ? `${start}–${end}` : "";
      return [days, label].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join(", ");
};

/**
 * Map Course|Section → section record from enriched schedule docs
 * (one doc per section, with meetingPatterns/instructorName/locationDisplay,
 * as returned by fetchSchedulesByTerms). This is the path the UI uses, because
 * the in-memory scheduleData only ever holds the currently selected term.
 */
export const buildSectionMapFromEnriched = (schedules = [], term = null) => {
  const map = new Map();
  schedules.forEach((s) => {
    if (!s) return;
    if (term && s.term !== term) return;
    const course = s.courseCode || s.Course || "";
    const section = s.section || s.Section || "";
    if (!course && !section) return;
    const meetings = Array.isArray(s.meetingPatterns)
      ? s.meetingPatterns.map((m) => ({
          day: m.day,
          start: m.startTime || m.start,
          end: m.endTime || m.end,
        }))
      : [];
    map.set(sectionKey(course, section), {
      course,
      section,
      crn: s.crn || s.CRN || "",
      instructor: s.instructorName || s.Instructor || "",
      room: s.locationDisplay || s.Room || "",
      max: getMaxEnrollment(s),
      meetingPattern: formatMeetingPattern(meetings),
    });
  });
  return map;
};

/** Map Course|Section → aggregated section record for a term. */
export const buildSectionMap = (scheduleRows = [], term = null) => {
  const byOriginal = new Map();
  scheduleRows.forEach((row) => {
    if (term && row.Term !== term) return;
    const id = row._originalId || row.id;
    if (!id) return;
    if (!byOriginal.has(id)) {
      byOriginal.set(id, {
        course: row.Course || "",
        section: row.Section || "",
        crn: row.CRN || row.crn || "",
        instructor: row.Instructor || "",
        room: row.Room || "",
        max: getMaxEnrollment(row),
        meetings: [],
      });
    }
    if (row.Day || row["Start Time"]) {
      byOriginal.get(id).meetings.push({
        day: row.Day,
        start: row["Start Time"],
        end: row["End Time"],
      });
    }
  });

  const map = new Map();
  byOriginal.forEach((rec) => {
    map.set(sectionKey(rec.course, rec.section), {
      ...rec,
      meetingPattern: formatMeetingPattern(rec.meetings),
    });
  });
  return map;
};

const FIELDS = [
  { key: "instructor", label: "Instructor" },
  { key: "room", label: "Room" },
  { key: "meetingPattern", label: "Time" },
  { key: "max", label: "Cap" },
];

/**
 * Diff two pre-built section maps (Course|Section → record).
 * @returns {{ added, dropped, changed, summary }}
 */
export const diffSectionMaps = (mapA, mapB) => {
  const added = [];
  const dropped = [];
  const changed = [];

  mapB.forEach((rec, key) => {
    if (!mapA.has(key)) added.push(rec);
  });

  mapA.forEach((recA, key) => {
    const recB = mapB.get(key);
    if (!recB) {
      dropped.push(recA);
      return;
    }
    const changes = [];
    FIELDS.forEach(({ key: field, label }) => {
      const from = recA[field];
      const to = recB[field];
      const normFrom = from == null ? "" : String(from);
      const normTo = to == null ? "" : String(to);
      if (normFrom !== normTo) {
        changes.push({ field: label, from: normFrom || "—", to: normTo || "—" });
      }
    });
    if (changes.length > 0) {
      changed.push({
        key,
        course: recA.course,
        section: recA.section,
        changes,
      });
    }
  });

  const byCourse = (a, b) =>
    (a.course || "").localeCompare(b.course || "", undefined, { numeric: true });
  added.sort(byCourse);
  dropped.sort(byCourse);
  changed.sort((a, b) =>
    (a.course || "").localeCompare(b.course || "", undefined, { numeric: true }),
  );

  return {
    added,
    dropped,
    changed,
    summary: {
      added: added.length,
      dropped: dropped.length,
      changed: changed.length,
    },
  };
};

/**
 * Diff two terms from flattened schedule rows (per-meeting). Convenience wrapper
 * used in tests; the UI uses buildSectionMapFromEnriched + diffSectionMaps.
 * @returns {{ added, dropped, changed, summary }}
 */
export const diffTerms = ({
  rowsA = [],
  termA = null,
  rowsB = [],
  termB = null,
} = {}) =>
  diffSectionMaps(buildSectionMap(rowsA, termA), buildSectionMap(rowsB, termB));
