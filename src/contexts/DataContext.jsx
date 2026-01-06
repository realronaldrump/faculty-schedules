/**
 * DataContext - Centralized data management for the application
 *
 * This context eliminates prop drilling by providing data and operations
 * to any component in the tree via the useData() hook.
 *
 * Responsibilities:
 * - Loading and caching people, schedules, programs, and rooms
 * - Semester selection and filtering
 * - CRUD operations for all entities
 * - Data transformation and adaptation
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db, COLLECTIONS } from '../firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, setDoc, query, orderBy, getDoc, where } from 'firebase/firestore';
import { adaptPeopleToFaculty, adaptPeopleToStaff, fetchPrograms } from '../utils/dataAdapter';
import { fetchSchedulesByTerm, fetchAvailableSemesters } from '../utils/dataImportUtils';
import { autoMigrateIfNeeded } from '../utils/importTransactionMigration';
import { parseCourseCode } from '../utils/courseUtils';
import { logCreate, logUpdate, logDelete } from '../utils/changeLogger';
import { fetchRecentChanges } from '../utils/recentChanges';
import { usePermissions } from '../utils/permissions';
import { getProgramNameKey, isReservedProgramName, normalizeProgramName } from '../utils/programUtils';

const DataContext = createContext(null);

// Helper to derive credits from course code
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

export const DataProvider = ({ children }) => {
  // Raw data from Firebase
  const [rawScheduleData, setRawScheduleData] = useState([]);
  const [rawPeople, setRawPeople] = useState([]);
  const [rawPrograms, setRawPrograms] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [recentChanges, setRecentChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  // Semester state
  const [selectedSemester, setSelectedSemester] = useState(() => {
    return localStorage.getItem('selectedSemester') || '';
  });
  const [availableSemesters, setAvailableSemesters] = useState([]);

  // Permissions
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
    canDeleteSchedule,
    canCreateProgram
  } = usePermissions();

  // Initial load ref to prevent double-loading on semester change
  const isInitialLoadRef = useRef(true);

  // Persist selected semester to localStorage
  useEffect(() => {
    if (selectedSemester) {
      localStorage.setItem('selectedSemester', selectedSemester);
    }
  }, [selectedSemester]);

  // Auto-backfill online flags for legacy records
  const autoBackfillOnlineFlags = useCallback(async (schedules) => {
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
            logUpdate(
              `Schedule - ${schedule.courseCode || ''} ${schedule.section || ''} (${schedule.instructorName || ''})`,
              'schedules',
              schedule.id,
              updates,
              schedule,
              'DataContext - autoBackfillOnlineFlags'
            ).catch(() => {});
            updatesPerformed.push(schedule.id);
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
  }, []);

  // Auto-inactivate expired student workers
  const autoInactivateExpiredStudents = useCallback(async (people) => {
    try {
      const now = new Date();
      const candidates = (people || []).filter(p => {
        const hasStudentRole = Array.isArray(p.roles) ? p.roles.includes('student') : (typeof p.roles === 'object' && p.roles?.student === true);
        if (!hasStudentRole) return false;
        const endStr = p.endDate || (Array.isArray(p.jobs) && p.jobs[0]?.endDate) || '';
        if (!endStr) return false;
        const end = new Date(`${endStr}T23:59:59`);
        if (isNaN(end.getTime())) return false;
        return end < now && p.isActive !== false;
      });

      for (const person of candidates) {
        try {
          const personRef = doc(db, 'people', person.id);
          const updates = { isActive: false, updatedAt: new Date().toISOString() };
          await updateDoc(personRef, updates);
          logUpdate(
            `Student - ${person.name || person.id}`,
            'people',
            person.id,
            updates,
            person,
            'DataContext - autoInactivateExpiredStudents'
          ).catch(() => {});
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
  }, []);

  // Fetch available semesters and set default
  const updateAvailableSemesters = useCallback(async () => {
    try {
      const semesterList = await fetchAvailableSemesters();

      if (semesterList.length === 0) {
        setAvailableSemesters([]);
        return null;
      }

      console.log('🎓 Available semesters:', semesterList);
      setAvailableSemesters(semesterList);

      // Check for admin-configured default term
      let defaultTermToUse = semesterList[0];
      try {
        const settingsRef = doc(db, 'settings', 'app');
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
          const adminDefaultTerm = settingsSnap.data()?.defaultTerm;
          if (adminDefaultTerm && semesterList.includes(adminDefaultTerm)) {
            defaultTermToUse = adminDefaultTerm;
            console.log(`🎓 Using admin-configured default term: ${adminDefaultTerm}`);
          } else if (adminDefaultTerm) {
            console.warn(`⚠️ Admin default term "${adminDefaultTerm}" not found in available semesters`);
          }
        }
      } catch (error) {
        console.warn('Failed to load default term setting:', error);
      }

      // Set semester if not valid
      const currentIsValid = selectedSemester && semesterList.includes(selectedSemester);
      if (!currentIsValid) {
        console.log(`🎓 Setting semester to default: ${defaultTermToUse}`);
        setSelectedSemester(defaultTermToUse);
        return defaultTermToUse;
      } else {
        console.log(`🎓 Preserving current valid semester: ${selectedSemester}`);
        return selectedSemester;
      }
    } catch (error) {
      console.error('Error updating available semesters:', error);
      return null;
    }
  }, [selectedSemester]);

  // Load schedules for a specific term
  const loadSchedulesForTerm = useCallback(async (term, { people = null } = {}) => {
    if (!term) {
      console.warn('⚠️ No term specified for loadSchedulesForTerm');
      return;
    }

    try {
      console.log(`📡 Loading schedules for term: ${term}`);

      let { schedules, people: schedulePeople } = await fetchSchedulesByTerm(term);
      schedules = await autoBackfillOnlineFlags(schedules);

      let allPeople = people;
      if (!allPeople) {
        const peopleSnapshot = await getDocs(collection(db, 'people'));
        allPeople = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Merge people from schedules with directory people
      const mergedPeople = [...allPeople];
      schedulePeople.forEach(schedulePerson => {
        if (!allPeople.find(p => p.id === schedulePerson.id)) {
          mergedPeople.push(schedulePerson);
        }
      });

      await autoInactivateExpiredStudents(mergedPeople);

      setRawScheduleData(schedules);
      setRawPeople(mergedPeople);

      console.log(`✅ Loaded ${schedules.length} schedules for term "${term}"`);
      return schedules;
    } catch (error) {
      console.error(`❌ Error loading schedules for term "${term}":`, error);
      throw error;
    }
  }, [autoBackfillOnlineFlags, autoInactivateExpiredStudents]);

  // Main data loading function
  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setDataError(null);

    try {
      console.log('📡 Loading data from Firebase...');
      await autoMigrateIfNeeded();

      const termToLoad = await updateAvailableSemesters();

      if (!termToLoad) {
        console.warn('⚠️ No semesters available');
        setRawScheduleData([]);
        setRawPeople([]);
        setRawPrograms([]);
        setLoading(false);
        return;
      }

      // Load people
      const peopleSnapshot = await getDocs(collection(db, 'people'));
      const people = peopleSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Load programs
      const programs = await fetchPrograms();

      // Load schedules for the selected term
      await loadSchedulesForTerm(termToLoad, { people });

      // Load edit history (legacy)
      let history = [];
      try {
        const historySnapshot = await getDocs(query(collection(db, 'editHistory'), orderBy('timestamp', 'desc')));
        history = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.warn('editHistory read skipped:', e?.code || e);
      }

      // Load recent changes
      let recentChangesData = [];
      try {
        recentChangesData = await fetchRecentChanges(100);
      } catch (e) {
        console.warn('recentChanges read skipped:', e?.code || e);
      }

      console.log('✅ Data loaded successfully:', {
        term: termToLoad,
        people: people.length,
        programs: programs.length,
        history: history.length,
        recentChanges: recentChangesData.length
      });

      setRawPrograms(programs);
      setEditHistory(history);
      setRecentChanges(recentChangesData);

    } catch (error) {
      console.error('❌ Error loading data:', error);
      setDataError(error.message || 'Failed to load data');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [updateAvailableSemesters, loadSchedulesForTerm]);

  // Reload schedules when semester changes (after initial load)
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    if (selectedSemester && availableSemesters.length > 0) {
      console.log(`🔄 Semester changed to "${selectedSemester}", reloading schedules...`);
      loadSchedulesForTerm(selectedSemester);
    }
  }, [selectedSemester, availableSemesters.length, loadSchedulesForTerm]);

  // Transform schedule data for component compatibility
  const scheduleData = useMemo(() => {
    if (!rawScheduleData || rawScheduleData.length === 0) return [];

    const flattenedData = [];

    rawScheduleData.forEach(schedule => {
      if (!schedule || !schedule.id) {
        console.warn('⚠️ Skipping invalid schedule:', schedule);
        return;
      }

      if (schedule.meetingPatterns && Array.isArray(schedule.meetingPatterns) && schedule.meetingPatterns.length > 0) {
        schedule.meetingPatterns.forEach((pattern, index) => {
          if (!pattern) return;

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
            Course: schedule.courseCode || '',
            'Course Title': schedule.courseTitle || '',
            Instructor: schedule.instructor ? `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() : (schedule.instructorName || ''),
            Section: schedule.section || '',
            Credits: creditsValue ?? '',
            Program: programCode,
            Term: schedule.term || '',
            Day: pattern.day || '',
            'Start Time': pattern.startTime || '',
            'End Time': pattern.endTime || '',
            Room: roomDisplay,
            'Room Capacity': Array.isArray(schedule.rooms) && schedule.rooms.length > 0 ? (schedule.rooms[0]?.capacity || '') : (schedule.room ? schedule.room.capacity : ''),
            CRN: schedule.crn || schedule.CRN || '',
            'Course Level': schedule.courseLevel || '',
            'Course Type': programCode,
            'Schedule Type': schedule.scheduleType || 'Class Instruction',
            Status: schedule.status || 'Active',
            ...schedule,
            _originalId: schedule.id
          });
        });
      } else {
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

    return flattenedData;
  }, [rawScheduleData]);

  // Analytics calculation
  const analytics = useMemo(() => {
    if (!scheduleData || scheduleData.length === 0) return null;

    const instructors = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.Instructor && schedule.Instructor.trim()) {
        instructors.add(schedule.Instructor.trim());
      }
    });

    const totalSessions = scheduleData.length;

    const adjunctTaughtSessions = scheduleData.filter(schedule => {
      const instructorName = schedule.Instructor || '';
      const facultyMember = rawPeople.find(person => person.name === instructorName);
      return facultyMember && facultyMember.isAdjunct;
    }).length;

    const rooms = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.Room && schedule.Room.trim() && schedule.Room.trim().toLowerCase() !== 'online') {
        rooms.add(schedule.Room.trim());
      }
    });

    const courses = new Set();
    scheduleData.forEach(schedule => {
      if (schedule.Course && schedule.Course.trim()) {
        courses.add(schedule.Course.trim());
      }
    });

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

    return {
      facultyCount: instructors.size,
      totalSessions,
      adjunctTaughtSessions,
      roomsInUse: rooms.size,
      uniqueCourses: courses.size,
      busiestDay
    };
  }, [scheduleData, rawPeople]);

  // Adapted data for components
  const facultyData = useMemo(() => {
    return adaptPeopleToFaculty(rawPeople, rawScheduleData, rawPrograms);
  }, [rawPeople, rawScheduleData, rawPrograms]);

  const staffData = useMemo(() => {
    return adaptPeopleToStaff(rawPeople, rawScheduleData, rawPrograms);
  }, [rawPeople, rawScheduleData, rawPrograms]);

  // Student data with jobs array support
  const studentData = useMemo(() => {
    const students = rawPeople.filter(person => {
      if (!person.roles) return false;
      if (Array.isArray(person.roles)) {
        return person.roles.includes('student');
      }
      if (typeof person.roles === 'object') {
        return person.roles.student === true;
      }
      return false;
    });

    return students.map((s) => {
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
      const unifiedWeekly = jobsArray.flatMap(j => Array.isArray(j.weeklySchedule) ? j.weeklySchedule : []);
      const unifiedBuildings = Array.from(new Set(jobsArray.flatMap(j => Array.isArray(j.location) ? j.location : (j.location ? [j.location] : []))));

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
        weeklySchedule: unifiedWeekly,
        primaryBuildings: unifiedBuildings.length > 0 ? unifiedBuildings : legacyBuildings,
        jobTitle: s.jobTitle || (jobsArray[0]?.jobTitle || ''),
        supervisor: s.supervisor || (jobsArray[0]?.supervisor || ''),
        hourlyRate: s.hourlyRate || (jobsArray[0]?.hourlyRate || ''),
      };
    });
  }, [rawPeople]);

  // Context value with all data and operations
  const value = useMemo(() => ({
    // Raw data
    rawScheduleData,
    rawPeople,
    rawPrograms,

    // Transformed data
    scheduleData,
    facultyData,
    staffData,
    studentData,
    programs: rawPrograms,
    directoryData: rawPeople,

    // Analytics
    analytics,

    // History
    editHistory,
    recentChanges,

    // Semester state
    selectedSemester,
    setSelectedSemester,
    availableSemesters,

    // Loading state
    loading,
    dataError,

    // Data operations
    loadData,
    refreshData: () => loadData({ silent: true }),

    // Permissions (exposed for components)
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
    canDeleteSchedule,
    canCreateProgram
  }), [
    rawScheduleData,
    rawPeople,
    rawPrograms,
    scheduleData,
    facultyData,
    staffData,
    studentData,
    analytics,
    editHistory,
    recentChanges,
    selectedSemester,
    availableSemesters,
    loading,
    dataError,
    loadData,
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
    canDeleteSchedule,
    canCreateProgram
  ]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

export default DataContext;
