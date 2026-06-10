import {
  DEFAULT_PERSON_SCHEMA,
  mergePeopleData,
  standardizeCourseCode,
  standardizePerson,
  standardizeSchedule,
  standardizeRoom
} from './hygieneCore';
import { parseCourseCode } from './courseUtils';

const normalizeString = (value) =>
  value === undefined || value === null ? '' : String(value).trim();

const normalizeEmail = (value) => normalizeString(value).toLowerCase();

const normalizeDigits = (value) => normalizeString(value).replace(/\D/g, '');

const encodeExactIdentityPart = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return '';
  const bytes = new TextEncoder().encode(normalized);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const normalizeNamePart = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const scoreCompleteness = (record = {}, fields = []) =>
  fields.reduce((score, key) => {
    const value = record?.[key];
    if (Array.isArray(value)) return value.length > 0 ? score + 1 : score;
    if (value && typeof value === 'object') {
      return Object.keys(value).length > 0 ? score + 1 : score;
    }
    if (typeof value === 'string') return value.trim() ? score + 1 : score;
    return value === undefined || value === null ? score : score + 1;
  }, 0);

const personCompletenessFields = [
  'firstName',
  'lastName',
  'name',
  'email',
  'phone',
  'title',
  'jobTitle',
  'department',
  'office',
  'officeSpaceId',
  'officeSpaceIds',
  'roles',
  'baylorId',
  'ignitePersonNumber',
  'externalIds'
];

const choosePreferredRecord = (current, candidate, scoreFields) => {
  if (!current) return candidate;
  const currentScore = scoreCompleteness(current, scoreFields);
  const candidateScore = scoreCompleteness(candidate, scoreFields);
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }
  const currentUpdated = new Date(current.updatedAt || current.createdAt || 0).getTime() || 0;
  const candidateUpdated = new Date(candidate.updatedAt || candidate.createdAt || 0).getTime() || 0;
  if (candidateUpdated !== currentUpdated) {
    return candidateUpdated > currentUpdated ? candidate : current;
  }
  const currentId = normalizeString(current.id);
  const candidateId = normalizeString(candidate.id);
  if (!currentId) return candidate;
  if (!candidateId) return current;
  return candidateId.localeCompare(currentId) < 0 ? candidate : current;
};

const normalizeOfficeId = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const normalizeOfficeIdList = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeOfficeId).filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  const single = normalizeOfficeId(value);
  return single ? [single] : [];
};

export const standardizeImportedPerson = (person = {}, options = {}) => {
  const { updateTimestamp = true } = options;
  const base = { ...person };
  if (Object.prototype.hasOwnProperty.call(person, 'officeSpaceId')) {
    base.officeSpaceId = normalizeOfficeId(person.officeSpaceId);
  }
  if (Object.prototype.hasOwnProperty.call(person, 'officeSpaceIds')) {
    base.officeSpaceIds = normalizeOfficeIdList(person.officeSpaceIds);
  }
  if (Object.prototype.hasOwnProperty.call(person, 'offices')) {
    base.offices = normalizeOfficeIdList(person.offices);
  }
  return standardizePerson(base, { updateTimestamp });
};

export const standardizeImportedSchedule = (schedule = {}) =>
  standardizeSchedule(schedule);

export const standardizeImportedRoom = (room = {}) => standardizeRoom(room);

export const deriveImportedPersonIdentity = (person = {}, options = {}) => {
  const { includeNameKey = true } = options;
  const source = person || {};
  const standardized = standardizeImportedPerson(source, { updateTimestamp: false });
  const keys = [];

  const baylorId = normalizeDigits(
    standardized.baylorId || standardized.externalIds?.baylorId,
  );
  if (baylorId && baylorId.length >= 9) {
    keys.push(`baylor:${baylorId}`);
  }

  const clssInstructorId = normalizeString(
    standardized.externalIds?.clssInstructorId || source.clssInstructorId,
  );
  if (clssInstructorId) {
    keys.push(`clss-instructor:${encodeExactIdentityPart(clssInstructorId)}`);
  }

  const emails = new Set();
  const primaryEmail = normalizeEmail(standardized.email);
  if (primaryEmail) emails.add(primaryEmail);
  if (Array.isArray(standardized.externalIds?.emails)) {
    standardized.externalIds.emails.forEach((email) => {
      const normalized = normalizeEmail(email);
      if (normalized) emails.add(normalized);
    });
  }
  emails.forEach((email) => keys.push(`email:${encodeExactIdentityPart(email)}`));

  const ignitePersonNumber = normalizeDigits(
    standardized.ignitePersonNumber ||
      standardized.ignitePersonId ||
      standardized.igniteId ||
      standardized.personNumber ||
      standardized.person_number ||
      standardized['Person Number'] ||
      standardized.externalIds?.ignitePersonNumber ||
      standardized.externalIds?.ignitePersonId ||
      standardized.externalIds?.igniteId ||
      standardized.externalIds?.personNumber,
  );
  if (ignitePersonNumber) {
    keys.push(`ignite:${ignitePersonNumber}`);
  }

  const firstName = normalizeNamePart(standardized.firstName);
  const lastName = normalizeNamePart(standardized.lastName);
  if (includeNameKey && firstName && lastName) {
    keys.push(`name:${lastName}:${firstName}`);
  }

  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  return {
    primaryKey: uniqueKeys[0] || '',
    keys: uniqueKeys,
    strongKeys: uniqueKeys.filter((key) => !key.startsWith('name:')),
    source: uniqueKeys[0] ? uniqueKeys[0].split(':')[0] : '',
    components: {
      baylorId,
      clssInstructorId,
      email: primaryEmail,
      ignitePersonNumber,
      firstName,
      lastName
    }
  };
};

export const buildPersonDocId = (identity) => {
  const primaryKey = identity?.primaryKey || '';
  if (!primaryKey) return '';
  return `person_${primaryKey.replace(/[^A-Za-z0-9_-]+/g, '_')}`;
};

export const buildPersonIdentityIndex = (people = [], options = {}) => {
  const { includeNameKey = true, includeMerged = false } = options;
  const index = new Map();
  const collisions = [];

  (Array.isArray(people) ? people : []).forEach((person) => {
    if (!person?.id) return;
    if (!includeMerged && person.mergedInto) return;
    const identity = deriveImportedPersonIdentity(person, { includeNameKey });
    identity.keys.forEach((key) => {
      if (!key) return;
      const existing = index.get(key);
      if (existing) {
        const preferred = choosePreferredRecord(existing.person, person, personCompletenessFields);
        collisions.push({
          key,
          existing: existing.person,
          incoming: person,
          preferredId: preferred?.id || ''
        });
        index.set(key, { person: preferred, identity });
      } else {
        index.set(key, { person, identity });
      }
    });
  });

  return { index, collisions };
};

export const resolvePersonIdentityMatch = (personOrIdentity, index, options = {}) => {
  const { strongOnly = true } = options;
  const identity = Array.isArray(personOrIdentity?.keys)
    ? personOrIdentity
    : deriveImportedPersonIdentity(personOrIdentity, { includeNameKey: !strongOnly });
  const keys = strongOnly
    ? (identity.strongKeys || []).filter(Boolean)
    : (identity.keys || []).filter(Boolean);

  for (const key of keys) {
    if (index.has(key)) {
      return { person: index.get(key).person, matchedKey: key, identity };
    }
  }
  return { person: null, matchedKey: '', identity };
};

const mergeExternalIdsForImport = (existing = {}, incoming = {}) => {
  const next = existing && typeof existing === 'object' ? { ...existing } : {};
  const incomingIds = incoming && typeof incoming === 'object' ? incoming : {};
  Object.entries(incomingIds).forEach(([key, value]) => {
    if (key === 'emails') return;
    if (value === undefined || value === null || value === '') return;
    if (!next[key]) next[key] = value;
  });

  const emails = new Set(
    Array.isArray(next.emails)
      ? next.emails.map((email) => normalizeEmail(email)).filter(Boolean)
      : [],
  );
  if (Array.isArray(incomingIds.emails)) {
    incomingIds.emails.forEach((email) => {
      const normalized = normalizeEmail(email);
      if (normalized) emails.add(normalized);
    });
  }
  if (emails.size > 0) next.emails = Array.from(emails);
  return next;
};

const normalizeStringList = (value) => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(values.map((item) => normalizeString(item)).filter(Boolean)),
  );
};

const mergeListValues = (a, b) => Array.from(new Set([
  ...normalizeStringList(a),
  ...normalizeStringList(b)
]));

const isDifferent = (a, b) => {
  try {
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch (error) {
    return a !== b;
  }
};

const isEmptyGeneratedValue = (value) => (
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (value && typeof value === 'object' && Object.keys(value).length === 0)
);

const isDefaultPersonValue = (key, value) => (
  Object.prototype.hasOwnProperty.call(DEFAULT_PERSON_SCHEMA, key) &&
  !isDifferent(DEFAULT_PERSON_SCHEMA[key], value)
);

const shouldSkipGeneratedPersonDefault = (existingPerson, key, value) => (
  existingPerson?.[key] === undefined &&
  (key === 'createdAt' || isDefaultPersonValue(key, value) || isEmptyGeneratedValue(value))
);

export const buildPersonImportUpdates = (existingPerson = {}, incomingPerson = {}, options = {}) => {
  const { updateTimestamp = true } = options;
  const existing = standardizeImportedPerson(existingPerson, { updateTimestamp: false });
  const incoming = standardizeImportedPerson(incomingPerson, { updateTimestamp: false });
  const merged = mergePeopleData(existing, incoming);

  const preferIncomingFields = [
    'email',
    'phone',
    'office',
    'officeSpaceId',
    'primaryBuilding'
  ];

  preferIncomingFields.forEach((field) => {
    if (incoming[field] !== undefined && incoming[field] !== null && String(incoming[field]).trim() !== '') {
      merged[field] = incoming[field];
    }
  });

  merged.roles = mergeListValues(existing.roles, incoming.roles);
  merged.officeSpaceIds = mergeListValues(existing.officeSpaceIds, incoming.officeSpaceIds);
  merged.offices = mergeListValues(existing.offices, incoming.offices);
  merged.externalIds = mergeExternalIdsForImport(existing.externalIds, incoming.externalIds);

  const identity = deriveImportedPersonIdentity(merged);
  if (identity.primaryKey) {
    merged.identityKey = identity.primaryKey;
    merged.identityKeys = identity.keys;
    merged.identitySource = identity.source;
  }

  const standardizedMerged = standardizeImportedPerson(merged, {
    updateTimestamp: false
  });
  const updates = {};
  const diff = [];
  Object.entries(standardizedMerged).forEach(([key, value]) => {
    if (key === 'id') return;
    if (key === 'createdAt') return;
    if (key === 'updatedAt') return;
    if (shouldSkipGeneratedPersonDefault(existingPerson, key, value)) return;
    if (!isDifferent(existingPerson?.[key], value)) return;
    updates[key] = value;
    diff.push({ key, from: existingPerson?.[key], to: value });
  });

  if (Object.keys(updates).length > 0 && updateTimestamp) {
    updates.updatedAt = new Date().toISOString();
    const existingUpdatedAt = existingPerson?.updatedAt || '';
    diff.push({ key: 'updatedAt', from: existingUpdatedAt, to: updates.updatedAt });
  }

  return {
    updates,
    diff,
    hasChanges: Object.keys(updates).length > 0,
    merged: { ...existingPerson, ...updates },
    identity
  };
};

export const applyPersonIdentityMetadata = (person = {}) => {
  const standardized = standardizeImportedPerson(person, { updateTimestamp: false });
  const identity = deriveImportedPersonIdentity(standardized);
  if (!identity.primaryKey) return standardized;
  return {
    ...standardized,
    identityKey: identity.primaryKey,
    identityKeys: identity.keys,
    identitySource: identity.source
  };
};

const buildCourseDocId = (courseCode) => {
  const normalized = standardizeCourseCode(courseCode);
  if (!normalized) return '';
  return normalized.replace(/\s+/g, '_').toUpperCase();
};

export const buildCanonicalCourseFromSchedule = (schedule = {}) => {
  const courseCode = standardizeCourseCode(schedule.courseCode);
  const id = buildCourseDocId(courseCode);
  if (!id) return null;
  const parsedCourse = parseCourseCode(courseCode);
  const subjectCode = normalizeString(schedule.subjectCode).toUpperCase()
    || (parsedCourse?.error ? '' : parsedCourse?.program || '');
  const catalogNumber = normalizeString(schedule.catalogNumber).toUpperCase()
    || (parsedCourse?.catalogNumber || '');
  const title = normalizeString(schedule.courseTitle || schedule.title);
  return {
    id,
    data: {
      courseCode,
      title,
      departmentCode: normalizeString(schedule.departmentCode).toUpperCase(),
      subjectCode: subjectCode || null,
      catalogNumber,
      credits: schedule.credits ?? parsedCourse?.credits ?? null,
      program: normalizeString(schedule.program) || subjectCode || null,
      courseLevel: Number.isFinite(schedule.courseLevel)
        ? schedule.courseLevel
        : (Number.isFinite(parsedCourse?.level) ? parsedCourse.level : 0)
    }
  };
};
