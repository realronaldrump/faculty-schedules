import React, { useState, useCallback } from "react";
import { Clock, X, Copy, Trash2 } from "lucide-react";

/**
 * VisualScheduleBuilder - Grid-based visual schedule selector
 *
 * Replaces the 3-dropdown + button interface with a click-to-toggle grid
 * that allows users to quickly build weekly schedules
 */

const DAYS = [
  { key: "M", label: "Mon", full: "Monday" },
  { key: "T", label: "Tue", full: "Tuesday" },
  { key: "W", label: "Wed", full: "Wednesday" },
  { key: "R", label: "Thu", full: "Thursday" },
  { key: "F", label: "Fri", full: "Friday" },
  { key: "S", label: "Sat", full: "Saturday" },
  { key: "U", label: "Sun", full: "Sunday" },
];

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7 AM to 9 PM (15 hours)

const PRESETS = [
  {
    name: "M-F 9-5",
    pattern: { days: ["M", "T", "W", "R", "F"], start: "09:00", end: "17:00" },
  },
  {
    name: "M-F 8-12",
    pattern: { days: ["M", "T", "W", "R", "F"], start: "08:00", end: "12:00" },
  },
  {
    name: "M-F 1-5",
    pattern: { days: ["M", "T", "W", "R", "F"], start: "13:00", end: "17:00" },
  },
  {
    name: "MWF 9-12",
    pattern: { days: ["M", "W", "F"], start: "09:00", end: "12:00" },
  },
  {
    name: "T/R 1-4",
    pattern: { days: ["T", "R"], start: "13:00", end: "16:00" },
  },
  { name: "Clear All", pattern: null },
];

const VisualScheduleBuilder = ({
  schedule = [],
  onChange,
  showPresets = true,
  showSummary = true,
}) => {
  const [hoveredSlot, setHoveredSlot] = useState(null);

  // Check if a specific day/hour is scheduled
  const isScheduled = useCallback(
    (day, hour) => {
      return schedule.some((entry) => {
        if (entry.day !== day) return false;
        const startHour = parseInt(entry.start.split(":")[0]);
        const endHour = parseInt(entry.end.split(":")[0]);
        const startMin = parseInt(entry.start.split(":")[1] || 0);
        const endMin = parseInt(entry.end.split(":")[1] || 0);

        const entryStart = startHour + startMin / 60;
        const entryEnd = endHour + endMin / 60;
        const slotTime = hour;

        return slotTime >= entryStart && slotTime < entryEnd;
      });
    },
    [schedule],
  );

  // Get the continuous block for a day/hour (if any)
  const getBlock = useCallback(
    (day, hour) => {
      return schedule.find((entry) => {
        if (entry.day !== day) return false;
        const startHour = parseInt(entry.start.split(":")[0]);
        const endHour = parseInt(entry.end.split(":")[0]);
        const startMin = parseInt(entry.start.split(":")[1] || 0);
        const endMin = parseInt(entry.end.split(":")[1] || 0);

        const entryStart = startHour + startMin / 60;
        const entryEnd = endHour + endMin / 60;
        const slotTime = hour;

        return slotTime >= entryStart && slotTime < entryEnd;
      });
    },
    [schedule],
  );

  // Toggle a time slot
  const toggleSlot = (day, hour) => {
    const existingBlock = getBlock(day, hour);

    if (existingBlock) {
      // Remove the entire block
      onChange(
        schedule.filter(
          (entry) =>
            !(
              entry.day === day &&
              entry.start === existingBlock.start &&
              entry.end === existingBlock.end
            ),
        ),
      );
    } else {
      // Add a 1-hour block
      const startTime = `${hour.toString().padStart(2, "0")}:00`;
      const endTime = `${(hour + 1).toString().padStart(2, "0")}:00`;
      onChange([...schedule, { day, start: startTime, end: endTime }]);
    }
  };

  // Apply a preset pattern
  const applyPreset = (preset) => {
    if (!preset.pattern) {
      onChange([]);
      return;
    }

    const newEntries = preset.pattern.days.map((day) => ({
      day,
      start: preset.pattern.start,
      end: preset.pattern.end,
    }));

    onChange(newEntries);
  };

  // Calculate weekly hours
  const weeklyHours = schedule.reduce((total, entry) => {
    const start =
      parseInt(entry.start.split(":")[0]) +
      parseInt(entry.start.split(":")[1] || 0) / 60;
    const end =
      parseInt(entry.end.split(":")[0]) +
      parseInt(entry.end.split(":")[1] || 0) / 60;
    return total + (end - start);
  }, 0);

  // Format time for display
  const formatTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    return `${h}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  // Remove a specific entry
  const removeEntry = (entryToRemove) => {
    onChange(
      schedule.filter(
        (entry) =>
          !(
            entry.day === entryToRemove.day &&
            entry.start === entryToRemove.start &&
            entry.end === entryToRemove.end
          ),
      ),
    );
  };

  // Clear all
  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-4">
      {/* Presets */}
      {showPresets && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 mr-2 self-center">
            Presets:
          </span>
          {PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => applyPreset(preset)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                preset.name === "Clear All"
                  ? "border-red-300 text-red-600 hover:bg-red-50"
                  : "border-baylor-green/30 text-baylor-green hover:bg-baylor-green/10"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}

      {/* Schedule Grid */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        {/* Header */}
        <div className="grid grid-cols-8 border-b border-gray-200">
          <div className="p-2 bg-gray-50 text-xs font-medium text-gray-500 border-r border-gray-200">
            Time
          </div>
          {DAYS.map((day) => (
            <div
              key={day.key}
              className="p-2 bg-gray-50 text-xs font-medium text-gray-700 text-center border-r border-gray-200 last:border-r-0"
            >
              {day.label}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-8">
          {HOURS.map((hour) => (
            <React.Fragment key={hour}>
              {/* Time Label */}
              <div className="p-2 text-xs text-gray-500 border-r border-b border-gray-200 bg-gray-50">
                {hour <= 12 ? `${hour} AM` : `${hour - 12} PM`}
              </div>

              {/* Day Cells */}
              {DAYS.map((day) => {
                const scheduled = isScheduled(day.key, hour);
                const isHovered =
                  hoveredSlot?.day === day.key && hoveredSlot?.hour === hour;

                return (
                  <div
                    key={`${day.key}-${hour}`}
                    className={`h-10 border-r border-b border-gray-200 cursor-pointer transition-all ${
                      scheduled
                        ? "bg-baylor-green"
                        : isHovered
                          ? "bg-baylor-green/30"
                          : "hover:bg-baylor-green/10"
                    }`}
                    onClick={() => toggleSlot(day.key, hour)}
                    onMouseEnter={() => setHoveredSlot({ day: day.key, hour })}
                    onMouseLeave={() => setHoveredSlot(null)}
                    title={`${day.full} ${hour}:00 - ${hour + 1}:00`}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-baylor-green rounded" />
          <span>Scheduled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border border-gray-200 rounded bg-white" />
          <span>Click to add</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-baylor-green/30 rounded" />
          <span>Click to remove</span>
        </div>
      </div>

      {/* Summary */}
      {showSummary && (
        <div className="bg-baylor-green/5 rounded-lg p-4 border border-baylor-green/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-baylor-green" />
              <span className="font-medium text-gray-900">
                {weeklyHours.toFixed(1)} hours per week
              </span>
            </div>
            {schedule.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
              >
                <Trash2 size={14} />
                Clear All
              </button>
            )}
          </div>

          {/* Current Schedule List */}
          {schedule.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">
                Current Schedule:
              </p>
              <div className="flex flex-wrap gap-2">
                {schedule.map((entry, idx) => {
                  const dayInfo = DAYS.find((d) => d.key === entry.day);
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-baylor-green/30 text-baylor-green text-sm rounded-lg"
                    >
                      <span className="font-medium">{dayInfo?.label}</span>
                      <span className="text-gray-400">|</span>
                      <span>
                        {formatTime(entry.start)} - {formatTime(entry.end)}
                      </span>
                      <button
                        onClick={() => removeEntry(entry)}
                        className="ml-1 p-0.5 hover:bg-baylor-green/10 rounded"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {schedule.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No schedule entries yet. Click cells in the grid above to add time
              blocks.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default VisualScheduleBuilder;
