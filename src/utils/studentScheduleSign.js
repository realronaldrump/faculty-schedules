/**
 * studentScheduleSign.js - settings and data shaping for the one-page
 * Student Worker Schedule sign (print, laminate, hang in an office).
 */

export const SIGN_LAYOUTS = [
  {
    id: "day",
    label: "By day",
    description:
      "Each day's shifts in time order. Easiest to read from across a room.",
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Each day is a row, with a bar for every shift.",
  },
  {
    id: "student",
    label: "By student",
    description: "One row per student with hours for each day, like a spreadsheet.",
  },
];

// Sizes are portrait; landscape swaps them.
export const PAPER_SIZES = [
  { id: "letter", label: "Letter", widthIn: 8.5, heightIn: 11 },
  { id: "legal", label: "Legal", widthIn: 8.5, heightIn: 14 },
  { id: "tabloid", label: "Tabloid", widthIn: 11, heightIn: 17 },
];

// Half an inch keeps text clear of printer edges and laminating pouch seals.
export const SIGN_MARGIN_IN = 0.5;
export const PX_PER_IN = 96;

export const getSheetSize = (paperId, orientation) => {
  const paper = PAPER_SIZES.find((p) => p.id === paperId) || PAPER_SIZES[0];
  const portrait = orientation === "portrait";
  return {
    widthIn: portrait ? paper.widthIn : paper.heightIn,
    heightIn: portrait ? paper.heightIn : paper.widthIn,
  };
};

// Size of student names (px) in each layout before the sign is scaled to fit.
const NAME_TEXT_PX = { timeline: 12, day: 13, student: 13 };
export const MIN_COMFORTABLE_PT = 8;

/** Printed size of student names, in points, rounded to the half point. */
export const printedNamePoints = (layout, scale) =>
  Math.round(NAME_TEXT_PX[layout] * scale * 0.75 * 2) / 2;

// ---- Defaults from the sign's filters ----

const titleJob = ({ buildings = [], jobTitles = [] }) =>
  buildings.length !== 1 && jobTitles.length === 1 ? jobTitles[0] : "";

/** "<Building> Student Workers", "<Job> Schedule", or a generic title. */
export const defaultSignTitle = (filters) => {
  if (filters.buildings?.length === 1) {
    return `${filters.buildings[0]} Student Workers`;
  }
  const job = titleJob(filters);
  return job ? `${job} Schedule` : "Student Worker Schedule";
};

/** The term plus any filters the title doesn't already name. */
export const defaultSignSubtitle = ({
  semesterLabel = "",
  buildings = [],
  jobTitles = [],
}) =>
  [
    semesterLabel,
    buildings.length > 1 ? buildings.join(", ") : "",
    titleJob({ buildings, jobTitles }) ? "" : jobTitles.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

// ---- Data shaping ----

const byTimeThenName = (a, b) =>
  a.startMinutes - b.startMinutes ||
  a.endMinutes - b.endMinutes ||
  a.student.name.localeCompare(b.student.name);

/** A day's shifts in the order they start. */
export const sortDayShifts = (events) => [...events].sort(byTimeThenName);

/**
 * One row per student per job, grouped by job title (both sorted by name).
 * Each row has that job's shifts for every day and its weekly hours.
 */
export const buildSignRoster = (days) => {
  const rows = new Map();
  days.forEach((day) => {
    day.events.forEach((event) => {
      const job = event.assignment.jobTitle || "";
      const key = `${job}\u0000${event.student.id}`;
      if (!rows.has(key)) {
        rows.set(key, {
          job,
          student: event.student,
          shifts: Object.fromEntries(days.map(({ id }) => [id, []])),
          minutes: 0,
        });
      }
      const row = rows.get(key);
      row.shifts[day.id].push(event);
      row.minutes += event.endMinutes - event.startMinutes;
    });
  });

  const groups = new Map();
  rows.forEach((row) => {
    Object.values(row.shifts).forEach((list) => list.sort(byTimeThenName));
    if (!groups.has(row.job)) groups.set(row.job, []);
    groups.get(row.job).push({ ...row, hours: row.minutes / 60 });
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([job, list]) => ({
      job,
      rows: list.sort((a, b) => a.student.name.localeCompare(b.student.name)),
    }));
};

// ---- Saved settings (per browser) ----

const SIGN_SETTINGS_STORAGE_KEY = "studentScheduleSignSettings";
export const MAX_NOTE_LENGTH = 160;

export const getSavedSignSettings = () => {
  let saved = {};
  try {
    saved = JSON.parse(
      window.localStorage.getItem(SIGN_SETTINGS_STORAGE_KEY) || "{}",
    );
  } catch {
    saved = {};
  }
  return {
    layout: SIGN_LAYOUTS.some(({ id }) => id === saved?.layout)
      ? saved.layout
      : "day",
    paper: PAPER_SIZES.some(({ id }) => id === saved?.paper)
      ? saved.paper
      : "letter",
    orientation: saved?.orientation === "portrait" ? "portrait" : "landscape",
    note:
      typeof saved?.note === "string"
        ? saved.note.slice(0, MAX_NOTE_LENGTH)
        : "",
  };
};

export const saveSignSettings = ({ layout, paper, orientation, note }) => {
  try {
    window.localStorage.setItem(
      SIGN_SETTINGS_STORAGE_KEY,
      JSON.stringify({ layout, paper, orientation, note }),
    );
  } catch (error) {
    console.error("Failed to save sign settings", error);
  }
};
