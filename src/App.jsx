import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import GroupMeetings from './components/scheduling/GroupMeetings.jsx';
import IndividualAvailability from './components/scheduling/IndividualAvailability';
import RoomSchedules from './components/scheduling/RoomSchedules';
import StudentSchedules from './components/scheduling/StudentSchedules.jsx';
import FacultySchedules from './components/FacultySchedules';
import PeopleDirectory from './components/PeopleDirectory';
import ProgramManagement from './components/ProgramManagement';
import DepartmentInsights from './components/analytics/DepartmentInsights.jsx';
import CourseManagement from './components/analytics/CourseManagement';
// Legacy import removed - using smart import only
import ImportWizard from './components/ImportWizard';
import SystemsPage from './components/SystemsPage';
import DataHygieneManager from './components/DataHygieneManager';
import BaylorAcronyms from './pages/BaylorAcronyms';
import CRNQualityTools from './components/CRNQualityTools';
import OutlookRoomExport from './components/tools/OutlookRoomExport.jsx';

import RecentChangesPage from './components/RecentChangesPage';
import RoomGridGenerator from './components/admin/RoomGridGenerator';
import UserActivityDashboard from './components/UserActivityDashboard';
import BaylorIDManager from './components/BaylorIDManager';

import EmailLists from './components/EmailLists';
import BuildingDirectory from './components/BuildingDirectory';
import Login from './components/Login';
import ProtectedContent from './components/ProtectedContent.jsx';
import AccessControl from './components/admin/AccessControl.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { usePermissions } from './utils/permissions';
import Notification from './components/Notification';
import { registerNavigationPages } from './utils/pageRegistry';
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
  Star,
  X,
  Wrench,
  Database
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

const deriveCreditsFromSchedule = (courseCode, credits) => {
  if (credits !== undefined && credits !== null && credits !== '') {
    const numericCredits = Number(credits);
    if (!Number.isNaN(numericCredits)) {
      return numericCredits;
    }
  }

  const parsed = parseCourseCode(courseCode || '');
  if (parsed && !parsed.error && parsed.credits !== undefined && parsed.credits !== null) {
    return parsed.credits;
  }

  return null;
};

function App() {
  const { user, signOut, loading: authLoading, canAccess } = useAuth();
  const {
    canEdit,
    canEditFaculty,
    canCreateFaculty,
    canDeleteFaculty,
    canEditStaff,
    canCreateStaff,
    canEditStudent,
    canCreateStudent,
    canDeleteStudent,
    canEditSchedule,
    canCreateSchedule,
    canDeleteSchedule
  } = usePermissions();
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  
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
    return localStorage.getItem('selectedSemester') || '';
  });
  const [availableSemesters, setAvailableSemesters] = useState([]);
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



  // Extract available semesters from schedule data and auto-select most recent
  const updateAvailableSemesters = (scheduleData) => {
    const semesters = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.term && schedule.term.trim()) {
        semesters.add(schedule.term.trim());
      }
    });
    
    if (semesters.size === 0) {
      setAvailableSemesters([]);
      return;
    }
    
    const semesterList = Array.from(semesters).sort((a, b) => {
      // Simple sort: extract year and term, sort by year first, then by term
      const [aTerm, aYear] = a.split(' ');
      const [bTerm, bYear] = b.split(' ');
      
      const aYearNum = parseInt(aYear);
      const bYearNum = parseInt(bYear);
      
      if (aYearNum !== bYearNum) {
        return bYearNum - aYearNum; // Newer years first
      }
      
      // For same year, Fall is most recent, then Summer, then Spring
      const termOrder = { 'Fall': 3, 'Summer': 2, 'Spring': 1 };
      return (termOrder[bTerm] || 0) - (termOrder[aTerm] || 0);
    });
    
    console.log('🎓 Available semesters:', semesterList);
    setAvailableSemesters(semesterList);
    
    // Always auto-select the most recent semester (first in sorted list)
    const mostRecentSemester = semesterList[0];
    if (mostRecentSemester !== selectedSemester) {
      console.log(`🎓 Auto-selecting most recent semester: ${mostRecentSemester}`);
      setSelectedSemester(mostRecentSemester);
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
        { id: 'individual-availability', label: 'Individual Availability', path: 'scheduling/individual-availability' },
        { id: 'room-schedules', label: 'Room Schedules', path: 'scheduling/room-schedules' },
        { id: 'student-schedules', label: 'Student Worker Schedules', path: 'scheduling/student-schedules' },
        { id: 'group-meeting-scheduler', label: 'Group Meetings', path: 'scheduling/group-meeting-scheduler' }
      ]
    },
    {
      id: 'directory',
      label: 'Directory',
      icon: Users,
      children: [
        { id: 'people-directory', label: 'People Directory', path: 'people/people-directory' },
        { id: 'email-lists', label: 'Email Lists', path: 'people/email-lists' },
        { id: 'building-directory', label: 'Building Directory', path: 'resources/building-directory' },
        { id: 'baylor-acronyms', label: 'Baylor Acronyms', path: 'administration/baylor-acronyms' }
      ]
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      children: [
        { id: 'department-insights', label: 'Department Insights', path: 'analytics/department-insights' },
        { id: 'course-management', label: 'Course Management', path: 'analytics/course-management' }
      ]
    },
    {
      id: 'tools',
      label: 'Tools',
      icon: Database,
      children: [
        { id: 'smart-import', label: 'Import Wizard', path: 'administration/import-wizard' },
        { id: 'data-hygiene', label: 'Data Hygiene', path: 'administration/data-hygiene' },
        { id: 'crn-tools', label: 'CRN Quality Tools', path: 'administration/crn-tools' },
        { id: 'outlook-export', label: 'Outlook Room Export', path: 'administration/outlook-export' },
        { id: 'room-grid-generator', label: 'Room Grid Generator', path: 'resources/room-grid-generator' },
        { id: 'recent-changes', label: 'Recent Changes', path: 'administration/recent-changes' },
        { id: 'baylor-id-manager', label: 'Baylor ID Manager', path: 'people/baylor-id-manager' },
      ]
    },
    {
      id: 'system',
      label: 'System',
      icon: Settings,
      children: [
        { id: 'program-management', label: 'Program Management', path: 'administration/program-management' },
        { id: 'access-control', label: 'Access Control', path: 'administration/access-control' },
        { id: 'user-activity', label: 'User Activity', path: 'administration/user-activity' },
        { id: 'baylor-systems', label: 'Baylor Systems', path: 'administration/baylor-systems' }
      ]
    }
  ];

  // Register pages for access control UI (one-time per mount)
  useEffect(() => {
    registerNavigationPages(navigationItems);
  }, []);

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
          
          // Build room fields with multi-room awareness
          const roomDisplay = (() => {
            if (schedule.isOnline) return 'Online';
            if (Array.isArray(schedule.roomNames) && schedule.roomNames.length > 0) {
              return schedule.roomNames.join('; ');
            }
            if (Array.isArray(schedule.rooms) && schedule.rooms.length > 0) {
              return schedule.rooms.map(r => r?.displayName || r?.name).filter(Boolean).join('; ');
            }
            return schedule.room ? (schedule.room.displayName || schedule.room.name) : (schedule.roomName || '');
          })();

          const baseCourseCode = schedule.courseCode || schedule.Course || '';
          const creditsValue = deriveCreditsFromSchedule(baseCourseCode, schedule.credits ?? schedule.Credits);
          const programCode = (() => {
            const rawProgram = schedule.program ?? schedule.subjectCode ?? schedule.subject ?? '';
            return rawProgram ? String(rawProgram).trim().toUpperCase() : '';
          })();

          flattenedData.push({
            id: `${schedule.id}-${index}`,
            // Basic schedule info
            Course: schedule.courseCode || '',
            'Course Title': schedule.courseTitle || '',
            Instructor: schedule.instructor ? `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() : (schedule.instructorName || ''),
            Section: schedule.section || '',
            Credits: creditsValue ?? '',
            Program: programCode,
            Term: schedule.term || '',
            
            // Meeting pattern info
            Day: pattern.day || '',
            'Start Time': pattern.startTime || '',
            'End Time': pattern.endTime || '',
            
            // Room info
            Room: roomDisplay,
            'Room Capacity': Array.isArray(schedule.rooms) && schedule.rooms.length > 0 ? (schedule.rooms[0]?.capacity || '') : (schedule.room ? schedule.room.capacity : ''),
            
            // Course details
            CRN: schedule.crn || schedule.CRN || '',
            'Course Level': schedule.courseLevel || '',
            'Course Type': programCode,
            'Schedule Type': schedule.scheduleType || 'Class Instruction',
            Status: schedule.status || 'Active',
            
            // Legacy flat structure compatibility
            ...schedule,
            _originalId: schedule.id
          });
        });
      } else {
        // If no meeting patterns, create a single entry (legacy format support)
        const roomDisplay = (() => {
          if (schedule.isOnline) return 'Online';
          if (Array.isArray(schedule.roomNames) && schedule.roomNames.length > 0) {
            return schedule.roomNames.join('; ');
          }
          if (Array.isArray(schedule.rooms) && schedule.rooms.length > 0) {
            return schedule.rooms.map(r => r?.displayName || r?.name).filter(Boolean).join('; ');
          }
          return schedule.room ? (schedule.room.displayName || schedule.room.name) : (schedule.roomName || '');
        })();

        const baseCourseCode = schedule.courseCode || schedule.Course || '';
        const creditsValue = deriveCreditsFromSchedule(baseCourseCode, schedule.credits ?? schedule.Credits);
        const programCode = (() => {
          const rawProgram = schedule.program ?? schedule.subjectCode ?? schedule.subject ?? '';
          return rawProgram ? String(rawProgram).trim().toUpperCase() : '';
        })();

        flattenedData.push({
          id: schedule.id,
          Course: schedule.courseCode || '',
          'Course Title': schedule.courseTitle || '',
          Instructor: schedule.instructor ? `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() : (schedule.instructorName || ''),
          Section: schedule.section || '',
          Credits: creditsValue ?? '',
          Program: programCode,
          Term: schedule.term || '',
          Room: roomDisplay,
          CRN: schedule.crn || schedule.CRN || '',
          'Schedule Type': schedule.scheduleType || 'Class Instruction',
          'Course Type': programCode,
          Status: schedule.status || 'Active',
          ...schedule,
          _originalId: schedule.id
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

    // Rooms in use (exclude Online)
    const rooms = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.Room && schedule.Room.trim() && schedule.Room.trim().toLowerCase() !== 'online') {
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
  const autoBackfillOnlineFlags = async (schedules) => {
    try {
      const updatesPerformed = [];
      for (const schedule of schedules) {
        if (!schedule || !schedule.id) continue;
        const hasOnlineRoom = (
          (Array.isArray(schedule.roomNames) && schedule.roomNames.some(n => (n || '').toLowerCase() === 'online')) ||
          ((schedule.roomName || '').toLowerCase() === 'online') ||
          ((schedule.room && ((schedule.room.displayName || schedule.room.name || '').toLowerCase() === 'online')))
        );
        const noMeeting = !Array.isArray(schedule.meetingPatterns) || schedule.meetingPatterns.length === 0;
        const missingFlag = schedule.isOnline !== true;
        if (hasOnlineRoom && noMeeting && missingFlag) {
          const scheduleDocRef = doc(db, 'schedules', schedule.id);
          const updates = {
            isOnline: true,
            onlineMode: 'asynchronous',
            meetingPatterns: []
          };
          try {
            await updateDoc(scheduleDocRef, updates);
            // Non-blocking change log
            logUpdate(
              `Schedule - ${schedule.courseCode || ''} ${schedule.section || ''} (${schedule.instructorName || ''})`,
              'schedules',
              schedule.id,
              updates,
              schedule,
              'App.jsx - autoBackfillOnlineFlags'
            ).catch(() => {});
            updatesPerformed.push(schedule.id);
            // Mutate local copy for immediate UX consistency
            schedule.isOnline = true;
            schedule.onlineMode = 'asynchronous';
            schedule.meetingPatterns = [];
          } catch (e) {
            console.warn('Auto-backfill online flags failed for schedule', schedule.id, e);
          }
        }
      }
      if (updatesPerformed.length > 0) {
        console.log(`🔁 Auto-backfilled online flags for ${updatesPerformed.length} schedules`);
      }
    } catch (err) {
      console.warn('Auto-backfill online flags encountered an error:', err);
    }
    return schedules;
  };

  // Auto-inactivate student workers whose endDate has passed (one-time per record)
  const autoInactivateExpiredStudents = async (people) => {
    try {
      const now = new Date();
      const candidates = (people || []).filter(p => {
        // Must be a student
        const hasStudentRole = Array.isArray(p.roles) ? p.roles.includes('student') : (typeof p.roles === 'object' && p.roles?.student === true);
        if (!hasStudentRole) return false;
        const endStr = p.endDate || (Array.isArray(p.jobs) && p.jobs[0]?.endDate) || '';
        if (!endStr) return false;
        const end = new Date(`${endStr}T23:59:59`);
        if (isNaN(end.getTime())) return false;
        // Only inactivate if end in past and not already inactive
        return end < now && p.isActive !== false;
      });

      for (const person of candidates) {
        try {
          const personRef = doc(db, 'people', person.id);
          const updates = { isActive: false, updatedAt: new Date().toISOString() };
          await updateDoc(personRef, updates);
          // Non-blocking change log
          logUpdate(
            `Student - ${person.name || person.id}`,
            'people',
            person.id,
            updates,
            person,
            'App.jsx - autoInactivateExpiredStudents'
          ).catch(() => {});
          // Reflect locally for immediate UX
          person.isActive = false;
        } catch (e) {
          console.warn('Auto-inactivate failed for person', person.id, e);
        }
      }
      if (candidates.length > 0) {
        console.log(`🔁 Auto-inactivated ${candidates.length} expired student workers`);
      }
    } catch (err) {
      console.warn('Auto-inactivate expired students encountered an error:', err);
    }
    return people;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      console.log('📡 Loading data from Firebase...');
      
      // First run any needed migrations
      await autoMigrateIfNeeded();
      
      // Load schedule data with relational structure
      let { schedules, people: schedulePeople } = await fetchSchedulesWithRelationalData();
      // Backfill online flags for legacy records
      schedules = await autoBackfillOnlineFlags(schedules);
      
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
      
      // Load edit history (legacy) - non-fatal if denied
      let history = [];
      try {
        const historySnapshot = await getDocs(query(collection(db, 'editHistory'), orderBy('timestamp', 'desc')));
        history = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.warn('editHistory read skipped:', e?.code || e);
      }

      // Load recent changes from new centralized log - non-fatal if denied
      let recentChangesData = [];
      try {
        recentChangesData = await fetchRecentChanges(100);
      } catch (e) {
        console.warn('recentChanges read skipped:', e?.code || e);
      }
      
      console.log('✅ Data loaded successfully:', {
        schedules: schedules.length,
        people: mergedPeople.length,
        programs: programs.length,
        history: history.length,
        recentChanges: recentChangesData.length
      });
      
      setRawScheduleData(schedules);
      // Auto-inactivate any expired students (non-blocking, but we await to keep local state consistent)
      await autoInactivateExpiredStudents(mergedPeople);
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

  // Expose effective action permissions globally for UI components that can't access hooks
  useEffect(() => {
    try {
      const perms = {
        canEditStudent: canEditStudent?.() || false,
        canCreateStudent: canCreateStudent?.() || false,
        canDeleteStudent: canDeleteStudent?.() || false,
        canEditFaculty: canEditFaculty?.() || false,
        canCreateFaculty: canCreateFaculty?.() || false,
        canDeleteFaculty: canDeleteFaculty?.() || false,
        canEditStaff: canEditStaff?.() || false,
        canCreateStaff: canCreateStaff?.() || false,
      };
      window.appPermissions = perms;
    } catch (_) {}
  }, [
    canEditStudent, canCreateStudent, canDeleteStudent,
    canEditFaculty, canCreateFaculty, canDeleteFaculty,
    canEditStaff, canCreateStaff
  ]);

  // Data update handlers with enhanced relational integrity
  const handleDataUpdate = async (updatedRow) => {
    const isNewSchedule = updatedRow.id && updatedRow.id.startsWith('new_');
    const hasPermission = isNewSchedule ? (canCreateSchedule?.() || false) : (canEditSchedule?.() || false);

    if (!hasPermission) {
      const actionName = isNewSchedule ? 'create' : 'modify';
      showNotification('warning', 'Permission Denied', `You don't have permission to ${actionName} schedules.`);
      return;
    }
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
        const effectiveId = updatedRow._originalId || updatedRow.id;
        originalSchedule = rawScheduleData.find(s => s.id === effectiveId);
        if (!originalSchedule) {
          console.error('❌ Original schedule not found for update');
          showNotification('error', 'Update Failed', 'Original schedule not found.');
          return;
        }
        scheduleRef = doc(db, 'schedules', effectiveId);
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

      // Establish a reference schedule before computing dependent fields
      const referenceSchedule = isGroupedCourse ? originalSchedules[0] : originalSchedule;

      // Create meeting patterns from Day/Start Time/End Time (supports online synchronous)
      const meetingPatterns = [];
      const isOnlineFlag = updatedRow.isOnline === true || String(updatedRow.isOnline).toLowerCase() === 'true';
      const onlineMode = updatedRow.onlineMode || (referenceSchedule?.onlineMode || null);
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

      // Parse the course code to get program, level, and credits
      const courseCode = updatedRow.Course || (referenceSchedule?.courseCode || '');
      const parsedCourse = parseCourseCode(courseCode);
      const parsedProgram = parsedCourse.error ? '' : (parsedCourse.program || '');
      const subjectCodeRaw = parsedProgram || referenceSchedule?.subjectCode || referenceSchedule?.program || '';
      const subjectCode = subjectCodeRaw ? subjectCodeRaw.toString().toUpperCase() : '';
      const catalogNumber = parsedCourse.catalogNumber || referenceSchedule?.catalogNumber || courseCode.replace(/^[A-Z]{2,4}\s?/, '').toUpperCase();
      const derivedCredits = parsedCourse.error ? null : parsedCourse.credits;
      const computedCredits = derivedCredits ?? referenceSchedule?.credits ?? 0;

      // Prepare update data with proper relational structure
      const updateData = {
        courseCode: courseCode,
        courseTitle: updatedRow['Course Title'] || (referenceSchedule?.courseTitle || ''),
        program: subjectCode || parsedProgram,
        subjectCode,
        subject: subjectCode,
        catalogNumber,
        courseLevel: parsedCourse.level,
        section: updatedRow.Section || (referenceSchedule?.section || ''),
        crn: updatedRow.CRN || (referenceSchedule?.crn || ''),
        term: updatedRow.Term || (referenceSchedule?.term || ''),
        credits: computedCredits,
        scheduleType: updatedRow['Schedule Type'] || (referenceSchedule?.scheduleType || 'Class Instruction'),
        status: updatedRow.Status || (referenceSchedule?.status || 'Active'),
        
        // Relational references
        instructorId: instructorId,
        instructorName: updatedRow.Instructor || (referenceSchedule?.instructorName || ''),
        roomId: isOnlineFlag ? null : roomId,
        roomName: isOnlineFlag ? '' : (updatedRow.Room || (referenceSchedule?.roomName || '')),
        
        // Meeting patterns (persist even when online for synchronous meetings)
        meetingPatterns: meetingPatterns.length > 0 ? meetingPatterns : (referenceSchedule?.meetingPatterns || []),
        
        // Online flags
        isOnline: isOnlineFlag,
        onlineMode: isOnlineFlag ? (onlineMode || (meetingPatterns.length > 0 ? 'synchronous' : 'asynchronous')) : null,
        
        // Timestamps
        updatedAt: new Date().toISOString(),
        ...(isNewCourse && { createdAt: new Date().toISOString() })
      };

      // Validate required fields
      const validationErrors = [];
      if (!updateData.courseCode) validationErrors.push('Course code is required');
      if (!updateData.term) validationErrors.push('Term is required');
      if (!updateData.section) validationErrors.push('Section is required');
      const requiresMeeting = (!isOnlineFlag) || (isOnlineFlag && ((onlineMode || '').toLowerCase() === 'synchronous'));
      const hasExistingOrNewMeetings = (meetingPatterns.length > 0) || (Array.isArray(referenceSchedule?.meetingPatterns) && referenceSchedule.meetingPatterns.length > 0);
      if (requiresMeeting && !hasExistingOrNewMeetings) {
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
          (updatedRow._originalId || updatedRow.id),
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
    const isNewFaculty = !facultyToUpdate.id;
    const requiredPermission = isNewFaculty ? canCreateFaculty() : canEditFaculty();

    if (!requiredPermission) {
      const actionName = isNewFaculty ? 'create' : 'modify';
      showNotification('warning', 'Permission Denied', `You don't have permission to ${actionName} faculty members.`);
      return;
    }
    console.log('👤 Updating faculty member:', facultyToUpdate);

    try {
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
    const isNewStaff = !staffToUpdate.id;
    const requiredPermission = isNewStaff ? canCreateStaff() : canEditStaff();

    if (!requiredPermission) {
      const actionName = isNewStaff ? 'create' : 'modify';
      showNotification('warning', 'Permission Denied', `You don't have permission to ${actionName} staff members.`);
      return;
    }
    console.log('👥 Updating staff member:', staffToUpdate);
    
    try {
      let docRef;
      let action;
      let originalData = null;
      
      // Filter out undefined values to prevent Firebase errors
      const cleanStaffData = Object.fromEntries(
        Object.entries(staffToUpdate).filter(([_, value]) => value !== undefined)
      );
      
      if (staffToUpdate.id) {
        // Update existing staff member
        // Find original data for change logging
        originalData = rawPeople.find(p => p.id === staffToUpdate.id) || null;
        const staffRef = doc(db, 'people', staffToUpdate.id);
        const updateData = {
          ...cleanStaffData,
          updatedAt: new Date().toISOString()
        };
        
        await updateDoc(staffRef, updateData);
        docRef = staffRef;
        action = 'UPDATE';
        
        // Add to edit history (legacy)
        await addDoc(collection(db, 'editHistory'), {
          action: action,
          entity: `Staff - ${staffToUpdate.name}`,
          changes: updateData,
          timestamp: new Date().toISOString(),
          userId: 'system'
        });
        
        // Log change in centralized system with field diffs
        await logUpdate(
          `Staff - ${staffToUpdate.name}`,
          'people',
          staffToUpdate.id,
          updateData,
          originalData,
          'App.jsx - handleStaffUpdate'
        );
        
      } else {
        // Create new staff member
        const createData = {
          ...cleanStaffData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        docRef = await addDoc(collection(db, 'people'), createData);
        action = 'CREATE';
        
        // Add to edit history (legacy)
        await addDoc(collection(db, 'editHistory'), {
          action: action,
          entity: `Staff - ${staffToUpdate.name}`,
          changes: createData,
          timestamp: new Date().toISOString(),
          userId: 'system'
        });
        
        // Log change in centralized system
        await logCreate(
          `Staff - ${staffToUpdate.name}`,
          'people',
          docRef.id,
          createData,
          'App.jsx - handleStaffUpdate'
        );
      }

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
    if (!canDeleteFaculty()) {
      showNotification('warning', 'Permission Denied', 'You don\'t have permission to delete faculty members.');
      return;
    }
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
    if (!canEdit()) {
      showNotification('warning', 'Permission Denied', 'Only admins can delete staff.');
      return;
    }
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
    const isNewStudent = !studentToUpdate.id;
    const requiredPermission = isNewStudent ? canCreateStudent() : canEditStudent();

    if (!requiredPermission) {
      const actionName = isNewStudent ? 'create' : 'modify';
      showNotification('warning', 'Permission Denied', `You don't have permission to ${actionName} student workers.`);
      return;
    }
    console.log('🎓 Updating student worker:', studentToUpdate);

    try {
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
      
      // Derive isActive based on endDate unless explicitly set
      let derivedIsActive = cleanStudentData.isActive;
      try {
        const endDateStr = cleanStudentData.endDate || null;
        if (endDateStr) {
          const end = new Date(`${endDateStr}T23:59:59`);
          if (!isNaN(end.getTime())) {
            derivedIsActive = end >= new Date();
          }
        }
      } catch (_) {}

      const updateData = {
        ...cleanStudentData,
        // Ensure student role is set
        roles: ['student'],
        // If user provided isActive, respect it; otherwise use derived value or default true
        isActive: (cleanStudentData.isActive !== undefined ? cleanStudentData.isActive : (derivedIsActive !== undefined ? derivedIsActive : true)),
        updatedAt: new Date().toISOString()
      };

      if (isNewStudent) {
        // Use setDoc for new student to ensure we get the generated ID
        await setDoc(studentRef, { ...updateData, createdAt: new Date().toISOString() });
        // Non-blocking legacy history write
        try {
          await addDoc(collection(db, 'editHistory'), {
            action: 'CREATE',
            entity: `Student - ${studentToUpdate.name}`,
            changes: { ...updateData, createdAt: new Date().toISOString() },
            timestamp: new Date().toISOString(),
            userId: 'system'
          });
        } catch (_) {}
      } else {
        // Use updateDoc for existing student if doc exists; otherwise, create a new one
        const originalData = rawPeople.find(p => p.id === studentToUpdate.id) || null;
        if (!originalData) {
          console.warn('⚠️ Provided student id not found; creating new student instead of updating');
          const createRef = doc(collection(db, 'people'));
          await setDoc(createRef, { ...updateData, createdAt: new Date().toISOString() });

          // Non-blocking legacy history write
          try {
            await addDoc(collection(db, 'editHistory'), {
              action: 'CREATE',
              entity: `Student - ${studentToUpdate.name}`,
              changes: { ...updateData, createdAt: new Date().toISOString() },
              timestamp: new Date().toISOString(),
              userId: 'system'
            });
          } catch (_) {}
          // Log as create
          await logCreate(
            `Student - ${studentToUpdate.name}`,
            'people',
            createRef.id,
            { ...updateData, createdAt: new Date().toISOString() },
            'App.jsx - handleStudentUpdate'
          );

          await loadData();
          showNotification('success', 'Student Added', `${studentToUpdate.name} has been added to the student worker directory successfully.`);
          return;
        }

        await updateDoc(studentRef, updateData);
        // Non-blocking legacy history write
        try {
          await addDoc(collection(db, 'editHistory'), {
            action: actionType,
            entity: `Student - ${studentToUpdate.name}`,
            changes: updateData,
            timestamp: new Date().toISOString(),
            userId: 'system'
          });
        } catch (_) {}
        // Log with original for diffs
        await logUpdate(
          `Student - ${studentToUpdate.name}`,
          'people',
          studentToUpdate.id,
          updateData,
          originalData,
          'App.jsx - handleStudentUpdate'
        );
        
        // Refresh data and notify below as usual
        await loadData();
        const successMessage = `${studentToUpdate.name} has been updated successfully.`;
        showNotification('success', 'Student Updated', successMessage);
        return;
      }

      // Non-blocking legacy history write
      try {
        await addDoc(collection(db, 'editHistory'), {
          action: actionType,
          entity: `Student - ${studentToUpdate.name}`,
          changes: updateData,
          timestamp: new Date().toISOString(),
          userId: 'system'
        });
      } catch (_) {}

      // Log change in centralized system
      if (isNewStudent) {
        await logCreate(
          `Student - ${studentToUpdate.name}`,
          'people',
          studentRef.id,
          { ...updateData, createdAt: new Date().toISOString() },
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
      // Only show a hard error for true failures; suppress if write actually succeeded
      const friendly = (error && error.message) ? error.message : 'Unexpected error';
      const isPermission = (error && (error.code === 'permission-denied' || /insufficient permissions/i.test(error.message || '')));
      const isNew = !studentToUpdate.id;
      if (isPermission) {
        showNotification('warning', 'Permission Denied', 'Your account is not permitted to perform this action.');
      } else {
        showNotification('error', 'Operation Failed', isNew ? 'Failed to add student worker. Please try again.' : `Failed to update student worker. ${friendly}`);
      }
    }
  };

  const handleStudentDelete = async (studentToDelete) => {
    if (!canDeleteStudent()) {
      showNotification('warning', 'Permission Denied', 'You don\'t have permission to delete student workers.');
      return;
    }
    console.log('🗑️ Deleting student worker:', studentToDelete);
    
    try {
      // Accept either an id or full object
      const studentId = typeof studentToDelete === 'string' ? studentToDelete : studentToDelete.id;
      const existing = rawPeople.find(p => p.id === studentId) || null;
      const entityName = existing?.name || (typeof studentToDelete === 'object' ? studentToDelete.name : 'Unknown');

      // Delete from Firebase
      await deleteDoc(doc(db, 'people', studentId));

      // Add to edit history (legacy)
      await addDoc(collection(db, 'editHistory'), {
        action: 'DELETE',
        entity: `Student - ${entityName}`,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });

      // Log change in centralized system
      await logDelete(
        `Student - ${entityName}`,
        'people',
        studentId,
        existing || studentToDelete,
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
    if (!canDeleteSchedule?.()) {
      showNotification('warning', 'Permission Denied', 'You don\'t have permission to delete schedules.');
      return;
    }
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

  const confirmLogout = async () => {
    await signOut();
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticated');
    setShowLogoutConfirm(false);
    navigate('/dashboard');
  };

  const getCurrentBreadcrumb = () => {
    const pathParts = currentPage.split('/');
    const crumbs = [];
    const dashboardCrumb = { label: 'Dashboard', path: 'dashboard' };
    crumbs.push(dashboardCrumb);

    const section = navigationItems.find(item => item.id === pathParts[0]);
    if (!section || currentPage === 'dashboard') return crumbs;

    const sectionCrumb = {
      label: section.label,
      path: section.children && section.children.length > 0 ? section.children[0].path : null
    };
    crumbs.push(sectionCrumb);

    if (pathParts.length > 1) {
      const subsection = section.children?.find(child => child.path === currentPage);
      if (subsection) crumbs.push({ label: subsection.label, path: null });
    }

    return crumbs;
  };

  const getActiveSection = () => {
    const pathParts = currentPage.split('/');
    return navigationItems.find(item => item.id === pathParts[0]) || null;
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

    // Backward compatible student adapter: introduce jobs[] while preserving legacy fields
    const adaptedStudents = studentData.map((s) => {
      const legacyWeekly = Array.isArray(s.weeklySchedule) ? s.weeklySchedule : [];
      const legacyBuildings = Array.isArray(s.primaryBuildings)
        ? s.primaryBuildings
        : (s.primaryBuilding ? [s.primaryBuilding] : []);
      const legacyJob = {
        id: 'legacy',
        jobTitle: s.jobTitle || '',
        supervisor: s.supervisor || '',
        hourlyRate: s.hourlyRate || '',
        location: Array.isArray(s.primaryBuildings) ? s.primaryBuildings : legacyBuildings,
        weeklySchedule: legacyWeekly,
        startDate: s.startDate || '',
        endDate: s.endDate || ''
      };
      const jobsArray = Array.isArray(s.jobs) && s.jobs.length > 0 ? s.jobs : [legacyJob];
      // Compute unified weekly schedule for compatibility consumers
      const unifiedWeekly = jobsArray.flatMap(j => Array.isArray(j.weeklySchedule) ? j.weeklySchedule : []);
      const unifiedBuildings = Array.from(new Set(jobsArray.flatMap(j => Array.isArray(j.location) ? j.location : (j.location ? [j.location] : []))));
      // Compute effective active state if missing: endDate in past => inactive
      let effectiveIsActive = s.isActive;
      try {
        const endStr = s.endDate || (jobsArray[0]?.endDate) || '';
        if (endStr) {
          const end = new Date(`${endStr}T23:59:59`);
          if (!isNaN(end.getTime())) {
            effectiveIsActive = end >= new Date();
          }
        }
      } catch (_) {}

      return {
        ...s,
        isActive: (s.isActive !== undefined ? s.isActive : (effectiveIsActive !== undefined ? effectiveIsActive : true)),
        jobs: jobsArray,
        // preserve legacy fields for components not yet migrated
        weeklySchedule: unifiedWeekly,
        primaryBuildings: unifiedBuildings.length > 0 ? unifiedBuildings : legacyBuildings,
        jobTitle: s.jobTitle || (jobsArray[0]?.jobTitle || ''),
        supervisor: s.supervisor || (jobsArray[0]?.supervisor || ''),
        hourlyRate: s.hourlyRate || (jobsArray[0]?.hourlyRate || ''),
      };
    });

    const pageProps = {
      scheduleData,
      directoryData: rawPeople,
      facultyData: adaptPeopleToFaculty(rawPeople, rawScheduleData, rawPrograms),
      staffData: adaptPeopleToStaff(rawPeople, rawScheduleData, rawPrograms),
      studentData: adaptedStudents,
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
      canEdit,
      selectedSemester,
      availableSemesters,
      onSemesterDataImported: loadData,
      pinnedPages,
      togglePinPage,
      rawScheduleData,
    };

    switch (currentPage) {
      case 'dashboard':
        return (
          <ProtectedContent pageId="dashboard">
            <Dashboard {...pageProps} />
          </ProtectedContent>
        );
      case 'scheduling/faculty-schedules':
        return (
          <ProtectedContent pageId="scheduling/faculty-schedules">
            <FacultySchedules {...pageProps} />
          </ProtectedContent>
        );
      case 'scheduling/group-meeting-scheduler':
        return (
          <ProtectedContent pageId="scheduling/group-meeting-scheduler">
            <GroupMeetings {...pageProps} />
          </ProtectedContent>
        );
      case 'scheduling/individual-availability':
        return (
          <ProtectedContent pageId="scheduling/individual-availability">
            <IndividualAvailability {...pageProps} />
          </ProtectedContent>
        );
      case 'scheduling/room-schedules':
        return (
          <ProtectedContent pageId="scheduling/room-schedules">
            <RoomSchedules {...pageProps} />
          </ProtectedContent>
        );
      case 'scheduling/student-schedules':
        return (
          <ProtectedContent pageId="scheduling/student-schedules">
            <StudentSchedules {...pageProps} />
          </ProtectedContent>
        );
      case 'people/people-directory':
        return (
          <ProtectedContent pageId="people/people-directory">
            <PeopleDirectory {...pageProps} />
          </ProtectedContent>
        );
      case 'people/baylor-id-manager':
        return (
          <ProtectedContent pageId="people/baylor-id-manager">
            <BaylorIDManager {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/program-management':
        return (
          <ProtectedContent pageId="administration/program-management">
            <ProgramManagement {...pageProps} />
          </ProtectedContent>
        );
      case 'people/email-lists':
        return (
          <ProtectedContent pageId="people/email-lists">
            <EmailLists {...pageProps} />
          </ProtectedContent>
        );
      case 'resources/building-directory':
        return (
          <ProtectedContent pageId="resources/building-directory">
            <BuildingDirectory {...pageProps} />
          </ProtectedContent>
        );
      case 'analytics/department-insights':
        return (
          <ProtectedContent pageId="analytics/department-insights">
            <DepartmentInsights {...pageProps} />
          </ProtectedContent>
        );
      case 'analytics/course-management':
        return (
          <ProtectedContent pageId="analytics/course-management">
            <CourseManagement {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/recent-changes':
        return (
          <ProtectedContent pageId="administration/recent-changes">
            <RecentChangesPage {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/import-wizard':
        return (
          <ProtectedContent pageId="administration/import-wizard">
            <ImportWizard {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/data-hygiene':
        return (
          <ProtectedContent pageId="administration/data-hygiene">
            <DataHygieneManager {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/crn-tools':
        return (
          <ProtectedContent pageId="administration/crn-tools">
            <CRNQualityTools {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/outlook-export':
        return (
          <ProtectedContent pageId="administration/outlook-export">
            <OutlookRoomExport {...pageProps} />
          </ProtectedContent>
        );
      // removed orphaned-data-cleanup standalone page; use Data Hygiene wizard
      case 'administration/baylor-systems':
        return (
          <ProtectedContent pageId="administration/baylor-systems">
            <SystemsPage {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/baylor-acronyms':
        return (
          <ProtectedContent pageId="administration/baylor-acronyms">
            <BaylorAcronyms {...pageProps} />
          </ProtectedContent>
        );
      case 'resources/room-grid-generator':
        return (
          <ProtectedContent pageId="resources/room-grid-generator">
            <RoomGridGenerator {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/access-control':
        return (
          <ProtectedContent pageId="administration/access-control">
            <AccessControl {...pageProps} />
          </ProtectedContent>
        );
      case 'administration/user-activity':
        return (
          <ProtectedContent pageId="administration/user-activity">
            <UserActivityDashboard {...pageProps} />
          </ProtectedContent>
        );
      default:
        return (
          <ProtectedContent pageId="dashboard">
            <Dashboard {...pageProps} />
          </ProtectedContent>
        );
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
      {/* Professional Sidebar - Desktop */}
      <div className="hidden md:block">
        <Sidebar
          navigationItems={navigationItems}
          currentPage={currentPage}
          onNavigate={(path) => { handleNavigate(path); }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          selectedSemester={selectedSemester}
          pinnedPages={pinnedPages}
          togglePinPage={togglePinPage}
        />
      </div>

      {/* Mobile Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileSidebarOpen(false)}></div>
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold text-baylor-green">Navigation</div>
              <button onClick={() => setMobileSidebarOpen(false)} className="p-2 rounded-md hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <Sidebar
              navigationItems={navigationItems}
              currentPage={currentPage}
              onNavigate={(path) => { setMobileSidebarOpen(false); handleNavigate(path); }}
              collapsed={false}
              onToggleCollapse={() => {}}
              selectedSemester={selectedSemester}
              pinnedPages={pinnedPages}
              togglePinPage={togglePinPage}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Professional Header Bar */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
            {/* Left: Mobile menu + Breadcrumb */}
            <div className="flex items-center space-x-3">
              <button className="md:hidden p-2 rounded-md hover:bg-gray-100" aria-label="Open menu" onClick={() => setMobileSidebarOpen(true)}>
                <Menu className="w-5 h-5 text-gray-700" />
              </button>
              <div className="flex items-center space-x-2">
                <GraduationCap className="w-5 h-5 text-baylor-green" />
                <nav className="flex items-center space-x-2 text-sm">
                  {getCurrentBreadcrumb().map((crumb, index, arr) => (
                    <React.Fragment key={index}>
                      {index > 0 && <span className="text-gray-400">/</span>}
                      {crumb.path ? (
                        <button
                          className="text-gray-600 hover:text-baylor-green"
                          onClick={() => handleNavigate(crumb.path)}
                        >
                          {crumb.label}
                        </button>
                      ) : (
                        <span className={index === arr.length - 1 ? 'text-baylor-green font-medium' : 'text-gray-600'}>
                          {crumb.label}
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center space-x-2 md:space-x-4">


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
                <span className="ml-2 hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>

          {/* Section Sub-navigation */}
          {getActiveSection()?.children && getActiveSection().children.length > 0 && (
            <div className="px-4 md:px-6 pb-2">
              <div className="flex flex-wrap gap-2">
                {getActiveSection().children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => handleNavigate(child.path)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      currentPage === child.path
                        ? 'bg-baylor-green/10 text-baylor-green border-baylor-green/30'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
            {renderPageContent()}
          </div>
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
