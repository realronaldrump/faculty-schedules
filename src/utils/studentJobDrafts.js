import { parseStudentWorkerDate } from "./studentWorkers";

export const createStudentJobDraft = (job = {}) => {
  const locations = job.buildings ?? job.location ?? [];
  return {
    jobTitle: "",
    supervisor: "",
    supervisorId: "",
    hourlyRate: "",
    startDate: "",
    endDate: "",
    ...job,
    buildings: Array.isArray(locations) ? [...locations] : [locations],
    weeklySchedule: (job.weeklySchedule || []).map((entry) => ({ ...entry })),
  };
};

export const getStudentJobError = (job) => {
  if (!job?.jobTitle?.trim()) return "Enter a job title before saving this assignment.";
  if (job.hourlyRate !== "" && job.hourlyRate != null) {
    const rate = Number(job.hourlyRate);
    if (!Number.isFinite(rate) || rate < 0) return "Hourly rate must be a valid, non-negative amount.";
  }
  const start = parseStudentWorkerDate(job.startDate);
  const end = parseStudentWorkerDate(job.endDate);
  if (start && end && end < start) return "End date cannot be before start date.";
  return "";
};

export const getStudentSaveError = (error) => {
  if (error?.code === "permission-denied" || /insufficient permissions/i.test(error?.message || "")) {
    return "Your account is not permitted to save this student worker. Your changes are still here.";
  }
  return error?.message || "The student worker could not be saved. Your changes are still here. Please try again.";
};
