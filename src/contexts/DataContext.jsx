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

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import {
  fetchPrograms,
  getInstructorDisplayName,
  UNASSIGNED,
} from "../utils/dataAdapter";
import { fetchRecentChanges } from "../utils/recentChanges";
import { usePermissions } from "../utils/permissions";
import { buildCourseSectionKey, parseCourseCode } from "../utils/courseUtils";
import { adaptPeopleToFaculty, adaptPeopleToStaff } from "../utils/dataAdapter";
import { applySemesterSchedule } from "../utils/studentWorkers";
import { isStudentWorker } from "../utils/peopleUtils";
import {
  normalizeSpaceRecord,
  resolveScheduleSpaces,
} from "../utils/spaceUtils";

// Import new contexts
import { usePeople } from "./PeopleContext";
import { useSchedules } from "./ScheduleContext";

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
    loading: peopleLoading,
  } = usePeople();

  const {
    rawScheduleData,
    selectedSemester,
    setSelectedSemester,
    availableSemesters,
    selectedTermMeta,
    loading: schedulesLoading,
  } = useSchedules();

  // Local state for other entities
  const [rawPrograms, setRawPrograms] = useState([]);
  const [rawCourses, setRawCourses] = useState([]);
  const [roomsData, setRoomsData] = useState({});
  const [spacesByKey, setSpacesByKey] = useState(new Map());
  const [spacesList, setSpacesList] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [recentChanges, setRecentChanges] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [programsLoaded, setProgramsLoaded] = useState(false);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const roomsUnsubscribeRef = useRef(null);
  const [editHistoryLoaded, setEditHistoryLoaded] = useState(false);
  const [recentChangesLoaded, setRecentChangesLoaded] = useState(false);

  // Permissions
  const permissions = usePermissions();

  // Combined Loading State
  const loading = localLoading || peopleLoading || schedulesLoading;

  // Helper to derive credits
  const deriveCreditsFromSchedule = (courseCode, credits) => {
    if (credits !== undefined && credits !== null && credits !== "") {
      const numericCredits = Number(credits);
      if (!Number.isNaN(numericCredits)) {
        return numericCredits;
      }
    }
    const parsed = parseCourseCode(courseCode || "");
    if (
      parsed &&
      !parsed.error &&
      parsed.credits !== undefined &&
      parsed.credits !== null
    ) {
      return parsed.credits;
    }
    return null;
  };

  const peopleById = useMemo(() => {
    return new Map((rawPeople || []).map((person) => [person.id, person]));
  }, [rawPeople]);

  const splitInstructorNames = (value) => {
    if (!value) return [];
    return String(value)
      .split(/;|\/|\s+&\s+|\s+and\s+/i)
      .map((part) =>
        part
          .replace(/\[[^\]]*\]/g, "")
          .replace(/\([^)]*\)/g, "")
          .trim(),
      )
      .filter(Boolean);
  };

  const buildInstructorInfo = useCallback(
    (schedule) => {
      if (!schedule) {
        return {
          instructorIds: [],
          instructorNames: [],
          instructors: [],
          primaryInstructorId: "",
          primaryInstructor: null,
          displayName: UNASSIGNED,
        };
      }

      const assignments = Array.isArray(schedule.instructorAssignments)
        ? schedule.instructorAssignments
        : [];
      const assignmentIds = assignments
        .map(
          (assignment) =>
            assignment?.personId || assignment?.instructorId || assignment?.id,
        )
        .filter(Boolean);
      const instructorIds = Array.from(
        new Set([
          ...(Array.isArray(schedule.instructorIds)
            ? schedule.instructorIds
            : []),
          ...assignmentIds,
          schedule.instructorId,
        ]),
      ).filter(Boolean);

      const instructors = instructorIds
        .map((id) => peopleById.get(id))
        .filter(Boolean);
      const resolvedNames = instructors
        .map((person) => getInstructorDisplayName(person))
        .filter((name) => name && name !== UNASSIGNED);
      const fallbackName = (
        schedule.instructorName ||
        schedule.Instructor ||
        ""
      ).trim();
      const instructorNames =
        resolvedNames.length > 0
          ? resolvedNames
          : splitInstructorNames(fallbackName);

      const primaryInstructorId =
        schedule.instructorId ||
        assignments.find((assignment) => assignment?.isPrimary)?.personId ||
        instructorIds[0] ||
        "";
      const primaryInstructor = primaryInstructorId
        ? peopleById.get(primaryInstructorId)
        : null;
      const displayName =
        instructorNames.length > 0 ? instructorNames.join(" / ") : UNASSIGNED;

      return {
        instructorIds,
        instructorNames,
        instructors,
        primaryInstructorId,
        primaryInstructor,
        displayName,
      };
    },
    [peopleById],
  );

  // Computed schedule objects (flattened for UI)
  const scheduleData = useMemo(() => {
    if (!rawScheduleData || rawScheduleData.length === 0) return [];

    const normalizeCourseCode = (value) => {
      if (!value) return "";
      return String(value).trim().toUpperCase().replace(/\s+/g, " ");
    };
    const normalizeCourseId = (value) => {
      if (!value) return "";
      return String(value).trim().toUpperCase().replace(/\s+/g, "_");
    };
    const coursesById = new Map();
    const coursesByCode = new Map();
    rawCourses.forEach((course) => {
      if (!course) return;
      if (course.id) coursesById.set(course.id, course);
      const courseCode = normalizeCourseCode(
        course.courseCode || course.code || "",
      );
      if (courseCode) coursesByCode.set(courseCode, course);
      const normalizedId = normalizeCourseId(
        course.courseCode || course.code || "",
      );
      if (normalizedId && !coursesById.has(normalizedId)) {
        coursesById.set(normalizedId, course);
      }
    });

    const flattened = [];
    rawScheduleData.forEach((schedule) => {
      if (!schedule || !schedule.id) return;

      const {
        instructorIds,
        instructorNames,
        instructors,
        primaryInstructorId,
        primaryInstructor,
        displayName,
      } = buildInstructorInfo(schedule);

      // Helper to create reliable display strings
      const getRoomDisplay = (s) => {
        const resolved = resolveScheduleSpaces(s, spacesByKey);
        if (resolved.display) return resolved.display;
        return "";
      };

      const courseCode = schedule.courseCode || schedule.Course || "";
      const courseFromId = schedule.courseId
        ? coursesById.get(schedule.courseId) ||
          coursesById.get(normalizeCourseId(schedule.courseId))
        : null;
      const courseFromCode = courseCode
        ? coursesByCode.get(normalizeCourseCode(courseCode)) ||
          coursesById.get(normalizeCourseId(courseCode))
        : null;
      const resolvedCourse = courseFromId || courseFromCode;
      const baseCourseTitle =
        schedule.courseTitle ||
        schedule["Course Title"] ||
        schedule.Title ||
        schedule.title ||
        "";
      const courseTitle =
        baseCourseTitle ||
        resolvedCourse?.title ||
        resolvedCourse?.courseTitle ||
        resolvedCourse?.["Course Title"] ||
        "";
      const crn = schedule.crn || schedule.CRN || "";

      const commonProps = {
        ...schedule,
        Course: courseCode,
        courseTitle,
        crn,
        "Course Title": courseTitle,
        CRN: crn,
        Instructor: displayName,
        instructorName: displayName,
        InstructorId: primaryInstructorId || "",
        instructorId: primaryInstructorId || "",
        instructorIds,
        instructorNames,
        instructors,
        instructor: primaryInstructor,
        Section: schedule.section || "",
        Credits: deriveCreditsFromSchedule(courseCode, schedule.credits),
        Program: schedule.program || "",
        Term: schedule.term || "",
        Status: schedule.status || "Active",
        _originalId: schedule.id,
      };

      if (schedule.meetingPatterns && schedule.meetingPatterns.length > 0) {
        schedule.meetingPatterns.forEach((pattern, idx) => {
          flattened.push({
            ...commonProps,
            id: `${schedule.id}-${idx}`,
            Day: pattern.day,
            "Start Time": pattern.startTime,
            "End Time": pattern.endTime,
            Room: getRoomDisplay(schedule),
          });
        });
      } else {
        flattened.push({
          ...commonProps,
          id: schedule.id,
          Room: getRoomDisplay(schedule),
        });
      }
    });
    return flattened;
  }, [rawScheduleData, rawCourses, buildInstructorInfo, spacesByKey]);

  // Analytics calculation (Legacy, keep for now)
  const analytics = useMemo(() => {
    if (!scheduleData || scheduleData.length === 0) return null;

    // Simple recalculation based on available data
    const instructors = new Set();
    const rooms = new Set();
    const courses = new Set();
    const daySchedules = { M: 0, T: 0, W: 0, R: 0, F: 0 };

    // Track faculty workload and room utilization
    const facultyWorkload = {};
    const roomUtilization = {};

    // Helper to calculate duration in hours (used for room utilization)
    const calculateDuration = (startTime, endTime) => {
      if (!startTime || !endTime) return 0;
      const parseTimeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const match = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (!match) return 0;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3];
        if (period) {
          if (period.toUpperCase() === "PM" && hours !== 12) hours += 12;
          if (period.toUpperCase() === "AM" && hours === 12) hours = 0;
        }
        return hours * 60 + minutes;
      };
      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      if (endMinutes > startMinutes) {
        return (endMinutes - startMinutes) / 60;
      }
      return 0;
    };

    const parseCreditHours = (value) => {
      if (value === undefined || value === null || value === "") return 0;
      const numeric = Number(value);
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    let adjunctTaughtSessions = 0;

    scheduleData.forEach((s) => {
      const names = Array.isArray(s.instructorNames)
        ? s.instructorNames
        : s.Instructor
          ? [s.Instructor]
          : [];
      names.forEach((name) => {
        if (name) instructors.add(name);
      });
      const roomLabel = s.Room || "";
      const lowerRoom = roomLabel.toLowerCase();
      if (
        roomLabel &&
        lowerRoom !== "online" &&
        !lowerRoom.includes("no room needed")
      ) {
        rooms.add(roomLabel);
      }
      const courseKey = buildCourseSectionKey(s);
      if (courseKey) courses.add(courseKey);
      if (s.Day && daySchedules[s.Day] !== undefined) daySchedules[s.Day]++;

      // Check if any instructor is an adjunct
      const scheduleInstructors = Array.isArray(s.instructors)
        ? s.instructors
        : [];
      const isAdjunctTaught = scheduleInstructors.some(
        (instructor) => instructor?.isAdjunct,
      );
      if (isAdjunctTaught) {
        adjunctTaughtSessions++;
      }

      // Calculate faculty workload (credit hours per course section)
      const displayName = s.Instructor || "Unassigned";
      if (displayName && displayName !== "Unassigned") {
        if (!facultyWorkload[displayName]) {
          facultyWorkload[displayName] = {
            courses: new Set(),
            creditedCourses: new Set(),
            totalHours: 0,
          };
        }
        const workloadCourseKey =
          buildCourseSectionKey(s) || s._originalId || s.id || "";
        if (workloadCourseKey) {
          facultyWorkload[displayName].courses.add(workloadCourseKey);
        }
        if (
          !workloadCourseKey ||
          !facultyWorkload[displayName].creditedCourses.has(workloadCourseKey)
        ) {
          const credits = parseCreditHours(
            s.Credits ?? s.credits ?? s["Credit Hrs"],
          );
          facultyWorkload[displayName].totalHours += credits;
          if (workloadCourseKey) {
            facultyWorkload[displayName].creditedCourses.add(workloadCourseKey);
          }
        }
      }

      // Calculate room utilization
      if (
        roomLabel &&
        lowerRoom !== "online" &&
        !lowerRoom.includes("no room needed")
      ) {
        if (!roomUtilization[roomLabel]) {
          roomUtilization[roomLabel] = {
            classes: 0,
            hours: 0,
            adjunctTaughtClasses: 0,
          };
        }
        roomUtilization[roomLabel].classes++;
        roomUtilization[roomLabel].hours += calculateDuration(
          s["Start Time"],
          s["End Time"],
        );
        if (isAdjunctTaught) {
          roomUtilization[roomLabel].adjunctTaughtClasses++;
        }
      }
    });

    // Convert faculty workload courses Set to count
    const facultyWorkloadFinal = {};
    Object.entries(facultyWorkload).forEach(([name, data]) => {
      facultyWorkloadFinal[name] = {
        courses: data.courses.size,
        totalHours: data.totalHours,
      };
    });

    const busiestDay = Object.entries(daySchedules).reduce(
      (max, [day, count]) => (count > max.count ? { day, count } : max),
      { day: "M", count: 0 },
    );

    return {
      facultyCount: instructors.size,
      totalSessions: scheduleData.length,
      adjunctTaughtSessions,
      roomsInUse: rooms.size,
      uniqueCourses: courses.size,
      busiestDay,
      facultyWorkload: facultyWorkloadFinal,
      roomUtilization,
    };
  }, [scheduleData]);

  // Adapters with Cross-Linking (preserves rich objects for UI views)
  const facultyData = useMemo(() => {
    return adaptPeopleToFaculty(rawPeople, rawScheduleData, rawPrograms, {
      includeInactive: false,
    });
  }, [rawPeople, rawScheduleData, rawPrograms]);

  const staffData = useMemo(() => {
    return adaptPeopleToStaff(rawPeople, rawScheduleData, rawPrograms, {
      includeInactive: false,
    });
  }, [rawPeople, rawScheduleData, rawPrograms]);

  const studentData = useMemo(() => {
    return rawPeople
      .filter((person) => isStudentWorker(person))
      .map((student) => {
        const resolved = selectedSemester
          ? applySemesterSchedule(student, selectedSemester)
          : student;
        return { ...resolved, jobs: resolved.jobs || [] };
      });
  }, [rawPeople, selectedSemester]);

  const loadPrograms = useCallback(
    async ({ force = false } = {}) => {
      if (programsLoaded && !force) return rawPrograms;
      try {
        const programs = await fetchPrograms();
        setRawPrograms(programs);
        setProgramsLoaded(true);
        return programs;
      } catch (e) {
        console.error("Programs load error:", e);
        setDataError(e.message);
        return [];
      }
    },
    [programsLoaded, rawPrograms],
  );

  const loadCourses = useCallback(
    async ({ force = false } = {}) => {
      if (coursesLoaded && !force) return rawCourses;
      setCoursesLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "courses"));
        const courses = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setRawCourses(courses);
        setCoursesLoaded(true);
        return courses;
      } catch (e) {
        console.error("Courses load error:", e);
        setDataError(e.message);
        return [];
      } finally {
        setCoursesLoading(false);
      }
    },
    [coursesLoaded, rawCourses],
  );

  // Load rooms from Firestore
  const normalizeRoomsSnapshot = useCallback((snapshot) => {
    const rooms = {};
    const list = [];
    const byKey = new Map();

    snapshot.docs.forEach((docSnap) => {
      const normalized = normalizeSpaceRecord(docSnap.data(), docSnap.id);
      rooms[docSnap.id] = normalized;
      list.push(normalized);
      if (normalized.spaceKey) {
        const existing = byKey.get(normalized.spaceKey);
        if (!existing || existing.isActive === false) {
          byKey.set(normalized.spaceKey, normalized);
        }
      }
    });

    setRoomsData(rooms);
    setSpacesList(list);
    setSpacesByKey(byKey);
    setRoomsLoaded(true);
  }, []);

  const startRoomsSubscription = useCallback(() => {
    if (roomsUnsubscribeRef.current) return;
    setRoomsLoading(true);
    roomsUnsubscribeRef.current = onSnapshot(
      collection(db, "rooms"),
      (snapshot) => {
        normalizeRoomsSnapshot(snapshot);
        setRoomsLoading(false);
      },
      (error) => {
        console.error("Rooms subscription error:", error);
        setDataError(error.message);
        setRoomsLoading(false);
      },
    );
  }, [normalizeRoomsSnapshot]);

  useEffect(() => {
    startRoomsSubscription();
    return () => {
      if (roomsUnsubscribeRef.current) {
        roomsUnsubscribeRef.current();
        roomsUnsubscribeRef.current = null;
      }
    };
  }, [startRoomsSubscription]);

  useEffect(() => {
    if (!rawScheduleData || rawScheduleData.length === 0) return;
    if (coursesLoaded || coursesLoading) return;
    loadCourses();
  }, [rawScheduleData, coursesLoaded, coursesLoading, loadCourses]);

  const loadRooms = useCallback(
    async ({ force = false } = {}) => {
      if (!roomsUnsubscribeRef.current || force) {
        if (roomsUnsubscribeRef.current && force) {
          roomsUnsubscribeRef.current();
          roomsUnsubscribeRef.current = null;
        }
        startRoomsSubscription();
      }
      return roomsData;
    },
    [roomsData, startRoomsSubscription],
  );

  // Refresh rooms (force reload)
  const refreshRooms = useCallback(
    () => loadRooms({ force: true }),
    [loadRooms],
  );

  const loadEditHistory = useCallback(
    async ({ force = false } = {}) => {
      if (editHistoryLoaded && !force) return editHistory;
      try {
        const snap = await getDocs(
          query(collection(db, "editHistory"), orderBy("timestamp", "desc")),
        );
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEditHistory(items);
        setEditHistoryLoaded(true);
        return items;
      } catch (e) {
        console.error("Edit history load error:", e);
        setDataError(e.message);
        return [];
      }
    },
    [editHistoryLoaded, editHistory],
  );

  const loadRecentChanges = useCallback(
    async ({ limit = 100, force = false } = {}) => {
      if (recentChangesLoaded && !force) return recentChanges;
      try {
        const changes = await fetchRecentChanges(limit);
        setRecentChanges(changes);
        setRecentChangesLoaded(true);
        return changes;
      } catch (e) {
        console.error("Recent changes load error:", e);
        setDataError(e.message);
        return [];
      }
    },
    [recentChangesLoaded, recentChanges],
  );

  // Main Load Orchestrator
  const loadData = useCallback(
    async ({
      silent = false,
      includePeople = true,
      includeCourses = true,
      includePrograms = true,
      includeEditHistory = true,
      includeRecentChanges = true,
      force = false,
    } = {}) => {
      if (!silent) setLocalLoading(true);
      try {
        console.log("📡 DataContext: Orchestrating data load...");

        const tasks = [];
        if (includePeople) tasks.push(loadPeople({ force }));
        if (includeCourses) tasks.push(loadCourses({ force }));
        if (includePrograms) tasks.push(loadPrograms({ force }));
        if (includeEditHistory) tasks.push(loadEditHistory({ force }));
        if (includeRecentChanges) tasks.push(loadRecentChanges({ force }));

        await Promise.all(tasks);
        // Note: Schedules load automatically via ScheduleContext when semester is set
      } catch (e) {
        console.error("Data load error:", e);
        setDataError(e.message);
      } finally {
        if (!silent) setLocalLoading(false);
      }
    },
    [loadPeople, loadCourses, loadPrograms, loadEditHistory, loadRecentChanges],
  );

  // Initial Load effect handled by components calling loadData or individual contexts

  const value = useMemo(
    () => ({
      // Passthrough Data
      rawScheduleData,
      rawPeople,
      allPeople,
      peopleIndex,
      rawPrograms,
      rawCourses,

      // Transformed/Legacy Data
      scheduleData,
      facultyData,
      staffData,
      studentData,
      programs: rawPrograms,
      courses: rawCourses,
      directoryData: rawPeople,

      analytics,
      editHistory,
      recentChanges,

      // Rooms/Spaces Data
      roomsData,
      spacesByKey,
      spacesList,

      // Semester State (Delegated)
      selectedSemester,
      setSelectedSemester,
      availableSemesters,
      selectedSemesterMeta: selectedTermMeta,

      loading,
      dataError,

      // Actions
      loadData,
      loadCourses,
      loadPrograms,
      loadRooms,
      refreshRooms,
      loadEditHistory,
      loadRecentChanges,
      refreshData: (options = {}) => loadData({ silent: true, ...options }),

      // Load State
      programsLoaded,
      coursesLoaded,
      coursesLoading,
      roomsLoaded,
      roomsLoading,
      editHistoryLoaded,
      recentChangesLoaded,

      // Permissions (Passthrough)
      ...permissions,
    }),
    [
      rawScheduleData,
      rawPeople,
      allPeople,
      peopleIndex,
      rawPrograms,
      rawCourses,
      scheduleData,
      facultyData,
      staffData,
      studentData,
      analytics,
      editHistory,
      recentChanges,
      roomsData,
      spacesByKey,
      spacesList,
      selectedSemester,
      availableSemesters,
      selectedTermMeta,
      loading,
      dataError,
      loadData,
      loadCourses,
      loadPrograms,
      loadRooms,
      refreshRooms,
      loadEditHistory,
      loadRecentChanges,
      programsLoaded,
      coursesLoaded,
      coursesLoading,
      roomsLoaded,
      roomsLoading,
      editHistoryLoaded,
      recentChangesLoaded,
      permissions,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
};

export default DataContext;
