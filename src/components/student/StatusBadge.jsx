import { parseStudentWorkerDate } from "../../utils/studentWorkers";
import Badge from "../shared/Badge";

/**
 * StatusBadge - employment status indicator for student workers.
 *
 * Thin wrapper that maps a status string to the shared Badge primitive so all
 * badges across the app share one consistent, on-brand appearance.
 */
const STATUS_CONFIG = {
  active: { tone: "success", label: "Active" },
  inactive: { tone: "neutral", label: "Inactive" },
  upcoming: { tone: "info", label: "Upcoming" },
  ended: { tone: "warning", label: "Ended" },
  partial: { tone: "warning", label: "Partial" },
};

const StatusBadge = ({ status, size = "md", showDot = true }) => {
  const { tone, label } = STATUS_CONFIG[status] || STATUS_CONFIG.inactive;
  return (
    <Badge tone={tone} size={size} showDot={showDot} bordered>
      {label}
    </Badge>
  );
};

/**
 * Get status for a student based on dates and isActive flag
 */
export const getStudentStatus = (student, referenceDate = new Date()) => {
  if (!student) return "inactive";
  if (student.isActive === false) return "inactive";
  if (!student.startDate) return "inactive";

  const now = referenceDate instanceof Date ? referenceDate : new Date();
  const start = parseStudentWorkerDate(student.startDate);
  if (!start) return "inactive";

  if (start > now) return "upcoming";

  if (student.endDate) {
    const end = parseStudentWorkerDate(student.endDate, { endOfDay: true });
    if (end && now > end) return "ended";
  }

  // Check if some jobs are ended but student is still active
  if (student.jobs && student.jobs.length > 0) {
    const jobStatuses = student.jobs.map((job) =>
      getJobStatus(job, student, referenceDate),
    );
    const hasActive = jobStatuses.some((s) => s === "active");
    const hasEnded = jobStatuses.some((s) => s === "ended");

    if (hasActive && hasEnded) return "partial";
    if (!hasActive && hasEnded) return "ended";
  }

  return "active";
};

/**
 * Get status for a specific job assignment
 */
export const getJobStatus = (job, student, referenceDate = new Date()) => {
  if (student?.isActive === false) return "inactive";

  const startDate = job?.startDate || student?.startDate;
  const endDate = job?.endDate || student?.endDate;

  if (!startDate) return "inactive";

  const now = referenceDate instanceof Date ? referenceDate : new Date();
  const start = parseStudentWorkerDate(startDate);
  if (!start) return "inactive";

  if (start > now) return "upcoming";

  if (endDate) {
    const end = parseStudentWorkerDate(endDate, { endOfDay: true });
    if (end && now > end) return "ended";
  }

  return "active";
};

export default StatusBadge;
