import { parseFullName } from "./nameUtils";
import { normalizeTermLabel, termCodeFromLabel } from "./termUtils";
import {
  generateSectionId,
  normalizeSectionNumber,
  areSameSectionIdentity,
  areSamePersonIdentity,
} from "./canonicalSchema";

// ---------------------------------------------------------------------------
// CANONICAL PERSON SHAPE
// ---------------------------------------------------------------------------

export const DEFAULT_PERSON_SCHEMA = {
  firstName: "",
  lastName: "",
  name: "",
  title: "",
  email: "",
  phone: "",
  jobTitle: "",
  supervisor: "",
  hourlyRate: "",
  department: "",
  office: "",
  roles: [],
  jobs: [],
  weeklySchedule: [],
  primaryBuildings: [],
  primaryBuilding: "",
  semesterSchedules: {},
  // Employment status flags
  isAdjunct: false,
  isFullTime: true,
  isTenured: false,
  isUPD: false,
  // Relational references
  programId: null,
  // Identity helpers
  baylorId: "",
  externalIds: {
    clssInstructorId: null,
    baylorId: null,
    emails: [],
  },
  // Data-quality helpers
  hasNoPhone: false,
  hasNoOffice: false,
  // Basic activity flag so we can "disable" a record without deleting it
  isActive: true,
  // Employment dates (used primarily for student workers)
  startDate: "",
  endDate: "",
  // Timestamps
  createdAt: "",
  updatedAt: "",
};

const cloneDefaultValue = (value) => {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
};

const normalizeString = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const normalizeEmail = (email) => normalizeString(email).toLowerCase();

export const standardizePhone = (phone) => {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
};

const standardizeBaylorId = (baylorId) => {
  if (!baylorId) return "";
  return String(baylorId).replace(/\D/g, "");
};

export const standardizeCourseCode = (courseCode) => {
  if (!courseCode) return "";
  const clean = String(courseCode).trim().toUpperCase();
  return clean.replace(/([A-Z]+)(\d+)/, "$1 $2");
};

export const standardizeTerm = (term) => {
  if (!term) return "";
  const clean = String(term).trim();
  return normalizeTermLabel(clean) || clean;
};

export const standardizeRoomName = (roomName) => {
  if (!roomName) return "";
  return String(roomName).trim();
};

const normalizeRoles = (roles) => {
  if (Array.isArray(roles)) return roles.filter(Boolean);
  if (roles && typeof roles === "object") {
    return Object.keys(roles).filter((key) => roles[key]);
  }
  return [];
};

const normalizeBuildings = (value) => {
  if (Array.isArray(value)) {
    return value.map((b) => normalizeString(b)).filter(Boolean);
  }
  if (value) return [normalizeString(value)];
  return [];
};

const normalizeExternalIds = (externalIds, { email, baylorId } = {}) => {
  const base =
    externalIds && typeof externalIds === "object" ? { ...externalIds } : {};
  const emails = new Set(
    Array.isArray(base.emails)
      ? base.emails.map((e) => normalizeEmail(e)).filter(Boolean)
      : [],
  );
  if (email) emails.add(normalizeEmail(email));

  const normalized = {
    ...base,
  };

  if (emails.size > 0) normalized.emails = Array.from(emails);
  if (!normalized.clssInstructorId) normalized.clssInstructorId = null;
  if (baylorId && !normalized.baylorId) normalized.baylorId = baylorId;

  return normalized;
};

// ---------------------------------------------------------------------------
// STANDARDIZATION
// ---------------------------------------------------------------------------

export const standardizePerson = (person = {}, options = {}) => {
  const { pruneUnknown = false, updateTimestamp = true } = options;
  const source = person || {};

  let firstName = normalizeString(source.firstName);
  let lastName = normalizeString(source.lastName);
  let fullName = normalizeString(source.name);
  let title = normalizeString(source.title);

  if (fullName && !firstName && !lastName) {
    const parsed = parseFullName(fullName);
    firstName = parsed.firstName || firstName;
    lastName = parsed.lastName || lastName;
    if (!title && parsed.title) title = parsed.title;
  }

  if (firstName || lastName) {
    fullName = `${firstName} ${lastName}`.trim();
  }

  const email = normalizeEmail(source.email);
  const phone = standardizePhone(source.phone);
  const baylorId = standardizeBaylorId(source.baylorId);

  const primaryBuildings = normalizeBuildings(
    source.primaryBuildings && source.primaryBuildings.length > 0
      ? source.primaryBuildings
      : source.primaryBuilding,
  );

  const standardized = {
    ...source,
    firstName,
    lastName,
    name: fullName,
    title: title,
    email,
    phone,
    jobTitle: normalizeString(source.jobTitle),
    supervisor: normalizeString(source.supervisor),
    hourlyRate: normalizeString(source.hourlyRate),
    department: normalizeString(source.department),
    office: normalizeString(source.office),
    roles: normalizeRoles(source.roles),
    primaryBuildings,
    primaryBuilding:
      normalizeString(source.primaryBuilding) || primaryBuildings[0] || "",
    weeklySchedule: Array.isArray(source.weeklySchedule)
      ? source.weeklySchedule
      : [],
    baylorId,
    externalIds: normalizeExternalIds(source.externalIds, { email, baylorId }),
    updatedAt: updateTimestamp ? new Date().toISOString() : source.updatedAt,
  };

  const isStudentOnly =
    standardized.roles.includes("student") &&
    !standardized.roles.some((role) => role !== "student");
  if (isStudentOnly) {
    standardized.hasNoOffice = true;
    standardized.office = "";
  }

  if (!standardized.firstName && !standardized.lastName && !standardized.name) {
    delete standardized.name;
  }

  Object.entries(DEFAULT_PERSON_SCHEMA).forEach(([key, defaultValue]) => {
    if (standardized[key] === undefined) {
      standardized[key] = cloneDefaultValue(defaultValue);
    }
  });

  if (standardized.isAdjunct) {
    standardized.isTenured = false;
  }

  if (pruneUnknown) {
    Object.keys(standardized).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_PERSON_SCHEMA, key)) {
        delete standardized[key];
      }
    });
  }

  return standardized;
};

export const standardizeSchedule = (schedule = {}) => {
  const normalizedTerm = standardizeTerm(schedule.term);
  const resolvedTermCode = termCodeFromLabel(
    schedule.termCode || normalizedTerm || schedule.term || "",
  );

  return {
    ...schedule,
    courseCode: standardizeCourseCode(schedule.courseCode),
    courseTitle: normalizeString(schedule.courseTitle),
    section: normalizeString(schedule.section),
    crn: normalizeString(schedule.crn),
    term: normalizedTerm,
    termCode: resolvedTermCode || "",
    instructorName: normalizeString(schedule.instructorName),
    status: normalizeString(schedule.status || "Active"),
    scheduleType: normalizeString(schedule.scheduleType || "Class Instruction"),
    instructionMethod: normalizeString(schedule.instructionMethod),
    updatedAt: new Date().toISOString(),
    ...(() => {
    const normalizeRoomlessLabel = (value) => {
      const upper = normalizeString(value).toUpperCase();
      return (
        upper === "NO ROOM NEEDED" ||
        upper.includes("ONLINE") ||
        upper.includes("VIRTUAL") ||
        upper.includes("ZOOM")
      );
    };

    const baseRoomNames = Array.isArray(schedule.roomNames)
      ? schedule.roomNames.map(standardizeRoomName).filter(Boolean)
      : schedule.roomName
        ? [standardizeRoomName(schedule.roomName)]
        : [];
    const baseRoomName = standardizeRoomName(schedule.roomName);
    const hasRoomlessLabel =
      normalizeRoomlessLabel(baseRoomName) ||
      baseRoomNames.some((name) => normalizeRoomlessLabel(name));
    const locationType =
      schedule.locationType === "no_room" ||
      (schedule.isOnline && baseRoomNames.length === 0 && !baseRoomName) ||
      hasRoomlessLabel
        ? "no_room"
        : "room";
    const locationLabel =
      locationType === "no_room"
        ? normalizeString(schedule.locationLabel) || "No Room Needed"
        : normalizeString(schedule.locationLabel);
    const roomNames =
      locationType === "no_room"
        ? []
        : baseRoomNames.filter((name) => !normalizeRoomlessLabel(name));
    const roomName = locationType === "no_room" ? "" : baseRoomName;

    const baseAssignments = Array.isArray(schedule.instructorAssignments)
      ? schedule.instructorAssignments
      : [];
    let instructorAssignments = baseAssignments
      .map((assignment) => ({
        ...assignment,
        personId:
          assignment?.personId || assignment?.instructorId || assignment?.id,
      }))
      .filter((assignment) => assignment.personId);
    if (instructorAssignments.length === 0 && schedule.instructorId) {
      instructorAssignments = [
        { personId: schedule.instructorId, isPrimary: true, percentage: 100 },
      ];
    }
    if (
      instructorAssignments.length > 0 &&
      !instructorAssignments.some((assignment) => assignment.isPrimary)
    ) {
      instructorAssignments[0].isPrimary = true;
    }
    const primaryAssignment =
      instructorAssignments.find((assignment) => assignment.isPrimary) ||
      instructorAssignments[0];
    const instructorIds = Array.from(
      new Set([
        ...(Array.isArray(schedule.instructorIds) ? schedule.instructorIds : []),
        schedule.instructorId,
        ...instructorAssignments.map((assignment) => assignment.personId),
      ]),
    ).filter(Boolean);
    const instructorId =
      schedule.instructorId || primaryAssignment?.personId || "";

    return {
      roomNames,
      roomName,
      locationType,
      locationLabel,
      instructorAssignments,
      instructorIds,
      instructorId,
    };
  })(),
  };
};

export const standardizeRoom = (room = {}) => ({
  ...room,
  name: normalizeString(room.name),
  displayName: normalizeString(room.displayName),
  building: normalizeString(room.building),
  roomNumber: normalizeString(room.roomNumber),
  type: normalizeString(room.type || "Classroom"),
  updatedAt: new Date().toISOString(),
});

// ---------------------------------------------------------------------------
// DUPLICATE DETECTION
// ---------------------------------------------------------------------------

const getPairKey = (a, b) => {
  const left = String(a);
  const right = String(b);
  return left < right ? `${left}__${right}` : `${right}__${left}`;
};

const scorePersonCompleteness = (person = {}) => {
  const fields = [
    "firstName",
    "lastName",
    "name",
    "title",
    "email",
    "phone",
    "jobTitle",
    "supervisor",
    "hourlyRate",
    "department",
    "office",
    "roles",
    "programId",
    "baylorId",
    "externalIds",
    "jobs",
    "primaryBuildings",
    "primaryBuilding",
    "weeklySchedule",
  ];

  return fields.reduce((score, key) => {
    const value = person[key];
    if (Array.isArray(value)) return value.length > 0 ? score + 1 : score;
    if (value && typeof value === "object")
      return Object.keys(value).length > 0 ? score + 1 : score;
    if (typeof value === "string")
      return value.trim() !== "" ? score + 1 : score;
    if (value !== null && value !== undefined) return score + 1;
    return score;
  }, 0);
};

const scoreScheduleCompleteness = (schedule = {}) => {
  const fields = [
    "courseCode",
    "section",
    "crn",
    "term",
    "instructorId",
    "instructorName",
    "courseTitle",
    "meetingPatterns",
    "roomIds",
    "roomNames",
    "roomName",
  ];

  return fields.reduce((score, key) => {
    const value = schedule[key];
    if (Array.isArray(value)) return value.length > 0 ? score + 1 : score;
    if (value && typeof value === "object")
      return Object.keys(value).length > 0 ? score + 1 : score;
    if (typeof value === "string")
      return value.trim() !== "" ? score + 1 : score;
    if (value !== null && value !== undefined) return score + 1;
    return score;
  }, 0);
};

const scoreRoomCompleteness = (room = {}) => {
  const fields = ["name", "displayName", "building", "roomNumber", "capacity"];
  return fields.reduce((score, key) => {
    const value = room[key];
    if (typeof value === "string")
      return value.trim() !== "" ? score + 1 : score;
    if (value !== null && value !== undefined) return score + 1;
    return score;
  }, 0);
};

const pickPrimaryByScore = (a, b, scoreFn) => {
  const aScore = scoreFn(a);
  const bScore = scoreFn(b);
  if (aScore > bScore) return { primary: a, secondary: b };
  if (bScore > aScore) return { primary: b, secondary: a };

  const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
  const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
  if (aTime >= bTime) return { primary: a, secondary: b };
  return { primary: b, secondary: a };
};

const buildDuplicateRecord = ({
  type,
  confidence,
  records,
  reason,
  mergeStrategy,
}) => ({
  type,
  confidence,
  records,
  reason,
  mergeStrategy,
});

const calculateFuzzyNameSimilarity = (fullName1, fullName2) => {
  if (!fullName1 || !fullName2) return 0;

  const normalize = (name) => {
    return name
      .toLowerCase()
      .replace(/\b[a-z]\.\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const n1 = normalize(fullName1);
  const n2 = normalize(fullName2);

  if (n1 === n2) return 1.0;

  const parts1 = n1.split(" ");
  const parts2 = n2.split(" ");

  if (parts1.length !== parts2.length) {
    if (Math.abs(parts1.length - parts2.length) === 1) {
      const longer = parts1.length > parts2.length ? parts1 : parts2;
      const shorter = parts1.length < parts2.length ? parts1 : parts2;

      const longerWithoutMiddle = [longer[0], longer[longer.length - 1]];
      if (
        longerWithoutMiddle[0] === shorter[0] &&
        longerWithoutMiddle[1] === shorter[1]
      ) {
        return 0.95;
      }
    }
    return 0;
  }

  let totalSimilarity = 0;
  for (let i = 0; i < parts1.length; i++) {
    totalSimilarity += calculatePartSimilarity(parts1[i], parts2[i]);
  }

  return totalSimilarity / parts1.length;
};

const calculatePartSimilarity = (part1, part2) => {
  if (!part1 || !part2) return 0;

  const p1 = part1.toLowerCase().trim();
  const p2 = part2.toLowerCase().trim();

  if (p1 === p2) return 1;

  const nicknames = {
    bob: "robert",
    bobby: "robert",
    rob: "robert",
    robbie: "robert",
    bill: "william",
    billy: "william",
    will: "william",
    willie: "william",
    jim: "james",
    jimmy: "james",
    jamie: "james",
    mike: "michael",
    mickey: "michael",
    mick: "michael",
    dave: "david",
    davey: "david",
    steve: "steven",
    stevie: "steven",
    chris: "christopher",
    matt: "matthew",
    dan: "daniel",
    danny: "daniel",
    tom: "thomas",
    tommy: "thomas",
    joe: "joseph",
    joey: "joseph",
    tony: "anthony",
    nick: "nicholas",
    andy: "andrew",
    alex: "alexander",
    liz: "elizabeth",
    beth: "elizabeth",
    betty: "elizabeth",
    sue: "susan",
    susie: "susan",
    katie: "katherine",
    kate: "katherine",
    kathy: "katherine",
    patty: "patricia",
    pat: "patricia",
    trish: "patricia",
  };

  if (nicknames[p1] === p2 || nicknames[p2] === p1) return 0.95;
  if (Object.values(nicknames).includes(p1) && nicknames[p2] === p1)
    return 0.95;
  if (Object.values(nicknames).includes(p2) && nicknames[p1] === p2)
    return 0.95;

  if (p1.startsWith(p2) || p2.startsWith(p1)) {
    const minLength = Math.min(p1.length, p2.length);
    const maxLength = Math.max(p1.length, p2.length);
    return (minLength / maxLength) * 0.9;
  }

  const maxLen = Math.max(p1.length, p2.length);
  let matches = 0;
  for (let i = 0; i < Math.min(p1.length, p2.length); i++) {
    if (p1[i] === p2[i]) matches++;
  }

  return matches / maxLen;
};

export const detectPeopleDuplicates = (people = [], options = {}) => {
  const blockedPairs =
    options.blockedPairs instanceof Set ? options.blockedPairs : new Set();
  const duplicatesByPair = new Map();
  const baylorIdMap = new Map();
  const clssIdMap = new Map();
  const emailMap = new Map();
  const phoneMap = new Map();
  const nameMap = new Map();

  const addDuplicate = (personA, personB, metadata) => {
    if (!personA?.id || !personB?.id) return;
    const { primary, secondary } = pickPrimaryByScore(
      personA,
      personB,
      scorePersonCompleteness,
    );
    const key = getPairKey(primary.id, secondary.id);
    if (blockedPairs.has(key)) return;
    const existing = duplicatesByPair.get(key);
    if (!existing || metadata.confidence > existing.confidence) {
      duplicatesByPair.set(
        key,
        buildDuplicateRecord({
          ...metadata,
          records: [primary, secondary],
          mergeStrategy: "merge_people",
        }),
      );
    }
  };

  people.forEach((person) => {
    const baylorId = standardizeBaylorId(
      person.baylorId || person.externalIds?.baylorId,
    );
    if (baylorId && baylorId.length >= 9) {
      if (baylorIdMap.has(baylorId)) {
        const existing = baylorIdMap.get(baylorId);
        addDuplicate(existing, person, {
          type: "baylorId",
          confidence: 1.0,
          reason: "Identical Baylor ID",
        });
        const { primary } = pickPrimaryByScore(
          existing,
          person,
          scorePersonCompleteness,
        );
        baylorIdMap.set(baylorId, primary);
      } else {
        baylorIdMap.set(baylorId, person);
      }
    }

    const clssInstructorId = person.externalIds?.clssInstructorId;
    if (clssInstructorId) {
      const clssKey = String(clssInstructorId).trim();
      if (clssKey) {
        if (clssIdMap.has(clssKey)) {
          const existing = clssIdMap.get(clssKey);
          addDuplicate(existing, person, {
            type: "clssInstructorId",
            confidence: 1.0,
            reason: "Identical CLSS instructor ID",
          });
          const { primary } = pickPrimaryByScore(
            existing,
            person,
            scorePersonCompleteness,
          );
          clssIdMap.set(clssKey, primary);
        } else {
          clssIdMap.set(clssKey, person);
        }
      }
    }

    const email = normalizeEmail(person.email);
    if (email) {
      if (emailMap.has(email)) {
        const existing = emailMap.get(email);
        addDuplicate(existing, person, {
          type: "email",
          confidence: 1.0,
          reason: "Identical email address",
        });
        const { primary } = pickPrimaryByScore(
          existing,
          person,
          scorePersonCompleteness,
        );
        emailMap.set(email, primary);
      } else {
        emailMap.set(email, person);
      }
    }

    const phone = standardizePhone(person.phone);
    if (phone && phone.length >= 10) {
      if (phoneMap.has(phone)) {
        const existing = phoneMap.get(phone);
        addDuplicate(existing, person, {
          type: "phone",
          confidence: 0.9,
          reason: "Identical phone number",
        });
        const { primary } = pickPrimaryByScore(
          existing,
          person,
          scorePersonCompleteness,
        );
        phoneMap.set(phone, primary);
      } else {
        phoneMap.set(phone, person);
      }
    }

    const nameData = (() => {
      let firstName = normalizeString(person.firstName);
      let lastName = normalizeString(person.lastName);
      let fullName = normalizeString(person.name);
      if (fullName && !firstName && !lastName) {
        const parsed = parseFullName(fullName);
        firstName = parsed.firstName || firstName;
        lastName = parsed.lastName || lastName;
      }
      if (firstName || lastName) fullName = `${firstName} ${lastName}`.trim();
      return { firstName, lastName, fullName };
    })();

    if (nameData.firstName && nameData.lastName) {
      const normalizedFullName = `${nameData.firstName.toLowerCase().trim()} ${nameData.lastName.toLowerCase().trim()}`;
      if (nameMap.has(normalizedFullName)) {
        const existing = nameMap.get(normalizedFullName);
        addDuplicate(existing, person, {
          type: "name",
          confidence: 1.0,
          reason: "Identical first and last name",
        });
        const { primary } = pickPrimaryByScore(
          existing,
          person,
          scorePersonCompleteness,
        );
        nameMap.set(normalizedFullName, primary);
      } else {
        nameMap.set(normalizedFullName, person);
        for (const [existingFullName, existingPerson] of nameMap.entries()) {
          if (existingFullName === normalizedFullName) continue;
          const similarity = calculateFuzzyNameSimilarity(
            normalizedFullName,
            existingFullName,
          );
          if (similarity >= 0.85) {
            addDuplicate(existingPerson, person, {
              type: "fuzzy_name",
              confidence: similarity,
              reason: `Very similar names (${Math.round(similarity * 100)}% match)`,
            });
            const { primary } = pickPrimaryByScore(
              existingPerson,
              person,
              scorePersonCompleteness,
            );
            nameMap.set(existingFullName, primary);
            break;
          }
        }
      }
    }
  });

  return Array.from(duplicatesByPair.values());
};

export const detectScheduleDuplicates = (schedules = [], options = {}) => {
  const blockedPairs =
    options.blockedPairs instanceof Set ? options.blockedPairs : new Set();
  const duplicatesByPair = new Map();
  const seenByCanonicalId = new Map();
  const seenByCrnTerm = new Map();
  const seenByComposite = new Map();

  const normalize = (v) => normalizeString(v).toLowerCase();
  const parseCrnFromSection = (section) => {
    if (!section) return null;
    const m = String(section).match(/\b(\d{5,6})\b/);
    return m ? m[1] : null;
  };
  const getEffectiveCrn = (schedule) => {
    const crnFromField = normalizeString(schedule.crn);
    const crnFromSection = parseCrnFromSection(schedule.section);
    if (/^\d{5,6}$/.test(crnFromField)) {
      if (crnFromSection && crnFromSection !== crnFromField) {
        return crnFromSection;
      }
      return crnFromField;
    }
    return crnFromSection || "";
  };

  const toMeetingKey = (patterns) => {
    if (!Array.isArray(patterns) || patterns.length === 0) return "";
    const norm = patterns.map((p) => ({
      d: normalizeString(p?.day).toUpperCase(),
      s: normalizeString(p?.startTime),
      e: normalizeString(p?.endTime),
    }));
    norm.sort(
      (a, b) =>
        a.d.localeCompare(b.d) ||
        a.s.localeCompare(b.s) ||
        a.e.localeCompare(b.e),
    );
    return norm.map((p) => `${p.d}|${p.s}|${p.e}`).join("~");
  };

  const toRoomKey = (s) => {
    const names = Array.isArray(s?.roomNames)
      ? s.roomNames
      : s?.roomName
        ? [s.roomName]
        : [];
    if (!names || names.length === 0) return "";
    const cleaned = names
      .map((n) => normalizeString(n).toLowerCase())
      .filter(Boolean)
      .sort();
    return cleaned.join("|");
  };

  const buildCompositeKey = (s) => {
    const course = normalizeString(s.courseCode).toUpperCase();
    const termVal = normalizeString(s.term);
    const mp = toMeetingKey(s.meetingPatterns);
    const rm = toRoomKey(s);
    if (!course || !termVal || !mp || !rm) return "";
    return `${course}__${termVal}__${mp}__${rm}`;
  };

  const addDuplicate = (existing, schedule, metadata) => {
    if (!existing?.id || !schedule?.id) return;
    const { primary, secondary } = pickPrimaryByScore(
      existing,
      schedule,
      scoreScheduleCompleteness,
    );
    const pairKey = getPairKey(primary.id, secondary.id);
    if (blockedPairs.has(pairKey)) return;
    const candidate = buildDuplicateRecord({
      ...metadata,
      records: [primary, secondary],
      mergeStrategy: "merge_schedules",
    });
    const existingDuplicate = duplicatesByPair.get(pairKey);
    if (
      !existingDuplicate ||
      candidate.confidence > existingDuplicate.confidence
    ) {
      duplicatesByPair.set(pairKey, candidate);
    }
  };

  schedules.forEach((schedule) => {
    const crn = getEffectiveCrn(schedule);
    const term = normalizeString(schedule.term);
    const hasRealCrn = crn !== "" && /^(\d{5,6})$/.test(crn);

    // 1. CRN-based duplicate detection (CRN is unique per term)
    if (hasRealCrn && term) {
      const crnKey = `${crn}__${term}`;
      if (seenByCrnTerm.has(crnKey)) {
        const existing = seenByCrnTerm.get(crnKey);
        if (existing.id !== schedule.id) {
          addDuplicate(existing, schedule, {
            type: "crn",
            confidence: 1.0,
            reason: "Duplicate CRN within the same semester",
          });
        }
      } else {
        seenByCrnTerm.set(crnKey, schedule);
      }
    }

    // 2. Canonical section identity: courseCode + sectionNumber + termCode
    //    This is the PRIMARY identity - two records with same identity are duplicates
    //    IMPORTANT: Different instructors do NOT make sections different
    //    Example: ID 4433 Section 01 Spring 2026 is ONE section, regardless of instructor
    const termCode = schedule.termCode || termCodeFromLabel(term) || term;
    const sectionNumber = normalizeSectionNumber(schedule.section);
    const canonicalId = generateSectionId({
      termCode,
      courseCode: schedule.courseCode,
      sectionNumber,
    });

    if (canonicalId) {
      if (seenByCanonicalId.has(canonicalId)) {
        const existing = seenByCanonicalId.get(canonicalId);
        if (existing.id !== schedule.id) {
          addDuplicate(existing, schedule, {
            type: "section_identity",
            confidence: 1.0,
            reason: "Same section identity (course + section + semester)",
          });
        }
      } else {
        seenByCanonicalId.set(canonicalId, schedule);
      }
    }

    // 3. Composite key for additional detection (same course, term, time, room)
    //    This catches cases where section number might differ but it's actually the same offering
    const compositeKey = buildCompositeKey(schedule);
    if (compositeKey) {
      if (seenByComposite.has(compositeKey)) {
        const existing = seenByComposite.get(compositeKey);
        if (existing.id !== schedule.id) {
          addDuplicate(existing, schedule, {
            type: "composite_meeting_room",
            confidence: 0.9,
            reason: "Identical course, semester, meeting time, and room(s)",
          });
        }
      } else {
        seenByComposite.set(compositeKey, schedule);
      }
    }
  });

  return Array.from(duplicatesByPair.values());
};

export const detectRoomDuplicates = (rooms = [], options = {}) => {
  const blockedPairs =
    options.blockedPairs instanceof Set ? options.blockedPairs : new Set();
  const duplicatesByPair = new Map();
  const roomMap = new Map();

  const addDuplicate = (existing, room, metadata) => {
    if (!existing?.id || !room?.id) return;
    const { primary, secondary } = pickPrimaryByScore(
      existing,
      room,
      scoreRoomCompleteness,
    );
    const pairKey = [primary.id, secondary.id].sort().join("__");
    if (blockedPairs.has(pairKey)) return;
    const candidate = buildDuplicateRecord({
      ...metadata,
      records: [primary, secondary],
      mergeStrategy: "merge_rooms",
    });

    const existingDuplicate = duplicatesByPair.get(pairKey);
    if (
      !existingDuplicate ||
      candidate.confidence > existingDuplicate.confidence
    ) {
      duplicatesByPair.set(pairKey, candidate);
    }
  };

  rooms.forEach((room) => {
    if (room.name || room.displayName) {
      const roomName = normalizeString(
        room.name || room.displayName,
      ).toLowerCase();
      if (roomMap.has(roomName)) {
        addDuplicate(roomMap.get(roomName), room, {
          type: "room_name",
          confidence: 1.0,
          reason: "Identical room name",
        });
      } else {
        roomMap.set(roomName, room);
      }
    }

    if (room.building && room.roomNumber) {
      const buildingRoomKey = `${normalizeString(room.building).toLowerCase()}-${normalizeString(room.roomNumber)}`;
      if (roomMap.has(buildingRoomKey)) {
        const existing = roomMap.get(buildingRoomKey);
        if (existing.id !== room.id) {
          addDuplicate(existing, room, {
            type: "building_room",
            confidence: 0.95,
            reason: "Same building and room number",
          });
        }
      } else {
        roomMap.set(buildingRoomKey, room);
      }
    }
  });

  return Array.from(duplicatesByPair.values());
};

export const detectCrossCollectionIssues = (
  people = [],
  schedules = [],
  rooms = [],
) => {
  const issues = [];

  const peopleIds = new Set(people.map((p) => p.id));
  const getScheduleInstructorIds = (schedule) => {
    const ids = new Set();
    if (schedule?.instructorId) ids.add(schedule.instructorId);
    if (Array.isArray(schedule?.instructorIds)) {
      schedule.instructorIds.forEach((id) => ids.add(id));
    }
    if (Array.isArray(schedule?.instructorAssignments)) {
      schedule.instructorAssignments.forEach((assignment) => {
        if (assignment?.personId) ids.add(assignment.personId);
      });
    }
    return Array.from(ids).filter(Boolean);
  };

  schedules.forEach((schedule) => {
    const instructorIds = getScheduleInstructorIds(schedule);
    if (instructorIds.length === 0) {
      issues.push({
        type: "orphaned_schedule",
        severity: "high",
        record: schedule,
        reason: "Schedule is missing instructor assignment",
        fix: "link_to_existing_instructor",
      });
      return;
    }

    const missingIds = instructorIds.filter((id) => !peopleIds.has(id));
    if (missingIds.length > 0) {
      issues.push({
        type: "orphaned_schedule",
        severity: "high",
        record: schedule,
        reason: "Schedule references non-existent instructor",
        missingInstructorIds: missingIds,
        fix: "link_to_existing_instructor",
      });
    }
  });

  const roomIds = new Set(rooms.map((r) => r.id));
  const spaceKeys = new Set(
    rooms
      .map((r) => r.spaceKey)
      .filter((key) => typeof key === "string" && key.trim().length > 0),
  );
  schedules.forEach((schedule) => {
    if (schedule?.locationType === "no_room") return;
    const spaceIds = Array.isArray(schedule.spaceIds)
      ? schedule.spaceIds.filter(Boolean)
      : [];
    if (spaceIds.length > 0) {
      spaceIds.forEach((spaceKey) => {
        if (spaceKey && !spaceKeys.has(spaceKey)) {
          issues.push({
            type: "orphaned_space",
            severity: "medium",
            record: schedule,
            reason: "Schedule references non-existent space",
            fix: "link_to_existing_room",
          });
        }
      });
      return;
    }

    const ids = Array.isArray(schedule.roomIds)
      ? schedule.roomIds
      : schedule.roomId
        ? [schedule.roomId]
        : [];
    ids.forEach((rid) => {
      if (rid && !roomIds.has(rid)) {
        issues.push({
          type: "orphaned_room",
          severity: "medium",
          record: schedule,
          reason: "Schedule references non-existent room",
          fix: "link_to_existing_room",
        });
      }
    });
  });

  return issues;
};

// ---------------------------------------------------------------------------
// MERGE HELPERS (PURE)
// ---------------------------------------------------------------------------

const stripId = (record) => {
  if (!record || typeof record !== "object") return {};
  const { id, ...rest } = record;
  return rest;
};

const mergeArrayValues = (primary, secondary) => {
  const primaryArr = Array.isArray(primary) ? primary : [];
  const secondaryArr = Array.isArray(secondary) ? secondary : [];
  if (primaryArr.length === 0) return secondaryArr;
  if (secondaryArr.length === 0) return primaryArr;

  const seen = new Set();
  const merged = [];
  const addItem = (item) => {
    const key =
      typeof item === "object" && item !== null
        ? JSON.stringify(item)
        : String(item);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };
  primaryArr.forEach(addItem);
  secondaryArr.forEach(addItem);
  return merged;
};

const mergeExternalIds = (primary, secondary) => {
  const base = normalizeExternalIds(primary);
  const fallback = normalizeExternalIds(secondary);

  const emails = mergeArrayValues(base.emails, fallback.emails);
  return {
    ...fallback,
    ...base,
    emails,
  };
};

export const mergePeopleData = (primary, secondary, fieldChoices = {}) => {
  const merged = { ...stripId(primary) };
  const secondaryData = stripId(secondary);

  Object.keys(DEFAULT_PERSON_SCHEMA).forEach((key) => {
    const primaryValue = merged[key];
    const secondaryValue = secondaryData[key];
    const empty =
      primaryValue === undefined ||
      primaryValue === null ||
      (typeof primaryValue === "string" && primaryValue.trim() === "") ||
      (Array.isArray(primaryValue) && primaryValue.length === 0);

    if (empty && secondaryValue !== undefined) {
      merged[key] = secondaryValue;
    }
  });

  const primaryRoles = normalizeRoles(merged.roles);
  const secondaryRoles = normalizeRoles(secondaryData.roles);
  merged.roles = mergeArrayValues(primaryRoles, secondaryRoles);

  const primaryJobs = Array.isArray(merged.jobs) ? merged.jobs : [];
  const secondaryJobs = Array.isArray(secondaryData.jobs)
    ? secondaryData.jobs
    : [];
  merged.jobs = mergeArrayValues(primaryJobs, secondaryJobs);

  const primaryBuildings = normalizeBuildings(
    Array.isArray(merged.primaryBuildings) && merged.primaryBuildings.length > 0
      ? merged.primaryBuildings
      : merged.primaryBuilding,
  );
  const secondaryBuildings = normalizeBuildings(
    Array.isArray(secondaryData.primaryBuildings) &&
      secondaryData.primaryBuildings.length > 0
      ? secondaryData.primaryBuildings
      : secondaryData.primaryBuilding,
  );
  merged.primaryBuildings = mergeArrayValues(
    primaryBuildings,
    secondaryBuildings,
  );
  if (!merged.primaryBuilding)
    merged.primaryBuilding = merged.primaryBuildings[0] || "";

  const primaryWeekly = Array.isArray(merged.weeklySchedule)
    ? merged.weeklySchedule
    : [];
  const secondaryWeekly = Array.isArray(secondaryData.weeklySchedule)
    ? secondaryData.weeklySchedule
    : [];
  merged.weeklySchedule = mergeArrayValues(primaryWeekly, secondaryWeekly);

  merged.externalIds = mergeExternalIds(
    merged.externalIds,
    secondaryData.externalIds,
  );
  merged.baylorId =
    standardizeBaylorId(merged.baylorId) ||
    standardizeBaylorId(secondaryData.baylorId) ||
    "";

  Object.entries(fieldChoices).forEach(([field, source]) => {
    if (source === "primary") merged[field] = stripId(primary)[field];
    if (source === "duplicate") merged[field] = secondaryData[field];
  });

  Object.assign(
    merged,
    standardizePerson(merged, { updateTimestamp: false, pruneUnknown: false }),
  );

  merged.updatedAt = new Date().toISOString();

  Object.keys(merged).forEach((key) => {
    if (merged[key] === undefined) merged[key] = null;
  });

  return merged;
};

export const mergeScheduleData = (primary, secondary) => {
  const merged = { ...stripId(primary) };
  const secondaryData = stripId(secondary);

  Object.keys(secondaryData).forEach((key) => {
    const primaryValue = merged[key];
    const secondaryValue = secondaryData[key];
    const empty =
      primaryValue === undefined ||
      primaryValue === null ||
      (typeof primaryValue === "string" && primaryValue.trim() === "") ||
      (Array.isArray(primaryValue) && primaryValue.length === 0);
    if (empty && secondaryValue !== undefined) {
      merged[key] = secondaryValue;
    }
  });

  merged.enrollment = Math.max(
    primary.enrollment || 0,
    secondary.enrollment || 0,
  );
  merged.maxEnrollment = Math.max(
    primary.maxEnrollment || 0,
    secondary.maxEnrollment || 0,
  );

  const patternKey = (p) =>
    `${p?.day || ""}|${p?.startTime || ""}|${p?.endTime || ""}`;
  const combinedPatterns = mergeArrayValues(
    primary.meetingPatterns,
    secondary.meetingPatterns,
  );
  if (combinedPatterns.length > 0) {
    const seen = new Set();
    merged.meetingPatterns = combinedPatterns.filter((p) => {
      const key = patternKey(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const normalizeAssignment = (assignment) => ({
    ...assignment,
    personId:
      assignment?.personId || assignment?.instructorId || assignment?.id,
  });
  const combinedAssignments = mergeArrayValues(
    Array.isArray(primary.instructorAssignments)
      ? primary.instructorAssignments
      : [],
    Array.isArray(secondary.instructorAssignments)
      ? secondary.instructorAssignments
      : [],
  ).map(normalizeAssignment);
  if (combinedAssignments.length > 0) {
    const seen = new Map();
    combinedAssignments.forEach((assignment) => {
      if (!assignment?.personId) return;
      const existing = seen.get(assignment.personId);
      if (!existing) {
        seen.set(assignment.personId, assignment);
        return;
      }
      seen.set(assignment.personId, {
        ...existing,
        ...assignment,
        isPrimary: existing.isPrimary || assignment.isPrimary || false,
        percentage: Math.max(
          existing.percentage || 0,
          assignment.percentage || 0,
        ),
      });
    });
    merged.instructorAssignments = Array.from(seen.values());
  }

  const combinedInstructorIds = Array.from(
    new Set(
      mergeArrayValues(primary.instructorIds, secondary.instructorIds)
        .concat(primary.instructorId || [])
        .concat(secondary.instructorId || []),
    ),
  ).filter(Boolean);
  if (combinedInstructorIds.length > 0) {
    merged.instructorIds = combinedInstructorIds;
  }

  merged.roomIds = mergeArrayValues(primary.roomIds, secondary.roomIds);
  merged.roomNames = mergeArrayValues(primary.roomNames, secondary.roomNames);
  if (merged.roomIds && merged.roomIds.length > 0)
    merged.roomId = merged.roomIds[0];
  if (merged.roomNames && merged.roomNames.length > 0)
    merged.roomName = merged.roomNames[0];

  const normalized = standardizeSchedule(merged);
  normalized.updatedAt = new Date().toISOString();
  return normalized;
};

export const mergeRoomData = (primary, secondary) => {
  const merged = { ...stripId(primary) };
  const secondaryData = stripId(secondary);

  Object.keys(secondaryData).forEach((key) => {
    const primaryValue = merged[key];
    const secondaryValue = secondaryData[key];
    const empty =
      primaryValue === undefined ||
      primaryValue === null ||
      (typeof primaryValue === "string" && primaryValue.trim() === "") ||
      (Array.isArray(primaryValue) && primaryValue.length === 0);
    if (empty && secondaryValue !== undefined) {
      merged[key] = secondaryValue;
    }
  });

  merged.capacity = Math.max(primary.capacity || 0, secondary.capacity || 0);
  merged.updatedAt = new Date().toISOString();
  return merged;
};
