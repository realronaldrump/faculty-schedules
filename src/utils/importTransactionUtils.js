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
import { parseMeetingPatterns } from './meetingPatternUtils';
import { findPersonMatch, makeNameKey, normalizeBaylorId } from './personMatchUtils';
import { normalizeTermLabel, termCodeFromLabel, termLabelFromCode } from './termUtils';
import { getRoomKeyFromRoomRecord, parseRoomLabel, splitRoomLabels } from './roomUtils';
import { LOCATION_TYPE, parseMultiRoom } from './locationService';

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
      matchIssueId: options.matchIssueId || null
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
    return transaction;
  }
}

// Preview import changes without committing to database
export const previewImportChanges = async (csvData, importType, selectedSemester, options = {}) => {
  const { persist = true, includeOfficeRooms = true } = options;
  const normalizedSemester = normalizeTermLabel(selectedSemester || '');
  const transaction = new ImportTransaction(
    importType,
    `${importType} import preview`,
    normalizedSemester || selectedSemester
  );

  try {
    let existingSchedulesData = [];
    let existingPeopleData = [];
    let existingRoomsData = [];

    if (importType === 'schedule') {
      const termCode = termCodeFromLabel(normalizedSemester || selectedSemester || '');
      const schedulesQuery = termCode
        ? query(collection(db, COLLECTIONS.SCHEDULES), where('termCode', '==', termCode))
        : (normalizedSemester ? query(collection(db, COLLECTIONS.SCHEDULES), where('term', '==', normalizedSemester)) : null);

      const [schedulesSnapshot, peopleSnapshot, roomsSnapshot] = await Promise.all([
        schedulesQuery ? getDocs(schedulesQuery) : Promise.resolve({ docs: [] }),
        getDocs(collection(db, COLLECTIONS.PEOPLE)),
        getDocs(collection(db, COLLECTIONS.ROOMS))
      ]);

      existingSchedulesData = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

export const normalizeSectionIdentifier = (sectionField) => {
  if (!sectionField) return '';
  const raw = String(sectionField).trim();
  if (!raw) return '';
  const cut = raw.split(' ')[0];
  const idx = cut.indexOf('(');
  return idx > -1 ? cut.substring(0, idx).trim() : cut.trim();
};

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
  const courseCode = row.Course || '';
  const courseTitle = row['Course Title'] || row['Long Title'] || '';
  const section = normalizeSectionIdentifier(row['Section #'] || '');

  const directCrn = (row['CRN'] || '').toString().trim();
  const sectionCrn = extractCrnFromSectionField(row['Section #'] || '');
  const crn = /^\d{5,6}$/.test(directCrn)
    ? directCrn
    : (/^\d{5,6}$/.test(sectionCrn) ? sectionCrn : '');

  const rawCredits = row['Credit Hrs'] ?? row['Credit Hrs Min'] ?? row['Credit Hrs Max'] ?? null;
  const catalogNumber = (row['Catalog Number'] || '').toString().trim();
  const parsedCourse = parseCourseCode(courseCode || '');
  const catalogForCredits = catalogNumber || parsedCourse?.catalogNumber || '';
  const derivedCredits = deriveCreditsFromCatalogNumber(catalogForCredits, rawCredits);
  const numericFallback = rawCredits === null || rawCredits === undefined
    ? null
    : Number.parseFloat(rawCredits);
  const credits = derivedCredits ?? (Number.isNaN(numericFallback) ? null : numericFallback) ?? (parsedCourse?.credits ?? null);

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
  const roomNames = parsedRoomNames.length > 0
    ? parsedRoomNames
    : (roomRaw ? splitRoomLabels(roomRaw) : []);
  const inferredIsOnline =
    parsedRooms.locationType === LOCATION_TYPE.VIRTUAL ||
    roomRaw.toUpperCase().includes('ONLINE') ||
    instructionMethod.toLowerCase().includes('online');
  const isPhysical =
    parsedRooms.locationType === LOCATION_TYPE.PHYSICAL ||
    (parsedRooms.locationType === LOCATION_TYPE.UNKNOWN && roomNames.length > 0);
  const locationType = isPhysical ? 'room' : 'no_room';
  const locationLabel = inferredIsOnline
    ? 'Online'
    : (locationType === 'no_room'
      ? (parsedRooms.locationLabel || (roomRaw || 'No Room Needed'))
      : '');
  const filteredRoomNames = locationType === 'no_room'
    ? []
    : roomNames;
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
    crn,
    credits: credits ?? null,
    creditRaw: rawCredits,
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
    roomNames: filteredRoomNames,
    spaceIds,
    spaceDisplayNames,
    locationType,
    locationLabel,
    isOnline: inferredIsOnline,
    subjectCode: row['Subject Code'] || '',
    catalogNumber,
    departmentCode: row['Department Code'] || '',
    scheduleType: row['Schedule Type'] || 'Class Instruction',
    status: row.Status || 'Active',
    partOfTerm: row['Part of Semester'] || row['Part of Term'] || '',
    instructionMethod,
    campus: row.Campus || '',
    visibleOnWeb: row['Visible on Web'] || '',
    specialApproval: row['Special Approval'] || ''
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
    'Rooms (parsed)': base.roomNames.join('; '),
    'Meeting Pattern (raw)': base.meetingPatternRaw,
    'Meeting Pattern (parsed)': meetingSummary,
    'Visible on Web': base.visibleOnWeb,
    'Special Approval': base.specialApproval
  };
};

const buildRoomNameKeys = (roomData) => {
  const keys = new Set();
  const candidates = [roomData.name, roomData.displayName];
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
  const schedulesByCrnTerm = new Map();
  const schedulesByCourseSectionTerm = new Map();
  const seenScheduleKeys = new Set();
  const pendingMatchMap = new Map();

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

  const summary = {
    rowsTotal: Array.isArray(csvData) ? csvData.length : 0,
    rowsSkipped: 0,
    schedulesAdded: 0,
    schedulesUpdated: 0,
    schedulesUnchanged: 0
  };

  existingRooms.forEach((room) => {
    const roomKey = getRoomKeyFromRoomRecord(room);
    if (roomKey && !roomsKeyMap.has(roomKey)) {
      roomsKeyMap.set(roomKey, room);
    }
    if (room?.spaceKey && !roomsKeyMap.has(room.spaceKey)) {
      roomsKeyMap.set(room.spaceKey, room);
    }
    if (room?.roomKey && !roomsKeyMap.has(room.roomKey)) {
      roomsKeyMap.set(room.roomKey, room);
    }
    buildRoomNameKeys(room).forEach((key) => roomsMap.set(key, room));
  });

  existingSchedules.forEach((schedule) => {
    const term = normalizeTermLabel(schedule.term || '');
    const courseCode = schedule.courseCode || '';
    const section = normalizeSectionIdentifier(schedule.section || '');
    const crn = (schedule.crn || '').toString().trim();
    if (courseCode && section && term) {
      schedulesByCourseSectionTerm.set(`${courseCode}-${section}-${term}`, schedule);
    }
    if (crn && term) {
      schedulesByCrnTerm.set(`${term}-${crn}`, schedule);
    }
  });

  const formatDiffValue = (value) => {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value) || typeof value === 'object') {
      try {
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

    if (!baseData.courseCode) {
      addValidation('error', `${rowLabel}: Missing Course`);
      summary.rowsSkipped += 1;
      continue;
    }
    if (!baseData.term && !baseData.termCode) {
      addValidation('error', `${rowLabel}: Missing Semester`);
      summary.rowsSkipped += 1;
      continue;
    }
    if (!baseData.instructorField) {
      addValidation('error', `${rowLabel}: Missing Instructor`);
      summary.rowsSkipped += 1;
      continue;
    }
    if (!baseData.crn || !/^\d{5,6}$/.test(baseData.crn)) {
      addValidation('error', `${rowLabel}: Invalid CRN "${baseData.crn || ''}"`);
      summary.rowsSkipped += 1;
      continue;
    }

    const scheduleKey = `${baseData.courseCode}-${baseData.section}-${baseData.term}`;
    if (seenScheduleKeys.has(scheduleKey)) {
      addValidation('warning', `${rowLabel}: Duplicate schedule "${scheduleKey}" skipped`);
      summary.rowsSkipped += 1;
      continue;
    }
    seenScheduleKeys.add(scheduleKey);

    // Precompute key fields and group key for cascading selection
    const preCourseCode = baseData.courseCode;
    const preSection = baseData.section;
    const preTerm = baseData.term;
    const groupKey = `sched_${preCourseCode}_${preSection}_${preTerm}`;

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
        const proposedPerson = {
          firstName: parsed?.firstName || '',
          lastName: parsed?.lastName || '',
          email: '',
          baylorId: baylorId || '',
          roles: ['faculty'],
          isActive: true
        };
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
    const splitRooms = Array.isArray(baseData.roomNames) ? baseData.roomNames : [];
    const resolvedRoomIds = [];
    const resolvedSpaceKeys = [];
    let primaryRoomId = null;
    if (splitRooms.length > 0) {
      for (const singleRoom of splitRooms) {
        const nameKey = normalizeRoomName(singleRoom);
        if (!nameKey) continue;

        const parsed = parseRoomLabel(singleRoom);
        const spaceKey = parsed?.spaceKey || '';
        const roomKey = spaceKey || parsed?.roomKey || '';
        if (spaceKey) resolvedSpaceKeys.push(spaceKey);

        let room = roomKey ? roomsKeyMap.get(roomKey) : null;
        if (!room) {
          room = roomsMap.get(nameKey) || null;
        }

        if (!room && roomKey) {
          const now = new Date().toISOString();
          const buildingCode = parsed?.buildingCode || (spaceKey ? spaceKey.split(':')[0] : '');
          const spaceNumber = parsed?.spaceNumber || parsed?.roomNumber || '';
          const buildingDisplayName = parsed?.building || buildingCode || '';
          const displayName = parsed?.displayName || singleRoom;
          const newRoom = {
            spaceKey: spaceKey || '',
            spaceNumber,
            buildingCode,
            buildingDisplayName,
            name: displayName,
            displayName,
            building: buildingDisplayName,
            roomNumber: spaceNumber,
            roomKey: parsed?.roomKey || '',
            capacity: null,
            type: 'Classroom',
            isActive: true,
            createdAt: now,
            updatedAt: now
          };
          transaction.addChange('rooms', 'add', newRoom, null, { groupKey });
          const placeholder = { id: roomKey, ...newRoom };
          roomsKeyMap.set(roomKey, placeholder);
          if (spaceKey) roomsKeyMap.set(spaceKey, placeholder);
          buildRoomNameKeys(placeholder).forEach((key) => roomsMap.set(key, placeholder));
          room = placeholder;
        }

        if (room?.id) {
          if (!resolvedRoomIds.includes(room.id)) {
            resolvedRoomIds.push(room.id);
          }
          if (!primaryRoomId) {
            primaryRoomId = room.id;
          }
        }
      }
    }

    const courseCode = preCourseCode;
    const section = preSection;
    const term = preTerm;

    const scheduleLookupKey = `${courseCode}-${section}-${term}`;
    let existingSchedule = schedulesByCrnTerm.get(`${term}-${baseData.crn}`) || null;
    if (!existingSchedule) {
      existingSchedule = schedulesByCourseSectionTerm.get(scheduleLookupKey) || null;
    }

    const finalCrn = baseData.crn;
    const instructorDisplayName = parsedList.length > 1
      ? (baseData.normalizedInstructorName || instructorField)
      : normalizeInstructorDisplayName(primaryInstructor, primaryParsed, instructorField);
    const instructorMatchIssueIds = instructorAssignments
      .map((assignment) => assignment.matchIssueId)
      .filter(Boolean);
    const uniqueRoomIds = Array.from(new Set(resolvedRoomIds));
    const uniqueSpaceIds = baseData.locationType === 'no_room'
      ? []
      : Array.from(new Set([...(baseData.spaceIds || []), ...resolvedSpaceKeys]));
    const spaceDisplayNames = baseData.locationType === 'no_room'
      ? []
      : Array.from(new Set(baseData.spaceDisplayNames || splitRooms));

    const scheduleData = {
      courseCode,
      courseTitle: baseData.courseTitle,
      section,
      crn: finalCrn,
      credits: baseData.credits ?? null,
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
      roomIds: uniqueRoomIds,
      roomId: primaryRoomId || uniqueRoomIds[0] || null,
      roomNames: baseData.locationType === 'no_room' ? [] : splitRooms,
      roomName: baseData.locationType === 'no_room' ? '' : (splitRooms[0] || ''),
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

    const crossListCrns = parseCrossListCrns(row);
    if (crossListCrns && crossListCrns.length > 0) {
      scheduleData.crossListCrns = Array.from(new Set(crossListCrns));
    }

    const {
      instructorName: _omitInstructorName,
      roomName: _omitRoomName,
      courseTitle: _omitCourseTitle,
      instructorMatchIssueIds: _omitMatchIssueIds,
      ...scheduleWrite
    } = scheduleData;

    if (existingSchedule) {
      const allowEmptyFields = (scheduleWrite.locationType === 'no_room' || scheduleWrite.isOnline)
        ? ['roomNames', 'roomName', 'roomIds', 'roomId', 'spaceIds', 'spaceDisplayNames']
        : [];
      const { updates, hasChanges } = buildUpsertUpdates(existingSchedule, scheduleWrite, { allowEmptyFields });
      if (!hasChanges) {
        summary.schedulesUnchanged += 1;
        continue;
      }

      const changeId = transaction.addChange('schedules', 'modify', updates, existingSchedule, { groupKey });
      const change = transaction.changes.schedules.modified.find((c) => c.id === changeId);
      if (change) {
        change.diff = Object.entries(updates).map(([key, value]) => ({
          key,
          from: formatDiffValue(existingSchedule[key]),
          to: formatDiffValue(value)
        }));
      }
      summary.schedulesUpdated += 1;
      continue;
    }

    const scheduleChangeId = transaction.addChange('schedules', 'add', scheduleData, null, { groupKey });
    matchIssuesForSchedule.forEach((issue) => {
      if (!issue) return;
      issue.scheduleChangeIds = Array.isArray(issue.scheduleChangeIds)
        ? Array.from(new Set([...issue.scheduleChangeIds, scheduleChangeId]))
        : [scheduleChangeId];
    });
    summary.schedulesAdded += 1;
  }

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
    const roomKey = getRoomKeyFromRoomRecord(room);
    if (roomKey && !roomsKeyMap.has(roomKey)) {
      roomsKeyMap.set(roomKey, room);
    }
    buildRoomNameKeys(room).forEach((key) => roomsMap.set(key, room));
  });

  for (const row of csvData) {
    const firstName = (row['First Name'] || '').trim();
    const lastName = (row['Last Name'] || '').trim();
    const email = (row['E-mail Address'] || '').trim();

    if (!firstName && !lastName && !email) continue;

    const nameKey = makeNameKey(firstName, lastName);
    const emailKey = email.toLowerCase();

    const matchResult = findPersonMatch({ firstName, lastName, email }, existingPeople, { minScore: 0.85, maxCandidates: 5 });
    const existingPerson = matchResult.status === 'exact' ? matchResult.person : null;

    const officeRaw = row['Office'] || row['Office Location'] || '';
    const parsedOffice = parseRoomLabel(officeRaw);
    const officeRoomKey = parsedOffice?.roomKey || '';
    const officeSpaceKey = parsedOffice?.spaceKey || '';
    const officeBuildingCode = parsedOffice?.buildingCode || (officeSpaceKey ? officeSpaceKey.split(':')[0] : '');
    const officeSpaceNumber = parsedOffice?.spaceNumber || parsedOffice?.roomNumber || '';
    const officeBuildingName = parsedOffice?.building || officeBuildingCode || '';
    const officeDisplayName = parsedOffice?.displayName || officeRaw;
    const officeNameKey = normalizeRoomName(officeRaw);
    let existingOfficeRoom = officeSpaceKey ? roomsKeyMap.get(officeSpaceKey) : null;
    if (!existingOfficeRoom && officeRoomKey) {
      existingOfficeRoom = roomsKeyMap.get(officeRoomKey) || null;
    }
    if (!existingOfficeRoom && officeNameKey) {
      existingOfficeRoom = roomsMap.get(officeNameKey) || null;
    }
    const officeRoomId = existingOfficeRoom?.id || (includeOfficeRooms ? officeSpaceKey : '') || '';
    const officeSpaceId = officeSpaceKey || '';

    const personData = {
      firstName,
      lastName,
      email,
      roles: ['faculty'], // default to faculty for directory imports
      phone: row['Phone'] || row['Business Phone'] || row['Home Phone'] || '',
      office: officeRaw,
      officeSpaceId,
      officeRoomId,
      isActive: true
    };

    if (existingPerson) {
      const groupKey = `dir_${existingPerson.id}`;

      if (includeOfficeRooms && officeSpaceKey && !existingOfficeRoom) {
        const now = new Date().toISOString();
        const newRoom = {
          spaceKey: officeSpaceKey,
          spaceNumber: officeSpaceNumber,
          buildingCode: officeBuildingCode,
          buildingDisplayName: officeBuildingName,
          name: officeDisplayName,
          displayName: officeDisplayName,
          building: officeBuildingName,
          roomNumber: officeSpaceNumber,
          roomKey: officeRoomKey,
          capacity: null,
          type: 'Office',
          isActive: true,
          createdAt: now,
          updatedAt: now
        };
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
      if ((personData.phone || '') && existingPhone !== personData.phone) {
        updates.phone = personData.phone;
        diff.push({ key: 'phone', from: existingPhone, to: personData.phone });
      }
      if ((personData.office || '') && existingOffice !== personData.office) {
        updates.office = personData.office;
        diff.push({ key: 'office', from: existingOffice, to: personData.office });
      }
      if (officeSpaceId && existingPerson.officeSpaceId !== officeSpaceId) {
        updates.officeSpaceId = officeSpaceId;
        diff.push({ key: 'officeSpaceId', from: existingPerson.officeSpaceId || '', to: officeSpaceId });
      }
      if (officeRoomId && existingPerson.officeRoomId !== officeRoomId) {
        updates.officeRoomId = officeRoomId;
        diff.push({ key: 'officeRoomId', from: existingPerson.officeRoomId || '', to: officeRoomId });
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

        if (includeOfficeRooms && officeRoomKey && !existingOfficeRoom && !roomsKeyMap.has(officeRoomKey)) {
          const now = new Date().toISOString();
          const newRoom = {
            spaceKey: officeSpaceKey,
            spaceNumber: officeSpaceNumber,
            buildingCode: officeBuildingCode,
            buildingDisplayName: officeBuildingName,
            name: officeDisplayName,
            displayName: officeDisplayName,
            building: officeBuildingName,
            roomNumber: officeSpaceNumber,
            roomKey: officeRoomKey,
            capacity: null,
            type: 'Office',
            isActive: true,
            createdAt: now,
            updatedAt: now
          };
          transaction.addChange('rooms', 'add', newRoom, null, { groupKey });
          const placeholder = { id: officeRoomKey, ...newRoom };
          roomsKeyMap.set(officeRoomKey, placeholder);
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
          const newRoom = {
            name: parsedOffice.displayName,
            displayName: parsedOffice.displayName,
            building: parsedOffice.building,
            roomNumber: parsedOffice.roomNumber,
            roomKey: officeRoomKey,
            spaceKey: officeSpaceKey,
            spaceNumber: officeSpaceNumber,
            buildingCode: officeBuildingCode,
            buildingDisplayName: officeBuildingName,
            capacity: null,
            type: 'Office',
            isActive: true,
            createdAt: now,
            updatedAt: now
          };
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
      setIfDifferent('officeRoomId', proposedPerson?.officeRoomId, (val) => String(val).trim());
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
        const preferredId = (change.newData?.spaceKey || change.newData?.roomKey || '').toString().trim();
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

        // Fallback for legacy single-instructor data
        if (resolvedAssignments.length === 0 && scheduleData.instructorName) {
          let resolvedInstructorId = scheduleData.instructorId || null;
          const baylorKey = normalizeBaylorId(scheduleData.instructorBaylorId);
          if (!resolvedInstructorId && baylorKey && newPeopleIdsByBaylorId.has(baylorKey)) {
            resolvedInstructorId = newPeopleIdsByBaylorId.get(baylorKey);
            console.log(`🔗 Linked schedule to instructor (Baylor ID): ${baylorKey} -> ${resolvedInstructorId}`);
          }
          if (!resolvedInstructorId) {
            const nameKey = deriveNameKeyFromDisplayName(scheduleData.instructorName);
            if (nameKey && newPeopleIdsByName.has(nameKey)) {
              resolvedInstructorId = newPeopleIdsByName.get(nameKey);
              console.log(`🔗 Linked schedule to instructor: ${nameKey} -> ${resolvedInstructorId}`);
            }
          }
          if (resolvedInstructorId) {
            resolvedAssignments.push({
              personId: resolvedInstructorId,
              isPrimary: true,
              percentage: 100
            });
          }
        }

        if (resolvedAssignments.length > 0 && !resolvedAssignments.some((a) => a.isPrimary)) {
          resolvedAssignments[0].isPrimary = true;
        }

        const instructorIdSet = new Set(resolvedAssignments.map((a) => a.personId));
        const primaryAssignment = resolvedAssignments.find((a) => a.isPrimary) || resolvedAssignments[0] || null;
        scheduleData.instructorId = primaryAssignment?.personId || scheduleData.instructorId || null;
        scheduleData.instructorIds = Array.from(instructorIdSet);
        scheduleData.instructorAssignments = resolvedAssignments;

        // Update room ID if this references a newly created room
        const roomNames = Array.isArray(scheduleData.roomNames) ? scheduleData.roomNames : [];
        const resolvedRoomIds = new Set(scheduleData.roomIds || []);

        roomNames.forEach((roomName) => {
          const roomKey = normalizeRoomName(roomName);
          if (roomKey && newRoomIdsByName.has(roomKey)) {
            resolvedRoomIds.add(newRoomIdsByName.get(roomKey));
          }
        });

        if (scheduleData.roomName) {
          const primaryRoomKey = normalizeRoomName(scheduleData.roomName);
          if (primaryRoomKey && newRoomIdsByName.has(primaryRoomKey)) {
            resolvedRoomIds.add(newRoomIdsByName.get(primaryRoomKey));
          }
        }

        const uniqueResolvedRoomIds = Array.from(resolvedRoomIds);
        if (uniqueResolvedRoomIds.length > 0) {
          scheduleData.roomIds = uniqueResolvedRoomIds;
          if (!scheduleData.roomId) {
            scheduleData.roomId = uniqueResolvedRoomIds[0];
          }
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

        // Deterministic schedule ID: termCode_crn (fallback term_crn)
        const baseTerm = scheduleData.termCode || scheduleData.term || 'TERM';
        const scheduleDeterministicId = scheduleData.crn
          ? `${baseTerm}_${scheduleData.crn}`
          : `${baseTerm}_${(scheduleData.courseCode || 'COURSE').replace(/[^A-Za-z0-9]+/g, '-')}_${(scheduleData.section || 'SEC').replace(/[^A-Za-z0-9]+/g, '-')}`;
        const schedRef = doc(db, COLLECTIONS.SCHEDULES, scheduleDeterministicId);
        const {
          instructorName: _omitInstructorName,
          roomName: _omitRoomName,
          courseTitle: _omitCourseTitle,
          ...scheduleWrite
        } = scheduleData;
        await batchWriter.add(change, (batch) => {
          batch.set(schedRef, scheduleWrite, { merge: true });
        });
        change.documentId = schedRef.id;

      } else if (change.collection !== 'people' && change.collection !== 'rooms') {
        // Handle other types of changes (modify, delete)
        if (change.action === 'modify') {
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
    await updateTransactionInStorage(transaction);

    console.log(`✅ Transaction committed with ${changesToApply.length} changes`);
    console.log(`👤 Created ${createdPeopleCount} new people`);
    console.log(`🏛️ Created ${createdRoomsCount} new rooms`);

    // Centralized change logging for applied changes
    try {
      // Per-change logs (best-effort, non-blocking)
      for (const change of changesToApply) {
        const source = 'importTransactionUtils.js - commitTransaction';
        if (change.collection === 'schedules') {
          if (change.action === 'add') {
            logCreate(
              `Schedule - ${change.newData.courseCode} ${change.newData.section} (${change.newData.term})`,
              COLLECTIONS.SCHEDULES,
              change.documentId,
              change.newData,
              source
            ).catch(() => { });
          } else if (change.action === 'modify') {
            logUpdate(
              `Schedule - ${change.originalData?.courseCode || ''} ${change.originalData?.section || ''} (${change.originalData?.term || ''})`,
              COLLECTIONS.SCHEDULES,
              change.documentId,
              change.newData,
              change.originalData,
              source
            ).catch(() => { });
          } else if (change.action === 'delete') {
            logDelete(
              `Schedule - ${change.originalData?.courseCode || ''} ${change.originalData?.section || ''} (${change.originalData?.term || ''})`,
              COLLECTIONS.SCHEDULES,
              change.documentId,
              change.originalData,
              source
            ).catch(() => { });
          }
        } else if (change.collection === 'people') {
          if (change.action === 'add') {
            logCreate(
              `Person - ${change.newData.firstName || ''} ${change.newData.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.newData,
              source
            ).catch(() => { });
          } else if (change.action === 'modify') {
            logUpdate(
              `Person - ${change.originalData?.firstName || ''} ${change.originalData?.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.newData,
              change.originalData,
              source
            ).catch(() => { });
          } else if (change.action === 'delete') {
            logDelete(
              `Person - ${change.originalData?.firstName || ''} ${change.originalData?.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.originalData,
              source
            ).catch(() => { });
          }
        } else if (change.collection === 'rooms') {
          if (change.action === 'add') {
            logCreate(
              `Room - ${change.newData.displayName || change.newData.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.newData,
              source
            ).catch(() => { });
          } else if (change.action === 'modify') {
            logUpdate(
              `Room - ${change.originalData?.displayName || change.originalData?.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.newData,
              change.originalData,
              source
            ).catch(() => { });
          } else if (change.action === 'delete') {
            logDelete(
              `Room - ${change.originalData?.displayName || change.originalData?.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.originalData,
              source
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
        { transactionId: transaction.id, semester: transaction.semester, stats: transaction.stats }
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
        if (data.roomId) usedRoomsOutsideTerm.add(data.roomId);
        if (Array.isArray(data.roomIds)) {
          data.roomIds.forEach((rid) => rid && usedRoomsOutsideTerm.add(rid));
        }
      } else {
        if (data.instructorId) usedPeopleInSelectedTerm.add(data.instructorId);
        if (data.roomId) usedRoomsInSelectedTerm.add(data.roomId);
        if (Array.isArray(data.roomIds)) {
          data.roomIds.forEach((rid) => rid && usedRoomsInSelectedTerm.add(rid));
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
