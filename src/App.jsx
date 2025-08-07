import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import GroupMeetings from './components/scheduling/GroupMeetings.jsx';
import IndividualAvailability from './components/scheduling/IndividualAvailability';
import RoomSchedules from './components/scheduling/RoomSchedules';
import FacultySchedules from './components/FacultySchedules';
import PeopleDirectory from './components/PeopleDirectory';
import ProgramManagement from './components/ProgramManagement';
import DepartmentInsights from './components/analytics/DepartmentInsights.jsx';
import CourseManagement from './components/analytics/CourseManagement';
// Legacy import removed - using smart import only
import SmartDataImportPage from './components/SmartDataImportPage';
import SystemsPage from './components/SystemsPage';
import DataHygieneManager from './components/DataHygieneManager';
import BaylorAcronyms from './pages/BaylorAcronyms';
import BaylorIDManagement from './components/BaylorIDManagement';
import RecentChangesPage from './components/RecentChangesPage';

import EmailLists from './components/EmailLists';
import BuildingDirectory from './components/BuildingDirectory';
import Login from './components/Login';
import Notification from './components/Notification';
import { 
  Home, 
  Calendar, 
  Users, 
  BarChart3, 
  Settings, 
  Bell, 
  Search, 
  User, 
  ChevronDown,
  GraduationCap,
  Menu,
  LogOut,
  Star
} from 'lucide-react';
import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, setDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { adaptPeopleToFaculty, adaptPeopleToStaff, fetchPrograms } from './utils/dataAdapter';
import { fetchSchedulesWithRelationalData } from './utils/dataImportUtils';
import { autoMigrateIfNeeded } from './utils/importTransactionMigration';
import MaintenancePage from './components/MaintenancePage';
import { parseCourseCode } from './utils/courseUtils';
import { logCreate, logUpdate, logDelete } from './utils/changeLogger';
import { fetchRecentChanges } from './utils/recentChanges';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const currentPage = useMemo(() => {
    const path = (location.pathname || '/').replace(/^\//, '');
    return path === '' ? 'dashboard' : path;
  }, [location.pathname]);
  const handleNavigate = (path) => {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (normalized !== location.pathname) {
      navigate(normalized);
    }
  };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Pinned pages state
  const [pinnedPages, setPinnedPages] = useState(() => {
    try {
      const savedPins = localStorage.getItem('pinnedPages');
      return savedPins ? JSON.parse(savedPins) : [];
    } catch (error) {
      console.error("Failed to parse pinned pages from localStorage", error);
      return [];
    }
  });
  
  // Semester Selection State with localStorage persistence
  const [selectedSemester, setSelectedSemester] = useState(() => {
    return localStorage.getItem('selectedSemester') || 'Fall 2025';
  });
  const [availableSemesters, setAvailableSemesters] = useState(['Fall 2025']);
  const [showSemesterDropdown, setShowSemesterDropdown] = useState(false);
  
  // Raw data from Firebase
  const [rawScheduleData, setRawScheduleData] = useState([]);
  const [rawPeople, setRawPeople] = useState([]);
  const [rawPrograms, setRawPrograms] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [recentChanges, setRecentChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Notification state
  const [notification, setNotification] = useState({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  // -------------------- Maintenance mode --------------------
  // Set this to true to enable maintenance mode
  const MAINTENANCE_MODE = false;
  const MAINTENANCE_MESSAGE = "I accidentally broke my dashboard, but it will be fixed soon (hopefully!!)";
  const MAINTENANCE_UNTIL = "2025-07-03T08:00:00"; // Set your expected completion time here

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

  // Persist pinned pages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pinnedPages', JSON.stringify(pinnedPages));
    } catch (error) {
      console.error("Failed to save pinned pages to localStorage", error);
    }
  }, [pinnedPages]);

  // Persist selected semester to localStorage
  useEffect(() => {
    localStorage.setItem('selectedSemester', selectedSemester);
  }, [selectedSemester]);

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
    
    console.log('🎓 Available semesters updated:', semesterList);
    
    const previousSemesters = availableSemesters;
    setAvailableSemesters(semesterList.length > 0 ? semesterList : ['Fall 2025']);
    
    // Only auto-select if current selection isn't available
    if (semesterList.length > 0 && !semesterList.includes(selectedSemester)) {
      console.log(`🎓 Auto-selecting most recent semester: ${semesterList[0]}`);
      setSelectedSemester(semesterList[0]);
      return; // Exit early to avoid double-selection
    }
    
    // If we have new semesters that weren't in the previous list, auto-select the newest one
    const newSemesters = semesterList.filter(semester => !previousSemesters.includes(semester));
    if (newSemesters.length > 0 && previousSemesters.length > 0) { // Only if we already had semesters
      const newestSemester = newSemesters[0]; // Already sorted, so first is newest
      console.log(`🎓 Auto-selecting newly imported semester: ${newestSemester}`);
      setSelectedSemester(newestSemester);
    }
  };

  const togglePinPage = (pageId) => {
    setPinnedPages(prev => 
      prev.includes(pageId) 
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId]
    );
  };

  // Filter schedule data by selected semester (removed problematic fallback)
  const semesterFilteredScheduleData = useMemo(() => {
    return rawScheduleData.filter(schedule => 
      schedule.term === selectedSemester
    );
  }, [rawScheduleData, selectedSemester]);

  // Professional Navigation structure with enhanced organization
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
        { id: 'building-directory', label: 'Office Directory', path: 'directory/building-directory' },
        { id: 'people-directory', label: 'People Directory', path: 'directory/people-directory' },
        { id: 'email-lists', label: 'Email Lists', path: 'directory/email-lists' },
        { id: 'baylor-id-management', label: 'Baylor ID Management', path: 'directory/baylor-id-management' }
      ]
    },
    {
      id: 'analytics',
      label: 'Data & Analytics',
      icon: BarChart3,
      children: [
        { id: 'department-insights', label: 'Department Insights', path: 'analytics/department-insights' },
        { id: 'course-management', label: 'Course Management', path: 'analytics/course-management' },
        { id: 'recent-changes', label: 'Recent Changes', path: 'analytics/recent-changes' }
      ]
    },
    {
      id: 'administration',
      label: 'Administration',
      icon: Settings,
      children: [
        { id: 'smart-import', label: 'Data Import', path: 'administration/smart-import' },
        { id: 'data-hygiene', label: 'Data Hygiene', path: 'administration/data-hygiene' },
        { id: 'baylor-systems', label: 'Baylor Systems', path: 'administration/baylor-systems' },
        { id: 'baylor-acronyms', label: 'Baylor Acronyms', path: 'administration/baylor-acronyms' }
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
            id: `${schedule.id}-${index}`,
            // Basic schedule info
            Course: schedule.courseCode || '',
            'Course Title': schedule.courseTitle || '',
            Instructor: schedule.instructor ? `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() : (schedule.instructorName || ''),
            Section: schedule.section || '',
            Credits: schedule.credits || '',
            Term: schedule.term || '',
            
            // Meeting pattern info
            Day: pattern.day || '',
            'Start Time': pattern.startTime || '',
            'End Time': pattern.endTime || '',
            
            // Room info
            Room: schedule.room ? (schedule.room.displayName || schedule.room.name) : (schedule.roomName || ''),
            'Room Capacity': schedule.room ? schedule.room.capacity : '',
            
            // Course details
            CRN: schedule.crn || schedule.CRN || '',
            'Course Level': schedule.courseLevel || '',
            'Course Type': schedule.program || '',
            'Schedule Type': schedule.scheduleType || 'Class Instruction',
            Status: schedule.status || 'Active',
            
            // Legacy flat structure compatibility
            ...schedule
          });
        });
      } else {
        // If no meeting patterns, create a single entry (legacy format support)
        flattenedData.push({
          id: schedule.id,
          Course: schedule.courseCode || '',
          'Course Title': schedule.courseTitle || '',
          Instructor: schedule.instructor ? `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() : (schedule.instructorName || ''),
          Section: schedule.section || '',
          Credits: schedule.credits || '',
          Term: schedule.term || '',
          Room: schedule.room ? (schedule.room.displayName || schedule.room.name) : (schedule.roomName || ''),
          CRN: schedule.crn || schedule.CRN || '',
          'Schedule Type': schedule.scheduleType || 'Class Instruction',
          Status: schedule.status || 'Active',
          ...schedule
        });
      }
    });

    console.log(`📊 Converted ${semesterFilteredScheduleData.length} relational schedules to ${flattenedData.length} flat entries`);
    return flattenedData;
  }, [semesterFilteredScheduleData]);

  // Comprehensive analytics calculation
  const analytics = useMemo(() => {
    if (!scheduleData || scheduleData.length === 0) return null;

    console.log('📊 Calculating analytics for', scheduleData.length, 'schedule entries');

    // Faculty count
    const instructors = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.Instructor && schedule.Instructor.trim()) {
        instructors.add(schedule.Instructor.trim());
      }
    });

    // Session counts
    const totalSessions = scheduleData.length;
    
    // Adjunct-taught sessions
    const adjunctTaughtSessions = scheduleData.filter(schedule => {
      const instructorName = schedule.Instructor || '';
      const facultyMember = rawPeople.find(person => person.name === instructorName);
      return facultyMember && facultyMember.isAdjunct;
    }).length;

    // Rooms in use
    const rooms = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.Room && schedule.Room.trim()) {
        rooms.add(schedule.Room.trim());
      }
    });

    // Unique courses
    const courses = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.Course && schedule.Course.trim()) {
        courses.add(schedule.Course.trim());
      }
    });

    // Busiest day calculation
    const daySchedules = { M: 0, T: 0, W: 0, R: 0, F: 0 };
    scheduleData.forEach(schedule => {
      if (schedule.Day && daySchedules.hasOwnProperty(schedule.Day)) {
        daySchedules[schedule.Day]++;
      }
    });

    const busiestDay = Object.entries(daySchedules).reduce(
      (max, [day, count]) => count > max.count ? { day, count } : max,
      { day: 'M', count: 0 }
    );

    const result = {
      facultyCount: instructors.size,
      totalSessions,
      adjunctTaughtSessions,
      roomsInUse: rooms.size,
      uniqueCourses: courses.size,
      busiestDay
    };

    console.log('📊 Analytics calculated:', result);
    return result;
  }, [scheduleData, rawPeople]);

  // Utility functions
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

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.semester-dropdown')) {
        setShowSemesterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Data loading function
  const loadData = async () => {
    setLoading(true);
    try {
      console.log('📡 Loading data from Firebase...');
      
      // First run any needed migrations
      await autoMigrateIfNeeded();
      
      // Load schedule data with relational structure
      const { schedules, people: schedulePeople } = await fetchSchedulesWithRelationalData();
      
      // Load people data
      const peopleSnapshot = await getDocs(collection(db, 'people'));
      const people = peopleSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      
      // Load programs data
      const programs = await fetchPrograms();
      
      // Merge people from schedules with directory people
      const mergedPeople = [...people];
      schedulePeople.forEach(schedulePerson => {
        if (!people.find(p => p.id === schedulePerson.id)) {
          mergedPeople.push(schedulePerson);
        }
      });
      
      // Load edit history (legacy)
      const historySnapshot = await getDocs(query(collection(db, 'editHistory'), orderBy('timestamp', 'desc')));
      const history = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Load recent changes from new centralized log
      const recentChangesData = await fetchRecentChanges(100);
      
      console.log('✅ Data loaded successfully:', {
        schedules: schedules.length,
        people: mergedPeople.length,
        programs: programs.length,
        history: history.length,
        recentChanges: recentChangesData.length
      });
      
      setRawScheduleData(schedules);
      setRawPeople(mergedPeople);
      setRawPrograms(programs);
      setEditHistory(history);
      setRecentChanges(recentChangesData);
      updateAvailableSemesters(schedules);
      
    } catch (error) {
      console.error('❌ Error loading data:', error);
      showNotification('error', 'Data Loading Error', 'Failed to load application data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  // Check authentication on mount
  const checkAuthStatus = () => {
    const authStatus = localStorage.getItem('isAuthenticated');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
      loadData();
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Data update handlers with enhanced relational integrity
  const handleDataUpdate = async (updatedRow) => {
    console.log('💾 Updating schedule data:', updatedRow);
    
    try {
      const isNewCourse = updatedRow.id && updatedRow.id.startsWith('new_');
      const isGroupedCourse = updatedRow.id && updatedRow.id.startsWith('grouped_');
      let scheduleRef;
      let originalSchedule = null;
      let originalSchedules = [];

      if (isNewCourse) {
        // Creating a new course
        console.log('🆕 Creating new course entry');
        scheduleRef = doc(collection(db, 'schedules'));
      } else if (isGroupedCourse) {
        // Handle grouped courses (multi-day classes)
        console.log('🔄 Updating grouped course entry');
        // Extract original IDs from grouped ID (format: grouped_index_id1_id2_id3...)
        const idParts = updatedRow.id.split('_');
        const originalIds = idParts.slice(2); // Skip 'grouped' and index parts
        
        originalSchedules = rawScheduleData.filter(s => originalIds.includes(s.id));
        if (originalSchedules.length === 0) {
          console.error('❌ No original schedules found for grouped update');
          showNotification('error', 'Update Failed', 'Original schedules not found for grouped course.');
          return;
        }
        console.log(`📋 Found ${originalSchedules.length} original schedules for grouped course`);
      } else {
        // Updating existing single course
        originalSchedule = rawScheduleData.find(s => s.id === updatedRow.id);
        if (!originalSchedule) {
          console.error('❌ Original schedule not found for update');
          showNotification('error', 'Update Failed', 'Original schedule not found.');
          return;
        }
        scheduleRef = doc(db, 'schedules', updatedRow.id);
      }

      // Validate and resolve instructor reference
      let instructorId = null;
      if (updatedRow.Instructor && updatedRow.Instructor !== 'Staff') {
        const instructor = rawPeople.find(person => person.name === updatedRow.Instructor);
        if (instructor) {
          instructorId = instructor.id;
        } else {
          console.warn('⚠️ Instructor not found in people collection:', updatedRow.Instructor);
        }
      }

      // Validate and resolve room reference
      let roomId = null;
      if (updatedRow.Room && updatedRow.Room.trim() !== '') {
        // Check if room exists or needs to be created
        // For now, we'll store room name and handle room creation separately
        // This could be enhanced to create room entries automatically
      }

      // Create meeting patterns from Day/Start Time/End Time
      const meetingPatterns = [];
      if (updatedRow.Day && updatedRow['Start Time'] && updatedRow['End Time']) {
        // Split Day string into individual day codes (e.g., "MWF" -> ["M","W","F"])
        const dayCodes = typeof updatedRow.Day === 'string' ? updatedRow.Day.match(/[MTWRF]/g) : [];
        (dayCodes && dayCodes.length > 0 ? dayCodes : [updatedRow.Day]).forEach(code => {
          if (!code) return;
          meetingPatterns.push({
            day: code,
            startTime: updatedRow['Start Time'],
            endTime: updatedRow['End Time']
          });
        });
      }

      // Get reference data from the appropriate source
      const referenceSchedule = isGroupedCourse ? originalSchedules[0] : originalSchedule;
      
      // Parse the course code to get program, level, and credits
      const courseCode = updatedRow.Course || (referenceSchedule?.courseCode || '');
      const parsedCourse = parseCourseCode(courseCode);

      // Prepare update data with proper relational structure
      const updateData = {
        courseCode: courseCode,
        courseTitle: updatedRow['Course Title'] || (referenceSchedule?.courseTitle || ''),
        program: parsedCourse.program,
        courseLevel: parsedCourse.level,
        section: updatedRow.Section || (referenceSchedule?.section || ''),
        crn: updatedRow.CRN || (referenceSchedule?.crn || ''),
        term: updatedRow.Term || (referenceSchedule?.term || ''),
        credits: parseInt(updatedRow.Credits) || parsedCourse.credits || (referenceSchedule?.credits || 0),
        scheduleType: updatedRow['Schedule Type'] || (referenceSchedule?.scheduleType || 'Class Instruction'),
        status: updatedRow.Status || (referenceSchedule?.status || 'Active'),
        
        // Relational references
        instructorId: instructorId,
        instructorName: updatedRow.Instructor || (referenceSchedule?.instructorName || ''),
        roomId: roomId,
        roomName: updatedRow.Room || (referenceSchedule?.roomName || ''),
        
        // Meeting patterns
        meetingPatterns: meetingPatterns.length > 0 ? meetingPatterns : (referenceSchedule?.meetingPatterns || []),
        
        // Timestamps
        updatedAt: new Date().toISOString(),
        ...(isNewCourse && { createdAt: new Date().toISOString() })
      };

      // Validate required fields
      const validationErrors = [];
      if (!updateData.courseCode) validationErrors.push('Course code is required');
      if (!updateData.term) validationErrors.push('Term is required');
      if (!updateData.section) validationErrors.push('Section is required');
      if (meetingPatterns.length === 0 && (!referenceSchedule?.meetingPatterns || referenceSchedule.meetingPatterns.length === 0)) {
        validationErrors.push('Meeting time and day are required');
      }

      if (validationErrors.length > 0) {
        showNotification('error', 'Validation Failed', validationErrors.join('\n'));
        return;
      }

      // Save to Firebase
      if (isNewCourse) {
        await setDoc(scheduleRef, updateData);
      } else if (isGroupedCourse) {
        // Handle grouped course updates
        console.log('🔄 Updating grouped course schedules...');
        
        // Split the day pattern into individual days for updating each schedule
        const dayCodes = typeof updatedRow.Day === 'string' ? updatedRow.Day.match(/[MTWRF]/g) : [];
        
        // Update each original schedule with its corresponding day
        for (let i = 0; i < originalSchedules.length && i < dayCodes.length; i++) {
          const originalId = originalSchedules[i].id;
          const dayCode = dayCodes[i];
          
          // Create update data for this specific day
          const daySpecificUpdateData = {
            ...updateData,
            meetingPatterns: [{
              day: dayCode,
              startTime: updatedRow['Start Time'],
              endTime: updatedRow['End Time']
            }]
          };
          
          const scheduleDocRef = doc(db, 'schedules', originalId);
          await updateDoc(scheduleDocRef, daySpecificUpdateData);
          console.log(`✅ Updated schedule ${originalId} for day ${dayCode}`);
        }
        
        // If there are more days than original schedules, create new ones
        if (dayCodes.length > originalSchedules.length) {
          for (let i = originalSchedules.length; i < dayCodes.length; i++) {
            const dayCode = dayCodes[i];
            const newScheduleData = {
              ...updateData,
              meetingPatterns: [{
                day: dayCode,
                startTime: updatedRow['Start Time'],
                endTime: updatedRow['End Time']
              }],
              createdAt: new Date().toISOString()
            };
            
            const newScheduleRef = doc(collection(db, 'schedules'));
            await setDoc(newScheduleRef, newScheduleData);
            console.log(`✅ Created new schedule for day ${dayCode}`);
          }
        }
        
        // If there are fewer days than original schedules, delete the extra ones
        if (dayCodes.length < originalSchedules.length) {
          for (let i = dayCodes.length; i < originalSchedules.length; i++) {
            const scheduleToDelete = originalSchedules[i];
            const scheduleDocRef = doc(db, 'schedules', scheduleToDelete.id);
            await deleteDoc(scheduleDocRef);
            console.log(`🗑️ Deleted extra schedule ${scheduleToDelete.id}`);
          }
        }
      } else {
        await updateDoc(scheduleRef, updateData);
      }

      // Add to edit history (legacy)
      const historyData = {
        action: isNewCourse ? 'CREATE' : (isGroupedCourse ? 'UPDATE_GROUPED' : 'UPDATE'),
        entity: `${updateData.courseCode} ${updateData.section} - ${updateData.instructorName}`,
        changes: updateData,
        originalData: isGroupedCourse ? originalSchedules : originalSchedule,
        timestamp: new Date().toISOString(),
        userId: 'system'
      };
      
      if (isGroupedCourse) {
        historyData.affectedScheduleCount = originalSchedules.length;
      }
      
      await addDoc(collection(db, 'editHistory'), historyData);

      // Log change in centralized system
      if (isNewCourse) {
        await logCreate(
          `Schedule - ${updateData.courseCode} ${updateData.section} (${updateData.instructorName})`,
          'schedules',
          scheduleRef.id,
          updateData,
          'App.jsx - handleDataUpdate'
        );
      } else if (isGroupedCourse) {
        await logUpdate(
          `Schedule Group - ${updateData.courseCode} ${updateData.section} (${originalSchedules.length} schedules)`,
          'schedules',
          'multiple',
          updateData,
          originalSchedules,
          'App.jsx - handleDataUpdate'
        );
      } else {
        await logUpdate(
          `Schedule - ${updateData.courseCode} ${updateData.section} (${updateData.instructorName})`,
          'schedules',
          updatedRow.id,
          updateData,
          originalSchedule,
          'App.jsx - handleDataUpdate'
        );
      }

      // Refresh data to reflect changes
      await loadData();
      
      if (isNewCourse) {
        showNotification('success', 'Schedule Created', 
          `Course ${updateData.courseCode} ${updateData.section} has been created successfully.`);
      } else if (isGroupedCourse) {
        showNotification('success', 'Grouped Schedule Updated', 
          `Course ${updateData.courseCode} ${updateData.section} (${originalSchedules.length} schedule entries) has been updated successfully.`);
      } else {
        showNotification('success', 'Schedule Updated', 
          `Course ${updateData.courseCode} ${updateData.section} has been updated successfully.`);
      }
      
    } catch (error) {
      console.error('❌ Error updating schedule:', error);
      showNotification('error', 'Update Failed', `Failed to update schedule: ${error.message}`);
    }
  };

  const handleFacultyUpdate = async (facultyToUpdate, originalData = null) => {
    console.log('👤 Updating faculty member:', facultyToUpdate);
    
    try {
      const isNewFaculty = !facultyToUpdate.id;
      let facultyRef;
      let actionType;
      
      if (isNewFaculty) {
        // Creating a new faculty member
        console.log('🆕 Creating new faculty member');
        facultyRef = doc(collection(db, 'people'));
        actionType = 'CREATE';
      } else {
        // Updating existing faculty member
        console.log('📝 Updating existing faculty member');
        facultyRef = doc(db, 'people', facultyToUpdate.id);
        actionType = 'UPDATE';
      }
      
      // Filter out undefined values to prevent Firebase errors
      const cleanData = Object.fromEntries(
        Object.entries(facultyToUpdate).filter(([_, value]) => value !== undefined)
      );
      
      const updateData = {
        ...cleanData,
        updatedAt: new Date().toISOString()
      };

      if (isNewFaculty) {
        // Use setDoc for new faculty to ensure we get the generated ID
        await setDoc(facultyRef, updateData);
      } else {
        // Use updateDoc for existing faculty
        await updateDoc(facultyRef, updateData);
      }

      // Add to edit history (legacy)
      await addDoc(collection(db, 'editHistory'), {
        action: actionType,
        entity: `Faculty - ${facultyToUpdate.name}`,
        changes: updateData,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Log change in centralized system
      if (isNewFaculty) {
        await logCreate(
          `Faculty - ${facultyToUpdate.name}`,
          'people',
          facultyRef.id,
          updateData,
          'App.jsx - handleFacultyUpdate'
        );
      } else {
        await logUpdate(
          `Faculty - ${facultyToUpdate.name}`,
          'people',
          facultyToUpdate.id,
          updateData,
          originalData, // Pass original data for accurate logging
          'App.jsx - handleFacultyUpdate'
        );
      }

      // Refresh data
      await loadData();
      
      const successMessage = isNewFaculty 
        ? `${facultyToUpdate.name} has been added to the directory successfully.`
        : `${facultyToUpdate.name} has been updated successfully.`;
      
      showNotification('success', isNewFaculty ? 'Faculty Added' : 'Faculty Updated', successMessage);
      
    } catch (error) {
      console.error('❌ Error updating faculty:', error);
      const errorMessage = !facultyToUpdate.id 
        ? 'Failed to add faculty member. Please try again.'
        : 'Failed to update faculty member. Please try again.';
      showNotification('error', 'Operation Failed', errorMessage);
    }
  };

  const handleStaffUpdate = async (staffToUpdate) => {
    console.log('👥 Updating staff member:', staffToUpdate);
    
    try {
      let docRef;
      let action;
      let logFunction;
      let originalData = null;
      
      // Filter out undefined values to prevent Firebase errors
      const cleanStaffData = Object.fromEntries(
        Object.entries(staffToUpdate).filter(([_, value]) => value !== undefined)
      );
      
      if (staffToUpdate.id) {
        // Update existing staff member
        const staffRef = doc(db, 'people', staffToUpdate.id);
        const updateData = {
          ...cleanStaffData,
          updatedAt: new Date().toISOString()
        };
        
        await updateDoc(staffRef, updateData);
        docRef = staffRef;
        action = 'UPDATE';
        logFunction = logUpdate;
        
      } else {
        // Create new staff member
        const createData = {
          ...cleanStaffData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        docRef = await addDoc(collection(db, 'people'), createData);
        action = 'CREATE';
        logFunction = logCreate;
      }

      // Add to edit history (legacy)
      await addDoc(collection(db, 'editHistory'), {
        action: action,
        entity: `Staff - ${staffToUpdate.name}`,
        changes: staffToUpdate,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Log change in centralized system
      await logFunction(
        `Staff - ${staffToUpdate.name}`,
        'people',
        docRef.id,
        staffToUpdate,
        originalData,
        'App.jsx - handleStaffUpdate'
      );

      // Refresh data
      await loadData();
      
      const successMessage = action === 'CREATE' 
        ? `${staffToUpdate.name} has been created successfully.`
        : `${staffToUpdate.name} has been updated successfully.`;
      
      showNotification('success', `Staff ${action === 'CREATE' ? 'Created' : 'Updated'}`, successMessage);
      
    } catch (error) {
      console.error('❌ Error updating staff:', error);
      showNotification('error', 'Operation Failed', 'Failed to save staff member. Please try again.');
    }
  };

  const handleFacultyDelete = async (facultyToDelete) => {
    console.log('🗑️ Deleting faculty member:', facultyToDelete);
    
    try {
      // Delete from Firebase
      await deleteDoc(doc(db, 'people', facultyToDelete.id));

      // Add to edit history (legacy)
      await addDoc(collection(db, 'editHistory'), {
        action: 'DELETE',
        entity: `Faculty - ${facultyToDelete.name}`,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Log change in centralized system
      await logDelete(
        `Faculty - ${facultyToDelete.name}`,
        'people',
        facultyToDelete.id,
        facultyToDelete,
        'App.jsx - handleFacultyDelete'
      );

      // Refresh data
      await loadData();
      
      showNotification('success', 'Faculty Deleted', `${facultyToDelete.name} has been removed from the directory.`);
      
    } catch (error) {
      console.error('❌ Error deleting faculty:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete faculty member. Please try again.');
    }
  };

  const handleStaffDelete = async (staffToDelete) => {
    console.log('🗑️ Deleting staff member:', staffToDelete);
    
    try {
      // Delete from Firebase
      await deleteDoc(doc(db, 'people', staffToDelete.id));

      // Add to edit history (legacy)
      await addDoc(collection(db, 'editHistory'), {
        action: 'DELETE',
        entity: `Staff - ${staffToDelete.name}`,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Log change in centralized system
      await logDelete(
        `Staff - ${staffToDelete.name}`,
        'people',
        staffToDelete.id,
        staffToDelete,
        'App.jsx - handleStaffDelete'
      );

      // Refresh data
      await loadData();
      
      showNotification('success', 'Staff Deleted', `${staffToDelete.name} has been removed from the directory.`);
      
    } catch (error) {
      console.error('❌ Error deleting staff:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete staff member. Please try again.');
    }
  };

  const handleStudentUpdate = async (studentToUpdate) => {
    console.log('🎓 Updating student worker:', studentToUpdate);
    
    try {
      const isNewStudent = !studentToUpdate.id;
      let studentRef;
      let actionType;
      
      if (isNewStudent) {
        // Creating a new student worker
        console.log('🆕 Creating new student worker');
        studentRef = doc(collection(db, 'people'));
        actionType = 'CREATE';
      } else {
        // Updating existing student worker
        console.log('📝 Updating existing student worker');
        studentRef = doc(db, 'people', studentToUpdate.id);
        actionType = 'UPDATE';
      }
      
      // Filter out undefined values to prevent Firebase errors
      const cleanStudentData = Object.fromEntries(
        Object.entries(studentToUpdate).filter(([_, value]) => value !== undefined)
      );
      
      const updateData = {
        ...cleanStudentData,
        roles: ['student'], // Ensure student role is set
        updatedAt: new Date().toISOString()
      };

      if (isNewStudent) {
        // Use setDoc for new student to ensure we get the generated ID
        await setDoc(studentRef, updateData);
      } else {
        // Use updateDoc for existing student
        await updateDoc(studentRef, updateData);
      }

      // Add to edit history (legacy)
      await addDoc(collection(db, 'editHistory'), {
        action: actionType,
        entity: `Student - ${studentToUpdate.name}`,
        changes: updateData,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Log change in centralized system
      if (isNewStudent) {
        await logCreate(
          `Student - ${studentToUpdate.name}`,
          'people',
          studentRef.id,
          updateData,
          'App.jsx - handleStudentUpdate'
        );
      } else {
        await logUpdate(
          `Student - ${studentToUpdate.name}`,
          'people',
          studentToUpdate.id,
          updateData,
          null, // Original data not available here
          'App.jsx - handleStudentUpdate'
        );
      }

      // Refresh data
      await loadData();
      
      const successMessage = isNewStudent 
        ? `${studentToUpdate.name} has been added to the student worker directory successfully.`
        : `${studentToUpdate.name} has been updated successfully.`;
      
      showNotification('success', isNewStudent ? 'Student Added' : 'Student Updated', successMessage);
      
    } catch (error) {
      console.error('❌ Error updating student:', error);
      const errorMessage = !studentToUpdate.id
        ? 'Failed to add student worker. Please try again.'
        : 'Failed to update student worker. Please try again.';
      showNotification('error', 'Operation Failed', errorMessage);
    }
  };

  const handleStudentDelete = async (studentToDelete) => {
    console.log('🗑️ Deleting student worker:', studentToDelete);
    
    try {
      // Delete from Firebase
      await deleteDoc(doc(db, 'people', studentToDelete.id));

      // Add to edit history (legacy)
      await addDoc(collection(db, 'editHistory'), {
        action: 'DELETE',
        entity: `Student - ${studentToDelete.name}`,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Log change in centralized system
      await logDelete(
        `Student - ${studentToDelete.name}`,
        'people',
        studentToDelete.id,
        studentToDelete,
        'App.jsx - handleStudentDelete'
      );

      // Refresh data
      await loadData();
      
      showNotification('success', 'Student Deleted', `${studentToDelete.name} has been removed from the directory.`);
      
    } catch (error) {
      console.error('❌ Error deleting student:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete student worker. Please try again.');
    }
  };

  const handleScheduleDelete = async (scheduleId) => {
    console.log('🗑️ Deleting schedule:', scheduleId);
    
    try {
      // Find the schedule to get details for history
      const scheduleToDelete = rawScheduleData.find(s => s.id === scheduleId);
      if (!scheduleToDelete) {
        showNotification('error', 'Delete Failed', 'Schedule not found.');
        return;
      }

      // Delete from Firebase
      await deleteDoc(doc(db, 'schedules', scheduleId));

      // Add to edit history (legacy)
      await addDoc(collection(db, 'editHistory'), {
        action: 'DELETE',
        entity: `${scheduleToDelete.courseCode} ${scheduleToDelete.section} - ${scheduleToDelete.instructorName}`,
        deletedData: scheduleToDelete,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Log change in centralized system
      await logDelete(
        `Schedule - ${scheduleToDelete.courseCode} ${scheduleToDelete.section} (${scheduleToDelete.instructorName})`,
        'schedules',
        scheduleId,
        scheduleToDelete,
        'App.jsx - handleScheduleDelete'
      );

      // Refresh data
      await loadData();
      
      showNotification('success', 'Schedule Deleted', 
        `Course ${scheduleToDelete.courseCode} ${scheduleToDelete.section} has been removed successfully.`);
      
    } catch (error) {
      console.error('❌ Error deleting schedule:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete schedule. Please try again.');
    }
  };

  const handleRevertChange = async (changeToRevert) => {
    console.log('↩️ Reverting change:', changeToRevert);
    
    try {
      if (changeToRevert.action === 'DELETE') {
        showNotification('warning', 'Cannot Revert Delete', 'Deleted items cannot be automatically restored.');
        return;
      }

      // For updates, we would need to store the previous state to revert properly
      // This is a simplified implementation
      showNotification('info', 'Revert Not Implemented', 'Change reversion is not yet implemented.');
      
    } catch (error) {
      console.error('❌ Error reverting change:', error);
      showNotification('error', 'Revert Failed', 'Failed to revert change. Please try again.');
    }
  };

  // Navigation and authentication handlers
  const handleLogin = (status) => {
    setIsAuthenticated(status);
    if (status) {
      loadData();
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticated');
    setShowLogoutConfirm(false);
    navigate('/dashboard');
  };

  const getCurrentBreadcrumb = () => {
    const pathParts = currentPage.split('/');
    const section = navigationItems.find(item => item.id === pathParts[0]);
    
    if (!section) return ['Dashboard'];
    
    if (pathParts.length === 1) {
      return [section.label];
    } else {
      const subsection = section.children?.find(child => child.path === currentPage);
      return [section.label, subsection?.label || pathParts[1]];
    }
  };

  // Main page content renderer
  const renderPageContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="loading-shimmer w-16 h-16 rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading system data...</p>
          </div>
        </div>
      );
    }

    // Filter student data from rawPeople
    const studentData = rawPeople.filter(person => {
      if (!person.roles) return false;
      
      // Handle array format (newer format)
      if (Array.isArray(person.roles)) {
        return person.roles.includes('student');
      }
      
      // Handle object format (legacy format)
      if (typeof person.roles === 'object') {
        return person.roles.student === true;
      }
      
      return false;
    });

    const pageProps = {
      scheduleData,
      directoryData: rawPeople,
      facultyData: adaptPeopleToFaculty(rawPeople, rawScheduleData, rawPrograms),
      staffData: adaptPeopleToStaff(rawPeople, rawScheduleData, rawPrograms),
      studentData: studentData,
      programs: rawPrograms,
      analytics,
      editHistory,
      recentChanges,
      onDataUpdate: handleDataUpdate,
      onFacultyUpdate: handleFacultyUpdate,
      onStaffUpdate: handleStaffUpdate,
      onStudentUpdate: handleStudentUpdate,
      onFacultyDelete: handleFacultyDelete,
      onStaffDelete: handleStaffDelete,
      onStudentDelete: handleStudentDelete,
      onScheduleDelete: handleScheduleDelete,
      onRevertChange: handleRevertChange,
      onNavigate: handleNavigate,
      showNotification,
      selectedSemester,
      availableSemesters,
      onSemesterDataImported: loadData,
      pinnedPages,
      togglePinPage
    };

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard {...pageProps} />;
      case 'scheduling/faculty-schedules':
        return <FacultySchedules {...pageProps} />;
      case 'scheduling/group-meetings':
        return <GroupMeetings {...pageProps} />;
      case 'scheduling/individual-availability':
        return <IndividualAvailability {...pageProps} />;
      case 'scheduling/room-schedules':
        return <RoomSchedules {...pageProps} />;
      case 'directory/people-directory':
        return <PeopleDirectory {...pageProps} />;
      case 'directory/faculty-directory':
        return <PeopleDirectory {...pageProps} initialTab="faculty" />;
      case 'directory/staff-directory':
        return <PeopleDirectory {...pageProps} initialTab="staff" />;
      case 'directory/adjunct-directory':
        return <PeopleDirectory {...pageProps} initialTab="adjunct" />;
      case 'directory/student-directory':
        return <PeopleDirectory {...pageProps} initialTab="student" />;
      case 'directory/department-management':
        return <ProgramManagement {...pageProps} />;
      case 'directory/email-lists':
        return <EmailLists {...pageProps} />;
      case 'directory/building-directory':
        return <BuildingDirectory {...pageProps} />;
      case 'directory/baylor-id-management':
        return <BaylorIDManagement {...pageProps} />;
      case 'analytics/department-insights':
        return <DepartmentInsights {...pageProps} />;
      case 'analytics/course-management':
        return <CourseManagement {...pageProps} />;
      case 'analytics/recent-changes':
        return <RecentChangesPage {...pageProps} />;
      case 'administration/smart-import':
        return <SmartDataImportPage {...pageProps} />;
      case 'administration/data-hygiene':
        return <DataHygieneManager {...pageProps} />;
      case 'administration/baylor-systems':
        return <SystemsPage {...pageProps} />;
      case 'administration/baylor-acronyms':
        return <BaylorAcronyms {...pageProps} />;
      default:
        return <Dashboard {...pageProps} />;
    }
  };

  // If the app is in maintenance mode, render the maintenance page and block the rest of the UI
  if (MAINTENANCE_MODE) {
    return (
      <MaintenancePage
        message={MAINTENANCE_MESSAGE}
        until={MAINTENANCE_UNTIL}
      />
    );
  }

  // Authentication check (only if NOT in maintenance mode)
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Professional Sidebar */}
      <Sidebar
        navigationItems={navigationItems}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        selectedSemester={selectedSemester}
        pinnedPages={pinnedPages}
        togglePinPage={togglePinPage}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Professional Header Bar */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center space-x-2">
              <GraduationCap className="w-5 h-5 text-baylor-green" />
              <nav className="flex items-center space-x-2 text-sm">
                {getCurrentBreadcrumb().map((crumb, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="text-gray-400">/</span>}
                    <span className={index === getCurrentBreadcrumb().length - 1 
                      ? 'text-baylor-green font-medium' 
                      : 'text-gray-600'
                    }>
                      {crumb}
                    </span>
                  </React.Fragment>
                ))}
              </nav>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-4">
              {/* Semester Selector */}
              <div className="relative semester-dropdown">
                <button
                  onClick={() => setShowSemesterDropdown(!showSemesterDropdown)}
                  className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-gray-900">{selectedSemester}</span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                
                {showSemesterDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-2">
                      {availableSemesters.map(semester => (
                        <button
                          key={semester}
                          onClick={() => {
                            setSelectedSemester(semester);
                            setShowSemesterDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                            semester === selectedSemester ? 'bg-baylor-green/5 text-baylor-green font-medium' : 'text-gray-900'
                          }`}
                        >
                          {semester}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="btn-ghost"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="ml-2">Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderPageContent()}
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="modal-title">Confirm Logout</h3>
            </div>
            <div className="modal-body">
              <p className="text-gray-600">Are you sure you want to logout? Any unsaved changes will be lost.</p>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowLogoutConfirm(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button 
                onClick={confirmLogout}
                className="btn-danger"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Professional Notification System */}
      <Notification
        show={notification.show}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={hideNotification}
      />
    </div>
  );
}

export default App;