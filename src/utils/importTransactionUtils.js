import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, writeBatch, query, orderBy, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
  addChange(collection, action, newData, originalData = null) {
    const change = {
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      collection,
      action, // 'add' | 'modify' | 'delete'
      newData,
      originalData,
      timestamp: new Date().toISOString(),
      applied: false
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
export const previewImportChanges = async (csvData, importType, selectedSemester) => {
  const transaction = new ImportTransaction(importType, `${importType} import preview`, selectedSemester);
  
  try {
    // Load existing data for comparison
    const [existingSchedules, existingPeople, existingRooms] = await Promise.all([
      getDocs(collection(db, 'schedules')),
      getDocs(collection(db, 'people')),
      getDocs(collection(db, 'rooms'))
    ]);

    const existingSchedulesData = existingSchedules.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const existingPeopleData = existingPeople.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const existingRoomsData = existingRooms.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (importType === 'schedule') {
      await previewScheduleChanges(csvData, transaction, existingSchedulesData, existingPeopleData, existingRoomsData);
    } else if (importType === 'directory') {
      await previewDirectoryChanges(csvData, transaction, existingPeopleData);
    }

    // Store transaction in database for cross-browser access
    await saveTransactionToDatabase(transaction);

    return transaction;
  } catch (error) {
    console.error('Error previewing import changes:', error);
    throw error;
  }
};

const previewScheduleChanges = async (csvData, transaction, existingSchedules, existingPeople, existingRooms) => {
  // Create maps for quick lookup
  const peopleMap = new Map();
  const roomsMap = new Map();
  const scheduleMap = new Map();
  
  existingPeople.forEach(person => {
    const key = `${person.firstName?.toLowerCase()} ${person.lastName?.toLowerCase()}`.trim();
    peopleMap.set(key, person);
  });

  existingRooms.forEach(room => {
    const key = room.name?.toLowerCase() || room.displayName?.toLowerCase();
    if (key) roomsMap.set(key, room);
  });

  // Create map of existing schedules to avoid duplicates
  existingSchedules.forEach(schedule => {
    const key = `${schedule.courseCode}-${schedule.section}-${schedule.term}`;
    scheduleMap.set(key, schedule);
  });

  // Process each schedule entry
  for (const row of csvData) {
    // Extract instructor information
    const instructorName = row.Instructor || '';
    const instructorParts = instructorName.split(',').map(p => p.trim());
    let firstName = '', lastName = '';
    
    if (instructorParts.length >= 2) {
      lastName = instructorParts[0];
      firstName = instructorParts[1].split('(')[0].trim();
    }

    const instructorKey = `${firstName.toLowerCase()} ${lastName.toLowerCase()}`.trim();
    let instructor = peopleMap.get(instructorKey);
    let instructorId = null;

    // Check if we need to add a new instructor
    if (!instructor && firstName && lastName) {
      const newInstructor = {
        firstName,
        lastName,
        email: '',
        roles: ['faculty', 'adjunct'],
        contactInfo: { phone: '', office: '' },
        isActive: true
      };
      transaction.addChange('people', 'add', newInstructor);
      instructor = newInstructor;
      peopleMap.set(instructorKey, instructor);
      // For new instructors, ID will be set when committed
    } else if (instructor) {
      // Use existing instructor's ID
      instructorId = instructor.id;
    }

    // Extract room information
    const roomName = row.Room || '';
    const roomKey = roomName.toLowerCase();
    let room = roomsMap.get(roomKey);
    let roomId = null;

    // Check if we need to add a new room
    if (!room && roomName && roomName !== 'No Room Needed' && !roomName.includes('ONLINE')) {
      const newRoom = {
        name: roomName,
        displayName: roomName,
        building: roomName.includes('(') ? (roomName.split('(')[1] || '').replace(')', '') : '',
        capacity: null,
        type: 'Classroom',
        isActive: true
      };
      transaction.addChange('rooms', 'add', newRoom);
      room = newRoom;
      roomsMap.set(roomKey, room);
      // For new rooms, ID will be set when committed
    } else if (room) {
      // Use existing room's ID
      roomId = room.id;
    }

    // Create schedule key for duplicate detection
    const courseCode = row.Course || '';
    const section = row['Section #'] || ''; // Fix: Use correct CSV column name
    const term = row.Term || '';
    const scheduleKey = `${courseCode}-${section}-${term}`;

    // Check for duplicate schedules
    const existingSchedule = scheduleMap.get(scheduleKey);
    if (existingSchedule) {
      console.log(`⚠️ Skipping duplicate schedule: ${scheduleKey}`);
      continue; // Skip duplicate schedule
    }

    // Create schedule entry
    const scheduleData = {
      courseCode,
      courseTitle: row['Course Title'] || '',
      section,
      crn: row['CRN'] || '', // Add CRN field
      credits: row['Credit Hrs'] || row['Credit Hrs Min'] || '', // Fix: Use correct CSV column name
      term,
      academicYear: extractAcademicYear(term),
      instructorId: instructorId,
      instructorName: instructorName,
      roomId: roomId,
      roomName: roomName,
      meetingPatterns: parseMeetingPatterns(row),
      scheduleType: row['Schedule Type'] || 'Class Instruction',
      status: row.Status || 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    transaction.addChange('schedules', 'add', scheduleData);
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

    const personData = {
      firstName,
      lastName,
      email,
      roles: ['faculty'], // Use array format - default to faculty for directory imports
      contactInfo: {
        phone: row['Phone'] || '',
        office: row['Office'] || ''
      },
      isActive: true
    };

    if (existingPerson) {
      // Check if update is needed
      const needsUpdate = 
        existingPerson.email !== email ||
        existingPerson.contactInfo?.phone !== personData.contactInfo.phone ||
        existingPerson.contactInfo?.office !== personData.contactInfo.office;

      if (needsUpdate) {
        transaction.addChange('people', 'modify', personData, existingPerson);
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
export const commitTransaction = async (transactionId, selectedChanges = null) => {
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
        const docRef = doc(collection(db, 'people'));
        batch.set(docRef, change.newData);
        change.documentId = docRef.id;
        
        // Map name to ID for schedule linking
        const nameKey = `${change.newData.firstName?.toLowerCase()} ${change.newData.lastName?.toLowerCase()}`.trim();
        newPeopleIds.set(nameKey, docRef.id);
        
        console.log(`👤 Created person mapping: ${nameKey} -> ${docRef.id}`);
        
      } else if (change.collection === 'rooms' && change.action === 'add') {
        const docRef = doc(collection(db, 'rooms'));
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
        
        const docRef = doc(collection(db, 'schedules'));
        batch.set(docRef, scheduleData);
        change.documentId = docRef.id;
        
      } else if (change.collection !== 'people' && change.collection !== 'rooms') {
        // Handle other types of changes (modify, delete)
        if (change.action === 'modify') {
          batch.update(doc(db, change.collection, change.originalData.id), change.newData);
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
    
    return transaction;
  } catch (error) {
    console.error('Error committing transaction:', error);
    throw error;
  }
};

// Rollback committed transaction
export const rollbackTransaction = async (transactionId) => {
  const transactions = await getImportTransactions();
  const transaction = transactions.find(t => t.id === transactionId);
  
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'committed') {
    throw new Error('Transaction is not committed');
  }

  const batch = writeBatch(db);
  const appliedChanges = transaction.getAllChanges().filter(change => change.applied);

  try {
    // Reverse changes in opposite order
    for (const change of appliedChanges.reverse()) {
      if (change.action === 'add' && change.documentId) {
        // Delete added documents
        batch.delete(doc(db, change.collection, change.documentId));
      } else if (change.action === 'modify' && change.originalData) {
        // Restore original data
        batch.update(doc(db, change.collection, change.documentId), change.originalData);
      } else if (change.action === 'delete' && change.originalData) {
        // Re-add deleted documents
        batch.set(doc(db, change.collection, change.originalData.id), change.originalData);
      }
    }

    await batch.commit();
    
    transaction.status = 'rolled_back';
    await updateTransactionInStorage(transaction);
    
    return transaction;
  } catch (error) {
    console.error('Error rolling back transaction:', error);
    throw error;
  }
};

// Database-backed utility functions

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