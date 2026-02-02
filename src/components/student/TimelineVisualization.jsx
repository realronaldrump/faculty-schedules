import React, { useMemo } from "react";
import { Calendar, Briefcase } from "lucide-react";
import { parseStudentWorkerDate } from "../../utils/studentWorkers";

/**
 * TimelineVisualization - Visual representation of employment periods
 *
 * Shows student employment window and job assignments on a timeline
 * to make date relationships clear at a glance
 */

const TimelineVisualization = ({
  studentStartDate,
  studentEndDate,
  jobs = [],
  compact = false,
}) => {
  // Calculate timeline range
  const timelineRange = useMemo(() => {
    const dates = [];

    if (studentStartDate) {
      const parsed = parseStudentWorkerDate(studentStartDate);
      if (parsed) dates.push(parsed);
    }
    if (studentEndDate) {
      const parsed = parseStudentWorkerDate(studentEndDate, { endOfDay: true });
      if (parsed) dates.push(parsed);
    }

    jobs.forEach((job) => {
      if (job.startDate) {
        const parsed = parseStudentWorkerDate(job.startDate);
        if (parsed) dates.push(parsed);
      }
      if (job.endDate) {
        const parsed = parseStudentWorkerDate(job.endDate, { endOfDay: true });
        if (parsed) dates.push(parsed);
      }
    });

    if (dates.length === 0) return null;

    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // Add some padding
    const padding = (maxDate - minDate) * 0.1;

    return {
      start: new Date(minDate.getTime() - padding),
      end: new Date(maxDate.getTime() + padding),
      total: maxDate - minDate + 2 * padding,
    };
  }, [studentStartDate, studentEndDate, jobs]);

  // Calculate position percentage for a date
  const getPosition = (dateStr) => {
    if (!dateStr || !timelineRange) return 0;
    const date = parseStudentWorkerDate(dateStr);
    if (!date) return 0;
    const position = ((date - timelineRange.start) / timelineRange.total) * 100;
    return Math.max(0, Math.min(100, position));
  };

  // Calculate width percentage for a date range
  const getWidth = (startStr, endStr) => {
    if (!startStr || !timelineRange) return 0;
    const start = parseStudentWorkerDate(startStr);
    const end = endStr
      ? parseStudentWorkerDate(endStr, { endOfDay: true })
      : timelineRange.end;
    if (!start || !end) return 0;
    const width = ((end - start) / timelineRange.total) * 100;
    return Math.max(0, Math.min(100, width));
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return "Ongoing";
    const parsed = parseStudentWorkerDate(dateStr);
    if (!parsed) return "Ongoing";
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Colors for different jobs
  const jobColors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
  ];

  if (!timelineRange) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Calendar size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No employment dates set</p>
      </div>
    );
  }

  return (
    <div className={`${compact ? "space-y-3" : "space-y-6"}`}>
      {/* Main Employment Bar */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={compact ? 14 : 16} className="text-baylor-green" />
          <span
            className={`font-medium text-gray-900 ${compact ? "text-sm" : ""}`}
          >
            Employment Period
          </span>
        </div>

        <div className="relative">
          {/* Timeline Track */}
          <div
            className={`relative bg-gray-100 rounded-full overflow-hidden ${compact ? "h-6" : "h-8"}`}
          >
            {/* Student Employment Bar */}
            <div
              className="absolute top-0 bottom-0 bg-baylor-green/40"
              style={{
                left: `${getPosition(studentStartDate)}%`,
                width: `${getWidth(studentStartDate, studentEndDate)}%`,
              }}
            />

            {/* Center Label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={`font-medium text-baylor-green ${compact ? "text-xs" : "text-sm"}`}
              >
                {formatDate(studentStartDate)} → {formatDate(studentEndDate)}
              </span>
            </div>
          </div>

          {/* Date Labels */}
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>{formatDate(timelineRange.start.toISOString())}</span>
            <span>{formatDate(timelineRange.end.toISOString())}</span>
          </div>
        </div>
      </div>

      {/* Job Assignment Bars */}
      {jobs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase size={compact ? 14 : 16} className="text-baylor-green" />
            <span
              className={`font-medium text-gray-900 ${compact ? "text-sm" : ""}`}
            >
              Job Assignments
            </span>
          </div>

          <div className="space-y-2">
            {jobs.map((job, idx) => {
              const color = jobColors[idx % jobColors.length];
              const startPos = getPosition(job.startDate || studentStartDate);
              const width = getWidth(
                job.startDate || studentStartDate,
                job.endDate || studentEndDate,
              );

              return (
                <div key={idx} className="flex items-center gap-3">
                  {/* Job Label */}
                  <div className="w-32 flex-shrink-0">
                    <p
                      className={`font-medium text-gray-900 truncate ${compact ? "text-xs" : "text-sm"}`}
                    >
                      {job.jobTitle || `Job ${idx + 1}`}
                    </p>
                    {!compact && (
                      <p className="text-xs text-gray-500">
                        {formatDate(job.startDate || studentStartDate)} →{" "}
                        {formatDate(job.endDate || studentEndDate)}
                      </p>
                    )}
                  </div>

                  {/* Job Bar */}
                  <div
                    className={`flex-1 relative bg-gray-100 rounded-full overflow-hidden ${compact ? "h-4" : "h-6"}`}
                  >
                    <div
                      className={`absolute top-0 bottom-0 ${color} opacity-70`}
                      style={{ left: `${startPos}%`, width: `${width}%` }}
                    />

                    {/* Job Label on Bar (if space permits) */}
                    {width > 15 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span
                          className={`text-white font-medium truncate px-2 ${compact ? "text-xs" : "text-xs"}`}
                        >
                          {job.jobTitle}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {jobs.length > 0 && !compact && (
        <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-200">
          {jobs.map((job, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${jobColors[idx % jobColors.length]}`}
              />
              <span className="text-xs text-gray-600">
                {job.jobTitle || `Job ${idx + 1}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Gap/Overlap Warning */}
      {jobs.length > 1 && !compact && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">
            <strong>Note:</strong> Job assignments can overlap. Total weekly
            hours shown are the sum of all jobs.
          </p>
        </div>
      )}
    </div>
  );
};

export default TimelineVisualization;
