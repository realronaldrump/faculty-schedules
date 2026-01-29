import { collection, getDocs, getDoc, doc, updateDoc, addDoc, deleteDoc, writeBatch, query, orderBy, setDoc, where } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { logCreate, logUpdate, logDelete, logBulkUpdate, logImport } from './changeLogger';
import {
  buildUpsertUpdates,
  parseCrossListCrns,
  parseInstructorField,
  parseInstructorFieldList
} from './dataImportUtils';
import { parseFullName } from './nameUtils';
import { parseCourseCode, deriveCreditsFromCatalogNumber } from './courseUtils';
import { parseMeetingPatterns, normalizeTime } from './meetingPatternUtils';
import { findPersonMatch, makeNameKey, normalizeBaylorId } from './personMatchUtils';
import { normalizeTermLabel, termCodeFromLabel, termLabelFromCode } from './termUtils';
import {
  LOCATION_TYPE,
  parseMultiRoom,
  parseRoomLabel,
  splitMultiRoom,
  buildSpaceKey,
  normalizeSpaceNumber
} from './locationService';
import { normalizeSectionNumber } from './canonicalSchema';
import { hashRecord } from './hashUtils';
import { standardizeCourseCode } from './hygieneCore';
import {
  standardizeImportedPerson,
  standardizeImportedRoom,
  standardizeImportedSchedule
} from './importHygieneUtils';
import {
  buildScheduleDocId,
  buildScheduleIdentityIndex,
  deriveScheduleIdentity,
  resolveScheduleIdentityMatch
} from './importIdentityUtils';

// Import transaction model for tracking changes
export class ImportTransaction {
  constructor(type, description, semester) {
    this.id = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = type; // 'schedule' | 'directory'
    this.description = description;
    this.semester = semester;
    this.timestamp = new Date().toISOString();
    this.status = 'preview'; // 'preview' | 'committed' | 'rolled_back'
    this.changes = {
      schedules: {
        added: [],
        modified: [],
        deleted: []
      },
      people: {
        added: [],
        modified: [],
        deleted: []
      },
      rooms: {
        added: [],
        modified: [],
        deleted: []
      }
    };
    this.matchingIssues = [];
    this.validation = { errors: [], warnings: [] };
    this.previewSummary = null;
    this.originalData = {}; // Store original data for rollback
    this.importMetadata = {};
    this.rowLineage = [];
    this.stats = {
      totalChanges: 0,
      schedulesAdded: 0,
      peopleAdded: 0,
      roomsAdded: 0,
      peopleModified: 0
    };
    // Add metadata for database storage
    this.createdBy = 'system'; // Could be enhanced with user info
    this.lastModified = new Date().toISOString();
  }

  // Add a change to the transaction
  addChange(collection, action, newData, originalData = null, options = {}) {
    const change = {
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      collection,
      action, // 'add' | 'modify' | 'delete'
      newData,
      originalData,
      timestamp: new Date().toISOString(),
      applied: false,
      groupKey: options.groupKey || null,
      pendingResolution: options.pendingResolution || false,
      matchIssueId: options.matchIssueId || null,
      importMeta: options.importMeta || null
    };

    this.changes[collection][action === 'add' ? 'added' : action === 'modify' ? 'modified' : 'deleted'].push(change);
    this.updateStats();
    this.lastModified = new Date().toISOString();
    return change.id;
  }

  addMatchIssue(issue) {
    const matchIssue = {
      id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: issue.type || 'person',
      importType: issue.importType || 'schedule',
      matchKey: issue.matchKey || '',
      reason: issue.reason || '',
      proposedPerson: issue.proposedPerson || {},
      candidates: Array.isArray(issue.candidates) ? issue.candidates : [],
      pendingPersonChangeId: issue.pendingPersonChangeId || null,
      scheduleChangeIds: Array.isArray(issue.scheduleChangeIds) ? issue.scheduleChangeIds : [],
      createdAt: new Date().toISOString()
    };
    this.matchingIssues.push(matchIssue);
    this.lastModified = new Date().toISOString();
    return matchIssue;
  }

  addRowLineage(entry) {
    if (!entry || typeof entry !== 'object') return;
    this.rowLineage.push(entry);
    this.lastModified = new Date().toISOString();
  }

  updateStats() {
    this.stats = {
      totalChanges:
        this.changes.schedules.added.length +
        this.changes.schedules.modified.length +
        this.changes.schedules.deleted.length +
        this.changes.people.added.length +
        this.changes.people.modified.length +
        this.changes.people.deleted.length +
        this.changes.rooms.added.length +
        this.changes.rooms.modified.length +
        this.changes.rooms.deleted.length,
      schedulesAdded: this.changes.schedules.added.length,
      peopleAdded: this.changes.people.added.length,
      roomsAdded: this.changes.rooms.added.length,
      peopleModified: this.changes.people.modified.length
    };
    this.lastModified = new Date().toISOString();
  }

  // Get summary of changes
  getSummary() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      semester: this.semester,
      timestamp: this.timestamp,
      status: this.status,
      stats: this.stats,
      createdBy: this.createdBy,
      lastModified: this.lastModified
    };
  }

  // Get all changes in a flat list for UI display
  getAllChanges() {
    const allChanges = [];

    const actionMap = {
      'added': 'add',
      'modified': 'modify',
      'deleted': 'delete'
    };

    ['schedules', 'people', 'rooms'].forEach(collection => {
      ['added', 'modified', 'deleted'].forEach(actionKey => {
        this.changes[collection][actionKey].forEach(change => {
          allChanges.push({
            ...change,
            collection,
            action: actionMap[actionKey]
          });
        });
      });
    });

    // Sort chronologically
    return allChanges.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  // Convert to database format
  toFirestore() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      semester: this.semester,
      timestamp: this.timestamp,
      status: this.status,
      changes: this.changes,
      matchingIssues: this.matchingIssues,
      validation: this.validation,
      previewSummary: this.previewSummary,
      originalData: this.originalData,
      importMetadata: this.importMetadata,
      rowLineage: this.rowLineage,
      stats: this.stats,
      createdBy: this.createdBy,
      lastModified: this.lastModified
    };
  }

  // Create from database format
  static fromFirestore(data) {
    const transaction = Object.assign(new ImportTransaction(), data);
    if (!Array.isArray(transaction.matchingIssues)) {
      transaction.matchingIssues = [];
    }
    if (!transaction.validation || typeof transaction.validation !== 'object') {
      transaction.validation = { errors: [], warnings: [] };
    }
    if (!Array.isArray(transaction.validation.errors)) {
      transaction.validation.errors = [];
    }
    if (!Array.isArray(transaction.validation.warnings)) {
      transaction.validation.warnings = [];
    }
    if (!transaction.importMetadata || typeof transaction.importMetadata !== 'object') {
      transaction.importMetadata = {};
    }
    if (!Array.isArray(transaction.rowLineage)) {
      transaction.rowLineage = [];
    }
    return transaction;
  }
}

// Preview import changes without committing to database
export const previewImportChanges = async (csvData, importType, selectedSemester, options = {}) => {
  const { persist = true, includeOfficeRooms = true, importMetadata = {} } = options;
  const normalizedSemester = normalizeTermLabel(selectedSemester || '');
  const transaction = new ImportTransaction(
    importType,
    `${importType} import preview`,
    normalizedSemester || selectedSemester
  );
  const rows = Array.isArray(csvData) ? csvData : [];
  const rowHashes = rows.map((row) => row?.__rowHash || hashRecord(row));
  transaction.importMetadata = {
    ...importMetadata,
    rowCount: rows.length,
    rowHashes
  };

  try {
    let existingSchedulesData = [];
    let existingPeopleData = [];
    let existingRoomsData = [];

    if (importType === 'schedule') {
      const termCodes = new Set();
      const termLabels = new Set();

      rows.forEach((row) => {
        const rawTerm = (row?.Semester || row?.Term || normalizedSemester || selectedSemester || '').toString().trim();
        const normalizedTerm = normalizeTermLabel(rawTerm);
        const termCode = termCodeFromLabel(
          row?.['Semester Code'] || row?.['Term Code'] || normalizedTerm || rawTerm
        );
        if (termCode) termCodes.add(termCode);
        if (rawTerm) termLabels.add(rawTerm);
        if (normalizedTerm) termLabels.add(normalizedTerm);
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
        csvData,
        transaction,
        existingSchedulesData,
        existingPeopleData,
        existingRoomsData,
        { fallbackTerm: normalizedSemester || selectedSemester }
      );
    } else if (importType === 'directory') {
      await previewDirectoryChanges(csvData, transaction, existingPeopleData, existingRoomsData, { includeOfficeRooms });
    }

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

const deriveNameKeyFromDisplayName = (displayName) => {
  if (!displayName) return '';
  const cleaned = displayName.replace(/\([^)]*\)/g, '').trim();
  if (!cleaned) return '';

  if (cleaned.includes(',')) {
    const [lastPart, firstPartRaw] = cleaned.split(',', 2);
    const last = lastPart.trim();
    const first = (firstPartRaw || '').trim().split(/\s+/)[0] || '';
    return makeNameKey(first, last);
  }

  const parsed = parseFullName(cleaned);
  const primary = makeNameKey(parsed.firstName, parsed.lastName);
  if (primary) return primary;
  return makeNameKey(parsed.lastName, parsed.firstName);
};

const normalizeRoomName = (name) => (name || '').replace(/\s+/g, ' ').trim().toLowerCase();

const normalizeNumericField = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value).replace(/[^0-9-]/g, ''), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

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

export const normalizeSectionIdentifier = (sectionField) =>
  normalizeSectionNumber(sectionField);

export const extractCrnFromSectionField = (sectionField) => {
  if (!sectionField) return '';
  const match = String(sectionField).match(/\((\d{5,6})\)/);
  return match ? match[1] : '';
};

export const extractAcademicYear = (term) => {
  const match = String(term || '').match(/(\d{4})/);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return new Date().getFullYear();
};

export const extractScheduleRowBaseData = (row, fallbackTerm = '') => {
  const rowHashInput = { ...(row || {}) };
  delete rowHashInput.__rowIndex;
  delete rowHashInput.__rowHash;
  const rowHash = row?.__rowHash || hashRecord(rowHashInput);

  const courseCode = standardizeCourseCode(row.Course || '');
  const courseTitle = row['Course Title'] || row['Long Title'] || row['Title/Topic'] || '';
  const section = normalizeSectionIdentifier(row['Section #'] || '');

  const clssId = (row['CLSS ID'] || '').toString().trim();
  const directCrn = (row['CRN'] || '').toString().trim();
  const sectionCrn = extractCrnFromSectionField(row['Section #'] || '');
  const crn = /^\d{5,6}$/.test(directCrn)
    ? directCrn
    : (/^\d{5,6}$/.test(sectionCrn) ? sectionCrn : '');

  const rawCredits = row['Credit Hrs'] ?? row['Credit Hrs Min'] ?? row['Credit Hrs Max'] ?? null;
  const catalogNumber = (row['Catalog Number'] || '').toString().trim().toUpperCase();
  const parsedCourse = parseCourseCode(courseCode || '');
  const catalogForCredits = catalogNumber || parsedCourse?.catalogNumber || '';
  const derivedCredits = deriveCreditsFromCatalogNumber(catalogForCredits, rawCredits);
  const numericFallback = rawCredits === null || rawCredits === undefined
    ? null
    : Number.parseFloat(rawCredits);
  const credits = derivedCredits ?? (Number.isNaN(numericFallback) ? null : numericFallback) ?? (parsedCourse?.credits ?? null);
  const parsedProgram = parsedCourse?.error ? '' : (parsedCourse?.program || '');
  const subjectCode = (row['Subject Code'] || '').toString().trim().toUpperCase() || parsedProgram;
  const program = parsedProgram || subjectCode;
  const departmentCode = (row['Department Code'] || '').toString().trim().toUpperCase();
  const courseLevel = Number.isFinite(parsedCourse?.level) ? parsedCourse.level : 0;
  const enrollment = normalizeNumericField(row['Enrollment']);
  const maxEnrollment = normalizeNumericField(row['Maximum Enrollment']);
  const waitCap = normalizeNumericField(row['Wait Cap']);
  const waitTotal = normalizeNumericField(row['Wait Total']);
  const openSeats = normalizeNumericField(row['Open Seats']);
  const waitAvailable = normalizeNumericField(row['Wait Available']);
  const reservedSeats = normalizeNumericField(row['Reserved Seats']);
  const reservedSeatsEnrollment = normalizeNumericField(row['Reserved Seats - Enrollment']);

  const rawTerm = row.Semester || row.Term || fallbackTerm || '';
  const normalizedTerm = normalizeTermLabel(rawTerm);
  const term = normalizedTerm || rawTerm;
  const termCode = termCodeFromLabel(row['Semester Code'] || row['Term Code'] || normalizedTerm);
  const academicYear = extractAcademicYear(term);

  const instructorField = row.Instructor || '';
  const parsedInstructors = parseInstructorFieldList(instructorField);
  const primaryInstructor = parsedInstructors.find((info) => info.isPrimary) || parsedInstructors[0] || null;
  const formatInstructorName = (info) => {
    if (!info) return '';
    const firstName = (info.firstName || '').trim();
    const lastName = (info.lastName || '').trim();
    if (firstName && lastName) return `${lastName}, ${firstName}`;
    return lastName || firstName;
  };
  const normalizedInstructorName = parsedInstructors.length > 1
    ? parsedInstructors.map(formatInstructorName).filter(Boolean).join('; ')
    : formatInstructorName(primaryInstructor) || instructorField.trim();
  const instructorBaylorId = normalizeBaylorId(primaryInstructor?.id);
  const parsedInstructor = primaryInstructor || parseInstructorField(instructorField) || { firstName: '', lastName: '', id: '' };

  const meetingPatternRaw = (row['Meeting Pattern'] || row['Meetings'] || '').toString().trim();
  const meetingPatterns = parseMeetingPatterns(row);

  const instructionMethod = (row['Inst. Method'] || row['Instruction Method'] || '').toString().trim();

  const roomRaw = (row.Room || '').toString().trim();
  const parsedRooms = parseMultiRoom(roomRaw);
  const parsedRoomNames = Array.isArray(parsedRooms.displayNames)
    ? parsedRooms.displayNames
    : [];
  const locationNames = parsedRoomNames.length > 0
    ? parsedRoomNames
    : (roomRaw ? splitMultiRoom(roomRaw) : []);
  const inferredIsOnline =
    parsedRooms.locationType === LOCATION_TYPE.VIRTUAL ||
    roomRaw.toUpperCase().includes('ONLINE') ||
    instructionMethod.toLowerCase().includes('online');
  const isPhysical =
    parsedRooms.locationType === LOCATION_TYPE.PHYSICAL ||
    (parsedRooms.locationType === LOCATION_TYPE.UNKNOWN && locationNames.length > 0);
  const locationType = isPhysical ? 'room' : 'no_room';
  const locationLabel = inferredIsOnline
    ? 'Online'
    : (locationType === 'no_room'
      ? (parsedRooms.locationLabel || (roomRaw || 'No Room Needed'))
      : '');
  const filteredRoomNames = locationType === 'no_room'
    ? []
    : locationNames;
  const spaceIds = locationType === 'no_room'
    ? []
    : Array.from(new Set(parsedRooms.spaceKeys || []));
  const spaceDisplayNames = locationType === 'no_room'
    ? []
    : (parsedRoomNames.length > 0 ? parsedRoomNames : filteredRoomNames);

  return {
    courseCode,
    courseTitle,
    section,
    clssId,
    crn,
    credits: credits ?? null,
    creditRaw: rawCredits,
    subjectCode,
    catalogNumber,
    program,
    departmentCode,
    courseLevel,
    term,
    termCode,
    academicYear,
    instructorField,
    parsedInstructor,
    parsedInstructors,
    normalizedInstructorName,
    instructorBaylorId,
    meetingPatternRaw,
    meetingPatterns,
    roomRaw,
    spaceIds,
    spaceDisplayNames,
    locationType,
    locationLabel,
    isOnline: inferredIsOnline,
    enrollment,
    maxEnrollment,
    waitCap,
    waitTotal,
    openSeats,
    waitAvailable,
    reservedSeats,
    reservedSeatsEnrollment,
    scheduleType: row['Schedule Type'] || 'Class Instruction',
    status: row.Status || 'Active',
    partOfTerm: row['Part of Semester'] || row['Part of Term'] || '',
    instructionMethod,
    campus: row.Campus || '',
    visibleOnWeb: row['Visible on Web'] || '',
    specialApproval: row['Special Approval'] || '',
    rowHash
  };
};

export const projectSchedulePreviewRow = (row, fallbackTerm = '') => {
  const base = extractScheduleRowBaseData(row, fallbackTerm);
  const meetingSummary = Array.isArray(base.meetingPatterns)
    ? base.meetingPatterns
      .map((pattern) => {
        if (pattern.day && pattern.startTime && pattern.endTime) {
          return `${pattern.day} ${pattern.startTime}-${pattern.endTime}`;
        }
        return pattern.raw || '';
      })
      .filter(Boolean)
      .join('\n')
    : '';

  return {
    'Course Code': base.courseCode,
    'Course Title': base.courseTitle,
    'Section': base.section,
    'CRN': base.crn,
    'Credits (parsed)': base.credits ?? '',
    'Credits (raw)': base.creditRaw ?? '',
    'Semester': base.term,
    'Semester Code': base.termCode,
    'Academic Year': base.academicYear ?? '',
    'Department Code': base.departmentCode,
    'Subject Code': base.subjectCode,
    'Catalog Number': base.catalogNumber,
    'Instructor (parsed)': base.normalizedInstructorName,
    'Instructor Baylor ID': base.instructorBaylorId,
    'Instructor (raw)': base.instructorField,
    'Schedule Type': base.scheduleType,
    'Status': base.status,
    'Part of Semester': base.partOfTerm,
    'Instruction Method': base.instructionMethod,
    'Campus': base.campus,
    'Rooms (raw)': base.roomRaw,
    'Rooms (parsed)': Array.isArray(base.spaceDisplayNames) ? base.spaceDisplayNames.join('; ') : '',
    'Meeting Pattern (raw)': base.meetingPatternRaw,
    'Meeting Pattern (parsed)': meetingSummary,
    'Visible on Web': base.visibleOnWeb,
    'Special Approval': base.specialApproval
  };
};

const buildRoomNameKeys = (roomData) => {
  const keys = new Set();
  const candidates = [roomData.displayName];
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
      const personId = normalizeStringValue(assignment.personId || assignment.id);
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
  const seenIdentityKeys = new Set();
  const pendingMatchMap = new Map();
  const pendingPersonUpdates = new Map();
  const pendingRoomUpdates = new Map();
  const createdRoomIds = new Set();
  const { index: scheduleIdentityIndex, collisions } = buildScheduleIdentityIndex(existingSchedules);
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
  for (const row of csvData) {
    rowCounter += 1;
    const baseData = extractScheduleRowBaseData(row, fallbackTerm);
    const rowIndex = row.__rowIndex || rowCounter;
    const rowLabel = `Row ${rowIndex}`;
    const rowLineageBase = {
      rowIndex,
      rowHash: baseData.rowHash,
      courseCode: baseData.courseCode || '',
      section: baseData.section || '',
      term: baseData.term || '',
      termCode: baseData.termCode || '',
      crn: baseData.crn || '',
      clssId: baseData.clssId || ''
    };

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
    if (!baseData.instructorField) {
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

    const identity = deriveScheduleIdentity({
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
    const identityKey = identity.primaryKey;
    if (!identityKey) {
      addValidation('error', `${rowLabel}: Unable to derive identity key`);
      transaction.addRowLineage({ ...rowLineageBase, action: 'skipped', reason: 'Missing identity key' });
      summary.rowsSkipped += 1;
      continue;
    }
    if (seenIdentityKeys.has(identityKey)) {
      addValidation('warning', `${rowLabel}: Duplicate schedule identity "${identityKey}" skipped`);
      transaction.addRowLineage({ ...rowLineageBase, action: 'skipped', reason: 'Duplicate identity', identityKey });
      summary.rowsSkipped += 1;
      continue;
    }
    seenIdentityKeys.add(identityKey);

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

    if (parsedForMatch.length === 0) {
      addValidation('warning', `${rowLabel}: Instructor parsed as staff/unassigned`);
    }

    parsedForMatch.forEach((parsed) => {
      const baylorId = normalizeBaylorId(parsed?.id);
      if (!baylorId) {
        addValidation('warning', `${rowLabel}: Missing instructor ID for ${parsed?.lastName || parsed?.firstName || 'Unknown'}`);
      }
    });

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
        const proposedPerson = standardizeImportedPerson({
          firstName: parsed?.firstName || '',
          lastName: parsed?.lastName || '',
          email: '',
          baylorId: baylorId || '',
          roles: ['faculty'],
          isActive: true
        });
        matchIssue = transaction.addMatchIssue({
          importType: 'schedule',
          matchKey,
          reason: matchResult?.reason || 'No exact match',
          proposedPerson,
          candidates: matchResult?.candidates || [],
          scheduleChangeIds: []
        });
        matchIssue.pendingPersonChangeId = transaction.addChange(
          'people',
          'add',
          proposedPerson,
          null,
          { groupKey: `person_${matchIssue.id}`, pendingResolution: true, matchIssueId: matchIssue.id }
        );
        pendingMatchMap.set(matchKey, matchIssue);
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
        const personId = matchResult.person.id;
        instructorIds.add(personId);
        instructorPeople.set(personId, matchResult.person);
        queuePersonBackfill(matchResult.person, parsed);
        instructorAssignments.push({
          personId,
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
    if (splitRooms.length > 0) {
      for (const singleRoom of splitRooms) {
        const nameKey = normalizeRoomName(singleRoom);
        if (!nameKey) continue;

        const parsed = parseRoomLabel(singleRoom);
        const buildingCode = (parsed?.buildingCode || parsed?.building?.code || '').toString().trim().toUpperCase();
        const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || '');
        const spaceKey = parsed?.spaceKey || (buildingCode && spaceNumber ? buildSpaceKey(buildingCode, spaceNumber) : '');
        if (spaceKey) resolvedSpaceKeys.push(spaceKey);

        let room = spaceKey ? roomsKeyMap.get(spaceKey) : null;
        if (!room) {
          room = roomsMap.get(nameKey) || null;
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
    const uniqueSpaceIds = baseData.locationType === 'no_room'
      ? []
      : Array.from(new Set([...(baseData.spaceIds || []), ...resolvedSpaceKeys]));
    const spaceDisplayNames = baseData.locationType === 'no_room'
      ? []
      : Array.from(new Set(baseData.spaceDisplayNames || splitRooms));

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

    const crossListCrns = parseCrossListCrns(row);
    if (crossListCrns && crossListCrns.length > 0) {
      standardizedScheduleData.crossListCrns = Array.from(new Set(crossListCrns));
    }

    const {
      instructorName: _omitInstructorName,
      instructorMatchIssueIds: _omitMatchIssueIds,
      ...scheduleWrite
    } = standardizedScheduleData;

    if (existingSchedule) {
      const allowEmptyFields = (scheduleWrite.locationType === 'no_room' || scheduleWrite.isOnline)
        ? ['spaceIds', 'spaceDisplayNames']
        : [];
      const { updates, hasChanges } = buildScheduleImportUpdates(existingSchedule, scheduleWrite, { allowEmptyFields });
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

    const scheduleChangeId = transaction.addChange('schedules', 'add', standardizedScheduleData, null, { groupKey, importMeta });
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

  existingRooms.forEach((room) => {
    const spaceKey = room?.spaceKey || '';
    if (spaceKey && !roomsKeyMap.has(spaceKey)) {
      roomsKeyMap.set(spaceKey, room);
    }
    buildRoomNameKeys(room).forEach((key) => roomsMap.set(key, room));
  });

  for (const row of csvData) {
    const rawFirstName = (row['First Name'] || '').trim();
    const rawLastName = (row['Last Name'] || '').trim();
    const rawEmail = (row['E-mail Address'] || '').trim();

    if (!rawFirstName && !rawLastName && !rawEmail) continue;

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
    const officeSpaceId = officeSpaceKey || '';

    const basePersonData = {
      firstName: rawFirstName,
      lastName: rawLastName,
      email: rawEmail,
      roles: ['faculty'], // default to faculty for directory imports
      phone: row['Phone'] || row['Business Phone'] || row['Home Phone'] || '',
      office: officeRaw,
      officeSpaceId,
      isActive: true
    };
    const normalizedPerson = standardizeImportedPerson(basePersonData, { updateTimestamp: false });
    const firstName = normalizedPerson.firstName || '';
    const lastName = normalizedPerson.lastName || '';
    const email = normalizedPerson.email || '';
    const phone = normalizedPerson.phone || '';
    const office = normalizedPerson.office || '';
    const normalizedOfficeSpaceId = normalizedPerson.officeSpaceId || '';
    const nameKey = makeNameKey(firstName, lastName);
    const emailKey = email.toLowerCase();
    const personData = standardizeImportedPerson(basePersonData);

    const matchResult = findPersonMatch({ firstName, lastName, email }, existingPeople, { minScore: 0.85, maxCandidates: 5 });
    const existingPerson = matchResult.status === 'exact' ? matchResult.person : null;

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

      // Build minimal updates and diff with from/to pairs
      const updates = {};
      const diff = [];
      if (email && existingPerson.email !== email) {
        updates.email = email;
        diff.push({ key: 'email', from: existingPerson.email || '', to: email });
      }
      const existingPhone = existingPerson.phone || '';
      const existingOffice = existingPerson.office || '';
      if (phone && existingPhone !== phone) {
        updates.phone = phone;
        diff.push({ key: 'phone', from: existingPhone, to: phone });
      }
      if (office && existingOffice !== office) {
        updates.office = office;
        diff.push({ key: 'office', from: existingOffice, to: office });
      }
      if (normalizedOfficeSpaceId && existingPerson.officeSpaceId !== normalizedOfficeSpaceId) {
        updates.officeSpaceId = normalizedOfficeSpaceId;
        diff.push({ key: 'officeSpaceId', from: existingPerson.officeSpaceId || '', to: normalizedOfficeSpaceId });
      }
      if (diff.length > 0) {
        const changeId = transaction.addChange('people', 'modify', updates, existingPerson, { groupKey });
        // Attach diff for UI consumption
        const last = transaction.changes.people.modified.find(c => c.id === changeId);
        if (last) last.diff = diff;
      }
    } else {
      const matchKey = emailKey || nameKey;
      if (!matchKey) {
        continue;
      }

      let matchIssue = pendingMatchMap.get(matchKey) || null;
      if (!matchIssue) {
        const groupKey = `dir_${matchKey}`;
        matchIssue = transaction.addMatchIssue({
          importType: 'directory',
          matchKey,
          reason: matchResult?.reason || 'No exact match',
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

        matchIssue.pendingPersonChangeId = transaction.addChange(
          'people',
          'add',
          personData,
          null,
          { groupKey, pendingResolution: true, matchIssueId: matchIssue.id }
        );
        pendingMatchMap.set(matchKey, matchIssue);
      } else {
        const mergeIfMissing = (target, source) => {
          const merged = { ...target };
          Object.entries(source).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
              merged[key] = value;
            }
          });
          return merged;
        };
        matchIssue.proposedPerson = mergeIfMissing(matchIssue.proposedPerson || {}, personData);
        const pendingChange = transaction.changes.people.added.find(c => c.id === matchIssue.pendingPersonChangeId);
        if (pendingChange) {
          pendingChange.newData = mergeIfMissing(pendingChange.newData || {}, personData);
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

const cleanObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanObject).filter((item) => item !== undefined);
  }
  const cleaned = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = cleanObject(value);
    }
  });
  return cleaned;
};

const getValueByPath = (obj, path) => {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[key];
  }, obj);
};

const MAX_BATCH_OPERATIONS = 450;

const createBatchWriter = ({ onFlush } = {}) => {
  let batch = writeBatch(db);
  let opCount = 0;
  const pendingChanges = new Set();

  const flush = async () => {
    if (opCount === 0) return;
    await batch.commit();
    pendingChanges.forEach((change) => {
      change.applied = true;
    });
    pendingChanges.clear();
    if (typeof onFlush === 'function') {
      await onFlush();
    }
    batch = writeBatch(db);
    opCount = 0;
  };

  const add = async (change, apply) => {
    apply(batch);
    opCount += 1;
    if (change) pendingChanges.add(change);
    if (opCount >= MAX_BATCH_OPERATIONS) {
      await flush();
    }
  };

  return { add, flush };
};

const buildImportRunPayload = (transaction) => ({
  id: transaction.id,
  type: transaction.type,
  description: transaction.description,
  semester: transaction.semester,
  timestamp: transaction.timestamp,
  status: transaction.status,
  stats: transaction.stats,
  importMetadata: transaction.importMetadata || {},
  createdBy: transaction.createdBy,
  lastModified: transaction.lastModified
});

const sanitizeLineageDocId = (value) => {
  if (!value) return '';
  return String(value).replace(/[^A-Za-z0-9_-]+/g, '_');
};

const persistImportRunTracking = async (transaction) => {
  const runRef = doc(db, 'importRuns', transaction.id);
  const runPayload = buildImportRunPayload(transaction);
  await setDoc(runRef, runPayload, { merge: true });

  if (!Array.isArray(transaction.rowLineage) || transaction.rowLineage.length === 0) {
    return;
  }

  const batchWriter = createBatchWriter();
  const now = new Date().toISOString();
  for (const entry of transaction.rowLineage) {
    if (!entry || typeof entry !== 'object') continue;
    const rowId = sanitizeLineageDocId(entry.rowHash || entry.rowIndex || '');
    if (!rowId) continue;
    const docId = `${transaction.id}_${rowId}`;
    const payload = {
      importRunId: transaction.id,
      importType: transaction.type,
      timestamp: now,
      ...entry
    };
    await batchWriter.add(null, (batch) => {
      batch.set(doc(db, 'importRowLineage', docId), payload, { merge: true });
    });
  }
  await batchWriter.flush();
};

// Commit transaction changes to database
export const commitTransaction = async (transactionId, selectedChanges = null, selectedFieldMap = null, matchResolutions = null) => {
  const transactions = await getImportTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'preview') {
    throw new Error('Transaction is not in preview state');
  }

  const matchingIssues = Array.isArray(transaction.matchingIssues) ? transaction.matchingIssues : [];
  const resolutionMap = matchResolutions || {};
  const unresolvedIssues = matchingIssues.filter(issue => !resolutionMap[issue.id]);
  if (unresolvedIssues.length > 0) {
    throw new Error(`Resolve ${unresolvedIssues.length} person match${unresolvedIssues.length === 1 ? '' : 'es'} before committing.`);
  }

  const selectedChangeIds = selectedChanges ? new Set(selectedChanges) : null;
  const resolutionChangeIds = new Set();

  const linkedPersonIds = new Set();
  matchingIssues.forEach((issue) => {
    const resolution = resolutionMap[issue.id];
    if (resolution?.action === 'link' && resolution.personId) {
      linkedPersonIds.add(resolution.personId);
    }
  });

  const linkedPeopleMap = new Map();
  if (linkedPersonIds.size > 0) {
    const linkedDocs = await Promise.all(
      Array.from(linkedPersonIds).map((personId) => getDoc(doc(db, COLLECTIONS.PEOPLE, personId)))
    );
    linkedDocs.forEach((snap) => {
      if (snap.exists()) {
        linkedPeopleMap.set(snap.id, { id: snap.id, ...snap.data() });
      }
    });
  }

  const buildResolutionUpdates = (existingPerson, proposedPerson, importType) => {
    const updates = {};
    const setIfDifferent = (key, value, transform = (val) => val) => {
      if (value === undefined || value === null || value === '') return;
      const normalized = transform(value);
      if (normalized === undefined || normalized === null || normalized === '') return;
      if (existingPerson[key] !== normalized) {
        updates[key] = normalized;
      }
    };

    if (importType === 'schedule') {
      const incomingId = normalizeBaylorId(proposedPerson?.baylorId);
      const existingId = normalizeBaylorId(existingPerson?.baylorId);
      if (incomingId && !existingId) {
        updates.baylorId = incomingId;
      }
    } else if (importType === 'directory') {
      setIfDifferent('email', proposedPerson?.email, (val) => String(val).toLowerCase().trim());
      setIfDifferent('phone', proposedPerson?.phone, (val) => String(val).replace(/\D/g, ''));
      setIfDifferent('office', proposedPerson?.office, (val) => String(val).trim());
      setIfDifferent('officeSpaceId', proposedPerson?.officeSpaceId, (val) => String(val).trim());
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
    }
    return updates;
  };

  matchingIssues.forEach((issue) => {
    const resolution = resolutionMap[issue.id];
    if (resolution?.action !== 'link' || !resolution.personId) return;
    const existingPerson = linkedPeopleMap.get(resolution.personId);
    if (!existingPerson) {
      throw new Error(`Linked person not found for match resolution: ${resolution.personId}`);
    }
    const updates = buildResolutionUpdates(existingPerson, issue.proposedPerson, issue.importType);
    if (Object.keys(updates).length > 1) {
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
  const initialChanges = selectedChangeIds
    ? transaction.getAllChanges().filter(change => selectedChangeIds.has(change.id) || forcedChangeIds.has(change.id))
    : transaction.getAllChanges();
  const changesToApply = initialChanges.filter(change => {
    if (change.pendingResolution && change.matchIssueId) {
      const resolution = resolutionMap[change.matchIssueId];
      return resolution && resolution.action === 'create';
    }
    return true;
  });

  // Maps to track newly created IDs
  const newPeopleIdsByName = new Map();
  const newPeopleIdsByBaylorId = new Map();
  const newPeopleIdsByIssueId = new Map();
  const newRoomIdsByName = new Map();
  const termDocsToUpsert = new Map();
  let createdPeopleCount = 0;
  let createdRoomsCount = 0;

  try {
    // First pass: Create people and rooms, collect their IDs
    for (const change of changesToApply) {
      if (change.collection === 'people' && change.action === 'add') {
        const docRef = doc(collection(db, COLLECTIONS.PEOPLE));
        await batchWriter.add(change, (batch) => {
          batch.set(docRef, change.newData);
        });
        change.documentId = docRef.id;
        createdPeopleCount += 1;

        // Map name to ID for schedule linking
        const nameKey = makeNameKey(change.newData.firstName, change.newData.lastName);
        if (nameKey) {
          newPeopleIdsByName.set(nameKey, docRef.id);
          console.log(`👤 Created person mapping: ${nameKey} -> ${docRef.id}`);
        }

        const baylorKey = normalizeBaylorId(change.newData.baylorId);
        if (baylorKey) {
          newPeopleIdsByBaylorId.set(baylorKey, docRef.id);
        }
        if (change.matchIssueId) {
          newPeopleIdsByIssueId.set(change.matchIssueId, docRef.id);
        }

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

        // Map room name to ID for schedule linking
        const roomKeys = buildRoomNameKeys(change.newData);
        roomKeys.forEach((roomKey) => {
          newRoomIdsByName.set(roomKey, docRef.id);
          console.log(`🏛️ Created room mapping: ${roomKey} -> ${docRef.id}`);
        });
      }
    }

    // Second pass: Create schedules with proper relational IDs
    for (const change of changesToApply) {
      if (change.collection === 'schedules' && change.action === 'add') {
        const scheduleData = { ...change.newData };

        const incomingAssignments = Array.isArray(scheduleData.instructorAssignments)
          ? scheduleData.instructorAssignments
          : [];
        const resolvedAssignments = [];

        incomingAssignments.forEach((assignment) => {
          if (!assignment) return;
          const resolved = { ...assignment };
          if (assignment.matchIssueId) {
            const resolution = resolutionMap[assignment.matchIssueId];
            if (resolution?.action === 'link' && resolution.personId) {
              resolved.personId = resolution.personId;
              const linkedPerson = linkedPeopleMap.get(resolution.personId);
              if (linkedPerson?.baylorId) {
                scheduleData.instructorBaylorId = linkedPerson.baylorId;
              }
            } else if (resolution?.action === 'create') {
              const createdId = newPeopleIdsByIssueId.get(assignment.matchIssueId);
              if (createdId) {
                resolved.personId = createdId;
              }
            }
          }
          if (resolved.personId) {
            resolvedAssignments.push({
              personId: resolved.personId,
              isPrimary: !!resolved.isPrimary,
              percentage: Number.isFinite(resolved.percentage) ? resolved.percentage : 100
            });
          }
        });

        if (resolvedAssignments.length > 0 && !resolvedAssignments.some((a) => a.isPrimary)) {
          resolvedAssignments[0].isPrimary = true;
        }

        const instructorIdSet = new Set(resolvedAssignments.map((a) => a.personId));
        const primaryAssignment = resolvedAssignments.find((a) => a.isPrimary) || resolvedAssignments[0] || null;
        scheduleData.instructorId = primaryAssignment?.personId || scheduleData.instructorId || null;
        scheduleData.instructorIds = Array.from(instructorIdSet);
        scheduleData.instructorAssignments = resolvedAssignments;

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
        let updates = change.newData;
        const selectedKeys = selectedFieldMap && selectedFieldMap[change.id];
        if (selectedKeys && Array.isArray(selectedKeys) && selectedKeys.length > 0) {
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
          if (change.newData?.updatedAt !== undefined && updates.updatedAt === undefined) {
            updates.updatedAt = change.newData.updatedAt;
          }
        }
        await batchWriter.add(change, (batch) => {
          batch.update(doc(db, change.collection, change.originalData.id), updates);
        });
        change.documentId = change.originalData.id;
      } else if (change.action === 'delete') {
        await batchWriter.add(change, (batch) => {
          batch.delete(doc(db, change.collection, change.originalData.id));
        });
        change.documentId = change.originalData.id;
      }
    }

    for (const termData of termDocsToUpsert.values()) {
      if (!termData.termCode) continue;
      const termRef = doc(db, COLLECTIONS.TERMS, termData.termCode);
      const termSnap = await getDoc(termRef);
      const now = new Date().toISOString();
      const termLabel = termData.term || termLabelFromCode(termData.termCode) || '';
      const termDoc = {
        term: termLabel,
        termCode: termData.termCode,
        updatedAt: now
      };
      if (!termSnap.exists()) {
        termDoc.status = 'active';
        termDoc.locked = false;
        termDoc.createdAt = now;
      }
      await batchWriter.add(null, (batch) => {
        batch.set(termRef, termDoc, { merge: true });
      });
    }

    await batchWriter.flush();

    transaction.status = 'committed';
    transaction.lastModified = new Date().toISOString();

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

    try {
      await persistImportRunTracking(transaction);
    } catch (error) {
      console.warn('Import run tracking failed:', error?.message || error);
    }

    await updateTransactionInStorage(transaction);

    console.log(`✅ Transaction committed with ${changesToApply.length} changes`);
    console.log(`👤 Created ${createdPeopleCount} new people`);
    console.log(`🏛️ Created ${createdRoomsCount} new rooms`);

    // Centralized change logging for applied changes
    try {
      // Per-change logs (best-effort, non-blocking)
      for (const change of changesToApply) {
        const source = 'importTransactionUtils.js - commitTransaction';
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
        }
      }
      // Aggregate log for import
      logImport(
        `Import - ${transaction.description}`,
        'multiple',
        changesToApply.length,
        'importTransactionUtils.js - commitTransaction',
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
      if (appliedChanges.length > 0 && transaction) {
        transaction.status = 'partial';
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
  console.log('🔄 Starting rollback for transaction:', transactionId);

  const transactions = await getImportTransactions();
  console.log('📋 Found transactions:', transactions.length);

  const transaction = transactions.find(t => t.id === transactionId);
  console.log('🎯 Transaction found:', transaction ? 'YES' : 'NO');

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  console.log('📊 Transaction status:', transaction.status);
  console.log('📊 Transaction stats:', transaction.stats);

  if (transaction.status !== 'committed' && transaction.status !== 'partial') {
    throw new Error('Transaction is not committed');
  }

  const allChanges = transaction.getAllChanges();
  console.log('📋 Total changes in transaction:', allChanges.length);

  const appliedChanges = allChanges.filter(change => change.applied);
  console.log('✅ Applied changes to rollback:', appliedChanges.length);

  // Log details of applied changes
  appliedChanges.forEach(change => {
    console.log(`   - ${change.action} ${change.collection}: ${change.documentId || 'no-doc-id'}`);
  });

  if (appliedChanges.length === 0) {
    console.warn('⚠️ No applied changes found to rollback!');
    // Still mark as rolled back to prevent further attempts
    transaction.status = 'rolled_back';
    await updateTransactionInStorage(transaction);
    return transaction;
  }

  const batch = writeBatch(db);

  try {
    console.log('🔄 Processing changes in reverse order...');

    // Reverse changes in opposite order
    for (const change of appliedChanges.reverse()) {
      console.log(`   Processing ${change.action} on ${change.collection}/${change.documentId}`);

      if (change.action === 'add' && change.documentId) {
        // Delete added documents
        const collectionName = change.collection;
        const docRef = doc(db, collectionName, change.documentId);
        console.log(`     🗑️ Deleting ${collectionName}/${change.documentId}`);
        batch.delete(docRef);
      } else if (change.action === 'modify' && change.originalData) {
        // Restore original data
        const collectionName = change.collection;
        console.log(`     🔄 Restoring ${collectionName}/${change.documentId}`);
        batch.update(doc(db, collectionName, change.documentId), change.originalData);
      } else if (change.action === 'delete' && change.originalData) {
        // Re-add deleted documents
        const collectionName = change.collection;
        console.log(`     ➕ Re-adding ${collectionName}/${change.originalData.id}`);
        batch.set(doc(db, collectionName, change.originalData.id), change.originalData);
      }
    }

    console.log('💾 Committing rollback batch...');
    await batch.commit();
    console.log('✅ Rollback batch committed successfully');

    transaction.status = 'rolled_back';
    console.log('💾 Updating transaction status...');
    await updateTransactionInStorage(transaction);

    console.log('🎉 Rollback completed successfully');
    return transaction;
  } catch (error) {
    console.error('❌ Error rolling back transaction:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
};

// Database-backed utility functions

// Diagnostic function to check rollback effectiveness
export const diagnoseRollbackEffectiveness = async (transactionId) => {
  console.log('🔍 Diagnosing rollback effectiveness for transaction:', transactionId);

  const transactions = await getImportTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    console.log('❌ Transaction not found');
    return;
  }

  console.log('📊 Transaction status:', transaction.status);
  console.log('📊 Transaction stats:', transaction.stats);

  const appliedChanges = transaction.getAllChanges().filter(change => change.applied);
  console.log('✅ Applied changes:', appliedChanges.length);

  // Check if documents still exist in database
  console.log('🔍 Checking if rolled back documents still exist...');

  for (const change of appliedChanges) {
    if (change.action === 'add' && change.documentId) {
      try {
        const collectionName = change.collection;
        const docRef = doc(db, collectionName, change.documentId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          console.log(`❌ Document still exists: ${collectionName}/${change.documentId}`);
          console.log('   Data:', docSnap.data());
        } else {
          console.log(`✅ Document successfully deleted: ${collectionName}/${change.documentId}`);
        }
      } catch (error) {
        console.log(`❌ Error checking document ${change.collection}/${change.documentId}:`, error.message);
      }
    }
  }

  return appliedChanges;
};

// Manual cleanup function for failed rollbacks
export const manualCleanupImportedData = async (transactionId) => {
  console.log('🧹 Starting manual cleanup for transaction:', transactionId);

  const transactions = await getImportTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const appliedChanges = transaction.getAllChanges().filter(change => change.applied);
  console.log('🗑️ Found', appliedChanges.length, 'applied changes to clean up');

  if (appliedChanges.length === 0) {
    console.log('✅ No applied changes to clean up');
    return { cleaned: 0, errors: 0 };
  }

  const batch = writeBatch(db);
  let cleanedCount = 0;
  let errorCount = 0;

  console.log('🔄 Processing manual cleanup...');

  for (const change of appliedChanges) {
    if (change.action === 'add' && change.documentId) {
      try {
        const collectionName = change.collection;
        const docRef = doc(db, collectionName, change.documentId);

        // Check if document exists before attempting to delete
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          console.log(`   🗑️ Deleting ${collectionName}/${change.documentId}`);
          batch.delete(docRef);
          cleanedCount++;
        } else {
          console.log(`   ✅ Already deleted: ${collectionName}/${change.documentId}`);
        }
      } catch (error) {
        console.error(`❌ Error deleting ${change.collection}/${change.documentId}:`, error.message);
        errorCount++;
      }
    }
  }

  if (cleanedCount > 0) {
    console.log('💾 Committing manual cleanup batch...');
    await batch.commit();
    console.log('✅ Manual cleanup completed successfully');
  }

  return { cleaned: cleanedCount, errors: errorCount };
};

// Get all transactions and their current status
export const getAllTransactionStatuses = async () => {
  const transactions = await getImportTransactions();
  console.log('📋 All transaction statuses:');
  transactions.forEach(t => {
    console.log(`   ${t.id}: ${t.status} (${t.stats.totalChanges} changes, ${t.semester})`);
  });
  return transactions;
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

// Save transaction to database
const saveTransactionToDatabase = async (transaction) => {
  try {
    // Use the transaction's ID as the document ID for consistent access
    const transactionRef = doc(db, 'importTransactions', transaction.id);
    const transactionData = transaction.toFirestore();
    // Add cleaning
    const cleanedData = cleanObject(transactionData);

    // Use setDoc which can both create and update documents
    await setDoc(transactionRef, cleanedData, { merge: true });
    console.log(`💾 Saved transaction ${transaction.id} to database`);
  } catch (error) {
    console.error('Error saving transaction to database:', error);
    throw error;
  }
};

// Update transaction in database
const updateTransactionInStorage = async (updatedTransaction) => {
  try {
    await saveTransactionToDatabase(updatedTransaction);
  } catch (error) {
    console.error('Error updating transaction in database:', error);
    throw error;
  }
};

// Get all import transactions from database
export const getImportTransactions = async () => {
  try {
    const transactionsQuery = query(
      collection(db, 'importTransactions'),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(transactionsQuery);

    // Reconstruct ImportTransaction objects with methods
    const transactions = snapshot.docs.map(doc => {
      const data = { id: doc.id, ...doc.data() };
      return ImportTransaction.fromFirestore(data);
    });

    console.log(`📋 Loaded ${transactions.length} transactions from database`);
    return transactions;
  } catch (error) {
    console.error('Error loading transactions from database:', error);
    // Fallback to empty array if database read fails
    return [];
  }
};

// Delete transaction from database
export const deleteTransaction = async (transactionId) => {
  try {
    await deleteDoc(doc(db, 'importTransactions', transactionId));
    console.log(`🗑️ Deleted transaction ${transactionId} from database`);
  } catch (error) {
    console.error('Error deleting transaction from database:', error);
    throw error;
  }
};
