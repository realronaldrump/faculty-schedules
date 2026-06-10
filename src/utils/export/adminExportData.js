import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { buildPeopleIndex } from "../peopleUtils";
import {
  getAssignmentStatusForSemester,
  getStudentAssignments,
  getStudentStatusForSemester,
  parseHourlyRate,
} from "../studentWorkers";
import { normalizeSpaceRecord } from "../spaceUtils";
import {
  BULK_EXPORT_SHEET_IDS,
  getSheetDefinition,
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
  roomGrids: "roomGrids",
};

const SHEET_DEPENDENCIES = {
  [SHEET_IDS.people]: ["people", "programs", "spaces"],
  [SHEET_IDS.studentWorkerAssignments]: ["people"],
  [SHEET_IDS.courseSections]: ["schedules", "people", "spaces"],
  [SHEET_IDS.sectionMeetings]: ["schedules", "people", "spaces"],
  [SHEET_IDS.courses]: ["courses"],
  [SHEET_IDS.programs]: ["programs", "people"],
  [SHEET_IDS.spaces]: ["spaces", "schedules", "people"],
  [SHEET_IDS.buildings]: ["spaces"],
  [SHEET_IDS.terms]: ["terms", "schedules"],
  [SHEET_IDS.roomGrids]: ["roomGrids"],
};

const ROLE_STUDENT = "student";

const getCollectionDocs = async (collectionName) => {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
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
        items.push({ id: docSnap.id, ...docSnap.data() });
      }
    });
  };

  if (termScopeInfo.termCode) {
    await appendQuery(
      query(
        collection(db, COLLECTIONS.schedules),
        where("termCode", "==", termScopeInfo.termCode),
      ),
    );
  }

  if (items.length === 0 && termScopeInfo.termLabel) {
    await appendQuery(
      query(
        collection(db, COLLECTIONS.schedules),
        where("term", "==", termScopeInfo.termLabel),
      ),
    );
  }

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

const resolvePrimaryInstructorName = (schedule = {}, peopleIndex = null) => {
  if (schedule.instructorId && peopleIndex) {
    const canonicalId = peopleIndex.resolvePersonId(schedule.instructorId);
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

const buildPeopleRows = ({ canonicalPeople = [], programsById = new Map(), spacesByKey = new Map() }) => {
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

      const program = person.programId ? programsById.get(person.programId) : null;

      return {
        name: getPersonDisplayName(person),
        firstName: person.firstName || "",
        lastName: person.lastName || "",
        roles: joinValues(roles),
        status: getActiveStatusLabel(person.isActive),
        inactiveReason: person.inactiveReason || "",
        email: person.email || "",
        phone: person.phone || "",
        baylorId: getPersonBaylorId(person),
        clssInstructorId: getPersonClssInstructorId(person),
        title: person.title || "",
        jobTitle: person.jobTitle || "",
        department: person.department || "",
        program: program?.name || "",
        office: person.office || joinValues(person.offices || []),
        officeSpaces: joinValues(officeSpaces),
        isAdjunct: getBooleanStatusLabel(person.isAdjunct === true),
        isUPD: getBooleanStatusLabel(person.isUPD === true),
        isFullTime: getBooleanStatusLabel(person.isFullTime !== false),
        isTenured: getBooleanStatusLabel(person.isTenured === true),
        isRemote: getBooleanStatusLabel(person.isRemote === true),
        hasNoPhone: getBooleanStatusLabel(person.hasNoPhone === true),
        hasNoOffice: getBooleanStatusLabel(person.hasNoOffice === true),
      };
    })
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return a.email.localeCompare(b.email);
    });
};

const buildStudentAssignmentRows = ({
  canonicalPeople = [],
  peopleIndex,
  termScopeInfo,
  selectedTermMeta,
}) => {
  const peopleById = new Map(canonicalPeople.map((person) => [person.id, person]));

  const students = canonicalPeople.filter((person) => {
    const roles = normalizeRoleList(person.roles);
    return roles.includes(ROLE_STUDENT);
  });

  const termMetaForStatus = termScopeInfo.scope === "selected" ? selectedTermMeta : null;

  const rows = [];
  students.forEach((student) => {
    const studentStatus = getStudentStatusForSemester(student, termMetaForStatus).status;
    const assignments = getStudentAssignments(student);

    assignments.forEach((assignment) => {
      const supervisorId = assignment?.supervisorId || "";
      const canonicalSupervisorId = supervisorId
        ? peopleIndex.resolvePersonId(supervisorId)
        : "";
      const supervisorRecord = canonicalSupervisorId
        ? peopleById.get(canonicalSupervisorId)
        : null;

      const assignmentStatus = getAssignmentStatusForSemester(
        assignment,
        student,
        termMetaForStatus,
      ).status;

      const hourlyRate = formatCurrency(
        assignment?.hourlyRateNumber ?? parseHourlyRate(assignment?.hourlyRate),
      );

      rows.push({
        studentName: getPersonDisplayName(student),
        studentEmail: student.email || "",
        studentStatus,
        assignmentStatus,
        jobTitle: assignment?.jobTitle || "",
        supervisor:
          assignment?.supervisor ||
          (supervisorRecord ? getPersonDisplayName(supervisorRecord) : ""),
        supervisorEmail: supervisorRecord?.email || "",
        hourlyRate,
        startDate: formatDate(assignment?.startDate || student?.startDate),
        endDate: formatDate(assignment?.endDate || student?.endDate),
        weeklyHours: toDisplayNumber(assignment?.weeklyHours),
        weeklySchedule: formatWeeklySchedule(assignment?.schedule),
        buildings: joinValues(assignment?.buildings || []),
      });
    });
  });

  return rows.sort((a, b) => {
    const byName = a.studentName.localeCompare(b.studentName);
    if (byName !== 0) return byName;
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
      term: schedule.term || "",
      termCode: schedule.termCode || "",
      courseCode: schedule.courseCode || "",
      courseTitle: schedule.courseTitle || schedule.title || "",
      section: schedule.section || "",
      crn: schedule.crn || "",
      status: schedule.status || "Active",
      program: schedule.program || schedule.subjectCode || schedule.subject || "",
      credits: toDisplayNumber(schedule.credits),
      instructors: resolveInstructorNames(schedule, peopleIndex),
      primaryInstructor: resolvePrimaryInstructorName(schedule, peopleIndex),
      instructionMethod: schedule.instructionMethod || "",
      scheduleType: schedule.scheduleType || "",
      locationType: schedule.locationType || "",
      locations: resolveLocationDisplay(schedule, spacesByKey),
      meetingPatternSummary: formatMeetingPatternSummary(schedule.meetingPatterns),
      enrollment: toDisplayNumber(schedule.enrollment),
      maxEnrollment: toDisplayNumber(
        schedule.maxEnrollment ?? schedule.maximumEnrollment ?? schedule.MaxEnrollment,
      ),
      waitCap: toDisplayNumber(schedule.waitCap),
      waitCurrent: toDisplayNumber(schedule.waitTotal),
      partOfTerm: schedule.partOfTerm || "",
      customStartDate: formatDate(schedule.customStartDate),
      customEndDate: formatDate(schedule.customEndDate),
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
          ? schedule.meetingPatterns
          : [null];

      meetingPatterns.forEach((pattern) => {
        rows.push({
          term: schedule.term || "",
          termCode: schedule.termCode || "",
          courseCode: schedule.courseCode || "",
          section: schedule.section || "",
          crn: schedule.crn || "",
          status: schedule.status || "Active",
          day: pattern?.day || "",
          startTime: pattern?.startTime || "",
          endTime: pattern?.endTime || "",
          locations: resolveLocationDisplay(schedule, spacesByKey),
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
      courseCode: course.courseCode || course.code || course.id || "",
      courseTitle: course.title || course.courseTitle || "",
      subjectCode: course.subjectCode || course.subject || "",
      catalogNumber: course.catalogNumber || "",
      credits: toDisplayNumber(course.credits ?? course.creditHours),
      program: course.program || course.subjectCode || "",
      department: course.department || course.departmentCode || "",
      status: getActiveStatusLabel(course.isActive),
    }))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
};

const buildProgramRows = ({ programs = [], canonicalPeople = [] }) => {
  return programs
    .map((program) => {
      const updNameSet = new Set();
      const updIds = Array.isArray(program.updIds) ? program.updIds : [];

      canonicalPeople.forEach((person) => {
        if (person?.programId === program.id && person?.isUPD === true) {
          updNameSet.add(getPersonDisplayName(person));
        }
      });

      updIds.forEach((personId) => {
        const person = canonicalPeople.find((candidate) => candidate.id === personId);
        if (!person) return;
        updNameSet.add(getPersonDisplayName(person));
      });

      const updNames = Array.from(updNameSet).sort((a, b) => a.localeCompare(b));

      return {
        programName: program.name || "",
        programCode: program.code || "",
        updNames: joinValues(updNames),
        updCount: updNames.length,
        status: getActiveStatusLabel(program.isActive),
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
        spaceKey,
        displayName: normalized.displayName || "",
        buildingCode: normalized.buildingCode || "",
        buildingName: normalized.buildingDisplayName || "",
        spaceNumber: normalized.spaceNumber || "",
        type: normalized.type || "",
        capacity: toDisplayNumber(normalized.capacity),
        equipment: joinValues(normalized.equipment || []),
        status: getActiveStatusLabel(normalized.isActive),
        scheduledSectionsCount,
        assignedOfficesCount,
        notes: normalized.notes || "",
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
        code,
        displayName: building.displayName || "",
        aliases: joinValues(building.aliases || []),
        campus: building.campus || "",
        address: building.address || "",
        status: getActiveStatusLabel(building.isActive),
        activeSpaceCount: activeSpaceCountByBuilding.get(code) || 0,
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
      term: termLabel,
      termCode,
      status,
      locked: getBooleanStatusLabel(term.locked === true || status === "archived"),
      startDate: formatDate(term.startDate),
      endDate: formatDate(term.endDate),
      sectionCount: sectionCountByKey.get(key) || 0,
    };
  });

  if (termRows.length > 0) {
    return termRows.sort((a, b) => (b.termCode || b.term).localeCompare(a.termCode || a.term));
  }

  // Fallback if terms collection has not been populated.
  return Array.from(sectionCountByKey.entries())
    .map(([key, count]) => ({
      term: key,
      termCode: key,
      status: "active",
      locked: "No",
      startDate: "",
      endDate: "",
      sectionCount: count,
    }))
    .sort((a, b) => (b.termCode || b.term).localeCompare(a.termCode || a.term));
};

const buildRoomGridRows = ({ roomGrids = [] }) => {
  return roomGrids
    .map((grid) => ({
      title: grid.title || "",
      building: grid.building || "",
      room: grid.room || "",
      dayPattern: grid.dayType || "",
      semester: grid.semester || "",
      createdAt: formatDateTime(grid.createdAt),
      hasTemplate: getBooleanStatusLabel(Boolean((grid.html || "").toString().trim())),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const buildSummaryRows = ({
  sheetIds,
  rowsBySheetId,
  termScopeInfo,
  totalRows,
}) => {
  const rows = [
    { metric: "Generated At", value: formatDateTime(new Date()) },
    {
      metric: "Term Scope",
      value:
        termScopeInfo.scope === "selected"
          ? `Selected: ${termScopeInfo.termLabel || termScopeInfo.termCode || "Unknown"}`
          : "All terms",
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
  const needsRoomGrids = dependencies.has("roomGrids");
  const needsBuildings = dependencies.has("buildings");

  const payload = {
    people: [],
    schedules: [],
    programs: [],
    courses: [],
    spaces: [],
    terms: [],
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
} = {}) => {
  const requestedSheetIds = getExportSheetIds(sheetIds);
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

  const source = await loadSourceData({
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
        programsById,
        spacesByKey,
      }),
    [SHEET_IDS.studentWorkerAssignments]: () =>
      buildStudentAssignmentRows({
        canonicalPeople,
        peopleIndex,
        termScopeInfo,
        selectedTermMeta,
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
        canonicalPeople,
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
    [SHEET_IDS.roomGrids]: () => buildRoomGridRows({ roomGrids: source.roomGrids || [] }),
  };

  requestedSheetIds.forEach((sheetId) => {
    const builder = builders[sheetId];
    rowsBySheetId[sheetId] = typeof builder === "function" ? builder() : [];
  });

  const totalRows = estimateTotalRows(rowsBySheetId, requestedSheetIds);
  const summaryRows = buildSummaryRows({
    sheetIds: requestedSheetIds,
    rowsBySheetId,
    termScopeInfo,
    totalRows,
  });

  return {
    sheetIds: requestedSheetIds,
    rowsBySheetId,
    summaryRows,
    totalRows,
    termScopeInfo,
  };
};

export const getBulkFileName = ({ termScopeInfo } = {}) =>
  buildBulkExportFileName({ termScopeInfo });

export const getIndividualFileName = ({ label } = {}) =>
  buildIndividualFileName({ label });
