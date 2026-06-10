import { collection, getDocs, getDoc, doc, writeBatch, query, where, documentId } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { logCreate, logUpdate, logDelete, logImport } from '../changeLogger';
import { parseCrossListCrns } from '../dataImportUtils';
import { normalizeTime } from '../meetingPatternUtils';
import { findPersonMatch, makeNameKey, normalizeBaylorId } from '../personMatchUtils';
import { normalizeTermLabel, termCodeFromLabel, termLabelFromCode } from '../termUtils';
import { parseRoomLabel, buildSpaceKey, normalizeSingleSpaceKey, normalizeSpaceNumber, parseSpaceKey } from '../locationService';
import { normalizeSectionNumber } from '../canonicalSchema';
import { hashRecord } from '../hashUtils';
import { standardizeCourseCode, isCancelledStatus } from '../hygieneCore';
import {
  applyPersonIdentityMetadata,
  buildCanonicalCourseFromSchedule,
  buildPersonDocId,
  buildPersonIdentityIndex,
  buildPersonImportUpdates,
  resolvePersonIdentityMatch,
  standardizeImportedPerson,
  standardizeImportedRoom,
  standardizeImportedSchedule
} from '../importHygieneUtils';
import {
  buildScheduleDocId,
  buildScheduleIdentityIndex,
  deriveScheduleIdentity,
  resolveScheduleIdentityMatch
} from '../importIdentityUtils';
import {
  generateImportReport,
  formatImportReportForLog
} from '../importReportUtils';
import { preprocessImportData } from '../importPreprocessor';
import { validateImportTransaction } from '../importValidationUtils';
import { buildPeopleIndex } from '../peopleUtils';
import { extractScheduleRowBaseData } from '../importScheduleRowUtils';
import {
  runImportEntityResolutionCleanup,
  runPostImportCleanup
} from '../dataHygiene';
import { ImportTransaction } from './transaction-model';
import { MAX_BATCH_OPERATIONS, createBatchWriter, getValueByPath } from './common';
import { persistImportRunTracking } from './import-run-tracking';
import {
  buildRollbackModifyUpdates,
  toRollbackPayload,
  verifyRollbackResult
} from './rollback-utils';
import {
  getImportTransactions as fetchImportTransactions,
  saveTransactionToDatabase,
  updateTransactionInStorage
} from './transaction-store';

export { getImportTransactions, deleteTransaction } from './transaction-store';

// Preview import changes without committing to database
export const previewImportChanges = async (csvData, importType, selectedSemester, options = {}) => {
  const { persist = true, includeOfficeRooms = true, importMetadata = {} } = options;
  const normalizedSemester = normalizeTermLabel(selectedSemester || '');
  const fallbackTerm = normalizedSemester || selectedSemester || '';
  const transaction = new ImportTransaction(
    importType,
    `${importType} import preview`,
    normalizedSemester || selectedSemester
  );
  const rows = Array.isArray(csvData) ? csvData : [];
  const preprocessResult = preprocessImportData(rows, importType, { fallbackTerm });
  const dedupedRows = Array.isArray(preprocessResult?.dedupedRows)
    ? preprocessResult.dedupedRows
    : rows;
  const rowHashes = rows.map((row) => row?.__rowHash || hashRecord(row));
  transaction.importMetadata = {
    ...importMetadata,
    rowCount: rows.length,
    dedupedRowCount: dedupedRows.length,
    rowHashes
  };
  if (preprocessResult?.validationReport) {
    transaction.preprocessReport = {
      importType,
      ...preprocessResult.validationReport,
      normalizedRowCount: Array.isArray(preprocessResult.normalizedRows)
        ? preprocessResult.normalizedRows.length
        : 0,
      dedupedRowCount: dedupedRows.length
    };
    const reportWarnings = Array.isArray(preprocessResult.validationReport.warnings)
      ? preprocessResult.validationReport.warnings
      : [];
    const reportErrors = Array.isArray(preprocessResult.validationReport.errors)
      ? preprocessResult.validationReport.errors
      : [];
    reportWarnings.forEach((entry) => {
      const message = entry?.message || String(entry);
      if (message) transaction.validation.warnings.push(message);
    });
    reportErrors.forEach((entry) => {
      const message = entry?.message || String(entry);
      if (message) transaction.validation.errors.push(message);
    });
  }

  try {
    let existingSchedulesData = [];
    let existingPeopleData = [];
    let existingRoomsData = [];

    if (importType === 'schedule') {
      const termCodes = new Set();
      const termLabels = new Set();

      const termSourceRows = Array.isArray(preprocessResult?.normalizedRows) && preprocessResult.normalizedRows.length > 0
        ? preprocessResult.normalizedRows
        : dedupedRows;
      termSourceRows.forEach((row) => {
        const base = row?.baseData || extractScheduleRowBaseData(row?.raw || row, fallbackTerm);
        const termCode = (base?.termCode || '').toString().trim();
        const termLabel = (base?.term || '').toString().trim();
        if (termCode) termCodes.add(termCode);
        if (termLabel) termLabels.add(termLabel);
      });

      const chunkItems = (items) => {
        const chunks = [];
        for (let i = 0; i < items.length; i += 10) {
          chunks.push(items.slice(i, i + 10));
        }
        return chunks;
      };

      const schedules = [];
      const seenIds = new Set();
      const scheduleQueries = [];

      if (termCodes.size > 0) {
        chunkItems(Array.from(termCodes)).forEach((chunk) => {
          scheduleQueries.push(
            query(collection(db, COLLECTIONS.SCHEDULES), where('termCode', 'in', chunk))
          );
        });
      }

      if (termLabels.size > 0) {
        chunkItems(Array.from(termLabels)).forEach((chunk) => {
          scheduleQueries.push(
            query(collection(db, COLLECTIONS.SCHEDULES), where('term', 'in', chunk))
          );
        });
      }

      const [peopleSnapshot, roomsSnapshot, ...scheduleSnapshots] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.PEOPLE)),
        getDocs(collection(db, COLLECTIONS.ROOMS)),
        ...scheduleQueries.map((q) => getDocs(q))
      ]);

      scheduleSnapshots.forEach((snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          if (!seenIds.has(docSnap.id)) {
            seenIds.add(docSnap.id);
            schedules.push({ id: docSnap.id, ...docSnap.data() });
          }
        });
      });

      existingSchedulesData = schedules;
      existingPeopleData = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      existingRoomsData = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
      const [peopleSnapshot, roomsSnapshot] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.PEOPLE)),
        getDocs(collection(db, COLLECTIONS.ROOMS))
      ]);
      existingPeopleData = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      existingRoomsData = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    if (importType === 'schedule') {
      await previewScheduleChanges(
        dedupedRows,
        transaction,
        existingSchedulesData,
        existingPeopleData,
        existingRoomsData,
        { fallbackTerm }
      );
    } else if (importType === 'directory') {
      await previewDirectoryChanges(dedupedRows, transaction, existingPeopleData, existingRoomsData, { includeOfficeRooms });
    }

    const validationReport = validateImportTransaction(transaction, {
      schedules: existingSchedulesData,
      people: existingPeopleData,
      rooms: existingRoomsData
    });
    transaction.validationReport = validationReport;
    const formatIssue = (issue) => {
      if (!issue) return '';
      if (typeof issue === 'string') return issue;
      const collection = issue.collection ? String(issue.collection) : 'import';
      const field = issue.field ? ` (${issue.field})` : '';
      const message = issue.message ? String(issue.message) : String(issue);
      return `${collection}${field}: ${message}`;
    };
    (Array.isArray(validationReport?.errors) ? validationReport.errors : []).forEach((issue) => {
      const message = formatIssue(issue);
      if (message) transaction.validation.errors.push(message);
    });
    (Array.isArray(validationReport?.warnings) ? validationReport.warnings : []).forEach((issue) => {
      const message = formatIssue(issue);
      if (message) transaction.validation.warnings.push(message);
    });

    // Store transaction in database for cross-browser access (optional)
    if (persist) {
      try {
        await saveTransactionToDatabase(transaction);
      } catch (e) {
        // If we don't have permission, continue with in-memory preview
        console.warn('Skipping transaction persistence (preview only):', e?.message || e);
      }
    }

    return transaction;
  } catch (error) {
    console.error('Error previewing import changes:', error);
    throw error;
  }
};

const normalizeRoomName = (name) => (name || '').replace(/\s+/g, ' ').trim().toLowerCase();

const normalizeBaylorIdForBackfill = (value) => {
  const normalized = normalizeBaylorId(value);
  return normalized.length === 9 ? normalized : '';
};

const mergeExternalIds = (base = {}, updates = {}) => {
  const next = { ...(base && typeof base === 'object' ? base : {}) };
  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (!next[key]) {
      next[key] = value;
    }
  });
  return next;
};

const normalizeIdentifierString = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const hasPersonIdentifier = (personData) => {
  if (!personData || typeof personData !== 'object') return false;
  const email = normalizeIdentifierString(personData.email);
  const baylorId =
    normalizeIdentifierString(personData.baylorId) ||
    normalizeIdentifierString(personData.externalIds?.baylorId);
  const clssInstructorId =
    normalizeIdentifierString(personData.clssInstructorId) ||
    normalizeIdentifierString(personData.externalIds?.clssInstructorId);
  const ignitePersonNumber = normalizeDirectoryDigits(
    personData.ignitePersonNumber ||
      personData.ignitePersonId ||
      personData.igniteId ||
      personData.personNumber ||
      personData.person_number ||
      personData['Person Number'] ||
      personData.externalIds?.ignitePersonNumber ||
      personData.externalIds?.ignitePersonId ||
      personData.externalIds?.igniteId ||
      personData.externalIds?.personNumber
  );

  return Boolean(email || baylorId || clssInstructorId || ignitePersonNumber);
};

const readDirectoryRawField = (row = {}, keys = []) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return '';
};

const normalizeDirectoryBaseField = (value) => (
  value === undefined || value === null ? '' : String(value).trim()
);

const normalizeDirectoryDigits = (value) => (
  normalizeDirectoryBaseField(value).replace(/\D/g, '')
);

const resolveDirectoryPersonField = (row, keys, baseValue, preferBase = false) => {
  const rawValue = readDirectoryRawField(row, keys);
  const normalizedBase = normalizeDirectoryBaseField(baseValue);
  return preferBase ? (normalizedBase || rawValue) : (rawValue || normalizedBase);
};

export const extractDirectoryPersonFields = (rowEntry = {}) => {
  const row = rowEntry?.raw && typeof rowEntry.raw === 'object'
    ? rowEntry.raw
    : (rowEntry || {});
  const basePerson = rowEntry?.baseData && typeof rowEntry.baseData === 'object'
    ? rowEntry.baseData
    : {};
  const preferBasePerson = rowEntry?.__merged === true;

  const firstName = resolveDirectoryPersonField(row, [
    'First Name',
    'FirstName',
    'firstName'
  ], basePerson.firstName, preferBasePerson);
  const lastName = resolveDirectoryPersonField(row, [
    'Last Name',
    'LastName',
    'lastName'
  ], basePerson.lastName, preferBasePerson);
  const email = resolveDirectoryPersonField(row, [
    'E-mail Address',
    'E-mail',
    'Email',
    'email'
  ], basePerson.email, preferBasePerson);
  const phone = resolveDirectoryPersonField(row, [
    'Phone',
    'Business Phone',
    'Home Phone',
    'phone'
  ], basePerson.phone, preferBasePerson);
  const rawBaylorId = resolveDirectoryPersonField(row, [
    'Baylor ID',
    'BaylorID',
    'baylorId'
  ], basePerson.baylorId || basePerson.externalIds?.baylorId, preferBasePerson);
  const clssInstructorId = resolveDirectoryPersonField(row, [
    'CLSS Instructor ID',
    'clssInstructorId',
    'Instructor ID',
    'InstructorID'
  ], basePerson.externalIds?.clssInstructorId, preferBasePerson);
  const ignitePersonNumber = normalizeDirectoryDigits(resolveDirectoryPersonField(row, [
    'Person Number',
    'PersonNumber',
    'Person #',
    'personNumber',
    'person_number',
    'ignitePersonNumber',
    'Ignite Person Number',
    'ignitePersonId',
    'Ignite Person ID',
    'igniteId',
    'Ignite ID'
  ], basePerson.ignitePersonNumber ||
    basePerson.ignitePersonId ||
    basePerson.igniteId ||
    basePerson.personNumber ||
    basePerson.person_number ||
    basePerson.externalIds?.ignitePersonNumber ||
    basePerson.externalIds?.ignitePersonId ||
    basePerson.externalIds?.igniteId ||
    basePerson.externalIds?.personNumber,
  preferBasePerson));
  const baylorId = normalizeBaylorId(rawBaylorId);

  return {
    row,
    basePerson,
    firstName,
    lastName,
    email,
    phone,
    baylorId,
    clssInstructorId,
    ignitePersonNumber,
    hasAnyIdentity: Boolean(firstName || lastName || email || baylorId || clssInstructorId || ignitePersonNumber)
  };
};

const buildPersonBackfillUpdates = (existingPerson, parsedInstructor) => {
  if (!existingPerson || !parsedInstructor) return { updates: {}, diff: [] };
  const updates = {};
  const diff = [];
  const firstName = (parsedInstructor.firstName || '').trim();
  const lastName = (parsedInstructor.lastName || '').trim();
  const rawId = parsedInstructor.id ? String(parsedInstructor.id).trim() : '';
  const baylorId = normalizeBaylorIdForBackfill(rawId);

  if (!existingPerson.firstName && firstName) {
    updates.firstName = firstName;
    diff.push({ key: 'firstName', from: existingPerson.firstName || '', to: firstName });
  }
  if (!existingPerson.lastName && lastName) {
    updates.lastName = lastName;
    diff.push({ key: 'lastName', from: existingPerson.lastName || '', to: lastName });
  }
  if ((!existingPerson.name || !String(existingPerson.name).trim()) && (firstName || lastName)) {
    const name = `${firstName} ${lastName}`.trim();
    if (name) {
      updates.name = name;
      diff.push({ key: 'name', from: existingPerson.name || '', to: name });
    }
  }
  if (!existingPerson.baylorId && baylorId) {
    updates.baylorId = baylorId;
    diff.push({ key: 'baylorId', from: existingPerson.baylorId || '', to: baylorId });
  }

  const externalUpdates = {};
  if (rawId && !(existingPerson.externalIds && existingPerson.externalIds.clssInstructorId)) {
    externalUpdates.clssInstructorId = rawId;
  }
  if (baylorId && !(existingPerson.externalIds && existingPerson.externalIds.baylorId)) {
    externalUpdates.baylorId = baylorId;
  }
  if (Object.keys(externalUpdates).length > 0) {
    const mergedExternal = mergeExternalIds(existingPerson.externalIds, externalUpdates);
    updates.externalIds = mergedExternal;
    diff.push({ key: 'externalIds', from: existingPerson.externalIds || {}, to: mergedExternal });
  }

  return { updates, diff };
};

const buildRoomBackfillUpdates = (existingRoom, parsedRoom) => {
  if (!existingRoom || !parsedRoom) return { updates: {}, diff: [] };
  const updates = {};
  const diff = [];

  const setIfMissing = (key, value) => {
    if (value === undefined || value === null || value === '') return;
    const current = existingRoom[key];
    if (current === undefined || current === null || String(current).trim() === '') {
      updates[key] = value;
      diff.push({ key, from: current || '', to: value });
    }
  };

  setIfMissing('spaceKey', parsedRoom.spaceKey);
  setIfMissing('buildingCode', parsedRoom.buildingCode);
  setIfMissing('buildingDisplayName', parsedRoom.building?.displayName || '');
  setIfMissing('spaceNumber', parsedRoom.spaceNumber);
  setIfMissing('displayName', parsedRoom.displayName);

  return { updates, diff };
};

const buildRoomNameKeys = (roomData) => {
  const keys = new Set();
  const candidates = [
    roomData?.displayName,
    roomData?.name
  ];

  const spaceKey = normalizeSingleSpaceKey(roomData?.spaceKey || roomData?.id || '');
  if (spaceKey) {
    candidates.push(spaceKey);
    const parsedSpaceKey = parseSpaceKey(spaceKey);
    if (parsedSpaceKey?.buildingCode && parsedSpaceKey?.spaceNumber) {
      candidates.push(`${parsedSpaceKey.buildingCode} ${parsedSpaceKey.spaceNumber}`);
    }
  }

  const buildingDisplayName = (roomData?.buildingDisplayName || '').toString().trim();
  const buildingCode = (roomData?.buildingCode || '').toString().trim();
  const spaceNumber = normalizeSpaceNumber(roomData?.spaceNumber || roomData?.roomNumber || '');
  if (buildingDisplayName && spaceNumber) {
    candidates.push(`${buildingDisplayName} ${spaceNumber}`);
  }
  if (buildingCode && spaceNumber) {
    candidates.push(`${buildingCode} ${spaceNumber}`);
  }

  candidates.forEach((candidate) => {
    const key = normalizeRoomName(candidate);
    if (key) keys.add(key);
  });
  return Array.from(keys);
};

const normalizeInstructorDisplayName = (instructorRecord, parsedInstructor, fallback) => {
  const firstName = (instructorRecord?.firstName || parsedInstructor?.firstName || '').trim();
  const lastName = (instructorRecord?.lastName || parsedInstructor?.lastName || '').trim();

  if (firstName && lastName) {
    return `${lastName}, ${firstName}`;
  }
  if (lastName) return lastName;
  if (firstName) return firstName;
  return fallback || '';
};

const SCHEDULE_IMPORT_IGNORED_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  '__rowIndex',
  '__rowHash',
  'rowHash'
]);

const SCHEDULE_INTERNAL_UPDATE_FIELDS = new Set([
  'identityKey',
  'identityKeys',
  'identitySource',
  'updatedAt',
  'spaceIds',
  'spaceDisplayNames',
  'instructorId',
  'instructorIds',
  'instructorAssignments'
]);

const isEmptyForMerge = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

const deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (error) {
      return false;
    }
  }
  return false;
};

const normalizeStringValue = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const normalizeNumberValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeListValues = (value, normalizeItem = (val) => val) => {
  const items = Array.isArray(value) ? value : (value ? [value] : []);
  const normalized = items
    .map((item) => normalizeItem(item))
    .filter((item) => item !== undefined && item !== null && String(item).trim() !== '');
  return Array.from(new Set(normalized)).sort();
};

const normalizeRoomToken = (value) => normalizeRoomName(normalizeStringValue(value));

const normalizeIdToken = (value) => normalizeStringValue(value);

const normalizeMeetingPatternToken = (pattern) => {
  if (!pattern || typeof pattern !== 'object') return '';
  const day = normalizeStringValue(pattern.day).toUpperCase();
  const start = normalizeTime(pattern.startTime || '');
  const end = normalizeTime(pattern.endTime || '');
  const mode = normalizeStringValue(pattern.mode).toLowerCase();
  return [day, start, end, mode].filter(Boolean).join('|');
};

const areEquivalentScheduleValues = (key, existingValue, incomingValue) => {
  if (key === 'spaceDisplayNames') {
    const existing = normalizeListValues(existingValue, normalizeRoomToken);
    const incoming = normalizeListValues(incomingValue, normalizeRoomToken);
    return deepEqual(existing, incoming);
  }

  if (key === 'spaceIds' || key === 'instructorIds' || key === 'crossListCrns') {
    const existing = normalizeListValues(existingValue, normalizeIdToken);
    const incoming = normalizeListValues(incomingValue, normalizeIdToken);
    return deepEqual(existing, incoming);
  }

  if (key === 'meetingPatterns') {
    const existing = normalizeListValues(existingValue, normalizeMeetingPatternToken);
    const incoming = normalizeListValues(incomingValue, normalizeMeetingPatternToken);
    return deepEqual(existing, incoming);
  }

  if (key === 'instructorAssignments') {
    const normalizeAssignment = (assignment) => {
      if (!assignment || typeof assignment !== 'object') return '';
      const personId = normalizeStringValue(
        assignment.personId ||
          assignment.id ||
          (assignment.matchIssueId ? `match:${assignment.matchIssueId}` : ''),
      );
      const percentage = Number.isFinite(assignment.percentage) ? assignment.percentage : '';
      const primary = assignment.isPrimary ? 'primary' : '';
      return [personId, percentage, primary].filter(Boolean).join('|');
    };
    const existing = normalizeListValues(existingValue, normalizeAssignment);
    const incoming = normalizeListValues(incomingValue, normalizeAssignment);
    return deepEqual(existing, incoming);
  }

  if (key === 'credits') {
    return normalizeNumberValue(existingValue) === normalizeNumberValue(incomingValue);
  }

  if (key === 'courseCode') {
    return standardizeCourseCode(existingValue) === standardizeCourseCode(incomingValue);
  }

  if (key === 'section') {
    return normalizeSectionNumber(existingValue) === normalizeSectionNumber(incomingValue);
  }

  if (key === 'term') {
    return normalizeTermLabel(existingValue) === normalizeTermLabel(incomingValue);
  }

  if (key === 'termCode') {
    return normalizeStringValue(existingValue) === normalizeStringValue(incomingValue);
  }

  if (key === 'instructorBaylorId') {
    return normalizeBaylorId(existingValue) === normalizeBaylorId(incomingValue);
  }

  return deepEqual(incomingValue, existingValue);
};

const identityStrength = (key) => {
  if (!key) return 0;
  if (key.startsWith('clss:')) return 4;
  if (key.startsWith('crn:')) return 3;
  if (key.startsWith('section:')) return 2;
  if (key.startsWith('composite:')) return 1;
  return 0;
};

const mergeIdentityKeys = (existingKeys, incomingKeys) => {
  const merged = new Set();
  (Array.isArray(existingKeys) ? existingKeys : []).forEach((key) => {
    if (key) merged.add(key);
  });
  (Array.isArray(incomingKeys) ? incomingKeys : []).forEach((key) => {
    if (key) merged.add(key);
  });
  return Array.from(merged);
};

const shouldPreferExistingText = (key, existingValue, incomingValue) => {
  if (key !== 'courseTitle') return false;
  if (!existingValue || !incomingValue) return false;
  return String(existingValue).trim().length > String(incomingValue).trim().length;
};

export const buildScheduleImportUpdates = (existingSchedule, incomingSchedule, options = {}) => {
  const allowEmptyFields = new Set(options.allowEmptyFields || []);
  const updates = {};
  let hasChanges = false;

  Object.keys(incomingSchedule || {}).forEach((key) => {
    if (SCHEDULE_IMPORT_IGNORED_FIELDS.has(key)) return;

    const incoming = incomingSchedule[key];
    const existing = existingSchedule[key];

    if (key === 'identityKeys') {
      const mergedKeys = mergeIdentityKeys(existing, incoming);
      if (!deepEqual(existing, mergedKeys)) {
        updates.identityKeys = mergedKeys;
        hasChanges = true;
      }
      return;
    }

    if (key === 'identityKey') {
      const incomingStrength = identityStrength(incoming);
      const existingStrength = identityStrength(existing);
      if (!incoming) return;
      if (!existing || incomingStrength >= existingStrength) {
        if (!deepEqual(existing, incoming)) {
          updates.identityKey = incoming;
          hasChanges = true;
        }
      }
      return;
    }

    if (key === 'identitySource') {
      const incomingStrength = identityStrength(incomingSchedule.identityKey);
      const existingStrength = identityStrength(existingSchedule.identityKey);
      if (existingSchedule.identityKey && incomingStrength < existingStrength) {
        return;
      }
    }

    if (isEmptyForMerge(incoming) && !allowEmptyFields.has(key)) return;
    if (shouldPreferExistingText(key, existing, incoming)) return;
    if (!areEquivalentScheduleValues(key, existing, incoming)) {
      updates[key] = incoming;
      hasChanges = true;
    }
  });

  if (hasChanges) {
    updates.updatedAt = new Date().toISOString();
  }

  return { updates, hasChanges };
};

const buildIdentifierOnlyPersonResolutionUpdates = (existingPerson = {}, proposedPerson = {}) => {
  const incomingPerson = applyPersonIdentityMetadata(proposedPerson || {});
  const updates = {};
  const externalUpdates = {};

  const incomingBaylorId = normalizeBaylorId(
    incomingPerson.baylorId || incomingPerson.externalIds?.baylorId
  );
  const existingTopLevelBaylorId = normalizeBaylorId(existingPerson?.baylorId);
  const existingExternalBaylorId = normalizeBaylorId(existingPerson?.externalIds?.baylorId);
  if (incomingBaylorId) {
    if (!existingTopLevelBaylorId) {
      updates.baylorId = incomingBaylorId;
    }
    if (!existingExternalBaylorId) {
      externalUpdates.baylorId = incomingBaylorId;
    }
  }

  const incomingClssInstructorId = normalizeDirectoryBaseField(
    incomingPerson.externalIds?.clssInstructorId || proposedPerson?.clssInstructorId
  );
  const existingClssInstructorId = normalizeDirectoryBaseField(
    existingPerson?.externalIds?.clssInstructorId || existingPerson?.clssInstructorId
  );
  if (incomingClssInstructorId && !existingClssInstructorId) {
    externalUpdates.clssInstructorId = incomingClssInstructorId;
  }

  const incomingIgnitePersonNumber = normalizeDirectoryDigits(
    incomingPerson.ignitePersonNumber ||
      incomingPerson.ignitePersonId ||
      incomingPerson.igniteId ||
      incomingPerson.personNumber ||
      incomingPerson.person_number ||
      incomingPerson['Person Number'] ||
      incomingPerson.externalIds?.ignitePersonNumber ||
      incomingPerson.externalIds?.ignitePersonId ||
      incomingPerson.externalIds?.igniteId ||
      incomingPerson.externalIds?.personNumber
  );
  const existingTopLevelIgnitePersonNumber = normalizeDirectoryDigits(
    existingPerson?.ignitePersonNumber ||
      existingPerson?.ignitePersonId ||
      existingPerson?.igniteId ||
      existingPerson?.personNumber ||
      existingPerson?.person_number ||
      existingPerson?.['Person Number']
  );
  const existingCanonicalExternalIgnitePersonNumber = normalizeDirectoryDigits(
    existingPerson?.externalIds?.ignitePersonNumber
  );
  const existingPersonNumberAlias = normalizeDirectoryDigits(
    existingPerson?.externalIds?.personNumber
  );
  if (incomingIgnitePersonNumber) {
    if (!existingTopLevelIgnitePersonNumber) {
      updates.ignitePersonNumber = incomingIgnitePersonNumber;
    }
    if (!existingCanonicalExternalIgnitePersonNumber) {
      externalUpdates.ignitePersonNumber = incomingIgnitePersonNumber;
    }
    if (!existingPersonNumberAlias && !existingCanonicalExternalIgnitePersonNumber) {
      externalUpdates.personNumber = incomingIgnitePersonNumber;
    }
  }

  if (Object.keys(externalUpdates).length > 0) {
    updates.externalIds = mergeExternalIds(existingPerson?.externalIds, externalUpdates);
  }

  const withIdentityMetadata = applyPersonIdentityMetadata({
    ...(existingPerson || {}),
    ...updates
  });
  ['identityKey', 'identityKeys', 'identitySource'].forEach((key) => {
    if (withIdentityMetadata[key] === undefined) return;
    const current = existingPerson?.[key];
    const next = withIdentityMetadata[key];
    const changed = Array.isArray(next)
      ? JSON.stringify(current || []) !== JSON.stringify(next)
      : current !== next;
    if (changed) {
      updates[key] = next;
    }
  });

  if (Object.keys(updates).length === 0) {
    return {};
  }

  updates.updatedAt = new Date().toISOString();
  return updates;
};

export const buildLinkedPersonResolutionUpdates = (existingPerson, proposedPerson, importType = 'schedule') => {
  if (importType === 'schedule') {
    return buildIdentifierOnlyPersonResolutionUpdates(existingPerson, proposedPerson);
  }

  const { updates } = buildPersonImportUpdates(existingPerson, proposedPerson);
  return updates;
};

const previewScheduleChanges = async (
  csvData,
  transaction,
  existingSchedules,
  existingPeople,
  existingRooms,
  options = {}
) => {
  const { fallbackTerm = '' } = options;
  const roomsMap = new Map();
  const roomsKeyMap = new Map();
  const pendingMatchMap = new Map();
  const pendingPersonUpdates = new Map();
  const pendingRoomUpdates = new Map();
  const createdRoomIds = new Set();
  const { index: scheduleIdentityIndex, collisions } = buildScheduleIdentityIndex(existingSchedules);
  const peopleIndex = buildPeopleIndex(existingPeople);
  const { peopleById, resolvePersonId } = peopleIndex;
  const summarizeIdentityCollisions = (items = []) => {
    const byType = {};
    const examples = [];
    items.forEach((collision) => {
      const key = collision?.key || '';
      const type = key.split(':')[0] || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      if (examples.length < 5) {
        examples.push({
          key,
          existingId: collision?.existing?.id || '',
          incomingId: collision?.incoming?.id || '',
          preferredId: collision?.preferred || ''
        });
      }
    });
    return {
      total: items.length,
      byType,
      examples
    };
  };

  const ensureValidation = () => {
    if (!transaction.validation || typeof transaction.validation !== 'object') {
      transaction.validation = { errors: [], warnings: [] };
    }
    if (!Array.isArray(transaction.validation.errors)) {
      transaction.validation.errors = [];
    }
    if (!Array.isArray(transaction.validation.warnings)) {
      transaction.validation.warnings = [];
    }
  };

  const addValidation = (type, message) => {
    ensureValidation();
    const bucket = type === 'error' ? 'errors' : 'warnings';
    transaction.validation[bucket].push(message);
  };

  const applyPersonUpdates = (person, updates) => {
    if (!updates || Object.keys(updates).length === 0) return person;
    const merged = { ...person, ...updates };
    if (updates.externalIds) {
      merged.externalIds = mergeExternalIds(person.externalIds, updates.externalIds);
    }
    return merged;
  };

  const queuePersonBackfill = (person, parsedInstructor) => {
    if (!person?.id || !parsedInstructor) return;
    const pending = pendingPersonUpdates.get(person.id);
    const basePerson = pending ? applyPersonUpdates(person, pending.updates) : person;
    const { updates, diff } = buildPersonBackfillUpdates(basePerson, parsedInstructor);
    if (!updates || Object.keys(updates).length === 0) return;
    const mergedUpdates = pending ? { ...pending.updates, ...updates } : updates;
    if (pending?.updates?.externalIds && updates.externalIds) {
      mergedUpdates.externalIds = mergeExternalIds(pending.updates.externalIds, updates.externalIds);
    }
    const mergedDiff = pending ? [...pending.diff, ...diff] : diff;
    pendingPersonUpdates.set(person.id, { person, updates: mergedUpdates, diff: mergedDiff });
  };

  const applyRoomUpdates = (room, updates) => {
    if (!updates || Object.keys(updates).length === 0) return room;
    return { ...room, ...updates };
  };

  const queueRoomBackfill = (room, parsedRoom) => {
    if (!room?.id || !parsedRoom) return;
    if (createdRoomIds.has(room.id)) return;
    const pending = pendingRoomUpdates.get(room.id);
    const baseRoom = pending ? applyRoomUpdates(room, pending.updates) : room;
    const { updates, diff } = buildRoomBackfillUpdates(baseRoom, parsedRoom);
    if (!updates || Object.keys(updates).length === 0) return;
    const mergedUpdates = pending ? { ...pending.updates, ...updates } : updates;
    const mergedDiff = pending ? [...pending.diff, ...diff] : diff;
    pendingRoomUpdates.set(room.id, { room, updates: mergedUpdates, diff: mergedDiff });
  };

  const summary = {
    rowsTotal: Array.isArray(csvData) ? csvData.length : 0,
    rowsSkipped: 0,
    schedulesAdded: 0,
    schedulesUpdated: 0,
    schedulesUnchanged: 0,
    schedulesMetadataOnly: 0
  };

  existingRooms.forEach((room) => {
    const spaceKey = room?.spaceKey || '';
    if (spaceKey && !roomsKeyMap.has(spaceKey)) {
      roomsKeyMap.set(spaceKey, room);
    }
    buildRoomNameKeys(room).forEach((key) => roomsMap.set(key, room));
  });

  if (collisions.length > 0) {
    const summary = summarizeIdentityCollisions(collisions);
    ensureValidation();
    transaction.validation.identityCollisionSummary = summary;
    addValidation(
      'warning',
      `Found ${summary.total} duplicate schedule identities in existing data. Imports will match the preferred record for each key.`,
    );
  }

  const formatDiffValue = (value, key = '') => {
    if (value === undefined || value === null) return '';
    if (key === 'meetingPatterns' && Array.isArray(value)) {
      return value
        .map((pattern) => {
          if (pattern.day && pattern.startTime && pattern.endTime) {
            return `${pattern.day} ${pattern.startTime}-${pattern.endTime}`;
          }
          return pattern.raw || '';
        })
        .filter(Boolean)
        .join('; ');
    }
    if (Array.isArray(value) || typeof value === 'object') {
      try {
        if (Array.isArray(value)) {
          const hasObject = value.some((entry) => entry && typeof entry === 'object');
          if (hasObject) {
            return JSON.stringify(value);
          }
          return value.map((entry) => String(entry)).join(', ');
        }
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }
    return value;
  };

  let rowCounter = 0;
  for (const rowEntry of csvData) {
    rowCounter += 1;
    const rawRow = rowEntry?.raw || rowEntry;
    const baseData = rowEntry?.baseData || extractScheduleRowBaseData(rawRow, fallbackTerm);
    const rowIndex = rowEntry?.__rowIndex || rawRow?.__rowIndex || rowCounter;
    const rowLabel = `Row ${rowIndex}`;
    const mergedFromRows = Array.isArray(rowEntry?.__mergedFromRows)
      ? rowEntry.__mergedFromRows
      : null;
    const rowLineageBase = {
      rowIndex,
      rowHash: baseData.rowHash,
      courseCode: baseData.courseCode || '',
      section: baseData.section || '',
      term: baseData.term || '',
      termCode: baseData.termCode || '',
      crn: baseData.crn || '',
      clssId: baseData.clssId || '',
      ...(mergedFromRows ? { mergedFromRows } : {})
    };
    const isCancelled = isCancelledStatus(baseData.status);

    if (!baseData.courseCode) {
      addValidation('error', `${rowLabel}: Missing Course`);
      transaction.addRowLineage({ ...rowLineageBase, action: 'skipped', reason: 'Missing Course' });
      summary.rowsSkipped += 1;
      continue;
    }
    if (!baseData.term && !baseData.termCode) {
      addValidation('error', `${rowLabel}: Missing Semester`);
      transaction.addRowLineage({ ...rowLineageBase, action: 'skipped', reason: 'Missing Semester' });
      summary.rowsSkipped += 1;
      continue;
    }
    if (!baseData.instructorField && !isCancelled) {
      addValidation('error', `${rowLabel}: Missing Instructor`);
      transaction.addRowLineage({ ...rowLineageBase, action: 'skipped', reason: 'Missing Instructor' });
      summary.rowsSkipped += 1;
      continue;
    }
    if (!baseData.crn || !/^\d{5,6}$/.test(baseData.crn)) {
      addValidation('error', `${rowLabel}: Invalid CRN "${baseData.crn || ''}"`);
      transaction.addRowLineage({ ...rowLineageBase, action: 'skipped', reason: 'Invalid CRN' });
      summary.rowsSkipped += 1;
      continue;
    }

    const derivedIdentity = deriveScheduleIdentity({
      courseCode: baseData.courseCode,
      section: baseData.section,
      term: baseData.term,
      termCode: baseData.termCode,
      clssId: baseData.clssId,
      crn: baseData.crn,
      meetingPatterns: baseData.meetingPatterns,
      spaceIds: baseData.spaceIds,
      spaceDisplayNames: baseData.spaceDisplayNames
    });
    const identityKey = ((rowEntry && rowEntry.__identityKey) || derivedIdentity.primaryKey || '').toString().trim();
    const identityKeys = Array.isArray(rowEntry?.__identityKeys) && rowEntry.__identityKeys.length > 0
      ? rowEntry.__identityKeys
      : derivedIdentity.keys;
    const identitySource = ((rowEntry && rowEntry.__identitySource) || derivedIdentity.source || (identityKey ? identityKey.split(':')[0] : '')).toString().trim();
    const identity = {
      ...derivedIdentity,
      primaryKey: identityKey,
      keys: identityKeys,
      source: identitySource
    };
    if (!identityKey) {
      addValidation('error', `${rowLabel}: Unable to derive identity key`);
      transaction.addRowLineage({ ...rowLineageBase, action: 'skipped', reason: 'Missing identity key' });
      summary.rowsSkipped += 1;
      continue;
    }

    const rowLineageIdentity = {
      ...rowLineageBase,
      identityKey,
      identityKeys: identity.keys,
      identitySource: identity.source
    };

    // Precompute key fields and group key for cascading selection
    const preCourseCode = baseData.courseCode;
    const preSection = baseData.section;
    const preTerm = baseData.term;
    const groupKey = `sched_${identityKey}`;

    // Extract instructor information (exact match only, flag for review otherwise)
    const instructorField = baseData.instructorField;
    const parsedList = Array.isArray(baseData.parsedInstructors) && baseData.parsedInstructors.length > 0
      ? baseData.parsedInstructors
      : (baseData.parsedInstructor ? [baseData.parsedInstructor] : []);
    const parsedForMatch = parsedList.filter((parsed) => {
      if (!parsed) return false;
      if (parsed.isStaff) return false;
      const baylorId = normalizeBaylorId(parsed?.id);
      return Boolean(parsed?.firstName || parsed?.lastName || baylorId);
    });

    if (!isCancelled && parsedForMatch.length === 0) {
      addValidation('warning', `${rowLabel}: Instructor parsed as staff/unassigned`);
    }

    if (!isCancelled) {
      parsedForMatch.forEach((parsed) => {
        const baylorId = normalizeBaylorId(parsed?.id);
        if (!baylorId) {
          addValidation('warning', `${rowLabel}: Missing instructor ID for ${parsed?.lastName || parsed?.firstName || 'Unknown'}`);
        }
      });
    }

    let instructorId = null;
    const instructorAssignments = [];
    const instructorIds = new Set();
    const instructorPeople = new Map();
    const matchIssuesForSchedule = [];

    const resolveMatchIssue = (parsed, matchResult) => {
      const baylorId = normalizeBaylorId(parsed?.id);
      const matchKey = baylorId ? `baylor:${baylorId}` : makeNameKey(parsed?.firstName, parsed?.lastName);
      if (!matchKey) return null;
      let matchIssue = pendingMatchMap.get(matchKey) || null;
      if (!matchIssue) {
        const now = new Date().toISOString();
        const rawInstructorId = parsed?.id ? String(parsed.id).trim() : '';
        const proposedPerson = applyPersonIdentityMetadata(standardizeImportedPerson({
          firstName: parsed?.firstName || '',
          lastName: parsed?.lastName || '',
          email: '',
          baylorId: baylorId || '',
          externalIds: rawInstructorId ? { clssInstructorId: rawInstructorId } : {},
          roles: ['faculty'],
          isActive: true,
          createdAt: now,
          updatedAt: now
        }, { updateTimestamp: false }));
        const canCreatePerson = hasPersonIdentifier(proposedPerson);
        const reason = canCreatePerson
          ? (matchResult?.reason || 'No exact match')
          : 'Missing instructor identifier (ID/email/Ignite #). Link to an existing person or update the source data before importing.';
        matchIssue = transaction.addMatchIssue({
          importType: 'schedule',
          matchKey,
          reason,
          proposedPerson,
          candidates: matchResult?.candidates || [],
          scheduleChangeIds: []
        });
        if (canCreatePerson) {
          matchIssue.pendingPersonChangeId = transaction.addChange(
            'people',
            'add',
            proposedPerson,
            null,
            { groupKey: `person_${matchIssue.id}`, pendingResolution: true, matchIssueId: matchIssue.id }
          );
        }
        pendingMatchMap.set(matchKey, matchIssue);
      } else {
        const now = new Date().toISOString();
        const rawInstructorId = parsed?.id ? String(parsed.id).trim() : '';
        const nextProposedPerson = applyPersonIdentityMetadata(standardizeImportedPerson({
          firstName: parsed?.firstName || '',
          lastName: parsed?.lastName || '',
          email: '',
          baylorId: baylorId || '',
          externalIds: rawInstructorId ? { clssInstructorId: rawInstructorId } : {},
          roles: ['faculty'],
          isActive: true,
          createdAt: now,
          updatedAt: now
        }, { updateTimestamp: false }));

        matchIssue.proposedPerson = buildPersonImportUpdates(
          matchIssue.proposedPerson || {},
          nextProposedPerson,
          { updateTimestamp: false }
        ).merged;
        const pendingChange = transaction.changes.people.added.find(c => c.id === matchIssue.pendingPersonChangeId);
        if (pendingChange) {
          pendingChange.newData = buildPersonImportUpdates(
            pendingChange.newData || {},
            nextProposedPerson,
            { updateTimestamp: false }
          ).merged;
        }

        if (!matchIssue.pendingPersonChangeId && hasPersonIdentifier(matchIssue.proposedPerson)) {
          matchIssue.pendingPersonChangeId = transaction.addChange(
            'people',
            'add',
            matchIssue.proposedPerson,
            null,
            { groupKey: `person_${matchIssue.id}`, pendingResolution: true, matchIssueId: matchIssue.id }
          );
        }
      }
      return matchIssue;
    };

    for (const parsed of parsedForMatch) {
      const baylorId = normalizeBaylorId(parsed?.id);

      const matchResult = findPersonMatch({
        firstName: parsed?.firstName || '',
        lastName: parsed?.lastName || '',
        baylorId,
        clssInstructorId: parsed?.id || null
      }, existingPeople, { minScore: 0.85, maxCandidates: 5 });

      if (matchResult.status === 'exact' && matchResult.person?.id) {
        const resolvedId = resolvePersonId(matchResult.person.id);
        const canonicalPerson = peopleById.get(resolvedId) || matchResult.person;
        instructorIds.add(resolvedId);
        instructorPeople.set(resolvedId, canonicalPerson);
        queuePersonBackfill(canonicalPerson, parsed);
        instructorAssignments.push({
          personId: resolvedId,
          isPrimary: parsed?.isPrimary || false,
          percentage: Number.isFinite(parsed?.percentage) ? parsed.percentage : 100
        });
      } else {
        const matchIssue = resolveMatchIssue(parsed, matchResult);
        if (matchIssue) {
          matchIssuesForSchedule.push(matchIssue);
          instructorAssignments.push({
            matchIssueId: matchIssue.id,
            isPrimary: parsed?.isPrimary || false,
            percentage: Number.isFinite(parsed?.percentage) ? parsed.percentage : 100
          });
        }
      }
    }

    if (instructorAssignments.length > 0 && !instructorAssignments.some((a) => a.isPrimary)) {
      instructorAssignments[0].isPrimary = true;
    }

    const primaryAssignment = instructorAssignments.find((a) => a.isPrimary)
      || [...instructorAssignments].sort((a, b) => (b.percentage || 0) - (a.percentage || 0))[0];
    instructorId = primaryAssignment?.personId || null;

    const primaryParsed = parsedForMatch.find((info) => info.isPrimary)
      || parsedForMatch[0]
      || parsedList[0]
      || baseData.parsedInstructor;
    const primaryBaylorId = normalizeBaylorId(primaryParsed?.id);
    const primaryInstructor = instructorId ? instructorPeople.get(instructorId) : null;

    // Extract room information (support simultaneous multi-rooms)
    const splitRooms = Array.isArray(baseData.spaceDisplayNames) ? baseData.spaceDisplayNames : [];
    const resolvedSpaceKeys = [];
    const resolvedDisplayNames = [];
    if (splitRooms.length > 0) {
      for (const singleRoom of splitRooms) {
        const nameKey = normalizeRoomName(singleRoom);
        if (!nameKey) continue;

        const parsed = parseRoomLabel(singleRoom);
        const buildingCode = (parsed?.buildingCode || parsed?.building?.code || '').toString().trim().toUpperCase();
        const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || '');
        const spaceKey = parsed?.spaceKey || (buildingCode && spaceNumber ? buildSpaceKey(buildingCode, spaceNumber) : '');

        let room = spaceKey ? roomsKeyMap.get(spaceKey) : null;
        if (!room) {
          room = roomsMap.get(nameKey) || null;
        }

        let canonicalSpaceKey = spaceKey;
        let canonicalDisplayName = parsed?.displayName || singleRoom;
        if (room) {
          if (room.spaceKey) canonicalSpaceKey = room.spaceKey;
          if (room.displayName) canonicalDisplayName = room.displayName;
        }

        if (!room && spaceKey) {
          const now = new Date().toISOString();
          const buildingDisplayName = parsed?.building?.displayName || buildingCode || '';
          const displayName = parsed?.displayName || singleRoom;
          const newRoom = standardizeImportedRoom({
            spaceKey: spaceKey || '',
            spaceNumber,
            buildingCode,
            buildingDisplayName,
            displayName,
            capacity: null,
            type: 'Classroom',
            isActive: true,
            createdAt: now,
            updatedAt: now
          });
          transaction.addChange('rooms', 'add', newRoom, null, { groupKey });
          const placeholder = { id: spaceKey, ...newRoom };
          createdRoomIds.add(placeholder.id);
          roomsKeyMap.set(spaceKey, placeholder);
          buildRoomNameKeys(placeholder).forEach((key) => roomsMap.set(key, placeholder));
          room = placeholder;
          canonicalSpaceKey = placeholder.spaceKey || spaceKey;
          canonicalDisplayName = placeholder.displayName || displayName;
        }

        if (canonicalSpaceKey) {
          resolvedSpaceKeys.push(canonicalSpaceKey);
        }
        if (canonicalDisplayName) {
          resolvedDisplayNames.push(canonicalDisplayName);
        }

        if (room?.id) {
          queueRoomBackfill(room, parsed);
        }
      }
    }

    const courseCode = preCourseCode;
    const section = preSection;
    const term = preTerm;

    const matchResult = resolveScheduleIdentityMatch(identity.keys, scheduleIdentityIndex);
    let existingSchedule = matchResult.schedule || null;
    const importMeta = {
      rowIndex,
      rowHash: baseData.rowHash,
      identityKey,
      identityKeys: identity.keys,
      identitySource: identity.source,
      matchedKey: matchResult.matchedKey || ''
    };

    const finalCrn = baseData.crn;
    const instructorDisplayName = parsedList.length > 1
      ? (baseData.normalizedInstructorName || instructorField)
      : normalizeInstructorDisplayName(primaryInstructor, primaryParsed, instructorField);
    const instructorMatchIssueIds = instructorAssignments
      .map((assignment) => assignment.matchIssueId)
      .filter(Boolean);
    const preferredSpaceIds = resolvedSpaceKeys.length > 0
      ? resolvedSpaceKeys
      : (baseData.spaceIds || []);
    const preferredDisplayNames = resolvedDisplayNames.length > 0
      ? resolvedDisplayNames
      : (baseData.spaceDisplayNames || splitRooms);
    const uniqueSpaceIds = baseData.locationType === 'no_room'
      ? []
      : Array.from(new Set(preferredSpaceIds.filter(Boolean)));
    const spaceDisplayNames = baseData.locationType === 'no_room'
      ? []
      : Array.from(new Set(preferredDisplayNames.filter(Boolean)));

    const scheduleData = {
      courseCode,
      courseTitle: baseData.courseTitle,
      subjectCode: baseData.subjectCode || '',
      catalogNumber: baseData.catalogNumber || '',
      departmentCode: baseData.departmentCode || '',
      program: baseData.program || '',
      courseLevel: baseData.courseLevel || 0,
      section,
      crn: finalCrn,
      clssId: baseData.clssId || '',
      identityKey,
      identityKeys: identity.keys,
      identitySource: identity.source,
      credits: baseData.credits ?? null,
      enrollment: baseData.enrollment ?? null,
      maxEnrollment: baseData.maxEnrollment ?? null,
      waitCap: baseData.waitCap ?? null,
      waitTotal: baseData.waitTotal ?? null,
      openSeats: baseData.openSeats ?? null,
      waitAvailable: baseData.waitAvailable ?? null,
      reservedSeats: baseData.reservedSeats ?? null,
      reservedSeatsEnrollment: baseData.reservedSeatsEnrollment ?? null,
      term,
      termCode: baseData.termCode,
      academicYear: baseData.academicYear,
      instructorId: instructorId,
      instructorIds: Array.from(instructorIds),
      instructorAssignments,
      // Prefer normalized instructor name in "Last, First" format
      instructorName: instructorDisplayName,
      instructorBaylorId: primaryBaylorId,
      instructorMatchIssueIds,
      // Multi-room fields
      spaceIds: uniqueSpaceIds,
      spaceDisplayNames,
      meetingPatterns: baseData.meetingPatterns,
      scheduleType: baseData.scheduleType,
      instructionMethod: baseData.instructionMethod || '',
      isOnline: baseData.isOnline === true,
      onlineMode: baseData.isOnline
        ? (Array.isArray(baseData.meetingPatterns) && baseData.meetingPatterns.length > 0 ? 'synchronous' : 'asynchronous')
        : null,
      locationType: baseData.locationType || 'room',
      locationLabel: baseData.locationLabel || '',
      status: baseData.status,
      partOfTerm: baseData.partOfTerm || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const standardizedScheduleData = standardizeImportedSchedule(scheduleData);

    // Preserve match-issue assignments for commit-time resolution.
    standardizedScheduleData.instructorAssignments = scheduleData.instructorAssignments;
    standardizedScheduleData.instructorIds = scheduleData.instructorIds;
    standardizedScheduleData.instructorId = scheduleData.instructorId || '';

    const crossListFromRaw = parseCrossListCrns(rawRow) || [];
    const crossListFromBase = Array.isArray(baseData.crossListCrns) ? baseData.crossListCrns : [];
    const crossListCrns = Array.from(new Set([...crossListFromRaw, ...crossListFromBase].filter(Boolean)));
    if (crossListCrns.length > 0) {
      standardizedScheduleData.crossListCrns = crossListCrns;
    }

    const {
      instructorName: _omitInstructorName,
      instructorMatchIssueIds: _omitMatchIssueIds,
      ...scheduleWrite
    } = standardizedScheduleData;
    const scheduleWriteForUpdate = {
      ...scheduleWrite
    };

    if (existingSchedule) {
      const allowEmptyFields = (scheduleWrite.locationType === 'no_room' || scheduleWrite.isOnline)
        ? ['spaceIds', 'spaceDisplayNames']
        : [];
      const { updates, hasChanges } = buildScheduleImportUpdates(existingSchedule, scheduleWriteForUpdate, { allowEmptyFields });
      if (!hasChanges) {
        summary.schedulesUnchanged += 1;
        transaction.addRowLineage({
          ...rowLineageIdentity,
          action: 'unchanged',
          scheduleId: existingSchedule.id,
          matchedKey: matchResult.matchedKey || ''
        });
        continue;
      }

      const updateKeys = Object.keys(updates);
      const visibleUpdateKeys = updateKeys.filter((key) => !SCHEDULE_INTERNAL_UPDATE_FIELDS.has(key));
      const isMetadataOnly = visibleUpdateKeys.length === 0;

      const changeId = transaction.addChange('schedules', 'modify', updates, existingSchedule, { groupKey, importMeta });
      const change = transaction.changes.schedules.modified.find((c) => c.id === changeId);
      if (change) {
        change.diff = Object.entries(updates).map(([key, value]) => ({
          key,
          from: formatDiffValue(existingSchedule[key], key),
          to: formatDiffValue(value, key)
        }));
      }
      matchIssuesForSchedule.forEach((issue) => {
        if (!issue) return;
        issue.scheduleChangeIds = Array.isArray(issue.scheduleChangeIds)
          ? Array.from(new Set([...issue.scheduleChangeIds, changeId]))
          : [changeId];
      });
      transaction.addRowLineage({
        ...rowLineageIdentity,
        action: 'update',
        scheduleId: existingSchedule.id,
        changeId,
        matchedKey: matchResult.matchedKey || ''
      });
      if (isMetadataOnly) {
        summary.schedulesMetadataOnly += 1;
      } else {
        summary.schedulesUpdated += 1;
      }
      continue;
    }

    const scheduleChangeId = transaction.addChange('schedules', 'add', scheduleWrite, null, { groupKey, importMeta });
    matchIssuesForSchedule.forEach((issue) => {
      if (!issue) return;
      issue.scheduleChangeIds = Array.isArray(issue.scheduleChangeIds)
        ? Array.from(new Set([...issue.scheduleChangeIds, scheduleChangeId]))
        : [scheduleChangeId];
    });
    transaction.addRowLineage({
      ...rowLineageIdentity,
      action: 'add',
      scheduleId: buildScheduleDocId(identity),
      changeId: scheduleChangeId
    });
    summary.schedulesAdded += 1;
  }

  pendingPersonUpdates.forEach(({ person, updates, diff }) => {
    if (!updates || Object.keys(updates).length === 0) return;
    const payload = { ...updates, updatedAt: new Date().toISOString() };
    const changeId = transaction.addChange('people', 'modify', payload, person, { groupKey: `person_${person.id}` });
    const change = transaction.changes.people.modified.find((c) => c.id === changeId);
    if (change && diff && diff.length > 0) {
      change.diff = diff;
    }
  });

  pendingRoomUpdates.forEach(({ room, updates, diff }) => {
    if (!updates || Object.keys(updates).length === 0) return;
    const payload = { ...updates, updatedAt: new Date().toISOString() };
    const changeId = transaction.addChange('rooms', 'modify', payload, room, { groupKey: `room_${room.id}` });
    const change = transaction.changes.rooms.modified.find((c) => c.id === changeId);
    if (change && diff && diff.length > 0) {
      change.diff = diff;
    }
  });

  summary.peopleAdded = transaction.changes.people.added.length;
  summary.roomsAdded = transaction.changes.rooms.added.length;
  summary.matchIssues = transaction.matchingIssues.length;
  summary.rowsProcessed = summary.rowsTotal - summary.rowsSkipped;
  transaction.previewSummary = summary;
};

const previewDirectoryChanges = async (csvData, transaction, existingPeople, existingRooms = [], options = {}) => {
  const pendingMatchMap = new Map();
  const roomsMap = new Map();
  const roomsKeyMap = new Map();
  const { includeOfficeRooms = true } = options;
  const peopleIndex = buildPeopleIndex(existingPeople);
  const { peopleById, resolvePersonId } = peopleIndex;

  existingRooms.forEach((room) => {
    const spaceKey = room?.spaceKey || '';
    if (spaceKey && !roomsKeyMap.has(spaceKey)) {
      roomsKeyMap.set(spaceKey, room);
    }
    buildRoomNameKeys(room).forEach((key) => roomsMap.set(key, room));
  });

  for (const rowEntry of csvData) {
    const {
      row,
      basePerson,
      firstName: rawFirstName,
      lastName: rawLastName,
      email: rawEmail,
      phone: rawPhone,
      baylorId: rawBaylorId,
      clssInstructorId: rawClssInstructorId,
      ignitePersonNumber: rawIgnitePersonNumber,
      hasAnyIdentity
    } = extractDirectoryPersonFields(rowEntry);

    if (!hasAnyIdentity) continue;

    const officeRaw = row['Office'] || row['Office Location'] || '';
    const parsedOffice = parseRoomLabel(officeRaw);
    const officeSpaceKey = parsedOffice?.spaceKey || '';
    const officeBuildingCode = parsedOffice?.buildingCode || (officeSpaceKey ? officeSpaceKey.split(':')[0] : '');
    const officeSpaceNumber = parsedOffice?.spaceNumber || '';
    const officeBuildingName = parsedOffice?.building?.displayName || officeBuildingCode || '';
    const officeDisplayName = parsedOffice?.displayName || officeRaw;
    const officeNameKey = normalizeRoomName(officeRaw);
    let existingOfficeRoom = officeSpaceKey ? roomsKeyMap.get(officeSpaceKey) : null;
    if (!existingOfficeRoom && officeNameKey) {
      existingOfficeRoom = roomsMap.get(officeNameKey) || null;
    }
    const nextOfficeSpaceIds = officeSpaceKey ? [officeSpaceKey] : [];
    const nextOffices = officeSpaceKey ? [officeDisplayName] : [];
    const nextOfficeSpaceId = nextOfficeSpaceIds[0] || '';
    const nextOffice = nextOffices[0] || '';

    const now = new Date().toISOString();
    const basePersonData = {
      ...basePerson,
      firstName: rawFirstName,
      lastName: rawLastName,
      email: rawEmail,
      roles: ['faculty'], // default to faculty for directory imports
      phone: rawPhone,
      baylorId: rawBaylorId || basePerson.baylorId || '',
      ignitePersonNumber: rawIgnitePersonNumber || basePerson.ignitePersonNumber || '',
      externalIds: {
        ...(basePerson.externalIds || {}),
        ...(rawBaylorId ? { baylorId: rawBaylorId } : {}),
        ...(rawClssInstructorId ? { clssInstructorId: rawClssInstructorId } : {}),
        ...(rawIgnitePersonNumber
          ? { ignitePersonNumber: rawIgnitePersonNumber, personNumber: rawIgnitePersonNumber }
          : {})
      },
      office: nextOffice,
      offices: nextOffices,
      officeSpaceId: nextOfficeSpaceId,
      officeSpaceIds: nextOfficeSpaceIds,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    const normalizedPerson = applyPersonIdentityMetadata(
      standardizeImportedPerson(basePersonData, { updateTimestamp: false })
    );
    const firstName = normalizedPerson.firstName || '';
    const lastName = normalizedPerson.lastName || '';
    const email = normalizedPerson.email || '';
    const phone = normalizedPerson.phone || '';
    const office = normalizedPerson.office || '';
    const normalizedOfficeSpaceIds = Array.isArray(normalizedPerson.officeSpaceIds)
      ? normalizedPerson.officeSpaceIds.filter(Boolean).map((v) => String(v).trim()).filter(Boolean)
      : [];
    const normalizedOfficeSpaceId = normalizedOfficeSpaceIds[0] || (normalizedPerson.officeSpaceId || '');
    const normalizedOffices = Array.isArray(normalizedPerson.offices)
      ? normalizedPerson.offices.filter(Boolean).map((v) => String(v).trim()).filter(Boolean)
      : office ? [office] : [];
    const nameKey = makeNameKey(firstName, lastName);
    const emailKey = email.toLowerCase();
    const personIdentityKey = normalizedPerson.identityKey || '';
    const personData = normalizedPerson;

    const matchResult = findPersonMatch({
      firstName,
      lastName,
      email,
      baylorId: rawBaylorId || normalizedPerson.baylorId,
      ignitePersonNumber: rawIgnitePersonNumber || normalizedPerson.ignitePersonNumber,
      clssInstructorId: rawClssInstructorId || normalizedPerson.externalIds?.clssInstructorId,
      externalIds: normalizedPerson.externalIds
    }, existingPeople, { minScore: 0.85, maxCandidates: 5 });
    const matchedPerson = matchResult.status === 'exact' ? matchResult.person : null;
    const existingPerson = matchedPerson?.id
      ? (peopleById.get(resolvePersonId(matchedPerson.id)) || matchedPerson)
      : null;

    if (existingPerson) {
      const groupKey = `dir_${existingPerson.id}`;

      if (includeOfficeRooms && officeSpaceKey && !existingOfficeRoom) {
        const now = new Date().toISOString();
        const newRoom = standardizeImportedRoom({
          spaceKey: officeSpaceKey,
          spaceNumber: officeSpaceNumber,
          buildingCode: officeBuildingCode,
          buildingDisplayName: officeBuildingName,
          displayName: officeDisplayName,
          capacity: null,
          type: 'Office',
          isActive: true,
          createdAt: now,
          updatedAt: now
        });
        transaction.addChange('rooms', 'add', newRoom, null, { groupKey });
        const placeholder = { id: officeSpaceKey, ...newRoom };
        roomsKeyMap.set(officeSpaceKey, placeholder);
        buildRoomNameKeys(placeholder).forEach((key) => roomsMap.set(key, placeholder));
      }

      const { updates, diff, hasChanges } = buildPersonImportUpdates(
        existingPerson,
        {
          ...personData,
          email,
          phone,
          office,
          officeSpaceId: normalizedOfficeSpaceId,
          officeSpaceIds: normalizedOfficeSpaceIds,
          offices: normalizedOffices
        }
      );

      if (hasChanges) {
        const changeId = transaction.addChange('people', 'modify', updates, existingPerson, { groupKey });
        // Attach diff for UI consumption
        const last = transaction.changes.people.modified.find(c => c.id === changeId);
        if (last) last.diff = diff;
      }
    } else {
      const igniteKey = rawIgnitePersonNumber ? `ignite:${rawIgnitePersonNumber}` : '';
      const matchKey = emailKey || personIdentityKey || igniteKey || nameKey;
      if (!matchKey) {
        continue;
      }

      let matchIssue = pendingMatchMap.get(matchKey) || null;
      if (!matchIssue) {
        const groupKey = `dir_${matchKey}`;
        matchIssue = transaction.addMatchIssue({
          importType: 'directory',
          matchKey,
          reason: hasPersonIdentifier(personData)
            ? (matchResult?.reason || 'No exact match')
            : 'Missing person identifier (email/Baylor ID/CLSS ID/Ignite #). Link to an existing person or update the source data before importing.',
          proposedPerson: personData,
          candidates: matchResult?.candidates || []
        });

        if (includeOfficeRooms && officeSpaceKey && !existingOfficeRoom && !roomsKeyMap.has(officeSpaceKey)) {
          const now = new Date().toISOString();
          const newRoom = standardizeImportedRoom({
            spaceKey: officeSpaceKey,
            spaceNumber: officeSpaceNumber,
            buildingCode: officeBuildingCode,
            buildingDisplayName: officeBuildingName,
            displayName: officeDisplayName,
            capacity: null,
            type: 'Office',
            isActive: true,
            createdAt: now,
            updatedAt: now
          });
          transaction.addChange('rooms', 'add', newRoom, null, { groupKey });
          const placeholder = { id: officeSpaceKey, ...newRoom };
          roomsKeyMap.set(officeSpaceKey, placeholder);
          buildRoomNameKeys(placeholder).forEach((key) => roomsMap.set(key, placeholder));
        }

        if (hasPersonIdentifier(personData)) {
          matchIssue.pendingPersonChangeId = transaction.addChange(
            'people',
            'add',
            personData,
            null,
            { groupKey, pendingResolution: true, matchIssueId: matchIssue.id }
          );
        }
        pendingMatchMap.set(matchKey, matchIssue);
      } else {
        matchIssue.proposedPerson = buildPersonImportUpdates(
          matchIssue.proposedPerson || {},
          personData,
          { updateTimestamp: false }
        ).merged;
        const pendingChange = transaction.changes.people.added.find(c => c.id === matchIssue.pendingPersonChangeId);
        if (pendingChange) {
          pendingChange.newData = buildPersonImportUpdates(
            pendingChange.newData || {},
            personData,
            { updateTimestamp: false }
          ).merged;
        }
        if (!matchIssue.pendingPersonChangeId && hasPersonIdentifier(matchIssue.proposedPerson)) {
          matchIssue.pendingPersonChangeId = transaction.addChange(
            'people',
            'add',
            matchIssue.proposedPerson,
            null,
            { groupKey: `dir_${matchKey}`, pendingResolution: true, matchIssueId: matchIssue.id }
          );
        }
        if (includeOfficeRooms && officeSpaceKey && !existingOfficeRoom && !roomsKeyMap.has(officeSpaceKey)) {
          const groupKey = `dir_${matchKey}`;
          const now = new Date().toISOString();
          const newRoom = standardizeImportedRoom({
            displayName: parsedOffice.displayName,
            spaceKey: officeSpaceKey,
            spaceNumber: officeSpaceNumber,
            buildingCode: officeBuildingCode,
            buildingDisplayName: officeBuildingName,
            capacity: null,
            type: 'Office',
            isActive: true,
            createdAt: now,
            updatedAt: now
          });
          transaction.addChange('rooms', 'add', newRoom, null, { groupKey });
          const placeholder = { id: officeSpaceKey, ...newRoom };
          roomsKeyMap.set(officeSpaceKey, placeholder);
          buildRoomNameKeys(placeholder).forEach((key) => roomsMap.set(key, placeholder));
        }
      }
    }
  }
};

export const shouldSkipCommitSecondPassChange = (change, handledFirstPassChangeIds) => (
  Boolean(
    change?.id &&
    handledFirstPassChangeIds instanceof Set &&
    handledFirstPassChangeIds.has(change.id)
  )
);

const normalizeCleanupIdList = (ids = []) => Array.from(
  new Set(
    Array.from(ids || [])
      .map((id) => (id || '').toString().trim())
      .filter(Boolean)
  )
);

export const buildImportEntityCleanupPreviewOptions = ({
  transactionId = '',
  peopleIds = [],
  roomIds = [],
} = {}) => {
  const cleanupPeopleIdList = normalizeCleanupIdList(peopleIds);
  const cleanupRoomIdList = normalizeCleanupIdList(roomIds);

  return {
    transactionId,
    peopleIds: cleanupPeopleIdList,
    roomIds: cleanupRoomIdList,
    mergePeopleDuplicates: cleanupPeopleIdList.length > 0,
    mergeRoomDuplicates: cleanupRoomIdList.length > 0,
    // Keep import rollback bounded to changes tracked by the import transaction.
    // Actual duplicate merges are handled from the Data Health Check review queue.
    dryRun: true,
  };
};

// Commit transaction changes to database
export const commitTransaction = async (
  transactionId,
  selectedChanges = null,
  selectedFieldMap = null,
  matchResolutions = null,
  options = {},
) => {
  const {
    autoFinalizeIntegrity = true,
  } = options || {};
  const transactions = await fetchImportTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'preview') {
    throw new Error('Transaction is not in preview state');
  }

  if (transaction.type === 'schedule') {
    const missingRequired = Array.isArray(transaction.importMetadata?.missingRequired)
      ? transaction.importMetadata.missingRequired.filter(Boolean)
      : [];
    if (missingRequired.length > 0) {
      throw new Error(
        `Cannot commit import: missing required CLSS fields (${missingRequired.join(', ')}). Update the CLSS profile mapping and regenerate preview.`,
      );
    }
  }

  const matchingIssues = Array.isArray(transaction.matchingIssues) ? transaction.matchingIssues : [];
  const resolutionMap = matchResolutions || {};
  const allowedResolutionActions = new Set(['link', 'create', 'exclude']);
  const unresolvedIssues = matchingIssues.filter((issue) => {
    const action = resolutionMap?.[issue.id]?.action;
    return !allowedResolutionActions.has(action);
  });
  if (unresolvedIssues.length > 0) {
    throw new Error(
      `Resolve ${unresolvedIssues.length} person match${unresolvedIssues.length === 1 ? '' : 'es'} before committing. Required actions: link, create, or exclude.`,
    );
  }

  const invalidLinkIssues = matchingIssues.filter((issue) => (
    resolutionMap?.[issue.id]?.action === 'link' && !resolutionMap?.[issue.id]?.personId
  ));
  if (invalidLinkIssues.length > 0) {
    throw new Error(
      `Select an existing person for ${invalidLinkIssues.length} link resolution${invalidLinkIssues.length === 1 ? '' : 's'} before committing.`,
    );
  }

  const invalidCreateIssues = matchingIssues.filter((issue) => (
    resolutionMap?.[issue.id]?.action === 'create' && !issue.pendingPersonChangeId
  ));
  if (invalidCreateIssues.length > 0) {
    throw new Error(
      `Cannot create ${invalidCreateIssues.length} person record${invalidCreateIssues.length === 1 ? '' : 's'} from the import data because an identifier is missing (email/Baylor ID/CLSS ID/Ignite #). Link to an existing person or update the source data, then retry.`
    );
  }

  const selectedChangeIds = selectedChanges ? new Set(selectedChanges) : null;
  const resolutionChangeIds = new Set();
  const allChanges = transaction.getAllChanges();
  const allChangesById = new Map(allChanges.map((change) => [change.id, change]));

  const excludedIssueSummaries = [];
  const excludedChangeIds = new Set();

  matchingIssues.forEach((issue) => {
    const resolution = resolutionMap?.[issue.id];
    if (resolution?.action !== 'exclude') return;

    const directExcludedIds = new Set([
      ...(Array.isArray(issue.scheduleChangeIds) ? issue.scheduleChangeIds : []),
      issue.pendingPersonChangeId,
    ].filter(Boolean));
    const relatedGroupKeys = new Set();

    directExcludedIds.forEach((changeId) => {
      const change = allChangesById.get(changeId);
      if (change?.groupKey) {
        relatedGroupKeys.add(change.groupKey);
      }
    });

    allChanges.forEach((change) => {
      if (!change?.id) return;
      if (directExcludedIds.has(change.id)) {
        excludedChangeIds.add(change.id);
        return;
      }
      if (change.groupKey && relatedGroupKeys.has(change.groupKey)) {
        excludedChangeIds.add(change.id);
      }
    });

    excludedIssueSummaries.push({
      issueId: issue.id,
      action: 'exclude',
      reason: (resolution?.reason || '').toString().trim(),
      impactedScheduleRows: Array.isArray(issue.scheduleChangeIds)
        ? issue.scheduleChangeIds.length
        : 0,
    });
  });

  const chunkItems = (items, size = 10) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  };

  const loadExistingDataForCommit = async () => {
    const normalizeId = (value) => (value || '').toString().trim();
    const personIds = new Set();
    const roomIds = new Set();
    const shouldLoadAllPeopleForIdentity = allChanges.some(
      (change) => change?.collection === 'people' && change?.action === 'add'
    );

    const addPersonId = (value) => {
      const id = normalizeId(value);
      if (id) personIds.add(id);
    };
    const addRoomId = (value) => {
      const id = normalizeId(value);
      if (id) roomIds.add(id);
    };

    // IDs referenced by match-resolution links (must exist for commit).
    matchingIssues.forEach((issue) => {
      const resolution = resolutionMap[issue.id];
      if (resolution?.action === 'link' && resolution.personId) {
        addPersonId(resolution.personId);
      }
    });

    const collectFromSchedule = (schedule) => {
      if (!schedule || typeof schedule !== 'object') return;
      addPersonId(schedule.instructorId);
      (Array.isArray(schedule.instructorIds) ? schedule.instructorIds : []).forEach(addPersonId);
      (Array.isArray(schedule.instructorAssignments) ? schedule.instructorAssignments : []).forEach((assignment) => {
        addPersonId(assignment?.personId);
      });
      (Array.isArray(schedule.spaceIds) ? schedule.spaceIds : []).forEach(addRoomId);
    };

    transaction.getAllChanges().forEach((change) => {
      if (!change || typeof change !== 'object') return;

      if (change.collection === 'schedules') {
        collectFromSchedule(change.newData);
        collectFromSchedule(change.originalData);
        return;
      }

      if (change.collection === 'people') {
        addPersonId(change.originalData?.id);
        addPersonId(change.newData?.id);
        addPersonId(change.originalData?.mergedInto);
        addPersonId(change.newData?.mergedInto);
        return;
      }

      if (change.collection === 'rooms') {
        addRoomId(change.originalData?.id);
        addRoomId(change.originalData?.spaceKey);
        addRoomId(change.newData?.id);
        addRoomId(change.newData?.spaceKey);
      }
    });

    const fetchDocsByIds = async (collectionName, ids = []) => {
      const uniqueIds = Array.from(
        new Set((Array.isArray(ids) ? ids : []).map(normalizeId).filter(Boolean))
      );
      if (uniqueIds.length === 0) return [];

      const snapshots = await Promise.all(
        chunkItems(uniqueIds, 10).map((chunk) => (
          getDocs(
            query(
              collection(db, collectionName),
              where(documentId(), 'in', chunk)
            )
          )
        ))
      );

      const results = [];
      const seenIds = new Set();
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((docSnap) => {
          if (seenIds.has(docSnap.id)) return;
          seenIds.add(docSnap.id);
          results.push({ id: docSnap.id, ...docSnap.data() });
        });
      });
      return results;
    };

    const loadPeopleForIds = async (seedIds = []) => {
      const queue = new Set((Array.isArray(seedIds) ? seedIds : []).map(normalizeId).filter(Boolean));
      const peopleById = new Map();
      let iterations = 0;

      // Follow mergedInto chains so resolvePersonId works for referenced people.
      while (queue.size > 0 && iterations < 10) {
        const batchIds = Array.from(queue).filter((id) => !peopleById.has(id));
        queue.clear();
        if (batchIds.length === 0) break;

        const fetched = await fetchDocsByIds(COLLECTIONS.PEOPLE, batchIds);
        fetched.forEach((person) => {
          if (person?.id) peopleById.set(person.id, person);
        });
        fetched.forEach((person) => {
          const mergedInto = normalizeId(person?.mergedInto);
          if (mergedInto && !peopleById.has(mergedInto)) {
            queue.add(mergedInto);
          }
        });

        iterations += 1;
      }

      return Array.from(peopleById.values());
    };

    const peoplePromise = shouldLoadAllPeopleForIdentity
      ? getDocs(collection(db, COLLECTIONS.PEOPLE)).then((snapshot) => (
        snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      ))
      : loadPeopleForIds(Array.from(personIds));
    const roomsPromise = fetchDocsByIds(COLLECTIONS.ROOMS, Array.from(roomIds));

    let schedulesPromise = Promise.resolve([]);
    if (transaction.type === 'schedule') {
      schedulesPromise = (async () => {
        const termCodes = new Set();
        const termLabels = new Set();

        const addTermFromSchedule = (schedule) => {
          if (!schedule || typeof schedule !== 'object') return;
          const termCode = (schedule.termCode || '').toString().trim();
          const termLabel = normalizeTermLabel(schedule.term || '') || (schedule.term || '').toString().trim();
          if (termCode) termCodes.add(termCode);
          if (termLabel) termLabels.add(termLabel);
        };

        transaction.getAllChanges().forEach((change) => {
          if (change.collection !== 'schedules') return;
          addTermFromSchedule(change.newData);
          addTermFromSchedule(change.originalData);
        });

        const normalizedTxSemester = normalizeTermLabel(transaction.semester || '');
        const txTermCode = termCodeFromLabel(normalizedTxSemester || transaction.semester || '');
        if (txTermCode) termCodes.add(txTermCode);
        if (normalizedTxSemester) termLabels.add(normalizedTxSemester);

        const scheduleQueries = [];
        if (termCodes.size > 0) {
          chunkItems(Array.from(termCodes)).forEach((chunk) => {
            scheduleQueries.push(query(collection(db, COLLECTIONS.SCHEDULES), where('termCode', 'in', chunk)));
          });
        }
        if (termLabels.size > 0) {
          chunkItems(Array.from(termLabels)).forEach((chunk) => {
            scheduleQueries.push(query(collection(db, COLLECTIONS.SCHEDULES), where('term', 'in', chunk)));
          });
        }

        if (scheduleQueries.length === 0) return [];

        const scheduleSnapshots = await Promise.all(scheduleQueries.map((q) => getDocs(q)));
        const seenIds = new Set();
        const collected = [];
        scheduleSnapshots.forEach((snapshot) => {
          snapshot.docs.forEach((docSnap) => {
            if (seenIds.has(docSnap.id)) return;
            seenIds.add(docSnap.id);
            collected.push({ id: docSnap.id, ...docSnap.data() });
          });
        });
        return collected;
      })();
    }

    const [people, rooms, schedules] = await Promise.all([
      peoplePromise,
      roomsPromise,
      schedulesPromise
    ]);

    return { people, rooms, schedules };
  };

  const existingData = await loadExistingDataForCommit();
  const existingPeopleData = existingData.people || [];
  const existingRoomsData = existingData.rooms || [];
  const existingSchedulesData = existingData.schedules || [];

  const peopleIndex = buildPeopleIndex(existingPeopleData);
  const { peopleById, resolvePersonId } = peopleIndex;
  const {
    index: personIdentityIndex,
    collisions: existingPersonIdentityCollisions
  } = buildPersonIdentityIndex(existingPeopleData);
  const entityResolutionReport = {
    existingPersonIdentityCollisions: existingPersonIdentityCollisions.length,
    personCreatesMatchedExisting: 0,
    deterministicPersonCreates: 0,
    courseUpserts: 0,
    duplicateCreateChangesSuppressed: 0,
    personMergeUpdates: []
  };

  const registerPersonIdentity = (person) => {
    if (!person?.id) return;
    const { index } = buildPersonIdentityIndex([person]);
    index.forEach((entry, key) => {
      if (key && !personIdentityIndex.has(key)) {
        personIdentityIndex.set(key, entry);
      }
    });
  };

  const linkedPersonIds = new Set();
  matchingIssues.forEach((issue) => {
    const resolution = resolutionMap[issue.id];
    if (resolution?.action === 'link' && resolution.personId) {
      linkedPersonIds.add(resolvePersonId(resolution.personId));
    }
  });

  const linkedPeopleMap = new Map();
  linkedPersonIds.forEach((personId) => {
    const person = peopleById.get(personId);
    if (person) linkedPeopleMap.set(personId, person);
  });

  matchingIssues.forEach((issue) => {
    const resolution = resolutionMap[issue.id];
    if (resolution?.action !== 'link' || !resolution.personId) return;
    const resolvedPersonId = resolvePersonId(resolution.personId);
    const existingPerson = linkedPeopleMap.get(resolvedPersonId);
    if (!existingPerson) {
      throw new Error(`Linked person not found for match resolution: ${resolvedPersonId}`);
    }
    const updates = buildLinkedPersonResolutionUpdates(
      existingPerson,
      issue.proposedPerson,
      issue.importType
    );
    if (Object.keys(updates).length > 0) {
      const changeId = transaction.addChange('people', 'modify', updates, existingPerson, { groupKey: `match_${issue.id}` });
      resolutionChangeIds.add(changeId);
    }
  });

  const batchWriter = createBatchWriter({
    onFlush: async () => {
      try {
        await updateTransactionInStorage(transaction);
      } catch (error) {
        console.warn('Skipping transaction persistence during batch flush:', error?.message || error);
      }
    }
  });
  const forcedChangeIds = new Set(resolutionChangeIds);
  matchingIssues.forEach((issue) => {
    const resolution = resolutionMap[issue.id];
    if (resolution?.action === 'create' && issue.pendingPersonChangeId) {
      forcedChangeIds.add(issue.pendingPersonChangeId);
    }
  });
  const latestChanges = transaction.getAllChanges();
  const initialChanges = selectedChangeIds
    ? latestChanges.filter((change) => selectedChangeIds.has(change.id) || forcedChangeIds.has(change.id))
    : latestChanges;
  const changesToApply = initialChanges.filter(change => {
    if (excludedChangeIds.has(change.id)) {
      return false;
    }
    if (change.pendingResolution && change.matchIssueId) {
      const resolution = resolutionMap[change.matchIssueId];
      return resolution && resolution.action === 'create';
    }
    return true;
  });

  const excludedScheduleRowCount = matchingIssues
    .filter((issue) => resolutionMap?.[issue.id]?.action === 'exclude')
    .reduce((total, issue) => (
      total + (Array.isArray(issue.scheduleChangeIds) ? issue.scheduleChangeIds.length : 0)
    ), 0);

  const buildValidationSubset = (changes = []) => {
    const subset = {
      changes: {
        schedules: { added: [], modified: [], deleted: [] },
        people: { added: [], modified: [], deleted: [] },
        rooms: { added: [], modified: [], deleted: [] }
      },
      matchingIssues: Array.isArray(transaction.matchingIssues) ? transaction.matchingIssues : [],
      validation: transaction.validation || { errors: [], warnings: [] }
    };

    changes.forEach((change) => {
      if (!change?.collection || !change?.action) return;
      const bucket = change.action === 'add'
        ? 'added'
        : change.action === 'modify'
          ? 'modified'
          : 'deleted';
      if (subset.changes?.[change.collection]?.[bucket]) {
        subset.changes[change.collection][bucket].push(change);
      }
    });

    return subset;
  };

  // Defensive: ensure create-time invariants are present before validation/writes.
  const nowISO = new Date().toISOString();
  changesToApply.forEach((change) => {
    if (change?.collection !== 'people' || change?.action !== 'add') return;
    const personPayload = applyPersonIdentityMetadata({ ...(change.newData || {}) });
    if (typeof personPayload.createdAt !== 'string' || personPayload.createdAt.trim() === '') {
      personPayload.createdAt = nowISO;
    }
    if (typeof personPayload.updatedAt !== 'string' || personPayload.updatedAt.trim() === '') {
      personPayload.updatedAt = nowISO;
    }
    change.newData = personPayload;
  });

  // Validate immediately before any writes (fail-fast on errors, allow warnings).
  const commitValidationReport = validateImportTransaction(
    buildValidationSubset(changesToApply),
    {
      schedules: existingSchedulesData,
      people: existingPeopleData,
      rooms: existingRoomsData
    }
  );
  transaction.validationReport = commitValidationReport;
  if (!commitValidationReport.isValid) {
    const examples = (commitValidationReport.errors || [])
      .slice(0, 5)
      .map((entry) => entry?.message || String(entry))
      .filter(Boolean);
    throw new Error(
      `Import validation failed (${commitValidationReport.errors.length} error${commitValidationReport.errors.length === 1 ? '' : 's'}): ${examples.join(' | ')}`
    );
  }

  // Maps to track newly created IDs
  const newPeopleIdsByName = new Map();
  const newPeopleIdsByBaylorId = new Map();
  const newPeopleIdsByIssueId = new Map();
  const newPeopleByIssueId = new Map();
  const newRoomIdsByName = new Map();
  const termDocsToUpsert = new Map();
  const courseDocsToUpsert = new Map();
  const firstPassHandledChangeIds = new Set();
  const cleanupPeopleIds = new Set();
  const cleanupRoomIds = new Set();
  let createdPeopleCount = 0;
  let createdRoomsCount = 0;

  const queueCourseUpsert = (scheduleData) => {
    const courseDoc = buildCanonicalCourseFromSchedule(scheduleData);
    if (!courseDoc?.id) return;
    const existing = courseDocsToUpsert.get(courseDoc.id);
    if (!existing) {
      courseDocsToUpsert.set(courseDoc.id, courseDoc.data);
      return;
    }
    const next = { ...existing };
    Object.entries(courseDoc.data).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (key === 'title' && next.title && String(next.title).length > String(value).length) {
        return;
      }
      if (next[key] === undefined || next[key] === null || next[key] === '') {
        next[key] = value;
        return;
      }
      if (key === 'title' || key === 'credits' || key === 'departmentCode' || key === 'subjectCode' || key === 'catalogNumber') {
        next[key] = value;
      }
    });
    courseDocsToUpsert.set(courseDoc.id, next);
  };

  const buildTrackedUpsert = async ({ collectionName, documentId, data, groupKey }) => {
    const docRef = doc(db, collectionName, documentId);
    const existingSnap = await getDoc(docRef);
    const action = existingSnap.exists() ? 'modify' : 'add';
    const originalData = existingSnap.exists()
      ? { id: documentId, ...existingSnap.data() }
      : null;
    const changeId = transaction.addChange(collectionName, action, data, originalData, { groupKey });
    const bucket = action === 'add' ? 'added' : 'modified';
    const change = transaction.changes?.[collectionName]?.[bucket]?.find((entry) => entry.id === changeId);
    if (change) {
      change.documentId = documentId;
    }
    return { docRef, change };
  };

  const resolveScheduleInstructorReferences = (scheduleData, { force = false } = {}) => {
    if (!scheduleData || typeof scheduleData !== 'object') return scheduleData;

    const next = { ...scheduleData };
    const hasAssignments = Object.prototype.hasOwnProperty.call(next, 'instructorAssignments');

    if (!force && !hasAssignments) {
      delete next.instructorMatchIssueId;
      delete next.instructorMatchIssueIds;
      return next;
    }

    const incomingAssignments = Array.isArray(next.instructorAssignments)
      ? next.instructorAssignments
      : [];
    const resolvedAssignments = [];

    incomingAssignments.forEach((assignment) => {
      if (!assignment) return;
      const resolved = { ...assignment };

      if (assignment.matchIssueId) {
        const resolution = resolutionMap[assignment.matchIssueId];
        if (resolution?.action === 'link' && resolution.personId) {
          const canonicalId = resolvePersonId(resolution.personId);
          resolved.personId = canonicalId;
          const linkedPerson = peopleById.get(canonicalId) || linkedPeopleMap.get(canonicalId);
          if (linkedPerson?.baylorId && (resolved.isPrimary || !next.instructorBaylorId)) {
            next.instructorBaylorId = linkedPerson.baylorId;
          }
        } else if (resolution?.action === 'create') {
          const createdId = newPeopleIdsByIssueId.get(assignment.matchIssueId);
          if (createdId) {
            resolved.personId = createdId;
            const createdPerson = newPeopleByIssueId.get(assignment.matchIssueId);
            if (createdPerson?.baylorId && (resolved.isPrimary || !next.instructorBaylorId)) {
              next.instructorBaylorId = createdPerson.baylorId;
            }
          }
        }
      }

      if (resolved.personId) {
        const personId = resolvePersonId(resolved.personId) || resolved.personId;
        resolvedAssignments.push({
          personId,
          isPrimary: !!resolved.isPrimary,
          percentage: Number.isFinite(resolved.percentage) ? resolved.percentage : 100
        });
      }
    });

    const assignmentMap = new Map();
    resolvedAssignments.forEach((assignment) => {
      if (!assignment?.personId) return;
      const existing = assignmentMap.get(assignment.personId);
      if (!existing) {
        assignmentMap.set(assignment.personId, assignment);
        return;
      }
      assignmentMap.set(assignment.personId, {
        personId: assignment.personId,
        isPrimary: existing.isPrimary || assignment.isPrimary,
        percentage: Math.max(existing.percentage || 0, assignment.percentage || 0)
      });
    });

    const dedupedAssignments = Array.from(assignmentMap.values());
    if (dedupedAssignments.length > 0 && !dedupedAssignments.some((a) => a.isPrimary)) {
      dedupedAssignments[0].isPrimary = true;
    }

    const primaryAssignment =
      dedupedAssignments.find((a) => a.isPrimary) || dedupedAssignments[0] || null;
    next.instructorAssignments = dedupedAssignments;
    next.instructorIds = Array.from(new Set(dedupedAssignments.map((a) => a.personId)));
    if (primaryAssignment) {
      next.instructorId = primaryAssignment.personId;
    } else if (force && !next.instructorId) {
      next.instructorId = null;
    }

    delete next.instructorMatchIssueId;
    delete next.instructorMatchIssueIds;
    return next;
  };

  try {
    // First pass: Create people and rooms, collect their IDs
    for (const change of changesToApply) {
      if (change.collection === 'people' && change.action === 'add') {
        const now = new Date().toISOString();
        const personPayload = applyPersonIdentityMetadata({ ...(change.newData || {}) });
        if (typeof personPayload.createdAt !== 'string' || personPayload.createdAt.trim() === '') {
          personPayload.createdAt = now;
        }
        if (typeof personPayload.updatedAt !== 'string' || personPayload.updatedAt.trim() === '') {
          personPayload.updatedAt = now;
        }
        change.newData = personPayload;

        const identityMatch = resolvePersonIdentityMatch(personPayload, personIdentityIndex, {
          strongOnly: true
        });
        if (identityMatch.person?.id) {
          const canonicalId = resolvePersonId(identityMatch.person.id);
          const existingPerson = peopleById.get(canonicalId) || identityMatch.person;
          const { updates, diff, hasChanges, merged } = buildPersonImportUpdates(
            existingPerson,
            personPayload
          );

          change.action = 'modify';
          change.originalData = existingPerson;
          change.newData = updates;
          change.diff = diff;
          change.documentId = canonicalId;
          change.matchedExistingIdentityKey = identityMatch.matchedKey;
          const addedIndex = transaction.changes.people.added.findIndex((entry) => entry.id === change.id);
          if (addedIndex >= 0) {
            transaction.changes.people.added.splice(addedIndex, 1);
            if (!transaction.changes.people.modified.some((entry) => entry.id === change.id)) {
              transaction.changes.people.modified.push(change);
            }
          }
          entityResolutionReport.personCreatesMatchedExisting += 1;
          entityResolutionReport.duplicateCreateChangesSuppressed += 1;
          entityResolutionReport.personMergeUpdates.push({
            changeId: change.id,
            personId: canonicalId,
            matchedKey: identityMatch.matchedKey,
            fields: Object.keys(updates)
          });

          if (hasChanges) {
            await batchWriter.add(change, (batch) => {
              batch.update(doc(db, COLLECTIONS.PEOPLE, canonicalId), updates);
            });
          } else {
            change.applied = true;
          }
          firstPassHandledChangeIds.add(change.id);
          cleanupPeopleIds.add(canonicalId);

          if (change.matchIssueId) {
            newPeopleIdsByIssueId.set(change.matchIssueId, canonicalId);
            newPeopleByIssueId.set(change.matchIssueId, { ...existingPerson, ...updates });
          }

          const nameKey = makeNameKey(merged.firstName, merged.lastName);
          if (nameKey) {
            newPeopleIdsByName.set(nameKey, canonicalId);
          }
          const baylorKey = normalizeBaylorId(merged.baylorId);
          if (baylorKey) {
            newPeopleIdsByBaylorId.set(baylorKey, canonicalId);
          }
          registerPersonIdentity({ id: canonicalId, ...merged });
          continue;
        }

        const deterministicPersonId = buildPersonDocId(identityMatch.identity);
        const docRef = deterministicPersonId
          ? doc(db, COLLECTIONS.PEOPLE, deterministicPersonId)
          : doc(collection(db, COLLECTIONS.PEOPLE));
        await batchWriter.add(change, (batch) => {
          if (deterministicPersonId) {
            batch.set(docRef, personPayload, { merge: true });
          } else {
            batch.set(docRef, personPayload);
          }
        });
        change.documentId = docRef.id;
        createdPeopleCount += 1;
        cleanupPeopleIds.add(docRef.id);
        if (deterministicPersonId) {
          entityResolutionReport.deterministicPersonCreates += 1;
        }

        // Map name to ID for schedule linking
        const nameKey = makeNameKey(personPayload.firstName, personPayload.lastName);
        if (nameKey) {
          newPeopleIdsByName.set(nameKey, docRef.id);
        }

        const baylorKey = normalizeBaylorId(personPayload.baylorId);
        if (baylorKey) {
          newPeopleIdsByBaylorId.set(baylorKey, docRef.id);
        }
        if (change.matchIssueId) {
          newPeopleIdsByIssueId.set(change.matchIssueId, docRef.id);
          newPeopleByIssueId.set(change.matchIssueId, personPayload);
        }
        registerPersonIdentity({ id: docRef.id, ...personPayload });

      } else if (change.collection === 'rooms' && change.action === 'add') {
        const preferredId = (change.newData?.spaceKey || '').toString().trim();
        const docRef = preferredId
          ? doc(db, COLLECTIONS.ROOMS, preferredId)
          : doc(collection(db, COLLECTIONS.ROOMS));
        await batchWriter.add(change, (batch) => {
          if (preferredId) {
            batch.set(docRef, change.newData, { merge: true });
          } else {
            batch.set(docRef, change.newData);
          }
        });
        change.documentId = docRef.id;
        createdRoomsCount += 1;
        cleanupRoomIds.add(docRef.id);

        // Map room name to ID for schedule linking
        const roomKeys = buildRoomNameKeys(change.newData);
        roomKeys.forEach((roomKey) => {
          newRoomIdsByName.set(roomKey, docRef.id);
        });
      }
    }

    // Second pass: Create schedules with proper relational IDs
    for (const change of changesToApply) {
      if (shouldSkipCommitSecondPassChange(change, firstPassHandledChangeIds)) {
        continue;
      }

      if (change.collection === 'schedules' && change.action === 'add') {
        const scheduleData = resolveScheduleInstructorReferences(
          { ...change.newData },
          { force: true },
        );

        // Update space IDs if this references a newly created room
        const locationNames = Array.isArray(scheduleData.spaceDisplayNames) ? scheduleData.spaceDisplayNames : [];
        const resolvedSpaceIds = new Set(scheduleData.spaceIds || []);

        locationNames.forEach((locationName) => {
          const roomKey = normalizeRoomName(locationName);
          if (roomKey && newRoomIdsByName.has(roomKey)) {
            resolvedSpaceIds.add(newRoomIdsByName.get(roomKey));
          }
        });

        const uniqueResolvedSpaceIds = Array.from(resolvedSpaceIds);
        if (uniqueResolvedSpaceIds.length > 0) {
          scheduleData.spaceIds = uniqueResolvedSpaceIds;
        }

        const normalizedTerm = normalizeTermLabel(scheduleData.term || '');
        const resolvedTermCode = termCodeFromLabel(scheduleData.termCode || normalizedTerm);
        if (normalizedTerm) {
          scheduleData.term = normalizedTerm;
        }
        if (resolvedTermCode) {
          scheduleData.termCode = resolvedTermCode;
        }
        if (resolvedTermCode || normalizedTerm) {
          const termLabel = normalizedTerm || scheduleData.term || termLabelFromCode(resolvedTermCode) || '';
          const termKey = resolvedTermCode || termLabel;
          if (termKey) {
            termDocsToUpsert.set(termKey, { term: termLabel, termCode: resolvedTermCode });
          }
        }
        queueCourseUpsert(scheduleData);

        delete scheduleData.instructorMatchIssueId;
        delete scheduleData.instructorMatchIssueIds;

        const identity = deriveScheduleIdentity({
          courseCode: scheduleData.courseCode,
          section: scheduleData.section,
          term: scheduleData.term,
          termCode: scheduleData.termCode,
          clssId: scheduleData.clssId,
          crn: scheduleData.crn,
          meetingPatterns: scheduleData.meetingPatterns,
          spaceIds: scheduleData.spaceIds,
          spaceDisplayNames: scheduleData.spaceDisplayNames
        });
        if (!scheduleData.identityKey && identity.primaryKey) {
          scheduleData.identityKey = identity.primaryKey;
        }
        if ((!Array.isArray(scheduleData.identityKeys) || scheduleData.identityKeys.length === 0) && identity.keys.length > 0) {
          scheduleData.identityKeys = identity.keys;
        }
        if (!scheduleData.identitySource && identity.source) {
          scheduleData.identitySource = identity.source;
        }

        const fallbackTerm = scheduleData.termCode || scheduleData.term || 'TERM';
        const fallbackId = scheduleData.crn
          ? `${fallbackTerm}_${scheduleData.crn}`
          : `${fallbackTerm}_${(scheduleData.courseCode || 'COURSE').replace(/[^A-Za-z0-9]+/g, '-')}_${(scheduleData.section || 'SEC').replace(/[^A-Za-z0-9]+/g, '-')}`;
        const scheduleDocId = buildScheduleDocId({ primaryKey: scheduleData.identityKey || identity.primaryKey }) || fallbackId;
        const schedRef = doc(db, COLLECTIONS.SCHEDULES, scheduleDocId);
        const {
          instructorName: _omitInstructorName,
          ...scheduleWrite
        } = scheduleData;
        await batchWriter.add(change, (batch) => {
          batch.set(schedRef, scheduleWrite, { merge: true });
        });
        change.documentId = schedRef.id;

      } else if (change.action === 'modify') {
        // Apply only selected fields if provided
        let updates =
          change.collection === 'schedules'
            ? resolveScheduleInstructorReferences(change.newData)
            : change.newData;
        change.newData = updates;
        const selectedKeys = selectedFieldMap && selectedFieldMap[change.id];
        if (Array.isArray(selectedKeys)) {
          updates = {};
          selectedKeys.forEach((key) => {
            const val = getValueByPath(change.newData, key);
            if (val !== undefined) {
              updates[key] = val;
            }
          });
          if (change.collection === 'schedules') {
            Object.keys(change.newData || {})
              .filter((key) => SCHEDULE_INTERNAL_UPDATE_FIELDS.has(key))
              .forEach((key) => {
                const val = getValueByPath(change.newData, key);
                if (val !== undefined) {
                  updates[key] = val;
                }
              });
          }
          if (
            change.newData?.updatedAt !== undefined &&
            updates.updatedAt === undefined &&
            Object.keys(updates).length > 0
          ) {
            updates.updatedAt = change.newData.updatedAt;
          }
        }
        if (!updates || Object.keys(updates).length === 0) {
          change.applied = true;
          change.noop = true;
          change.documentId = change.originalData.id;
          continue;
        }
        await batchWriter.add(change, (batch) => {
          batch.update(doc(db, change.collection, change.originalData.id), updates);
        });
        change.documentId = change.originalData.id;
        if (change.collection === 'people') {
          cleanupPeopleIds.add(change.documentId);
        } else if (change.collection === 'rooms') {
          cleanupRoomIds.add(change.documentId);
        }
        if (change.collection === 'schedules') {
          queueCourseUpsert({ ...(change.originalData || {}), ...(change.newData || {}) });
        }
      } else if (change.action === 'delete') {
        await batchWriter.add(change, (batch) => {
          batch.delete(doc(db, change.collection, change.originalData.id));
        });
        change.documentId = change.originalData.id;
      }
    }

    for (const termData of termDocsToUpsert.values()) {
      if (!termData.termCode) continue;
      const now = new Date().toISOString();
      const termLabel = termData.term || termLabelFromCode(termData.termCode) || '';
      const termDoc = {
        term: termLabel,
        termCode: termData.termCode,
        updatedAt: now
      };
      const { docRef: termRef, change: termChange } = await buildTrackedUpsert({
        collectionName: COLLECTIONS.TERMS,
        documentId: termData.termCode,
        data: termDoc,
        groupKey: `term_${termData.termCode}`
      });
      if (termChange?.action === 'add') {
        termDoc.status = 'active';
        termDoc.locked = false;
        termDoc.createdAt = now;
        termChange.newData = termDoc;
      }
      await batchWriter.add(termChange, (batch) => {
        batch.set(termRef, termDoc, { merge: true });
      });
    }

    for (const [courseId, courseData] of courseDocsToUpsert.entries()) {
      const now = new Date().toISOString();
      const courseDoc = {
        ...courseData,
        updatedAt: now
      };
      const { docRef: courseRef, change: courseChange } = await buildTrackedUpsert({
        collectionName: COLLECTIONS.COURSES,
        documentId: courseId,
        data: courseDoc,
        groupKey: `course_${courseId}`
      });
      if (courseChange?.action === 'add') {
        courseDoc.createdAt = now;
        courseChange.newData = courseDoc;
      }
      await batchWriter.add(courseChange, (batch) => {
        batch.set(courseRef, courseDoc, { merge: true });
      });
    }
    entityResolutionReport.courseUpserts = courseDocsToUpsert.size;

    await batchWriter.flush();

    const changeIdToDocId = new Map();
    changesToApply.forEach((change) => {
      if (change?.id && change.documentId) {
        changeIdToDocId.set(change.id, change.documentId);
      }
    });
    if (Array.isArray(transaction.rowLineage)) {
      transaction.rowLineage = transaction.rowLineage.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        if ((!entry.scheduleId || entry.scheduleId === '') && entry.changeId && changeIdToDocId.has(entry.changeId)) {
          return { ...entry, scheduleId: changeIdToDocId.get(entry.changeId) };
        }
        return entry;
      });
    }

    const committedResolutions = {};
    matchingIssues.forEach((issue) => {
      const resolution = resolutionMap?.[issue.id];
      if (!resolution) return;
      committedResolutions[issue.id] = {
        action: resolution.action,
        personId: resolution.personId || '',
        reason: (resolution.reason || '').toString().trim(),
      };
    });

    const exclusionSummary = {
      issueCount: excludedIssueSummaries.length,
      excludedRowCount: excludedScheduleRowCount,
      excludedChangeCount: excludedChangeIds.size,
      issues: excludedIssueSummaries.map((entry) => ({
        ...entry,
        reason: entry.reason || 'No reason provided',
      })),
    };

    const touchedTermCodes = new Set();
    const touchedScheduleIds = new Set();
    changesToApply.forEach((change) => {
      if (change?.collection !== 'schedules') return;
      if (change?.action === 'delete') return;
      const termCode = (
        change?.newData?.termCode ||
        change?.originalData?.termCode ||
        ''
      ).toString().trim();
      if (termCode) touchedTermCodes.add(termCode);

      const scheduleId = (change?.documentId || change?.originalData?.id || '').toString().trim();
      if (scheduleId) touchedScheduleIds.add(scheduleId);
    });

    if (touchedScheduleIds.size > 0 && touchedTermCodes.size === 0) {
      const fallbackTermCode = termCodeFromLabel(transaction.semester || '');
      if (fallbackTermCode) {
        touchedTermCodes.add(fallbackTermCode);
      }
    }

    const shouldRunIntegrityFinalize =
      transaction.type === 'schedule' &&
      autoFinalizeIntegrity &&
      touchedScheduleIds.size > 0 &&
      touchedTermCodes.size > 0;

    let integrityFinalizeReport = null;
    if (shouldRunIntegrityFinalize) {
      try {
        integrityFinalizeReport = await runPostImportCleanup({
          termCodes: Array.from(touchedTermCodes),
          touchedScheduleIds: Array.from(touchedScheduleIds),
          transactionId: transaction.id,
          autoLinkCrossLists: true,
        });
      } catch (finalizeError) {
        transaction.status = 'failed_integrity';
        transaction.integrityFinalizeReport = {
          error: finalizeError?.message || String(finalizeError),
        };
        transaction.matchResolutions = committedResolutions;
        transaction.exclusionSummary = exclusionSummary;
        transaction.lastModified = new Date().toISOString();
        await updateTransactionInStorage(transaction);
        throw new Error(
          `Import changes were applied, but automatic integrity finalization failed: ${finalizeError?.message || finalizeError}`,
        );
      }
    }

    const integrityFinalizeApplied = integrityFinalizeReport?.mode !== 'preview';

    (integrityFinalizeApplied && Array.isArray(integrityFinalizeReport?.createdRoomIds)
      ? integrityFinalizeReport.createdRoomIds
      : []
    ).forEach((roomId) => {
      const id = (roomId || '').toString().trim();
      if (id) cleanupRoomIds.add(id);
    });
    (integrityFinalizeApplied && Array.isArray(integrityFinalizeReport?.spaceLinkRepairs?.roomIdsUpdated)
      ? integrityFinalizeReport.spaceLinkRepairs.roomIdsUpdated
      : []
    ).forEach((roomId) => {
      const id = (roomId || '').toString().trim();
      if (id) cleanupRoomIds.add(id);
    });

    let entityCleanupReport = null;
    if (cleanupPeopleIds.size > 0 || cleanupRoomIds.size > 0) {
      const cleanupPeopleIdList = Array.from(cleanupPeopleIds);
      const cleanupRoomIdList = Array.from(cleanupRoomIds);
      try {
        entityCleanupReport = await runImportEntityResolutionCleanup(
          buildImportEntityCleanupPreviewOptions({
            transactionId: transaction.id,
            peopleIds: cleanupPeopleIdList,
            roomIds: cleanupRoomIdList,
          }),
        );
      } catch (cleanupError) {
        entityCleanupReport = {
          error: cleanupError?.message || String(cleanupError),
          timestamp: new Date().toISOString(),
        };
      }
    }

    transaction.status = 'committed';
    transaction.matchResolutions = committedResolutions;
    transaction.exclusionSummary = exclusionSummary;
    transaction.integrityFinalizeReport = integrityFinalizeReport;
    transaction.entityCleanupReport = entityCleanupReport;
    transaction.entityResolutionReport = entityResolutionReport;
    transaction.updateStats?.();
    transaction.lastModified = new Date().toISOString();

    try {
      await persistImportRunTracking(transaction);
    } catch (error) {
      console.warn('Import run tracking failed:', error?.message || error);
    }

    await updateTransactionInStorage(transaction);

    console.log(`✅ Transaction committed with ${changesToApply.length} changes`);
    console.log(`👤 Created ${createdPeopleCount} new people`);
    console.log(`🏛️ Created ${createdRoomsCount} new rooms`);

    // Generate and log import report
    try {
      const importReport = generateImportReport(transaction);
      console.log(formatImportReportForLog(importReport));
      transaction.importReport = importReport;
    } catch (reportError) {
      console.warn('Could not generate import report:', reportError?.message || reportError);
    }

    // Centralized change logging for applied changes
    try {
      // Per-change logs (best-effort, non-blocking)
      const appliedChangesForLog = transaction.getAllChanges().filter((change) => change.applied);
      for (const change of appliedChangesForLog) {
        const source = 'import/core.js - commitTransaction';
        const logMetadata = {
          importRunId: transaction.id,
          importType: transaction.type,
          fileHash: transaction.importMetadata?.fileHash || ''
        };
        if (change.collection === 'schedules') {
          if (change.action === 'add') {
            logCreate(
              `Schedule - ${change.newData.courseCode} ${change.newData.section} (${change.newData.term})`,
              COLLECTIONS.SCHEDULES,
              change.documentId,
              change.newData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'modify') {
            logUpdate(
              `Schedule - ${change.originalData?.courseCode || ''} ${change.originalData?.section || ''} (${change.originalData?.term || ''})`,
              COLLECTIONS.SCHEDULES,
              change.documentId,
              change.newData,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'delete') {
            logDelete(
              `Schedule - ${change.originalData?.courseCode || ''} ${change.originalData?.section || ''} (${change.originalData?.term || ''})`,
              COLLECTIONS.SCHEDULES,
              change.documentId,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          }
        } else if (change.collection === 'people') {
          if (change.action === 'add') {
            logCreate(
              `Person - ${change.newData.firstName || ''} ${change.newData.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.newData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'modify') {
            logUpdate(
              `Person - ${change.originalData?.firstName || ''} ${change.originalData?.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.newData,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'delete') {
            logDelete(
              `Person - ${change.originalData?.firstName || ''} ${change.originalData?.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          }
        } else if (change.collection === 'rooms') {
          if (change.action === 'add') {
            logCreate(
              `Room - ${change.newData.displayName || change.newData.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.newData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'modify') {
            logUpdate(
              `Room - ${change.originalData?.displayName || change.originalData?.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.newData,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'delete') {
            logDelete(
              `Room - ${change.originalData?.displayName || change.originalData?.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          }
        } else if (change.collection === COLLECTIONS.COURSES) {
          const courseLabel =
            change.newData?.courseCode ||
            change.newData?.code ||
            change.originalData?.courseCode ||
            change.originalData?.code ||
            change.documentId;
          if (change.action === 'add') {
            logCreate(
              `Course - ${courseLabel}`,
              COLLECTIONS.COURSES,
              change.documentId,
              change.newData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'modify') {
            logUpdate(
              `Course - ${courseLabel}`,
              COLLECTIONS.COURSES,
              change.documentId,
              change.newData,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'delete') {
            logDelete(
              `Course - ${courseLabel}`,
              COLLECTIONS.COURSES,
              change.documentId,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          }
        } else if (change.collection === COLLECTIONS.TERMS) {
          const termLabel =
            change.newData?.term ||
            change.newData?.termCode ||
            change.originalData?.term ||
            change.originalData?.termCode ||
            change.documentId;
          if (change.action === 'add') {
            logCreate(
              `Term - ${termLabel}`,
              COLLECTIONS.TERMS,
              change.documentId,
              change.newData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'modify') {
            logUpdate(
              `Term - ${termLabel}`,
              COLLECTIONS.TERMS,
              change.documentId,
              change.newData,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          } else if (change.action === 'delete') {
            logDelete(
              `Term - ${termLabel}`,
              COLLECTIONS.TERMS,
              change.documentId,
              change.originalData,
              source,
              logMetadata
            ).catch(() => { });
          }
        }
      }
      // Aggregate log for import
      logImport(
        `Import - ${transaction.description}`,
        'multiple',
        appliedChangesForLog.length,
        'import/core.js - commitTransaction',
        {
          transactionId: transaction.id,
          semester: transaction.semester,
          stats: transaction.stats,
          fileHash: transaction.importMetadata?.fileHash || ''
        }
      ).catch(() => { });
    } catch (error) {
      void error;
    }

    return transaction;
  } catch (error) {
    console.error('Error committing transaction:', error);
    try {
      const appliedChanges = transaction?.getAllChanges
        ? transaction.getAllChanges().filter((change) => change.applied)
        : [];
      if (transaction) {
        const shouldPreserveFailureStatus =
          transaction.status === 'failed_integrity' || transaction.status === 'failed';
        if (!shouldPreserveFailureStatus) {
          transaction.status = appliedChanges.length > 0 ? 'partial' : 'failed';
        }
        transaction.lastModified = new Date().toISOString();
        transaction.commitError = error?.message || String(error);
        await updateTransactionInStorage(transaction);
      }
    } catch (updateError) {
      console.error('Error updating transaction after partial commit:', updateError);
    }
    throw error;
  }
};

// Rollback committed transaction
export const rollbackTransaction = async (transactionId) => {
  const transactions = await fetchImportTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const allowedRollbackStatuses = new Set([
    'committed',
    'partial',
    'failed',
    'failed_integrity',
  ]);
  if (!allowedRollbackStatuses.has(transaction.status)) {
    throw new Error('Transaction is not eligible for rollback');
  }

  const allChanges = transaction.getAllChanges();
  const appliedChanges = allChanges.filter(change => change.applied);

  if (appliedChanges.length === 0) {
    transaction.status = 'rolled_back';
    transaction.rollbackVerification = {
      checked: 0,
      remainingCreatedDocs: [],
      missingRestoredDocs: [],
      verified: true,
      timestamp: new Date().toISOString(),
    };
    transaction.lastModified = new Date().toISOString();
    await updateTransactionInStorage(transaction);
    return transaction;
  }

  let batch = writeBatch(db);
  let opCount = 0;
  const commitBatch = async () => {
    if (opCount === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    opCount = 0;
  };

  try {
    for (const change of [...appliedChanges].reverse()) {
      const collectionName = change?.collection;
      const targetId = (change?.documentId || change?.originalData?.id || '').toString().trim();
      if (!collectionName || !targetId) continue;

      const targetRef = doc(db, collectionName, targetId);
      let didQueueOperation = false;

      if (change.action === 'add') {
        batch.delete(targetRef);
        didQueueOperation = true;
      } else if (change.action === 'modify') {
        const rollbackUpdates = buildRollbackModifyUpdates(change);
        if (Object.keys(rollbackUpdates).length > 0) {
          batch.update(targetRef, rollbackUpdates);
          didQueueOperation = true;
        }
      } else if (change.action === 'delete') {
        const originalPayload = toRollbackPayload(change.originalData || {});
        batch.set(targetRef, originalPayload || {}, { merge: false });
        didQueueOperation = true;
      }

      if (!didQueueOperation) continue;
      opCount += 1;
      if (opCount >= MAX_BATCH_OPERATIONS) {
        await commitBatch();
      }
    }

    await commitBatch();

    const verification = await verifyRollbackResult(appliedChanges);
    transaction.rollbackVerification = verification;
    transaction.status = verification.verified ? 'rolled_back' : 'failed';
    transaction.lastModified = new Date().toISOString();
    await updateTransactionInStorage(transaction);

    if (!verification.verified) {
      throw new Error(
        `Rollback verification failed. Remaining created docs: ${verification.remainingCreatedDocs.length}; missing restored docs: ${verification.missingRestoredDocs.length}.`,
      );
    }

    return transaction;
  } catch (error) {
    transaction.status = 'failed';
    transaction.rollbackError = error?.message || String(error);
    transaction.lastModified = new Date().toISOString();
    await updateTransactionInStorage(transaction);
    throw error;
  }
};

// Orphaned data cleanup functions for when transaction records are deleted

// Find potentially orphaned imported data based on patterns
export const findOrphanedImportedData = async (semesterFilter = null) => {
  console.log('🔍 Scanning for orphaned imported data...');

  const results = {
    schedules: [],
    people: [],
    rooms: [],
    total: 0
  };

  try {
    // Scan schedules and build reference maps
    const schedulesRef = collection(db, COLLECTIONS.SCHEDULES);
    const schedulesSnap = await getDocs(schedulesRef);

    console.log(`📊 Found ${schedulesSnap.size} total schedules`);

    const normalize = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
    const termFilterNorm = normalize(semesterFilter || '');

    const usedPeopleOutsideTerm = new Set();
    const usedRoomsOutsideTerm = new Set();
    const usedPeopleInSelectedTerm = new Set();
    const usedRoomsInSelectedTerm = new Set();

    // First pass: build sets of referenced people/rooms OUTSIDE selected term
    schedulesSnap.forEach(docSnap => {
      const data = docSnap.data();
      const termNorm = normalize(data.term || '');
      const isInSelectedTerm = termFilterNorm && termNorm === termFilterNorm;

      if (!isInSelectedTerm) {
        if (data.instructorId) usedPeopleOutsideTerm.add(data.instructorId);
        if (Array.isArray(data.spaceIds)) {
          data.spaceIds.forEach((sid) => sid && usedRoomsOutsideTerm.add(sid));
        }
      } else {
        if (data.instructorId) usedPeopleInSelectedTerm.add(data.instructorId);
        if (Array.isArray(data.spaceIds)) {
          data.spaceIds.forEach((sid) => sid && usedRoomsInSelectedTerm.add(sid));
        }
      }
    });

    // Second pass: collect schedules to delete (only in selected term if provided)
    schedulesSnap.forEach(doc => {
      const data = doc.data();
      const docId = doc.id;

      const termNorm = normalize(data.term || '');
      const inSelectedTerm = termFilterNorm ? termNorm === termFilterNorm : true;

      // Schedules: only target the selected term (if provided). If no filter, fall back to heuristics
      const isLikelyImported = termFilterNorm
        ? inSelectedTerm
        : (
          (data.createdAt && (new Date() - new Date(data.createdAt)) < (30 * 24 * 60 * 60 * 1000)) ||
          /^\w+_\d{5}$/.test(docId)
        );

      if (isLikelyImported) {
        results.schedules.push({
          id: docId,
          ...data,
          reason: data.createdAt ? 'recent_creation' : 'deterministic_id'
        });
      }
    });

    // Scan people: only include if referenced in selected term AND not referenced outside term
    const peopleRef = collection(db, COLLECTIONS.PEOPLE);
    const peopleSnap = await getDocs(peopleRef);

    console.log(`👥 Found ${peopleSnap.size} total people`);

    peopleSnap.forEach(doc => {
      const data = doc.data();
      const docId = doc.id;

      const referencedOutsideTerm = usedPeopleOutsideTerm.has(docId);
      const referencedInSelectedTerm = termFilterNorm ? usedPeopleInSelectedTerm.has(docId) : false;
      // Only propose deletion if used in selected term and not used elsewhere
      const isCandidate = termFilterNorm ? (referencedInSelectedTerm && !referencedOutsideTerm) : false;

      if (isCandidate) {
        results.people.push({
          id: docId,
          ...data,
          reason: referencedOutsideTerm ? 'referenced_elsewhere' : 'only_used_in_selected_term'
        });
      }
    });

    // Scan rooms: only include if referenced in selected term AND not referenced outside term
    const roomsRef = collection(db, COLLECTIONS.ROOMS);
    const roomsSnap = await getDocs(roomsRef);

    console.log(`🏢 Found ${roomsSnap.size} total rooms`);

    roomsSnap.forEach(doc => {
      const data = doc.data();
      const docId = doc.id;

      const referencedOutsideTerm = usedRoomsOutsideTerm.has(docId);
      const referencedInSelectedTerm = termFilterNorm ? usedRoomsInSelectedTerm.has(docId) : false;
      const isCandidate = termFilterNorm ? (referencedInSelectedTerm && !referencedOutsideTerm) : false;

      if (isCandidate) {
        results.rooms.push({
          id: docId,
          ...data,
          reason: referencedOutsideTerm ? 'referenced_elsewhere' : 'only_used_in_selected_term'
        });
      }
    });

    results.total = results.schedules.length + results.people.length + results.rooms.length;

    console.log(`🎯 Found ${results.total} potentially orphaned records:`);
    console.log(`   - ${results.schedules.length} schedules`);
    console.log(`   - ${results.people.length} people`);
    console.log(`   - ${results.rooms.length} rooms`);

    return results;

  } catch (error) {
    console.error('Error scanning for orphaned data:', error);
    throw error;
  }
};

// Clean up orphaned imported data
export const cleanupOrphanedImportedData = async (orphanedData, confirmDelete = false) => {
  console.log('🧹 Starting cleanup of orphaned imported data...');

  if (!confirmDelete) {
    console.log('⚠️  DRY RUN - No actual deletions will be performed');
    console.log('   Set confirmDelete=true to actually delete the data');
    return { dryRun: true, wouldDelete: orphanedData.total };
  }

  const batch = writeBatch(db);
  let deletedCount = 0;
  let errorCount = 0;

  // Delete orphaned schedules
  for (const schedule of orphanedData.schedules) {
    try {
      const docRef = doc(db, COLLECTIONS.SCHEDULES, schedule.id);
      batch.delete(docRef);
      deletedCount++;
      console.log(`   🗑️ Marked schedule ${schedule.id} for deletion`);
    } catch (error) {
      console.error(`❌ Error marking schedule ${schedule.id} for deletion:`, error);
      errorCount++;
    }
  }

  // Delete orphaned people
  for (const person of orphanedData.people) {
    try {
      const docRef = doc(db, COLLECTIONS.PEOPLE, person.id);
      batch.delete(docRef);
      deletedCount++;
      console.log(`   🗑️ Marked person ${person.id} (${person.firstName} ${person.lastName}) for deletion`);
    } catch (error) {
      console.error(`❌ Error marking person ${person.id} for deletion:`, error);
      errorCount++;
    }
  }

  // Delete orphaned rooms
  for (const room of orphanedData.rooms) {
    try {
      const docRef = doc(db, COLLECTIONS.ROOMS, room.id);
      batch.delete(docRef);
      deletedCount++;
      console.log(`   🗑️ Marked room ${room.id} (${room.name}) for deletion`);
    } catch (error) {
      console.error(`❌ Error marking room ${room.id} for deletion:`, error);
      errorCount++;
    }
  }

  if (deletedCount > 0) {
    console.log('💾 Committing batch deletion...');
    await batch.commit();
    console.log(`✅ Successfully deleted ${deletedCount} orphaned records`);
  }

  return {
    deleted: deletedCount,
    errors: errorCount,
    totalFound: orphanedData.total
  };
};
