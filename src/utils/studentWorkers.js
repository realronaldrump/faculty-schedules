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
        weeklySchedule: fallbackSchedule
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
