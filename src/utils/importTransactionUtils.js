import { collection, getDocs, getDoc, doc, updateDoc, addDoc, deleteDoc, writeBatch, query, orderBy, setDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { logCreate, logUpdate, logDelete, logBulkUpdate, logImport } from './changeLogger';
import { findMatchingPerson, parseFullName, parseInstructorField } from './dataImportUtils';
import { parseCourseCode, deriveCreditsFromCatalogNumber } from './courseUtils';
import { getBuildingFromRoom } from './buildingUtils';

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
      groupKey: options.groupKey || null
    };

    this.changes[collection][action === 'add' ? 'added' : action === 'modify' ? 'modified' : 'deleted'].push(change);
    this.updateStats();
    this.lastModified = new Date().toISOString();
    return change.id;
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
      originalData: this.originalData,
      stats: this.stats,
      createdBy: this.createdBy,
      lastModified: this.lastModified
    };
  }

  // Create from database format
  static fromFirestore(data) {
    const transaction = Object.assign(new ImportTransaction(), data);
    return transaction;
  }
}

// Preview import changes without committing to database
export const previewImportChanges = async (csvData, importType, selectedSemester, options = {}) => {
  const { persist = true } = options;
  const transaction = new ImportTransaction(importType, `${importType} import preview`, selectedSemester);

  try {
    // Load existing data for comparison
    const [existingSchedules, existingPeople, existingRooms] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.SCHEDULES)),
      getDocs(collection(db, COLLECTIONS.PEOPLE)),
      getDocs(collection(db, COLLECTIONS.ROOMS))
    ]);

    const existingSchedulesData = existingSchedules.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const existingPeopleData = existingPeople.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const existingRoomsData = existingRooms.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (importType === 'schedule') {
      await previewScheduleChanges(csvData, transaction, existingSchedulesData, existingPeopleData, existingRoomsData);
    } else if (importType === 'directory') {
      await previewDirectoryChanges(csvData, transaction, existingPeopleData);
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

const toLowerTrim = (value) => (value || '').toLowerCase().trim();

const makeNameKey = (firstName, lastName) => {
  const first = toLowerTrim(firstName).split(/\s+/)[0] || '';
  const last = toLowerTrim(lastName);
  return [first, last].filter(Boolean).join(' ').trim();
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

  const term = row.Term || fallbackTerm || '';
  const termCode = row['Term Code'] || '';
  const academicYear = extractAcademicYear(term);

  const instructorField = row.Instructor || '';
  const parsedInstructor = parseInstructorField(instructorField) || { firstName: '', lastName: '', id: '' };
  const normalizedInstructorName = (() => {
    const firstName = (parsedInstructor.firstName || '').trim();
    const lastName = (parsedInstructor.lastName || '').trim();
    if (firstName && lastName) return `${lastName}, ${firstName}`;
    if (lastName) return lastName;
    if (firstName) return firstName;
    return instructorField.trim();
  })();
  const instructorBaylorId = (parsedInstructor.id || '').toString().trim();

  const meetingPatternRaw = (row['Meeting Pattern'] || row['Meetings'] || '').toString().trim();
  const meetingPatterns = parseMeetingPatterns(row);

  const roomRaw = (row.Room || '').toString().trim();
  const roomNames = roomRaw
    ? Array.from(new Set(roomRaw.split(/;|\n/).map((s) => s.trim()).filter(Boolean)))
    : [];

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
    normalizedInstructorName,
    instructorBaylorId,
    meetingPatternRaw,
    meetingPatterns,
    roomRaw,
    roomNames,
    subjectCode: row['Subject Code'] || '',
    catalogNumber,
    departmentCode: row['Department Code'] || '',
    scheduleType: row['Schedule Type'] || 'Class Instruction',
    status: row.Status || 'Active',
    partOfTerm: row['Part of Term'] || '',
    instructionMethod: row['Inst. Method'] || row['Instruction Method'] || '',
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
    'Term': base.term,
    'Term Code': base.termCode,
    'Academic Year': base.academicYear ?? '',
    'Department Code': base.departmentCode,
    'Subject Code': base.subjectCode,
    'Catalog Number': base.catalogNumber,
    'Instructor (parsed)': base.normalizedInstructorName,
    'Instructor Baylor ID': base.instructorBaylorId,
    'Instructor (raw)': base.instructorField,
    'Schedule Type': base.scheduleType,
    'Status': base.status,
    'Part of Term': base.partOfTerm,
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

const previewScheduleChanges = async (csvData, transaction, existingSchedules, existingPeople, existingRooms) => {
  // Create maps for quick lookup
  const peopleMapByName = new Map();
  const peopleMapByBaylorId = new Map();
  const roomsMap = new Map();
  const scheduleMap = new Map();

  existingPeople.forEach(person => {
    const nameKey = makeNameKey(person.firstName, person.lastName);
    if (nameKey) peopleMapByName.set(nameKey, person);
    const baylorId = (person.baylorId || '').trim();
    if (baylorId) peopleMapByBaylorId.set(baylorId, person);
  });

  existingRooms.forEach(room => {
    const keys = [room.name, room.displayName].map((k) => normalizeRoomName(k)).filter(Boolean);
    keys.forEach((k) => roomsMap.set(k, room));
  });

  // Create map of existing schedules to avoid duplicates
  existingSchedules.forEach(schedule => {
    const key = `${schedule.courseCode}-${schedule.section}-${schedule.term}`;
    scheduleMap.set(key, schedule);
  });

  // Process each schedule entry
  for (const row of csvData) {
    const baseData = extractScheduleRowBaseData(row);
    // Precompute key fields and group key for cascading selection
    const preCourseCode = baseData.courseCode;
    const preSection = baseData.section;
    const preTerm = baseData.term;
    const groupKey = `sched_${preCourseCode}_${preSection}_${preTerm}`;
    // Extract instructor information (use Baylor ID match first)
    const instructorField = baseData.instructorField;
    const parsed = baseData.parsedInstructor || { firstName: '', lastName: '', id: null };
    const nameKey = makeNameKey(parsed.firstName, parsed.lastName);
    const baylorId = baseData.instructorBaylorId;

    let instructor = null;
    let instructorId = null;

    if (baylorId && peopleMapByBaylorId.has(baylorId)) {
      instructor = peopleMapByBaylorId.get(baylorId);
      instructorId = instructor.id;
    } else if (nameKey && peopleMapByName.has(nameKey)) {
      instructor = peopleMapByName.get(nameKey);
      instructorId = instructor.id;
    } else if (parsed.firstName && parsed.lastName) {
      const newInstructor = {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: '',
        baylorId: baylorId || '',
        roles: ['faculty'],
        isActive: true
      };
      transaction.addChange('people', 'add', newInstructor, null, { groupKey });
      instructor = newInstructor;
      if (nameKey) peopleMapByName.set(nameKey, newInstructor);
      if (baylorId) peopleMapByBaylorId.set(baylorId, newInstructor);
    }

    // Extract room information (support simultaneous multi-rooms)
    const splitRooms = baseData.roomNames;
    const resolvedRoomIds = [];
    let primaryRoomId = null;
    if (splitRooms.length > 0) {
      for (const singleRoom of splitRooms) {
        const key = normalizeRoomName(singleRoom);
        if (!key) continue;
        let room = roomsMap.get(key);
        const roomNameUpper = singleRoom.toUpperCase();
        const shouldAttemptCreation =
          singleRoom &&
          roomNameUpper !== 'NO ROOM NEEDED' &&
          !roomNameUpper.includes('ONLINE') &&
          !roomNameUpper.includes('ZOOM') &&
          !roomNameUpper.includes('VIRTUAL');

        if (!room && shouldAttemptCreation) {
          const newRoom = {
            name: singleRoom,
            displayName: singleRoom,
            building: getBuildingFromRoom(singleRoom),
            capacity: null,
            type: 'Classroom',
            isActive: true
          };
          transaction.addChange('rooms', 'add', newRoom, null, { groupKey });
          roomsMap.set(key, { ...newRoom });
          room = roomsMap.get(key);
        }

        if (room && room.id) {
          if (!resolvedRoomIds.includes(room.id)) {
            resolvedRoomIds.push(room.id);
          }
          if (!primaryRoomId) {
            primaryRoomId = room.id;
          }
        }
      }
    }

    // Create schedule key for duplicate detection
    const courseCode = preCourseCode;
    const section = preSection;
    const term = preTerm;
    const scheduleKey = `${courseCode}-${section}-${term}`;

    // Check for duplicate schedules
    const existingSchedule = scheduleMap.get(scheduleKey);
    if (existingSchedule) {
      console.log(`⚠️ Skipping duplicate schedule: ${scheduleKey}`);
      continue; // Skip duplicate schedule
    }

    // Create schedule entry
    const finalCrn = baseData.crn;
    const instructorDisplayName = normalizeInstructorDisplayName(instructor, parsed, instructorField);
    const uniqueRoomIds = Array.from(new Set(resolvedRoomIds));

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
      // Prefer normalized instructor name in "Last, First" format
      instructorName: instructorDisplayName,
      instructorBaylorId: baylorId,
      // Multi-room fields
      roomIds: uniqueRoomIds,
      roomId: primaryRoomId || uniqueRoomIds[0] || null,
      roomNames: splitRooms,
      roomName: splitRooms[0] || '',
      meetingPatterns: baseData.meetingPatterns,
      scheduleType: baseData.scheduleType,
      status: baseData.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    transaction.addChange('schedules', 'add', scheduleData, null, { groupKey });
    // Add to our local map to prevent duplicates within this import
    scheduleMap.set(scheduleKey, scheduleData);
  }
};

const previewDirectoryChanges = async (csvData, transaction, existingPeople) => {
  // Create map for quick lookup of existing people
  const existingPeopleMap = new Map();
  existingPeople.forEach(person => {
    const key = `${person.firstName?.toLowerCase()} ${person.lastName?.toLowerCase()}`.trim();
    existingPeopleMap.set(key, person);
    if (person.email) {
      existingPeopleMap.set(person.email.toLowerCase(), person);
    }
  });

  for (const row of csvData) {
    const firstName = (row['First Name'] || '').trim();
    const lastName = (row['Last Name'] || '').trim();
    const email = (row['E-mail Address'] || '').trim();

    if (!firstName && !lastName && !email) continue;

    const nameKey = `${firstName.toLowerCase()} ${lastName.toLowerCase()}`.trim();
    const emailKey = email.toLowerCase();

    let existingPerson = existingPeopleMap.get(nameKey) || existingPeopleMap.get(emailKey);
    // Attempt smart matching across existing people
    if (!existingPerson) {
      const match = await findMatchingPerson({ firstName, lastName, email }, existingPeople);
      if (match && match.person) {
        existingPerson = match.person;
      }
    }

    const personData = {
      firstName,
      lastName,
      email,
      roles: ['faculty'], // default to faculty for directory imports
      phone: row['Phone'] || row['Business Phone'] || row['Home Phone'] || '',
      office: row['Office'] || row['Office Location'] || '',
      isActive: true
    };

    if (existingPerson) {
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
      if (diff.length > 0) {
        const changeId = transaction.addChange('people', 'modify', updates, existingPerson);
        // Attach diff for UI consumption
        const last = transaction.changes.people.modified.find(c => c.id === changeId);
        if (last) last.diff = diff;
      }
    } else {
      transaction.addChange('people', 'add', personData);
    }
  }
};

// Helper functions
export const parseMeetingPatterns = (row) => {
  const meetingPattern = (row['Meeting Pattern'] || row['Meetings'] || '').trim();
  if (!meetingPattern) return [];

  const segments = meetingPattern
    .replace(/\r/g, '\n')
    .split(/;|\n/)
    .map(segment => segment.trim())
    .filter(Boolean);

  const patterns = [];
  const dayMap = { M: 'M', T: 'T', W: 'W', R: 'R', F: 'F', S: 'S', U: 'U' };

  const pushTimedPattern = (daysStr, startToken, endToken, raw) => {
    const startTime = normalizeTime(startToken);
    const endTime = normalizeTime(endToken);
    if (!startTime || !endTime) return false;

    let pushed = false;
    for (const char of daysStr) {
      const day = dayMap[char.toUpperCase()];
      if (day) {
        patterns.push({
          day,
          startTime,
          endTime,
          startDate: null,
          endDate: null,
          raw
        });
        pushed = true;
      }
    }
    return pushed;
  };

  for (const segment of segments) {
    if (!segment || /does not meet/i.test(segment)) {
      continue;
    }

    const normalized = segment.replace(/\s+/g, ' ').trim();
    const dayMatch = normalized.match(/^([MTWRFSU]+)\s+/i);
    if (dayMatch) {
      const daysStr = dayMatch[1].toUpperCase();
      const remainder = normalized.slice(dayMatch[0].length).trim();
      const timeSplit = remainder.split(/\s*(?:-|to)\s*/i);
      if (timeSplit.length >= 2) {
        const startToken = extractTimeToken(timeSplit[0]);
        const endToken = extractTimeToken(timeSplit[1]);
        if (pushTimedPattern(daysStr, startToken, endToken, normalized)) {
          continue;
        }
      }
    }

    // Attempt to recover times even if day parsing failed
    const timeMatches = normalized.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{3,4})/gi);
    if (dayMatch && timeMatches && timeMatches.length >= 2) {
      const startToken = timeMatches[0];
      const endToken = timeMatches[1];
      if (pushTimedPattern(dayMatch[1].toUpperCase(), startToken, endToken, normalized)) {
        continue;
      }
    }

    if (/online/i.test(normalized) || /asynch/i.test(normalized)) {
      patterns.push({
        day: null,
        startTime: '',
        endTime: '',
        startDate: null,
        endDate: null,
        mode: 'online',
        raw: normalized
      });
      continue;
    }

    if (/arranged/i.test(normalized) || /tba/i.test(normalized) || /independent/i.test(normalized)) {
      patterns.push({
        day: null,
        startTime: '',
        endTime: '',
        startDate: null,
        endDate: null,
        mode: 'arranged',
        raw: normalized
      });
      continue;
    }

    // Preserve unparsed segments for downstream visibility
    patterns.push({
      day: null,
      startTime: '',
      endTime: '',
      startDate: null,
      endDate: null,
      raw: normalized
    });
  }

  return patterns;
};

const extractTimeToken = (value) => {
  if (!value) return '';
  const match = String(value).match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{3,4})/i);
  return match ? match[0] : String(value).trim();
};

// Helper function to normalize time format
const normalizeTime = (timeStr) => {
  if (!timeStr) return '';

  const cleaned = String(timeStr).toLowerCase().replace(/[^0-9apm:]/g, '').trim();
  if (!cleaned) return '';

  const match = cleaned.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
  if (!match) {
    return String(timeStr).trim();
  }

  let [, hourStr, minuteStr, ampm] = match;
  let hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) {
    return String(timeStr).trim();
  }
  let minute = Number.parseInt(minuteStr ?? '0', 10);
  if (Number.isNaN(minute)) minute = 0;

  if (!ampm) {
    if (hour > 23) {
      return String(timeStr).trim();
    }
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}`;
  }

  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm.toUpperCase()}`;
};

// Add this after the imports
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

// Commit transaction changes to database
export const commitTransaction = async (transactionId, selectedChanges = null, selectedFieldMap = null) => {
  const transactions = await getImportTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'preview') {
    throw new Error('Transaction is not in preview state');
  }

  const batch = writeBatch(db);
  const changesToApply = selectedChanges ?
    transaction.getAllChanges().filter(change => selectedChanges.includes(change.id)) :
    transaction.getAllChanges();

  // Maps to track newly created IDs
  const newPeopleIdsByName = new Map();
  const newPeopleIdsByBaylorId = new Map();
  const newRoomIdsByName = new Map();
  let createdPeopleCount = 0;
  let createdRoomsCount = 0;

  try {
    // First pass: Create people and rooms, collect their IDs
    for (const change of changesToApply) {
      if (change.collection === 'people' && change.action === 'add') {
        const docRef = doc(collection(db, COLLECTIONS.PEOPLE));
        batch.set(docRef, change.newData);
        change.documentId = docRef.id;
        createdPeopleCount += 1;

        // Map name to ID for schedule linking
        const nameKey = makeNameKey(change.newData.firstName, change.newData.lastName);
        if (nameKey) {
          newPeopleIdsByName.set(nameKey, docRef.id);
          console.log(`👤 Created person mapping: ${nameKey} -> ${docRef.id}`);
        }

        const baylorKey = (change.newData.baylorId || '').trim().toLowerCase();
        if (baylorKey) {
          newPeopleIdsByBaylorId.set(baylorKey, docRef.id);
        }

      } else if (change.collection === 'rooms' && change.action === 'add') {
        const docRef = doc(collection(db, COLLECTIONS.ROOMS));
        batch.set(docRef, change.newData);
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

        // Update instructor ID if this references a newly created person
        if (!scheduleData.instructorId && scheduleData.instructorName) {
          const baylorKey = (scheduleData.instructorBaylorId || '').trim().toLowerCase();
          if (baylorKey && newPeopleIdsByBaylorId.has(baylorKey)) {
            scheduleData.instructorId = newPeopleIdsByBaylorId.get(baylorKey);
            console.log(`🔗 Linked schedule to instructor (Baylor ID): ${baylorKey} -> ${scheduleData.instructorId}`);
          }

          if (!scheduleData.instructorId) {
            const nameKey = deriveNameKeyFromDisplayName(scheduleData.instructorName);
            if (nameKey && newPeopleIdsByName.has(nameKey)) {
              scheduleData.instructorId = newPeopleIdsByName.get(nameKey);
              console.log(`🔗 Linked schedule to instructor: ${nameKey} -> ${scheduleData.instructorId}`);
            }
          }
        }

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

        // Deterministic schedule ID: termCode_crn (fallback term_crn)
        const baseTerm = scheduleData.termCode || scheduleData.term || 'TERM';
        const scheduleDeterministicId = scheduleData.crn
          ? `${baseTerm}_${scheduleData.crn}`
          : `${baseTerm}_${(scheduleData.courseCode || 'COURSE').replace(/[^A-Za-z0-9]+/g, '-')}_${(scheduleData.section || 'SEC').replace(/[^A-Za-z0-9]+/g, '-')}`;
        const schedRef = doc(db, COLLECTIONS.SCHEDULES, scheduleDeterministicId);
        batch.set(schedRef, scheduleData, { merge: true });
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
          batch.update(doc(db, change.collection, change.originalData.id), updates);
          change.documentId = change.originalData.id;
        } else if (change.action === 'delete') {
          batch.delete(doc(db, change.collection, change.originalData.id));
          change.documentId = change.originalData.id;
        }
      }

      change.applied = true;
    }

    await batch.commit();

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
    } catch (_) { }

    return transaction;
  } catch (error) {
    console.error('Error committing transaction:', error);
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

  if (transaction.status !== 'committed') {
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