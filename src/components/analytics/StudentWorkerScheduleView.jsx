import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { formatHoursValue } from '../../utils/studentWorkers';

const DAY_ORDER = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
const DAY_LABELS = {
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  R: 'Thursday',
  F: 'Friday',
  S: 'Saturday',
  U: 'Sunday',
};

const ACCENTS = [
  { border: '#154734', background: 'rgba(21, 71, 52, 0.12)' },
  { border: '#1F7A1F', background: 'rgba(31, 122, 31, 0.12)' },
  { border: '#B68B00', background: 'rgba(182, 139, 0, 0.15)' },
  { border: '#0E6E6E', background: 'rgba(14, 110, 110, 0.12)' },
  { border: '#3F4C5A', background: 'rgba(63, 76, 90, 0.12)' },
];

const PIXELS_PER_MINUTE = 1.8;

const accentForKey = (key) => {
  const stringKey = String(key || 'schedule-accent');
  let hash = 0;
  for (let index = 0; index < stringKey.length; index += 1) {
    hash = stringKey.charCodeAt(index) + ((hash << 5) - hash);
  }
  const accentIndex = Math.abs(hash) % ACCENTS.length;
  return ACCENTS[accentIndex];
};

const parseTimeToMinutes = (time) => {
  if (!time || typeof time !== 'string') return null;
  const [hours = '0', minutes = '0'] = time.split(':');
  const parsedHours = parseInt(hours, 10);
  const parsedMinutes = parseInt(minutes, 10);
  if (Number.isNaN(parsedHours) || Number.isNaN(parsedMinutes)) return null;
  return (parsedHours * 60) + parsedMinutes;
};

const formatMinutesToLabel = (minutes) => {
  if (minutes === null || minutes === undefined) return '';
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${suffix}`;
};

const layoutDayEvents = (events = []) => {
  if (!Array.isArray(events) || events.length === 0) return [];

  const sorted = [...events].sort((a, b) => {
    if (a.startMinutes === b.startMinutes) {
      return a.endMinutes - b.endMinutes;
    }
    return a.startMinutes - b.startMinutes;
  });

  const positioned = [];
  let activeGroup = [];
  let activeGroupEnd = -Infinity;

  const flushGroup = () => {
    if (activeGroup.length === 0) return;

    const laneEndTimes = [];
    activeGroup.forEach((event) => {
      let lane = 0;
      while (laneEndTimes[lane] && laneEndTimes[lane] > event.startMinutes) {
        lane += 1;
      }
      laneEndTimes[lane] = event.endMinutes;
      positioned.push({ ...event, lane, lanes: laneEndTimes.length });
    });

    activeGroup = [];
    activeGroupEnd = -Infinity;
  };

  sorted.forEach((event) => {
    if (activeGroup.length === 0) {
      activeGroup = [event];
      activeGroupEnd = event.endMinutes;
      return;
    }

    if (event.startMinutes < activeGroupEnd) {
      activeGroup.push(event);
      activeGroupEnd = Math.max(activeGroupEnd, event.endMinutes);
    } else {
      flushGroup();
      activeGroup = [event];
      activeGroupEnd = event.endMinutes;
    }
  });

  flushGroup();
  return positioned;
};

const buildScheduleEvents = (assignments, student) => {
  if (!Array.isArray(assignments)) return [];

  const studentKey = student?.id || student?.email || student?.name || 'student';

  return assignments.flatMap((assignment, assignmentIndex) => {
    const scheduleEntries = Array.isArray(assignment?.schedule)
      ? assignment.schedule
      : [];

    const accent = accentForKey(`${studentKey}|${assignment?.jobTitle || assignmentIndex}`);

    return scheduleEntries.map((entry, entryIndex) => {
      const day = (entry?.day || '').toUpperCase();
      if (!DAY_ORDER.includes(day)) return null;

      const startMinutes = parseTimeToMinutes(entry.start);
      const endMinutes = parseTimeToMinutes(entry.end);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return null;
      }

      return {
        id: `${assignmentIndex}-${entryIndex}-${day}-${entry.start}-${entry.end}`,
        day,
        startMinutes,
        endMinutes,
        assignment,
        entry,
        accent,
      };
    }).filter(Boolean);
  });
};

const StudentWorkerScheduleView = ({ student, assignments = [] }) => {
  const events = useMemo(
    () => buildScheduleEvents(assignments, student),
    [assignments, student]
  );

  const totalWeeklyHours = useMemo(
    () => assignments.reduce((sum, assignment) => sum + (assignment?.weeklyHours || 0), 0),
    [assignments]
  );

  const { minStart, maxEnd } = useMemo(() => {
    if (events.length === 0) {
      return { minStart: 8 * 60, maxEnd: 17 * 60 };
    }

    let min = Infinity;
    let max = -Infinity;

    events.forEach((event) => {
      min = Math.min(min, event.startMinutes);
      max = Math.max(max, event.endMinutes);
    });

    const clampedMin = Math.max(6 * 60, Math.min(min, 9 * 60));
    const clampedMax = Math.min(22 * 60, Math.max(max, 17 * 60));

    return {
      minStart: clampedMin,
      maxEnd: clampedMax,
    };
  }, [events]);

  const totalMinutes = Math.max(60, maxEnd - minStart);

  const hourTicks = useMemo(() => {
    const ticks = [];
    const startHour = Math.floor(minStart / 60);
    const endHour = Math.ceil(maxEnd / 60);
    for (let hour = startHour; hour <= endHour; hour += 1) {
      ticks.push(hour * 60);
    }
    return ticks;
  }, [minStart, maxEnd]);

  const eventsByDay = useMemo(() => {
    const map = {};
    DAY_ORDER.forEach((day) => {
      map[day] = [];
    });

    events.forEach((event) => {
      map[event.day].push(event);
    });

    Object.keys(map).forEach((day) => {
      map[day] = layoutDayEvents(map[day]);
    });

    return map;
  }, [events]);

  const daysWithEvents = DAY_ORDER.filter((day) => (eventsByDay[day] || []).length > 0);

  const dailyTotals = useMemo(() => {
    const totals = {};
    events.forEach((event) => {
      const durationMinutes = event.endMinutes - event.startMinutes;
      totals[event.day] = (totals[event.day] || 0) + (durationMinutes / 60);
    });
    return totals;
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock size={16} className="text-baylor-green" />
          <span>No weekly schedule has been recorded for this student.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-lg font-semibold text-baylor-green">
          <Clock size={18} />
          Weekly Shift Schedule
        </h4>
        <div className="text-sm text-gray-600">
          Total Weekly Hours:
          <span className="ml-1 font-semibold text-gray-900">
            {formatHoursValue(totalWeeklyHours)} hrs
          </span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[104px_1fr]">
          <div className="bg-gray-50 border-b border-gray-200 p-3 font-serif font-semibold text-baylor-green">
            Time
          </div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${daysWithEvents.length}, minmax(120px, 1fr))` }}>
            {daysWithEvents.map((day) => (
              <div
                key={`header-${day}`}
                className="border-b border-gray-200 bg-gray-50 p-3 text-center"
              >
                <div className="font-serif font-semibold text-baylor-green">
                  {DAY_LABELS[day]}
                </div>
                <div className="text-xs text-gray-500">
                  {formatHoursValue(dailyTotals[day] || 0)} hrs
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[104px_1fr]">
          <div className="relative" style={{ height: `${totalMinutes * PIXELS_PER_MINUTE}px` }}>
            {hourTicks.map((tick) => (
              <div
                key={`tick-${tick}`}
                className="absolute w-full"
                style={{
                  top: `${(tick - minStart) * PIXELS_PER_MINUTE}px`,
                  height: `${60 * PIXELS_PER_MINUTE}px`,
                }}
              >
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-2 text-xs font-medium text-gray-600">
                  {formatMinutesToLabel(tick)}
                </div>
                <div className="h-full border-b border-dashed border-gray-200" />
              </div>
            ))}
          </div>

          <div className="relative overflow-x-auto">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${daysWithEvents.length}, minmax(120px, 1fr))`,
              }}
            >
              {daysWithEvents.map((day, dayIndex) => (
                <div
                  key={`day-${day}`}
                  className={`relative border-r border-gray-200 ${
                    dayIndex === daysWithEvents.length - 1 ? 'last:border-r-0' : ''
                  }`}
                  style={{ height: `${totalMinutes * PIXELS_PER_MINUTE}px` }}
                >
                  {(eventsByDay[day] || []).map((event) => {
                    const durationMinutes = event.endMinutes - event.startMinutes;
                    const top = (event.startMinutes - minStart) * PIXELS_PER_MINUTE;
                    const height = Math.max(durationMinutes * PIXELS_PER_MINUTE, 24);
                    const widthPercent = 100 / event.lanes;
                    const leftPercent = widthPercent * event.lane;

                    return (
                      <div
                        key={event.id}
                        className="absolute rounded-md border shadow-sm px-3 py-2 text-xs text-gray-800"
                        style={{
                          top,
                          height,
                          left: `calc(${leftPercent}% + 3px)`,
                          width: `calc(${widthPercent}% - 6px)`,
                          borderColor: event.accent.border,
                          background: event.accent.background,
                        }}
                      >
                        <div className="font-semibold text-sm text-gray-900 truncate">
                          {event.assignment?.jobTitle || 'Assignment'}
                        </div>
                        <div className="text-[11px] text-gray-600">
                          {formatMinutesToLabel(event.startMinutes)} – {formatMinutesToLabel(event.endMinutes)}
                        </div>
                        {event.assignment?.buildings?.length > 0 && (
                          <div className="text-[11px] text-gray-500 truncate">
                            {(event.assignment.buildings || []).join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentWorkerScheduleView;
