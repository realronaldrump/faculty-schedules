import React, { useMemo } from 'react';
import { Clock, MapPin } from 'lucide-react';
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
const DAY_SHORT_LABELS = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  R: 'Thu',
  F: 'Fri',
  S: 'Sat',
  U: 'Sun',
};
const DAY_ABBR = {
  M: 'M',
  T: 'T',
  W: 'W',
  R: 'R',
  F: 'F',
  S: 'S',
  U: 'U',
};

const ACCENTS = [
  { border: '#154734', background: 'rgba(21, 71, 52, 0.10)', text: '#154734' },
  { border: '#1F7A1F', background: 'rgba(31, 122, 31, 0.10)', text: '#1a6b1a' },
  { border: '#B68B00', background: 'rgba(182, 139, 0, 0.10)', text: '#8a6a00' },
  { border: '#0E6E6E', background: 'rgba(14, 110, 110, 0.10)', text: '#0a5555' },
  { border: '#3F4C5A', background: 'rgba(63, 76, 90, 0.08)', text: '#3F4C5A' },
];

/* Dynamic scale: target ~400px for the grid body so the whole card fits */
const TARGET_GRID_HEIGHT = 400;

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
  const suffix = hour24 >= 12 ? 'p' : 'a';
  const hour12 = ((hour24 + 11) % 12) + 1;
  if (minute === 0) return `${hour12}${suffix}`;
  return `${hour12}:${minute.toString().padStart(2, '0')}${suffix}`;
};

const formatMinutesToLabelFull = (minutes) => {
  if (minutes === null || minutes === undefined) return '';
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${suffix}`;
};

const formatEventRange = (event) => (
  `${formatMinutesToLabelFull(event.startMinutes)} – ${formatMinutesToLabelFull(event.endMinutes)}`
);

const formatEventRangeShort = (event) => (
  `${formatMinutesToLabel(event.startMinutes)} – ${formatMinutesToLabel(event.endMinutes)}`
);

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

    /* Snap to whole hours with 30-min breathing room */
    const clampedMin = Math.floor(Math.max(6 * 60, min - 30) / 60) * 60;
    const clampedMax = Math.ceil(Math.min(22 * 60, max + 30) / 60) * 60;

    return {
      minStart: clampedMin,
      maxEnd: clampedMax,
    };
  }, [events]);

  const totalMinutes = Math.max(60, maxEnd - minStart);
  /* Dynamically scale so the grid fits ~TARGET_GRID_HEIGHT pixels */
  const pxPerMinute = Math.min(1.6, Math.max(0.6, TARGET_GRID_HEIGHT / totalMinutes));
  const totalShiftCount = events.length;

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
  const studentKey = student?.id || student?.email || student?.name || 'student';

  const dailyTotals = useMemo(() => {
    const totals = {};
    events.forEach((event) => {
      const durationMinutes = event.endMinutes - event.startMinutes;
      totals[event.day] = (totals[event.day] || 0) + (durationMinutes / 60);
    });
    return totals;
  }, [events]);

  const assignmentSummaries = useMemo(() => (
    assignments.map((assignment, index) => ({
      id: `${assignment?.jobTitle || 'assignment'}-${index}`,
      title: assignment?.jobTitle || `Assignment ${index + 1}`,
      buildings: Array.isArray(assignment?.buildings) ? assignment.buildings.filter(Boolean) : [],
      weeklyHours: Number(assignment?.weeklyHours || 0),
      accent: accentForKey(`${studentKey}|${assignment?.jobTitle || index}`),
    }))
  ), [assignments, studentKey]);

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock size={15} className="text-gray-400" />
          <span>No weekly schedule has been recorded for this student.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Header row: title + inline stats ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-base font-semibold text-baylor-green">
          <Clock size={16} />
          Weekly Schedule
        </h4>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-baylor-green/15 bg-baylor-green/5 px-2.5 py-1 font-medium text-baylor-green">
            <Clock size={11} />
            {formatHoursValue(totalWeeklyHours)} hrs/wk
          </span>
          <span className="hidden sm:inline">
            {totalShiftCount} shift{totalShiftCount === 1 ? '' : 's'} · {daysWithEvents.length} day{daysWithEvents.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* ── Assignment legend (compact inline pills) ── */}
      {assignmentSummaries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {assignmentSummaries.map((assignment) => (
            <div
              key={assignment.id}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs"
              style={{ borderColor: `${assignment.accent.border}40` }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: assignment.accent.border }}
              />
              <span className="font-medium text-gray-800">{assignment.title}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{formatHoursValue(assignment.weeklyHours)} hrs</span>
              {assignment.buildings.length > 0 && (
                <>
                  <span className="text-gray-400">·</span>
                  <span className="inline-flex items-center gap-0.5 text-gray-500">
                    <MapPin size={10} />
                    {assignment.buildings.join(', ')}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Mobile: card list view ── */}
      <div className="space-y-2 md:hidden">
        {daysWithEvents.map((day) => {
          const dayEvents = [...(eventsByDay[day] || [])].sort((a, b) => a.startMinutes - b.startMinutes);
          return (
            <div key={`mobile-${day}`} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-3 py-1.5">
                <span className="text-xs font-semibold text-baylor-green tracking-wide">{DAY_LABELS[day]}</span>
                <span className="text-[11px] font-medium text-gray-400">
                  {formatHoursValue(dailyTotals[day] || 0)} hrs
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {dayEvents.map((event) => (
                  <div
                    key={`mobile-event-${event.id}`}
                    className="flex items-start gap-2.5 px-3 py-2"
                  >
                    <span
                      className="mt-1 h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: event.accent.border }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 leading-tight">{event.assignment?.jobTitle || 'Assignment'}</div>
                      <div className="text-xs text-gray-500">{formatEventRange(event)}</div>
                      {event.assignment?.buildings?.length > 0 && (
                        <div className="text-xs text-gray-400">
                          {(event.assignment.buildings || []).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop: timeline grid ── */}
      <div className="hidden md:block rounded-lg border border-gray-200 bg-white overflow-hidden">
        {/* Column headers */}
        <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: `56px repeat(${daysWithEvents.length}, minmax(0, 1fr))` }}>
          <div className="border-r border-gray-100" />
          {daysWithEvents.map((day, dayIndex) => (
            <div
              key={`header-${day}`}
              className={`py-2 text-center ${dayIndex < daysWithEvents.length - 1 ? 'border-r border-gray-100' : ''}`}
            >
              <div className="text-xs font-semibold text-baylor-green leading-tight">
                <span className="lg:hidden">{DAY_ABBR[day]}</span>
                <span className="hidden lg:inline">{DAY_SHORT_LABELS[day]}</span>
              </div>
              <div className="text-[10px] text-gray-400 leading-tight mt-0.5">
                {formatHoursValue(dailyTotals[day] || 0)}h
              </div>
            </div>
          ))}
        </div>

        {/* Timeline body */}
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${daysWithEvents.length}, minmax(0, 1fr))` }}>
          {/* Time gutter */}
          <div className="relative border-r border-gray-100" style={{ height: `${totalMinutes * pxPerMinute}px` }}>
            {hourTicks.map((tick) => {
              const topPx = (tick - minStart) * pxPerMinute;
              return (
                <React.Fragment key={`tick-${tick}`}>
                  <span
                    className="absolute right-2 text-[10px] font-medium text-gray-400 leading-none select-none"
                    style={{ top: `${topPx}px`, transform: 'translateY(-50%)' }}
                  >
                    {formatMinutesToLabel(tick)}
                  </span>
                </React.Fragment>
              );
            })}
          </div>

          {/* Day columns */}
          {daysWithEvents.map((day, dayIndex) => (
            <div
              key={`day-${day}`}
              className={`relative ${dayIndex < daysWithEvents.length - 1 ? 'border-r border-gray-100' : ''}`}
              style={{ height: `${totalMinutes * pxPerMinute}px` }}
            >
              {/* Hour grid lines */}
              {hourTicks.map((tick) => (
                <div
                  key={`gridline-${day}-${tick}`}
                  className="absolute inset-x-0 border-t border-gray-100"
                  style={{ top: `${(tick - minStart) * pxPerMinute}px` }}
                />
              ))}

              {/* Event blocks */}
              {(eventsByDay[day] || []).map((event) => {
                const durationMinutes = event.endMinutes - event.startMinutes;
                const top = (event.startMinutes - minStart) * pxPerMinute;
                const height = Math.max(durationMinutes * pxPerMinute, 20);
                const widthPercent = 100 / event.lanes;
                const leftPercent = widthPercent * event.lane;
                const isCompact = height < 42;

                return (
                  <div
                    key={event.id}
                    className="absolute rounded-[5px] border overflow-hidden transition-shadow hover:shadow-md"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${leftPercent}% + 2px)`,
                      width: `calc(${widthPercent}% - 4px)`,
                      borderColor: event.accent.border,
                      background: event.accent.background,
                      borderLeftWidth: '3px',
                    }}
                    title={`${event.assignment?.jobTitle || 'Assignment'}\n${formatEventRange(event)}`}
                  >
                    {isCompact ? (
                      <div className="flex items-center gap-1 px-1.5 h-full">
                        <span className="text-[10px] font-semibold truncate" style={{ color: event.accent.text }}>
                          {event.assignment?.jobTitle || 'Assignment'}
                        </span>
                        <span className="text-[9px] text-gray-500 shrink-0">
                          {formatEventRangeShort(event)}
                        </span>
                      </div>
                    ) : (
                      <div className="px-2 py-1">
                        <div className="text-[11px] font-semibold leading-tight truncate" style={{ color: event.accent.text }}>
                          {event.assignment?.jobTitle || 'Assignment'}
                        </div>
                        <div className="text-[10px] text-gray-500 leading-tight mt-0.5 truncate">
                          {formatEventRangeShort(event)}
                        </div>
                        {!isCompact && height > 56 && event.assignment?.buildings?.length > 0 && (
                          <div className="text-[9px] text-gray-400 leading-tight mt-0.5 truncate">
                            {(event.assignment.buildings || []).join(', ')}
                          </div>
                        )}
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
  );
};

export default StudentWorkerScheduleView;
