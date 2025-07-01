import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
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
      stats: this.stats
    };
  }

  // Get all changes in a flat list for UI display
  getAllChanges() {
    const allChanges = [];
    
    ['schedules', 'people', 'rooms'].forEach(collection => {
      ['added', 'modified', 'deleted'].forEach(action => {
        this.changes[collection][action].forEach(change => {
          allChanges.push({
            ...change,
            collection,
            action: action.replace('d', '').replace('ied', 'y') // 'added' -> 'add', 'modified' -> 'modify'
          });
        });
      });
    });

    return allChanges.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
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

    // Store transaction in localStorage for management
    const existingTransactions = JSON.parse(localStorage.getItem('importTransactions') || '[]');
    existingTransactions.push(transaction);
    localStorage.setItem('importTransactions', JSON.stringify(existingTransactions));

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
  
  existingPeople.forEach(person => {
    const key = `${person.firstName?.toLowerCase()} ${person.lastName?.toLowerCase()}`.trim();
    peopleMap.set(key, person);
  });

  existingRooms.forEach(room => {
    const key = room.name?.toLowerCase() || room.displayName?.toLowerCase();
    if (key) roomsMap.set(key, room);
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

    // Check if we need to add a new instructor
    if (!instructor && firstName && lastName) {
      const newInstructor = {
        firstName,
        lastName,
        email: '',
        roles: { faculty: true, adjunct: true },
        contactInfo: { phone: '', office: '' },
        isActive: true
      };
      transaction.addChange('people', 'add', newInstructor);
      instructor = newInstructor;
      peopleMap.set(instructorKey, instructor);
    }

    // Extract room information
    const roomName = row.Room || '';
    const roomKey = roomName.toLowerCase();
    let room = roomsMap.get(roomKey);

    // Check if we need to add a new room
    if (!room && roomName && roomName !== 'No Room Needed' && !roomName.includes('ONLINE')) {
      const newRoom = {
        name: roomName,
        displayName: roomName,
        building: roomName.includes('(') ? roomName.split('(')[1]?.replace(')', '') : '',
        capacity: null,
        type: 'Classroom',
        isActive: true
      };
      transaction.addChange('rooms', 'add', newRoom);
      room = newRoom;
      roomsMap.set(roomKey, room);
    }

    // Create schedule entry
    const scheduleData = {
      courseCode: row.Course || '',
      courseTitle: row['Course Title'] || '',
      section: row.Section || '',
      credits: row.Credits || '',
      term: row.Term || '',
      academicYear: extractAcademicYear(row.Term || ''),
      instructorId: instructor?.id || null,
      instructorName: instructorName,
      roomId: room?.id || null,
      roomName: roomName,
      meetingPatterns: parseMeetingPatterns(row),
      instructor: instructor,
      room: room
    };

    transaction.addChange('schedules', 'add', scheduleData);
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
      roles: { faculty: true, staff: false, adjunct: false },
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
  const dayTime = row['Meeting Pattern'] || row.Day || '';
  const patterns = [];
  
  if (dayTime && dayTime !== 'Does Not Meet') {
    // Simple parsing - can be enhanced
    const parts = dayTime.split(' ');
    if (parts.length >= 2) {
      const days = parts[0];
      const times = parts.slice(1).join(' ');
      const [startTime, endTime] = times.split('-');
      
      for (const day of days) {
        if (['M', 'T', 'W', 'R', 'F'].includes(day)) {
          patterns.push({
            day,
            startTime: startTime?.trim(),
            endTime: endTime?.trim()
          });
        }
      }
    }
  }
  
  return patterns;
};

// Commit transaction changes to database
export const commitTransaction = async (transactionId, selectedChanges = null) => {
  const transactions = getImportTransactions();
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

  try {
    for (const change of changesToApply) {
      if (change.action === 'add') {
        const docRef = doc(collection(db, change.collection));
        batch.set(docRef, change.newData);
        change.documentId = docRef.id;
      } else if (change.action === 'modify') {
        batch.update(doc(db, change.collection, change.originalData.id), change.newData);
        change.documentId = change.originalData.id;
      } else if (change.action === 'delete') {
        batch.delete(doc(db, change.collection, change.originalData.id));
        change.documentId = change.originalData.id;
      }
      change.applied = true;
    }

    await batch.commit();
    
    transaction.status = 'committed';
    updateTransactionInStorage(transaction);
    
    return transaction;
  } catch (error) {
    console.error('Error committing transaction:', error);
    throw error;
  }
};

// Rollback committed transaction
export const rollbackTransaction = async (transactionId) => {
  const transactions = getImportTransactions();
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
    updateTransactionInStorage(transaction);
    
    return transaction;
  } catch (error) {
    console.error('Error rolling back transaction:', error);
    throw error;
  }
};

// Utility functions
const updateTransactionInStorage = (updatedTransaction) => {
  const transactions = JSON.parse(localStorage.getItem('importTransactions') || '[]');
  const index = transactions.findIndex(t => t.id === updatedTransaction.id);
  if (index !== -1) {
    transactions[index] = updatedTransaction;
    localStorage.setItem('importTransactions', JSON.stringify(transactions));
  }
};

export const getImportTransactions = () => {
  const transactions = JSON.parse(localStorage.getItem('importTransactions') || '[]');
  // Reconstruct ImportTransaction objects with methods
  return transactions.map(transactionData => {
    const transaction = Object.assign(new ImportTransaction(), transactionData);
    return transaction;
  });
};

export const deleteTransaction = (transactionId) => {
  const transactions = JSON.parse(localStorage.getItem('importTransactions') || '[]');
  const filteredTransactions = transactions.filter(t => t.id !== transactionId);
  localStorage.setItem('importTransactions', JSON.stringify(filteredTransactions));
}; 