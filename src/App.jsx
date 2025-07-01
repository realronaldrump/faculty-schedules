import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import GroupMeetings from './components/scheduling/GroupMeetings.jsx';
import IndividualAvailability from './components/scheduling/IndividualAvailability';
import RoomSchedules from './components/scheduling/RoomSchedules';
import FacultySchedules from './components/FacultySchedules';
import FacultyDirectory from './components/FacultyDirectory';
import StaffDirectory from './components/StaffDirectory';
import AdjunctDirectory from './components/AdjunctDirectory';
import ProgramManagement from './components/ProgramManagement';
import DepartmentInsights from './components/analytics/DepartmentInsights.jsx';
import CourseManagement from './components/analytics/CourseManagement';
// Legacy import removed - using smart import only
import SmartDataImportPage from './components/SmartDataImportPage';
import SystemsPage from './components/SystemsPage';

import EmailLists from './components/EmailLists';
import BuildingDirectory from './components/BuildingDirectory';
import Login from './components/Login';
import Notification from './components/Notification';
import { Home, Calendar, Users, BarChart3, Settings, Bell, Search, User, ChevronDown } from 'lucide-react';
import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { adaptPeopleToFaculty, adaptPeopleToStaff } from './utils/dataAdapter';
import { fetchSchedulesWithRelationalData } from './utils/dataImportUtils';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Semester Selection State
  const [selectedSemester, setSelectedSemester] = useState('Fall 2025');
  const [availableSemesters, setAvailableSemesters] = useState(['Fall 2025']);
  const [showSemesterDropdown, setShowSemesterDropdown] = useState(false);
  
  // Raw data from Firebase
  const [rawScheduleData, setRawScheduleData] = useState([]);
  const [rawPeople, setRawPeople] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Notification state
  const [notification, setNotification] = useState({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Notification helper functions
  const showNotification = (type, title, message) => {
    setNotification({
      show: true,
      type,
      title,
      message
    });
  };

  const hideNotification = () => {
    setNotification(prev => ({ ...prev, show: false }));
  };

  // Extract available semesters from schedule data
  const updateAvailableSemesters = (scheduleData) => {
    const semesters = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.term && schedule.term.trim()) {
        semesters.add(schedule.term.trim());
      }
    });
    
    const semesterList = Array.from(semesters).sort((a, b) => {
      // Custom sort to put most recent semester first
      // Assumes format like "Fall 2025", "Spring 2026", etc.
      const [aTermType, aYear] = a.split(' ');
      const [bTermType, bYear] = b.split(' ');
      
      if (aYear !== bYear) {
        return parseInt(bYear) - parseInt(aYear); // Newer years first
      }
      
      // For same year, order: Fall > Summer > Spring
      const termOrder = { 'Fall': 3, 'Summer': 2, 'Spring': 1 };
      return (termOrder[bTermType] || 0) - (termOrder[aTermType] || 0);
    });
    
    setAvailableSemesters(semesterList.length > 0 ? semesterList : ['Fall 2025']);
    
    // Auto-select the first (most recent) semester if current selection isn't available
    if (semesterList.length > 0 && !semesterList.includes(selectedSemester)) {
      setSelectedSemester(semesterList[0]);
    }
  };

  // Filter schedule data by selected semester
  const semesterFilteredScheduleData = useMemo(() => {
    return rawScheduleData.filter(schedule => 
      schedule.term === selectedSemester || 
      (!schedule.term && selectedSemester === 'Fall 2025') // Fallback for legacy data
    );
  }, [rawScheduleData, selectedSemester]);

  // Navigation structure
  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      path: 'dashboard'
    },
    {
      id: 'scheduling',
      label: 'Scheduling',
      icon: Calendar,
      children: [
        { id: 'faculty-schedules', label: 'Faculty Schedules', path: 'scheduling/faculty-schedules' },
        { id: 'group-meetings', label: 'Group Meetings', path: 'scheduling/group-meetings' },
        { id: 'individual-availability', label: 'Individual Availability', path: 'scheduling/individual-availability' },
        { id: 'room-schedules', label: 'Room Schedules', path: 'scheduling/room-schedules' }
      ]
    },
    {
      id: 'directory',
      label: 'Directory',
      icon: Users,
      children: [
        { id: 'department-management', label: 'Program Management', path: 'directory/department-management' },
        { id: 'building-directory', label: 'Building Directory', path: 'directory/building-directory' },
        { id: 'faculty-directory', label: 'Faculty Directory', path: 'directory/faculty-directory' },
        { id: 'adjunct-directory', label: 'Adjunct Directory', path: 'directory/adjunct-directory' },
        { id: 'staff-directory', label: 'Staff Directory', path: 'directory/staff-directory' },
        { id: 'email-lists', label: 'Email Lists', path: 'directory/email-lists' }
      ]
    },
    {
      id: 'analytics',
      label: 'Data & Analytics',
      icon: BarChart3,
      children: [
        { id: 'department-insights', label: 'Department Insights', path: 'analytics/department-insights' },
        { id: 'course-management', label: 'Course Management', path: 'analytics/course-management' }
      ]
    },
    {
      id: 'administration',
      label: 'Administration',
      icon: Settings,
      children: [
        { id: 'smart-import', label: 'Data Import', path: 'administration/smart-import' },
        { id: 'baylor-systems', label: 'Baylor Systems', path: 'administration/baylor-systems' }
      ]
    }
  ];

  // Adapt relational data to flat structure for component compatibility
  const scheduleData = useMemo(() => {
    if (!semesterFilteredScheduleData || semesterFilteredScheduleData.length === 0) return [];
    
    // Convert normalized relational data to flat structure
    const flattenedData = [];
    
    semesterFilteredScheduleData.forEach(schedule => {
      // Skip invalid schedules
      if (!schedule || !schedule.id) {
        console.warn('⚠️ Skipping invalid schedule:', schedule);
        return;
      }
      
      // Handle meeting patterns - create one row per meeting pattern
      if (schedule.meetingPatterns && Array.isArray(schedule.meetingPatterns) && schedule.meetingPatterns.length > 0) {
        schedule.meetingPatterns.forEach((pattern, index) => {
          if (!pattern) return; // Skip null patterns
          
          flattenedData.push({
            id: `${schedule.id}-${index}`, // Truly unique ID using array index
            originalId: schedule.id, // Keep reference to original schedule
            
            // Legacy field names for component compatibility
            Course: schedule.courseCode || '',
            'Course Title': schedule.courseTitle || '',
            Instructor: schedule.instructor ? 
              `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() :
              (schedule.instructorName || 'Staff'),
            Day: pattern.day || '',
            'Start Time': pattern.startTime || '',
            'End Time': pattern.endTime || '',
            Room: schedule.room ? (schedule.room.displayName || schedule.room.name) : (schedule.roomName || ''),
            Term: schedule.term || '',
            Credits: schedule.credits || '',
            Section: schedule.section || '',
            
            // Keep relational data available
            instructor: schedule.instructor,
            room: schedule.room,
            instructorId: schedule.instructorId,
            roomId: schedule.roomId,
            courseCode: schedule.courseCode,
            courseTitle: schedule.courseTitle,
            instructorName: schedule.instructorName,
            roomName: schedule.roomName,
            meetingPatterns: schedule.meetingPatterns
          });
        });
      } else {
        // Handle schedules without meeting patterns (legacy or incomplete data)
        // console.log(`⚠️ Schedule ${schedule.id} has no meeting patterns, using fallback structure`);
        flattenedData.push({
          id: schedule.id,
          originalId: schedule.id,
          
          // Legacy field names with comprehensive fallbacks
          Course: schedule.courseCode || schedule.Course || '',
          'Course Title': schedule.courseTitle || schedule['Course Title'] || '',
          Instructor: schedule.instructor ? 
            `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() :
            (schedule.instructorName || schedule.Instructor || 'Staff'),
          Day: schedule.Day || '',
          'Start Time': schedule['Start Time'] || '',
          'End Time': schedule['End Time'] || '',
          Room: schedule.room ? (schedule.room.displayName || schedule.room.name) : (schedule.roomName || schedule.Room || ''),
          Term: schedule.term || schedule.Term || '',
          Credits: schedule.credits || schedule.Credits || '',
          Section: schedule.section || schedule.Section || '',
          
          // Keep relational data
          instructor: schedule.instructor,
          room: schedule.room,
          instructorId: schedule.instructorId,
          roomId: schedule.roomId,
          courseCode: schedule.courseCode,
          courseTitle: schedule.courseTitle,
          instructorName: schedule.instructorName,
          roomName: schedule.roomName,
          meetingPatterns: schedule.meetingPatterns
        });
      }
    });
    
    console.log(`📊 Converted ${semesterFilteredScheduleData.length} schedules to ${flattenedData.length} flattened records`);
    
    // Debug: Show sample flattened record
    if (flattenedData.length > 0) {
      console.log('📊 Sample flattened record:', flattenedData[0]);
    }
    
    return flattenedData;
  }, [semesterFilteredScheduleData]);

  // Directory data from normalized people collection
  const { facultyDirectoryData, staffDirectoryData } = useMemo(() => {
    const facultyDir = adaptPeopleToFaculty(rawPeople, scheduleData);
    const staffDir = adaptPeopleToStaff(rawPeople);
    
    return { 
      facultyDirectoryData: facultyDir, 
      staffDirectoryData: staffDir 
    };
  }, [rawPeople, scheduleData]);

  // Centralized Analytics Calculation
  const departmentAnalytics = useMemo(() => {
    if (scheduleData.length === 0) return null;

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
            if (match) { hour = parseInt(match[1]); minute = 0; ampm = match[2]; } else return null;
        }
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        return hour * 60 + (minute || 0);
    };

    const uniqueRoomsList = [...new Set(scheduleData.map(item => (item.roomName || item.Room || '').trim()).filter(Boolean))].filter(room => room.toLowerCase() !== 'online').sort();
    const roomsInUse = uniqueRoomsList.length;

    // Get unique instructors - prefer relational data
    const allInstructors = [...new Set(scheduleData.map(item => {
      if (item.instructor) {
        // Use relational instructor data
        return `${item.instructor.firstName || ''} ${item.instructor.lastName || ''}`.trim();
      } else {
        // Fallback for backward compatibility
        return item.instructorName || item.Instructor || '';
      }
    }).filter(Boolean))];
    // Count non-adjunct faculty (regular faculty members)
    const facultyCount = allInstructors.filter(i => {
      if (!i) return false;
      const faculty = facultyDirectoryData.find(f => 
        `${f.firstName} ${f.lastName}`.trim() === i
      );
      return !faculty?.isAdjunct; // Count only non-adjunct faculty
    }).length;

    const facultyWorkload = {};
    const roomUtilization = {};
            uniqueRoomsList.forEach(room => { roomUtilization[room] = { classes: 0, hours: 0, adjunctTaughtClasses: 0 }; });

    const processedSessions = new Set();
    const dayStats = {};
    
    scheduleData.forEach(item => {
        // Extract instructor name from relational data
        const instructorName = item.instructor ? 
          `${item.instructor.firstName || ''} ${item.instructor.lastName || ''}`.trim() :
          (item.instructorName || item.Instructor || '');
        const course = item.courseCode || item.Course || '';
        const room = item.room ? item.room.displayName : (item.roomName || item.Room || '');
        
        // For normalized data, we need to extract times from meeting patterns
        let startTime = '';
        let endTime = '';
        let day = '';
        
        if (item.meetingPatterns && item.meetingPatterns.length > 0) {
            // Use first meeting pattern for analytics
            const firstPattern = item.meetingPatterns[0];
            startTime = firstPattern.startTime || '';
            endTime = firstPattern.endTime || '';
            day = firstPattern.day || '';
        } else {
            // Fallback for direct time fields
            startTime = item['Start Time'] || '';
            endTime = item['End Time'] || '';
            day = item.Day || '';
        }
        
        // Check if instructor is adjunct faculty
        const faculty = facultyDirectoryData.find(f => 
            `${f.firstName} ${f.lastName}`.trim() === instructorName
        );
        const isAdjunctInstructor = faculty?.isAdjunct || false;
        
        const start = parseTime(startTime);
        const end = parseTime(endTime);
        const duration = (start !== null && end !== null) ? (end - start) / 60 : 0;
        
        if (room && roomUtilization[room]) {
            roomUtilization[room].classes++;
            roomUtilization[room].hours += duration;
            if (isAdjunctInstructor) roomUtilization[room].adjunctTaughtClasses++;
        }

        const sessionKey = `${instructorName}-${course}-${day}-${startTime}-${endTime}`;
        if (!processedSessions.has(sessionKey)) {
            processedSessions.add(sessionKey);

            if (day) {
                dayStats[day] = (dayStats[day] || 0) + 1;
            }

            if (instructorName && !isAdjunctInstructor) {
                if (!facultyWorkload[instructorName]) {
                    facultyWorkload[instructorName] = { courseSet: new Set(), totalHours: 0 };
                }
                if (course) {
                    facultyWorkload[instructorName].courseSet.add(course);
                }
                facultyWorkload[instructorName].totalHours += duration;
            }
        }
    });

    const finalFacultyWorkload = Object.fromEntries(
        Object.entries(facultyWorkload).map(([instructor, data]) => [
            instructor,
            { courses: data.courseSet.size, totalHours: data.totalHours }
        ])
    );
    
    const totalSessions = processedSessions.size;
    const adjunctTaughtSessions = scheduleData.filter(s => {
      const instructorName = s.instructor ? 
        `${s.instructor.firstName || ''} ${s.instructor.lastName || ''}`.trim() :
        (s.instructorName || s.Instructor || '');
      
      // Find if this instructor is marked as adjunct faculty
      const faculty = facultyDirectoryData.find(f => 
        `${f.firstName} ${f.lastName}`.trim() === instructorName
      );
      return faculty?.isAdjunct;
    }).length;

    const busiestDay = Object.entries(dayStats).reduce((max, [day, count]) => 
        count > max.count ? { day, count } : max, { day: '', count: 0 });

    const uniqueCourses = [...new Set(scheduleData.map(item => item.courseCode || item.Course || '').filter(Boolean))].length;

    return {
      facultyCount,
      adjunctTaughtSessions,
      roomsInUse,
      totalSessions,
      uniqueCourses,
      busiestDay,
      facultyWorkload: finalFacultyWorkload,
      roomUtilization,
      uniqueRooms: uniqueRoomsList,
      uniqueInstructors: allInstructors,
    };
}, [scheduleData, facultyDirectoryData]);

  // Close semester dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSemesterDropdown && !event.target.closest('.semester-dropdown-container')) {
        setShowSemesterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSemesterDropdown]);

  // Load normalized relational data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        console.log('📊 Loading normalized relational data...');
        const [relationalData, historySnapshot] = await Promise.all([
          fetchSchedulesWithRelationalData(),
          getDocs(query(collection(db, 'history'), orderBy('timestamp', 'desc')))
        ]);

        const history = historySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

        setRawScheduleData(relationalData.schedules); // Schedules with populated instructor/room data
        setRawPeople(relationalData.people);
        setEditHistory(history);
        
        // Update available semesters based on loaded schedule data
        updateAvailableSemesters(relationalData.schedules);
        
        console.log(`✅ Loaded ${relationalData.schedules.length} schedules with relational data`);
        console.log(`📋 People linked: ${relationalData.schedules.filter(s => s.instructor).length} schedules have instructor data`);
        console.log(`🏛️ Rooms linked: ${relationalData.schedules.filter(s => s.room).length} schedules have room data`);
        
        // Debug: Show sample schedule structure
        if (relationalData.schedules.length > 0) {
          console.log('📋 Sample schedule structure:', relationalData.schedules[0]);
        }

      } catch (error) {
        console.error("Firestore Read/Write Error:", error);
        alert("Could not load data from the database. This is likely a Firestore security rule issue.");
      }
      setLoading(false);
    };

    if (isAuthenticated) {
      loadData();
    } else {
      setRawScheduleData([]);
      setRawPeople([]);
      setEditHistory([]);
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Check auth status on load
  useEffect(() => {
    const checkAuthStatus = () => {
      setLoading(true);
      const auth = localStorage.getItem('isAuthenticated');
      if (auth === 'true') {
        setIsAuthenticated(true);
      } else {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  // Data update handlers - ENHANCED for relational structure
  const handleDataUpdate = async (updatedRow) => {
    console.log('🔧 Starting data update for row:', updatedRow);
    
    // Find the original schedule record using originalId for flattened data
    const scheduleId = updatedRow.originalId || updatedRow.id;
    const originalSchedule = rawScheduleData.find(r => r.id === scheduleId);
    
    if (!originalSchedule) {
      console.error('❌ Could not find original schedule for update:', scheduleId);
      alert('Could not find the original schedule record. Please refresh the page.');
      return;
    }
    
    console.log('📋 Found original schedule:', originalSchedule);

    // Convert flat update back to normalized structure
    const normalizedUpdate = {
      ...originalSchedule,
      courseCode: updatedRow.Course || originalSchedule.courseCode,
      courseTitle: updatedRow['Course Title'] || originalSchedule.courseTitle,
      instructorName: updatedRow.Instructor || originalSchedule.instructorName,
      roomName: updatedRow.Room || originalSchedule.roomName,
      term: updatedRow.Term || originalSchedule.term,
      credits: updatedRow.Credits || originalSchedule.credits,
      section: updatedRow.Section || originalSchedule.section,
      updatedAt: new Date().toISOString()
    };

    // Handle meeting pattern updates
    if (originalSchedule.meetingPatterns && originalSchedule.meetingPatterns.length > 0) {
      // Update the specific meeting pattern if this is a flattened row
      const patternIndex = originalSchedule.meetingPatterns.findIndex(p => 
        p.day === updatedRow.Day && p.startTime === updatedRow['Start Time']
      );
      
      if (patternIndex >= 0) {
        normalizedUpdate.meetingPatterns = [...originalSchedule.meetingPatterns];
        normalizedUpdate.meetingPatterns[patternIndex] = {
          ...normalizedUpdate.meetingPatterns[patternIndex],
          day: updatedRow.Day,
          startTime: updatedRow['Start Time'],
          endTime: updatedRow['End Time']
        };
      }
    }
    
    // Track changes for history (use flattened format for display)
    const flatOriginal = scheduleData.find(s => s.id === updatedRow.id);
    const changes = Object.keys(updatedRow).reduce((acc, key) => {
        if (key !== 'id' && key !== 'originalId' && flatOriginal && flatOriginal[key] !== updatedRow[key]) {
            acc.push({
                rowId: scheduleId,
                instructor: updatedRow.Instructor,
                course: updatedRow.Course,
                field: key,
                oldValue: flatOriginal[key],
                newValue: updatedRow[key],
                timestamp: new Date().toISOString(),
            });
        }
        return acc;
    }, []);

    if (changes.length > 0) {
      try {
        // Update the normalized schedule in the database
        await updateDoc(doc(db, 'schedules', scheduleId), normalizedUpdate);
        
        // Log changes to history
        for (const change of changes) {
            await addDoc(collection(db, 'history'), change);
        }
        
        // Update the raw schedule data
        setRawScheduleData(rawScheduleData.map(row => 
          row.id === scheduleId ? normalizedUpdate : row
        ));
        setEditHistory(prev => [...changes, ...prev]);
        
        console.log('✅ Schedule updated successfully');
      } catch (error) {
        console.error("Error updating document: ", error);
        alert("Failed to update schedule. Please try again.");
      }
    }
  };

  const handleFacultyUpdate = async (facultyToUpdate) => {
    try {
        // Get existing person data to preserve existing roles
        const existingPerson = facultyToUpdate.id ? rawPeople.find(p => p.id === facultyToUpdate.id) : null;
        
        // Build roles array properly
        let roles = ['faculty']; // Faculty is always included when updating from faculty directory
        if (facultyToUpdate.isAlsoStaff) {
            if (!roles.includes('staff')) {
                roles.push('staff');
            }
        } else if (existingPerson?.roles?.includes('staff')) {
            // If they were previously marked as staff but isAlsoStaff is now false, remove staff role
            roles = roles.filter(role => role !== 'staff');
        }

        // Convert faculty data to people format
        const personData = {
            firstName: facultyToUpdate.firstName || facultyToUpdate.name?.split(' ')[0] || '',
            lastName: facultyToUpdate.lastName || facultyToUpdate.name?.split(' ').slice(1).join(' ') || '',
            title: facultyToUpdate.title || '',
            email: facultyToUpdate.email || '',
            phone: facultyToUpdate.phone || '',
            jobTitle: facultyToUpdate.jobTitle || '',
            office: facultyToUpdate.office || '',
            department: facultyToUpdate.department || '', // Add department field
            programOverride: facultyToUpdate.programOverride || '', // Add program override field
            updProgram: facultyToUpdate.updProgram || '', // Add UPD program field
            roles: roles,
            isAdjunct: facultyToUpdate.isAdjunct || false,
            isFullTime: !facultyToUpdate.isAdjunct,
            isTenured: roles.includes('faculty') ? (facultyToUpdate.isTenured || false) : false, // Only faculty can be tenured
            isUPD: roles.includes('faculty') ? (facultyToUpdate.isUPD || false) : false, // Add UPD field
            hasNoPhone: facultyToUpdate.hasNoPhone || false,
            hasNoOffice: facultyToUpdate.hasNoOffice || false,
            updatedAt: new Date().toISOString()
        };

        console.log('🔧 Updating faculty with roles:', roles);
        console.log('📋 Person data being saved:', personData);

        if (facultyToUpdate.id) {
            const docRef = doc(db, 'people', facultyToUpdate.id);
            await updateDoc(docRef, personData);
            const updatedPerson = { ...personData, id: facultyToUpdate.id };
            setRawPeople(rawPeople.map(p => p.id === facultyToUpdate.id ? updatedPerson : p));
            console.log('✅ Faculty updated in state:', updatedPerson);
        } else {
            const docRef = await addDoc(collection(db, 'people'), { ...personData, createdAt: new Date().toISOString() });
            const newPerson = { ...personData, id: docRef.id };
            setRawPeople([...rawPeople, newPerson]);
            console.log('✅ New faculty created:', newPerson);
        }
    } catch (error) {
        console.error("Error updating/creating faculty", error);
        throw error; // Re-throw so the calling component can handle it
    }
  };

  const handleStaffUpdate = async (staffToUpdate) => {
      try {
          // Get existing person data to preserve existing roles
          const existingPerson = staffToUpdate.id ? rawPeople.find(p => p.id === staffToUpdate.id) : null;
          
          // Build roles array properly
          let roles = ['staff']; // Staff is always included when updating from staff directory
          if (staffToUpdate.isAlsoFaculty) {
              if (!roles.includes('faculty')) {
                  roles.push('faculty');
              }
          } else if (existingPerson?.roles?.includes('faculty')) {
              // If they were previously marked as faculty but isAlsoFaculty is now false, remove faculty role
              roles = roles.filter(role => role !== 'faculty');
          }

          // Convert staff data to people format
          const personData = {
              firstName: staffToUpdate.firstName || staffToUpdate.name?.split(' ')[0] || '',
              lastName: staffToUpdate.lastName || staffToUpdate.name?.split(' ').slice(1).join(' ') || '',
              title: staffToUpdate.title || '',
              email: staffToUpdate.email || '',
              phone: staffToUpdate.phone || '',
              jobTitle: staffToUpdate.jobTitle || '',
              office: staffToUpdate.office || '',
              department: staffToUpdate.department || '', // Add department field
              roles: roles,
              isFullTime: staffToUpdate.isFullTime !== false,
              isTenured: roles.includes('faculty') ? (staffToUpdate.isTenured || false) : false, // Only faculty can be tenured
              isUPD: roles.includes('faculty') ? (staffToUpdate.isUPD || false) : false, // Add UPD field
              hasNoPhone: staffToUpdate.hasNoPhone || false,
              hasNoOffice: staffToUpdate.hasNoOffice || false,
              updatedAt: new Date().toISOString()
          };

          console.log('🔧 Updating staff with roles:', roles);
          console.log('📋 Person data being saved:', personData);

          if (staffToUpdate.id) {
              const docRef = doc(db, 'people', staffToUpdate.id);
              await updateDoc(docRef, personData);
              const updatedPerson = { ...personData, id: staffToUpdate.id };
              setRawPeople(rawPeople.map(p => p.id === staffToUpdate.id ? updatedPerson : p));
              console.log('✅ Staff updated in state:', updatedPerson);
          } else {
              const docRef = await addDoc(collection(db, 'people'), { ...personData, createdAt: new Date().toISOString() });
              const newPerson = { ...personData, id: docRef.id };
              setRawPeople([...rawPeople, newPerson]);
              console.log('✅ New staff created:', newPerson);
          }
      } catch (error) {
          console.error("Error updating/creating staff member: ", error);
      }
  };

  const handleFacultyDelete = async (facultyToDelete) => {
    try {
        // Delete from people collection
        await deleteDoc(doc(db, 'people', facultyToDelete.id));
        setRawPeople(rawPeople.filter(p => p.id !== facultyToDelete.id));
        
        showNotification(
          'success', 
          'Faculty Deleted',
          `${facultyToDelete.name} has been successfully removed from the directory.`
        );
    } catch (error) {
        console.error("Error deleting faculty", error);
        showNotification(
          'error',
          'Delete Failed',
          'Failed to delete faculty member. Please try again.'
        );
        throw error;
    }
  };

  const handleStaffDelete = async (staffToDelete) => {
      try {
          // Delete from people collection
          await deleteDoc(doc(db, 'people', staffToDelete.id));
          setRawPeople(rawPeople.filter(p => p.id !== staffToDelete.id));
          
          showNotification(
            'success',
            'Staff Deleted',
            `${staffToDelete.name} has been successfully removed from the directory.`
          );
      } catch (error) {
          console.error("Error deleting staff member: ", error);
          showNotification(
            'error',
            'Delete Failed',
            'Failed to delete staff member. Please try again.'
          );
          throw error;
      }
  };

  const handleRevertChange = async (changeToRevert) => {
    const targetRow = rawScheduleData.find(row => row.id === changeToRevert.rowId);
    if (targetRow) {
      try {
        const revertData = { [changeToRevert.field]: changeToRevert.oldValue };
        
        await updateDoc(doc(db, 'schedules', changeToRevert.rowId), revertData);
        
        const revertHistoryLog = {
            rowId: changeToRevert.rowId,
            instructor: targetRow.Instructor,
            course: targetRow.Course,
            field: changeToRevert.field,
            oldValue: changeToRevert.newValue,
            newValue: changeToRevert.oldValue,
            timestamp: new Date().toISOString(),
            isRevert: true,
        };
        await addDoc(collection(db, 'history'), revertHistoryLog);
        
        const updatedRow = { ...targetRow, ...revertData };
        setRawScheduleData(rawScheduleData.map(row => (row.id === updatedRow.id ? updatedRow : row)));
        setEditHistory([revertHistoryLog, ...editHistory]);
      } catch (error) {
        console.error("Error reverting document: ", error);
      }
    }
  };

  const handleLogin = (status) => {
    localStorage.setItem('isAuthenticated', status ? 'true' : 'false');
    if (!status) localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(status);
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = () => {
    handleLogin(false);
    setShowLogoutConfirm(false);
    setCurrentPage('dashboard');
  };

  // Get current page breadcrumb
  const getCurrentBreadcrumb = () => {
    const pathParts = currentPage.split('/');
    let breadcrumbs = [];
    if (currentPage === 'dashboard') return ['Dashboard'];
    
    const section = navigationItems.find(item => item.id === pathParts[0]);
    if (section) {
        breadcrumbs.push(section.label);
        if (pathParts.length > 1 && section.children) {
            const subsection = section.children.find(child => child.path.endsWith(pathParts[1]));
            if (subsection) breadcrumbs.push(subsection.label);
        }
    }
    return ['Dashboard', ...breadcrumbs];
  };

  // Render the appropriate page component
  const renderPageContent = () => {
    const commonProps = {
      scheduleData,
      facultyData: facultyDirectoryData,
      editHistory,
      onDataUpdate: handleDataUpdate,
      onRevertChange: handleRevertChange,
      loading,
      onNavigate: setCurrentPage,
      analytics: departmentAnalytics,
      showNotification,
      selectedSemester,
      availableSemesters
    };

    switch(currentPage) {
      case 'dashboard':
        return <Dashboard {...commonProps} />;
      case 'scheduling/faculty-schedules':
        return <FacultySchedules {...commonProps} />;
      case 'scheduling/group-meetings':
        return <GroupMeetings {...commonProps} />;
      case 'scheduling/individual-availability':
        return <IndividualAvailability {...commonProps} />;
      case 'scheduling/room-schedules':
        return <RoomSchedules {...commonProps} />;
      case 'directory/department-management':
        return <ProgramManagement
          directoryData={facultyDirectoryData}
          onFacultyUpdate={handleFacultyUpdate}
          onStaffUpdate={handleStaffUpdate}
          showNotification={showNotification}
        />;
      case 'directory/building-directory':
        return <BuildingDirectory
          directoryData={facultyDirectoryData}
          staffData={staffDirectoryData}
          showNotification={showNotification}
        />;
      case 'directory/faculty-directory':
        return <FacultyDirectory
          directoryData={facultyDirectoryData}
          scheduleData={scheduleData}
          onFacultyUpdate={handleFacultyUpdate}
          onStaffUpdate={handleStaffUpdate}
          onFacultyDelete={handleFacultyDelete}
        />;
      case 'directory/adjunct-directory':
        return <AdjunctDirectory
          directoryData={facultyDirectoryData}
          scheduleData={scheduleData}
          onFacultyUpdate={handleFacultyUpdate}
          onStaffUpdate={handleStaffUpdate}
          onFacultyDelete={handleFacultyDelete}
        />;
      case 'directory/staff-directory':
        return <StaffDirectory
          directoryData={staffDirectoryData}
          onFacultyUpdate={handleFacultyUpdate}
          onStaffUpdate={handleStaffUpdate}
          onStaffDelete={handleStaffDelete}
        />;
      case 'directory/email-lists':
        return <EmailLists
          facultyData={facultyDirectoryData}
          staffData={staffDirectoryData}
          scheduleData={scheduleData}
        />;
      case 'analytics/department-insights':
        return <DepartmentInsights {...commonProps} />;
      case 'analytics/course-management':
        return <CourseManagement {...commonProps} />;
      case 'administration/smart-import':
        return <SmartDataImportPage 
          onNavigate={setCurrentPage} 
          showNotification={showNotification}
          selectedSemester={selectedSemester}
          availableSemesters={availableSemesters}
          onSemesterDataImported={() => {
            // Refresh data after import to update available semesters
            const loadData = async () => {
              try {
                const relationalData = await fetchSchedulesWithRelationalData();
                setRawScheduleData(relationalData.schedules);
                setRawPeople(relationalData.people);
                updateAvailableSemesters(relationalData.schedules);
              } catch (error) {
                console.error('Error refreshing data after import:', error);
              }
            };
            loadData();
          }}
        />;
      case 'administration/baylor-systems':
        return <SystemsPage onNavigate={setCurrentPage} />;
      default:
        return <Dashboard {...commonProps} />;
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex bg-gray-50">
      <Sidebar 
        navigationItems={navigationItems}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        selectedSemester={selectedSemester}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              {getCurrentBreadcrumb().map((crumb, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span>/</span>}
                  <span className={index === getCurrentBreadcrumb().length - 1 ? 'text-baylor-green font-medium' : 'hover:text-baylor-green cursor-pointer'}>
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>
            
            {/* Semester Selector */}
            <div className="flex items-center space-x-4">
              <div className="relative semester-dropdown-container">
                <button
                  onClick={() => setShowSemesterDropdown(!showSemesterDropdown)}
                  className="flex items-center space-x-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors font-medium"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{selectedSemester}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showSemesterDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {showSemesterDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    <div className="py-2">
                      <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-100">
                        Available Semesters
                      </div>
                      {availableSemesters.map((semester) => (
                        <button
                          key={semester}
                          onClick={() => {
                            setSelectedSemester(semester);
                            setShowSemesterDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                            semester === selectedSemester 
                              ? 'bg-baylor-green/10 text-baylor-green font-medium' 
                              : 'text-gray-700'
                          }`}
                        >
                          {semester}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-gray-50 text-sm w-64"
                />
              </div>
              <button className="p-2 text-gray-600 hover:text-baylor-green hover:bg-gray-100 rounded-lg transition-colors">
                <Bell size={20} />
              </button>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">Davis Deaton</div>
                  <div className="text-xs text-gray-500">Human Sciences & Design</div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-600 hover:text-baylor-green hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <User size={20} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-baylor-green mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              </div>
            ) : (
              renderPageContent()
            )}
          </div>
        </main>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Logout</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to logout?</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Notification System */}
      <Notification
        type={notification.type}
        title={notification.title}
        message={notification.message}
        show={notification.show}
        onClose={hideNotification}
      />
    </div>
  );
}

export default App;