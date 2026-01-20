import { normalizeTermLabel, termCodeFromLabel } from './termUtils';

export const parseHourlyRate = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateEntryMinutes = (entry) => {
  if (!entry || !entry.start || !entry.end) return 0;
  const parseTime = (timeStr) => {
    if (typeof timeStr !== 'string') return null;
    const [hourStr, minuteStr = '0'] = timeStr.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return hour * 60 + minute;
  };

  const startMinutes = parseTime(entry.start);
  const endMinutes = parseTime(entry.end);
  if (startMinutes === null || endMinutes === null) return 0;
  const diff = endMinutes - startMinutes;
  return diff > 0 ? diff : 0;
};

export const calculateWeeklyHoursFromSchedule = (schedule) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 0;
  const totalMinutes = schedule.reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
  return totalMinutes / 60;
};

export const getStudentAssignments = (student) => {
  if (!student) return [];

  const fallbackSchedule = Array.isArray(student.weeklySchedule) ? student.weeklySchedule : [];
  const fallbackBuildings = Array.isArray(student.primaryBuildings)
    ? student.primaryBuildings.filter(Boolean)
    : (student.primaryBuilding ? [student.primaryBuilding] : []);

  const jobs = Array.isArray(student.jobs) && student.jobs.length > 0
    ? student.jobs
    : [{
        jobTitle: student.jobTitle || '',
        supervisor: student.supervisor || '',
        hourlyRate: student.hourlyRate,
        location: fallbackBuildings,
        weeklySchedule: fallbackSchedule,
        startDate: student.startDate || '',
        endDate: student.endDate || ''
      }];

  return jobs.map((job, index) => {
    const schedule = Array.isArray(job.weeklySchedule) && job.weeklySchedule.length > 0
      ? job.weeklySchedule
      : fallbackSchedule;

    const buildings = Array.isArray(job.location)
      ? job.location.filter(Boolean)
      : (job.location ? [job.location] : fallbackBuildings);

    const hourlyRateNumber = parseHourlyRate(job.hourlyRate ?? student.hourlyRate);
    const weeklyHours = calculateWeeklyHoursFromSchedule(schedule);
    const weeklyPay = hourlyRateNumber * weeklyHours;

    return {
      ...job,
      jobTitle: job.jobTitle || student.jobTitle || `Assignment ${index + 1}`,
      supervisor: job.supervisor || student.supervisor || '',
      schedule,
      buildings,
      hourlyRateNumber,
      hourlyRateDisplay: hourlyRateNumber
        ? `$${hourlyRateNumber.toFixed(2)}`
        : (job.hourlyRate || student.hourlyRate || ''),
      weeklyHours,
      weeklyPay,
    };
  });
};

export const getStudentTotalWeeklyHours = (student) => {
  return getStudentAssignments(student).reduce((sum, assignment) => sum + assignment.weeklyHours, 0);
};

export const formatCurrency = (value) => {
  const numberValue = Number(value || 0);
  return `$${numberValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatHoursValue = (value) => {
  const numberValue = Number(value || 0);
  return numberValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseDateValue = (value, { endOfDay = false } = {}) => {
  if (!value) return null;
  if (value instanceof Date) {
    const normalized = new Date(value.getTime());
    normalized.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return Number.isNaN(normalized.getTime()) ? null : normalized;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return parseDateValue(value.toDate(), { endOfDay });
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const dateOnly = raw.split('T')[0];
  if (!dateOnly) return null;
  const parsed = new Date(`${dateOnly}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDateRange = (startValue, endValue) => {
  const start = parseDateValue(startValue, { endOfDay: false });
  const end = parseDateValue(endValue, { endOfDay: true });
  return {
    startDate: startValue || '',
    endDate: endValue || '',
    start,
    end
  };
};

const hasDateRangeOverlap = (range, window) => {
  if (!window) return true;
  const windowStart = window.start;
  const windowEnd = window.end;
  if (windowStart && range.end && range.end < windowStart) return false;
  if (windowEnd && range.start && range.start > windowEnd) return false;
  return true;
};

export const getAssignmentDateRange = (assignment, student) => {
  const startValue = assignment?.startDate || student?.startDate || '';
  const endValue = assignment?.endDate || student?.endDate || '';
  return buildDateRange(startValue, endValue);
};

export const buildSemesterWindow = (semesterMeta) => {
  if (!semesterMeta) return null;
  const start = parseDateValue(semesterMeta.startDate, { endOfDay: false });
  const end = parseDateValue(semesterMeta.endDate, { endOfDay: true });
  if (!start && !end) return null;
  return { start, end };
};

export const getAssignmentStatusForSemester = (
  assignment,
  student,
  semesterMeta,
  { referenceDate = new Date() } = {}
) => {
  if (student?.isActive === false) {
    return { status: 'Inactive', isActive: false };
  }

  const range = getAssignmentDateRange(assignment, student);
  const semesterWindow = buildSemesterWindow(semesterMeta);

  if (semesterWindow) {
    if (hasDateRangeOverlap(range, semesterWindow)) {
      return { status: 'Active', isActive: true };
    }

    if (range.start && semesterWindow.end && range.start > semesterWindow.end) {
      return { status: 'Upcoming', isActive: false };
    }

    if (range.end && semesterWindow.start && range.end < semesterWindow.start) {
      return { status: 'Ended', isActive: false };
    }

    return { status: 'Inactive', isActive: false };
  }

  if (range.start && referenceDate < range.start) {
    return { status: 'Upcoming', isActive: false };
  }
  if (range.end && referenceDate > range.end) {
    return { status: 'Ended', isActive: false };
  }
  return { status: 'Active', isActive: true };
};

export const isAssignmentActiveDuringSemester = (
  assignment,
  student,
  semesterMeta,
  { referenceDate = new Date() } = {}
) => {
  return getAssignmentStatusForSemester(assignment, student, semesterMeta, { referenceDate }).isActive;
};

export const isAssignmentActiveOnDate = (
  assignment,
  student,
  referenceDate = new Date()
) => {
  return getAssignmentStatusForSemester(assignment, student, null, { referenceDate }).isActive;
};

export const getStudentStatusForSemester = (student, semesterMeta, options = {}) => {
  if (!student) return { status: 'Inactive', isActive: false };
  if (student.isActive === false) return { status: 'Inactive', isActive: false };

  const assignments = getStudentAssignments(student);
  if (assignments.length === 0) return { status: 'Inactive', isActive: false };

  const statuses = assignments.map((assignment) =>
    getAssignmentStatusForSemester(assignment, student, semesterMeta, options)
  );

  if (statuses.some((item) => item.isActive)) {
    return { status: 'Active', isActive: true };
  }
  if (statuses.some((item) => item.status === 'Upcoming')) {
    return { status: 'Upcoming', isActive: false };
  }
  if (statuses.some((item) => item.status === 'Ended')) {
    return { status: 'Ended', isActive: false };
  }

  return { status: 'Inactive', isActive: false };
};

export const buildSemesterKey = (semesterLabel) => {
  const rawLabel = String(semesterLabel || '').trim();
  const normalizedLabel = normalizeTermLabel(rawLabel) || rawLabel;
  const semesterCode = termCodeFromLabel(normalizedLabel) || termCodeFromLabel(rawLabel);
  const semesterKey = semesterCode || normalizedLabel || rawLabel;
  return {
    semesterKey,
    semesterLabel: normalizedLabel || rawLabel,
    semesterCode: semesterCode || ''
  };
};

export const getSemesterScheduleEntry = (student, semesterLabel) => {
  const semesterSchedules =
    student && typeof student.semesterSchedules === 'object'
      ? student.semesterSchedules
      : (student && typeof student.termSchedules === 'object' ? student.termSchedules : {});
  const scheduleKeys = Object.keys(semesterSchedules || {});
  const { semesterKey, semesterLabel: normalizedLabel, semesterCode } = buildSemesterKey(semesterLabel);

  if (scheduleKeys.length === 0) {
    return {
      scheduleEntry: null,
      hasSchedules: false,
      semesterKey,
      semesterLabel: normalizedLabel,
      semesterCode
    };
  }

  let scheduleEntry = semesterSchedules[semesterKey];
  if (!scheduleEntry && semesterCode) {
    scheduleEntry = semesterSchedules[semesterCode];
  }
  if (!scheduleEntry && normalizedLabel) {
    scheduleEntry = semesterSchedules[normalizedLabel];
  }

  if (!scheduleEntry) {
    scheduleEntry = scheduleKeys
      .map((key) => semesterSchedules[key])
      .find((entry) => {
        const entryLabel = normalizeTermLabel(entry?.semester || entry?.term || '') || '';
        const entryCode = entry?.semesterCode || entry?.termCode || '';
        if (semesterCode && entryCode && String(entryCode) === String(semesterCode)) return true;
        if (normalizedLabel && entryLabel && entryLabel === normalizedLabel) return true;
        return false;
      }) || null;
  }

  return {
    scheduleEntry,
    hasSchedules: scheduleKeys.length > 0,
    semesterKey,
    semesterLabel: normalizedLabel,
    semesterCode
  };
};

const summarizeJobs = (jobs) => {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const weeklySchedule = safeJobs.flatMap((job) =>
    Array.isArray(job.weeklySchedule) ? job.weeklySchedule : []
  );
  const primaryBuildings = Array.from(
    new Set(
      safeJobs.flatMap((job) =>
        Array.isArray(job.location) ? job.location.filter(Boolean) : job.location ? [job.location] : []
      )
    )
  );
  const primaryJob = safeJobs[0] || {};
  return {
    weeklySchedule,
    primaryBuildings,
    primaryBuilding: primaryBuildings[0] || '',
    jobTitle: primaryJob.jobTitle || '',
    supervisor: primaryJob.supervisor || '',
    hourlyRate: primaryJob.hourlyRate || ''
  };
};

export const applySemesterSchedule = (student, semesterLabel) => {
  const { scheduleEntry, hasSchedules } = getSemesterScheduleEntry(student, semesterLabel);
  if (!hasSchedules) {
    return {
      ...student,
      jobs: Array.isArray(student?.jobs) ? student.jobs : []
    };
  }

  if (!scheduleEntry) {
    return {
      ...student,
      jobs: [],
      weeklySchedule: [],
      primaryBuildings: [],
      primaryBuilding: '',
      jobTitle: '',
      supervisor: '',
      hourlyRate: ''
    };
  }

  const jobs = Array.isArray(scheduleEntry.jobs) ? scheduleEntry.jobs : [];
  const summary = summarizeJobs(jobs);

  return {
    ...student,
    jobs,
    weeklySchedule: Array.isArray(scheduleEntry.weeklySchedule) && scheduleEntry.weeklySchedule.length > 0
      ? scheduleEntry.weeklySchedule
      : summary.weeklySchedule,
    primaryBuildings: Array.isArray(scheduleEntry.primaryBuildings) && scheduleEntry.primaryBuildings.length > 0
      ? scheduleEntry.primaryBuildings
      : summary.primaryBuildings,
    primaryBuilding: scheduleEntry.primaryBuilding || summary.primaryBuilding,
    jobTitle: scheduleEntry.jobTitle || summary.jobTitle,
    supervisor: scheduleEntry.supervisor || summary.supervisor,
    hourlyRate: scheduleEntry.hourlyRate || summary.hourlyRate
  };
};
