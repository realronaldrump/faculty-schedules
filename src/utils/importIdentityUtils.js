import {
  standardizeCourseCode,
  standardizeRoomName,
  standardizeTerm,
} from "./hygieneCore";
import { normalizeSectionNumber, generateSectionId } from "./canonicalSchema";
import { termCodeFromLabel } from "./termUtils";
import { normalizeTime } from "./meetingPatternUtils";

const normalizeString = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const normalizeCrn = (value) => {
  const digits = normalizeString(value).replace(/\D/g, "");
  return /^\d{5,6}$/.test(digits) ? digits : "";
};

const normalizeClssId = (value) => normalizeString(value);

const normalizeCourseCode = (value) => standardizeCourseCode(value);

const normalizeKeyPart = (value) => {
  const cleaned = normalizeString(value);
  if (!cleaned) return "";
  return cleaned.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
};

const normalizeTermParts = ({ term, termCode }) => {
  const normalizedTerm = standardizeTerm(term);
  const resolvedTermCode = termCodeFromLabel(
    termCode || normalizedTerm || term || "",
  );
  const termKey = resolvedTermCode || normalizedTerm || normalizeString(term);

  return {
    term: normalizedTerm || normalizeString(term),
    termCode: resolvedTermCode || "",
    termKey,
  };
};

const identityStrength = (key) => {
  if (!key) return 0;
  if (key.startsWith("clss:")) return 4;
  if (key.startsWith("crn:")) return 3;
  if (key.startsWith("section:")) return 2;
  if (key.startsWith("composite:")) return 1;
  return 0;
};

const schedulePreferenceScore = (schedule = {}) => {
  let score = 0;
  const identityKey = schedule.identityKey || "";
  score += identityStrength(identityKey) * 10;
  if (Array.isArray(schedule.identityKeys) && schedule.identityKeys.length > 0) {
    score += 4;
  }
  if ((schedule.id || "").startsWith("sched_")) {
    score += 3;
  }
  if (schedule.clssId || schedule.externalIds?.clssId) {
    score += 2;
  }
  if (schedule.crn) {
    score += 1;
  }
  return score;
};

const choosePreferredSchedule = (a, b) => {
  const scoreA = schedulePreferenceScore(a);
  const scoreB = schedulePreferenceScore(b);
  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
  const idA = a?.id || "";
  const idB = b?.id || "";
  if (!idA && idB) return b;
  if (!idB && idA) return a;
  return idA.localeCompare(idB) <= 0 ? a : b;
};

const buildMeetingPatternKey = (patterns = []) => {
  if (!Array.isArray(patterns) || patterns.length === 0) return "";

  const normalized = patterns.map((pattern) => {
    const day = normalizeString(pattern?.day).toUpperCase();
    const start = normalizeTime(pattern?.startTime || "");
    const end = normalizeTime(pattern?.endTime || "");
    const raw = normalizeString(pattern?.raw || "");
    return { day, start, end, raw };
  });

  normalized.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end) ||
      a.raw.localeCompare(b.raw),
  );

  return normalized
    .map((pattern) =>
      [pattern.day, pattern.start, pattern.end, pattern.raw]
        .filter(Boolean)
        .join("|"),
    )
    .join("~");
};

const buildRoomKey = ({ spaceIds = [], roomNames = [] } = {}) => {
  const normalizedSpaceIds = Array.isArray(spaceIds)
    ? spaceIds.map(normalizeKeyPart).filter(Boolean)
    : [];
  if (normalizedSpaceIds.length > 0) {
    return normalizedSpaceIds.sort().join("|");
  }

  const names = Array.isArray(roomNames) ? roomNames : [roomNames];
  const normalizedNames = names
    .map((name) => standardizeRoomName(name))
    .map((name) => normalizeString(name).toLowerCase())
    .filter(Boolean)
    .sort();

  return normalizedNames.join("|");
};

const buildCompositeKey = ({
  courseCode,
  termKey,
  meetingPatterns,
  spaceIds,
  roomNames,
}) => {
  const courseKey = normalizeKeyPart(normalizeCourseCode(courseCode)).toUpperCase();
  const termPart = normalizeKeyPart(termKey);
  const meetingKey = normalizeKeyPart(buildMeetingPatternKey(meetingPatterns));
  const roomKey = normalizeKeyPart(buildRoomKey({ spaceIds, roomNames }));

  if (!courseKey || !termPart || !meetingKey || !roomKey) return "";
  return `composite:${courseKey}:${termPart}:${meetingKey}:${roomKey}`;
};

export const deriveScheduleIdentity = ({
  courseCode,
  section,
  sectionNumber,
  term,
  termCode,
  clssId,
  crn,
  meetingPatterns,
  spaceIds,
  roomNames,
} = {}) => {
  const normalizedCourseCode = normalizeCourseCode(courseCode);
  const normalizedSection = normalizeSectionNumber(section || sectionNumber);
  const { term: normalizedTerm, termCode: normalizedTermCode, termKey } =
    normalizeTermParts({ term, termCode });
  const normalizedClssId = normalizeClssId(clssId);
  const normalizedCrn = normalizeCrn(crn);

  const sectionId = generateSectionId({
    termCode: normalizedTermCode || termKey,
    courseCode: normalizedCourseCode,
    sectionNumber: normalizedSection,
  });

  const identityKeys = [];

  if (normalizedClssId) {
    identityKeys.push(
      `clss:${normalizeKeyPart(termKey)}:${normalizeKeyPart(normalizedClssId)}`,
    );
  }
  if (normalizedCrn) {
    identityKeys.push(
      `crn:${normalizeKeyPart(termKey)}:${normalizeKeyPart(normalizedCrn)}`,
    );
  }
  if (sectionId) {
    identityKeys.push(`section:${normalizeKeyPart(sectionId)}`);
  }

  const compositeKey = buildCompositeKey({
    courseCode: normalizedCourseCode,
    termKey,
    meetingPatterns,
    spaceIds,
    roomNames,
  });
  if (compositeKey) {
    identityKeys.push(compositeKey);
  }

  const primaryKey = identityKeys[0] || "";

  return {
    primaryKey,
    keys: identityKeys,
    source: primaryKey ? primaryKey.split(":")[0] : "",
    components: {
      term: normalizedTerm,
      termCode: normalizedTermCode,
      termKey,
      courseCode: normalizedCourseCode,
      sectionNumber: normalizedSection,
      clssId: normalizedClssId,
      crn: normalizedCrn,
      compositeKey,
      sectionId,
    },
  };
};

export const deriveScheduleIdentityFromSchedule = (schedule = {}) => {
  const roomNames =
    (Array.isArray(schedule.spaceDisplayNames) &&
      schedule.spaceDisplayNames.length > 0 &&
      schedule.spaceDisplayNames) ||
    (Array.isArray(schedule.roomNames) && schedule.roomNames) ||
    (schedule.roomName ? [schedule.roomName] : []);

  return deriveScheduleIdentity({
    courseCode: schedule.courseCode || schedule.Course || "",
    section: schedule.section || schedule.sectionNumber || "",
    term: schedule.term || schedule.Term || "",
    termCode: schedule.termCode || schedule.TermCode || "",
    clssId:
      schedule.clssId ||
      schedule.clss_id ||
      schedule.externalIds?.clssId ||
      "",
    crn: schedule.crn || "",
    meetingPatterns: Array.isArray(schedule.meetingPatterns)
      ? schedule.meetingPatterns
      : [],
    spaceIds: Array.isArray(schedule.spaceIds) ? schedule.spaceIds : [],
    roomNames,
  });
};

export const buildScheduleIdentityIndex = (schedules = []) => {
  const index = new Map();
  const collisions = [];

  schedules.forEach((schedule) => {
    const identity = deriveScheduleIdentityFromSchedule(schedule);
    const storedKeys = Array.isArray(schedule.identityKeys)
      ? schedule.identityKeys
      : [];
    const allKeys = Array.from(
      new Set([
        ...identity.keys,
        ...(schedule.identityKey ? [schedule.identityKey] : []),
        ...storedKeys,
      ]),
    );
    allKeys.forEach((key) => {
      if (!key) return;
      if (index.has(key)) {
        const existingEntry = index.get(key);
        const preferred = choosePreferredSchedule(existingEntry?.schedule, schedule);
        collisions.push({
          key,
          existing: existingEntry?.schedule,
          incoming: schedule,
          preferred: preferred?.id || "",
        });
        if (preferred === schedule) {
          index.set(key, { schedule, identity });
        }
      } else {
        index.set(key, { schedule, identity });
      }
    });
  });

  return { index, collisions };
};

export const resolveScheduleIdentityMatch = (identityKeys, index) => {
  if (!Array.isArray(identityKeys) || identityKeys.length === 0) {
    return { schedule: null, matchedKey: null };
  }
  for (const key of identityKeys) {
    if (index.has(key)) {
      return { schedule: index.get(key).schedule, matchedKey: key };
    }
  }
  return { schedule: null, matchedKey: null };
};

export const buildScheduleDocId = (identity) => {
  const primaryKey = identity?.primaryKey || "";
  if (!primaryKey) return "";
  return `sched_${primaryKey.replace(/[^A-Za-z0-9_-]+/g, "_")}`;
};
