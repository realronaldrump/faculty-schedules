/**
 * Comprehensive Data Hygiene System
 * 
 * This system provides complete data quality management including:
 * 1. Cross-database duplicate detection
 * 2. Record linking and relationship management  
 * 3. Data standardization and normalization
 * 4. Automated cleanup recommendations
 * 5. Manual review interfaces
 */

import { collection, getDocs, doc, updateDoc, deleteDoc, writeBatch, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_PERSON_SCHEMA } from './dataHygiene';

// ==================== CORE DATA HYGIENE FUNCTIONS ====================

/**
 * Comprehensive duplicate detection across all database collections
 */
export const comprehensiveDuplicateDetection = async () => {
  console.log('🔍 Starting comprehensive duplicate detection...');
  
  try {
    // Fetch all data from database
    const [peopleSnapshot, schedulesSnapshot, roomsSnapshot] = await Promise.all([
      getDocs(collection(db, 'people')),
      getDocs(collection(db, 'schedules')), 
      getDocs(collection(db, 'rooms'))
    ]);

    const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const schedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const rooms = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`📊 Analyzing ${people.length} people, ${schedules.length} schedules, ${rooms.length} rooms`);

    // Detect duplicates in each collection
    const peopleDuplicates = detectPeopleDuplicates(people);
    const schedulesDuplicates = detectScheduleDuplicates(schedules);
    const roomsDuplicates = detectRoomDuplicates(rooms);
    const crossCollectionIssues = detectCrossCollectionIssues(people, schedules, rooms);

    const results = {
      people: {
        total: people.length,
        duplicates: peopleDuplicates,
        duplicateCount: peopleDuplicates.length
      },
      schedules: {
        total: schedules.length,
        duplicates: schedulesDuplicates,
        duplicateCount: schedulesDuplicates.length
      },
      rooms: {
        total: rooms.length,
        duplicates: roomsDuplicates,
        duplicateCount: roomsDuplicates.length
      },
      crossCollection: crossCollectionIssues,
      summary: {
        totalDuplicates: peopleDuplicates.length + schedulesDuplicates.length + roomsDuplicates.length,
        totalIssues: peopleDuplicates.length + schedulesDuplicates.length + roomsDuplicates.length + crossCollectionIssues.length
      }
    };

    console.log('✅ Comprehensive duplicate detection complete:', results.summary);
    return results;

  } catch (error) {
    console.error('❌ Error in comprehensive duplicate detection:', error);
    throw error;
  }
};

/**
 * Detect duplicate people records
 */
const detectPeopleDuplicates = (people) => {
  const duplicates = [];
  const emailMap = new Map();
  const nameMap = new Map();
  const phoneMap = new Map();

  people.forEach(person => {
    // Email-based duplicates
    if (person.email) {
      const normalizedEmail = person.email.toLowerCase().trim();
      if (emailMap.has(normalizedEmail)) {
        duplicates.push({
          type: 'email',
          confidence: 1.0,
          records: [emailMap.get(normalizedEmail), person],
          reason: 'Identical email address',
          mergeStrategy: 'merge_people'
        });
      } else {
        emailMap.set(normalizedEmail, person);
      }
    }

    // Name-based duplicates
    if (person.firstName && person.lastName) {
      const normalizedName = `${person.firstName.toLowerCase().trim()} ${person.lastName.toLowerCase().trim()}`;
      if (nameMap.has(normalizedName)) {
        const existing = nameMap.get(normalizedName);
        const confidence = calculateNameSimilarity(person, existing);
        
        if (confidence >= 0.8) {
          duplicates.push({
            type: 'name',
            confidence,
            records: [existing, person],
            reason: `Similar names (${Math.round(confidence * 100)}% match)`,
            mergeStrategy: 'merge_people'
          });
        }
      } else {
        nameMap.set(normalizedName, person);
      }
    }

    // Phone-based duplicates
    if (person.phone) {
      const normalizedPhone = person.phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10 && phoneMap.has(normalizedPhone)) {
        duplicates.push({
          type: 'phone',
          confidence: 0.9,
          records: [phoneMap.get(normalizedPhone), person],
          reason: 'Identical phone number',
          mergeStrategy: 'merge_people'
        });
      } else if (normalizedPhone.length >= 10) {
        phoneMap.set(normalizedPhone, person);
      }
    }
  });

  return duplicates;
};

/**
 * Detect duplicate schedule records
 */
export const detectScheduleDuplicates = (schedules) => {
  const duplicates = [];
  const scheduleMap = new Map();

  schedules.forEach(schedule => {
    // Create unique key for schedule identification
    const scheduleKey = `${schedule.courseCode}-${schedule.section}-${schedule.term}-${schedule.instructorId}`;
    
    if (scheduleMap.has(scheduleKey)) {
      const existing = scheduleMap.get(scheduleKey);
      duplicates.push({
        type: 'schedule',
        confidence: 1.0,
        records: [existing, schedule],
        reason: 'Identical course-section-term-instructor combination',
        mergeStrategy: 'merge_schedules'
      });
    } else {
      scheduleMap.set(scheduleKey, schedule);
    }

    // Check for CRN duplicates (should be unique)
    if (schedule.crn) {
      const crnKey = `crn-${schedule.crn}`;
      if (scheduleMap.has(crnKey)) {
        const existing = scheduleMap.get(crnKey);
        if (existing.id !== schedule.id) {
          duplicates.push({
            type: 'crn',
            confidence: 1.0,
            records: [existing, schedule],
            reason: 'Duplicate CRN (should be unique)',
            mergeStrategy: 'merge_schedules'
          });
        }
      } else {
        scheduleMap.set(crnKey, schedule);
      }
    }
  });

  return duplicates;
};

/**
 * Detect duplicate room records
 */
export const detectRoomDuplicates = (rooms) => {
  const duplicates = [];
  const roomMap = new Map();

  rooms.forEach(room => {
    // Name-based duplicates
    if (room.name || room.displayName) {
      const roomName = (room.name || room.displayName).toLowerCase().trim();
      if (roomMap.has(roomName)) {
        duplicates.push({
          type: 'room_name',
          confidence: 1.0,
          records: [roomMap.get(roomName), room],
          reason: 'Identical room name',
          mergeStrategy: 'merge_rooms'
        });
      } else {
        roomMap.set(roomName, room);
      }
    }

    // Building + Room number duplicates
    if (room.building && room.roomNumber) {
      const buildingRoomKey = `${room.building.toLowerCase()}-${room.roomNumber}`;
      if (roomMap.has(buildingRoomKey)) {
        const existing = roomMap.get(buildingRoomKey);
        if (existing.id !== room.id) {
          duplicates.push({
            type: 'building_room',
            confidence: 0.95,
            records: [existing, room],
            reason: 'Same building and room number',
            mergeStrategy: 'merge_rooms'
          });
        }
      } else {
        roomMap.set(buildingRoomKey, room);
      }
    }
  });

  return duplicates;
};

/**
 * Detect cross-collection relationship issues
 */
const detectCrossCollectionIssues = (people, schedules, rooms) => {
  const issues = [];

  // Check for orphaned schedules (no instructor)
  const peopleIds = new Set(people.map(p => p.id));
  schedules.forEach(schedule => {
    if (schedule.instructorId && !peopleIds.has(schedule.instructorId)) {
      issues.push({
        type: 'orphaned_schedule',
        severity: 'high',
        record: schedule,
        reason: 'Schedule references non-existent instructor',
        fix: 'link_to_existing_instructor'
      });
    }
  });

  // Check for orphaned schedules (no room)
  const roomIds = new Set(rooms.map(r => r.id));
  schedules.forEach(schedule => {
    if (schedule.roomId && !roomIds.has(schedule.roomId)) {
      issues.push({
        type: 'orphaned_room',
        severity: 'medium',
        record: schedule,
        reason: 'Schedule references non-existent room',
        fix: 'link_to_existing_room'
      });
    }
  });

  // Check for inconsistent instructor names
  const instructorNameMap = new Map();
  schedules.forEach(schedule => {
    if (schedule.instructorId && schedule.instructorName) {
      if (instructorNameMap.has(schedule.instructorId)) {
        const existingName = instructorNameMap.get(schedule.instructorId);
        if (existingName !== schedule.instructorName) {
          issues.push({
            type: 'inconsistent_instructor_name',
            severity: 'medium',
            record: schedule,
            reason: `Inconsistent instructor name: "${existingName}" vs "${schedule.instructorName}"`,
            fix: 'standardize_instructor_name'
          });
        }
      } else {
        instructorNameMap.set(schedule.instructorId, schedule.instructorName);
      }
    }
  });

  return issues;
};

// ==================== MERGE STRATEGIES ====================

/**
 * Merge duplicate people records
 */
export const mergePeopleRecords = async (duplicateGroup) => {
  const batch = writeBatch(db);
  const [primary, secondary] = duplicateGroup.records;
  
  // Merge data, keeping the most complete record
  const mergedData = {
    ...primary,
    // Combine roles
    roles: [...new Set([...primary.roles || [], ...secondary.roles || []])],
    // Keep most recent update
    updatedAt: new Date().toISOString(),
    // Merge contact info
    phone: primary.phone || secondary.phone,
    email: primary.email || secondary.email,
    office: primary.office || secondary.office,
    // Keep most complete job info
    jobTitle: primary.jobTitle || secondary.jobTitle,
    department: primary.department || secondary.department,
    title: primary.title || secondary.title
  };

  // Update primary record
  batch.update(doc(db, 'people', primary.id), mergedData);
  
  // Update all schedules that reference the secondary person
  const schedulesSnapshot = await getDocs(
    query(collection(db, 'schedules'), where('instructorId', '==', secondary.id))
  );
  
  schedulesSnapshot.docs.forEach(scheduleDoc => {
    batch.update(doc(db, 'schedules', scheduleDoc.id), {
      instructorId: primary.id,
      instructorName: mergedData.firstName + ' ' + mergedData.lastName
    });
  });

  // Delete secondary record
  batch.delete(doc(db, 'people', secondary.id));

  await batch.commit();
  
  return {
    primaryId: primary.id,
    secondaryId: secondary.id,
    schedulesUpdated: schedulesSnapshot.docs.length,
    mergedData
  };
};

/**
 * Merge duplicate schedule records
 */
export const mergeScheduleRecords = async (duplicateGroup) => {
  const batch = writeBatch(db);
  const [primary, secondary] = duplicateGroup.records;
  
  // Merge schedule data
  const mergedData = {
    ...primary,
    // Keep most recent enrollment data
    enrollment: Math.max(primary.enrollment || 0, secondary.enrollment || 0),
    maxEnrollment: Math.max(primary.maxEnrollment || 0, secondary.maxEnrollment || 0),
    // Combine meeting patterns
    meetingPatterns: [...(primary.meetingPatterns || []), ...(secondary.meetingPatterns || [])],
    // Keep most recent update
    updatedAt: new Date().toISOString()
  };

  // Update primary record
  batch.update(doc(db, 'schedules', primary.id), mergedData);
  
  // Delete secondary record
  batch.delete(doc(db, 'schedules', secondary.id));

  await batch.commit();
  
  return {
    primaryId: primary.id,
    secondaryId: secondary.id,
    mergedData
  };
};

/**
 * Merge duplicate room records
 */
export const mergeRoomRecords = async (duplicateGroup) => {
  const batch = writeBatch(db);
  const [primary, secondary] = duplicateGroup.records;
  
  // Merge room data
  const mergedData = {
    ...primary,
    name: primary.name || secondary.name,
    displayName: primary.displayName || secondary.displayName,
    building: primary.building || secondary.building,
    roomNumber: primary.roomNumber || secondary.roomNumber,
    capacity: Math.max(primary.capacity || 0, secondary.capacity || 0),
    updatedAt: new Date().toISOString()
  };

  // Update primary record
  batch.update(doc(db, 'rooms', primary.id), mergedData);
  
  // Update all schedules that reference the secondary room
  const schedulesSnapshot = await getDocs(
    query(collection(db, 'schedules'), where('roomId', '==', secondary.id))
  );
  
  schedulesSnapshot.docs.forEach(scheduleDoc => {
    batch.update(doc(db, 'schedules', scheduleDoc.id), {
      roomId: primary.id,
      roomName: mergedData.displayName || mergedData.name
    });
  });

  // Delete secondary record
  batch.delete(doc(db, 'rooms', secondary.id));

  await batch.commit();
  
  return {
    primaryId: primary.id,
    secondaryId: secondary.id,
    schedulesUpdated: schedulesSnapshot.docs.length,
    mergedData
  };
};

// ==================== DATA STANDARDIZATION ====================

/**
 * Standardize all data in the database
 */
export const standardizeAllData = async () => {
  console.log('🔧 Starting comprehensive data standardization...');
  
  try {
    const [peopleSnapshot, schedulesSnapshot, roomsSnapshot] = await Promise.all([
      getDocs(collection(db, 'people')),
      getDocs(collection(db, 'schedules')),
      getDocs(collection(db, 'rooms'))
    ]);

    const batch = writeBatch(db);
    let updateCount = 0;

    // Standardize people data
    peopleSnapshot.docs.forEach(doc => {
      const person = doc.data();
      const standardized = standardizePersonData(person);
      
      if (JSON.stringify(person) !== JSON.stringify(standardized)) {
        batch.update(doc.ref, standardized);
        updateCount++;
      }
    });

    // Standardize schedule data
    schedulesSnapshot.docs.forEach(doc => {
      const schedule = doc.data();
      const standardized = standardizeScheduleData(schedule);
      
      if (JSON.stringify(schedule) !== JSON.stringify(standardized)) {
        batch.update(doc.ref, standardized);
        updateCount++;
      }
    });

    // Standardize room data
    roomsSnapshot.docs.forEach(doc => {
      const room = doc.data();
      const standardized = standardizeRoomData(room);
      
      if (JSON.stringify(room) !== JSON.stringify(standardized)) {
        batch.update(doc.ref, standardized);
        updateCount++;
      }
    });

    if (updateCount > 0) {
      await batch.commit();
      console.log(`✅ Standardized ${updateCount} records`);
    } else {
      console.log('✅ All data already standardized');
    }

    return { recordsUpdated: updateCount };

  } catch (error) {
    console.error('❌ Error standardizing data:', error);
    throw error;
  }
};

/**
 * Parse full name into components
 */
const parseFullName = (fullName) => {
  if (!fullName) return { title: '', firstName: '', lastName: '' };
  
  const name = fullName.trim();
  const parts = name.split(/\s+/);
  
  // Common titles
  const titles = ['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss', 'prof', 'professor'];
  
  let title = '';
  let firstName = '';
  let lastName = '';
  
  let nameStart = 0;
  
  // Check for title
  if (parts.length > 1 && titles.includes(parts[0].toLowerCase())) {
    title = parts[0];
    nameStart = 1;
  }
  
  if (parts.length > nameStart) {
    if (parts.length === nameStart + 1) {
      // Only one name part after title
      lastName = parts[nameStart];
    } else if (parts.length === nameStart + 2) {
      // First and last name
      firstName = parts[nameStart];
      lastName = parts[nameStart + 1];
    } else {
      // Multiple parts - take first as firstName, rest as lastName
      firstName = parts[nameStart];
      lastName = parts.slice(nameStart + 1).join(' ');
    }
  }
  
  return {
    title: title,
    firstName: firstName,
    lastName: lastName
  };
};

/**
 * Standardize person data
 */
const standardizePersonData = (person) => {
  // Handle name standardization - support both full name and firstName/lastName
  let firstName = (person.firstName || '').trim();
  let lastName = (person.lastName || '').trim();
  let fullName = (person.name || '').trim();
  
  // If we have a full name but no firstName/lastName, parse it
  if (fullName && (!firstName && !lastName)) {
    const parsed = parseFullName(fullName);
    firstName = parsed.firstName;
    lastName = parsed.lastName;
  }
  // If we have firstName/lastName but no full name, construct it
  else if ((firstName || lastName) && !fullName) {
    fullName = `${firstName} ${lastName}`.trim();
  }
  // If we have both, prefer the constructed version for consistency
  else if (firstName || lastName) {
    fullName = `${firstName} ${lastName}`.trim();
  }

  const standardized = {
    ...person,
    firstName: firstName,
    lastName: lastName,
    name: fullName,
    email: person.email ? person.email.toLowerCase().trim() : '',
    phone: person.phone ? person.phone.replace(/\D/g, '') : '',
    jobTitle: (person.jobTitle || '').trim(),
    department: (person.department || '').trim(),
    office: (person.office || '').trim(),
    title: (person.title || '').trim(),
    roles: Array.isArray(person.roles) ? person.roles : ['faculty'],
    updatedAt: new Date().toISOString()
  };

  // Guarantee schema completeness using the shared constant.
  Object.entries(DEFAULT_PERSON_SCHEMA).forEach(([key, defaultValue]) => {
    if (standardized[key] === undefined) {
      standardized[key] = defaultValue;
    }
  });

  // Remove stray attributes not in the canonical schema
  Object.keys(standardized).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PERSON_SCHEMA, key)) {
      delete standardized[key];
    }
  });

  // Remove empty name if no meaningful name data
  if (!standardized.firstName && !standardized.lastName && !standardized.name) {
    delete standardized.name;
  }

  return standardized;
};

/**
 * Standardize schedule data
 */
const standardizeScheduleData = (schedule) => {
  return {
    ...schedule,
    courseCode: (schedule.courseCode || '').trim(),
    courseTitle: (schedule.courseTitle || '').trim(),
    section: (schedule.section || '').trim(),
    crn: (schedule.crn || '').trim(), // Add CRN standardization
    instructorName: (schedule.instructorName || '').trim(),
    roomName: (schedule.roomName || '').trim(),
    term: (schedule.term || '').trim(),
    status: (schedule.status || 'Active').trim(),
    updatedAt: new Date().toISOString()
  };
};

/**
 * Standardize room data
 */
const standardizeRoomData = (room) => {
  return {
    ...room,
    name: (room.name || '').trim(),
    displayName: (room.displayName || '').trim(),
    building: (room.building || '').trim(),
    roomNumber: (room.roomNumber || '').trim(),
    type: (room.type || 'Classroom').trim(),
    updatedAt: new Date().toISOString()
  };
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Calculate name similarity between two people
 */
const calculateNameSimilarity = (person1, person2) => {
  const name1 = `${person1.firstName} ${person1.lastName}`.toLowerCase();
  const name2 = `${person2.firstName} ${person2.lastName}`.toLowerCase();
  
  if (name1 === name2) return 1.0;
  
  // Simple Levenshtein distance
  const matrix = Array(name1.length + 1).fill().map(() => Array(name2.length + 1).fill(0));
  
  for (let i = 0; i <= name1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= name2.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= name1.length; i++) {
    for (let j = 1; j <= name2.length; j++) {
      const cost = name1[i - 1] === name2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLength = Math.max(name1.length, name2.length);
  return maxLength === 0 ? 1.0 : 1.0 - (matrix[name1.length][name2.length] / maxLength);
};

// Storage savings calculation removed - not relevant for small datasets

/**
 * Generate comprehensive data hygiene report
 */
export const generateDataHygieneReport = async () => {
  const duplicateResults = await comprehensiveDuplicateDetection();
  
  return {
    timestamp: new Date().toISOString(),
    summary: duplicateResults.summary,
    details: {
      people: duplicateResults.people,
      schedules: duplicateResults.schedules,
      rooms: duplicateResults.rooms,
      crossCollection: duplicateResults.crossCollection
    },
    recommendations: generateRecommendations(duplicateResults),
    dataQualityScore: calculateDataQualityScore(duplicateResults)
  };
};

/**
 * Generate actionable recommendations
 */
const generateRecommendations = (results) => {
  const recommendations = [];
  
  if (results.people.duplicateCount > 0) {
    recommendations.push({
      priority: 'high',
      action: 'Merge duplicate people records',
      count: results.people.duplicateCount,
      description: 'You have people listed multiple times. Merging them will create one accurate record for each person.',
      benefit: 'Eliminates confusion when looking up faculty and staff'
    });
  }
  
  if (results.schedules.duplicateCount > 0) {
    recommendations.push({
      priority: 'medium', 
      action: 'Merge duplicate schedule records',
      count: results.schedules.duplicateCount,
      description: 'Some courses appear to be scheduled multiple times. Merging removes the duplicates.',
      benefit: 'Accurate course schedules without duplicates'
    });
  }
  
  if (results.rooms.duplicateCount > 0) {
    recommendations.push({
      priority: 'low',
      action: 'Merge duplicate room records', 
      count: results.rooms.duplicateCount,
      description: 'Some rooms are listed multiple times with slight variations in name.',
      benefit: 'Consistent room names across all schedules'
    });
  }
  
  if (results.crossCollection.length > 0) {
    recommendations.push({
      priority: 'high',
      action: 'Fix broken connections',
      count: results.crossCollection.length, 
      description: 'Some schedules reference people or rooms that no longer exist in the system.',
      benefit: 'Ensures all schedule data is properly connected'
    });
  }
  
  return recommendations;
};

/**
 * Calculate overall data quality score
 */
const calculateDataQualityScore = (results) => {
  const totalRecords = results.people.total + results.schedules.total + results.rooms.total;
  const totalIssues = results.summary.totalIssues;
  
  if (totalRecords === 0) return 100;
  
  const qualityScore = Math.max(0, 100 - (totalIssues / totalRecords) * 100);
  return Math.round(qualityScore);
};

// Maintenance reduction estimates removed - too speculative

export default {
  comprehensiveDuplicateDetection,
  mergePeopleRecords,
  mergeScheduleRecords,
  mergeRoomRecords,
  standardizeAllData,
  generateDataHygieneReport
}; 