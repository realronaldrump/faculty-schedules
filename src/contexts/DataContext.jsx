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

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { fetchPrograms, getInstructorDisplayName, UNASSIGNED } from '../utils/dataAdapter';
import { autoMigrateIfNeeded } from '../utils/importTransactionMigration';
import { fetchRecentChanges } from '../utils/recentChanges';
import { usePermissions } from '../utils/permissions';
import { parseCourseCode } from '../utils/courseUtils';
import { adaptPeopleToFaculty, adaptPeopleToStaff } from '../utils/dataAdapter';

// Import new contexts
import { usePeople } from './PeopleContext';
import { useSchedules } from './ScheduleContext';

const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
  // Consumed Contexts
  const {
    people: rawPeople,
    allPeople,
    peopleIndex,
    loadPeople,
    addPerson,
    updatePerson,
    deletePerson,
    loading: peopleLoading
  } = usePeople();

  const {
    rawScheduleData,
    selectedSemester,
    setSelectedSemester,
    availableSemesters,
    loading: schedulesLoading
  } = useSchedules();

  // Local state for other entities
  const [rawPrograms, setRawPrograms] = useState([]);
  const [roomsData, setRoomsData] = useState({});
  const [editHistory, setEditHistory] = useState([]);
  const [recentChanges, setRecentChanges] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [programsLoaded, setProgramsLoaded] = useState(false);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [editHistoryLoaded, setEditHistoryLoaded] = useState(false);
  const [recentChangesLoaded, setRecentChangesLoaded] = useState(false);

  // Permissions
  const permissions = usePermissions();

  // One-time migration check
  useEffect(() => {
    autoMigrateIfNeeded().catch((error) => {
      console.error('Auto-migration failed:', error);
    });
  }, []);

  // Combined Loading State
  const loading = localLoading || peopleLoading || schedulesLoading;

  // Helper to derive credits
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

  const peopleById = useMemo(() => {
    return new Map((rawPeople || []).map(person => [person.id, person]));
  }, [rawPeople]);

  const splitInstructorNames = (value) => {
    if (!value) return [];
    return String(value)
      .split(/;|\/|\s+&\s+|\s+and\s+/i)
      .map((part) => part.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').trim())
      .filter(Boolean);
  };

  const buildInstructorInfo = useCallback((schedule) => {
    if (!schedule) {
      return {
        instructorIds: [],
        instructorNames: [],
        instructors: [],
        primaryInstructorId: '',
        primaryInstructor: null,
        displayName: UNASSIGNED
      };
    }

    const assignments = Array.isArray(schedule.instructorAssignments)
      ? schedule.instructorAssignments
      : [];
    const assignmentIds = assignments
      .map((assignment) => assignment?.personId || assignment?.instructorId || assignment?.id)
      .filter(Boolean);
    const instructorIds = Array.from(new Set([
      ...(Array.isArray(schedule.instructorIds) ? schedule.instructorIds : []),
      ...assignmentIds,
      schedule.instructorId
    ])).filter(Boolean);

    const instructors = instructorIds
      .map((id) => peopleById.get(id))
      .filter(Boolean);
    const resolvedNames = instructors
      .map((person) => getInstructorDisplayName(person))
      .filter((name) => name && name !== UNASSIGNED);
    const fallbackName = (schedule.instructorName || schedule.Instructor || '').trim();
    const instructorNames = resolvedNames.length > 0
      ? resolvedNames
      : splitInstructorNames(fallbackName);

    const primaryInstructorId = schedule.instructorId
      || assignments.find((assignment) => assignment?.isPrimary)?.personId
      || instructorIds[0]
      || '';
    const primaryInstructor = primaryInstructorId ? peopleById.get(primaryInstructorId) : null;
    const displayName = instructorNames.length > 0
      ? instructorNames.join(' / ')
      : UNASSIGNED;

    return {
      instructorIds,
      instructorNames,
      instructors,
      primaryInstructorId,
      primaryInstructor,
      displayName
    };
  }, [peopleById]);

  // Computed schedule objects (flattened for UI)
  const scheduleData = useMemo(() => {
    if (!rawScheduleData || rawScheduleData.length === 0) return [];

    const flattened = [];
    rawScheduleData.forEach(schedule => {
      if (!schedule || !schedule.id) return;

      const {
        instructorIds,
        instructorNames,
        instructors,
        primaryInstructorId,
        primaryInstructor,
        displayName
      } = buildInstructorInfo(schedule);

      // Helper to create reliable display strings
      const getRoomDisplay = (s) => {
        if (s.locationType === 'no_room' || s.isOnline) {
          return s.locationLabel || 'No Room Needed';
        }
        if (Array.isArray(s.roomNames)) return s.roomNames.join('; ');
        return s.roomName || '';
      };

      const commonProps = {
        ...schedule,
        Course: schedule.courseCode || '',
        'Course Title': schedule.courseTitle || '',
        Instructor: displayName,
        instructorName: displayName,
        InstructorId: primaryInstructorId || '',
        instructorId: primaryInstructorId || '',
        instructorIds,
        instructorNames,
        instructors,
        instructor: primaryInstructor,
        Section: schedule.section || '',
        Credits: deriveCreditsFromSchedule(schedule.courseCode, schedule.credits),
        Program: schedule.program || '',
        Term: schedule.term || '',
        Status: schedule.status || 'Active',
        _originalId: schedule.id
      };

      if (schedule.meetingPatterns && schedule.meetingPatterns.length > 0) {
        schedule.meetingPatterns.forEach((pattern, idx) => {
          flattened.push({
            ...commonProps,
            id: `${schedule.id}-${idx}`,
            Day: pattern.day,
            'Start Time': pattern.startTime,
            'End Time': pattern.endTime,
            Room: getRoomDisplay(schedule)
          });
        });
      } else {
        flattened.push({
          ...commonProps,
          id: schedule.id,
          Room: getRoomDisplay(schedule)
        });
      }
    });
    return flattened;
  }, [rawScheduleData, buildInstructorInfo]);

  // Analytics calculation (Legacy, keep for now)
  const analytics = useMemo(() => {
    if (!scheduleData || scheduleData.length === 0) return null;

    // Simple recalculation based on available data
    const instructors = new Set();
    const rooms = new Set();
    const courses = new Set();
    const daySchedules = { M: 0, T: 0, W: 0, R: 0, F: 0 };

    scheduleData.forEach(s => {
      const names = Array.isArray(s.instructorNames)
        ? s.instructorNames
        : (s.Instructor ? [s.Instructor] : []);
      names.forEach((name) => {
        if (name) instructors.add(name);
      });
      const roomLabel = s.Room || '';
      const lowerRoom = roomLabel.toLowerCase();
      if (roomLabel && lowerRoom !== 'online' && !lowerRoom.includes('no room needed')) {
        rooms.add(roomLabel);
      }
      if (s.Course) courses.add(s.Course);
      if (s.Day && daySchedules[s.Day] !== undefined) daySchedules[s.Day]++;
    });

    const busiestDay = Object.entries(daySchedules).reduce(
      (max, [day, count]) => count > max.count ? { day, count } : max,
      { day: 'M', count: 0 }
    );

    return {
      facultyCount: instructors.size,
      totalSessions: scheduleData.length,
      adjunctTaughtSessions: 0, // Simplified for now
      roomsInUse: rooms.size,
      uniqueCourses: courses.size,
      busiestDay
    };
  }, [scheduleData]);

  // Adapters with Cross-Linking (This preserves 'Fat' objects for legacy views)
  const facultyData = useMemo(() => {
    return adaptPeopleToFaculty(rawPeople, rawScheduleData, rawPrograms);
  }, [rawPeople, rawScheduleData, rawPrograms]);

  const staffData = useMemo(() => {
    return adaptPeopleToStaff(rawPeople, rawScheduleData, rawPrograms);
  }, [rawPeople, rawScheduleData, rawPrograms]);

  const studentData = useMemo(() => {
    // Re-use logic or just filter rawPeople if adapter not needed
    // For now, simpler filter to match previous behavior
    return rawPeople.filter(person => {
      if (!person.roles) return false;
      const roles = Array.isArray(person.roles) ? person.roles : (typeof person.roles === 'object' ? Object.keys(person.roles).filter(k => person.roles[k]) : []);
      return roles.includes('student');
    }).map(s => ({ ...s, jobs: s.jobs || [] })); // Basic mapping
  }, [rawPeople]);

  const loadPrograms = useCallback(async ({ force = false } = {}) => {
    if (programsLoaded && !force) return rawPrograms;
    try {
      const programs = await fetchPrograms();
      setRawPrograms(programs);
      setProgramsLoaded(true);
      return programs;
    } catch (e) {
      console.error('Programs load error:', e);
      setDataError(e.message);
      return [];
    }
  }, [programsLoaded, rawPrograms]);

  // Load rooms from Firestore
  const loadRooms = useCallback(async ({ force = false } = {}) => {
    if (roomsLoaded && !force) return roomsData;
    try {
      const snap = await getDocs(collection(db, 'rooms'));
      const rooms = {};
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        // Only include active rooms
        if (data.isActive !== false) {
          rooms[docSnap.id] = { id: docSnap.id, ...data };
        }
      });
      setRoomsData(rooms);
      setRoomsLoaded(true);
      return rooms;
    } catch (e) {
      console.error('Rooms load error:', e);
      setDataError(e.message);
      return {};
    }
  }, [roomsLoaded, roomsData]);

  // Refresh rooms (force reload)
  const refreshRooms = useCallback(() => loadRooms({ force: true }), [loadRooms]);

  const loadEditHistory = useCallback(async ({ force = false } = {}) => {
    if (editHistoryLoaded && !force) return editHistory;
    try {
      const snap = await getDocs(query(collection(db, 'editHistory'), orderBy('timestamp', 'desc')));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEditHistory(items);
      setEditHistoryLoaded(true);
      return items;
    } catch (e) {
      console.error('Edit history load error:', e);
      setDataError(e.message);
      return [];
    }
  }, [editHistoryLoaded, editHistory]);

  const loadRecentChanges = useCallback(async ({ limit = 100, force = false } = {}) => {
    if (recentChangesLoaded && !force) return recentChanges;
    try {
      const changes = await fetchRecentChanges(limit);
      setRecentChanges(changes);
      setRecentChangesLoaded(true);
      return changes;
    } catch (e) {
      console.error('Recent changes load error:', e);
      setDataError(e.message);
      return [];
    }
  }, [recentChangesLoaded, recentChanges]);

  // Main Load Orchestrator
  const loadData = useCallback(async ({
    silent = false,
    includePeople = true,
    includePrograms = true,
    includeEditHistory = true,
    includeRecentChanges = true,
    force = false
  } = {}) => {
    if (!silent) setLocalLoading(true);
    try {
      console.log('📡 DataContext: Orchestrating data load...');

      const tasks = [];
      if (includePeople) tasks.push(loadPeople({ force }));
      if (includePrograms) tasks.push(loadPrograms({ force }));
      if (includeEditHistory) tasks.push(loadEditHistory({ force }));
      if (includeRecentChanges) tasks.push(loadRecentChanges({ force }));

      await Promise.all(tasks);
      // Note: Schedules load automatically via ScheduleContext when semester is set
    } catch (e) {
      console.error('Data load error:', e);
      setDataError(e.message);
    } finally {
      if (!silent) setLocalLoading(false);
    }
  }, [loadPeople, loadPrograms, loadEditHistory, loadRecentChanges]);

  // Initial Load effect handled by components calling loadData or individual contexts

  const value = useMemo(() => ({
    // Passthrough Data
    rawScheduleData,
    rawPeople,
    allPeople,
    peopleIndex,
    rawPrograms,

    // Transformed/Legacy Data
    scheduleData,
    facultyData,
    staffData,
    studentData,
    programs: rawPrograms,
    directoryData: rawPeople,

    analytics,
    editHistory,
    recentChanges,

    // Rooms/Spaces Data
    roomsData,

    // Semester State (Delegated)
    selectedSemester,
    setSelectedSemester,
    availableSemesters,

    loading,
    dataError,

    // Actions
    loadData,
    loadPrograms,
    loadRooms,
    refreshRooms,
    loadEditHistory,
    loadRecentChanges,
    refreshData: (options = {}) => loadData({ silent: true, ...options }),

    // Load State
    programsLoaded,
    roomsLoaded,
    editHistoryLoaded,
    recentChangesLoaded,

    // Permissions (Passthrough)
    ...permissions
  }), [
    rawScheduleData, rawPeople, allPeople, peopleIndex, rawPrograms,
    scheduleData, facultyData, staffData, studentData,
    analytics, editHistory, recentChanges, roomsData,
    selectedSemester, availableSemesters,
    loading, dataError, loadData,
    loadPrograms, loadRooms, refreshRooms, loadEditHistory, loadRecentChanges,
    programsLoaded, roomsLoaded, editHistoryLoaded, recentChangesLoaded,
    permissions
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
