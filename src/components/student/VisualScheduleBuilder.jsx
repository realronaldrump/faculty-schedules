import React, { useState, useCallback, useMemo } from "react";
import { Clock, X, Trash2, Plus } from "lucide-react";
import { formatMinutesToTime } from "../../utils/timeUtils";
import {
  normalizeScheduleDay,
  normalizeScheduleTime,
  normalizeStudentWeeklySchedule,
  sortWeeklySchedule,
  STUDENT_SCHEDULE_RULES,
  toScheduleMinutes,
} from "../../utils/studentScheduleUtils";

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
];

const START_HOUR = STUDENT_SCHEDULE_RULES.startMinutes / 60;
const END_HOUR = STUDENT_SCHEDULE_RULES.endMinutes / 60;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR); // 8 AM to 5 PM

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
  showPresets = false,
  showSummary = true,
}) => {
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [manualEntry, setManualEntry] = useState({
    day: DAYS[0].key,
    start: "08:00",
    end: "09:00",
  });
  const [manualError, setManualError] = useState("");

  const normalizedSchedule = useMemo(
    () => sortWeeklySchedule(normalizeStudentWeeklySchedule(schedule)),
    [schedule],
  );

  const normalizeAndSort = useCallback(
    (entries) => sortWeeklySchedule(normalizeStudentWeeklySchedule(entries)),
    [],
  );

  const buildEntry = (day, startMinutes, endMinutes) => ({
    day,
    start: normalizeScheduleTime(startMinutes),
    end: normalizeScheduleTime(endMinutes),
  });

  const mergeEntriesForDay = useCallback((entries, day) => {
    const dayEntries = entries
      .filter((entry) => entry.day === day)
      .map((entry) => ({
        ...entry,
        startMinutes: toScheduleMinutes(entry.start),
        endMinutes: toScheduleMinutes(entry.end),
      }))
      .filter(
        (entry) =>
          entry.startMinutes !== null &&
          entry.endMinutes !== null &&
          entry.startMinutes < entry.endMinutes,
      )
      .sort((a, b) => a.startMinutes - b.startMinutes);

    const merged = [];
    dayEntries.forEach((entry) => {
      const last = merged[merged.length - 1];
      if (!last) {
        merged.push({ ...entry });
        return;
      }
      if (entry.startMinutes <= last.endMinutes) {
        last.endMinutes = Math.max(last.endMinutes, entry.endMinutes);
        return;
      }
      merged.push({ ...entry });
    });

    const otherEntries = entries.filter((entry) => entry.day !== day);
    return [
      ...otherEntries,
      ...merged.map((entry) =>
        buildEntry(day, entry.startMinutes, entry.endMinutes),
      ),
    ];
  }, []);

  // Check if a specific day/hour is scheduled
  const isScheduled = useCallback(
    (day, hour) => {
      const slotStart = hour * 60;
      const slotEnd = (hour + 1) * 60;
      return normalizedSchedule.some((entry) => {
        if (entry.day !== day) return false;
        const entryStart = toScheduleMinutes(entry.start);
        const entryEnd = toScheduleMinutes(entry.end);
        if (entryStart === null || entryEnd === null) return false;
        return entryStart < slotEnd && entryEnd > slotStart;
      });
    },
    [normalizedSchedule],
  );

  // Get the continuous block for a day/hour (if any)
  const getBlock = useCallback(
    (day, hour) => {
      const slotStart = hour * 60;
      const slotEnd = (hour + 1) * 60;
      return normalizedSchedule.find((entry) => {
        if (entry.day !== day) return false;
        const entryStart = toScheduleMinutes(entry.start);
        const entryEnd = toScheduleMinutes(entry.end);
        if (entryStart === null || entryEnd === null) return false;
        return entryStart < slotEnd && entryEnd > slotStart;
      });
    },
    [normalizedSchedule],
  );

  // Toggle a time slot
  const toggleSlot = (day, hour) => {
    const normalizedDay = normalizeScheduleDay(day) || day;
    if (!STUDENT_SCHEDULE_RULES.allowedDays.includes(normalizedDay)) {
      return;
    }
    const slotStart = hour * 60;
    const slotEnd = (hour + 1) * 60;
    const existingBlock = getBlock(normalizedDay, hour);

    if (existingBlock) {
      // Remove this hour from the block (trim or split)
      const updated = [];
      normalizedSchedule.forEach((entry) => {
        if (entry.day !== normalizedDay) {
          updated.push(entry);
          return;
        }
        const startMinutes = toScheduleMinutes(entry.start);
        const endMinutes = toScheduleMinutes(entry.end);
        if (startMinutes === null || endMinutes === null) return;
        if (endMinutes <= slotStart || startMinutes >= slotEnd) {
          updated.push(entry);
          return;
        }
        if (startMinutes < slotStart) {
          updated.push(buildEntry(normalizedDay, startMinutes, slotStart));
        }
        if (endMinutes > slotEnd) {
          updated.push(buildEntry(normalizedDay, slotEnd, endMinutes));
        }
      });
      onChange(normalizeAndSort(updated));
    } else {
      // Add a 1-hour block
      const nextEntries = mergeEntriesForDay(
        [
          ...normalizedSchedule,
          buildEntry(normalizedDay, slotStart, slotEnd),
        ],
        normalizedDay,
      );
      onChange(normalizeAndSort(nextEntries));
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

    onChange(normalizeAndSort(newEntries));
  };

  // Calculate weekly hours
  const weeklyHours = normalizedSchedule.reduce((total, entry) => {
    const start = toScheduleMinutes(entry.start);
    const end = toScheduleMinutes(entry.end);
    if (start === null || end === null) return total;
    return total + (end - start) / 60;
  }, 0);

  // Format time for display
  const formatTime = (timeStr) => {
    const minutes = toScheduleMinutes(timeStr);
    if (minutes === null) return timeStr || "";
    return formatMinutesToTime(minutes);
  };

  const formatHourLabel = (hour) =>
    formatMinutesToTime(hour * 60).replace(":00", "");

  // Remove a specific entry
  const removeEntry = (entryToRemove) => {
    onChange(
      normalizeAndSort(
        normalizedSchedule.filter(
          (entry) =>
            !(
              entry.day === entryToRemove.day &&
              entry.start === entryToRemove.start &&
              entry.end === entryToRemove.end
            ),
        ),
      ),
    );
  };

  // Clear all
  const clearAll = () => {
    onChange([]);
  };

  const handleManualFieldChange = (field, value) => {
    setManualEntry((prev) => ({ ...prev, [field]: value }));
    setManualError("");
  };

  const handleAddManualEntry = () => {
    const day = normalizeScheduleDay(manualEntry.day);
    const startMinutes = toScheduleMinutes(manualEntry.start);
    const endMinutes = toScheduleMinutes(manualEntry.end);

    if (!day) {
      setManualError("Choose a day for this time block.");
      return;
    }
    if (!STUDENT_SCHEDULE_RULES.allowedDays.includes(day)) {
      setManualError("Only Monday through Friday can be scheduled.");
      return;
    }
    if (startMinutes === null || endMinutes === null) {
      setManualError("Enter a valid start and end time.");
      return;
    }
    if (startMinutes >= endMinutes) {
      setManualError("End time must be after the start time.");
      return;
    }
    if (
      startMinutes < STUDENT_SCHEDULE_RULES.startMinutes ||
      endMinutes > STUDENT_SCHEDULE_RULES.endMinutes
    ) {
      setManualError("Times must be between 8:00 AM and 5:00 PM.");
      return;
    }

    const start = normalizeScheduleTime(startMinutes);
    const end = normalizeScheduleTime(endMinutes);
    const exists = normalizedSchedule.some(
      (entry) => entry.day === day && entry.start === start && entry.end === end,
    );
    if (exists) {
      setManualError("That time entry already exists.");
      return;
    }

    setManualError("");
    const nextEntries = mergeEntriesForDay(
      [...normalizedSchedule, { day, start, end }],
      day,
    );
    onChange(normalizeAndSort(nextEntries));
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

      <p className="text-xs text-gray-500">
        Scheduling window: Monday-Friday, 8:00 AM-5:00 PM.
      </p>

      {/* Schedule Grid */}
      <div className="border border-gray-200 rounded-lg bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[36rem]">
            {/* Header */}
            <div
              className="grid border-b border-gray-200"
              style={{ gridTemplateColumns: `repeat(${DAYS.length + 1}, minmax(0, 1fr))` }}
            >
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
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${DAYS.length + 1}, minmax(0, 1fr))` }}
            >
              {HOURS.map((hour) => (
                <React.Fragment key={hour}>
                  {/* Time Label */}
                  <div className="p-2 text-xs text-gray-500 border-r border-b border-gray-200 bg-gray-50">
                    {formatHourLabel(hour)}
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
                        title={`${day.full} ${formatMinutesToTime(hour * 60)} - ${formatMinutesToTime((hour + 1) * 60)}`}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
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

      {/* Precise Time Entry */}
      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Clock size={14} className="text-gray-500" />
            Precise time entry
          </div>
          <span className="text-xs text-gray-500">5-minute increments</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <select
            value={manualEntry.day}
            onChange={(e) => handleManualFieldChange("day", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            {DAYS.map((day) => (
              <option key={day.key} value={day.key}>
                {day.full}
              </option>
            ))}
          </select>
          <input
            type="time"
            step={300}
            value={manualEntry.start}
            onChange={(e) => handleManualFieldChange("start", e.target.value)}
            min="08:00"
            max="17:00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          />
          <input
            type="time"
            step={300}
            value={manualEntry.end}
            onChange={(e) => handleManualFieldChange("end", e.target.value)}
            min="08:00"
            max="17:00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          />
          <button
            onClick={handleAddManualEntry}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-baylor-green text-white rounded-md text-sm font-medium hover:bg-baylor-green/90 transition-colors"
          >
            <Plus size={14} />
            Add time
          </button>
        </div>
        {manualError && (
          <p className="text-xs text-red-600 mt-2">{manualError}</p>
        )}
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
            {normalizedSchedule.length > 0 && (
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
          {normalizedSchedule.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">
                Current Schedule:
              </p>
              <div className="flex flex-wrap gap-2">
                {normalizedSchedule.map((entry, idx) => {
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

          {normalizedSchedule.length === 0 && (
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
