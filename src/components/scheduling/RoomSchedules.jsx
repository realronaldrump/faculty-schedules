import React, { useState, useMemo, useEffect } from 'react';
import { MapPin, Calendar, Clock, Search, Grid, List, Filter, Building2, X, SlidersHorizontal, ArrowUpDown, Download, Printer } from 'lucide-react';
import FacultyContactCard from '../FacultyContactCard';
import WeekView from './WeekView';
import CourseDetailModal from './CourseDetailModal';
import ICSExportModal from './ICSExportModal';
import { logExport } from '../../utils/activityLogger';

const RoomSchedules = ({ scheduleData, facultyData, rawScheduleData, onNavigate }) => {
  const getDefaultRoomScheduleDay = () => {
    const jsDay = new Date().getDay(); // 0 Sun ... 6 Sat
    const mapping = { 1: 'M', 2: 'T', 3: 'W', 4: 'R', 5: 'F' };
    return mapping[jsDay] || 'M';
  };
  const [roomScheduleDay, setRoomScheduleDay] = useState(getDefaultRoomScheduleDay);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline', 'list', or 'week'
  const [selectedRoom, setSelectedRoom] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [showOnlyInUse, setShowOnlyInUse] = useState(false);
  const [density, setDensity] = useState('comfortable'); // 'comfortable' | 'compact'
  const [sortBy, setSortBy] = useState('room'); // 'room' | 'sessions' | 'utilization'
  const [weekViewMode, setWeekViewMode] = useState('all'); // 'all', 'mwf', 'tr', 'mw', 'trf'
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  const [selectedCourseForModal, setSelectedCourseForModal] = useState(null);
  const [showICSModal, setShowICSModal] = useState(false);

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };
  const dayOrder = ['M', 'T', 'W', 'R', 'F'];

  // Utility functions
  const getBuildingFromRoom = (room) => {
    if (!room) return '';
    const trimmed = room.trim().replace(/\s{2,}/g, ' ');
    if (!trimmed) return '';
    // Capture everything before the first token that contains a digit (room number/identifier)
    const match = trimmed.match(/^(.*?)(?=\s(?:[A-Za-z-]*\d))/);
    const name = (match && match[1] ? match[1] : trimmed).trim();
    return name || trimmed.split(' ')[0];
  };

  // Normalize a meeting pattern string to ordered unique chars (e.g., "WFM" -> "MWF")
  const normalizePattern = (patternStr) => {
    if (!patternStr) return '';
    const order = ['M', 'T', 'W', 'R', 'F'];
    const set = new Set((patternStr || '').split('').filter(Boolean));
    return order.filter(d => set.has(d)).join('');
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);
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

  const formatMinutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  // Get unique rooms
  const uniqueRooms = useMemo(() => {
    const allRooms = scheduleData.flatMap(item => (item.Room || '').split(';').map(r => r.trim()));
    return [...new Set(allRooms)]
      .filter(room => 
        room &&
        room.toLowerCase() !== 'online' &&
        !room.toLowerCase().includes('no room needed') &&
        !room.toLowerCase().includes('general assignment')
      )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [scheduleData]);

  // Building options parsed from rooms
  const buildingOptions = useMemo(() => {
    const buildings = new Set();
    uniqueRooms.forEach(room => {
      const b = getBuildingFromRoom(room);
      if (b) buildings.add(b);
    });
    return Array.from(buildings).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [uniqueRooms]);

  // Filter rooms based on search
  const filteredRooms = useMemo(() => {
    const bySearch = uniqueRooms.filter(room => room.toLowerCase().includes(searchTerm.toLowerCase()));
    const byBuilding = selectedBuilding ? bySearch.filter(room => getBuildingFromRoom(room) === selectedBuilding) : bySearch;
    return byBuilding;
  }, [uniqueRooms, searchTerm, selectedBuilding]);

  // Calculate daily room schedules
  const dailyRoomSchedules = useMemo(() => {
    const schedules = {};
    const roomsToShow = selectedRoom ? [selectedRoom] : filteredRooms;
    
    roomsToShow.forEach(room => {
      schedules[room] = scheduleData
        .filter(item => 
          (item.Room || '').split(';').map(r => r.trim()).includes(room) && 
          item.Day === roomScheduleDay && 
          item['Start Time'] && 
          item['End Time']
        )
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
    
    return schedules;
  }, [scheduleData, filteredRooms, selectedRoom, roomScheduleDay]);

  // Calculate weekly room schedules for week view
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

  const openCourseCard = (item, roomOverride) => {
    if (!item) return;
    const pattern = item.__pattern || normalizePattern(getMeetingPattern(item.Course, item['Start Time'], item['End Time']) || item.Day || '');
    const room = roomOverride || item.__room || ((item.Room || '').split(';')[0] || '').trim();
    const building = getBuildingFromRoom(room);
    setSelectedCourseForModal({ item, pattern, room, building });
  };

  const closeCourseCard = () => setSelectedCourseForModal(null);

  // Calculate room utilization stats
  const roomStats = useMemo(() => {
    const stats = {};
    
    Object.keys(dailyRoomSchedules).forEach(room => {
      const sessions = dailyRoomSchedules[room];
      const totalHours = sessions.reduce((sum, session) => {
        const start = parseTime(session['Start Time']);
        const end = parseTime(session['End Time']);
        return sum + ((end - start) / 60);
      }, 0);
      
      stats[room] = {
        sessions: sessions.length,
        hours: totalHours,
        utilization: (totalHours / 9) * 100 // 9 hours = 8AM to 5PM
      };
    });
    
    return stats;
  }, [dailyRoomSchedules]);

  // Compute final visible rooms considering toggles and sorting
  const visibleRooms = useMemo(() => {
    const baseRooms = Object.keys(dailyRoomSchedules);
    const inUseFiltered = showOnlyInUse ? baseRooms.filter(r => (dailyRoomSchedules[r] || []).length > 0) : baseRooms;
    const sorted = [...inUseFiltered].sort((a, b) => {
      if (sortBy === 'sessions') {
        return (roomStats[b]?.sessions || 0) - (roomStats[a]?.sessions || 0) || a.localeCompare(b, undefined, { numeric: true });
      }
      if (sortBy === 'utilization') {
        return (roomStats[b]?.utilization || 0) - (roomStats[a]?.utilization || 0) || a.localeCompare(b, undefined, { numeric: true });
      }
      return a.localeCompare(b, undefined, { numeric: true });
    });
    return sorted;
  }, [dailyRoomSchedules, roomStats, showOnlyInUse, sortBy]);

  const visibleStats = useMemo(() => {
    const statsForVisible = visibleRooms.map(r => roomStats[r]).filter(Boolean);
    const totals = statsForVisible.reduce((acc, s) => {
      acc.sessions += s.sessions;
      acc.hours += s.hours;
      acc.utilizationSum += s.utilization;
      return acc;
    }, { sessions: 0, hours: 0, utilizationSum: 0 });
    const avgUtil = statsForVisible.length > 0 ? (totals.utilizationSum / statsForVisible.length) : 0;
    return { count: visibleRooms.length, sessions: totals.sessions, hours: totals.hours, avgUtilization: avgUtil };
  }, [visibleRooms, roomStats]);

  const handleShowContactCard = (facultyName) => {
    const faculty = facultyData.find(f => f.name === facultyName);
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    }
  };

  // Export week view to CSV
  const handleExportWeekView = () => {
    // Extract semester from schedule data
    const getSemesterFromData = () => {
      const terms = scheduleData.map(item => item.Term).filter(Boolean);
      const uniqueTerms = [...new Set(terms)];
      return uniqueTerms.length === 1 ? uniqueTerms[0] : (uniqueTerms.length > 1 ? 'Multiple' : 'Unknown');
    };

    const semester = getSemesterFromData().replace(/\s+/g, '_');
    const roomPart = selectedRoom ? selectedRoom.replace(/\s+/g, '_') : 'all_rooms';
    const buildingPart = selectedBuilding ? `-${selectedBuilding.replace(/\s+/g, '_')}` : '';

    const csvData = [];
    const headers = ['Room', 'Day', 'Course', 'Instructor', 'Start Time', 'End Time', 'Meeting Pattern'];
    csvData.push(headers);

    Object.entries(weeklyRoomSchedules).forEach(([room, daySchedules]) => {
      Object.entries(daySchedules).forEach(([day, schedules]) => {
        schedules.forEach(schedule => {
          const meetingPattern = getMeetingPattern(schedule.Course, schedule['Start Time'], schedule['End Time']);
          csvData.push([
            room,
            dayNames[day],
            schedule.Course,
            schedule.Instructor,
            schedule['Start Time'],
            schedule['End Time'],
            meetingPattern
          ]);
        });
      });
    });

    const csvContent = csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${roomPart}${buildingPart}-${weekViewMode}-${semester}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Print week view
  const handlePrintWeekView = () => {
    window.print();
  };


  // Export to Outlook-compatible ICS (open modal)
  const handleExportWeekViewICS = () => {
    setShowICSModal(true);
  };

  const performICSExport = async ({ startDate, endDate, perRoom, rooms }) => {
    const roomsToExport = Array.isArray(rooms) && rooms.length > 0
      ? rooms
      : (selectedRoom ? [selectedRoom] : filteredRooms.slice());
    if (!roomsToExport || roomsToExport.length === 0) {
      console.warn('No rooms available to export.');
      return;
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    const dayCodeToJs = { 'M': 1, 'T': 2, 'W': 3, 'R': 4, 'F': 5 };
    const pad2 = (n) => String(n).padStart(2, '0');
    const formatLocalDate = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    const formatLocalDateTime = (d) => `${formatLocalDate(d)}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
    const formatUtcUntil = (d) => {
      const z = new Date(d.getTime());
      return `${z.getUTCFullYear()}${pad2(z.getUTCMonth() + 1)}${pad2(z.getUTCDate())}T${pad2(z.getUTCHours())}${pad2(z.getUTCMinutes())}${pad2(z.getUTCSeconds())}Z`;
    };
    const formatUtcDateTime = (d) => {
      const z = new Date(d.getTime());
      return `${z.getUTCFullYear()}${pad2(z.getUTCMonth() + 1)}${pad2(z.getUTCDate())}T${pad2(z.getUTCHours())}${pad2(z.getUTCMinutes())}${pad2(z.getUTCSeconds())}Z`;
    };
    const escapeICS = (text) => (text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
    const foldICSLines = (inputLines) => {
      const maxLen = 75;
      const folded = [];
      inputLines.forEach((line) => {
        if (typeof line !== 'string') {
          folded.push(String(line || ''));
          return;
        }
        if (line.length <= maxLen) {
          folded.push(line);
        } else {
          folded.push(line.slice(0, maxLen));
          let pos = maxLen;
          const contMax = maxLen - 1;
          while (pos < line.length) {
            folded.push(' ' + line.slice(pos, pos + contMax));
            pos += contMax;
          }
        }
      });
      return folded;
    };

    const buildVTimezone = () => [
      'BEGIN:VTIMEZONE',
      'TZID:America/Chicago',
      'X-LIC-LOCATION:America/Chicago',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:-0600',
      'TZOFFSETTO:-0500',
      'TZNAME:CDT',
      'DTSTART:19700308T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0600',
      'TZNAME:CST',
      'DTSTART:19701101T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
      'END:STANDARD',
      'END:VTIMEZONE'
    ];

    let totalEvents = 0;

    // Extract semester from schedule data
    const getSemesterFromData = () => {
      const terms = scheduleData.map(item => item.Term).filter(Boolean);
      const uniqueTerms = [...new Set(terms)];
      return uniqueTerms.length === 1 ? uniqueTerms[0] : (uniqueTerms.length > 1 ? 'Multiple' : 'Unknown');
    };

    const createIcsForRooms = (rooms) => {
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//faculty-schedules//RoomSchedules//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'X-WR-TIMEZONE:America/Chicago'
      ];
      lines.push(...buildVTimezone());

      const bydayMap = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR' };
      const icsOrder = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

      const firstOccurrenceForDays = (startDate, jsDays) => {
        const allow = new Set(jsDays);
        const cur = new Date(startDate.getTime());
        for (let i = 0; i < 14; i++) {
          if (allow.has(cur.getDay())) return cur;
          cur.setDate(cur.getDate() + 1);
        }
        return cur;
      };

      rooms.forEach((room) => {
        const daySchedules = weeklyRoomSchedules[room] || {};

        // Group items across days by course/time/(section/instructor/crn) so we can make one BYDAY event
        const groups = new Map();
        Object.entries(daySchedules).forEach(([dayCode, schedules]) => {
          const jsDay = dayCodeToJs[dayCode];
          if (jsDay == null) return;
          schedules.forEach((item) => {
            const startMin = parseTime(item['Start Time']);
            const endMin = parseTime(item['End Time']);
            if (startMin == null || endMin == null || endMin <= startMin) return;

            const key = [
              item.Course || '',
              item['Course Title'] || '',
              item.Instructor || '',
              item.Section || '',
              item.CRN || item.Crn || item.crn || '',
              item['Start Time'] || '',
              item['End Time'] || ''
            ].join('|');

            const existing = groups.get(key) || {
              item,
              startMin,
              endMin,
              jsDays: new Set(),
              icsDays: new Set()
            };
            existing.jsDays.add(jsDay);
            const by = bydayMap[jsDay];
            if (by) existing.icsDays.add(by);
            groups.set(key, existing);
          });
        });

        Array.from(groups.values()).forEach((group) => {
          const jsDaysArr = Array.from(group.jsDays);
          if (jsDaysArr.length === 0) return;

          const first = firstOccurrenceForDays(start, jsDaysArr);
          const dtStart = new Date(first.getFullYear(), first.getMonth(), first.getDate(), Math.floor(group.startMin / 60), group.startMin % 60, 0);
          const dtEnd = new Date(first.getFullYear(), first.getMonth(), first.getDate(), Math.floor(group.endMin / 60), group.endMin % 60, 0);

          const byday = icsOrder.filter((d) => group.icsDays.has(d)).join(',');
          const untilUtc = formatUtcUntil(new Date(end.getTime()));

          const item = group.item;
          const summary = `${item.Course || ''}${item['Course Title'] ? ' - ' + item['Course Title'] : ''}`.trim();
          const descParts = [];
          if (item.Instructor) descParts.push(`Instructor: ${item.Instructor}`);
          if (item.Section) descParts.push(`Section: ${item.Section}`);
          if (item.CRN || item.Crn || item.crn) descParts.push(`CRN: ${item.CRN || item.Crn || item.crn}`);
          if (item.Term) descParts.push(`Term: ${item.Term}`);
          const description = descParts.join('\n');

          const uid = `${room}-${item.Course}-${item['Start Time']}-${item['End Time']}-${byday}@faculty-schedules`;

          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${escapeICS(uid)}`);
          lines.push(`DTSTAMP:${formatUtcDateTime(new Date())}`);
          lines.push(`SUMMARY:${escapeICS(summary)}`);
          if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);
          lines.push(`LOCATION:${escapeICS(room)}`);
          lines.push(`DTSTART;TZID=America/Chicago:${formatLocalDateTime(dtStart)}`);
          lines.push(`DTEND;TZID=America/Chicago:${formatLocalDateTime(dtEnd)}`);
          lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${untilUtc}`);
          lines.push('END:VEVENT');

          totalEvents += 1;
        });
      });

      lines.push('END:VCALENDAR');
      const finalLines = foldICSLines(lines);
      return finalLines.join('\r\n') + '\r\n';
    };

    const semester = getSemesterFromData().replace(/\s+/g, '_');

    if (perRoom && (!selectedRoom) && roomsToExport.length > 1) {
      roomsToExport.forEach((room) => {
        const ics = createIcsForRooms([room]);
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${room.replace(/\s+/g, '_')}-${semester}-${new Date().toISOString().split('T')[0]}.ics`;
        a.click();
        window.URL.revokeObjectURL(url);
      });
    } else {
      const roomPart = selectedRoom
        ? selectedRoom.replace(/\s+/g, '_')
        : (roomsToExport.length === 1 ? roomsToExport[0].replace(/\s+/g, '_') : 'multiple_rooms');
      const buildingPart = selectedBuilding ? `-${selectedBuilding.replace(/\s+/g, '_')}` : '';
      const ics = createIcsForRooms(roomsToExport);
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${roomPart}${buildingPart}-${semester}-${new Date().toISOString().split('T')[0]}.ics`;
      a.click();
      window.URL.revokeObjectURL(url);
    }

    try {
      await logExport('ICS', 'Room schedules', totalEvents || 0);
    } catch (_) {}
  };



  // Timeline view component
  const TimelineView = () => {
    const dayStart = 8 * 60; // 8:00 AM
    const dayEnd = 18 * 60; // 6:00 PM
    const totalMinutes = dayEnd - dayStart;
    const timeLabels = Array.from({length: (dayEnd - dayStart) / 60 + 1}, (_, i) => dayStart + i * 60);
    const rowHeight = density === 'compact' ? '44px' : '60px';

    return (
      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
        <div className="relative min-w-[800px]">
          {/* Timeline Header */}
          <div className="flex sticky top-0 bg-white z-10 border-b-2 border-baylor-green">
            <div className="w-40 flex-shrink-0 font-serif font-semibold p-3 text-baylor-green border-r border-gray-200">
              Room
            </div>
            <div className="flex-grow flex">
              {timeLabels.slice(0, -1).map(time => (
                <div 
                  key={time} 
                  style={{width: `${(60 / totalMinutes) * 100}%`}} 
                  className="text-center text-xs font-medium p-2 border-l border-gray-200 text-baylor-green"
                >
                  {formatMinutesToTime(time).replace(':00','')}
                </div>
              ))}
            </div>
          </div>
          
          {/* Room Rows */}
          {visibleRooms.map(room => (
            <div key={room} className="relative flex items-center border-t border-gray-200 hover:bg-gray-50" style={{ height: rowHeight }}>
              <div className="w-40 flex-shrink-0 font-medium p-3 text-sm text-baylor-green border-r border-gray-200">
                <div className="font-semibold">{room}</div>
                <div className="text-xs text-gray-500">
                  {roomStats[room]?.sessions || 0} sessions • {(roomStats[room]?.hours || 0).toFixed(1)}h
                </div>
                <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-baylor-green"
                    style={{ width: `${Math.min(100, Math.max(0, roomStats[room]?.utilization || 0))}%` }}
                  />
                </div>
              </div>
              
              <div className="absolute top-0 left-40 right-0 h-full bg-gray-50/30">
                {/* Grid lines */}
                {timeLabels.slice(1, -1).map(time => (
                  <div 
                    key={time} 
                    style={{ left: `${((time - dayStart) / totalMinutes) * 100}%` }} 
                    className="absolute top-0 bottom-0 w-px bg-gray-200"
                  ></div>
                ))}
                {/* Current time indicator */}
                {nowMinutes >= dayStart && nowMinutes <= dayEnd && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500/70"
                    style={{ left: `${((nowMinutes - dayStart) / totalMinutes) * 100}%` }}
                  />
                )}
                
                {/* Scheduled Items */}
                {dailyRoomSchedules[room].map(item => {
                  const start = parseTime(item['Start Time']);
                  const end = parseTime(item['End Time']);
                  if (start === null || end === null || end <= start) return null;

                  const left = Math.max(0, ((start - dayStart) / totalMinutes) * 100);
                  const width = (((end - start) / totalMinutes) * 100);

                  if (end < dayStart || start > dayEnd) return null;

                  return (
                    <div
                      key={`${item.Course}-${item['Start Time']}-${item['End Time']}-${room}`}
                      style={{ 
                        position: 'absolute', 
                        left: `${left}%`, 
                        width: `${width}%`, 
                        top: density === 'compact' ? '4px' : '6px', 
                        bottom: density === 'compact' ? '4px' : '6px' 
                      }}
                      className={`px-2 py-1 overflow-hidden text-left text-white text-xs rounded-md shadow-sm transition-all cursor-pointer group ${nowMinutes >= start && nowMinutes <= end ? 'bg-baylor-gold text-baylor-green ring-2 ring-baylor-gold/40' : 'bg-baylor-green hover:bg-baylor-gold hover:text-baylor-green'}`}
                      onClick={() => openCourseCard(item, room)}
                    >
                      <div className="font-bold truncate">{item.Course}</div>
                      <button
                        className="truncate hover:underline w-full text-left"
                        onClick={(e) => { e.stopPropagation(); handleShowContactCard(item.Instructor); }}
                      >
                        {item.Instructor}
                      </button>
                      <div className="text-xs opacity-75">
                        {formatMinutesToTime(start)} - {formatMinutesToTime(end)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // List view component
  const ListView = () => (
    <div className="space-y-4">
      {visibleRooms.map(room => (
        <div key={room} className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="bg-baylor-green/5 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-semibold text-baylor-green text-lg flex items-center">
                <MapPin className="mr-2 text-baylor-gold" size={18} />
                {room}
              </h3>
              <div className="text-sm text-gray-600">
                {roomStats[room]?.sessions || 0} sessions • {(roomStats[room]?.hours || 0).toFixed(1)} hours • {(roomStats[room]?.utilization || 0).toFixed(0)}% utilization
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {dailyRoomSchedules[room].length > 0 ? (
              <div className="space-y-3">
                {dailyRoomSchedules[room].map((session, index) => (
                  <div key={index} className={`flex items-center justify-between ${density === 'compact' ? 'p-3' : 'p-4'} bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer`} onClick={() => openCourseCard(session, room)}>
                    <div className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div className="font-semibold text-baylor-green">
                          {session.Course}
                        </div>
                        <div className="text-sm text-gray-600">
                          {session['Course Title']}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 mt-1">
                        <button
                          className="text-sm text-baylor-green hover:underline font-medium"
                          onClick={(e) => { e.stopPropagation(); handleShowContactCard(session.Instructor); }}
                        >
                          {session.Instructor}
                        </button>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-baylor-green">
                        {session['Start Time']} - {session['End Time']}
                      </div>
                      <div className="text-sm text-gray-500">
                        {(() => {
                          const start = parseTime(session['Start Time']);
                          const end = parseTime(session['End Time']);
                          const duration = end - start;
                          return `${Math.floor(duration / 60)}h ${duration % 60}m`;
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No classes scheduled</p>
              </div>
            )}
            <div className="mt-4">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-baylor-green"
                  style={{ width: `${Math.min(100, Math.max(0, roomStats[room]?.utilization || 0))}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-gray-500 text-right">{(roomStats[room]?.utilization || 0).toFixed(0)}% of day used</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Room Schedules</h1>
        <p className="text-gray-600">View classroom usage and availability across the department</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-baylor-green">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="font-medium">Filters & View</span>
            </div>
            {(selectedRoom || selectedBuilding || searchTerm || showOnlyInUse || sortBy !== 'room' || density !== 'comfortable') && (
              <button
                onClick={() => { setSelectedRoom(''); setSelectedBuilding(''); setSearchTerm(''); setShowOnlyInUse(false); setSortBy('room'); setDensity('comfortable'); }}
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
              >
                <X className="mr-1 h-4 w-4" /> Clear
              </button>
            )}
          </div>
          {/* Row 1: Day selector full width */}
          <div className="grid grid-cols-1 gap-4">
            {/* Day Selector */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Day</label>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                {Object.entries(dayNames).map(([dayCode, dayName]) => (
                  <button
                    key={dayCode}
                    onClick={() => setRoomScheduleDay(dayCode)}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex-1 ${
                      roomScheduleDay === dayCode 
                        ? 'bg-baylor-green text-white shadow' 
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {dayName}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Search, Building, Room, View Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            {/* Room Filter */}
            <div className="flex-1 max-w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter Rooms</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search rooms..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                />
              </div>
            </div>

            {/* Building Filter */}
            <div className="flex-1 max-w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">Building</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <select
                  value={selectedBuilding}
                  onChange={(e) => setSelectedBuilding(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white"
                >
                  <option value="">All buildings</option>
                  {buildingOptions.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Room Selector */}
            <div className="flex-1 max-w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">Room</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white"
                >
                  <option value="">All rooms</option>
                  {(selectedBuilding ? filteredRooms : uniqueRooms).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex-1 max-w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">View Mode</label>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center flex-1 justify-center ${
                    viewMode === 'timeline' 
                      ? 'bg-baylor-green text-white shadow' 
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Grid className="mr-1" size={16} />
                  Timeline
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center flex-1 justify-center ${
                    viewMode === 'list' 
                      ? 'bg-baylor-green text-white shadow' 
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <List className="mr-1" size={16} />
                  List
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center flex-1 justify-center ${
                    viewMode === 'week' 
                      ? 'bg-baylor-green text-white shadow' 
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Calendar className="mr-1" size={16} />
                  Week
                </button>
              </div>
            </div>
          </div>

          {/* Row 3: Only-in-use, Density, Sort, Week View Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
            {/* Only In Use Toggle */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Only rooms in use</label>
              <button
                onClick={() => setShowOnlyInUse(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showOnlyInUse ? 'bg-baylor-green' : 'bg-gray-300'}`}
                aria-pressed={showOnlyInUse}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${showOnlyInUse ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Density Toggle */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Density</label>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setDensity('comfortable')}
                  className={`px-3 py-1.5 text-sm rounded-md ${density === 'comfortable' ? 'bg-baylor-green text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
                >Comfortable</button>
                <button
                  onClick={() => setDensity('compact')}
                  className={`px-3 py-1.5 text-sm rounded-md ${density === 'compact' ? 'bg-baylor-green text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
                >Compact</button>
              </div>
            </div>

            {/* Sort */}
            <div className="flex-1 max-w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
              <div className="relative">
                <ArrowUpDown className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white"
                >
                  <option value="room">Room (A–Z)</option>
                  <option value="sessions">Sessions (High → Low)</option>
                  <option value="utilization">Utilization (High → Low)</option>
                </select>
              </div>
            </div>

            {/* Week View Mode (only show when in week view) */}
            {viewMode === 'week' && (
              <div className="flex-1 max-w-full">
                <label className="block text-sm font-medium text-gray-700 mb-2">Week Pattern</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={weekViewMode}
                    onChange={(e) => setWeekViewMode(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white"
                  >
                    <option value="all">All Days</option>
                    <option value="mwf">MWF</option>
                    <option value="tr">TR</option>
                    <option value="mw">MW</option>
                    <option value="trf">TRF</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats (hide in week view) */}
      {viewMode !== 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Rooms Shown</div>
            <div className="text-2xl font-bold text-baylor-green">
              {visibleStats.count}
            </div>
            <div className="text-xs text-gray-500">of {uniqueRooms.length} total</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Total Sessions</div>
            <div className="text-2xl font-bold text-baylor-green">
              {visibleStats.sessions}
            </div>
            <div className="text-xs text-gray-500">on {dayNames[roomScheduleDay]}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Total Hours</div>
            <div className="text-2xl font-bold text-baylor-green">
              {visibleStats.hours.toFixed(1)}h
            </div>
            <div className="text-xs text-gray-500">class time</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Avg Utilization</div>
            <div className="text-2xl font-bold text-baylor-green">
              {visibleStats.count > 0 ? visibleStats.avgUtilization.toFixed(0) : 0}%
            </div>
            <div className="text-xs text-gray-500">of 9-hour day</div>
          </div>
        </div>
      )}

      {/* Schedule Display */}
      <div>
        {viewMode !== 'week' && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-serif font-semibold text-baylor-green">
              {dayNames[roomScheduleDay]} Schedule
            </h2>
            {searchTerm && (
              <div className="text-sm text-gray-600">
                Filtered by: "{searchTerm}"
              </div>
            )}
          </div>
        )}

        {visibleRooms.length > 0 ? (
          viewMode === 'timeline' ? <TimelineView /> : 
          viewMode === 'list' ? <ListView /> :
          viewMode === 'week' ? (
            <WeekView
              scheduleData={scheduleData}
              filteredRooms={filteredRooms}
              selectedRoom={selectedRoom}
              selectedBuilding={selectedBuilding}
              weekViewMode={weekViewMode}
              density={density}
              onShowContactCard={handleShowContactCard}
              onExport={handleExportWeekView}
              onPrint={handlePrintWeekView}
              onExportICS={handleExportWeekViewICS}
            />
          ) : <TimelineView />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Rooms Found</h3>
            <p className="text-gray-600">
              {searchTerm 
                ? `No rooms match your search "${searchTerm}". Try adjusting your search criteria.`
                : 'No room data available for the selected day.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Faculty Contact Card Modal */}
      {selectedFacultyForCard && (
        <FacultyContactCard
          faculty={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
        />
      )}

      {/* Course Detail Modal */}
      {selectedCourseForModal && (
        <CourseDetailModal
          item={selectedCourseForModal.item}
          pattern={selectedCourseForModal.pattern}
          room={selectedCourseForModal.room}
          building={selectedCourseForModal.building}
          onClose={closeCourseCard}
          onShowContactCard={(name) => handleShowContactCard(name)}
        />
      )}

      {/* ICS Export Modal */}
      <ICSExportModal
        isOpen={showICSModal}
        onClose={() => setShowICSModal(false)}
        onConfirm={(vals) => { setShowICSModal(false); performICSExport(vals); }}
        rooms={selectedRoom ? [selectedRoom] : filteredRooms}
        roomsCount={(selectedRoom ? 1 : filteredRooms.length) || 0}
        selectedRoom={selectedRoom}
        selectedBuilding={selectedBuilding}
      />
    </div>
  );
};

export default RoomSchedules;