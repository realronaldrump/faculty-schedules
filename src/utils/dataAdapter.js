/**
 * Data Adapter Utilities
 * Bridge between normalized data model and existing component interfaces
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';

// ==================== PROGRAM DETERMINATION ====================

/**
 * Program mapping based on course code prefixes
 */
const PROGRAM_MAPPING = {
  'ADM': 'Apparel Design & Manufacturing',
  'CFS': 'Child & Family Studies', 
  'NUTR': 'Nutrition',
  'ID': 'Interior Design'
};

/**
 * Determine faculty program based on course codes they teach
 */
export const determineFacultyProgram = (scheduleData, facultyName) => {
  if (!scheduleData || !facultyName || facultyName === 'Staff') {
    return null;
  }
  
  // Find all courses taught by this faculty member
  const facultyCourses = scheduleData.filter(schedule => {
    const instructorName = schedule.instructor ? 
      `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() :
      (schedule.instructorName || schedule.Instructor || '');
    
    return instructorName === facultyName;
  });
  
  // Extract course code prefixes
  const prefixes = new Set();
  facultyCourses.forEach(schedule => {
    const courseCode = schedule.courseCode || schedule.Course || '';
    const match = courseCode.match(/^([A-Z]{2,4})\s*\d/);
    if (match) {
      prefixes.add(match[1]);
    }
  });
  
  // Determine program based on prefixes
  // Since each faculty member should only teach in one program, 
  // we take the first valid program we find
  for (const prefix of prefixes) {
    if (PROGRAM_MAPPING[prefix]) {
      return {
        code: prefix,
        name: PROGRAM_MAPPING[prefix]
      };
    }
  }
  
  return null;
};

// ==================== DATA FETCHING ====================

/**
 * Fetch all people from the unified collection
 */
export const fetchPeople = async () => {
  try {
    const peopleSnapshot = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    return peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error fetching people:', error);
    return [];
  }
};

/**
 * Fetch all schedules with populated instructor data
 */
export const fetchSchedulesWithInstructors = async () => {
  try {
    const [schedulesSnapshot, peopleSnapshot] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.SCHEDULES)),
      getDocs(collection(db, COLLECTIONS.PEOPLE))
    ]);
    
    const schedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Create lookup map for people
    const peopleMap = new Map(people.map(person => [person.id, person]));
    
    // Populate schedules with instructor data
    return schedules.map(schedule => ({
      ...schedule,
      instructor: peopleMap.get(schedule.instructorId) || null
    }));
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return [];
  }
};

// ==================== COMPONENT ADAPTERS ====================

/**
 * Convert normalized people data to faculty format for components
 */
export const adaptPeopleToFaculty = (people, scheduleData = []) => {
  return people
    .filter(person => person.roles.includes('faculty'))
    .map(person => {
      const facultyName = `${person.firstName} ${person.lastName}`.trim();
      const program = determineFacultyProgram(scheduleData, facultyName);
      
      return {
        id: person.id,
        name: facultyName,
        firstName: person.firstName,
        lastName: person.lastName,
        title: person.title,
        email: person.email,
        phone: person.phone,
        jobTitle: person.jobTitle,
        office: person.office,
        isAdjunct: person.isAdjunct,
        isTenured: person.isTenured || false,
        isAlsoStaff: person.roles.includes('staff'),
        program: program,
        ...person // Include any additional fields
      };
    });
};

/**
 * Convert normalized people data to staff format for components
 */
export const adaptPeopleToStaff = (people) => {
  return people
    .filter(person => person.roles.includes('staff'))
    .map(person => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`.trim(),
      firstName: person.firstName,
      lastName: person.lastName,
      title: person.title,
      email: person.email,
      phone: person.phone,
      jobTitle: person.jobTitle,
      office: person.office,
      isFullTime: person.isFullTime,
      isTenured: person.roles.includes('faculty') ? (person.isTenured || false) : false, // Only display tenure for dual-role staff
      isAlsoFaculty: person.roles.includes('faculty'),
      ...person // Include any additional fields
    }));
};

// ==================== SEARCH AND FILTERING ====================

/**
 * Search people by name, email, or job title
 */
export const searchPeople = (people, searchTerm) => {
  if (!searchTerm) return people;
  
  const term = searchTerm.toLowerCase();
  return people.filter(person => 
    person.firstName.toLowerCase().includes(term) ||
    person.lastName.toLowerCase().includes(term) ||
    person.email.toLowerCase().includes(term) ||
    person.jobTitle.toLowerCase().includes(term) ||
    person.department.toLowerCase().includes(term)
  );
};

/**
 * Filter people by role
 */
export const filterPeopleByRole = (people, role) => {
  if (!role) return people;
  return people.filter(person => person.roles.includes(role));
};

/**
 * Get people with dual roles (both faculty and staff)
 */
export const getDualRolePeople = (people) => {
  return people.filter(person => 
    person.roles.includes('faculty') && person.roles.includes('staff')
  );
};

// ==================== ANALYTICS ADAPTERS ====================

/**
 * Generate analytics data from normalized schedules
 */
export const generateAnalyticsFromNormalizedData = (schedulesWithInstructors, people) => {
  const facultyWorkload = {};
  const roomUtilization = {};
  const dayStats = {};
  
  // Process schedules
  const processedSessions = new Set();
  
  for (const schedule of schedulesWithInstructors) {
    for (const pattern of schedule.meetingPatterns || []) {
      const sessionKey = `${schedule.instructorId}-${schedule.courseCode}-${pattern.day}-${pattern.startTime}-${pattern.endTime}`;
      
      if (!processedSessions.has(sessionKey)) {
        processedSessions.add(sessionKey);
        
        // Faculty workload
        if (schedule.instructorId && schedule.instructorName !== 'Staff') {
          if (!facultyWorkload[schedule.instructorName]) {
            facultyWorkload[schedule.instructorName] = { 
              courseSet: new Set(), 
              totalHours: 0 
            };
          }
          
          facultyWorkload[schedule.instructorName].courseSet.add(schedule.courseCode);
          
          // Calculate duration
          const duration = calculateDuration(pattern.startTime, pattern.endTime);
          facultyWorkload[schedule.instructorName].totalHours += duration;
        }
        
        // Room utilization
        if (schedule.roomName && schedule.roomName.toLowerCase() !== 'online') {
          if (!roomUtilization[schedule.roomName]) {
            roomUtilization[schedule.roomName] = { 
              classes: 0, 
              hours: 0, 
              staffTaughtClasses: 0 
            };
          }
          
          roomUtilization[schedule.roomName].classes++;
          
          const duration = calculateDuration(pattern.startTime, pattern.endTime);
          roomUtilization[schedule.roomName].hours += duration;
          
          if (schedule.instructorName === 'Staff') {
            roomUtilization[schedule.roomName].staffTaughtClasses++;
          }
        }
        
        // Day statistics
        if (pattern.day) {
          dayStats[pattern.day] = (dayStats[pattern.day] || 0) + 1;
        }
      }
    }
  }
  
  // Convert faculty workload to final format
  const finalFacultyWorkload = Object.fromEntries(
    Object.entries(facultyWorkload).map(([instructor, data]) => [
      instructor,
      { courses: data.courseSet.size, totalHours: data.totalHours }
    ])
  );
  
  // Calculate additional metrics
  const facultyPeople = people.filter(p => p.roles.includes('faculty'));
  const uniqueRooms = Object.keys(roomUtilization);
  const totalSessions = processedSessions.size;
  const staffTaughtSessions = schedulesWithInstructors.filter(s => s.instructorName === 'Staff').length;
  const uniqueCourses = [...new Set(schedulesWithInstructors.map(s => s.courseCode))].length;
  
  const busiestDay = Object.entries(dayStats).reduce(
    (max, [day, count]) => count > max.count ? { day, count } : max,
    { day: '', count: 0 }
  );
  
  return {
    facultyCount: facultyPeople.length,
    staffTaughtSessions,
    roomsInUse: uniqueRooms.length,
    totalSessions,
    uniqueCourses,
    busiestDay,
    facultyWorkload: finalFacultyWorkload,
    roomUtilization,
    uniqueRooms,
    uniqueInstructors: [...new Set(schedulesWithInstructors.map(s => s.instructorName))].filter(i => i !== 'Staff'),
  };
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Calculate duration between two time strings
 */
const calculateDuration = (startTime, endTime) => {
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');
    let hour, minute, ampm;
    
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      hour = parseInt(parts[0]);
      minute = parseInt(parts[1].replace(/[^\d]/g, ''));
      ampm = cleaned.includes('pm') ? 'pm' : 'am';
    } else {
      const match = cleaned.match(/(\d+)(am|pm)/);
      if (match) {
        hour = parseInt(match[1]);
        minute = 0;
        ampm = match[2];
      } else return null;
    }
    
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return hour * 60 + (minute || 0);
  };
  
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  
  if (start !== null && end !== null && end > start) {
    return (end - start) / 60; // Return hours
  }
  
  return 0;
};

/**
 * Get full name from person object
 */
export const getFullName = (person) => {
  if (!person) return '';
  
  const parts = [];
  if (person.title) parts.push(person.title);
  if (person.firstName) parts.push(person.firstName);
  if (person.lastName) parts.push(person.lastName);
  
  return parts.join(' ');
};

/**
 * Get display name for instructor (used in schedules)
 */
export const getInstructorDisplayName = (person) => {
  if (!person) return 'Staff';
  return `${person.firstName} ${person.lastName}`.trim() || 'Unknown';
};

// ==================== MIGRATION HELPERS ====================

/**
 * Check if system is using normalized data model
 */
export const isNormalizedDataAvailable = async () => {
  try {
    const peopleSnapshot = await getDocs(collection(db, COLLECTIONS.PEOPLE));
    return peopleSnapshot.docs.length > 0;
  } catch (error) {
    return false;
  }
};

export default {
  fetchPeople,
  fetchSchedulesWithInstructors,
  adaptPeopleToFaculty,
  adaptPeopleToStaff,
  searchPeople,
  filterPeopleByRole,
  getDualRolePeople,
  generateAnalyticsFromNormalizedData,
  getFullName,
  getInstructorDisplayName,
  isNormalizedDataAvailable,
  determineFacultyProgram
}; 