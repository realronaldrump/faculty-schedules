import { collection, getDocs, getDoc, doc, updateDoc, addDoc, deleteDoc, writeBatch, query, orderBy, setDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { logCreate, logUpdate, logDelete, logBulkUpdate, logImport } from './changeLogger';
import { findMatchingPerson, parseInstructorField } from './dataImportUtils';

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

const previewScheduleChanges = async (csvData, transaction, existingSchedules, existingPeople, existingRooms) => {
  // Create maps for quick lookup
  const peopleMapByName = new Map();
  const peopleMapByBaylorId = new Map();
  const roomsMap = new Map();
  const scheduleMap = new Map();
  
  existingPeople.forEach(person => {
    const nameKey = `${(person.firstName || '').toLowerCase()} ${(person.lastName || '').toLowerCase()}`.trim();
    if (nameKey) peopleMapByName.set(nameKey, person);
    const baylorId = (person.baylorId || '').trim();
    if (baylorId) peopleMapByBaylorId.set(baylorId, person);
  });

  existingRooms.forEach(room => {
    const keys = [room.name, room.displayName].map((k) => (k || '').toLowerCase()).filter(Boolean);
    keys.forEach((k) => roomsMap.set(k, room));
  });

  // Create map of existing schedules to avoid duplicates
  existingSchedules.forEach(schedule => {
    const key = `${schedule.courseCode}-${schedule.section}-${schedule.term}`;
    scheduleMap.set(key, schedule);
  });

  // Helper to normalize Section # (strip redundant CRN like "01 (33038)" -> "01")
  const parseSectionField = (sectionField) => {
    if (!sectionField) return '';
    const raw = String(sectionField).trim();
    const cut = raw.split(' ')[0];
    const idx = cut.indexOf('(');
    return idx > -1 ? cut.substring(0, idx).trim() : cut.trim();
  };

  // Process each schedule entry
  for (const row of csvData) {
    // Precompute key fields and group key for cascading selection
    const preCourseCode = row.Course || '';
    const rawSectionField = row['Section #'] || '';
    const preSection = parseSectionField(rawSectionField);
    const preTerm = row.Term || '';
    const groupKey = `sched_${preCourseCode}_${preSection}_${preTerm}`;
    // Extract instructor information (use Baylor ID match first)
    const instructorField = row.Instructor || '';
    const parsed = parseInstructorField(instructorField) || { firstName: '', lastName: '', id: null };
    const nameKey = `${(parsed.firstName || '').toLowerCase()} ${(parsed.lastName || '').toLowerCase()}`.trim();
    const baylorId = (parsed.id || '').trim();

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
    const roomField = (row.Room || '').trim();
    const splitRooms = roomField ? roomField.split(';').map((s) => s.trim()).filter(Boolean) : [];
    let roomId = null;
    if (splitRooms.length > 0) {
      for (const singleRoom of splitRooms) {
        const key = singleRoom.toLowerCase();
        let room = roomsMap.get(key);
        if (!room && singleRoom && singleRoom !== 'No Room Needed' && !singleRoom.toUpperCase().includes('ONLINE')) {
          const newRoom = {
            name: singleRoom,
            displayName: singleRoom,
            building: singleRoom.includes('(') ? (singleRoom.split('(')[1] || '').replace(')', '') : '',
            capacity: null,
            type: 'Classroom',
            isActive: true
          };
          transaction.addChange('rooms', 'add', newRoom, null, { groupKey });
          roomsMap.set(key, newRoom);
        } else if (room && !roomId) {
          roomId = room.id || null; // first becomes legacy primary
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
    const crnFromSection = (() => {
      const m = String(rawSectionField).match(/\((\d{5,6})\)/);
      return m ? m[1] : '';
    })();
    const finalCrn = (() => {
      const direct = String(row['CRN'] || '').trim();
      if (/^\d{5,6}$/.test(direct)) return direct;
      if (/^\d{5,6}$/.test(crnFromSection)) return crnFromSection;
      return '';
    })();
    const scheduleData = {
      courseCode,
      courseTitle: row['Course Title'] || '',
      section,
      crn: finalCrn,
      credits: row['Credit Hrs'] || row['Credit Hrs Min'] || '',
      term,
      termCode: row['Term Code'] || '',
      academicYear: extractAcademicYear(term),
      instructorId: instructorId,
      // Prefer normalized instructor name from existing DB record; fallback to parsed name; then raw field
      instructorName: (instructor && (instructor.firstName || instructor.lastName))
        ? `${(instructor.firstName || '').trim()} ${(instructor.lastName || '').trim()}`.trim()
        : ((parsed.firstName || parsed.lastName)
          ? `${parsed.firstName} ${parsed.lastName}`.trim()
          : (row.Instructor || '')),
      instructorBaylorId: (parsed.id || '').trim(),
      // Multi-room fields
      roomIds: splitRooms.length > 1 ? [] : (roomId ? [roomId] : []),
      roomId: roomId,
      roomNames: splitRooms,
      roomName: splitRooms[0] || '',
      meetingPatterns: parseMeetingPatterns(row),
      scheduleType: row['Schedule Type'] || 'Class Instruction',
      status: row.Status || 'Active',
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
const extractAcademicYear = (term) => {
  const match = term.match(/(\d{4})/);
  return match ? parseInt(match[1]) : new Date().getFullYear();
};

const parseMeetingPatterns = (row) => {
  const meetingPattern = row['Meeting Pattern'] || row['Meetings'] || '';
  const patterns = [];
  
  if (meetingPattern && meetingPattern !== 'Does Not Meet') {
    // Handle CLSS format like "TR 12:30pm-1:45pm" or "MW 8:30am-11am"
    const timePattern = /([MTWRF]+)\s+(\d{1,2}:\d{2}(?:am|pm)?)\s*-\s*(\d{1,2}:\d{2}(?:am|pm)?)/i;
    const match = meetingPattern.match(timePattern);
    
    if (match) {
      const [, daysStr, startTime, endTime] = match;
      
      // Parse individual days
      const dayMap = { 'M': 'M', 'T': 'T', 'W': 'W', 'R': 'R', 'F': 'F' };
      for (let i = 0; i < daysStr.length; i++) {
        const day = dayMap[daysStr[i]];
        if (day) {
          patterns.push({
            day,
            startTime: normalizeTime(startTime),
            endTime: normalizeTime(endTime),
            startDate: null,
            endDate: null
          });
        }
      }
    } else {
      // Fallback: try simple parsing
      const parts = meetingPattern.split(' ');
      if (parts.length >= 2) {
        const days = parts[0];
        const times = parts.slice(1).join(' ');
        const timeParts = times.split('-');
        
        if (timeParts.length === 2) {
          const [startTime, endTime] = timeParts;
          
          for (const char of days) {
            if (['M', 'T', 'W', 'R', 'F'].includes(char)) {
              patterns.push({
                day: char,
                startTime: normalizeTime(startTime?.trim()),
                endTime: normalizeTime(endTime?.trim()),
                startDate: null,
                endDate: null
              });
            }
          }
        }
      }
    }
  }
  
  return patterns;
};

// Helper function to normalize time format
const normalizeTime = (timeStr) => {
  if (!timeStr) return '';
  
  // Handle formats like "12:30pm", "8:30am", "8am", "17:00"
  const cleaned = timeStr.toLowerCase().trim();
  
  // If already in 24-hour format, convert to 12-hour
  if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
    const [hour, minute] = cleaned.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
  }
  
  // If already has am/pm, standardize format
  if (/\d{1,2}:\d{2}(am|pm)/i.test(cleaned)) {
    return cleaned.replace(/(\d{1,2}:\d{2})(am|pm)/i, (match, time, ampm) => {
      const [hour, minute] = time.split(':').map(Number);
      return `${hour}:${minute.toString().padStart(2, '0')} ${ampm.toUpperCase()}`;
    });
  }
  
  // Handle formats like "8am", "12pm"
  if (/^\d{1,2}(am|pm)$/i.test(cleaned)) {
    return cleaned.replace(/(\d{1,2})(am|pm)/i, (match, hour, ampm) => {
      return `${hour}:00 ${ampm.toUpperCase()}`;
    });
  }
  
  return timeStr; // Return as-is if can't parse
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
  const newPeopleIds = new Map(); // firstName+lastName -> documentId
  const newRoomIds = new Map(); // roomName -> documentId

  try {
    // First pass: Create people and rooms, collect their IDs
    for (const change of changesToApply) {
      if (change.collection === 'people' && change.action === 'add') {
        const docRef = doc(collection(db, COLLECTIONS.PEOPLE));
        batch.set(docRef, change.newData);
        change.documentId = docRef.id;
        
        // Map name to ID for schedule linking
        const nameKey = `${change.newData.firstName?.toLowerCase()} ${change.newData.lastName?.toLowerCase()}`.trim();
        newPeopleIds.set(nameKey, docRef.id);
        
        console.log(`👤 Created person mapping: ${nameKey} -> ${docRef.id}`);
        
      } else if (change.collection === 'rooms' && change.action === 'add') {
        const docRef = doc(collection(db, COLLECTIONS.ROOMS));
        batch.set(docRef, change.newData);
        change.documentId = docRef.id;
        
        // Map room name to ID for schedule linking
        const roomKey = change.newData.name?.toLowerCase() || change.newData.displayName?.toLowerCase();
        if (roomKey) {
          newRoomIds.set(roomKey, docRef.id);
          console.log(`🏛️ Created room mapping: ${roomKey} -> ${docRef.id}`);
        }
      }
    }

    // Second pass: Create schedules with proper relational IDs
    for (const change of changesToApply) {
      if (change.collection === 'schedules' && change.action === 'add') {
        const scheduleData = { ...change.newData };
        
        // Update instructor ID if this references a newly created person
        if (!scheduleData.instructorId && scheduleData.instructorName) {
          // Parse instructor name to match against newly created people
          const instructorParts = scheduleData.instructorName.split(',').map(p => p.trim());
          if (instructorParts.length >= 2) {
            const lastName = instructorParts[0];
            const firstName = instructorParts[1].split('(')[0].trim();
            const nameKey = `${firstName.toLowerCase()} ${lastName.toLowerCase()}`.trim();
            
            if (newPeopleIds.has(nameKey)) {
              scheduleData.instructorId = newPeopleIds.get(nameKey);
              console.log(`🔗 Linked schedule to instructor: ${nameKey} -> ${scheduleData.instructorId}`);
            }
          }
        }
        
        // Update room ID if this references a newly created room
        if (!scheduleData.roomId && scheduleData.roomName) {
          const roomKey = scheduleData.roomName.toLowerCase();
          if (newRoomIds.has(roomKey)) {
            scheduleData.roomId = newRoomIds.get(roomKey);
            console.log(`🔗 Linked schedule to room: ${roomKey} -> ${scheduleData.roomId}`);
          }
        }
        
        // Deterministic schedule ID: termCode_crn (fallback term_crn)
        const scheduleDeterministicId = (scheduleData.termCode || scheduleData.term || 'TERM') + '_' + (scheduleData.crn || 'CRN');
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
              // Support dotted keys like 'contactInfo.phone'
              if (key.includes('.')) {
                const [parent, child] = key.split('.');
                const val = change.newData[key];
                if (val !== undefined) updates[key] = val;
              } else if (change.newData[key] !== undefined) {
                updates[key] = change.newData[key];
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
    console.log(`👤 Created ${newPeopleIds.size} new people`);
    console.log(`🏛️ Created ${newRoomIds.size} new rooms`);

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
            ).catch(() => {});
          } else if (change.action === 'modify') {
            logUpdate(
              `Schedule - ${change.originalData?.courseCode || ''} ${change.originalData?.section || ''} (${change.originalData?.term || ''})`,
              COLLECTIONS.SCHEDULES,
              change.documentId,
              change.newData,
              change.originalData,
              source
            ).catch(() => {});
          } else if (change.action === 'delete') {
            logDelete(
              `Schedule - ${change.originalData?.courseCode || ''} ${change.originalData?.section || ''} (${change.originalData?.term || ''})`,
              COLLECTIONS.SCHEDULES,
              change.documentId,
              change.originalData,
              source
            ).catch(() => {});
          }
        } else if (change.collection === 'people') {
          if (change.action === 'add') {
            logCreate(
              `Person - ${change.newData.firstName || ''} ${change.newData.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.newData,
              source
            ).catch(() => {});
          } else if (change.action === 'modify') {
            logUpdate(
              `Person - ${change.originalData?.firstName || ''} ${change.originalData?.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.newData,
              change.originalData,
              source
            ).catch(() => {});
          } else if (change.action === 'delete') {
            logDelete(
              `Person - ${change.originalData?.firstName || ''} ${change.originalData?.lastName || ''}`.trim(),
              COLLECTIONS.PEOPLE,
              change.documentId,
              change.originalData,
              source
            ).catch(() => {});
          }
        } else if (change.collection === 'rooms') {
          if (change.action === 'add') {
            logCreate(
              `Room - ${change.newData.displayName || change.newData.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.newData,
              source
            ).catch(() => {});
          } else if (change.action === 'modify') {
            logUpdate(
              `Room - ${change.originalData?.displayName || change.originalData?.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.newData,
              change.originalData,
              source
            ).catch(() => {});
          } else if (change.action === 'delete') {
            logDelete(
              `Room - ${change.originalData?.displayName || change.originalData?.name}`,
              COLLECTIONS.ROOMS,
              change.documentId,
              change.originalData,
              source
            ).catch(() => {});
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
      ).catch(() => {});
    } catch (_) {}
    
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