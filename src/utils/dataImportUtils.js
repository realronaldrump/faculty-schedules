/**
 * Smart Data Import Processing Utilities
 * Implements normalized data model with unified 'people' collection and ID-based references
 */

import { collection, addDoc, getDocs, query, where, doc, updateDoc, writeBatch, setDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { standardizePerson, standardizeSchedule, validateAndCleanBeforeSave, autoMergeObviousDuplicates } from './dataHygiene';
import { parseCourseCode } from './courseUtils';
import { logCreate, logUpdate, logImport, logBulkUpdate } from './changeLogger';

// ==================== PROGRAM MAPPING ====================

/**
 * Program mapping based on course code prefixes
 */
const PROGRAM_MAPPING = {
  'ADM': 'apparel',
  'CFS': 'child-family-studies', 
  'NUTR': 'nutrition',
  'ID': 'interior-design'
};

/**
 * Determine program ID from course data
 */
const determineProgramIdFromCourses = (courses) => {
  const prefixes = new Set();
  
  // Extract course code prefixes
  courses.forEach(course => {
    const courseCode = course.courseCode || course.Course || '';
    const parsed = parseCourseCode(courseCode);
    if (parsed && !parsed.error) {
      prefixes.add(parsed.program);
    }
  });
  
  // Return the first valid program ID we find
  for (const prefix of prefixes) {
    if (PROGRAM_MAPPING[prefix]) {
      return PROGRAM_MAPPING[prefix];
    }
  }
  
  return null;
};

// ==================== CORE DATA MODELS ====================

/**
 * Unified Person Model (Single Source of Truth)
 */
export const createPersonModel = (rawData) => {
  // Create basic person model
  const person = {
    firstName: (rawData.firstName || '').trim(),
    lastName: (rawData.lastName || '').trim(),
    title: (rawData.title || '').trim(),
    email: (rawData.email || '').toLowerCase().trim(),
    phone: rawData.hasNoPhone ? '' : (rawData.phone || '').replace(/\D/g, ''),
    jobTitle: (rawData.jobTitle || '').trim(),
    department: (rawData.department || '').trim(),
    office: rawData.hasNoOffice ? '' : (rawData.office || '').trim(),
    roles: Array.isArray(rawData.roles) ? rawData.roles : [],
    isAdjunct: rawData.isAdjunct || false,
    isFullTime: rawData.isFullTime !== undefined ? rawData.isFullTime : true,
    isTenured: (Array.isArray(rawData.roles) && rawData.roles.includes('faculty')) || 
               (typeof rawData.roles === 'object' && rawData.roles?.faculty) ? 
               (rawData.isTenured || false) : false,
    isUPD: (Array.isArray(rawData.roles) && rawData.roles.includes('faculty')) || 
           (typeof rawData.roles === 'object' && rawData.roles?.faculty) ? 
           (rawData.isUPD || false) : false,
    programId: rawData.programId || null, // Reference to programs collection
    externalIds: {
      clssInstructorId: rawData.clssInstructorId || null,
      baylorId: rawData.baylorId || null,
      emails: rawData.email ? [rawData.email.toLowerCase().trim()] : []
    },
    baylorId: rawData.baylorId || '', // 9-digit Baylor ID number
    hasNoPhone: rawData.hasNoPhone || false,
    hasNoOffice: rawData.hasNoOffice || false,
    createdAt: rawData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Apply data hygiene standardization
  return standardizePerson(person);
};

/**
 * Schedule Model with ID-based references
 */
export const createScheduleModel = (rawData) => {
  // Create basic schedule model
  const schedule = {
    instructorId: rawData.instructorId || '',
    instructorName: (rawData.instructorName || '').trim(),
    courseId: (rawData.courseId || '').trim(),
    courseCode: (rawData.courseCode || '').trim(),
    courseTitle: (rawData.courseTitle || '').trim(),
    program: rawData.program || '',
    courseLevel: rawData.courseLevel || 0,
    section: (rawData.section || '').trim(),
    crn: rawData.crn || '', // Add CRN field
    meetingPatterns: Array.isArray(rawData.meetingPatterns) ? rawData.meetingPatterns : [],
    // Multi-room support (backwards compatible):
    // - roomIds: array of referenced room document IDs
    // - roomNames: array of display strings for rooms
    // - roomId/roomName retained for legacy consumers (first room)
    roomIds: Array.isArray(rawData.roomIds) ? rawData.roomIds : (rawData.roomId ? [rawData.roomId] : []),
    roomId: rawData.roomId || null,
    roomNames: Array.isArray(rawData.roomNames)
      ? rawData.roomNames.map((n) => (n || '').toString().trim()).filter(Boolean)
      : ((rawData.roomName || '').trim() ? [(rawData.roomName || '').trim()] : []),
    roomName: (rawData.roomName || '').trim(),
    term: (rawData.term || '').trim(),
    termCode: (rawData.termCode || '').trim(),
    academicYear: (rawData.academicYear || '').trim(),
    credits: parseInt(rawData.credits) || 0,
    scheduleType: (rawData.scheduleType || 'Class Instruction').trim(),
    status: (rawData.status || 'Active').trim(),
    createdAt: rawData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Apply data hygiene standardization
  return standardizeSchedule(schedule);
};

// ==================== UPSERT HELPERS ====================

/**
 * Determine whether a value should be considered "empty" for merge purposes
 */
const isEmptyForMerge = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

/**
 * Build an updates object applying upsert rules:
 * - If CSV has a non-empty value, it overwrites existing
 * - If CSV value is empty, leave existing field unchanged (omit from updates)
 * - Always refresh updatedAt
 */
export const buildUpsertUpdates = (existingRecord, incomingRecord) => {
  const updates = {};
  let hasChanges = false;

  const deepEqual = (a, b) => {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === 'object') {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  Object.keys(incomingRecord).forEach((key) => {
    if (key === 'createdAt' || key === 'updatedAt') return; // ignore timestamps for diff

    const incoming = incomingRecord[key];
    if (isEmptyForMerge(incoming)) return; // don't overwrite with empty

    const existing = existingRecord[key];
    const valuesEqual = deepEqual(incoming, existing);

    if (!valuesEqual) {
      updates[key] = incoming;
      hasChanges = true;
    }
  });

  if (hasChanges) {
    updates.updatedAt = new Date().toISOString();
  }

  return { updates, hasChanges };
};

/**
 * Meeting Pattern Model
 */
export const createMeetingPattern = ({
  day = '',
  startTime = '',
  endTime = '',
  startDate = null,
  endDate = null
}) => ({
  day: day.trim(),
  startTime: startTime.trim(),
  endTime: endTime.trim(),
  startDate,
  endDate
});

/**
 * Room Model for relational linking
 */
export const createRoomModel = ({
  name = '',
  displayName = '',
  building = '',
  roomNumber = '',
  capacity = null,
  type = 'Classroom',
  equipment = [],
  isActive = true,
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString()
}) => ({
  name: name.trim(),
  displayName: displayName.trim(),
  building: building.trim(),
  roomNumber: roomNumber.trim(),
  capacity: capacity ? parseInt(capacity) : null,
  type: type.trim(),
  equipment: Array.isArray(equipment) ? equipment : [],
  isActive,
  createdAt,
  updatedAt
});

// ==================== NAME PARSING UTILITIES ====================

/**
 * Parse full name into components
 */
export const parseFullName = (fullName) => {
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
 * Parse instructor field from CLSS format: "LastName, FirstName (ID) [Primary, 100%]"
 */
export const parseInstructorField = (instructorField) => {
  if (!instructorField) return null;
  
  const cleanField = instructorField.trim();
  
  // Handle "Staff" case
  if (cleanField.toLowerCase().includes('staff')) {
    return {
      lastName: 'Staff',
      firstName: '',
      title: '',
      id: null,
      percentage: 100,
      isPrimary: true
    };
  }
  
  // Parse format: "LastName, FirstName (ID) [Primary, 100%]"
  const match = cleanField.match(/^([^,]+),\s*([^(]+)\s*\(([^)]+)\)\s*\[([^,]+),\s*(\d+)%\]/);
  
  if (match) {
    const [, lastName, firstName, id, role, percentage] = match;
    return {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      title: '',
      id: id.trim(),
      percentage: parseInt(percentage),
      isPrimary: role.toLowerCase().includes('primary')
    };
  }
  
  // Fallback: try to parse as "LastName, FirstName"
  const simpleMatch = cleanField.match(/^([^,]+),\s*(.+)$/);
  if (simpleMatch) {
    const [, lastName, firstName] = simpleMatch;
    return {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      title: '',
      id: null,
      percentage: 100,
      isPrimary: true
    };
  }
  
  // Last resort: treat as full name
  const parsed = parseFullName(cleanField);
  return {
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    title: parsed.title,
    id: null,
    percentage: 100,
    isPrimary: true
  };
};

// ==================== MEETING PATTERN PARSING ====================

/**
 * Parse complex meeting patterns from CLSS format
 * Examples: "TR 2pm-3:15pm; T 2pm-4pm", "MW 8:30am-11am", "Does Not Meet"
 */
export const parseMeetingPatterns = (meetingPatternStr, meetingsStr = '') => {
  if (!meetingPatternStr || meetingPatternStr.toLowerCase().includes('does not meet')) {
    return [];
  }
  
  const patterns = [];
  
  // Split by semicolon for multiple patterns
  const segments = meetingPatternStr.split(';').map(s => s.trim());
  
  for (const segment of segments) {
    if (!segment) continue;
    
    // Parse pattern like "TR 2pm-3:15pm" or "MW 8:30am-11am"
    const match = segment.match(/^([MTWRF]+)\s+(.+)$/);
    if (!match) continue;
    
    const [, dayString, timeRange] = match;
    const days = dayString.split('');
    
    // Parse time range
    const timeMatch = timeRange.match(/^(.+?)-(.+)$/);
    if (!timeMatch) continue;
    
    const [, startTime, endTime] = timeMatch;
    
    // Create pattern for each day
    for (const day of days) {
      if (['M', 'T', 'W', 'R', 'F'].includes(day)) {
        patterns.push(createMeetingPattern({
          day,
          startTime: normalizeTime(startTime.trim()),
          endTime: normalizeTime(endTime.trim())
        }));
      }
    }
  }
  
  return patterns;
};

/**
 * Normalize time format to consistent format
 */
export const normalizeTime = (timeStr) => {
  if (!timeStr) return '';
  
  const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');
  
  // Handle formats like "2pm", "9:30am", "12:15pm"
  let match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (match) {
    let [, hour, minute = '00', ampm] = match;
    hour = parseInt(hour);
    
    // Convert to 12-hour format with consistent spacing
    const displayHour = hour;
    const period = ampm.toUpperCase();
    
    return `${displayHour}:${minute} ${period}`;
  }
  
  return timeStr;
};

/**
 * Extract cross-listed CRNs from CLSS row (if present)
 * Looks at fields like "Cross-listings", "Cross-list Enrollment", and textual hints like "Also ... (CRN)"
 */
export const parseCrossListCrns = (row) => {
  const fields = [
    'Cross-listings',
    'Cross-list Enrollment',
    'Cross-list Maximum',
    'Cross-list Wait Total',
    'Also'
  ];
  const crns = new Set();
  for (const f of fields) {
    const val = row && row[f];
    if (!val || typeof val !== 'string') continue;
    const matches = val.match(/\b(\d{5})\b/g);
    if (matches) matches.forEach((m) => crns.add(m));
  }
  return Array.from(crns);
};

// ==================== ROLE DETERMINATION ====================

/**
 * Determine roles based on job title patterns
 */
export const determineRoles = (jobTitle) => {
  if (!jobTitle) return ['staff'];
  
  const title = jobTitle.toLowerCase();
  const roles = [];
  
  // Faculty indicators
  const facultyKeywords = [
    'professor', 'lecturer', 'instructor', 'teacher', 'faculty',
    'chair', 'associate', 'assistant', 'clinical', 'adjunct',
    'visiting', 'emeritus', 'postdoc'
  ];
  
  // Staff indicators
  const staffKeywords = [
    'coordinator', 'administrator', 'assistant', 'associate',
    'director', 'manager', 'specialist', 'analyst', 'clerk',
    'secretary', 'technician', 'support'
  ];
  
  if (facultyKeywords.some(keyword => title.includes(keyword))) {
    roles.push('faculty');
  }
  
  if (staffKeywords.some(keyword => title.includes(keyword))) {
    roles.push('staff');
  }
  
  // Default to staff if no matches
  if (roles.length === 0) {
    roles.push('staff');
  }
  
  return roles;
};

// ==================== MATCHING ALGORITHMS ====================

/**
 * Smart person matching algorithm with fuzzy matching
 */
export const findMatchingPerson = async (personData, existingPeople = null) => {
  // If existing people not provided, fetch from database
  if (!existingPeople) {
    const peopleSnapshot = await getDocs(collection(db, 'people'));
    existingPeople = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  
  const { firstName, lastName, email } = personData;
  
  // Exact email match (highest priority)
  if (email) {
    const emailMatch = existingPeople.find(p => 
      p.email && p.email.toLowerCase() === email.toLowerCase()
    );
    if (emailMatch) return { person: emailMatch, confidence: 'high' };
  }
  
  // Exact name match
  if (firstName && lastName) {
    const nameMatch = existingPeople.find(p => 
      p.firstName && p.lastName &&
      p.firstName.toLowerCase() === firstName.toLowerCase() &&
      p.lastName.toLowerCase() === lastName.toLowerCase()
    );
    if (nameMatch) return { person: nameMatch, confidence: 'medium' };
  }
  
  // Fuzzy name match
  if (firstName && lastName) {
    let bestMatch = null;
    let bestSimilarity = 0;
    
    existingPeople.forEach(p => {
      if (p.firstName && p.lastName) {
        const similarity = calculateFuzzyNameSimilarity(
          `${firstName} ${lastName}`,
          `${p.firstName} ${p.lastName}`
        );
        if (similarity > bestSimilarity && similarity >= 0.85) {
          bestSimilarity = similarity;
          bestMatch = p;
        }
      }
    });
    
    if (bestMatch) {
      return { person: bestMatch, confidence: 'fuzzy', similarity: bestSimilarity };
    }
  }
  
  // Last name only match (lower confidence)
  if (lastName) {
    const lastNameMatches = existingPeople.filter(p => 
      p.lastName && p.lastName.toLowerCase() === lastName.toLowerCase()
    );
    if (lastNameMatches.length === 1) {
      return { person: lastNameMatches[0], confidence: 'low' };
    }
  }
  
  return null;
};

// Add this helper function for fuzzy similarity (simple Levenshtein)
const calculateFuzzyNameSimilarity = (name1, name2) => {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();
  
  if (n1 === n2) return 1.0;
  
  const matrix = Array(n1.length + 1).fill().map(() => Array(n2.length + 1).fill(0));
  
  for (let i = 0; i <= n1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= n2.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= n1.length; i++) {
    for (let j = 1; j <= n2.length; j++) {
      const cost = n1[i - 1] === n2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLength = Math.max(n1.length, n2.length);
  return maxLength === 0 ? 1.0 : 1.0 - (matrix[n1.length][n2.length] / maxLength);
};

// ==================== DATA CLEANING UTILITIES ====================

/**
 * Detect and potentially fix column misalignment issues in directory CSV
 */
export const cleanDirectoryData = (csvData) => {
  const cleanedData = [];
  const issues = [];
  
  for (let i = 0; i < csvData.length; i++) {
    const row = { ...csvData[i] };
    let hasIssues = false;
    
    // Check for job title keywords in unexpected columns
    const homeCity = (row['Home City'] || '').trim();
    const jobTitle = (row['Job Title'] || '').trim();
    
    // Common job title keywords that shouldn't be in Home City
    const jobTitleKeywords = [
      'professor', 'lecturer', 'instructor', 'coordinator', 
      'assistant', 'associate', 'director', 'manager',
      'clinical', 'adjunct', 'visiting', 'emeritus'
    ];
    
    const suspiciousHomeCity = homeCity && jobTitleKeywords.some(keyword => 
      homeCity.toLowerCase().includes(keyword)
    );
    
    if (suspiciousHomeCity && !jobTitle) {
      // Likely column shift - move Home City to Job Title
      row['Job Title'] = homeCity;
      row['Home City'] = '';
      hasIssues = true;
      issues.push({
        rowIndex: i,
        person: `${row['First Name']} ${row['Last Name']}`,
        issue: `Moved "${homeCity}" from Home City to Job Title (likely column misalignment)`,
        fixed: true
      });
    } else if (suspiciousHomeCity && jobTitle) {
      // Both fields have data, but Home City looks like a job title
      hasIssues = true;
      issues.push({
        rowIndex: i,
        person: `${row['First Name']} ${row['Last Name']}`,
        issue: `Home City "${homeCity}" looks like job title, but Job Title already has "${jobTitle}"`,
        fixed: false
      });
    }
    
    // Check for other potential issues
    const email = (row['E-mail Address'] || '').trim();
    if (email && !email.includes('@') && email.includes('.')) {
      // Might be a misplaced website or other data
      issues.push({
        rowIndex: i,
        person: `${row['First Name']} ${row['Last Name']}`,
        issue: `Email "${email}" doesn't look like a valid email address`,
        fixed: false
      });
    }
    
    cleanedData.push(row);
  }
  
  return { cleanedData, issues };
};

// ==================== SMART IMPORT PROCESSORS ====================

/**
 * Process Directory CSV Import
 */
export const processDirectoryImport = async (csvData, options = {}) => {
  const { defaultRole = 'faculty', validateData = true } = options;
  
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    warnings: [],
    people: []
  };
  
  // Clean and validate data first
  let dataToProcess = csvData;
  if (validateData) {
    const { cleanedData, issues } = cleanDirectoryData(csvData);
    dataToProcess = cleanedData;
    
    // Add cleaning issues to results
    issues.forEach(issue => {
      if (issue.fixed) {
        results.warnings.push(`Row ${issue.rowIndex + 1} (${issue.person}): ${issue.issue}`);
      } else {
        results.errors.push(`Row ${issue.rowIndex + 1} (${issue.person}): ${issue.issue}`);
      }
    });
  }
  
  // Fetch existing people
  const peopleSnapshot = await getDocs(collection(db, 'people'));
  const existingPeople = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  for (let i = 0; i < dataToProcess.length; i++) {
    const row = dataToProcess[i];
    try {
      // Parse name components with better validation
      const title = (row['Title'] || '').trim();
      const firstName = (row['First Name'] || '').trim();
      const lastName = (row['Last Name'] || '').trim();
      const email = (row['E-mail Address'] || '').trim();
      const phone = (row['Business Phone'] || row['Home Phone'] || '').trim();
      const jobTitle = (row['Job Title'] || '').trim();
      const department = (row['Department'] || '').trim();
      const office = (row['Office Location'] || '').trim();
      
      // Skip rows with no meaningful data
      if (!firstName && !lastName && !email) {
        results.skipped++;
        continue;
      }
      
      // Data validation for column misalignment
      if (validateData) {
        // Check if job title appears in unexpected fields (like Home City)
        const homeCity = (row['Home City'] || '').trim();
        const suspiciousJobTitleInHomeCity = homeCity && (
          homeCity.toLowerCase().includes('professor') ||
          homeCity.toLowerCase().includes('lecturer') ||
          homeCity.toLowerCase().includes('instructor') ||
          homeCity.toLowerCase().includes('coordinator') ||
          homeCity.toLowerCase().includes('assistant') ||
          homeCity.toLowerCase().includes('associate')
        );
        
        if (suspiciousJobTitleInHomeCity && !jobTitle) {
          // Likely column misalignment - use Home City as Job Title
          results.errors.push(`Row ${i + 1}: Detected possible column misalignment for ${firstName} ${lastName}. Using "${homeCity}" as job title.`);
          // We could fix this automatically, but for now just flag it
        }
        
        // Validate email format
        if (email && !email.includes('@')) {
          results.errors.push(`Row ${i + 1}: Invalid email format for ${firstName} ${lastName}: ${email}`);
        }
      }
      
      // Determine roles - use job title analysis with fallback to default
      let roles = [];
      if (jobTitle) {
        roles = determineRoles(jobTitle);
      } else {
        // No job title provided - use default role
        if (defaultRole === 'both') {
          roles = ['faculty', 'staff'];
        } else {
          roles = [defaultRole];
        }
      }
      
      // Create person data
      const personData = createPersonModel({
        firstName,
        lastName,
        title,
        email,
        phone,
        jobTitle,
        department,
        office,
        roles,
        isAdjunct: jobTitle.toLowerCase().includes('adjunct'),
        isFullTime: !jobTitle.toLowerCase().includes('part') && !jobTitle.toLowerCase().includes('adjunct')
      });
      
      // Match strictly by email for idempotent upsert behavior
      const existingMatch = personData.email
        ? existingPeople.find(p => (p.email || '').toLowerCase() === personData.email)
        : null;
      
      if (existingMatch) {
        // Upsert: only overwrite with non-empty CSV values; skip if identical
        const { updates, hasChanges } = buildUpsertUpdates(existingMatch, personData);
        if (!hasChanges) {
          results.skipped++;
          continue;
        }

        await updateDoc(doc(db, 'people', existingMatch.id), updates);
        
        // Log update (no await to avoid slowing bulk import)
        logUpdate(
          `Directory Import - ${personData.firstName} ${personData.lastName}`,
          'people',
          existingMatch.id,
          updates,
          existingMatch,
          'dataImportUtils.js - processDirectoryImport'
        ).catch(err => console.error('Change logging error:', err));
        
        results.updated++;
        results.people.push({ ...existingMatch, ...updates });
      } else {
        // Create new person
        const docRef = await addDoc(collection(db, 'people'), personData);
        
        // Log creation (no await to avoid slowing bulk import)
        logCreate(
          `Directory Import - ${personData.firstName} ${personData.lastName}`,
          'people',
          docRef.id,
          personData,
          'dataImportUtils.js - processDirectoryImport'
        ).catch(err => console.error('Change logging error:', err));
        
        results.created++;
        results.people.push({ ...personData, id: docRef.id });
        existingPeople.push({ ...personData, id: docRef.id });
      }
      
    } catch (error) {
      results.errors.push(`Row ${i + 1}: Error processing ${row['First Name']} ${row['Last Name']}: ${error.message}`);
    }
  }
  
  // After import, run automatic duplicate cleanup
  await autoMergeObviousDuplicates();
  
  return results;
};

/**
 * Enhanced CLSS Schedule CSV Import with Full Relational Linking
 */
export const processScheduleImport = async (csvData) => {
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    schedules: [],
    peopleCreated: 0,
    peopleUpdated: 0,
    roomsCreated: 0
  };
  
  console.log('🔗 Starting enhanced relational schedule import...');
  
  // Fetch existing data
  const [peopleSnapshot, schedulesSnapshot, roomsSnapshot, coursesSnapshot, termsSnapshot] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.PEOPLE)),
    getDocs(collection(db, COLLECTIONS.SCHEDULES)),
    getDocs(collection(db, COLLECTIONS.ROOMS)),
    getDocs(collection(db, COLLECTIONS.COURSES)),
    getDocs(collection(db, COLLECTIONS.TERMS))
  ]);
  
  const existingPeople = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const existingSchedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const existingRooms = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const existingCourses = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const existingTerms = termsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  console.log(`📊 Found ${existingPeople.length} existing people, ${existingRooms.length} rooms`);
  
  for (const row of csvData) {
    try {
      // Extract key fields
      const instructorField = row['Instructor'] || '';
      const courseCode = row['Course'] || '';
      const courseTitle = row['Course Title'] || row['Long Title'] || '';
      const section = row['Section #'] || '';
      const crn = row['CRN'] || ''; // Extract CRN field
      const meetingPattern = row['Meeting Pattern'] || '';
      const meetings = row['Meetings'] || '';
      const roomName = (row['Room'] || '').trim();
      const term = row['Term'] || '';
      const termCode = row['Term Code'] || '';
      const creditsFromCsv = row['Credit Hrs'] || row['Credit Hrs Min'];
      const scheduleType = row['Schedule Type'] || 'Class Instruction';
      const status = row['Status'] || 'Active';
      
      if (!courseCode || !instructorField) {
        results.skipped++;
        continue;
      }
      
      // Parse instructor information
      const instructorInfo = parseInstructorField(instructorField);
      if (!instructorInfo) {
        results.errors.push(`Could not parse instructor: ${instructorField}`);
        continue;
      }
      
      // === ENHANCED INSTRUCTOR LINKING ===
      let instructorId = null;
      let instructorData = null;
      
      if (instructorInfo.lastName !== 'Staff') {
        // Use sophisticated matching with multiple strategies
        const match = await findBestInstructorMatch(instructorInfo, existingPeople);
        
        if (match) {
          instructorId = match.person.id;
          instructorData = match.person;
          
          // Update person's roles if they don't have faculty role
          const hasRoles = match.person.roles && (
            (Array.isArray(match.person.roles) && match.person.roles.includes('faculty')) ||
            (typeof match.person.roles === 'object' && match.person.roles.faculty === true)
          );
          
          if (!hasRoles) {
            const currentRoles = Array.isArray(match.person.roles) 
              ? match.person.roles 
              : Object.keys(match.person.roles || {}).filter(key => match.person.roles[key]);
            const updatedRoles = [...new Set([...currentRoles, 'faculty'])];
              await updateDoc(doc(db, 'people', match.person.id), { 
              roles: updatedRoles,
              updatedAt: new Date().toISOString()
            });
            
            // Update our local copy
            match.person.roles = updatedRoles;
            results.peopleUpdated++;
            console.log(`✅ Added faculty role to ${match.person.firstName} ${match.person.lastName}`);
          }
          
          // Determine and set program based on course data if not already set
          if (!match.person.programId) {
            const programId = determineProgramIdFromCourses([{ courseCode }]);
            if (programId) {
              await updateDoc(doc(db, 'people', match.person.id), { 
                programId: programId,
                updatedAt: new Date().toISOString()
              });
              
              // Update our local copy
              match.person.programId = programId;
              console.log(`🎯 Assigned ${programId} program to ${match.person.firstName} ${match.person.lastName} based on course ${courseCode}`);
            }
          }
        } else {
          // Determine program based on course before creating new person
          const programId = determineProgramIdFromCourses([{ courseCode }]);
          
          // Create new person for instructor with enhanced data
          const newPerson = createPersonModel({
            firstName: instructorInfo.firstName,
            lastName: instructorInfo.lastName,
            title: instructorInfo.title,
            roles: ['faculty'],
            isAdjunct: true,
            department: 'Human Sciences & Design', // Default from CLSS context
            jobTitle: 'Instructor', // Default
            programId: programId, // Set program based on course
            clssInstructorId: instructorInfo.id || null
          });
          
          const docRef = await addDoc(collection(db, COLLECTIONS.PEOPLE), newPerson);
          instructorId = docRef.id;
          instructorData = { ...newPerson, id: docRef.id };
          existingPeople.push(instructorData);
          results.peopleCreated++;
          console.log(`➕ Created new instructor: ${instructorInfo.firstName} ${instructorInfo.lastName}${programId ? ` (${programId} program)` : ''}`);
        }
      }
      
      // === ENHANCED ROOM LINKING (supports multiple rooms separated by ';') ===
      let roomIds = [];
      let roomNames = [];
      if (roomName && roomName.toLowerCase() !== 'online' && roomName !== 'No Room Needed') {
        const splitRooms = roomName.split(';').map(s => s.trim()).filter(Boolean);
        for (const singleRoom of splitRooms) {
          roomNames.push(singleRoom);
          // Deterministic room ID: buildingCode_roomNumber (fallback to sanitized name)
          const building = extractBuildingFromRoom(singleRoom);
          const roomNumber = extractRoomNumberFromRoom(singleRoom);
          const deterministicRoomId = (building && roomNumber)
            ? `${building.replace(/\s+/g,'_').toLowerCase()}_${roomNumber}`
            : singleRoom.replace(/\s+/g,'_').toLowerCase();
          const existingRoom = existingRooms.find(r => r.id === deterministicRoomId || r.name === singleRoom || r.displayName === singleRoom);
          if (existingRoom) {
            roomIds.push(existingRoom.id);
          } else {
            const newRoom = createRoomModel({
              name: singleRoom,
              displayName: singleRoom,
              building,
              roomNumber,
              type: 'Classroom'
            });
            const roomRef = doc(db, COLLECTIONS.ROOMS, deterministicRoomId);
            await setDoc(roomRef, newRoom, { merge: true });
            logCreate(
              `Room - ${singleRoom}`,
              COLLECTIONS.ROOMS,
              roomRef.id,
              newRoom,
              'dataImportUtils.js - processScheduleImport'
            ).catch(err => console.error('Change logging error (room):', err));
            roomIds.push(roomRef.id);
            existingRooms.push({ ...newRoom, id: roomRef.id });
            results.roomsCreated++;
            console.log(`🏛️ Created new room: ${singleRoom}`);
          }
        }
      }
      
      // Parse meeting patterns
      const meetingPatterns = parseMeetingPatterns(meetingPattern, meetings);
      
      // Parse course code for additional details
      const parsedCourse = parseCourseCode(courseCode);
      const finalCredits = creditsFromCsv ? parseInt(creditsFromCsv) : parsedCourse.credits;

      // === COURSE UPSERT WITH DETERMINISTIC ID ===
      let courseId = '';
      if (courseCode) {
        const courseDeterministicId = courseCode.replace(/\s+/g, '_').toUpperCase();
        const existingCourse = existingCourses.find(c => c.id === courseDeterministicId);
        const courseDoc = {
          courseCode,
          title: courseTitle,
          departmentCode: (row['Department Code'] || '').trim(),
          subjectCode: (row['Subject Code'] || '').trim(),
          catalogNumber: (row['Catalog Number'] || '').trim(),
          credits: finalCredits || null,
          program: parsedCourse.program || null,
          updatedAt: new Date().toISOString(),
        };
        if (!existingCourse) {
          await setDoc(doc(db, COLLECTIONS.COURSES, courseDeterministicId), { ...courseDoc, createdAt: new Date().toISOString() });
          // Log course creation
          logCreate(
            `Course - ${courseCode}`,
            COLLECTIONS.COURSES,
            courseDeterministicId,
            courseDoc,
            'dataImportUtils.js - processScheduleImport'
          ).catch(err => console.error('Change logging error (course):', err));
          existingCourses.push({ id: courseDeterministicId, ...courseDoc });
        } else {
          await setDoc(doc(db, COLLECTIONS.COURSES, courseDeterministicId), courseDoc, { merge: true });
        }
        courseId = courseDeterministicId;
      }

      // === TERM UPSERT WITH DETERMINISTIC ID ===
      let termId = '';
      if (termCode) {
        const termDeterministicId = termCode;
        const existingTerm = existingTerms.find(t => t.id === termDeterministicId);
        const termDoc = {
          term,
          termCode,
          updatedAt: new Date().toISOString()
        };
        if (!existingTerm) {
          await setDoc(doc(db, COLLECTIONS.TERMS, termDeterministicId), { ...termDoc, createdAt: new Date().toISOString() });
          // Log term creation
          logCreate(
            `Term - ${term} (${termCode})`,
            COLLECTIONS.TERMS,
            termDeterministicId,
            termDoc,
            'dataImportUtils.js - processScheduleImport'
          ).catch(err => console.error('Change logging error (term):', err));
          existingTerms.push({ id: termDeterministicId, ...termDoc });
        } else {
          await setDoc(doc(db, COLLECTIONS.TERMS, termDeterministicId), termDoc, { merge: true });
        }
        termId = termDeterministicId;
      }

      // Create schedule data with full relational links
      const scheduleData = createScheduleModel({
        instructorId,
        instructorName: instructorData ? `${instructorData.firstName} ${instructorData.lastName}`.trim() : 'Staff',
        courseId,
        courseCode,
        courseTitle,
        program: parsedCourse.program,
        courseLevel: parsedCourse.level,
        section,
        crn, // Pass CRN to the model
        meetingPatterns,
        // Multi-room fields
        roomIds,
        roomId: roomIds.length > 0 ? roomIds[0] : null,
        roomNames,
        roomName: roomNames[0] || '',
        term,
        termCode,
        credits: finalCredits,
        scheduleType,
        status
      });

      // Parse cross-listings from CSV text (store related CRNs if present)
      const crossListCrns = parseCrossListCrns(row);

      // Omit redundant display fields from writes; keep on read via joins
      const { instructorName: _omitInstructorName, roomName: _omitRoomName, courseTitle: _omitCourseTitle, ...scheduleWrite } = scheduleData;
      if (crossListCrns && crossListCrns.length > 0) {
        scheduleWrite.crossListCrns = Array.from(new Set(crossListCrns));
      }
      
      // Prefer CRN + Term matching when available, fallback to Course + Section + Term
      let existingMatch = null;
      if (scheduleData.crn && scheduleData.term) {
        existingMatch = existingSchedules.find(s => (s.crn || '') === scheduleData.crn && (s.term || '') === scheduleData.term);
      }
      if (!existingMatch) {
        existingMatch = existingSchedules.find(s => 
          s.courseCode === scheduleData.courseCode &&
          s.section === scheduleData.section &&
          s.term === scheduleData.term
        );
      }
      
      if (existingMatch) {
        // Upsert: only overwrite with non-empty CSV values; skip if identical
        const { updates, hasChanges } = buildUpsertUpdates(existingMatch, scheduleWrite);
        if (!hasChanges) {
          results.skipped++;
          continue;
        }

        await updateDoc(doc(db, COLLECTIONS.SCHEDULES, existingMatch.id), updates);
        
        logUpdate(
          `Schedule Import - ${courseCode} ${section} (${term})`,
          'schedules',
          existingMatch.id,
          updates,
          existingMatch,
          'dataImportUtils.js - processScheduleImport'
        ).catch(err => console.error('Change logging error:', err));

        results.updated++;
        results.schedules.push({ ...existingMatch, ...updates });
      } else {
        // Create new schedule with full relational integrity
        // Deterministic schedule ID strategy:
        //   Prefer: termCode_crn when a valid 5–6 digit CRN exists
        //   Fallback: termCode_course_section (lowercase, underscores)
        const hasValidCrn = (scheduleData.crn || '').toString().trim().match(/^\d{5,6}$/);
        const baseTerm = (scheduleData.termCode || scheduleData.term || 'TERM').toString().trim();
        const fallbackKey = `${baseTerm}_${(scheduleData.courseCode || 'COURSE').replace(/\s+/g, '-').toUpperCase()}_${(scheduleData.section || 'SECTION').replace(/\s+/g, '-')}`;
        const scheduleDeterministicId = hasValidCrn ? `${baseTerm}_${scheduleData.crn}` : fallbackKey;
        const schedRef = doc(db, COLLECTIONS.SCHEDULES, scheduleDeterministicId);
        await setDoc(schedRef, scheduleWrite, { merge: true });
        results.created++;
        results.schedules.push({ ...scheduleWrite, id: schedRef.id });
        existingSchedules.push({ ...scheduleWrite, id: schedRef.id });
        
        logCreate(
          `Schedule Import - ${courseCode} ${section} (${term})`,
          'schedules',
          schedRef.id,
          scheduleData,
          'dataImportUtils.js - processScheduleImport'
        ).catch(err => console.error('Change logging error:', err));
      }
      
    } catch (error) {
      results.errors.push(`Error processing schedule: ${error.message}`);
      console.error('❌ Schedule import error:', error);
    }
  }
  
  // After import, run automatic duplicate cleanup
  await autoMergeObviousDuplicates();
  
  console.log(`🎉 Schedule import complete: ${results.created} schedules, ${results.peopleCreated} new people, ${results.roomsCreated} new rooms`);
  return results;
};

/**
 * Enhanced instructor matching with multiple strategies
 */
const findBestInstructorMatch = async (instructorInfo, existingPeople) => {
  const { firstName, lastName, title, id: clssId } = instructorInfo;
  // Strategy 0: External ID direct match (highest confidence)
  if (clssId) {
    const externalMatch = existingPeople.find(p => p.externalIds && p.externalIds.clssInstructorId && String(p.externalIds.clssInstructorId) === String(clssId));
    if (externalMatch) {
      console.log(`🎯 External ID match (CLSS): ${clssId} → ${externalMatch.firstName} ${externalMatch.lastName} (${externalMatch.id})`);
      return { person: externalMatch, confidence: 'high' };
    }
  }
  
  // Normalize names for comparison (remove middle initials, common variations)
  const normalizeNameForMatching = (name) => {
    if (!name) return '';
    return name.toLowerCase()
      .replace(/\b[a-z]\.\s*/g, '') // Remove middle initials like "A.", "B."
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  };
  
  const normalizedFirstName = normalizeNameForMatching(firstName);
  const normalizedLastName = normalizeNameForMatching(lastName);
  
  // Strategy 1: Exact normalized name match (highest confidence)
  if (normalizedFirstName && normalizedLastName) {
    const exactMatch = existingPeople.find(p => {
      const existingFirst = normalizeNameForMatching(p.firstName);
      const existingLast = normalizeNameForMatching(p.lastName);
      return existingFirst === normalizedFirstName && existingLast === normalizedLastName;
    });
    
    if (exactMatch) {
      console.log(`🎯 Normalized exact match: "${firstName} ${lastName}" → "${exactMatch.firstName} ${exactMatch.lastName}" (${exactMatch.id})`);
      return { person: exactMatch, confidence: 'high' };
    }
  }
  
  // Strategy 2: Original exact match (for perfect matches)
  if (firstName && lastName) {
    const perfectMatch = existingPeople.find(p => 
      p.firstName && p.lastName &&
      p.firstName.toLowerCase() === firstName.toLowerCase() &&
      p.lastName.toLowerCase() === lastName.toLowerCase()
    );
    if (perfectMatch) {
      console.log(`✨ Perfect exact match: ${firstName} ${lastName} → ${perfectMatch.id}`);
      return { person: perfectMatch, confidence: 'high' };
    }
  }
  
  // Strategy 3: Fuzzy name match
  if (firstName && lastName) {
    let bestMatch = null;
    let bestSimilarity = 0;
    
    existingPeople.forEach(p => {
      if (p.firstName && p.lastName) {
        const similarity = calculateFuzzyNameSimilarity(
          `${firstName} ${lastName}`,
          `${p.firstName} ${p.lastName}`
        );
        if (similarity > bestSimilarity && similarity >= 0.85) {
          bestSimilarity = similarity;
          bestMatch = p;
        }
      }
    });
    
    if (bestMatch) {
      console.log(`🔍 Fuzzy match (${Math.round(bestSimilarity * 100)}%): "${firstName} ${lastName}" → "${bestMatch.firstName} ${bestMatch.lastName}" (${bestMatch.id})`);
      return { person: bestMatch, confidence: 'fuzzy', similarity: bestSimilarity };
    }
  }
  
  // Strategy 4: Last name + first initial match (medium confidence)
  if (firstName && lastName) {
    const firstInitial = firstName.charAt(0).toLowerCase();
    const initialMatch = existingPeople.find(p => 
      p.lastName && p.firstName &&
      p.lastName.toLowerCase() === lastName.toLowerCase() &&
      p.firstName.charAt(0).toLowerCase() === firstInitial
    );
    if (initialMatch) {
      console.log(`📝 Initial match: ${firstName} ${lastName} → ${initialMatch.firstName} ${initialMatch.lastName}`);
      return { person: initialMatch, confidence: 'medium' };
    }
  }
  
  // Strategy 5: Unique last name match (for cases where last name is uncommon)
  if (lastName) {
    const lastNameMatches = existingPeople.filter(p => 
      p.lastName && p.lastName.toLowerCase() === lastName.toLowerCase()
    );
    
    if (lastNameMatches.length === 1) {
      const match = lastNameMatches[0];
      console.log(`👤 Unique last name match: ${lastName} → ${match.firstName} ${match.lastName} (${match.id})`);
      return { person: match, confidence: 'medium' };
    }
    
    // If multiple matches, try to disambiguate with title
    if (title && lastNameMatches.length > 1) {
      const titleMatch = lastNameMatches.find(p => 
        p.title && p.title.toLowerCase().includes(title.toLowerCase())
      );
      if (titleMatch) {
        console.log(`🎓 Title-disambiguated match: ${title} ${lastName} → ${titleMatch.firstName} ${titleMatch.lastName} (${titleMatch.id})`);
        return { person: titleMatch, confidence: 'medium' };
      }
    }
  }
  
  console.log(`❓ No match found for: ${firstName} ${lastName}`);
  return null;
};

/**
 * Calculate similarity between two name strings
 * Returns a value between 0 and 1 (1 = identical)
 */
const calculateNameSimilarity = (name1, name2) => {
  if (!name1 || !name2) return 0;
  
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  
  // Exact match
  if (n1 === n2) return 1;
  
  // Check for common nickname mappings
  const nicknames = {
    'bob': 'robert',
    'bobby': 'robert',
    'rob': 'robert',
    'robbie': 'robert',
    'bill': 'william', 
    'billy': 'william',
    'will': 'william',
    'willie': 'william',
    'jim': 'james',
    'jimmy': 'james',
    'jamie': 'james',
    'mike': 'michael',
    'mickey': 'michael',
    'mick': 'michael',
    'dave': 'david',
    'davey': 'david',
    'steve': 'steven',
    'stevie': 'steven',
    'chris': 'christopher',
    'matt': 'matthew',
    'dan': 'daniel',
    'danny': 'daniel',
    'tom': 'thomas',
    'tommy': 'thomas',
    'joe': 'joseph',
    'joey': 'joseph',
    'tony': 'anthony',
    'liz': 'elizabeth',
    'beth': 'elizabeth',
    'betty': 'elizabeth',
    'sue': 'susan',
    'susie': 'susan',
    'katie': 'katherine',
    'kate': 'katherine',
    'kathy': 'katherine',
    'patty': 'patricia',
    'pat': 'patricia',
    'trish': 'patricia',
    'nick': 'nicholas',
    'andy': 'andrew',
    'alex': 'alexander'
  };
  
  // Check both directions of nickname mapping
  if (nicknames[n1] === n2 || nicknames[n2] === n1) return 0.9;
  if (Object.values(nicknames).includes(n1) && nicknames[n2] === n1) return 0.9;
  if (Object.values(nicknames).includes(n2) && nicknames[n1] === n2) return 0.9;
  
  // Check if one name starts with the other (e.g., "Ben" vs "Benjamin")
  if (n1.startsWith(n2) || n2.startsWith(n1)) {
    const minLength = Math.min(n1.length, n2.length);
    const maxLength = Math.max(n1.length, n2.length);
    return minLength / maxLength;
  }
  
  // Simple character similarity (Levenshtein-like)
  const maxLen = Math.max(n1.length, n2.length);
  let matches = 0;
  for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
    if (n1[i] === n2[i]) matches++;
  }
  
  return matches / maxLen;
};

/**
 * Extract building name from room string
 */
const extractBuildingFromRoom = (roomName) => {
  // Handle common patterns like "Mary Gibbs Jones (FCS) 213" or "Goebel Building 111"
  const buildingMatch = roomName.match(/^([^0-9]+)/);
  if (buildingMatch) {
    return buildingMatch[1].trim().replace(/\([^)]*\)/, '').trim();
  }
  return 'Unknown Building';
};

/**
 * Extract room number from room string
 */
const extractRoomNumberFromRoom = (roomName) => {
  // Extract numbers at the end of room name
  const numberMatch = roomName.match(/(\d+)\s*$/);
  if (numberMatch) {
    return numberMatch[1];
  }
  return '';
};

// ==================== CLSS CSV PARSING ====================

/**
 * Parse CLSS CSV export format
 * Handles the complex structure of CLSS exports including:
 * - Header rows that need to be skipped
 * - Course title rows vs actual schedule data rows
 * - Many empty columns and rows
 */
export const parseCLSSCSV = (csvText) => {
  console.log('🔍 Starting CLSS CSV parsing...');
  
  const lines = csvText.split('\n');
  let headerRowIndex = -1;
  let scheduleData = [];
  let detectedSemester = null;
  
  // Extract semester from the first line (e.g., "Fall 2025")
  if (lines.length > 0) {
    const firstLine = lines[0].trim().replace(/"/g, '');
    // Check if first line looks like a semester (e.g., "Fall 2025", "Spring 2024")
    const semesterPattern = /^(Fall|Spring|Summer|Winter)\s+\d{4}$/i;
    if (semesterPattern.test(firstLine)) {
      detectedSemester = firstLine;
      console.log('🎓 Detected semester from first line:', detectedSemester);
    }
  }
  
  // Find the actual header row (contains column definitions)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('CLSS ID') && line.includes('Instructor') && line.includes('Course')) {
      headerRowIndex = i;
      console.log('📋 Found header row at index:', i);
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    throw new Error('Could not find CLSS header row. Expected headers: CLSS ID, Instructor, Course');
  }
  
  // Parse header row
  const headerLine = lines[headerRowIndex];
  const headers = parseCSVLine(headerLine).map(h => h.replace(/"/g, '').trim());
  console.log('📊 CLSS Headers found:', headers.slice(0, 10), '... (showing first 10)');
  
  // Process data rows (skip header and any rows before it)
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Skip course title rows (these contain only course names, no actual data)
    if (isCourseTitleRow(line)) {
      console.log('📚 Skipping course title row:', line.substring(0, 50));
      continue;
    }
    
    // Parse the data row
    const values = parseCSVLine(line);
    
    // Create row object
    const rowData = {};
    headers.forEach((header, index) => {
      rowData[header] = (values[index] || '').replace(/"/g, '').trim();
    });
    
    // Add the detected semester to each row if we found one
    if (detectedSemester) {
      rowData['Term'] = detectedSemester;
    }
    
    // Only include rows that have meaningful schedule data
    if (isValidScheduleRow(rowData)) {
      scheduleData.push(rowData);
    }
  }
  
  console.log('✅ CLSS CSV parsing complete. Found', scheduleData.length, 'schedule records');
  console.log('🎓 All records tagged with semester:', detectedSemester);
  return scheduleData;
};

/**
 * Robust CSV line parser that handles empty fields and quoted values
 */
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current);
  return result;
};

/**
 * Check if a line is a course title row (not actual schedule data)
 */
const isCourseTitleRow = (line) => {
  // Course title rows typically have the course name in the first column
  // and are followed by many empty columns
  const values = parseCSVLine(line);
  
  // If first column has a course pattern like "ADM 1241 - Apparel Aesthetics"
  // and most other columns are empty, it's likely a title row
  if (values[0] && values[0].match(/^[A-Z]{2,4}\s+\d{4}\s*-/)) {
    const nonEmptyCount = values.filter(v => v && v.trim()).length;
    // If only a few columns have data, it's probably a title row
    return nonEmptyCount < 5;
  }
  
  return false;
};

/**
 * Check if a row contains valid schedule data
 */
const isValidScheduleRow = (rowData) => {
  // Must have instructor and course information
  const hasInstructor = rowData['Instructor'] && rowData['Instructor'].trim();
  const hasCourse = rowData['Course'] && rowData['Course'].trim();
  const hasValidCRN = rowData['CRN'] && rowData['CRN'].trim() && !isNaN(rowData['CRN']);
  
  return hasInstructor && hasCourse && hasValidCRN;
};

// ==================== RELATIONAL DATA FETCHING ====================

/**
 * Fetch schedules with full relational data (people and rooms populated)
 */
export const fetchSchedulesWithRelationalData = async () => {
  try {
    const [schedulesSnapshot, peopleSnapshot, roomsSnapshot] = await Promise.all([
      getDocs(collection(db, 'schedules')),
      getDocs(collection(db, 'people')),
      getDocs(collection(db, 'rooms'))
    ]);
    
    const schedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const rooms = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Create lookup maps for performance
    const peopleMap = new Map(people.map(p => [p.id, p]));
    const roomsMap = new Map(rooms.map(r => [r.id, r]));
    
    // Populate relational data
    const enrichedSchedules = schedules.map(schedule => {
      const instructor = schedule.instructorId ? peopleMap.get(schedule.instructorId) : null;
      // Multi-room relational enrichment
      const resolvedRooms = Array.isArray(schedule.roomIds)
        ? schedule.roomIds.map((rid) => roomsMap.get(rid)).filter(Boolean)
        : (schedule.roomId ? [roomsMap.get(schedule.roomId)].filter(Boolean) : []);

      // Derive legacy single room fields for compatibility
      const primaryRoom = resolvedRooms[0] || (schedule.roomId ? roomsMap.get(schedule.roomId) : null);
      const derivedRoomName = Array.isArray(schedule.roomNames) && schedule.roomNames.length > 0
        ? schedule.roomNames[0]
        : (primaryRoom ? (primaryRoom.displayName || primaryRoom.name) : (schedule.roomName || ''));

      return {
        ...schedule,
        instructor,
        rooms: resolvedRooms, // new relational array
        room: primaryRoom || null, // maintain legacy singular field for older UIs
        instructorName: instructor ? `${instructor.firstName} ${instructor.lastName}`.trim() : schedule.instructorName || 'Staff',
        roomName: derivedRoomName,
        roomNames: Array.isArray(schedule.roomNames) ? schedule.roomNames : (derivedRoomName ? [derivedRoomName] : [])
      };
    });
    
    return {
      schedules: enrichedSchedules,
      people,
      rooms
    };
  } catch (error) {
    console.error('Error fetching relational schedule data:', error);
    throw error;
  }
};

export default {
  createPersonModel,
  createScheduleModel,
  createMeetingPattern,
  createRoomModel,
  parseFullName,
  parseInstructorField,
  parseMeetingPatterns,
  normalizeTime,
  determineRoles,
  findMatchingPerson,
  cleanDirectoryData,
  processDirectoryImport,
  processScheduleImport,
  parseCLSSCSV,
  fetchSchedulesWithRelationalData
}; 