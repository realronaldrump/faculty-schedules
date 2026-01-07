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
import { fetchPrograms } from '../utils/dataAdapter';
import { autoMigrateIfNeeded } from '../utils/importTransactionMigration';
import { fetchRecentChanges } from '../utils/recentChanges';
import { usePermissions } from '../utils/permissions';
import { adaptPeopleToFaculty, adaptPeopleToStaff } from '../utils/dataAdapter';

// Import new contexts
import { usePeople } from './PeopleContext';
import { useSchedules } from './ScheduleContext';

const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
  // Consumed Contexts
  const {
    people: rawPeople,
    loadPeople,
    addPerson,
    updatePerson,
    deletePerson,
    loading: peopleLoading
  } = usePeople();

  const {
    rawScheduleData,
    scheduleData, // Pre-flattened schedule data
    selectedSemester,
    setSelectedSemester,
    availableSemesters,
    loading: schedulesLoading
  } = useSchedules();

  // Local state for other entities
  const [rawPrograms, setRawPrograms] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [recentChanges, setRecentChanges] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [programsLoaded, setProgramsLoaded] = useState(false);
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

  // Analytics calculation (Legacy, keep for now)
  const analytics = useMemo(() => {
    if (!scheduleData || scheduleData.length === 0) return null;

    // Simple recalculation based on available data
    const instructors = new Set();
    const rooms = new Set();
    const courses = new Set();
    const daySchedules = { M: 0, T: 0, W: 0, R: 0, F: 0 };

    scheduleData.forEach(s => {
      if (s.Instructor) instructors.add(s.Instructor);
      if (s.Room && s.Room !== 'Online') rooms.add(s.Room);
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

    // Semester State (Delegated)
    selectedSemester,
    setSelectedSemester,
    availableSemesters,

    loading,
    dataError,

    // Actions
    loadData,
    loadPrograms,
    loadEditHistory,
    loadRecentChanges,
    refreshData: (options = {}) => loadData({ silent: true, ...options }),

    // Load State
    programsLoaded,
    editHistoryLoaded,
    recentChangesLoaded,

    // Permissions (Passthrough)
    ...permissions
  }), [
    rawScheduleData, rawPeople, rawPrograms,
    scheduleData, facultyData, staffData, studentData,
    analytics, editHistory, recentChanges,
    selectedSemester, availableSemesters,
    loading, dataError, loadData,
    loadPrograms, loadEditHistory, loadRecentChanges,
    programsLoaded, editHistoryLoaded, recentChangesLoaded,
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
