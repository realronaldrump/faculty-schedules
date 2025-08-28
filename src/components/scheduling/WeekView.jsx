import React, { useMemo, useState } from 'react';
import { MapPin, Download, Printer } from 'lucide-react';
import CourseDetailModal from './CourseDetailModal';

const WeekView = ({ 
  scheduleData, 
  filteredRooms, 
  selectedRoom, 
  selectedBuilding, 
  weekViewMode, 
  density, 
  onShowContactCard,
  onExport,
  onPrint 
}) => {
  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };
  const dayOrder = ['M', 'T', 'W', 'R', 'F'];

  // Course detail card state
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Time scale configuration (dynamic 8:00 AM to last class end)
  const dayStartMinutes = 8 * 60;

  // Parse time string to minutes
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');
    let hour, minute, ampm;
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      hour = parseInt(parts[0]);
      minute = parseInt(parts[1].replace(/[^\d]/g, ''));
      ampm = cleaned.includes('pm') ? 'pm' : 'am';
    } else {
      const match = cleaned.match(/(\d+)(am|pm)/);
      if (match) {
        hour = parseInt(match[1]);
        minute = 0;
        ampm = match[2];
      } else return null;
    }
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return hour * 60 + (minute || 0);
  };

  // Format minutes to time string
  const formatMinutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  // Get building from room name
  const getBuildingFromRoom = (room) => {
    if (!room) return '';
    const trimmed = room.trim().replace(/\s{2,}/g, ' ');
    if (!trimmed) return '';
    const match = trimmed.match(/^(.*?)(?=\s(?:[A-Za-z-]*\d))/);
    const name = (match && match[1] ? match[1] : trimmed).trim();
    return name || trimmed.split(' ')[0];
  };

  // Calculate weekly room schedules
  const weeklyRoomSchedules = useMemo(() => {
    const schedules = {};
    const roomsToShow = selectedRoom ? [selectedRoom] : filteredRooms;
    
    // Filter days based on week view mode
    let daysToShow = dayOrder;
    if (weekViewMode === 'mwf') daysToShow = ['M', 'W', 'F'];
    else if (weekViewMode === 'tr') daysToShow = ['T', 'R'];
    else if (weekViewMode === 'mw') daysToShow = ['M', 'W'];
    else if (weekViewMode === 'trf') daysToShow = ['T', 'R', 'F'];
    
    roomsToShow.forEach(room => {
      schedules[room] = {};
      daysToShow.forEach(day => {
        schedules[room][day] = scheduleData
          .filter(item => {
            const roomMatch = (item.Room || '').split(';').map(r => r.trim()).includes(room);
            const dayMatch = item.Day === day;
            const timeMatch = item['Start Time'] && item['End Time'];
            return roomMatch && dayMatch && timeMatch;
          })
          .reduce((acc, item) => {
            // Deduplicate identical sessions (e.g., cross-listed courses)
            const key = `${item.Course}-${item['Start Time']}-${item['End Time']}`;
            if (!acc.some(i => `${i.Course}-${i['Start Time']}-${i['End Time']}` === key)) {
              acc.push(item);
            }
            return acc;
          }, [])
          .sort((a, b) => parseTime(a['Start Time']) - parseTime(b['Start Time']));
      });
    });
    
    return schedules;
  }, [scheduleData, filteredRooms, selectedRoom, weekViewMode]);

  const allVisibleSessions = useMemo(() => {
    const sessions = [];
    Object.values(weeklyRoomSchedules).forEach(daysObj => {
      Object.values(daysObj || {}).forEach(dayArr => {
        (dayArr || []).forEach(item => sessions.push(item));
      });
    });
    return sessions;
  }, [weeklyRoomSchedules]);

  const latestEndMinutes = useMemo(() => {
    let maxEnd = 18 * 60; // default to 6:00 PM if nothing scheduled
    allVisibleSessions.forEach(item => {
      const end = parseTime(item['End Time']);
      if (end != null && end > maxEnd) maxEnd = end;
    });
    // Round up to next 15-minute mark for clean grid
    const remainder = maxEnd % 15;
    return remainder === 0 ? maxEnd : maxEnd + (15 - remainder);
  }, [allVisibleSessions]);

  const pixelsPerMinute = useMemo(() => (density === 'compact' ? 0.75 : 1), [density]);
  const hourTicks = useMemo(() => {
    const labels = [];
    for (let t = dayStartMinutes; t <= latestEndMinutes; t += 60) {
      labels.push(t);
    }
    return labels;
  }, [latestEndMinutes]);
  const totalMinutes = Math.max(0, latestEndMinutes - dayStartMinutes);

  // Open/close handlers for course detail card
  const openCourseCard = (item) => {
    if (!item) return;
    const pattern = item.__pattern || normalizePattern(getMeetingPattern(item.Course, item['Start Time'], item['End Time']) || item.Day || '');
    const room = item.__room || ((item.Room || '').split(';')[0] || '').trim();
    const building = getBuildingFromRoom(room);
    setSelectedCourse({ item, pattern, room, building });
  };

  const closeCourseCard = () => setSelectedCourse(null);

  // Get meeting pattern for a course
  const getMeetingPattern = (courseCode, startTime, endTime) => {
    const course = scheduleData.find(item => 
      item.Course === courseCode && 
      item['Start Time'] === startTime && 
      item['End Time'] === endTime
    );
    
    if (course && course.meetingPatterns) {
      return course.meetingPatterns.map(p => p.day).join('');
    }
    
    // Fallback to Day field
    return course?.Day || '';
  };

  // Normalize a meeting pattern string to ordered unique chars (e.g., "WFM" -> "MWF")
  const normalizePattern = (patternStr) => {
    if (!patternStr) return '';
    const order = ['M', 'T', 'W', 'R', 'F'];
    const set = new Set((patternStr || '').split('').filter(Boolean));
    return order.filter(d => set.has(d)).join('');
  };

  // Classify a pattern into "MWF" vs "TR" buckets
  const classifyPattern = (patternStr) => {
    const p = normalizePattern(patternStr);
    if (!p) return 'MWF'; // default bucket
    const onlyTR = [...p].every(d => d === 'T' || d === 'R');
    return onlyTR ? 'TR' : 'MWF';
  };

  // Filter days to show based on week view mode
  const daysToShow = useMemo(() => {
    if (weekViewMode === 'mwf') return ['M', 'W', 'F'];
    else if (weekViewMode === 'tr') return ['T', 'R'];
    else if (weekViewMode === 'mw') return ['M', 'W'];
    else if (weekViewMode === 'trf') return ['T', 'R', 'F'];
    return dayOrder;
  }, [weekViewMode]);

  // Get current time for highlighting
  const now = new Date();
  const currentDay = ['M', 'T', 'W', 'R', 'F'][now.getDay() - 1];
  const currentTime = now.getHours() * 60 + now.getMinutes();

  // Calculate cell position and size for a schedule item (consistent scale)
  const getScheduleItemStyle = (startTime, endTime) => {
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    if (start === null || end === null || end <= start) return null;
    if (end <= dayStartMinutes || start >= latestEndMinutes) return null;

    const safeStart = Math.max(start, dayStartMinutes);
    const topPx = (safeStart - dayStartMinutes) * pixelsPerMinute;
    const heightPx = Math.max(6, (Math.min(end, latestEndMinutes) - safeStart) * pixelsPerMinute);

    return {
      position: 'absolute',
      top: `${topPx}px`,
      height: `${heightPx}px`,
      left: '2px',
      right: '2px',
      zIndex: 10
    };
  };

  // Group rooms by building
  const roomsByBuilding = useMemo(() => {
    const groups = {};
    Object.keys(weeklyRoomSchedules).forEach(room => {
      const building = getBuildingFromRoom(room);
      if (!groups[building]) groups[building] = [];
      groups[building].push(room);
    });
    // Sort rooms within each building
    for (const building in groups) {
      groups[building].sort();
    }
    return groups;
  }, [weeklyRoomSchedules]);

  // Build per-building schedules split into two grids: MWF and TR.
  // Each class appears ONCE per room (de-duped across days), with meeting pattern stored on the item.
  const buildingPatternSchedules = useMemo(() => {
    const roomsToShow = selectedRoom ? [selectedRoom] : filteredRooms;
    const result = {}; // { [building]: { MWF: { [room]: item[] }, TR: { [room]: item[] } } }
    const seen = new Set(); // de-dup per Course/Start/End/Room

    // Ensure stable room lists per building even if empty
    const allRoomsByBuilding = {};
    roomsToShow.forEach(room => {
      const b = getBuildingFromRoom(room);
      if (!allRoomsByBuilding[b]) allRoomsByBuilding[b] = new Set();
      allRoomsByBuilding[b].add(room);
    });

    scheduleData.forEach(item => {
      if (!item || !item['Start Time'] || !item['End Time']) return;

      const itemRooms = (item.Room || '')
        .split(';')
        .map(r => r.trim())
        .filter(r => r && roomsToShow.includes(r));

      if (itemRooms.length === 0) return;

      const pattern = normalizePattern(getMeetingPattern(item.Course, item['Start Time'], item['End Time']) || item.Day || '');
      const bucket = classifyPattern(pattern);

      itemRooms.forEach(room => {
        const key = `${item.Course}|${item['Start Time']}|${item['End Time']}|${room}`;
        if (seen.has(key)) return; // already placed for this room (avoid one-per-day duplicates)
        seen.add(key);

        const building = getBuildingFromRoom(room);
        if (!result[building]) result[building] = { MWF: {}, TR: {} };
        if (!result[building][bucket][room]) result[building][bucket][room] = [];
        // stash normalized meeting pattern for rendering
        result[building][bucket][room].push({ ...item, __pattern: pattern, __room: room });
      });
    });

    // Ensure empty arrays exist for all rooms in both buckets, keep stable sort
    Object.entries(allRoomsByBuilding).forEach(([b, set]) => {
      if (!result[b]) result[b] = { MWF: {}, TR: {} };
      const rooms = Array.from(set).sort();
      ['MWF', 'TR'].forEach(bucket => {
        rooms.forEach(r => {
          if (!result[b][bucket][r]) result[b][bucket][r] = [];
          // sort by start time
          result[b][bucket][r].sort(
            (a, b) => parseTime(a['Start Time']) - parseTime(b['Start Time'])
          );
        });
      });
    });

    return result;
  }, [scheduleData, filteredRooms, selectedRoom, getMeetingPattern]);

  // --- Overlap layout: place overlapping items side-by-side per room ---
  const layoutRoomEvents = (items) => {
    if (!items || items.length === 0) return [];

    // Normalize events with numeric times
    const events = items
      .map((it, idx) => ({
        idx,
        it,
        start: parseTime(it['Start Time']),
        end: parseTime(it['End Time'])
      }))
      .filter(e => e.start !== null && e.end !== null && e.end > e.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const laidOut = new Array(events.length);

    let clusterStart = 0;
    while (clusterStart < events.length) {
      // Build a cluster of mutually-overlapping events
      let clusterEnd = clusterStart + 1;
      let maxEnd = events[clusterStart].end;
      while (clusterEnd < events.length && events[clusterEnd].start < maxEnd) {
        maxEnd = Math.max(maxEnd, events[clusterEnd].end);
        clusterEnd++;
      }

      // Assign lanes within this cluster (greedy, first free lane)
      const activeByLane = []; // lane -> end time
      for (let i = clusterStart; i < clusterEnd; i++) {
        const ev = events[i];
        // free lanes whose events ended
        for (let l = 0; l < activeByLane.length; l++) {
          if (activeByLane[l] <= ev.start) activeByLane[l] = -1; // mark free
        }
        // find first free lane
        let lane = activeByLane.findIndex(t => t === -1);
        if (lane === -1) lane = activeByLane.length;
        activeByLane[lane] = ev.end;
        laidOut[i] = { ...ev, lane };
      }

      const lanes = activeByLane.length || 1;
      for (let i = clusterStart; i < clusterEnd; i++) {
        laidOut[i].lanes = lanes;
      }

      clusterStart = clusterEnd;
    }

    // Map back to original item order for rendering
    return laidOut.map(({ it, start, end, lane, lanes }) => ({
      item: it,
      start,
      end,
      lane,
      lanes
    }));
  };

  return (
    <div className="space-y-6">
      {/* Week View Header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-lg font-serif font-semibold text-baylor-green">
            Weekly Schedule View
          </h2>
          <p className="text-sm text-gray-600">
            {weekViewMode === 'all' ? 'All Days' : 
             weekViewMode === 'mwf' ? 'Monday, Wednesday, Friday' :
             weekViewMode === 'tr' ? 'Tuesday, Thursday' :
             weekViewMode === 'mw' ? 'Monday, Wednesday' :
             'Tuesday, Thursday, Friday'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-baylor-green bg-white border border-baylor-green rounded-lg hover:bg-baylor-green hover:text-white transition-colors"
            title="Export to CSV"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
          <button
            onClick={onPrint}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-baylor-green bg-white border border-baylor-green rounded-lg hover:bg-baylor-green hover:text-white transition-colors"
            title="Print-friendly view"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print
          </button>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Rooms</div>
          <div className="text-2xl font-bold text-baylor-green">
            {Object.keys(weeklyRoomSchedules).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Sessions</div>
          <div className="text-2xl font-bold text-baylor-green">
            {Object.values(weeklyRoomSchedules).reduce((total, room) => 
              total + Object.values(room).reduce((dayTotal, day) => dayTotal + day.length, 0), 0
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Days Shown</div>
          <div className="text-2xl font-bold text-baylor-green">
            {daysToShow.length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Time Range</div>
          <div className="text-2xl font-bold text-baylor-green">
            {formatMinutesToTime(dayStartMinutes)} - {formatMinutesToTime(latestEndMinutes)}
          </div>
        </div>
      </div>

      {/* Room Schedules by Building (two grids per building: MWF and TR) */}
      {Object.entries(roomsByBuilding).map(([building, rooms]) => (
        <div key={building} className="space-y-6 week-view-section">
          {['MWF', 'TR'].map((bucket) => (
            <div key={`${building}-${bucket}`} className="space-y-4">
              <h3 className="text-lg font-semibold text-baylor-green flex items-center">
                <MapPin className="mr-2 text-baylor-gold" size={20} />
                {building} <span className="ml-2 text-gray-500 font-normal">({bucket})</span>
              </h3>

              <div className="flex bg-white rounded-lg border border-gray-200">
                {/* Time Axis */}
                <div className="w-24 flex-shrink-0">
                  <div className="h-[5.5rem] p-3 font-serif font-semibold text-baylor-green border-r border-gray-200 border-b-2 border-baylor-green bg-gray-50 flex items-end">Time</div>
                  <div className="relative" style={{ height: `${totalMinutes * pixelsPerMinute}px` }}>
                    {hourTicks.map((tick) => (
                      <div key={`time-${tick}`} className="absolute w-full" style={{ top: `${(tick - dayStartMinutes) * pixelsPerMinute}px`, height: `${60 * pixelsPerMinute}px` }}>
                        <div className="relative top-[-0.75em] text-center">
                          <span className="text-xs font-medium text-gray-500 bg-white px-1">
                            {formatMinutesToTime(tick).replace(':00', '').replace(' ', '')}
                          </span>
                        </div>
                        <div className="border-b border-gray-100 h-full"></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Schedule Grid (Rooms only across the top; classes plotted once with meeting pattern) */}
                <div className="flex-grow overflow-x-auto">
                  <div className="min-w-[900px]">
                    {/* Room Header */}
                    <div className="sticky top-0 bg-white z-10">
                      <div className="flex border-b-2 border-baylor-green bg-gray-50">
                        {rooms.map(room => (
                          <div key={`${bucket}-hdr-${room}`} className="flex-1 p-3 text-center font-serif font-semibold text-baylor-green border-r border-gray-200 last:border-r-0">
                            {room.replace(building, '').trim()}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Schedule Body */}
                    <div className="flex relative" style={{ height: `${totalMinutes * pixelsPerMinute}px` }}>
                      {rooms.map((room) => (
                        <div key={`${bucket}-body-${room}`} className="flex-1 relative border-r last:border-r-0">
                          {layoutRoomEvents(buildingPatternSchedules?.[building]?.[bucket]?.[room] || []).map((ev, index) => {
                            const { item, lane, lanes } = ev;
                            const baseStyle = getScheduleItemStyle(item['Start Time'], item['End Time']);
                            if (!baseStyle) return null;

                            // Side-by-side width/offset within a collision cluster
                            const gutter = 4; // px space between overlapping blocks
                            const widthPct = 100 / lanes;
                            const leftPct = widthPct * lane;

                            const style = {
                              ...baseStyle,
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${widthPct}% - ${gutter}px - 4px)`,
                              right: 'auto'
                            };

                            const pattern = item.__pattern || normalizePattern(getMeetingPattern(item.Course, item['Start Time'], item['End Time']));
                            const isCurrent =
                              (pattern || '').includes(currentDay) &&
                              currentTime >= parseTime(item['Start Time']) &&
                              currentTime <= parseTime(item['End Time']);

                            return (
                              <div
                                key={`${building}-${bucket}-${room}-${index}`}
                                style={style}
                                className={`px-2 py-1 overflow-hidden text-left text-white text-xs rounded-md shadow-sm transition-all cursor-pointer group ${
                                  isCurrent
                                    ? 'bg-baylor-gold text-baylor-green ring-2 ring-baylor-gold/40'
                                    : 'bg-baylor-green hover:bg-baylor-gold hover:text-baylor-green'
                                }`}
                                title={`${item.Course} • ${item['Start Time']} - ${item['End Time']} • ${pattern}`}
                                onClick={() => openCourseCard(item)}
                              >
                                <div className="font-bold truncate">{item.Course}</div>
                                <button
                                  className="truncate hover:underline w-full text-left"
                                  onClick={(e) => { e.stopPropagation(); onShowContactCard(item.Instructor); }}
                                >
                                  {item.Instructor}
                                </button>
                                <div className="text-[0.7rem] opacity-80">
                                  {item['Start Time']} - {item['End Time']}
                                </div>
                                {pattern && (
                                  <div className="text-[0.7rem] opacity-80 font-medium">
                                    {pattern}
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
          ))}
        </div>
      ))}
      {/* Course Detail Modal */}
      {selectedCourse && (
        <CourseDetailModal
          item={selectedCourse.item}
          pattern={selectedCourse.pattern}
          room={selectedCourse.room}
          building={selectedCourse.building}
          onClose={closeCourseCard}
          onShowContactCard={onShowContactCard}
        />
      )}
    </div>
  );
};

export default WeekView;
