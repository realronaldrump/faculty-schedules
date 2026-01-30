import React, { useState, useEffect } from "react";
import {
  Building,
  Clock,
  DollarSign,
  User,
  X,
  Edit2,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react";
import VisualScheduleBuilder from "./VisualScheduleBuilder";
import BuildingSelector from "./BuildingSelector";
import SuggestionInput from "./SuggestionInput";

/**
 * JobCard - Visual card for displaying and editing job assignments
 *
 * Provides a clean, card-based interface for job information with
 * expandable edit mode
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

const EMPTY_JOB = {
  jobTitle: "",
  supervisor: "",
  hourlyRate: "",
  buildings: [],
  weeklySchedule: [],
  startDate: "",
  endDate: "",
};

const JobCard = ({
  job,
  isEditing = false,
  onEdit,
  onSave,
  onCancel,
  onRemove,
  onChange,
  availableBuildings = [],
  existingSupervisors = [],
  existingJobTitles = [],
  showActions = true,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState(job || EMPTY_JOB);

  useEffect(() => {
    if (isEditing) {
      setDraft(job || EMPTY_JOB);
    }
  }, [isEditing, job]);

  // Calculate weekly hours
  const weeklyHours = (job?.weeklySchedule || []).reduce((sum, entry) => {
    const start =
      parseInt(entry.start.split(":")[0]) +
      parseInt(entry.start.split(":")[1] || 0) / 60;
    const end =
      parseInt(entry.end.split(":")[0]) +
      parseInt(entry.end.split(":")[1] || 0) / 60;
    return sum + (end - start);
  }, 0);

  const weeklyPay = weeklyHours * (parseFloat(job?.hourlyRate) || 0);

  // Format time
  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    return `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  // Format schedule for display
  const formatSchedule = (schedule) => {
    if (!schedule?.length) return null;

    // Group by time
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

  const formattedSchedule = formatSchedule(job?.weeklySchedule);

  // Handle edit mode
  if (isEditing) {
    return (
      <div className="bg-baylor-green/5 border-2 border-baylor-green/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-gray-900">Edit Job Assignment</h4>
          {showActions && onCancel && (
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* Job Title & Supervisor */}
          <div className="grid grid-cols-2 gap-4">
            <SuggestionInput
              label="Job Title"
              required={true}
              value={draft.jobTitle}
              onChange={(value) => setDraft({ ...draft, jobTitle: value })}
              options={existingJobTitles}
              placeholder="e.g., Front Desk Assistant"
              helperText="Choose an existing title or add a new one."
            />
            <SuggestionInput
              label="Supervisor"
              value={draft.supervisor}
              onChange={(value) => setDraft({ ...draft, supervisor: value })}
              options={existingSupervisors}
              placeholder="Supervisor name"
              helperText="Select from existing supervisors or add a new one."
            />
          </div>

          {/* Hourly Rate & Dates */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hourly Rate ($)
              </label>
              <div className="relative">
                <DollarSign
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.hourlyRate}
                  onChange={(e) =>
                    setDraft({ ...draft, hourlyRate: e.target.value })
                  }
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  placeholder="12.50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={draft.startDate || ""}
                onChange={(e) =>
                  setDraft({ ...draft, startDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={draft.endDate || ""}
                onChange={(e) =>
                  setDraft({ ...draft, endDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
              />
            </div>
          </div>

          {/* Schedule Builder */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Weekly Schedule <span className="text-red-500">*</span>
            </label>
            <VisualScheduleBuilder
              schedule={draft.weeklySchedule || []}
              onChange={(newSchedule) =>
                setDraft({ ...draft, weeklySchedule: newSchedule })
              }
              showPresets={false}
            />
          </div>

          {/* Building Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Locations
            </label>
            <BuildingSelector
              availableBuildings={availableBuildings}
              selectedBuildings={draft.buildings || []}
              onChange={(buildings) => setDraft({ ...draft, buildings })}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          {onSave && (
            <button
              onClick={() => onSave(draft)}
              className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
            >
              Save Job
            </button>
          )}
        </div>
      </div>
    );
  }

  // Display Mode
  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg transition-shadow hover:shadow-md ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <h4
              className={`font-semibold text-gray-900 truncate ${compact ? "text-sm" : "text-base"}`}
            >
              {job?.jobTitle || "Untitled Job"}
            </h4>
            {job?.endDate && new Date(job.endDate) < new Date() && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full whitespace-nowrap">
                Ended
              </span>
            )}
          </div>

          {/* Details */}
          <div
            className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${compact ? "text-xs" : "text-sm"} text-gray-600`}
          >
            {job?.supervisor && (
              <span className="flex items-center gap-1">
                <User size={compact ? 12 : 14} className="text-gray-400" />
                {job.supervisor}
              </span>
            )}
            {job?.hourlyRate && (
              <span className="flex items-center gap-1 text-baylor-green font-medium">
                <DollarSign size={compact ? 12 : 14} />${job.hourlyRate}/hr
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={compact ? 12 : 14} className="text-gray-400" />
              {weeklyHours.toFixed(1)} hrs/week
            </span>
            {weeklyPay > 0 && !compact && (
              <span className="text-gray-500">
                (${weeklyPay.toFixed(2)}/week)
              </span>
            )}
          </div>

          {/* Schedule */}
          {formattedSchedule && formattedSchedule.length > 0 && (
            <div
              className={`mt-2 flex flex-wrap gap-1 ${compact ? "hidden" : "flex"}`}
            >
              {formattedSchedule
                .slice(0, isExpanded ? undefined : 2)
                .map((schedule, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-baylor-green/10 text-baylor-green text-xs rounded-full"
                  >
                    <Clock size={10} />
                    {schedule}
                  </span>
                ))}
              {formattedSchedule.length > 2 && !isExpanded && (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="text-xs text-gray-500 hover:text-baylor-green"
                >
                  +{formattedSchedule.length - 2} more
                </button>
              )}
            </div>
          )}

          {/* Buildings */}
          {job?.buildings && job.buildings.length > 0 && (
            <div
              className={`mt-2 flex flex-wrap gap-1 ${compact ? "hidden" : "flex"}`}
            >
              {job.buildings
                .slice(0, isExpanded ? undefined : 3)
                .map((building, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                  >
                    <Building size={10} />
                    {building}
                  </span>
                ))}
              {job.buildings.length > 3 && !isExpanded && (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="text-xs text-gray-500 hover:text-baylor-green"
                >
                  +{job.buildings.length - 3} more
                </button>
              )}
            </div>
          )}

          {/* Assignment Dates */}
          {(job?.startDate || job?.endDate) && !compact && (
            <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
              <Calendar size={12} />
              {job.startDate && new Date(job.startDate).toLocaleDateString()}
              {" → "}
              {job.endDate
                ? new Date(job.endDate).toLocaleDateString()
                : "Ongoing"}
            </div>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-1 ml-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 text-gray-400 hover:text-baylor-green hover:bg-baylor-green/10 rounded-full transition-colors"
                title="Edit"
              >
                <Edit2 size={16} />
              </button>
            )}
            {onRemove && (
              <button
                onClick={onRemove}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors"
                title="Remove"
              >
                <X size={16} />
              </button>
            )}
            {(formattedSchedule?.length > 2 || job?.buildings?.length > 3) && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
              >
                {isExpanded ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JobCard;
