import React, { useMemo } from 'react';
import { MapPin, Download, Printer } from 'lucide-react';

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
    return groups;
  }, [weeklyRoomSchedules]);

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

      {/* Week Schedule Grid (time legend aligned to room scale) */}
      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
        <div className="min-w-[1200px]">
          {/* Header Row */}
          <div className="flex border-b-2 border-baylor-green bg-gray-50">
            <div className="w-48 flex-shrink-0 p-3 font-serif font-semibold text-baylor-green border-r border-gray-200">
              Time
            </div>
            {daysToShow.map(day => (
              <div key={day} className="flex-1 p-3 text-center font-serif font-semibold text-baylor-green border-r border-gray-200 last:border-r-0">
                {dayNames[day]}
              </div>
            ))}
          </div>

          {/* Dynamic hour rows */}
          {hourTicks.map((tick, idx) => (
            <div key={tick} className="flex border-b border-gray-200 hover:bg-gray-50" style={{ height: `${60 * pixelsPerMinute}px` }}>
              <div className="w-48 flex-shrink-0 p-2 text-sm font-medium text-gray-700 border-r border-gray-200 bg-gray-50">
                {formatMinutesToTime(tick).replace(':00', '')}
              </div>
              {daysToShow.map(day => (
                <div key={day} className="flex-1 border-r border-gray-200 last:border-r-0 relative" />
              ))}
            </div>
          ))}
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

      {/* Room Schedules by Building */}
      {Object.entries(roomsByBuilding).map(([building, rooms]) => (
        <div key={building} className="space-y-4 week-view-section">
          <h3 className="text-lg font-semibold text-baylor-green flex items-center">
            <MapPin className="mr-2 text-baylor-gold" size={20} />
            {building}
          </h3>
          
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <div className="min-w-[1200px]">
              {/* Room Header */}
              <div className="flex border-b-2 border-baylor-green bg-gray-50">
                <div className="w-48 flex-shrink-0 p-3 font-serif font-semibold text-baylor-green border-r border-gray-200">
                  Room
                </div>
                {daysToShow.map(day => (
                  <div key={day} className="flex-1 p-3 text-center font-serif font-semibold text-baylor-green border-r border-gray-200 last:border-r-0">
                    {dayNames[day]}
                  </div>
                ))}
              </div>

              {/* Room Rows */}
              {rooms.map(room => (
                <div key={room} className="flex border-b border-gray-200 hover:bg-gray-50">
                  <div className="w-48 flex-shrink-0 p-3 font-medium text-baylor-green border-r border-gray-200 bg-gray-50">
                    <div className="font-semibold">{room}</div>
                    <div className="text-xs text-gray-500">
                      {Object.values(weeklyRoomSchedules[room]).flat().length} sessions
                    </div>
                  </div>
                  
                  {daysToShow.map(day => (
                    <div key={day} className="flex-1 border-r border-gray-200 last:border-r-0 relative" style={{ height: `${totalMinutes * pixelsPerMinute}px` }}>
                      {/* Time grid background aligned to hours */}
                      <div className="absolute inset-0">
                        {hourTicks.map((tick) => (
                          <div key={tick} className="w-full border-b border-gray-100" style={{ height: `${60 * pixelsPerMinute}px` }} />
                        ))}
                      </div>

                      {/* Scheduled items */}
                      {weeklyRoomSchedules[room][day].map((item, index) => {
                        const style = getScheduleItemStyle(item['Start Time'], item['End Time']);
                        if (!style) return null;

                        const meetingPattern = getMeetingPattern(item.Course, item['Start Time'], item['End Time']);
                        const isCurrent = currentDay === day && 
                                        currentTime >= parseTime(item['Start Time']) && 
                                        currentTime <= parseTime(item['End Time']);

                        return (
                          <div
                            key={`${room}-${day}-${index}`}
                            style={style}
                            className={`px-2 py-1 overflow-hidden text-left text-white text-xs rounded-md shadow-sm transition-all cursor-pointer group ${
                              isCurrent 
                                ? 'bg-baylor-gold text-baylor-green ring-2 ring-baylor-gold/40' 
                                : 'bg-baylor-green hover:bg-baylor-gold hover:text-baylor-green'
                            }`}
                          >
                            <div className="font-bold truncate">{item.Course}</div>
                            <button
                              className="truncate hover:underline w-full text-left"
                              onClick={() => onShowContactCard(item.Instructor)}
                            >
                              {item.Instructor}
                            </button>
                            <div className="text-xs opacity-75">
                              {item['Start Time']} - {item['End Time']}
                            </div>
                            {meetingPattern && (
                              <div className="text-xs opacity-75 font-medium">
                                {meetingPattern}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WeekView;
