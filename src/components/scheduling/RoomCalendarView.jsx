import React, { useMemo, useState, useEffect } from 'react';
import { MapPin, Download, Printer, Clock, Calendar } from 'lucide-react';
import CourseDetailModal from './CourseDetailModal';
import { parseTime, formatMinutesToTime } from '../../utils/timeUtils';

const RoomCalendarView = ({
    scheduleData,
    selectedRoom,
    selectedBuilding,
    density = 'comfortable',
    onShowContactCard,
    onExport,
    onPrint
}) => {
    const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };
    const dayOrder = ['M', 'T', 'W', 'R', 'F'];

    const [selectedCourse, setSelectedCourse] = useState(null);
    const [nowMinutes, setNowMinutes] = useState(() => {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    });

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            setNowMinutes(now.getHours() * 60 + now.getMinutes());
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const dayStartMinutes = 8 * 60; // 8:00 AM

    // Get building from room name
    const getBuildingFromRoom = (room) => {
        if (!room) return '';
        const trimmed = room.trim().replace(/\s{2,}/g, ' ');
        if (!trimmed) return '';
        const match = trimmed.match(/^(.*?)(?=\s(?:[A-Za-z-]*\d))/);
        const name = (match && match[1] ? match[1] : trimmed).trim();
        return name || trimmed.split(' ')[0];
    };

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

        return course?.Day || '';
    };

    // Normalize pattern string
    const normalizePattern = (patternStr) => {
        if (!patternStr) return '';
        const order = ['M', 'T', 'W', 'R', 'F'];
        const set = new Set((patternStr || '').split('').filter(Boolean));
        return order.filter(d => set.has(d)).join('');
    };

    // Calculate room schedule for all 5 days
    const roomSchedule = useMemo(() => {
        if (!selectedRoom) return {};

        const schedule = {};
        dayOrder.forEach(day => {
            schedule[day] = scheduleData
                .filter(item => {
                    const roomMatch = (item.Room || '').split(';').map(r => r.trim()).includes(selectedRoom);
                    const dayMatch = item.Day === day;
                    const timeMatch = item['Start Time'] && item['End Time'];
                    return roomMatch && dayMatch && timeMatch;
                })
                .reduce((acc, item) => {
                    // Deduplicate identical sessions
                    const key = `${item.Course}-${item['Start Time']}-${item['End Time']}`;
                    if (!acc.some(i => `${i.Course}-${i['Start Time']}-${i['End Time']}` === key)) {
                        acc.push(item);
                    }
                    return acc;
                }, [])
                .sort((a, b) => parseTime(a['Start Time']) - parseTime(b['Start Time']));
        });

        return schedule;
    }, [scheduleData, selectedRoom]);

    // Get all sessions for calculating time range
    const allSessions = useMemo(() => {
        return Object.values(roomSchedule).flat();
    }, [roomSchedule]);

    // Calculate latest end time
    const latestEndMinutes = useMemo(() => {
        let maxEnd = 18 * 60; // default 6:00 PM
        allSessions.forEach(item => {
            const end = parseTime(item['End Time']);
            if (end != null && end > maxEnd) maxEnd = end;
        });
        const remainder = maxEnd % 15;
        return remainder === 0 ? maxEnd : maxEnd + (15 - remainder);
    }, [allSessions]);

    const pixelsPerMinute = density === 'compact' ? 0.75 : 1;
    const totalMinutes = Math.max(0, latestEndMinutes - dayStartMinutes);

    const hourTicks = useMemo(() => {
        const labels = [];
        for (let t = dayStartMinutes; t <= latestEndMinutes; t += 60) {
            labels.push(t);
        }
        return labels;
    }, [latestEndMinutes]);

    // Open/close handlers for course detail card
    const openCourseCard = (item) => {
        if (!item) return;
        const pattern = normalizePattern(getMeetingPattern(item.Course, item['Start Time'], item['End Time']) || item.Day || '');
        const room = selectedRoom;
        const building = getBuildingFromRoom(room);
        setSelectedCourse({ item, pattern, room, building });
    };

    const closeCourseCard = () => setSelectedCourse(null);

    // Get current day of week
    const currentDayCode = useMemo(() => {
        const day = new Date().getDay();
        const mapping = { 1: 'M', 2: 'T', 3: 'W', 4: 'R', 5: 'F' };
        return mapping[day] || null;
    }, []);

    // Calculate position style for a schedule item
    const getScheduleItemStyle = (startTime, endTime) => {
        const start = parseTime(startTime);
        const end = parseTime(endTime);
        if (start === null || end === null || end <= start) return null;
        if (end <= dayStartMinutes || start >= latestEndMinutes) return null;

        const safeStart = Math.max(start, dayStartMinutes);
        const topPx = (safeStart - dayStartMinutes) * pixelsPerMinute;
        const heightPx = Math.max(20, (Math.min(end, latestEndMinutes) - safeStart) * pixelsPerMinute);

        return {
            position: 'absolute',
            top: `${topPx}px`,
            height: `${heightPx}px`,
            left: '4px',
            right: '4px',
            zIndex: 10
        };
    };

    // Layout overlapping events side-by-side
    const layoutDayEvents = (items) => {
        if (!items || items.length === 0) return [];

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
            let clusterEnd = clusterStart + 1;
            let maxEnd = events[clusterStart].end;
            while (clusterEnd < events.length && events[clusterEnd].start < maxEnd) {
                maxEnd = Math.max(maxEnd, events[clusterEnd].end);
                clusterEnd++;
            }

            const activeByLane = [];
            for (let i = clusterStart; i < clusterEnd; i++) {
                const ev = events[i];
                for (let l = 0; l < activeByLane.length; l++) {
                    if (activeByLane[l] <= ev.start) activeByLane[l] = -1;
                }
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

        return laidOut.map(({ it, lane, lanes }) => ({
            item: it,
            lane,
            lanes
        }));
    };

    // Calculate statistics
    const stats = useMemo(() => {
        const totalSessions = allSessions.length;
        const totalHours = allSessions.reduce((sum, item) => {
            const start = parseTime(item['Start Time']);
            const end = parseTime(item['End Time']);
            if (start !== null && end !== null) {
                return sum + (end - start) / 60;
            }
            return sum;
        }, 0);
        const uniqueInstructors = new Set(allSessions.map(s => s.Instructor).filter(Boolean)).size;
        const uniqueCourses = new Set(allSessions.map(s => s.Course).filter(Boolean)).size;

        return { totalSessions, totalHours, uniqueInstructors, uniqueCourses };
    }, [allSessions]);

    if (!selectedRoom) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Room</h3>
                <p className="text-gray-600">
                    Please select a room from the dropdown above to view its weekly calendar.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between no-print">
                <div>
                    <h2 className="text-lg font-serif font-semibold text-baylor-green flex items-center">
                        <MapPin className="mr-2 text-baylor-gold" size={20} />
                        {selectedRoom} — Weekly Calendar
                    </h2>
                    <p className="text-sm text-gray-600">
                        Full week view (Monday – Friday)
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

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="text-sm text-gray-600">Total Sessions</div>
                    <div className="text-2xl font-bold text-baylor-green">{stats.totalSessions}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="text-sm text-gray-600">Total Hours</div>
                    <div className="text-2xl font-bold text-baylor-green">{stats.totalHours.toFixed(1)}h</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="text-sm text-gray-600">Unique Courses</div>
                    <div className="text-2xl font-bold text-baylor-green">{stats.uniqueCourses}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="text-sm text-gray-600">Instructors</div>
                    <div className="text-2xl font-bold text-baylor-green">{stats.uniqueInstructors}</div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex">
                    {/* Time Axis */}
                    <div className="w-20 flex-shrink-0 border-r border-gray-200">
                        <div className="h-12 p-2 font-serif font-semibold text-baylor-green border-b-2 border-baylor-green bg-gray-50 flex items-center justify-center">
                            <Clock size={16} className="mr-1" /> Time
                        </div>
                        <div className="relative" style={{ height: `${totalMinutes * pixelsPerMinute}px` }}>
                            {hourTicks.map((tick) => (
                                <div
                                    key={`time-${tick}`}
                                    className="absolute w-full border-t border-gray-100"
                                    style={{ top: `${(tick - dayStartMinutes) * pixelsPerMinute}px` }}
                                >
                                    <span className="absolute -top-2.5 left-1 text-xs font-medium text-gray-500 bg-white px-1">
                                        {formatMinutesToTime(tick).replace(':00', '').replace(' ', '')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Day Columns */}
                    <div className="flex-grow flex min-w-0">
                        {dayOrder.map((dayCode) => (
                            <div key={dayCode} className="flex-1 min-w-[120px] border-r border-gray-200 last:border-r-0">
                                {/* Day Header */}
                                <div className={`h-12 p-2 text-center font-serif font-semibold border-b-2 ${currentDayCode === dayCode
                                    ? 'bg-baylor-gold/20 text-baylor-green border-baylor-gold'
                                    : 'bg-gray-50 text-baylor-green border-baylor-green'
                                    }`}>
                                    {dayNames[dayCode]}
                                </div>

                                {/* Day Body */}
                                <div className="relative" style={{ height: `${totalMinutes * pixelsPerMinute}px` }}>
                                    {/* Hour grid lines */}
                                    {hourTicks.map((tick) => (
                                        <div
                                            key={`grid-${dayCode}-${tick}`}
                                            className="absolute w-full border-t border-gray-100"
                                            style={{ top: `${(tick - dayStartMinutes) * pixelsPerMinute}px` }}
                                        />
                                    ))}

                                    {/* Current time indicator */}
                                    {currentDayCode === dayCode && nowMinutes >= dayStartMinutes && nowMinutes <= latestEndMinutes && (
                                        <div
                                            className="absolute left-0 right-0 border-t-2 border-red-500 z-20"
                                            style={{ top: `${(nowMinutes - dayStartMinutes) * pixelsPerMinute}px` }}
                                        >
                                            <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-red-500 rounded-full" />
                                        </div>
                                    )}

                                    {/* Scheduled Items */}
                                    {layoutDayEvents(roomSchedule[dayCode] || []).map((ev, index) => {
                                        const { item, lane, lanes } = ev;
                                        const baseStyle = getScheduleItemStyle(item['Start Time'], item['End Time']);
                                        if (!baseStyle) return null;

                                        const gutter = 4;
                                        const widthPct = 100 / lanes;
                                        const leftPct = widthPct * lane;

                                        const style = {
                                            ...baseStyle,
                                            left: `calc(${leftPct}% + 4px)`,
                                            width: `calc(${widthPct}% - ${gutter}px - 8px)`,
                                            right: 'auto'
                                        };

                                        const pattern = normalizePattern(getMeetingPattern(item.Course, item['Start Time'], item['End Time']) || item.Day || '');
                                        const isCurrent =
                                            currentDayCode === dayCode &&
                                            nowMinutes >= parseTime(item['Start Time']) &&
                                            nowMinutes <= parseTime(item['End Time']);

                                        return (
                                            <div
                                                key={`${dayCode}-${index}`}
                                                style={style}
                                                className={`px-2 py-1 overflow-hidden text-left text-white text-xs rounded-md shadow-sm transition-all cursor-pointer ${isCurrent
                                                    ? 'bg-baylor-gold text-baylor-green ring-2 ring-baylor-gold/40'
                                                    : 'bg-baylor-green hover:bg-baylor-gold hover:text-baylor-green'
                                                    }`}
                                                title={`${item.Course} • ${item['Start Time']} - ${item['End Time']} • ${item.Instructor}`}
                                                onClick={() => openCourseCard(item)}
                                            >
                                                <div className="font-bold truncate">{item.Course}</div>
                                                <button
                                                    className="truncate hover:underline w-full text-left"
                                                    onClick={(e) => { e.stopPropagation(); onShowContactCard?.(item.Instructor); }}
                                                >
                                                    {item.Instructor}
                                                </button>
                                                <div className="text-[0.65rem] opacity-80">
                                                    {item['Start Time']} - {item['End Time']}
                                                </div>
                                                {pattern && (
                                                    <div className="text-[0.65rem] opacity-80 font-medium">
                                                        {pattern}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

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

export default RoomCalendarView;
