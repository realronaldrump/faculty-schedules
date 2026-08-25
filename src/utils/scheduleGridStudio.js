export const STUDIO_SCHEMA_VERSION = 1;

export const STUDIO_DAYS = Object.freeze([
  { code: "M", short: "Mon", label: "Monday" },
  { code: "T", short: "Tue", label: "Tuesday" },
  { code: "W", short: "Wed", label: "Wednesday" },
  { code: "R", short: "Thu", label: "Thursday" },
  { code: "F", short: "Fri", label: "Friday" },
]);

export const STUDIO_PAGE_PRESETS = Object.freeze([
  {
    id: "door-7x5",
    label: "Door sign (7 × 5 in)",
    widthIn: 7,
    heightIn: 5,
  },
  {
    id: "letter-landscape",
    label: "Letter landscape (11 × 8.5 in)",
    widthIn: 11,
    heightIn: 8.5,
  },
  {
    id: "letter-portrait",
    label: "Letter portrait (8.5 × 11 in)",
    widthIn: 8.5,
    heightIn: 11,
  },
  {
    id: "custom",
    label: "Custom size",
    widthIn: 7,
    heightIn: 5,
  },
]);

export const DEFAULT_STUDIO_LAYOUT = Object.freeze({
  preset: "door-7x5",
  widthIn: 7,
  heightIn: 5,
  timeStart: "08:00",
  timeEnd: "17:00",
  timeStep: 60,
  textScale: 1,
  headerScale: 1,
  blockGap: 4,
  blockRadius: 4,
  gridOpacity: 0.72,
  accentColor: "#154734",
  highlightColor: "#ffb81c",
  blockColor: "#dcefe2",
  pageColor: "#ffffff",
  instructorFormat: "full",
});

export const DEFAULT_STUDIO_VISIBILITY = Object.freeze({
  building: true,
  room: true,
  semester: true,
  headerNote: true,
  dayHeaders: true,
  timeLabels: true,
  gridLines: true,
  course: true,
  section: true,
  instructor: true,
  classTime: false,
  footer: true,
  emptyDays: false,
});

let clientIdSequence = 0;

export const createStudioClientId = (prefix = "grid") => {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  clientIdSequence += 1;
  return `${prefix}-${Date.now()}-${clientIdSequence}`;
};

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

export const parseClockMinutes = (value, meridiemHint = "") => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(Math.round(value), 0, 24 * 60 - 1);
  }

  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  const twentyFourHour = text.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const hours = Number(twentyFourHour[1]);
    const minutes = Number(twentyFourHour[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  const twelveHour = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!twelveHour) return null;

  let hours = Number(twelveHour[1]);
  const minutes = Number(twelveHour[2] || 0);
  const meridiem = twelveHour[3] || meridiemHint;
  if (hours > 23 || minutes > 59) return null;

  if (meridiem) {
    if (hours > 12) return null;
    if (hours === 12) hours = 0;
    if (meridiem === "pm") hours += 12;
  }

  return hours * 60 + minutes;
};

export const minutesToTimeInput = (minutes, fallback = "08:00") => {
  if (!Number.isFinite(minutes)) return fallback;
  const normalized = clamp(Math.round(minutes), 0, 24 * 60 - 1);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

export const formatStudioTime = (value) => {
  const minutes = parseClockMinutes(value);
  if (minutes === null) return "";
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return mins === 0
    ? `${hours12}${period}`
    : `${hours12}:${String(mins).padStart(2, "0")}${period}`;
};

export const parseMeetingTimeRange = (value) => {
  const parts = String(value || "")
    .split(/\s*(?:-|–|—)\s*/)
    .filter(Boolean);
  if (parts.length === 0) {
    return { start: "08:00", end: "08:50" };
  }

  const startMeridiem = parts[0].match(/(am|pm)/i)?.[1]?.toLowerCase() || "";
  const endMeridiem = parts[1]?.match(/(am|pm)/i)?.[1]?.toLowerCase() || "";
  const startMinutes = parseClockMinutes(
    parts[0],
    startMeridiem || endMeridiem,
  );
  let endMinutes = parseClockMinutes(
    parts[1] || parts[0],
    endMeridiem || startMeridiem,
  );

  if (startMinutes === null) {
    return { start: "08:00", end: "08:50" };
  }
  if (endMinutes === null || endMinutes <= startMinutes) {
    endMinutes = Math.min(startMinutes + 50, 24 * 60 - 1);
  }

  return {
    start: minutesToTimeInput(startMinutes),
    end: minutesToTimeInput(endMinutes),
  };
};

export const normalizeMeetingDays = (value) => {
  if (Array.isArray(value)) {
    const requested = new Set(value.map((day) => String(day).toUpperCase()));
    return STUDIO_DAYS.map((day) => day.code).filter((day) =>
      requested.has(day),
    );
  }

  let text = String(value || "").toUpperCase().replace(/\s+/g, "");
  if (!text) return [];
  text = text
    .replaceAll("THURSDAY", "R")
    .replaceAll("THURS", "R")
    .replaceAll("THU", "R")
    .replaceAll("TH", "R")
    .replaceAll("TUESDAY", "T")
    .replaceAll("TUES", "T")
    .replaceAll("TUE", "T")
    .replaceAll("MONDAY", "M")
    .replaceAll("MON", "M")
    .replaceAll("WEDNESDAY", "W")
    .replaceAll("WED", "W")
    .replaceAll("FRIDAY", "F")
    .replaceAll("FRI", "F");

  return STUDIO_DAYS.map((day) => day.code).filter((day) =>
    text.includes(day),
  );
};

const normalizeTimeValue = (value, fallback) => {
  const parsed = parseClockMinutes(value);
  return parsed === null ? fallback : minutesToTimeInput(parsed, fallback);
};

export const createStudioEntry = (overrides = {}) => {
  const parsedRange = parseMeetingTimeRange(overrides.time);
  const start = normalizeTimeValue(
    overrides.start || parsedRange.start,
    "08:00",
  );
  let end = normalizeTimeValue(overrides.end || parsedRange.end, "08:50");
  if (parseClockMinutes(end) <= parseClockMinutes(start)) {
    end = minutesToTimeInput(parseClockMinutes(start) + 50, "08:50");
  }

  return {
    id: overrides.id || createStudioClientId("class"),
    course: String(overrides.course ?? overrides.class ?? "").trim(),
    section: String(overrides.section || "").trim(),
    instructor: String(overrides.instructor ?? overrides.professor ?? "").trim(),
    days: normalizeMeetingDays(overrides.days),
    start,
    end,
    hidden: Boolean(overrides.hidden),
    detailLevel: ["auto", "compact", "detailed"].includes(
      overrides.detailLevel,
    )
      ? overrides.detailLevel
      : "auto",
    blockColor: String(overrides.blockColor || ""),
    note: String(overrides.note || ""),
  };
};

export const getStudioEntryIdentity = (value = {}) => {
  const entry = createStudioEntry({ ...value, id: "identity" });
  return [
    entry.course.toLowerCase(),
    entry.section.toLowerCase(),
    entry.instructor.toLowerCase(),
    entry.days.join(""),
    entry.start,
    entry.end,
  ].join("|");
};

export const createStudioCatalogEntry = (value = {}) => {
  const identity = getStudioEntryIdentity(value);
  const building = String(value.building || "").trim();
  const room = String(value.room || "").trim();
  return {
    id: `catalog|${building.toLowerCase()}|${room.toLowerCase()}|${identity}`,
    building,
    room,
    entry: createStudioEntry({ ...value, id: createStudioClientId("class") }),
    identity,
  };
};

const mergeLayout = (layout = {}) => ({
  ...DEFAULT_STUDIO_LAYOUT,
  ...layout,
  widthIn: clamp(Number(layout.widthIn || DEFAULT_STUDIO_LAYOUT.widthIn), 3, 17),
  heightIn: clamp(
    Number(layout.heightIn || DEFAULT_STUDIO_LAYOUT.heightIn),
    3,
    17,
  ),
  textScale: clamp(
    Number(layout.textScale || DEFAULT_STUDIO_LAYOUT.textScale),
    0.7,
    1.5,
  ),
  headerScale: clamp(
    Number(layout.headerScale || DEFAULT_STUDIO_LAYOUT.headerScale),
    0.75,
    1.5,
  ),
  blockGap: clamp(
    Number(layout.blockGap ?? DEFAULT_STUDIO_LAYOUT.blockGap),
    0,
    12,
  ),
  blockRadius: clamp(
    Number(layout.blockRadius ?? DEFAULT_STUDIO_LAYOUT.blockRadius),
    0,
    16,
  ),
  gridOpacity: clamp(
    Number(layout.gridOpacity ?? DEFAULT_STUDIO_LAYOUT.gridOpacity),
    0.15,
    1,
  ),
  timeStart: normalizeTimeValue(
    layout.timeStart,
    DEFAULT_STUDIO_LAYOUT.timeStart,
  ),
  timeEnd: normalizeTimeValue(layout.timeEnd, DEFAULT_STUDIO_LAYOUT.timeEnd),
});

export const createBlankStudioDocument = (overrides = {}) => ({
  schemaVersion: STUDIO_SCHEMA_VERSION,
  kind: "studio",
  name: String(overrides.name || "Untitled room schedule"),
  folder: String(overrides.folder || "Unfiled"),
  tags: Array.isArray(overrides.tags)
    ? overrides.tags.map(String).filter(Boolean)
    : [],
  favorite: Boolean(overrides.favorite),
  source: overrides.source === "schedule" ? "schedule" : "blank",
  building: String(overrides.building || ""),
  room: String(overrides.room || ""),
  semester: String(overrides.semester || ""),
  headerNote: String(overrides.headerNote || "Room Schedule"),
  footerLeft: String(overrides.footerLeft || "Baylor University"),
  footerRight: String(overrides.footerRight || "Human Sciences & Design"),
  layout: mergeLayout(overrides.layout),
  visibility: {
    ...DEFAULT_STUDIO_VISIBILITY,
    ...(overrides.visibility || {}),
  },
  entries: Array.isArray(overrides.entries)
    ? overrides.entries.map(createStudioEntry)
    : [],
});

export const createStudioDocumentFromSchedule = ({
  classes = [],
  building = "",
  room = "",
  semester = "",
  name = "",
} = {}) => {
  const entries = classes.map((item) => createStudioEntry(item));
  const resolvedName =
    name || [building, room, semester].filter(Boolean).join(" · ") || "Room schedule";

  return createBlankStudioDocument({
    name: resolvedName,
    folder: semester || "Imported schedules",
    source: "schedule",
    building,
    room,
    semester,
    entries,
  });
};

export const normalizeStudioDocument = (document = {}) =>
  createBlankStudioDocument(document);

export const studioDocumentReducer = (state, action) => {
  switch (action.type) {
    case "set_metadata": {
      const hasChanges = Object.entries(action.patch || {}).some(
        ([key, value]) => state[key] !== value,
      );
      if (!hasChanges) return state;
      const nextState = { ...state, ...action.patch };
      return nextState;
    }
    case "update_layout":
      return {
        ...state,
        layout: mergeLayout({ ...state.layout, ...action.patch }),
      };
    case "update_visibility":
      return {
        ...state,
        visibility: { ...state.visibility, ...action.patch },
      };
    case "add_entry":
      return {
        ...state,
        entries: [...state.entries, createStudioEntry(action.entry)],
      };
    case "add_entries": {
      const additions = (action.entries || []).map(createStudioEntry);
      if (additions.length === 0) return state;
      return {
        ...state,
        entries: [...state.entries, ...additions],
      };
    }
    case "update_entry":
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === action.id
            ? createStudioEntry({ ...entry, ...action.patch, id: entry.id })
            : entry,
        ),
      };
    case "delete_entry":
      return {
        ...state,
        entries: state.entries.filter((entry) => entry.id !== action.id),
      };
    case "duplicate_entry": {
      const source = state.entries.find((entry) => entry.id === action.id);
      if (!source) return state;
      const duplicate = createStudioEntry({
        ...source,
        id: action.newId || createStudioClientId("class"),
      });
      const sourceIndex = state.entries.findIndex((entry) => entry.id === action.id);
      const entries = [...state.entries];
      entries.splice(sourceIndex + 1, 0, duplicate);
      return { ...state, entries };
    }
    case "replace_entries":
      return {
        ...state,
        entries: (action.entries || []).map(createStudioEntry),
      };
    default:
      throw new Error(`Unknown studio document action: ${action.type}`);
  }
};

export const createStudioHistory = (document) => ({
  past: [],
  present: normalizeStudioDocument(document),
  future: [],
});

export const studioHistoryReducer = (history, action) => {
  if (action.type === "undo") {
    if (history.past.length === 0) return history;
    const previous = history.past[history.past.length - 1];
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future].slice(0, 50),
    };
  }

  if (action.type === "redo") {
    if (history.future.length === 0) return history;
    const [next, ...future] = history.future;
    return {
      past: [...history.past, history.present].slice(-50),
      present: next,
      future,
    };
  }

  if (action.type === "replace_document") {
    return createStudioHistory(action.document);
  }

  const nextDocument = studioDocumentReducer(history.present, action);
  if (nextDocument === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-50),
    present: nextDocument,
    future: [],
  };
};

export const getStudioTimeRange = (layout = {}) => {
  const start = parseClockMinutes(layout.timeStart) ?? 8 * 60;
  const requestedEnd = parseClockMinutes(layout.timeEnd) ?? 17 * 60;
  const end = requestedEnd > start ? requestedEnd : Math.min(start + 60, 24 * 60);
  return { start, end, total: Math.max(end - start, 60) };
};

const finalizeOverlapCluster = (cluster, output) => {
  if (cluster.length === 0) return;
  const laneEnds = [];
  const assigned = cluster.map((entry) => {
    let lane = laneEnds.findIndex((end) => end <= entry.startMinutes);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = entry.endMinutes;
    return { ...entry, lane };
  });
  const laneCount = Math.max(laneEnds.length, 1);
  assigned.forEach((entry) => output.push({ ...entry, laneCount }));
};

export const layoutStudioEntriesForDay = (entries, dayCode, layout = {}) => {
  const { start: rangeStart, end: rangeEnd } = getStudioTimeRange(layout);
  const sorted = (entries || [])
    .filter((entry) => !entry.hidden && entry.days?.includes(dayCode))
    .map((entry) => {
      const startMinutes = parseClockMinutes(entry.start) ?? rangeStart;
      const requestedEnd = parseClockMinutes(entry.end) ?? startMinutes + 50;
      return {
        ...entry,
        startMinutes: clamp(startMinutes, rangeStart, rangeEnd),
        endMinutes: clamp(
          Math.max(requestedEnd, startMinutes + 5),
          rangeStart,
          rangeEnd,
        ),
      };
    })
    .filter((entry) => entry.endMinutes > entry.startMinutes)
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        a.endMinutes - b.endMinutes ||
        a.id.localeCompare(b.id),
    );

  const output = [];
  let cluster = [];
  let clusterEnd = -1;

  sorted.forEach((entry) => {
    if (cluster.length > 0 && entry.startMinutes >= clusterEnd) {
      finalizeOverlapCluster(cluster, output);
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endMinutes);
  });
  finalizeOverlapCluster(cluster, output);
  return output;
};

export const formatInstructorForStudio = (name, format = "full") => {
  const text = String(name || "").trim();
  if (!text || format !== "last") return text;
  if (text.includes(",")) return text.split(",")[0].trim();
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.at(-1) || text;
};

export const studioDocumentSignature = (document) =>
  JSON.stringify(normalizeStudioDocument(document));
