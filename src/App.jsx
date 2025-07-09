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
import DataHygieneManager from './components/DataHygieneManager';

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
  LogOut
} from 'lucide-react';
import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, setDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { adaptPeopleToFaculty, adaptPeopleToStaff, fetchPrograms } from './utils/dataAdapter';
import { fetchSchedulesWithRelationalData } from './utils/dataImportUtils';
import { autoMigrateIfNeeded } from './utils/importTransactionMigration';
import MaintenancePage from './components/MaintenancePage';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
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
        { id: 'data-hygiene', label: 'Data Hygiene', path: 'administration/data-hygiene' },
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
            'Course Type': schedule.courseType || '',
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
      
      // Load edit history
      const historySnapshot = await getDocs(query(collection(db, 'editHistory'), orderBy('timestamp', 'desc')));
      const history = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('✅ Data loaded successfully:', {
        schedules: schedules.length,
        people: mergedPeople.length,
        programs: programs.length,
        history: history.length
      });
      
      setRawScheduleData(schedules);
      setRawPeople(mergedPeople);
      setRawPrograms(programs);
      setEditHistory(history);
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
      let scheduleRef;
      let originalSchedule = null;

      if (isNewCourse) {
        // Creating a new course
        console.log('🆕 Creating new course entry');
        scheduleRef = doc(collection(db, 'schedules'));
      } else {
        // Updating existing course
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
        meetingPatterns.push({
          day: updatedRow.Day,
          startTime: updatedRow['Start Time'],
          endTime: updatedRow['End Time']
        });
      }

      // Prepare update data with proper relational structure
      const updateData = {
        courseCode: updatedRow.Course || (originalSchedule?.courseCode || ''),
        courseTitle: updatedRow['Course Title'] || (originalSchedule?.courseTitle || ''),
        section: updatedRow.Section || (originalSchedule?.section || ''),
        crn: updatedRow.CRN || (originalSchedule?.crn || ''),
        term: updatedRow.Term || (originalSchedule?.term || ''),
        credits: parseInt(updatedRow.Credits) || (originalSchedule?.credits || 3),
        scheduleType: updatedRow['Schedule Type'] || (originalSchedule?.scheduleType || 'Class Instruction'),
        status: updatedRow.Status || (originalSchedule?.status || 'Active'),
        
        // Relational references
        instructorId: instructorId,
        instructorName: updatedRow.Instructor || (originalSchedule?.instructorName || ''),
        roomId: roomId,
        roomName: updatedRow.Room || (originalSchedule?.roomName || ''),
        
        // Meeting patterns
        meetingPatterns: meetingPatterns.length > 0 ? meetingPatterns : (originalSchedule?.meetingPatterns || []),
        
        // Timestamps
        updatedAt: new Date().toISOString(),
        ...(isNewCourse && { createdAt: new Date().toISOString() })
      };

      // Validate required fields
      const validationErrors = [];
      if (!updateData.courseCode) validationErrors.push('Course code is required');
      if (!updateData.term) validationErrors.push('Term is required');
      if (!updateData.section) validationErrors.push('Section is required');
      if (meetingPatterns.length === 0 && (!originalSchedule?.meetingPatterns || originalSchedule.meetingPatterns.length === 0)) {
        validationErrors.push('Meeting time and day are required');
      }

      if (validationErrors.length > 0) {
        showNotification('error', 'Validation Failed', validationErrors.join('\n'));
        return;
      }

      // Save to Firebase
      if (isNewCourse) {
        await setDoc(scheduleRef, updateData);
      } else {
        await updateDoc(scheduleRef, updateData);
      }

      // Add to edit history
      await addDoc(collection(db, 'editHistory'), {
        action: isNewCourse ? 'CREATE' : 'UPDATE',
        entity: `${updateData.courseCode} ${updateData.section} - ${updateData.instructorName}`,
        changes: updateData,
        originalData: originalSchedule,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Refresh data to reflect changes
      await loadData();
      
      const actionText = isNewCourse ? 'created' : 'updated';
      showNotification('success', `Schedule ${isNewCourse ? 'Created' : 'Updated'}`, 
        `Course ${updateData.courseCode} ${updateData.section} has been ${actionText} successfully.`);
      
    } catch (error) {
      console.error('❌ Error updating schedule:', error);
      showNotification('error', 'Update Failed', `Failed to update schedule: ${error.message}`);
    }
  };

  const handleFacultyUpdate = async (facultyToUpdate) => {
    console.log('👤 Updating faculty member:', facultyToUpdate);
    
    try {
      // Update in Firebase
      const facultyRef = doc(db, 'people', facultyToUpdate.id);
      const updateData = {
        ...facultyToUpdate,
        updatedAt: new Date().toISOString()
      };
      
      await updateDoc(facultyRef, updateData);

      // Add to edit history
      await addDoc(collection(db, 'editHistory'), {
        action: 'UPDATE',
        entity: `Faculty - ${facultyToUpdate.name}`,
        changes: updateData,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Refresh data
      await loadData();
      
      showNotification('success', 'Faculty Updated', `${facultyToUpdate.name} has been updated successfully.`);
      
    } catch (error) {
      console.error('❌ Error updating faculty:', error);
      showNotification('error', 'Update Failed', 'Failed to update faculty member. Please try again.');
    }
  };

  const handleStaffUpdate = async (staffToUpdate) => {
    console.log('👥 Updating staff member:', staffToUpdate);
    
    try {
      // Update in Firebase
      const staffRef = doc(db, 'people', staffToUpdate.id);
      const updateData = {
        ...staffToUpdate,
        updatedAt: new Date().toISOString()
      };
      
      await updateDoc(staffRef, updateData);

      // Add to edit history
      await addDoc(collection(db, 'editHistory'), {
        action: 'UPDATE',
        entity: `Staff - ${staffToUpdate.name}`,
        changes: updateData,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Refresh data
      await loadData();
      
      showNotification('success', 'Staff Updated', `${staffToUpdate.name} has been updated successfully.`);
      
    } catch (error) {
      console.error('❌ Error updating staff:', error);
      showNotification('error', 'Update Failed', 'Failed to update staff member. Please try again.');
    }
  };

  const handleFacultyDelete = async (facultyToDelete) => {
    console.log('🗑️ Deleting faculty member:', facultyToDelete);
    
    try {
      // Delete from Firebase
      await deleteDoc(doc(db, 'people', facultyToDelete.id));

      // Add to edit history
      await addDoc(collection(db, 'editHistory'), {
        action: 'DELETE',
        entity: `Faculty - ${facultyToDelete.name}`,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

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

      // Add to edit history
      await addDoc(collection(db, 'editHistory'), {
        action: 'DELETE',
        entity: `Staff - ${staffToDelete.name}`,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Refresh data
      await loadData();
      
      showNotification('success', 'Staff Deleted', `${staffToDelete.name} has been removed from the directory.`);
      
    } catch (error) {
      console.error('❌ Error deleting staff:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete staff member. Please try again.');
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

      // Add to edit history
      await addDoc(collection(db, 'editHistory'), {
        action: 'DELETE',
        entity: `${scheduleToDelete.courseCode} ${scheduleToDelete.section} - ${scheduleToDelete.instructorName}`,
        deletedData: scheduleToDelete,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

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
    setCurrentPage('dashboard');
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

    const pageProps = {
      scheduleData,
      directoryData: rawPeople,
      facultyData: adaptPeopleToFaculty(rawPeople, rawScheduleData, rawPrograms),
      staffData: adaptPeopleToStaff(rawPeople, rawScheduleData, rawPrograms),
      programs: rawPrograms,
      analytics,
      editHistory,
      onDataUpdate: handleDataUpdate,
      onFacultyUpdate: handleFacultyUpdate,
      onStaffUpdate: handleStaffUpdate,
      onFacultyDelete: handleFacultyDelete,
      onStaffDelete: handleStaffDelete,
      onScheduleDelete: handleScheduleDelete,
      onRevertChange: handleRevertChange,
      onNavigate: setCurrentPage,
      showNotification,
      selectedSemester,
      availableSemesters,
      onSemesterDataImported: loadData
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
      case 'directory/faculty-directory':
        return <FacultyDirectory {...pageProps} />;
      case 'directory/staff-directory':
        return <StaffDirectory {...pageProps} />;
      case 'directory/adjunct-directory':
        return <AdjunctDirectory {...pageProps} />;
      case 'directory/department-management':
        return <ProgramManagement {...pageProps} />;
      case 'directory/email-lists':
        return <EmailLists {...pageProps} />;
      case 'directory/building-directory':
        return <BuildingDirectory {...pageProps} />;
      case 'analytics/department-insights':
        return <DepartmentInsights {...pageProps} />;
      case 'analytics/course-management':
        return <CourseManagement {...pageProps} />;
      case 'administration/smart-import':
        return <SmartDataImportPage {...pageProps} />;
      case 'administration/data-hygiene':
        return <DataHygieneManager {...pageProps} />;
      case 'administration/baylor-systems':
        return <SystemsPage {...pageProps} />;
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
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        selectedSemester={selectedSemester}
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