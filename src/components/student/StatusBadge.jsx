import React from "react";
import { parseStudentWorkerDate } from "../../utils/studentWorkers";

/**
 * StatusBadge - Visual status indicator with color coding
 *
 * Displays student/assignment status with appropriate colors and icons
 */

const StatusBadge = ({ status, size = "md", showDot = true }) => {
  const config = {
    active: {
      bg: "bg-green-100",
      text: "text-green-800",
      dot: "bg-green-500",
      border: "border-green-200",
      label: "Active",
    },
    inactive: {
      bg: "bg-gray-100",
      text: "text-gray-800",
      dot: "bg-gray-500",
      border: "border-gray-200",
      label: "Inactive",
    },
    upcoming: {
      bg: "bg-blue-100",
      text: "text-blue-800",
      dot: "bg-blue-500",
      border: "border-blue-200",
      label: "Upcoming",
    },
    ended: {
      bg: "bg-amber-100",
      text: "text-amber-800",
      dot: "bg-amber-500",
      border: "border-amber-200",
      label: "Ended",
    },
    partial: {
      bg: "bg-purple-100",
      text: "text-purple-800",
      dot: "bg-purple-500",
      border: "border-purple-200",
      label: "Partial",
    },
  };

  const { bg, text, dot, border, label } = config[status] || config.inactive;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  };

  const dotSizes = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-2.5 h-2.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${bg} ${text} ${border} ${sizeClasses[size]}`}
    >
      {showDot && <span className={`rounded-full ${dot} ${dotSizes[size]}`} />}
      {label}
    </span>
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
