export const MAX_ENROLLMENT_EXPORT_KEY = "Max Enrollment";
export const MAX_ENROLLMENT_FIELD_KEYS = new Set([
  "maxEnrollment",
  "maximumEnrollment",
  "Maximum Enrollment",
  "MaxEnrollment",
  "max_enrollment",
  "Max Enrollment",
]);

export const ROOM_MENU_MIN_WIDTH = "min(20rem, 90vw)";

export const DAY_NAMES = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

export const createDefaultCourseFilters = () => ({
  instructor: [],
  day: [],
  room: [],
  searchTerm: "",
  programs: { include: [], exclude: [] },
  sections: [],
  buildings: { include: [], exclude: [] },
  adjunct: "all",
  tenured: "all",
  credits: "all",
  timeOfDay: "all",
  status: "all",
  maxEnrollmentMin: "",
  maxEnrollmentMax: "",
});

export const cloneCourseFilters = (filters = createDefaultCourseFilters()) => {
  const base = createDefaultCourseFilters();
  const source = filters || {};
  return {
    ...base,
    ...source,
    instructor: [...(Array.isArray(source.instructor) ? source.instructor : [])],
    day: [...(Array.isArray(source.day) ? source.day : [])],
    room: [...(Array.isArray(source.room) ? source.room : [])],
    sections: [...(Array.isArray(source.sections) ? source.sections : [])],
    programs: {
      include: [...(Array.isArray(source.programs?.include) ? source.programs.include : [])],
      exclude: [...(Array.isArray(source.programs?.exclude) ? source.programs.exclude : [])],
    },
    buildings: {
      include: [...(Array.isArray(source.buildings?.include) ? source.buildings.include : [])],
      exclude: [...(Array.isArray(source.buildings?.exclude) ? source.buildings.exclude : [])],
    },
  };
};

const buildPresetFilters = (overrides = {}) => {
  return cloneCourseFilters(overrides);
};

export const COURSE_FILTER_PRESETS = {
  "all-courses": {
    name: "All Courses",
    filters: buildPresetFilters(),
  },
  "adjunct-courses": {
    name: "Adjunct-Taught",
    filters: buildPresetFilters({ adjunct: "include" }),
  },
  "active-courses": {
    name: "Active Courses Only",
    filters: buildPresetFilters({ status: "Active" }),
  },
  "morning-classes": {
    name: "Morning Classes",
    filters: buildPresetFilters({ timeOfDay: "morning" }),
  },
  "high-credit": {
    name: "High Credit Hours",
    filters: buildPresetFilters({ credits: "4+" }),
  },
};
