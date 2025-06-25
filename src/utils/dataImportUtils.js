/**
 * Smart Data Import Processing Utilities
 * Implements normalized data model with unified 'people' collection and ID-based references
 */

import { collection, addDoc, getDocs, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

// ==================== CORE DATA MODELS ====================

/**
 * Unified Person Model (Single Source of Truth)
 */
export const createPersonModel = ({
  firstName = '',
  lastName = '',
  title = '',
  email = '',
  phone = '',
  jobTitle = '',
  department = '',
  office = '',
  roles = [],
  isAdjunct = false,
  isFullTime = true,
  isTenured = false,
  hasNoPhone = false,
  hasNoOffice = false,
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString()
}) => ({
  firstName: firstName.trim(),
  lastName: lastName.trim(),
  title: title.trim(),
  email: email.toLowerCase().trim(),
  phone: hasNoPhone ? '' : phone.replace(/\D/g, ''),
  jobTitle: jobTitle.trim(),
  department: department.trim(),
  office: hasNoOffice ? '' : office.trim(),
  roles: Array.isArray(roles) ? roles : [],
  isAdjunct,
  isFullTime,
  isTenured: roles.includes('faculty') ? isTenured : false, // Only faculty can be tenured
  hasNoPhone,
  hasNoOffice,
  createdAt,
  updatedAt
});

/**
 * Schedule Model with ID-based references
 */
export const createScheduleModel = ({
  instructorId = '',
  instructorName = '', // Keep for display/backup
  courseCode = '',
  courseTitle = '',
  section = '',
  meetingPatterns = [],
  roomId = null,
  roomName = '',
  term = '',
  academicYear = '',
  credits = 0,
  scheduleType = 'Class Instruction',
  status = 'Active',
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString()
}) => ({
  instructorId,
  instructorName,
  courseCode: courseCode.trim(),
  courseTitle: courseTitle.trim(),
  section: section.trim(),
  meetingPatterns: Array.isArray(meetingPatterns) ? meetingPatterns : [],
  roomId,
  roomName: roomName.trim(),
  term: term.trim(),
  academicYear: academicYear.trim(),
  credits: parseInt(credits) || 0,
  scheduleType: scheduleType.trim(),
  status: status.trim(),
  createdAt,
  updatedAt
});

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
 * Smart person matching algorithm
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
      
      // Find matching person
      const match = await findMatchingPerson(personData, existingPeople);
      
      if (match) {
        // Update existing person
        const updates = {
          ...personData,
          updatedAt: new Date().toISOString(),
          // Merge roles to avoid overwriting
          roles: [...new Set([...match.person.roles, ...personData.roles])]
        };
        
        await updateDoc(doc(db, 'people', match.person.id), updates);
        results.updated++;
        results.people.push({ ...updates, id: match.person.id });
      } else {
        // Create new person
        const docRef = await addDoc(collection(db, 'people'), personData);
        results.created++;
        results.people.push({ ...personData, id: docRef.id });
        existingPeople.push({ ...personData, id: docRef.id });
      }
      
    } catch (error) {
      results.errors.push(`Row ${i + 1}: Error processing ${row['First Name']} ${row['Last Name']}: ${error.message}`);
    }
  }
  
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
  const [peopleSnapshot, schedulesSnapshot, roomsSnapshot] = await Promise.all([
    getDocs(collection(db, 'people')),
    getDocs(collection(db, 'schedules')),
    getDocs(collection(db, 'rooms'))
  ]);
  
  const existingPeople = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const existingSchedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const existingRooms = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  console.log(`📊 Found ${existingPeople.length} existing people, ${existingRooms.length} rooms`);
  
  for (const row of csvData) {
    try {
      // Extract key fields
      const instructorField = row['Instructor'] || '';
      const courseCode = row['Course'] || '';
      const courseTitle = row['Course Title'] || row['Long Title'] || '';
      const section = row['Section #'] || '';
      const meetingPattern = row['Meeting Pattern'] || '';
      const meetings = row['Meetings'] || '';
      const roomName = (row['Room'] || '').trim();
      const term = row['Term'] || '';
      const credits = row['Credit Hrs'] || row['Credit Hrs Min'] || 0;
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
          if (!match.person.roles.includes('faculty')) {
            const updatedRoles = [...new Set([...match.person.roles, 'faculty'])];
            await updateDoc(doc(db, 'people', match.person.id), { 
              roles: updatedRoles,
              updatedAt: new Date().toISOString()
            });
            
            // Update our local copy
            match.person.roles = updatedRoles;
            results.peopleUpdated++;
            console.log(`✅ Added faculty role to ${match.person.firstName} ${match.person.lastName}`);
          }
        } else {
          // Create new person for instructor with enhanced data
          const newPerson = createPersonModel({
            firstName: instructorInfo.firstName,
            lastName: instructorInfo.lastName,
            title: instructorInfo.title,
            roles: ['faculty'],
            isAdjunct: true,
            department: 'Human Sciences & Design', // Default from CLSS context
            jobTitle: 'Instructor' // Default
          });
          
          const docRef = await addDoc(collection(db, 'people'), newPerson);
          instructorId = docRef.id;
          instructorData = { ...newPerson, id: docRef.id };
          existingPeople.push(instructorData);
          results.peopleCreated++;
          console.log(`➕ Created new instructor: ${instructorInfo.firstName} ${instructorInfo.lastName}`);
        }
      }
      
      // === ENHANCED ROOM LINKING ===
      let roomId = null;
      if (roomName && roomName.toLowerCase() !== 'online' && roomName !== 'No Room Needed') {
        const existingRoom = existingRooms.find(r => 
          r.name === roomName || r.displayName === roomName
        );
        
        if (existingRoom) {
          roomId = existingRoom.id;
                 } else {
           // Create new room using the Room model
           const newRoom = createRoomModel({
             name: roomName,
             displayName: roomName,
             building: extractBuildingFromRoom(roomName),
             roomNumber: extractRoomNumberFromRoom(roomName),
             type: 'Classroom'
           });
          
          const docRef = await addDoc(collection(db, 'rooms'), newRoom);
          roomId = docRef.id;
          existingRooms.push({ ...newRoom, id: docRef.id });
          results.roomsCreated++;
          console.log(`🏛️ Created new room: ${roomName}`);
        }
      }
      
      // Parse meeting patterns
      const meetingPatterns = parseMeetingPatterns(meetingPattern, meetings);
      
      // Create schedule data with full relational links
      const scheduleData = createScheduleModel({
        instructorId,
        instructorName: instructorData ? `${instructorData.firstName} ${instructorData.lastName}`.trim() : 'Staff',
        courseCode,
        courseTitle,
        section,
        meetingPatterns,
        roomId,
        roomName,
        term,
        credits,
        scheduleType,
        status
      });
      
      // Enhanced duplicate detection
      const duplicateSchedule = existingSchedules.find(s => 
        s.courseCode === scheduleData.courseCode &&
        s.section === scheduleData.section &&
        s.term === scheduleData.term &&
        s.instructorId === scheduleData.instructorId
      );
      
      if (duplicateSchedule) {
        results.skipped++;
        console.log(`⏭️ Skipped duplicate: ${courseCode} ${section} - ${instructorData?.firstName} ${instructorData?.lastName}`);
        continue;
      }
      
      // Create new schedule with full relational integrity
      const docRef = await addDoc(collection(db, 'schedules'), scheduleData);
      results.created++;
      results.schedules.push({ ...scheduleData, id: docRef.id });
      existingSchedules.push({ ...scheduleData, id: docRef.id });
      
      console.log(`✅ Created schedule: ${courseCode} ${section} → ${instructorData?.firstName} ${instructorData?.lastName || 'Staff'}`);
      
    } catch (error) {
      results.errors.push(`Error processing schedule: ${error.message}`);
      console.error('❌ Schedule import error:', error);
    }
  }
  
  console.log(`🎉 Schedule import complete: ${results.created} schedules, ${results.peopleCreated} new people, ${results.roomsCreated} new rooms`);
  return results;
};

/**
 * Enhanced instructor matching with multiple strategies
 */
const findBestInstructorMatch = async (instructorInfo, existingPeople) => {
  const { firstName, lastName, title } = instructorInfo;
  
  // Strategy 1: Exact first + last name match (highest confidence)
  if (firstName && lastName) {
    const exactMatch = existingPeople.find(p => 
      p.firstName && p.lastName &&
      p.firstName.toLowerCase() === firstName.toLowerCase() &&
      p.lastName.toLowerCase() === lastName.toLowerCase()
    );
    if (exactMatch) {
      console.log(`🎯 Exact name match: ${firstName} ${lastName} → ${exactMatch.id}`);
      return { person: exactMatch, confidence: 'high' };
    }
  }
  
  // Strategy 2: Last name + first initial match (medium confidence)
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
  
  // Strategy 3: Similar name match with title consideration
  if (lastName) {
    const similarMatches = existingPeople.filter(p => 
      p.lastName && p.lastName.toLowerCase() === lastName.toLowerCase()
    );
    
    if (similarMatches.length === 1) {
      console.log(`👤 Unique last name match: ${lastName} → ${similarMatches[0].firstName} ${similarMatches[0].lastName}`);
      return { person: similarMatches[0], confidence: 'medium' };
    }
    
    // If multiple matches, try to disambiguate with title
    if (title && similarMatches.length > 1) {
      const titleMatch = similarMatches.find(p => 
        p.title && p.title.toLowerCase().includes(title.toLowerCase())
      );
      if (titleMatch) {
        console.log(`🎓 Title-disambiguated match: ${title} ${lastName} → ${titleMatch.firstName} ${titleMatch.lastName}`);
        return { person: titleMatch, confidence: 'medium' };
      }
    }
  }
  
  console.log(`❓ No match found for: ${firstName} ${lastName}`);
  return null;
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
    
    // Only include rows that have meaningful schedule data
    if (isValidScheduleRow(rowData)) {
      scheduleData.push(rowData);
    }
  }
  
  console.log('✅ CLSS CSV parsing complete. Found', scheduleData.length, 'schedule records');
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
      const room = schedule.roomId ? roomsMap.get(schedule.roomId) : null;
      
      return {
        ...schedule,
        instructor, // Full instructor object
        room, // Full room object
        // Keep display fields for component compatibility
        instructorName: instructor ? `${instructor.firstName} ${instructor.lastName}`.trim() : schedule.instructorName || 'Staff',
        roomName: room ? room.displayName : schedule.roomName || ''
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