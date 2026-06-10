/**
 * PAF (Personnel Action Form) Utilities
 *
 * Provides helpers for generating copy-paste friendly PAF data
 * for adjunct faculty paperwork and Microsoft Forms.
 */

import { getMaxEnrollment } from "./enrollmentUtils";

export const PAF_PAGE_ID = "workflows/paf";

// Static costing defaults for PAF forms
export const PAF_DEFAULTS = {
  costing: "410.41205.100.1000000.91055.155.0000",
  fte: "0.25",
  pay: "$5,000",
  monthlyPay: "$1,000",
};

/**
 * Format a single course/section for PAF display
 * @param {Object} course - Course/section record
 * @returns {Object} Formatted course data
 */
export const formatCourseForPAF = (course) => {
  if (!course) return null;

  const courseCode = course.courseCode || course.Course || "";
  const sectionNumber =
    course.sectionNumber || course.section || course.Section || "";
  const courseTitle =
    course.courseTitle || course["Course Title"] || course.Title || "";
  const credits =
    course.credits ?? course.Credits ?? course["Credits (parsed)"] ?? null;
  const maxEnrollment = getMaxEnrollment(course);

  const headerParts = [];
  if (courseCode) headerParts.push(courseCode);
  if (sectionNumber) headerParts.push(sectionNumber);
  const header = headerParts.join("-").trim();
  const titlePart = courseTitle ? ` ${courseTitle}` : "";
  const courseLine = `${header}${titlePart}`.trim();
  const maxEnrollmentValue =
    maxEnrollment !== null && maxEnrollment !== undefined && `${maxEnrollment}`.trim() !== ""
      ? `${maxEnrollment}`.trim()
      : "";
  const displayLine = courseLine;

  return {
    courseCode,
    sectionNumber,
    courseTitle,
    credits,
    maxEnrollment,
    maxEnrollmentValue,
    courseLine,
    displayLine,
    copyLine: displayLine,
  };
};

export const normalizeIgnitePersonNumber = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\D/g, "").trim();
};

const TOP_LEVEL_IGNITE_ALIAS_KEYS = [
  "ignitePersonId",
  "igniteId",
  "personNumber",
  "person_number",
  "Person Number",
];

const EXTERNAL_IGNITE_ALIAS_KEYS = [
  "ignitePersonNumber",
  "ignitePersonId",
  "igniteId",
  "personNumber",
];

export const getIgnitePersonNumber = (person = {}) => {
  if (!person) return "";
  const candidates = [
    person.ignitePersonNumber,
    ...TOP_LEVEL_IGNITE_ALIAS_KEYS.map((key) => person[key]),
    person.externalIds?.ignitePersonNumber,
    person.externalIds?.ignitePersonId,
    person.externalIds?.igniteId,
    person.externalIds?.personNumber,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIgnitePersonNumber(candidate);
    if (normalized) return normalized;
  }
  return "";
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const buildIgnitePersonNumberUpdate = (
  person = {},
  value = "",
  timestamp = new Date().toISOString(),
) => {
  const nextIgnitePersonNumber = normalizeIgnitePersonNumber(value);
  const updateData = {
    ignitePersonNumber: nextIgnitePersonNumber,
    updatedAt: timestamp,
  };

  TOP_LEVEL_IGNITE_ALIAS_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(person, key)) return;
    updateData[key] = nextIgnitePersonNumber;
  });

  const existingExternalIds = isPlainObject(person.externalIds)
    ? { ...person.externalIds }
    : {};
  const hasExternalIgniteAlias = EXTERNAL_IGNITE_ALIAS_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(existingExternalIds, key),
  );

  if (nextIgnitePersonNumber || hasExternalIgniteAlias) {
    const nextExternalIds = { ...existingExternalIds };
    if (nextIgnitePersonNumber) {
      nextExternalIds.ignitePersonNumber = nextIgnitePersonNumber;
      nextExternalIds.personNumber = nextIgnitePersonNumber;
      EXTERNAL_IGNITE_ALIAS_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(existingExternalIds, key)) {
          nextExternalIds[key] = nextIgnitePersonNumber;
        }
      });
    } else {
      EXTERNAL_IGNITE_ALIAS_KEYS.forEach((key) => {
        delete nextExternalIds[key];
      });
    }
    updateData.externalIds = nextExternalIds;
  }

  return updateData;
};

const normalizeNameKey = (value) =>
  value === undefined || value === null
    ? ""
    : String(value).trim().toLowerCase().replace(/\s+/g, " ");

const getPersonNameKeys = (person = {}) => {
  const keys = new Set();
  const firstName = person.firstName || "";
  const lastName = person.lastName || "";
  [
    person.name,
    `${firstName} ${lastName}`,
    `${lastName}, ${firstName}`,
  ].forEach((value) => {
    const key = normalizeNameKey(value);
    if (key) keys.add(key);
  });
  return keys;
};

const splitInstructorNameText = (value) => {
  if (!value || typeof value !== "string") return [];
  return value
    .split(/\s*(?:;|\n|\s+\/\s+|\s+and\s+|\s+&\s+)\s*/i)
    .map((name) => name.trim())
    .filter((name) => name && name.toLowerCase() !== "unassigned");
};

const getScheduleInstructorNames = (schedule = {}) => {
  const names = new Set();
  const addName = (value) => {
    splitInstructorNameText(value).forEach((name) => names.add(name));
  };

  if (Array.isArray(schedule.instructorNames)) {
    schedule.instructorNames.forEach(addName);
  }
  addName(schedule.instructorName);
  addName(schedule.Instructor);
  return Array.from(names);
};

const getScheduleInstructorIds = (schedule = {}) => {
  const ids = new Set();
  const addId = (value) => {
    if (value) ids.add(String(value));
  };

  if (Array.isArray(schedule.instructorIds)) {
    schedule.instructorIds.forEach(addId);
  }
  addId(schedule.instructorId);
  addId(schedule.InstructorId);

  if (Array.isArray(schedule.instructorAssignments)) {
    schedule.instructorAssignments.forEach((assignment) => {
      addId(assignment?.personId || assignment?.instructorId || assignment?.id);
    });
  }

  return Array.from(ids);
};

const getScheduleSectionIdentity = (schedule = {}) => {
  if (schedule._originalId || schedule.id) return schedule._originalId || schedule.id;
  return [
    schedule.termCode || schedule.TermCode || schedule.term || schedule.Term || "",
    schedule.courseCode || schedule.Course || "",
    schedule.section || schedule.Section || schedule.sectionNumber || "",
    schedule.crn || schedule.CRN || "",
  ]
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("|");
};

export const buildPAFCoursesByInstructorId = (
  scheduleData = [],
  people = [],
) => {
  const coursesByInstructorId = new Map();
  if (!Array.isArray(scheduleData)) return coursesByInstructorId;

  const personIdByName = new Map();
  (Array.isArray(people) ? people : []).forEach((person) => {
    if (!person?.id) return;
    getPersonNameKeys(person).forEach((nameKey) => {
      if (!personIdByName.has(nameKey)) {
        personIdByName.set(nameKey, person.id);
      }
    });
  });

  const seenSections = new Set();
  scheduleData.forEach((schedule) => {
    if (!schedule) return;
    const sectionIdentity = getScheduleSectionIdentity(schedule);
    if (sectionIdentity) {
      if (seenSections.has(sectionIdentity)) return;
      seenSections.add(sectionIdentity);
    }

    const instructorIds = new Set(getScheduleInstructorIds(schedule));
    getScheduleInstructorNames(schedule).forEach((name) => {
      const personId = personIdByName.get(normalizeNameKey(name));
      if (personId) instructorIds.add(personId);
    });

    instructorIds.forEach((instructorId) => {
      if (!coursesByInstructorId.has(instructorId)) {
        coursesByInstructorId.set(instructorId, []);
      }
      coursesByInstructorId.get(instructorId).push(schedule);
    });
  });

  return coursesByInstructorId;
};

/**
 * Copy text to clipboard with fallback for older browsers
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Whether copy was successful
 */
export const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return success;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    return false;
  }
};
