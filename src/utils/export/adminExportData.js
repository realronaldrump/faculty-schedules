import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  DIRECTOR_ROLES,
  buildDirectorIndex,
  formatDirectorAssignmentList,
  getDirectorAssignments,
  getProgramDirectors,
} from "../directorAssignments";
import { buildPeopleIndex } from "../peopleUtils";
import {
  getAssignmentStatusForSemester,
  getStudentAssignments,
  getStudentStatusForSemester,
  parseHourlyRate,
  applySemesterSchedule,
} from "../studentWorkers";
import { normalizeSpaceRecord } from "../spaceUtils";
import { assignMeetingPatternSpaces } from "../meetingPatternUtils";
import { getIgnitePersonNumber } from "../pafUtils";
import { normalizeTermLabel } from "../termUtils";
import {
  BULK_EXPORT_SHEET_IDS,
  getSheetDefinition,
  isTermScopedSheet,
  SHEET_IDS,
  SHEET_ORDER,
} from "./adminExportSchemas";
import {
  buildBulkExportFileName,
  buildIndividualFileName,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMeetingPatternSummary,
  formatWeeklySchedule,
  getActiveStatusLabel,
  getBooleanStatusLabel,
  getPersonBaylorId,
  getPersonClssInstructorId,
  getPersonDisplayName,
  joinValues,
  normalizeRoleList,
  scheduleMatchesTermScope,
  toNormalizedTermScope,
} from "./adminExportFormatters";

export const LARGE_EXPORT_ROW_THRESHOLD = 50000;

const COLLECTIONS = {
  people: "people",
  schedules: "schedules",
  programs: "programs",
  courses: "courses",
  spaces: "rooms",
  terms: "terms",
  reservations: "reservations",
  baylorAcronyms: "baylorAcronyms",
  emailListPresets: "emailListPresets",
  calendarExceptions: "outlookExceptions",
  roomGrids: "roomGrids",
};

const SHEET_DEPENDENCIES = {
  [SHEET_IDS.people]: ["people", "programs", "spaces"],
  [SHEET_IDS.studentWorkerAssignments]: ["people", "terms"],
  [SHEET_IDS.courseSections]: ["schedules", "people", "spaces"],
  [SHEET_IDS.sectionMeetings]: ["schedules", "people", "spaces"],
  [SHEET_IDS.courses]: ["courses"],
  [SHEET_IDS.programs]: ["programs", "people"],
  [SHEET_IDS.spaces]: ["spaces", "schedules", "people"],
  [SHEET_IDS.buildings]: ["spaces"],
  [SHEET_IDS.terms]: ["terms", "schedules"],
  [SHEET_IDS.roomReservations]: ["reservations", "terms"],
  [SHEET_IDS.baylorAcronyms]: ["baylorAcronyms"],
  [SHEET_IDS.emailListPresets]: ["emailListPresets", "people"],
  [SHEET_IDS.calendarExceptions]: ["calendarExceptions"],
  [SHEET_IDS.roomGrids]: ["roomGrids"],
  [SHEET_IDS.roomGridEntries]: ["roomGrids"],
};

const ROLE_STUDENT = "student";

const getCollectionDocs = async (collectionName) => {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
};

const getRequiredDependencies = (sheetIds = []) => {
  const deps = new Set();
  sheetIds.forEach((sheetId) => {
    (SHEET_DEPENDENCIES[sheetId] || []).forEach((dep) => deps.add(dep));
  });
  return deps;
};

const uniqueById = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    if (!item?.id) return;
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
};

const fetchSchedulesForScope = async (termScopeInfo) => {
  if (termScopeInfo.scope !== "selected") {
    return getCollectionDocs(COLLECTIONS.schedules);
  }

  const items = [];
  const seenIds = new Set();

  const appendQuery = async (q) => {
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((docSnap) => {
      if (!seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        items.push({ ...docSnap.data(), id: docSnap.id });
      }
    });
  };

  const requests = [];
  if (termScopeInfo.termCode) {
    requests.push(
      appendQuery(
        query(
          collection(db, COLLECTIONS.schedules),
          where("termCode", "==", termScopeInfo.termCode),
        ),
      ),
    );
  }

  if (termScopeInfo.termLabel) {
    requests.push(
      appendQuery(
        query(
          collection(db, COLLECTIONS.schedules),
          where("term", "==", termScopeInfo.termLabel),
        ),
      ),
    );
  }

  await Promise.all(requests);

  return items;
};

const fetchBuildingConfig = async ({ buildingConfig } = {}) => {
  if (Array.isArray(buildingConfig?.buildings)) {
    return buildingConfig.buildings;
  }

  const settingsSnap = await getDoc(doc(db, "settings", "buildings"));
  if (!settingsSnap.exists()) return [];

  const payload = settingsSnap.data() || {};
  return Array.isArray(payload.buildings) ? payload.buildings : [];
};

const toDisplayNumber = (value) => {
  if (value === undefined || value === null || value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : "";
};

const toJson = (value) => {
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return "";
  }
};

const normalizeSpaceKey = (value) => {
  if (!value) return "";
  return String(value).trim();
};

const getScheduleSpaceKeys = (schedule = {}) => {
  const keys = new Set();

  if (Array.isArray(schedule.spaceIds)) {
    schedule.spaceIds.forEach((id) => {
      const key = normalizeSpaceKey(id);
      if (key) keys.add(key);
    });
  }

  if (schedule.spaceId) {
    const key = normalizeSpaceKey(schedule.spaceId);
    if (key) keys.add(key);
  }

  return Array.from(keys);
};

const resolveLocationDisplay = (schedule = {}, spacesByKey = new Map()) => {
  const labels = [];

  if (Array.isArray(schedule.spaceDisplayNames)) {
    labels.push(...schedule.spaceDisplayNames);
  }

  const spaceIds = getScheduleSpaceKeys(schedule);
  spaceIds.forEach((spaceId) => {
    const space = spacesByKey.get(spaceId);
    if (!space) {
      labels.push(spaceId);
      return;
    }
    labels.push(space.displayName || space.spaceKey || spaceId);
  });

  if (labels.length === 0 && schedule.locationLabel) {
    labels.push(schedule.locationLabel);
  }

  return joinValues(labels);
};

const resolveInstructorNames = (schedule = {}, peopleIndex = null) => {
  const names = [];

  const addPersonNameById = (personId) => {
    if (!personId || !peopleIndex) return;
    const canonicalId = peopleIndex.resolvePersonId(personId);
    const person = peopleIndex.peopleById.get(canonicalId);
    if (!person) return;
    names.push(getPersonDisplayName(person));
  };

  if (Array.isArray(schedule.instructorIds)) {
    schedule.instructorIds.forEach((personId) => addPersonNameById(personId));
  }

  if (Array.isArray(schedule.instructorAssignments)) {
    schedule.instructorAssignments.forEach((assignment) => {
      addPersonNameById(assignment?.personId || assignment?.instructorId);
    });
  }

  addPersonNameById(schedule.instructorId);

  if (Array.isArray(schedule.instructorNames)) {
    names.push(...schedule.instructorNames);
  }

  if (schedule.instructorName) {
    names.push(schedule.instructorName);
  }

  if (schedule.Instructor) {
    names.push(schedule.Instructor);
  }

  return joinValues(names);
};

const resolveInstructorIds = (schedule = {}, peopleIndex = null) => {
  const ids = [
    ...(Array.isArray(schedule.instructorIds) ? schedule.instructorIds : []),
    ...(Array.isArray(schedule.instructorAssignments)
      ? schedule.instructorAssignments.map(
          (assignment) => assignment?.personId || assignment?.instructorId,
        )
      : []),
    schedule.instructorId,
  ]
    .filter(Boolean)
    .map((personId) => peopleIndex?.resolvePersonId(personId) || personId);
  return Array.from(new Set(ids));
};

const formatInstructorAssignments = (schedule = {}, peopleIndex = null) => {
  if (!Array.isArray(schedule.instructorAssignments)) return "";
  return joinValues(
    schedule.instructorAssignments.map((assignment) => {
      const rawId = assignment?.personId || assignment?.instructorId || "";
      const canonicalId = peopleIndex?.resolvePersonId(rawId) || rawId;
      const person = canonicalId
        ? peopleIndex?.peopleById?.get(canonicalId)
        : null;
      const name = person ? getPersonDisplayName(person) : canonicalId;
      const details = [];
      if (
        assignment?.percentage !== undefined &&
        assignment?.percentage !== null &&
        assignment?.percentage !== "" &&
        Number.isFinite(Number(assignment.percentage))
      ) {
        details.push(`${Number(assignment.percentage)}%`);
      }
      if (assignment?.isPrimary) details.push("primary");
      return details.length > 0 ? `${name} (${details.join(", ")})` : name;
    }),
  );
};

const resolvePrimaryInstructorName = (schedule = {}, peopleIndex = null) => {
  const primaryAssignment = Array.isArray(schedule.instructorAssignments)
    ? schedule.instructorAssignments.find((assignment) => assignment?.isPrimary)
    : null;
  const primaryId =
    schedule.instructorId ||
    primaryAssignment?.personId ||
    primaryAssignment?.instructorId ||
    "";
  if (primaryId && peopleIndex) {
    const canonicalId = peopleIndex.resolvePersonId(primaryId);
    const person = peopleIndex.peopleById.get(canonicalId);
    if (person) return getPersonDisplayName(person);
  }

  const names = resolveInstructorNames(schedule, peopleIndex);
  if (!names) return "";
  return names.split(";")[0].trim();
};

const statusFromTermRecord = (term = {}) => {
  if (term?.status) return term.status;
  if (term?.archived === true) return "archived";
  return "active";
};

const buildCanonicalDirectorIndex = (programs = [], peopleIndex) => {
  const rawIndex = buildDirectorIndex(programs);
  const canonicalIndex = new Map();
  rawIndex.forEach((assignments, personId) => {
    const canonicalId = peopleIndex?.resolvePersonId(personId) || personId;
    const existing = canonicalIndex.get(canonicalId) || [];
    const seen = new Set(
      existing.map(
        (assignment) =>
          `${assignment.programId || ""}:${assignment.role || ""}`,
      ),
    );
    assignments.forEach((assignment) => {
      const key = `${assignment.programId || ""}:${assignment.role || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      existing.push(assignment);
    });
    canonicalIndex.set(canonicalId, existing);
  });
  return canonicalIndex;
};

const buildPeopleRows = ({
  canonicalPeople = [],
  peopleIndex,
  programsById = new Map(),
  spacesByKey = new Map(),
}) => {
  const directorIndex = buildCanonicalDirectorIndex(
    Array.from(programsById.values()),
    peopleIndex,
  );
  return canonicalPeople
    .map((person) => {
      const roles = normalizeRoleList(person.roles);
      const officeSpaceIds = [
        ...(Array.isArray(person.officeSpaceIds) ? person.officeSpaceIds : []),
        person.officeSpaceId,
      ].filter(Boolean);

      const officeSpaces = officeSpaceIds.map((spaceId) => {
        const space = spacesByKey.get(spaceId);
        return space?.displayName || space?.spaceKey || String(spaceId);
      });

      const program = person.programId
        ? programsById.get(person.programId)
        : person.program && typeof person.program === "object"
          ? person.program
          : null;

      return {
        recordId: person.id || "",
        name: getPersonDisplayName(person),
        firstName: person.firstName || "",
        lastName: person.lastName || "",
        roles: joinValues(roles),
        status: getActiveStatusLabel(person.isActive),
        inactiveReason: person.inactiveReason || "",
        email: person.email || "",
        alternateEmails: joinValues(
          (person.externalIds?.emails || []).filter(
            (email) =>
              String(email || "").trim().toLowerCase() !==
              String(person.email || "").trim().toLowerCase(),
          ),
        ),
        phone: person.phone || "",
        baylorId: getPersonBaylorId(person),
        clssInstructorId: getPersonClssInstructorId(person),
        ignitePersonNumber: getIgnitePersonNumber(person),
        title: person.title || "",
        jobTitle: person.jobTitle || "",
        department: person.department || "",
        program: program?.name || "",
        programCode: program?.code || "",
        office: person.office || joinValues(person.offices || []),
        officeSpaces: joinValues(officeSpaces),
        primaryBuildings: joinValues(person.primaryBuildings || []),
        isAdjunct: getBooleanStatusLabel(person.isAdjunct === true),
        directorRoles: formatDirectorAssignmentList(
          getDirectorAssignments(directorIndex, person.id),
        ),
        isFullTime: getBooleanStatusLabel(person.isFullTime !== false),
        isTenured: getBooleanStatusLabel(person.isTenured === true),
        hasPhD: getBooleanStatusLabel(person.hasPhD === true),
        isRemote: getBooleanStatusLabel(person.isRemote === true),
        isAlsoFaculty: getBooleanStatusLabel(person.isAlsoFaculty === true),
        isAlsoStaff: getBooleanStatusLabel(person.isAlsoStaff === true),
        hasNoPhone: getBooleanStatusLabel(person.hasNoPhone === true),
        hasNoOffice: getBooleanStatusLabel(person.hasNoOffice === true),
        inactiveAt: formatDateTime(person.inactiveAt),
        startDate: formatDate(person.startDate),
        endDate: formatDate(person.endDate),
        createdAt: formatDateTime(person.createdAt),
        updatedAt: formatDateTime(person.updatedAt),
      };
    })
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return a.email.localeCompare(b.email);
    });
};

const findTermMeta = ({ terms = [], term = "", termCode = "" } = {}) => {
  const normalizedLabel = normalizeTermLabel(term) || String(term || "").trim();
  return (
    terms.find((item) => {
      const itemCode = String(item?.termCode || "").trim();
      const itemLabel =
        normalizeTermLabel(item?.term || "") || String(item?.term || "").trim();
      return Boolean(
        (termCode && itemCode && String(termCode) === itemCode) ||
          (normalizedLabel && itemLabel && normalizedLabel === itemLabel),
      );
    }) || null
  );
};

const getStudentSemesterProjections = ({
  student,
  termScopeInfo,
  selectedTermMeta,
}) => {
  if (termScopeInfo.scope === "selected") {
    const selectedValue =
      termScopeInfo.termLabel || termScopeInfo.termCode || selectedTermMeta?.term || "";
    return [
      {
        student: selectedValue
          ? applySemesterSchedule(student, selectedValue)
          : student,
        term: termScopeInfo.termLabel || selectedTermMeta?.term || "",
        termCode: termScopeInfo.termCode || selectedTermMeta?.termCode || "",
      },
    ];
  }

  const semesterSchedules =
    student?.semesterSchedules && typeof student.semesterSchedules === "object"
      ? student.semesterSchedules
      : student?.termSchedules && typeof student.termSchedules === "object"
        ? student.termSchedules
        : {};
  const entries = Object.entries(semesterSchedules);
  if (entries.length === 0) {
    return [{ student, term: "", termCode: "" }];
  }

  return entries
    .map(([key, entry]) => {
      const safeEntry = entry && typeof entry === "object" ? entry : {};
      const term = safeEntry.semester || safeEntry.term || "";
      const normalized = toNormalizedTermScope({
        termScope: "selected",
        selectedTerm: term || key,
        selectedTermMeta: {
          term,
          termCode: safeEntry.semesterCode || safeEntry.termCode || "",
        },
      });
      return {
        student: {
          ...student,
          ...safeEntry,
          jobs: Array.isArray(safeEntry.jobs) ? safeEntry.jobs : [],
        },
        term: normalized.termLabel || term || key,
        termCode:
          safeEntry.semesterCode ||
          safeEntry.termCode ||
          normalized.termCode ||
          "",
      };
    })
    .sort((a, b) => (a.termCode || a.term).localeCompare(b.termCode || b.term));
};

const buildStudentAssignmentRows = ({
  canonicalPeople = [],
  peopleIndex,
  termScopeInfo,
  selectedTermMeta,
  terms = [],
}) => {
  const students = canonicalPeople.filter((person) => {
    const roles = normalizeRoleList(person.roles);
    return roles.includes(ROLE_STUDENT);
  });

  const rows = [];
  students.forEach((student) => {
    const projections = getStudentSemesterProjections({
      student,
      termScopeInfo,
      selectedTermMeta,
    });

    projections.forEach((projection) => {
      const termMetaForStatus =
        termScopeInfo.scope === "selected" && selectedTermMeta
          ? selectedTermMeta
          : findTermMeta({
              terms,
              term: projection.term,
              termCode: projection.termCode,
            });
      const studentStatus = getStudentStatusForSemester(
        projection.student,
        termMetaForStatus,
      ).status;
      const assignments = getStudentAssignments(projection.student);

      assignments.forEach((assignment) => {
        const supervisorId = assignment?.supervisorId || "";
        const canonicalSupervisorId = supervisorId
          ? peopleIndex.resolvePersonId(supervisorId)
          : "";
        const supervisorRecord = canonicalSupervisorId
          ? peopleIndex.peopleById.get(canonicalSupervisorId)
          : null;

        const assignmentStatus = getAssignmentStatusForSemester(
          assignment,
          projection.student,
          termMetaForStatus,
        ).status;

        const hourlyRate = formatCurrency(
          assignment?.hourlyRateNumber ?? parseHourlyRate(assignment?.hourlyRate),
        );

        rows.push({
          studentId: student.id || "",
          studentName: getPersonDisplayName(student),
          studentEmail: student.email || "",
          term: projection.term,
          termCode: projection.termCode,
          studentStatus,
          assignmentId: assignment?.id || "",
          assignmentStatus,
          jobTitle: assignment?.jobTitle || "",
          supervisorId: canonicalSupervisorId || supervisorId,
          supervisor:
            assignment?.supervisor ||
            (supervisorRecord ? getPersonDisplayName(supervisorRecord) : ""),
          supervisorEmail: supervisorRecord?.email || "",
          hourlyRate,
          startDate: formatDate(
            assignment?.startDate || projection.student?.startDate,
          ),
          endDate: formatDate(assignment?.endDate || projection.student?.endDate),
          weeklyHours: toDisplayNumber(assignment?.weeklyHours),
          weeklyPay: formatCurrency(assignment?.weeklyPay),
          weeklySchedule: formatWeeklySchedule(assignment?.schedule),
          buildings: joinValues(assignment?.buildings || []),
        });
      });
    });
  });

  return rows.sort((a, b) => {
    const byName = a.studentName.localeCompare(b.studentName);
    if (byName !== 0) return byName;
    const byTerm = (a.termCode || a.term).localeCompare(b.termCode || b.term);
    if (byTerm !== 0) return byTerm;
    return a.jobTitle.localeCompare(b.jobTitle);
  });
};

const buildCourseSectionRows = ({
  schedules = [],
  peopleIndex,
  spacesByKey,
  termScopeInfo,
}) => {
  return schedules
    .filter((schedule) => scheduleMatchesTermScope(schedule, termScopeInfo))
    .map((schedule) => ({
      recordId: schedule.id || "",
      term: schedule.term || "",
      termCode: schedule.termCode || "",
      academicYear: toDisplayNumber(schedule.academicYear),
      courseCode: schedule.courseCode || "",
      subjectCode: schedule.subjectCode || schedule.subject || "",
      catalogNumber: schedule.catalogNumber || "",
      courseLevel: toDisplayNumber(schedule.courseLevel),
      courseTitle: schedule.courseTitle || schedule.title || "",
      section: schedule.section || "",
      crn: schedule.crn || "",
      clssId: schedule.clssId || "",
      status: schedule.status || "Active",
      program: schedule.program || schedule.subjectCode || schedule.subject || "",
      departmentCode: schedule.departmentCode || "",
      credits: toDisplayNumber(schedule.credits),
      instructorIds: joinValues(resolveInstructorIds(schedule, peopleIndex)),
      instructors: resolveInstructorNames(schedule, peopleIndex),
      primaryInstructor: resolvePrimaryInstructorName(schedule, peopleIndex),
      instructorAssignments: formatInstructorAssignments(schedule, peopleIndex),
      instructionMethod: schedule.instructionMethod || "",
      scheduleType: schedule.scheduleType || "",
      isOnline: getBooleanStatusLabel(schedule.isOnline === true),
      onlineMode: schedule.onlineMode || "",
      locationType: schedule.locationType || "",
      spaceIds: joinValues(getScheduleSpaceKeys(schedule)),
      locations: resolveLocationDisplay(schedule, spacesByKey),
      meetingPatternSummary: formatMeetingPatternSummary(schedule.meetingPatterns),
      enrollment: toDisplayNumber(schedule.enrollment),
      maxEnrollment: toDisplayNumber(
        schedule.maxEnrollment ?? schedule.maximumEnrollment ?? schedule.MaxEnrollment,
      ),
      openSeats: toDisplayNumber(schedule.openSeats),
      waitCap: toDisplayNumber(schedule.waitCap),
      waitCurrent: toDisplayNumber(schedule.waitTotal),
      waitAvailable: toDisplayNumber(schedule.waitAvailable),
      reservedSeats: toDisplayNumber(schedule.reservedSeats),
      reservedSeatsEnrollment: toDisplayNumber(schedule.reservedSeatsEnrollment),
      crossListCrns: joinValues(schedule.crossListCrns || []),
      partOfTerm: schedule.partOfTerm || "",
      customStartDate: formatDate(schedule.customStartDate),
      customEndDate: formatDate(schedule.customEndDate),
      linkGroupId: schedule.linkGroupId || "",
      createdAt: formatDateTime(schedule.createdAt),
      updatedAt: formatDateTime(schedule.updatedAt),
    }))
    .sort((a, b) => {
      const byTerm = (a.termCode || a.term).localeCompare(b.termCode || b.term);
      if (byTerm !== 0) return byTerm;
      const byCourse = a.courseCode.localeCompare(b.courseCode);
      if (byCourse !== 0) return byCourse;
      return a.section.localeCompare(b.section);
    });
};

const buildSectionMeetingRows = ({
  schedules = [],
  peopleIndex,
  spacesByKey,
  termScopeInfo,
}) => {
  const rows = [];

  schedules
    .filter((schedule) => scheduleMatchesTermScope(schedule, termScopeInfo))
    .forEach((schedule) => {
      const meetingPatterns =
        Array.isArray(schedule.meetingPatterns) && schedule.meetingPatterns.length > 0
          ? assignMeetingPatternSpaces(schedule.meetingPatterns, {
              spaceIds: schedule.spaceIds || [],
              spaceDisplayNames: schedule.spaceDisplayNames || [],
            })
          : [null];

      meetingPatterns.forEach((pattern, meetingIndex) => {
        const scopedSchedule = pattern
          ? {
              ...schedule,
              spaceIds: pattern.spaceIds || schedule.spaceIds || [],
              spaceDisplayNames:
                pattern.spaceDisplayNames || schedule.spaceDisplayNames || [],
            }
          : schedule;
        rows.push({
          scheduleId: schedule.id || "",
          meetingIndex: meetingIndex + 1,
          term: schedule.term || "",
          termCode: schedule.termCode || "",
          courseCode: schedule.courseCode || "",
          section: schedule.section || "",
          crn: schedule.crn || "",
          status: schedule.status || "Active",
          day: pattern?.day || "",
          startTime: pattern?.startTime || "",
          endTime: pattern?.endTime || "",
          startDate: formatDate(pattern?.startDate),
          endDate: formatDate(pattern?.endDate),
          spaceIds: joinValues(getScheduleSpaceKeys(scopedSchedule)),
          locations: resolveLocationDisplay(scopedSchedule, spacesByKey),
          instructorIds: joinValues(resolveInstructorIds(schedule, peopleIndex)),
          instructors: resolveInstructorNames(schedule, peopleIndex),
        });
      });
    });

  return rows.sort((a, b) => {
    const byTerm = (a.termCode || a.term).localeCompare(b.termCode || b.term);
    if (byTerm !== 0) return byTerm;
    const byCourse = a.courseCode.localeCompare(b.courseCode);
    if (byCourse !== 0) return byCourse;
    const bySection = a.section.localeCompare(b.section);
    if (bySection !== 0) return bySection;
    const byDay = a.day.localeCompare(b.day);
    if (byDay !== 0) return byDay;
    return a.startTime.localeCompare(b.startTime);
  });
};

const buildCourseRows = ({ courses = [] }) => {
  return courses
    .map((course) => ({
      recordId: course.id || "",
      courseCode: course.courseCode || course.code || course.id || "",
      courseTitle: course.title || course.courseTitle || "",
      subjectCode: course.subjectCode || course.subject || "",
      catalogNumber: course.catalogNumber || "",
      courseLevel: toDisplayNumber(course.courseLevel),
      credits: toDisplayNumber(course.credits ?? course.creditHours),
      program: course.program || course.subjectCode || "",
      department: course.department || course.departmentCode || "",
      status: getActiveStatusLabel(course.isActive),
      createdAt: formatDateTime(course.createdAt),
      updatedAt: formatDateTime(course.updatedAt),
    }))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
};

const buildProgramRows = ({ programs = [], peopleIndex }) => {
  const directorNamesForRole = (program, role) =>
    getProgramDirectors(program, role)
      .map(({ personId }) => {
        const canonicalId = peopleIndex?.resolvePersonId(personId) || personId;
        const person = peopleIndex?.peopleById?.get(canonicalId);
        return person ? getPersonDisplayName(person) : "";
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

  return programs
    .map((program) => {
      const updNames = directorNamesForRole(program, DIRECTOR_ROLES.UPD);
      const gpdNames = directorNamesForRole(program, DIRECTOR_ROLES.GPD);

      return {
        recordId: program.id || "",
        programName: program.name || "",
        programCode: program.code || "",
        updNames: joinValues(updNames),
        updCount: updNames.length,
        gpdNames: joinValues(gpdNames),
        gpdCount: gpdNames.length,
        updIds: joinValues(
          getProgramDirectors(program, DIRECTOR_ROLES.UPD).map(
            ({ personId }) => peopleIndex?.resolvePersonId(personId) || personId,
          ),
        ),
        gpdIds: joinValues(
          getProgramDirectors(program, DIRECTOR_ROLES.GPD).map(
            ({ personId }) => peopleIndex?.resolvePersonId(personId) || personId,
          ),
        ),
        directorIds: joinValues(
          getProgramDirectors(program).map(
            ({ personId }) => peopleIndex?.resolvePersonId(personId) || personId,
          ),
        ),
        status: getActiveStatusLabel(program.isActive),
        createdAt: formatDateTime(program.createdAt),
        updatedAt: formatDateTime(program.updatedAt),
      };
    })
    .sort((a, b) => a.programName.localeCompare(b.programName));
};

const buildSpaceRows = ({
  spaces = [],
  schedules = [],
  canonicalPeople = [],
}) => {
  const scheduleCountsBySpace = new Map();

  schedules.forEach((schedule) => {
    const scheduleKey = schedule.id || "";
    if (!scheduleKey) return;

    getScheduleSpaceKeys(schedule).forEach((spaceKey) => {
      if (!scheduleCountsBySpace.has(spaceKey)) {
        scheduleCountsBySpace.set(spaceKey, new Set());
      }
      scheduleCountsBySpace.get(spaceKey).add(scheduleKey);
    });
  });

  const officeCountsBySpace = new Map();
  canonicalPeople.forEach((person) => {
    const officeIds = [
      ...(Array.isArray(person.officeSpaceIds) ? person.officeSpaceIds : []),
      person.officeSpaceId,
    ].filter(Boolean);

    const uniqueOfficeIds = new Set(officeIds.map((spaceId) => normalizeSpaceKey(spaceId)));
    uniqueOfficeIds.forEach((spaceKey) => {
      if (!spaceKey) return;
      officeCountsBySpace.set(spaceKey, (officeCountsBySpace.get(spaceKey) || 0) + 1);
    });
  });

  return spaces
    .map((space) => {
      const normalized = normalizeSpaceRecord(space, space.id);
      const spaceKey = normalized.spaceKey || normalized.id || "";
      const scheduledSectionsCount = scheduleCountsBySpace.get(spaceKey)?.size || 0;
      const assignedOfficesCount = officeCountsBySpace.get(spaceKey) || 0;

      return {
        recordId: space.id || "",
        spaceKey,
        displayName: normalized.displayName || "",
        buildingCode: normalized.buildingCode || "",
        buildingName: normalized.buildingDisplayName || "",
        spaceNumber: normalized.spaceNumber || "",
        type: normalized.type || "",
        capacity: toDisplayNumber(normalized.capacity),
        equipment: joinValues(normalized.equipment || []),
        status: getActiveStatusLabel(normalized.isActive),
        isReservable: getBooleanStatusLabel(normalized.isReservable === true),
        scheduledSectionsCount,
        assignedOfficesCount,
        notes: normalized.notes || "",
        createdBy: space.createdBy || "",
        deletedAt: formatDateTime(space.deletedAt),
        createdAt: formatDateTime(space.createdAt),
        updatedAt: formatDateTime(space.updatedAt),
      };
    })
    .sort((a, b) => {
      const byBuilding = a.buildingCode.localeCompare(b.buildingCode);
      if (byBuilding !== 0) return byBuilding;
      const byNumber = a.spaceNumber.localeCompare(b.spaceNumber, undefined, {
        numeric: true,
      });
      if (byNumber !== 0) return byNumber;
      return a.spaceKey.localeCompare(b.spaceKey);
    });
};

const buildBuildingRows = ({ buildings = [], spaces = [] }) => {
  const activeSpaceCountByBuilding = new Map();
  spaces.forEach((space) => {
    const normalized = normalizeSpaceRecord(space, space.id);
    const buildingCode = (normalized.buildingCode || "").toUpperCase();
    if (!buildingCode || normalized.isActive === false) return;
    activeSpaceCountByBuilding.set(
      buildingCode,
      (activeSpaceCountByBuilding.get(buildingCode) || 0) + 1,
    );
  });

  return buildings
    .map((building) => {
      const code = (building.code || "").toUpperCase();
      return {
        recordId: building.id || building.code || "",
        code,
        displayName: building.displayName || "",
        aliases: joinValues(building.aliases || []),
        campus: building.campus || "",
        address: building.address || "",
        status: getActiveStatusLabel(building.isActive),
        activeSpaceCount: activeSpaceCountByBuilding.get(code) || 0,
        createdAt: formatDateTime(building.createdAt),
        updatedAt: formatDateTime(building.updatedAt),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
};

const buildTermRows = ({ terms = [], schedules = [], termScopeInfo }) => {
  const sectionCountByKey = new Map();

  schedules
    .filter((schedule) => scheduleMatchesTermScope(schedule, termScopeInfo))
    .forEach((schedule) => {
      const termCode = (schedule.termCode || "").toString().trim();
      const termLabel = (schedule.term || "").toString().trim();
      const key = termCode || termLabel;
      if (!key) return;
      sectionCountByKey.set(key, (sectionCountByKey.get(key) || 0) + 1);
    });

  const scopedTerms = terms.filter((term) => {
    if (termScopeInfo.scope !== "selected") return true;
    const termCode = (term.termCode || "").toString().trim();
    const termLabel = (term.term || "").toString().trim();
    if (termScopeInfo.termCode && termCode) {
      return termCode === termScopeInfo.termCode;
    }
    if (termScopeInfo.termLabel && termLabel) {
      return termLabel === termScopeInfo.termLabel;
    }
    return true;
  });

  const termRows = scopedTerms.map((term) => {
    const termCode = (term.termCode || "").toString().trim();
    const termLabel = (term.term || "").toString().trim();
    const key = termCode || termLabel;
    const status = statusFromTermRecord(term);

    return {
      recordId: term.id || termCode || termLabel,
      term: termLabel,
      termCode,
      status,
      locked: getBooleanStatusLabel(term.locked === true || status === "archived"),
      startDate: formatDate(term.startDate),
      endDate: formatDate(term.endDate),
      sectionCount: sectionCountByKey.get(key) || 0,
      createdAt: formatDateTime(term.createdAt),
      updatedAt: formatDateTime(term.updatedAt),
    };
  });

  if (termRows.length > 0) {
    return termRows.sort((a, b) => (b.termCode || b.term).localeCompare(a.termCode || a.term));
  }

  // Fallback if terms collection has not been populated.
  return Array.from(sectionCountByKey.entries())
    .map(([key, count]) => ({
      recordId: key,
      term: key,
      termCode: key,
      status: "active",
      locked: "No",
      startDate: "",
      endDate: "",
      sectionCount: count,
      createdAt: "",
      updatedAt: "",
    }))
    .sort((a, b) => (b.termCode || b.term).localeCompare(a.termCode || a.term));
};

const getSelectedTermMeta = ({
  termScopeInfo,
  selectedTermMeta,
  terms = [],
}) => {
  if (termScopeInfo.scope !== "selected") return null;
  return (
    selectedTermMeta ||
    findTermMeta({
      terms,
      term: termScopeInfo.termLabel,
      termCode: termScopeInfo.termCode,
    })
  );
};

const buildRoomReservationRows = ({
  reservations = [],
  termScopeInfo,
  selectedTermMeta,
  terms = [],
}) => {
  const termMeta = getSelectedTermMeta({
    termScopeInfo,
    selectedTermMeta,
    terms,
  });
  const rangeStart = formatDate(termMeta?.startDate);
  const rangeEnd = formatDate(termMeta?.endDate);

  return reservations
    .filter((reservation) => {
      if (termScopeInfo.scope !== "selected") return true;
      if (!rangeStart || !rangeEnd) return false;
      const date = formatDate(reservation.date);
      if (!date) return false;
      if (rangeStart && date < rangeStart) return false;
      if (rangeEnd && date > rangeEnd) return false;
      return true;
    })
    .map((reservation) => ({
      recordId: reservation.id || "",
      status: reservation.status || "confirmed",
      date: formatDate(reservation.date),
      startTime: reservation.startTime || "",
      endTime: reservation.endTime || "",
      startMinutes: toDisplayNumber(reservation.startMinutes),
      endMinutes: toDisplayNumber(reservation.endMinutes),
      title: reservation.title || "",
      purpose: reservation.purpose || "",
      headcount: toDisplayNumber(reservation.headcount),
      spaceKey: reservation.spaceKey || "",
      roomDisplay: reservation.roomDisplay || "",
      buildingCode: reservation.buildingCode || "",
      buildingDisplayName: reservation.buildingDisplayName || "",
      requesterName: reservation.requesterName || "",
      requesterEmail: reservation.requesterEmail || "",
      createdBy: reservation.createdBy || "",
      createdAt: formatDateTime(reservation.createdAt),
    }))
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      const byStart = Number(a.startMinutes || 0) - Number(b.startMinutes || 0);
      if (byStart !== 0) return byStart;
      return a.roomDisplay.localeCompare(b.roomDisplay);
    });
};

const buildBaylorAcronymRows = ({ baylorAcronyms = [] }) =>
  baylorAcronyms
    .map((item) => ({
      recordId: item.id || "",
      acronym: item.acronym || "",
      standsFor: item.standsFor || "",
      category: item.category || "",
      description: item.description || "",
    }))
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.acronym.localeCompare(b.acronym),
    );

const buildEmailListPresetRows = ({ emailListPresets = [], peopleIndex }) =>
  emailListPresets
    .map((preset) => {
      const personIds = Array.isArray(preset.personIds) ? preset.personIds : [];
      const people = personIds
        .map((personId) => peopleIndex?.resolvePerson(personId))
        .filter(Boolean);
      return {
        recordId: preset.id || "",
        name: preset.name || "",
        personIds: joinValues(personIds),
        people: joinValues(people.map(getPersonDisplayName)),
        emails: joinValues(people.map((person) => person.email).filter(Boolean)),
        personCount: personIds.length,
        createdBy: preset.createdBy || "",
        updatedBy: preset.updatedBy || "",
        createdAt: formatDateTime(preset.createdAt),
        updatedAt: formatDateTime(preset.updatedAt),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

const buildCalendarExceptionRows = ({
  calendarExceptions = [],
  termScopeInfo,
}) => {
  const rows = [];
  calendarExceptions.forEach((record) => {
    const byTerm =
      record?.termExceptions && typeof record.termExceptions === "object"
        ? record.termExceptions
        : {};
    Object.entries(byTerm).forEach(([term, exceptions]) => {
      if (!scheduleMatchesTermScope({ term }, termScopeInfo)) return;
      (Array.isArray(exceptions) ? exceptions : []).forEach((exception) => {
        rows.push({
          recordId: record.id || "",
          term,
          date: formatDate(exception?.date),
          label: exception?.label || "",
          updatedAt: formatDateTime(record.updatedAt),
        });
      });
    });
  });
  return rows.sort(
    (a, b) =>
      a.term.localeCompare(b.term) ||
      a.date.localeCompare(b.date) ||
      a.label.localeCompare(b.label),
  );
};

const roomGridMatchesTermScope = (grid, termScopeInfo) =>
  scheduleMatchesTermScope(
    {
      term: grid?.studio?.semester || grid?.semester || "",
      termCode: grid?.studio?.termCode || grid?.termCode || "",
    },
    termScopeInfo,
  );

const buildRoomGridRows = ({ roomGrids = [], termScopeInfo }) => {
  return roomGrids
    .filter((grid) => roomGridMatchesTermScope(grid, termScopeInfo))
    .map((grid) => {
      const studio = grid?.studio && typeof grid.studio === "object" ? grid.studio : {};
      return {
        recordId: grid.id || "",
        title: grid.title || studio.name || "",
        kind: grid.kind || studio.kind || (grid.html ? "legacy" : ""),
        schemaVersion: toDisplayNumber(grid.schemaVersion ?? studio.schemaVersion),
        building: studio.building || grid.building || "",
        room: studio.room || grid.room || "",
        dayPattern: grid.dayType || "",
        semester: studio.semester || grid.semester || "",
        folder: studio.folder || "",
        tags: joinValues(studio.tags || []),
        favorite: getBooleanStatusLabel(studio.favorite === true),
        source: studio.source || "",
        entryCount: Array.isArray(studio.entries) ? studio.entries.length : 0,
        layout: toJson(studio.layout),
        visibility: toJson(studio.visibility),
        createdAt: formatDateTime(grid.createdAt),
        updatedAt: formatDateTime(grid.updatedAt),
        hasTemplate: getBooleanStatusLabel(
          Boolean((grid.html || "").toString().trim() || grid.studio),
        ),
      };
    })
    .sort((a, b) => {
      const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
      if (byUpdated !== 0) return byUpdated;
      return a.title.localeCompare(b.title);
    });
};

const buildRoomGridEntryRows = ({ roomGrids = [], termScopeInfo }) => {
  const rows = [];
  roomGrids
    .filter((grid) => roomGridMatchesTermScope(grid, termScopeInfo))
    .forEach((grid) => {
      const studio = grid?.studio && typeof grid.studio === "object" ? grid.studio : {};
      (Array.isArray(studio.entries) ? studio.entries : []).forEach((entry) => {
        rows.push({
          gridId: grid.id || "",
          gridTitle: grid.title || studio.name || "",
          entryId: entry?.id || "",
          course: entry?.course || "",
          section: entry?.section || "",
          instructor: entry?.instructor || "",
          days: joinValues(entry?.days || []),
          start: entry?.start || "",
          end: entry?.end || "",
          hidden: getBooleanStatusLabel(entry?.hidden === true),
          detailLevel: entry?.detailLevel || "",
          blockColor: entry?.blockColor || "",
          note: entry?.note || "",
        });
      });
    });
  return rows.sort(
    (a, b) =>
      a.gridTitle.localeCompare(b.gridTitle) ||
      a.course.localeCompare(b.course) ||
      a.start.localeCompare(b.start),
  );
};

const buildSummaryRows = ({
  sheetIds,
  rowsBySheetId,
  termScopeInfo,
  termScopeApplied,
  scopeNotices = [],
  totalRows,
}) => {
  const scopeSummary = !termScopeApplied
    ? "Not applicable to the included global sheets"
    : termScopeInfo.scope === "selected"
      ? `Selected: ${termScopeInfo.termLabel || termScopeInfo.termCode || "Unknown"}`
      : "All semesters";
  const rows = [
    { metric: "Generated At", value: formatDateTime(new Date()) },
    {
      metric: "Semester Scope",
      value: scopeSummary,
    },
    {
      metric: "Included Sheets",
      value: joinValues(
        sheetIds
          .map((sheetId) => getSheetDefinition(sheetId)?.name)
          .filter(Boolean),
      ),
    },
  ];

  sheetIds.forEach((sheetId) => {
    const definition = getSheetDefinition(sheetId);
    rows.push({
      metric: `${definition?.name || sheetId} Rows`,
      value: String((rowsBySheetId[sheetId] || []).length),
    });
  });

  scopeNotices.forEach((notice) => {
    rows.push({ metric: "Scope Notice", value: notice });
  });

  rows.push({ metric: "Total Export Rows", value: String(totalRows) });
  return rows;
};

const getExportSheetIds = (sheetIds = []) => {
  const requested = Array.isArray(sheetIds) && sheetIds.length > 0 ? sheetIds : BULK_EXPORT_SHEET_IDS;
  const validIds = SHEET_ORDER.filter(
    (sheetId) =>
      sheetId !== SHEET_IDS.summary && requested.includes(sheetId) && Boolean(getSheetDefinition(sheetId)),
  );
  return validIds;
};

const loadSourceData = async ({ dependencies, termScopeInfo, buildingConfig }) => {
  const tasks = [];

  const needsPeople = dependencies.has("people");
  const needsSchedules = dependencies.has("schedules");
  const needsPrograms = dependencies.has("programs");
  const needsCourses = dependencies.has("courses");
  const needsSpaces = dependencies.has("spaces");
  const needsTerms = dependencies.has("terms");
  const needsReservations = dependencies.has("reservations");
  const needsBaylorAcronyms = dependencies.has("baylorAcronyms");
  const needsEmailListPresets = dependencies.has("emailListPresets");
  const needsCalendarExceptions = dependencies.has("calendarExceptions");
  const needsRoomGrids = dependencies.has("roomGrids");
  const needsBuildings = dependencies.has("buildings");

  const payload = {
    people: [],
    schedules: [],
    programs: [],
    courses: [],
    spaces: [],
    terms: [],
    reservations: [],
    baylorAcronyms: [],
    emailListPresets: [],
    calendarExceptions: [],
    roomGrids: [],
    buildings: [],
  };

  if (needsPeople) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.people).then((people) => {
        payload.people = people;
      }),
    );
  }

  if (needsSchedules) {
    tasks.push(
      fetchSchedulesForScope(termScopeInfo).then((schedules) => {
        payload.schedules = schedules;
      }),
    );
  }

  if (needsPrograms) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.programs).then((programs) => {
        payload.programs = programs;
      }),
    );
  }

  if (needsCourses) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.courses).then((courses) => {
        payload.courses = courses;
      }),
    );
  }

  if (needsSpaces) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.spaces).then((spaces) => {
        payload.spaces = spaces;
      }),
    );
  }

  if (needsTerms) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.terms).then((terms) => {
        payload.terms = terms;
      }),
    );
  }

  if (needsReservations) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.reservations).then((reservations) => {
        payload.reservations = reservations;
      }),
    );
  }

  if (needsBaylorAcronyms) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.baylorAcronyms).then((baylorAcronyms) => {
        payload.baylorAcronyms = baylorAcronyms;
      }),
    );
  }

  if (needsEmailListPresets) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.emailListPresets).then((emailListPresets) => {
        payload.emailListPresets = emailListPresets;
      }),
    );
  }

  if (needsCalendarExceptions) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.calendarExceptions).then(
        (calendarExceptions) => {
          payload.calendarExceptions = calendarExceptions;
        },
      ),
    );
  }

  if (needsRoomGrids) {
    tasks.push(
      getCollectionDocs(COLLECTIONS.roomGrids).then((roomGrids) => {
        payload.roomGrids = roomGrids;
      }),
    );
  }

  if (needsBuildings) {
    tasks.push(
      fetchBuildingConfig({ buildingConfig }).then((buildings) => {
        payload.buildings = buildings;
      }),
    );
  }

  await Promise.all(tasks);
  return payload;
};

const estimateTotalRows = (rowsBySheetId = {}, sheetIds = []) =>
  sheetIds.reduce((total, sheetId) => total + ((rowsBySheetId[sheetId] || []).length || 0), 0);

export const buildAdminExportPackage = async ({
  sheetIds,
  termScope = "all",
  selectedTerm = "",
  selectedTermMeta = null,
  buildingConfig = null,
  sourceData = null,
} = {}) => {
  const requestedSheetIds = getExportSheetIds(sheetIds);
  const termScopeApplied = requestedSheetIds.some(isTermScopedSheet);
  const termScopeInfo = toNormalizedTermScope({
    termScope,
    selectedTerm,
    selectedTermMeta,
  });
  const dependencies = getRequiredDependencies(requestedSheetIds);

  // Building rows require the configuration source.
  if (requestedSheetIds.includes(SHEET_IDS.buildings)) {
    dependencies.add("buildings");
  }

  const source = sourceData
    ? {
        people: [],
        schedules: [],
        programs: [],
        courses: [],
        spaces: [],
        terms: [],
        reservations: [],
        baylorAcronyms: [],
        emailListPresets: [],
        calendarExceptions: [],
        roomGrids: [],
        buildings: [],
        ...sourceData,
      }
    : await loadSourceData({
        dependencies,
        termScopeInfo,
        buildingConfig,
      });

  const peopleIndex = buildPeopleIndex(source.people || []);
  const canonicalPeople = peopleIndex.canonicalPeople || [];
  const schedules = uniqueById(source.schedules || []);
  const spaces = uniqueById(source.spaces || []);

  const programsById = new Map((source.programs || []).map((program) => [program.id, program]));
  const spacesByKey = new Map(
    spaces
      .map((space) => normalizeSpaceRecord(space, space.id))
      .filter((space) => Boolean(space.spaceKey))
      .map((space) => [space.spaceKey, space]),
  );

  const rowsBySheetId = {};

  const builders = {
    [SHEET_IDS.people]: () =>
      buildPeopleRows({
        canonicalPeople,
        peopleIndex,
        programsById,
        spacesByKey,
      }),
    [SHEET_IDS.studentWorkerAssignments]: () =>
      buildStudentAssignmentRows({
        canonicalPeople,
        peopleIndex,
        termScopeInfo,
        selectedTermMeta,
        terms: source.terms || [],
      }),
    [SHEET_IDS.courseSections]: () =>
      buildCourseSectionRows({
        schedules,
        peopleIndex,
        spacesByKey,
        termScopeInfo,
      }),
    [SHEET_IDS.sectionMeetings]: () =>
      buildSectionMeetingRows({
        schedules,
        peopleIndex,
        spacesByKey,
        termScopeInfo,
      }),
    [SHEET_IDS.courses]: () => buildCourseRows({ courses: source.courses || [] }),
    [SHEET_IDS.programs]: () =>
      buildProgramRows({
        programs: source.programs || [],
        peopleIndex,
      }),
    [SHEET_IDS.spaces]: () =>
      buildSpaceRows({
        spaces,
        schedules,
        canonicalPeople,
      }),
    [SHEET_IDS.buildings]: () =>
      buildBuildingRows({
        buildings: source.buildings || [],
        spaces,
      }),
    [SHEET_IDS.terms]: () =>
      buildTermRows({
        terms: source.terms || [],
        schedules,
        termScopeInfo,
      }),
    [SHEET_IDS.roomReservations]: () =>
      buildRoomReservationRows({
        reservations: source.reservations || [],
        termScopeInfo,
        selectedTermMeta,
        terms: source.terms || [],
      }),
    [SHEET_IDS.baylorAcronyms]: () =>
      buildBaylorAcronymRows({ baylorAcronyms: source.baylorAcronyms || [] }),
    [SHEET_IDS.emailListPresets]: () =>
      buildEmailListPresetRows({
        emailListPresets: source.emailListPresets || [],
        peopleIndex,
      }),
    [SHEET_IDS.calendarExceptions]: () =>
      buildCalendarExceptionRows({
        calendarExceptions: source.calendarExceptions || [],
        termScopeInfo,
      }),
    [SHEET_IDS.roomGrids]: () =>
      buildRoomGridRows({
        roomGrids: source.roomGrids || [],
        termScopeInfo,
      }),
    [SHEET_IDS.roomGridEntries]: () =>
      buildRoomGridEntryRows({
        roomGrids: source.roomGrids || [],
        termScopeInfo,
      }),
  };

  requestedSheetIds.forEach((sheetId) => {
    const builder = builders[sheetId];
    rowsBySheetId[sheetId] = typeof builder === "function" ? builder() : [];
  });

  const totalRows = estimateTotalRows(rowsBySheetId, requestedSheetIds);
  const scopeNotices = [];
  if (
    requestedSheetIds.includes(SHEET_IDS.roomReservations) &&
    termScopeInfo.scope === "selected"
  ) {
    const reservationTermMeta = getSelectedTermMeta({
      termScopeInfo,
      selectedTermMeta,
      terms: source.terms || [],
    });
    if (
      !formatDate(reservationTermMeta?.startDate) ||
      !formatDate(reservationTermMeta?.endDate)
    ) {
      scopeNotices.push(
        "Room Reservations were omitted because the selected semester does not have both a start date and an end date.",
      );
    }
  }
  const summaryRows = buildSummaryRows({
    sheetIds: requestedSheetIds,
    rowsBySheetId,
    termScopeInfo,
    termScopeApplied,
    scopeNotices,
    totalRows,
  });

  return {
    sheetIds: requestedSheetIds,
    rowsBySheetId,
    summaryRows,
    totalRows,
    termScopeInfo,
    termScopeApplied,
  };
};

export const getBulkFileName = ({ termScopeInfo } = {}) =>
  buildBulkExportFileName({ termScopeInfo });

export const getIndividualFileName = ({ label, termScopeInfo } = {}) =>
  buildIndividualFileName({ label, termScopeInfo });
