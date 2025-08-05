/**
 * Simple Data Hygiene System
 * 
 * Focus: Prevention over cure
 * - Clean data as it comes in
 * - Simple duplicate prevention
 * - Standardize data formats
 * - One source of truth per record
 */

import { collection, getDocs, query, where, doc, getDoc, updateDoc, deleteDoc, writeBatch, addDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizedSchema } from './normalizedSchema';
import { detectScheduleDuplicates, detectRoomDuplicates, mergeScheduleRecords, mergeRoomRecords } from './comprehensiveDataHygiene';
import { logUpdate, logStandardization, logMerge } from './changeLogger';

// ---------------------------------------------------------------------------
// PERSON SCHEMA CONSISTENCY
// ---------------------------------------------------------------------------

// A canonical list of every field we expect to be present on a person record.
// NOTE:  If you add or remove a field that should be universal, update this
// object as well as any Firestore security rules or TypeScript definitions.
export const DEFAULT_PERSON_SCHEMA = {
  firstName: '',
  lastName: '',
  name: '', // Convenience – concatenated first & last name.
  title: '',
  email: '',
  phone: '',
  jobTitle: '',
  department: '',
  office: '',
  roles: [],
  // Employment status flags
  isAdjunct: false,
  isFullTime: true,
  isTenured: false,
  isUPD: false,
  // Relational references
  programId: null,
  // Data-quality helpers
  hasNoPhone: false,
  hasNoOffice: false,
  // Basic activity flag so we can "disable" a record without deleting it
  isActive: true,
  // Timestamps
  createdAt: '',
  updatedAt: ''
};

/**
 * Count the number of filled fields in a person record
 */
export const countFilledFields = (person) => {
  const filledKeys = ['firstName', 'lastName', 'name', 'title', 'email', 'phone', 'jobTitle', 'department', 'office', 'roles', 'programId'];
  return filledKeys.reduce((count, key) => {
    const value = person[key];
    if (key === 'roles') {
      return (value || []).length > 0 ? count + 1 : count;
    } else if (key === 'programId') {
      return value != null ? count + 1 : count;
    } else {
      return (value || '').trim() !== '' ? count + 1 : count;
    }
  }, 0);
};

// ==================== DATA STANDARDIZATION ====================

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
 * Standardize a person record
 */
export const standardizePerson = (person) => {
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
    // Name standardization
    firstName: firstName,
    lastName: lastName,
    name: fullName,
    
    // Contact standardization
    email: (person.email || '').toLowerCase().trim(),
    phone: standardizePhone(person.phone),
    
    // Text field standardization
    title: (person.title || '').trim(),
    jobTitle: (person.jobTitle || '').trim(),
    department: (person.department || '').trim(),
    office: (person.office || '').trim(),
    
    // Ensure roles is always an array
    roles: Array.isArray(person.roles) ? person.roles : 
           (person.roles && typeof person.roles === 'object') ? Object.keys(person.roles).filter(k => person.roles[k]) :
           [],
    
    // Update timestamp
    updatedAt: new Date().toISOString()
  };

  // Remove empty name if no meaningful name data
  if (!standardized.firstName && !standardized.lastName && !standardized.name) {
    delete standardized.name;
  }

  // ---------------------------------------------------------------------
  // Ensure schema completeness – add any fields that were missing from
  // the incoming record so that *every* person document shares the same
  // structure regardless of role or data source. This is critical for
  // predictable queries and UI rendering.
  // ---------------------------------------------------------------------

  Object.entries(DEFAULT_PERSON_SCHEMA).forEach(([key, defaultValue]) => {
    if (standardized[key] === undefined) {
      standardized[key] = defaultValue;
    }
  });

  // ---------------------------------------------------------------------
  // Purge legacy / stray attributes now that required ones are present.
  // ---------------------------------------------------------------------

  Object.keys(standardized).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PERSON_SCHEMA, key)) {
      delete standardized[key];
    }
  });

  return standardized;
};

/**
 * Standardize a schedule record
 */
export const standardizeSchedule = (schedule) => {
  return {
    ...schedule,
    // Course standardization
    courseCode: standardizeCourseCode(schedule.courseCode),
    courseTitle: (schedule.courseTitle || '').trim(),
    section: (schedule.section || '').trim(),
    crn: (schedule.crn || '').trim(), // Add CRN standardization
    
    // Term standardization
    term: standardizeTerm(schedule.term),
    
    // Instructor name standardization
    instructorName: (schedule.instructorName || '').trim(),
    
    // Room standardization
    roomName: standardizeRoomName(schedule.roomName),
    
    // Status standardization
    status: (schedule.status || 'Active').trim(),
    scheduleType: (schedule.scheduleType || 'Class Instruction').trim(),
    
    // Update timestamp
    updatedAt: new Date().toISOString()
  };
};

/**
 * Standardize phone number to digits only
 */
export const standardizePhone = (phone) => {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
};

/**
 * Standardize course code (e.g., "ADM 1300" or "adm1300" -> "ADM 1300")
 */
export const standardizeCourseCode = (courseCode) => {
  if (!courseCode) return '';
  
  const clean = courseCode.trim().toUpperCase();
  // Add space between letters and numbers if missing
  return clean.replace(/([A-Z]+)(\d+)/, '$1 $2');
};

/**
 * Standardize term name
 */
export const standardizeTerm = (term) => {
  if (!term) return '';
  
  const clean = term.trim();
  
  // Handle common variations
  const termMappings = {
    'fall2025': 'Fall 2025',
    'spring2025': 'Spring 2025',
    'summer2025': 'Summer 2025',
    'fall25': 'Fall 2025',
    'spring25': 'Spring 2025',
    'summer25': 'Summer 2025'
  };
  
  const normalized = clean.toLowerCase().replace(/\s+/g, '');
  return termMappings[normalized] || clean;
};

/**
 * Standardize room name
 */
export const standardizeRoomName = (roomName) => {
  if (!roomName) return '';
  return roomName.trim();
};

// ==================== DUPLICATE DETECTION ====================

/**
 * Find potential duplicate people using simple, reliable criteria
 */
export const findDuplicatePeople = async () => {
  const peopleSnapshot = await getDocs(collection(db, 'people'));
  const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const duplicates = [];
  const emailMap = new Map();
  const phoneMap = new Map();
  const nameMap = new Map();
  
  people.forEach(person => {
    // Email duplicates (most reliable)
    if (person.email && person.email.trim()) {
      const email = person.email.toLowerCase().trim();
      if (emailMap.has(email)) {
        const existing = emailMap.get(email);
        const existingCount = countFilledFields(existing);
        const newCount = countFilledFields(person);
        let primary = existingCount >= newCount ? existing : person;
        let duplicateRecord = existingCount >= newCount ? person : existing; // renamed to avoid keyword conflict
        duplicates.push({
          type: 'email',
          reason: 'Same email address',
          primary,
          duplicate: duplicateRecord,
          confidence: 100
        });
        if (existingCount < newCount) {
          emailMap.set(email, person);
        }
      } else {
        emailMap.set(email, person);
      }
    }
    
    // Phone duplicates
    if (person.phone) {
      const phone = standardizePhone(person.phone);
      if (phone.length >= 10 && phoneMap.has(phone)) {
        const existing = phoneMap.get(phone);
        const existingCount = countFilledFields(existing);
        const newCount = countFilledFields(person);
        let primary = existingCount >= newCount ? existing : person;
        let duplicateRecord = existingCount >= newCount ? person : existing;
        duplicates.push({
          type: 'phone',
          reason: 'Same phone number',
          primary,
          duplicate: duplicateRecord,
          confidence: 90
        });
        if (existingCount < newCount) {
          phoneMap.set(phone, person);
        }
      } else if (phone.length >= 10) {
        phoneMap.set(phone, person);
      }
    }
    
    // Name-based duplicates (exact and fuzzy)
    if (person.firstName && person.lastName) {
      const fullName = `${person.firstName.toLowerCase().trim()} ${person.lastName.toLowerCase().trim()}`;
      
      // Check for exact matches first
      if (nameMap.has(fullName)) {
        const existing = nameMap.get(fullName);
        const existingCount = countFilledFields(existing);
        const newCount = countFilledFields(person);
        let primary = existingCount >= newCount ? existing : person;
        let duplicateRecord = existingCount >= newCount ? person : existing;
        duplicates.push({
          type: 'name',
          reason: 'Identical first and last name',
          primary,
          duplicate: duplicateRecord,
          confidence: 100
        });
        if (existingCount < newCount) {
          nameMap.set(fullName, person);
        }
      } else {
        nameMap.set(fullName, person);
        
        // Check for fuzzy matches with existing people
        for (const [existingFullName, existingPerson] of nameMap.entries()) {
          if (existingFullName === fullName) continue; // Skip self
          
          const similarity = calculateFuzzyNameSimilarity(fullName, existingFullName);
          if (similarity >= 0.85) { // 85% similarity threshold
            const existingCount = countFilledFields(existingPerson);
            const newCount = countFilledFields(person);
            let primary = existingCount >= newCount ? existingPerson : person;
            let duplicateRecord = existingCount >= newCount ? person : existingPerson;
            duplicates.push({
              type: 'fuzzy_name',
              reason: `Very similar names (${Math.round(similarity * 100)}% match) - likely same person with variations`,
              primary,
              duplicate: duplicateRecord,
              confidence: Math.round(similarity * 100)
            });
            if (existingCount < newCount) {
              nameMap.set(existingFullName, person); // Update map to the better record
            }
            break; // Only report the first fuzzy match to avoid spam
          }
        }
      }
    }
  });
  
  return duplicates;
};

/**
 * Find orphaned schedule records (schedules without valid people)
 */
export const findOrphanedSchedules = async () => {
  const [schedulesSnapshot, peopleSnapshot] = await Promise.all([
    getDocs(collection(db, 'schedules')),
    getDocs(collection(db, 'people'))
  ]);
  
  const schedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Create lookup maps
  const peopleByName = new Map();
  const peopleById = new Map();
  
  people.forEach(person => {
    peopleById.set(person.id, person);
    if (person.firstName && person.lastName) {
      const fullName = `${person.firstName} ${person.lastName}`.trim();
      peopleByName.set(fullName, person);
    }
  });
  
  const orphaned = schedules.filter(schedule => {
    // Check if instructor ID exists
    if (schedule.instructorId && peopleById.has(schedule.instructorId)) {
      return false;
    }
    
    // Check if instructor name matches anyone
    if (schedule.instructorName && peopleByName.has(schedule.instructorName)) {
      return false;
    }
    
    return true;
  });
  
  return orphaned;
};

// ==================== SIMPLE FIXES ====================

/**
 * Merge two people records (keep the primary, delete the duplicate)
 */
export const mergePeople = async (primaryId, duplicateId, fieldChoices = {}) => {
  const batch = writeBatch(db);
  
  // Get both records directly by ID
  const [primaryDoc, duplicateDoc] = await Promise.all([
    getDoc(doc(db, 'people', primaryId)),
    getDoc(doc(db, 'people', duplicateId))
  ]);
  
  if (!primaryDoc.exists() || !duplicateDoc.exists()) {
    throw new Error('One or both records not found');
  }
  
  const primary = { id: primaryDoc.id, ...primaryDoc.data() };
  const duplicate = { id: duplicateDoc.id, ...duplicateDoc.data() };
  
  // Base on primary
  const merged = { ...primary };
  
  // Fill missing fields from duplicate
  Object.keys(DEFAULT_PERSON_SCHEMA).forEach(key => {
    const primaryValue = merged[key];
    const duplicateValue = duplicate[key];
    if (
      (typeof primaryValue === 'string' && primaryValue.trim() === '') ||
      (Array.isArray(primaryValue) && primaryValue.length === 0) ||
      primaryValue === null ||
      primaryValue === undefined
    ) {
      merged[key] = duplicateValue;
    }
  });
  
  // Always merge roles
  merged.roles = [...new Set([...(primary.roles || []), ...(duplicate.roles || [])])];
  
  // Apply field choices for conflicts
  Object.entries(fieldChoices).forEach(([field, source]) => {
    const chosenValue = source === 'primary' ? primary[field] : duplicate[field];
    merged[field] = chosenValue !== undefined ? chosenValue : null;
  });

  // Update timestamp
  merged.updatedAt = new Date().toISOString();

  // Clean merged object: convert undefined to null
  Object.keys(merged).forEach(key => {
    if (merged[key] === undefined) {
      merged[key] = null;
    }
  });

  // Update schedules that reference the duplicate
  const schedulesSnapshot = await getDocs(query(collection(db, 'schedules'), where('instructorId', '==', duplicateId)));
  schedulesSnapshot.docs.forEach(scheduleDoc => {
    batch.update(scheduleDoc.ref, { instructorId: primaryId });
  });
  
  // Update the primary record
  batch.update(doc(db, 'people', primaryId), merged);
  
  // Delete the duplicate
  batch.delete(doc(db, 'people', duplicateId));
  
  await batch.commit();
  
  return merged;
};

/**
 * Link orphaned schedule to existing person
 */
export const linkScheduleToPerson = async (scheduleId, personId) => {
  const personDoc = await getDoc(doc(db, 'people', personId));
  if (!personDoc.exists()) {
    throw new Error('Person not found');
  }
  
  const person = { id: personDoc.id, ...personDoc.data() };
  const instructorName = `${person.firstName} ${person.lastName}`.trim();
  
  await updateDoc(doc(db, 'schedules', scheduleId), {
    instructorId: personId,
    instructorName: instructorName,
    updatedAt: new Date().toISOString()
  });
};

/**
 * Standardize all existing data
 */
export const standardizeAllData = async () => {
  const batch = writeBatch(db);
  let updateCount = 0;
  
  // Standardize people
  const peopleSnapshot = await getDocs(collection(db, 'people'));
  peopleSnapshot.docs.forEach(doc => {
    const standardized = standardizePerson(doc.data());
    batch.update(doc.ref, standardized);
    updateCount++;
  });
  
  // Standardize schedules
  const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
  schedulesSnapshot.docs.forEach(doc => {
    const standardized = standardizeSchedule(doc.data());
    batch.update(doc.ref, standardized);
    updateCount++;
  });
  
  await batch.commit();
  
  // Log the standardization operation
  await logStandardization('multiple', updateCount, 'dataHygiene.js - standardizeAllData');
  
  return { updatedRecords: updateCount };
};

/**
 * Automatically merge obvious duplicates (high confidence only)
 * Returns a report of what was merged
 */
export const autoMergeObviousDuplicates = async () => {
  // Existing people merging
  const duplicates = await findDuplicatePeople();
  const results = {
    mergedPeople: 0,
    mergedSchedules: 0,
    mergedRooms: 0,
    skipped: 0,
    errors: [],
    mergedPairs: []
  };

  // Merge people
  for (const duplicate of duplicates) {
    if (duplicate.confidence >= 95) {
      try {
        await mergePeople(duplicate.primary.id, duplicate.duplicate.id);
        results.mergedPeople++;
        results.mergedPairs.push({
          type: 'person',
          kept: `${duplicate.primary.firstName} ${duplicate.primary.lastName}`,
          removed: `${duplicate.duplicate.firstName} ${duplicate.duplicate.lastName}`,
          reason: duplicate.reason
        });
      } catch (error) {
        results.errors.push(`Failed to merge person ${duplicate.duplicate.firstName} ${duplicate.duplicate.lastName}: ${error.message}`);
      }
    } else {
      results.skipped++;
    }
  }

  // Fetch schedules and rooms for duplicate detection
  const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
  const schedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const roomsSnapshot = await getDocs(collection(db, 'rooms'));
  const rooms = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Merge schedules
  const scheduleDuplicates = detectScheduleDuplicates(schedules);
  for (const dup of scheduleDuplicates) {
    if (dup.confidence >= 0.95) {
      try {
        const mergeResult = await mergeScheduleRecords(dup);
        results.mergedSchedules++;
        results.mergedPairs.push({
          type: 'schedule',
          kept: mergeResult.primaryId,
          removed: mergeResult.secondaryId,
          reason: dup.reason
        });
      } catch (error) {
        results.errors.push(`Failed to merge schedule: ${error.message}`);
      }
    } else {
      results.skipped++;
    }
  }

  // Merge rooms
  const roomDuplicates = detectRoomDuplicates(rooms);
  for (const dup of roomDuplicates) {
    if (dup.confidence >= 0.95) {
      try {
        const mergeResult = await mergeRoomRecords(dup);
        results.mergedRooms++;
        results.mergedPairs.push({
          type: 'room',
          kept: mergeResult.primaryId,
          removed: mergeResult.secondaryId,
          reason: dup.reason
        });
      } catch (error) {
        results.errors.push(`Failed to merge room: ${error.message}`);
      }
    } else {
      results.skipped++;
    }
  }

  return results;
};

// ==================== REAL-TIME VALIDATION ====================

/**
 * Validate and clean data before saving
 */
export const validateAndCleanBeforeSave = async (data, collection_name) => {
  switch (collection_name) {
    case 'people':
      const cleanPerson = standardizePerson(data);
      
      // Check for potential duplicates
      const emailDuplicates = await findPeopleByEmail(cleanPerson.email);
      const duplicateWarnings = [];
      
      if (emailDuplicates.length > 0 && !emailDuplicates.find(p => p.id === cleanPerson.id)) {
        duplicateWarnings.push(`Email ${cleanPerson.email} already exists`);
      }
      
      // After cleaning
      // Enforce schema
      const schema = normalizedSchema.tables[collection_name];
      if (schema) {
        Object.keys(schema.fields).forEach(key => {
          if (cleanPerson[key] === undefined) {
            cleanPerson[key] = null; // Or default value from schema
          }
        });
        // Remove extra fields
        Object.keys(cleanPerson).forEach(key => {
          if (!schema.fields[key]) delete cleanPerson[key];
        });
      }

      return {
        cleanData: cleanPerson,
        warnings: duplicateWarnings,
        isValid: duplicateWarnings.length === 0
      };
      
    case 'schedules':
      return {
        cleanData: standardizeSchedule(data),
        warnings: [],
        isValid: true
      };
      
    default:
      return {
        cleanData: data,
        warnings: [],
        isValid: true
      };
  }
};

/**
 * Find people by email
 */
const findPeopleByEmail = async (email) => {
  if (!email) return [];
  
  const peopleSnapshot = await getDocs(query(collection(db, 'people'), where('email', '==', email.toLowerCase().trim())));
  return peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// ==================== HEALTH CHECK ====================

/**
 * Get a simple health report of the data
 */
export const getDataHealthReport = async () => {
  const [duplicates, orphaned] = await Promise.all([
    findDuplicatePeople(),
    findOrphanedSchedules()
  ]);
  
  const peopleSnapshot = await getDocs(collection(db, 'people'));
  const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
  
  const totalPeople = peopleSnapshot.size;
  const totalSchedules = schedulesSnapshot.size;
  
  // Count people missing key info (excluding those intentionally marked as not having them)
  const people = peopleSnapshot.docs.map(doc => doc.data());
  const missingEmail = people.filter(p => !p.email || p.email.trim() === '').length;
  const missingPhone = people.filter(p => (!p.phone || p.phone.trim() === '') && !p.hasNoPhone).length;
  const missingOffice = people.filter(p => (!p.office || p.office.trim() === '') && !p.hasNoOffice).length;
  const missingJobTitle = people.filter(p => !p.jobTitle || p.jobTitle.trim() === '').length;
  const missingProgram = people.filter(p => {
    // Only check for missing program if the person is faculty
    const roles = p.roles || [];
    const isFaculty = Array.isArray(roles) ? roles.includes('faculty') : !!roles.faculty;
    return isFaculty && !p.programId;
  }).length;
  
  return {
    summary: {
      totalPeople,
      totalSchedules,
      duplicatePeople: duplicates.length,
      orphanedSchedules: orphaned.length,
      missingEmail,
      missingPhone,
      missingOffice,
      missingJobTitle,
      missingProgram,
      healthScore: calculateHealthScore(totalPeople, duplicates.length, orphaned.length, missingEmail)
    },
    duplicates,
    orphaned,
    lastChecked: new Date().toISOString()
  };
};

/**
 * Calculate fuzzy similarity between two full names
 * Handles common variations like middle initials, nicknames, etc.
 */
const calculateFuzzyNameSimilarity = (fullName1, fullName2) => {
  if (!fullName1 || !fullName2) return 0;
  
  // Normalize names for comparison
  const normalize = (name) => {
    return name.toLowerCase()
      .replace(/\b[a-z]\.\s*/g, '') // Remove middle initials
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  };
  
  const n1 = normalize(fullName1);
  const n2 = normalize(fullName2);
  
  // Exact match after normalization
  if (n1 === n2) return 1.0;
  
  // Split into parts for more granular comparison
  const parts1 = n1.split(' ');
  const parts2 = n2.split(' ');
  
  // Must have same number of name parts (first + last)
  if (parts1.length !== parts2.length) {
    // Allow for cases like "John Smith" vs "John A Smith" (different part counts)
    // But penalize the score
    if (Math.abs(parts1.length - parts2.length) === 1) {
      // One has a middle initial, check if base names match
      const longer = parts1.length > parts2.length ? parts1 : parts2;
      const shorter = parts1.length < parts2.length ? parts1 : parts2;
      
      // Remove middle part from longer name and compare
      const longerWithoutMiddle = [longer[0], longer[longer.length - 1]];
      if (longerWithoutMiddle[0] === shorter[0] && longerWithoutMiddle[1] === shorter[1]) {
        return 0.95; // Very high match - same person with/without middle initial
      }
    }
    return 0; // Too different in structure
  }
  
  // Compare each part
  let totalSimilarity = 0;
  for (let i = 0; i < parts1.length; i++) {
    const partSimilarity = calculatePartSimilarity(parts1[i], parts2[i]);
    totalSimilarity += partSimilarity;
  }
  
  return totalSimilarity / parts1.length;
};

/**
 * Calculate similarity between individual name parts (first names, last names)
 */
const calculatePartSimilarity = (part1, part2) => {
  if (!part1 || !part2) return 0;
  
  const p1 = part1.toLowerCase().trim();
  const p2 = part2.toLowerCase().trim();
  
  // Exact match
  if (p1 === p2) return 1;
  
  // Common nickname mappings for first names
  const nicknames = {
    'bob': 'robert', 'bobby': 'robert', 'rob': 'robert', 'robbie': 'robert',
    'bill': 'william', 'billy': 'william', 'will': 'william', 'willie': 'william',
    'jim': 'james', 'jimmy': 'james', 'jamie': 'james',
    'mike': 'michael', 'mickey': 'michael', 'mick': 'michael',
    'dave': 'david', 'davey': 'david',
    'steve': 'steven', 'stevie': 'steven',
    'chris': 'christopher', 'matt': 'matthew', 'dan': 'daniel', 'danny': 'daniel',
    'tom': 'thomas', 'tommy': 'thomas', 'joe': 'joseph', 'joey': 'joseph',
    'tony': 'anthony', 'nick': 'nicholas', 'andy': 'andrew', 'alex': 'alexander',
    'liz': 'elizabeth', 'beth': 'elizabeth', 'betty': 'elizabeth',
    'sue': 'susan', 'susie': 'susan', 'katie': 'katherine', 'kate': 'katherine',
    'kathy': 'katherine', 'patty': 'patricia', 'pat': 'patricia', 'trish': 'patricia'
  };
  
  // Check nickname mappings (both directions)
  if (nicknames[p1] === p2 || nicknames[p2] === p1) return 0.95;
  if (Object.values(nicknames).includes(p1) && nicknames[p2] === p1) return 0.95;
  if (Object.values(nicknames).includes(p2) && nicknames[p1] === p2) return 0.95;
  
  // Check if one name is a substring of the other (e.g., "Ben" vs "Benjamin")
  if (p1.startsWith(p2) || p2.startsWith(p1)) {
    const minLength = Math.min(p1.length, p2.length);
    const maxLength = Math.max(p1.length, p2.length);
    return minLength / maxLength * 0.9; // High but not perfect match
  }
  
  // Basic character similarity
  const maxLen = Math.max(p1.length, p2.length);
  let matches = 0;
  for (let i = 0; i < Math.min(p1.length, p2.length); i++) {
    if (p1[i] === p2[i]) matches++;
  }
  
  return matches / maxLen;
};

/**
 * Calculate a simple health score (0-100)
 */
const calculateHealthScore = (total, duplicates, orphaned, missingEmail) => {
  if (total === 0) return 100;
  
  const issues = duplicates + orphaned + missingEmail;
  const score = Math.max(0, 100 - (issues / total) * 100);
  return Math.round(score);
}; 

/**
 * Preview what standardization would change without making actual changes
 */
export const previewStandardization = async () => {
  try {
    const peopleSnapshot = await getDocs(collection(db, 'people'));
    const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const changes = [];
    
    people.forEach(person => {
      const original = { ...person };
      const standardized = standardizePerson(person);
      
      // Find actual differences
      const differences = [];
      
      // Check name parsing issues
      if ((!original.firstName || !original.lastName) && original.name) {
        if (standardized.firstName && standardized.lastName) {
          differences.push({
            field: 'name_parsing',
            description: `Parse "${original.name}" into firstName: "${standardized.firstName}" and lastName: "${standardized.lastName}"`,
            before: { firstName: original.firstName || '', lastName: original.lastName || '', name: original.name || '' },
            after: { firstName: standardized.firstName, lastName: standardized.lastName, name: standardized.name }
          });
        }
      }
      
      // Check for undefined name construction
      if (original.name === 'undefined undefined' || original.name === ' ' || original.name === '') {
        if (standardized.name && standardized.name !== 'undefined undefined' && standardized.name.trim() !== '') {
          differences.push({
            field: 'fix_broken_name',
            description: `Fix broken name "${original.name}" to "${standardized.name}"`,
            before: { name: original.name },
            after: { name: standardized.name }
          });
        }
      }
      
      // Check phone standardization
      if (original.phone && original.phone !== standardized.phone) {
        differences.push({
          field: 'phone_format',
          description: `Standardize phone from "${original.phone}" to "${standardized.phone}"`,
          before: { phone: original.phone },
          after: { phone: standardized.phone }
        });
      }
      
      // Check email standardization
      if (original.email && original.email !== standardized.email) {
        differences.push({
          field: 'email_format',
          description: `Standardize email from "${original.email}" to "${standardized.email}"`,
          before: { email: original.email },
          after: { email: standardized.email }
        });
      }
      
      // Check roles standardization
      if (original.roles && !Array.isArray(original.roles) && typeof original.roles === 'object') {
        differences.push({
          field: 'roles_format',
          description: `Convert roles from object to array format`,
          before: { roles: original.roles },
          after: { roles: standardized.roles }
        });
      }
      
      if (differences.length > 0) {
        changes.push({
          personId: person.id,
          personName: original.name || `${original.firstName} ${original.lastName}`.trim() || 'Unknown',
          differences
        });
      }
    });
    
    return {
      totalRecords: people.length,
      recordsToChange: changes.length,
      changes,
      summary: {
        nameParsingFixes: changes.filter(c => c.differences.some(d => d.field === 'name_parsing')).length,
        brokenNameFixes: changes.filter(c => c.differences.some(d => d.field === 'fix_broken_name')).length,
        phoneFormatFixes: changes.filter(c => c.differences.some(d => d.field === 'phone_format')).length,
        emailFormatFixes: changes.filter(c => c.differences.some(d => d.field === 'email_format')).length,
        rolesFormatFixes: changes.filter(c => c.differences.some(d => d.field === 'roles_format')).length
      }
    };
  } catch (error) {
    console.error('Error previewing standardization:', error);
    throw error;
  }
};

/**
 * Apply targeted standardization changes with logging for undo capability
 */
export const applyTargetedStandardization = async (changeIds = null) => {
  try {
    const preview = await previewStandardization();
    
    // If changeIds provided, only apply those changes
    const changesToApply = changeIds 
      ? preview.changes.filter(change => changeIds.includes(change.personId))
      : preview.changes;
    
    if (changesToApply.length === 0) {
      return { applied: 0, skipped: 0, errors: [] };
    }
    
    const batch = writeBatch(db);
    const changeLog = [];
    let applied = 0;
    let errors = [];
    
    for (const change of changesToApply) {
      try {
        // Get current data
        const personRef = doc(db, 'people', change.personId);
        const personSnapshot = await getDoc(personRef);
        
        if (!personSnapshot.exists()) {
          errors.push(`Person ${change.personId} not found`);
          continue;
        }
        
        const currentData = personSnapshot.data();
        const standardizedData = standardizePerson(currentData);
        
        // Only update if there are actual changes
        if (JSON.stringify(currentData) !== JSON.stringify(standardizedData)) {
          batch.update(personRef, standardizedData);
          
          // Log the change for potential undo
          changeLog.push({
            personId: change.personId,
            personName: change.personName,
            timestamp: new Date().toISOString(),
            originalData: currentData,
            updatedData: standardizedData,
            changes: change.differences
          });
          
          applied++;
        }
      } catch (error) {
        errors.push(`Error updating ${change.personName}: ${error.message}`);
      }
    }
    
    // Commit all changes
    if (applied > 0) {
      await batch.commit();
      
      // Save change log for potential undo
      if (changeLog.length > 0) {
        await addDoc(collection(db, 'standardizationHistory'), {
          timestamp: new Date().toISOString(),
          operation: 'targeted_standardization',
          changes: changeLog,
          summary: `Applied ${applied} standardization changes`
        });
      }
    }
    
    return {
      applied,
      skipped: changesToApply.length - applied,
      errors,
      changeLogId: changeLog.length > 0 ? 'saved' : null
    };
    
  } catch (error) {
    console.error('Error applying targeted standardization:', error);
    throw error;
  }
};

/**
 * Get recent standardization history for undo capability
 */
export const getStandardizationHistory = async (limit = 10) => {
  try {
    const historySnapshot = await getDocs(
      query(
        collection(db, 'standardizationHistory'), 
        orderBy('timestamp', 'desc'),
        limit(limit)
      )
    );
    
    return historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting standardization history:', error);
    return [];
  }
}; 