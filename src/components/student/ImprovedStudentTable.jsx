import React, { useState } from "react";
import {
  Edit,
  Trash2,
  Clock,
  Building,
  User,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  PhoneOff,
  Briefcase,
} from "lucide-react";
import StatusBadge, { getStudentStatus } from "./StatusBadge";

/**
 * ImprovedStudentTable - Enhanced table with expandable rows and visual job cards
 *
 * Key improvements:
 * - Visual status badges with color coding
 * - Expandable rows for detailed job information
 * - Better schedule display in compact form
 * - Cleaner action buttons
 * - Visual job summary cards
 */

const DAYS = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
  S: "Sat",
  U: "Sun",
};

const ImprovedStudentTable = ({
  students = [],
  onEdit,
  onDelete,
  onViewDetails,
  semesterMeta = null,
}) => {
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = (studentId) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  const formatPhoneNumber = (phone) => {
    if (!phone) return "";
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    return `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  const calculateJobHours = (schedule) => {
    if (!schedule?.length) return 0;
    return schedule.reduce((sum, entry) => {
      const start =
        parseInt(entry.start.split(":")[0]) +
        parseInt(entry.start.split(":")[1] || 0) / 60;
      const end =
        parseInt(entry.end.split(":")[0]) +
        parseInt(entry.end.split(":")[1] || 0) / 60;
      return sum + (end - start);
    }, 0);
  };

  const formatCompactSchedule = (schedule) => {
    if (!schedule?.length) return null;

    const groups = {};
    schedule.forEach((entry) => {
      const key = `${entry.start}-${entry.end}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry.day);
    });

    return Object.entries(groups).map(([time, days]) => {
      const [start, end] = time.split("-");
      const dayStr = days.map((d) => DAYS[d]).join(", ");
      return `${dayStr} ${formatTime(start)}-${formatTime(end)}`;
    });
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="university-table">
          <thead>
            <tr>
              <th className="table-header-cell">
                Student
              </th>
              <th className="table-header-cell">
                Status
              </th>
              <th className="table-header-cell">Jobs</th>
              <th className="table-header-cell">
                Contact
              </th>
              <th className="table-header-cell">
                Hours/Week
              </th>
              <th className="table-header-cell text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const isExpanded = expandedIds.has(student.id);
              const status = getStudentStatus(student, semesterMeta);
              const jobs = student.jobs || [];
              const primaryJob = jobs[0];
              const totalHours = jobs.reduce(
                (sum, job) => sum + calculateJobHours(job.weeklySchedule),
                0,
              );
              const hasMultipleJobs = jobs.length > 1;

              return (
                <React.Fragment key={student.id}>
                  {/* Main Row */}
                  <tr className="transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-baylor-green/10 flex items-center justify-center flex-shrink-0">
                          <User size={20} className="text-baylor-green" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {student.name}
                          </p>
                          {student.startDate && (
                            <p className="text-xs text-gray-500">
                              Started{" "}
                              {new Date(student.startDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={status} size="sm" />
                      {student.endDate && (
                        <p className="text-xs text-gray-500 mt-1">
                          Until {new Date(student.endDate).toLocaleDateString()}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {jobs.length === 0 ? (
                        <span className="text-sm text-gray-400">No jobs</span>
                      ) : jobs.length === 1 ? (
                        <div>
                          <p className="font-medium text-gray-900">
                            {primaryJob.jobTitle}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {primaryJob.supervisor}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-gray-900">
                            {jobs.length} Jobs
                          </p>
                          <button
                            onClick={() => toggleExpand(student.id)}
                            className="text-sm text-baylor-green hover:underline"
                          >
                            {isExpanded ? "Hide details" : "View details"}
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail
                            size={14}
                            className="text-gray-400 flex-shrink-0"
                          />
                          <span className="truncate">{student.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          {student.hasNoPhone ? (
                            <>
                              <PhoneOff
                                size={14}
                                className="text-gray-400 flex-shrink-0"
                              />
                              <span>No phone</span>
                            </>
                          ) : (
                            <>
                              <Phone
                                size={14}
                                className="text-gray-400 flex-shrink-0"
                              />
                              <span>{formatPhoneNumber(student.phone)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-gray-400" />
                        <span className="text-sm text-gray-700 font-medium">
                          {totalHours > 0
                            ? `${totalHours.toFixed(1)} hrs`
                            : "-"}
                        </span>
                      </div>
                      {primaryJob?.weeklySchedule?.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1 truncate max-w-[200px]">
                          {
                            formatCompactSchedule(
                              primaryJob.weeklySchedule,
                            )?.[0]
                          }
                          {formatCompactSchedule(primaryJob.weeklySchedule)
                            ?.length > 1 && "..."}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(student)}
                          className="p-2 text-gray-400 hover:text-baylor-green hover:bg-baylor-green/10 rounded-full transition-colors"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => onDelete(student)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                        {hasMultipleJobs && (
                          <button
                            onClick={() => toggleExpand(student.id)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                            title={isExpanded ? "Collapse" : "Expand"}
                          >
                            {isExpanded ? (
                              <ChevronUp size={18} />
                            ) : (
                              <ChevronDown size={18} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Detail Row */}
                  {isExpanded && hasMultipleJobs && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-700">
                              Job Assignments
                            </p>
                            <button
                              onClick={() => toggleExpand(student.id)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Collapse
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {jobs.map((job, idx) => {
                              const weeklyHours = calculateJobHours(
                                job.weeklySchedule,
                              );
                              const formattedSchedule = formatCompactSchedule(
                                job.weeklySchedule,
                              );

                              return (
                                <div
                                  key={idx}
                                  className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <h4 className="font-medium text-gray-900 text-sm">
                                      {job.jobTitle}
                                    </h4>
                                    <span className="text-xs text-baylor-green font-medium">
                                      {weeklyHours.toFixed(1)} hrs
                                    </span>
                                  </div>

                                  {job.supervisor && (
                                    <p className="text-xs text-gray-600 mb-1">
                                      {job.supervisor}
                                    </p>
                                  )}

                                  {job.hourlyRate && (
                                    <p className="text-xs text-baylor-green font-medium mb-2">
                                      ${job.hourlyRate}/hr
                                    </p>
                                  )}

                                  {formattedSchedule &&
                                    formattedSchedule.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {formattedSchedule.map(
                                          (schedule, sIdx) => (
                                            <span
                                              key={sIdx}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-baylor-green/10 text-baylor-green text-xs rounded"
                                            >
                                              <Clock size={10} />
                                              {schedule}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    )}

                                  {job.buildings &&
                                    job.buildings.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {job.buildings
                                          .slice(0, 3)
                                          .map((building, bIdx) => (
                                            <span
                                              key={bIdx}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                                            >
                                              <Building size={10} />
                                              {building}
                                            </span>
                                          ))}
                                        {job.buildings.length > 3 && (
                                          <span className="text-xs text-gray-500">
                                            +{job.buildings.length - 3} more
                                          </span>
                                        )}
                                      </div>
                                    )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {students.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Briefcase size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">
                    No student workers found
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Add a new student to get started
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ImprovedStudentTable;
