import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Clock, Users, Calendar, X, ChevronDown, CheckCircle, ArrowUpDown, ChevronsUpDown, BarChart2, Eye, Edit, Save, Trash2, History, RotateCcw } from 'lucide-react';

// Custom Dropdown Component
const CustomDropdown = ({ value, onChange, options, placeholder, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${className} flex items-center justify-between w-full text-left`}
      >
        <span className="block truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronsUpDown className={`w-4 h-4 text-baylor-green transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2 text-left hover:bg-baylor-green/10 transition-colors ${
                option.value === value ? 'bg-baylor-green text-white' : 'text-gray-900'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const FacultyScheduleDashboard = ({ scheduleData, editHistory, onDataUpdate, onRevertChange, loading, onNavigate }) => {
  // Core State
  const [activeTab, setActiveTab] = useState('group');
  const [showWarning, setShowWarning] = useState(() => localStorage.getItem('insightsWarningDismissed') !== 'true');

  // Group Meeting State
  const [selectedProfessors, setSelectedProfessors] = useState([]);
  const [meetingDuration, setMeetingDuration] = useState(60);
  const [bufferTime, setBufferTime] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  
  // Individual Availability State
  const [selectedIndividual, setSelectedIndividual] = useState('');

  // Room Schedule State
  const [roomScheduleDay, setRoomScheduleDay] = useState('M');
  
  // Data Management State
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [historyVisible, setHistoryVisible] = useState(false);

  // Modal States
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [selectedSlotForRoomSearch, setSelectedSlotForRoomSearch] = useState(null);
  const roomModalRef = useRef(null);
  const [isDrillDownModalOpen, setIsDrillDownModalOpen] = useState(false);
  const [drillDownModalContent, setDrillDownModalContent] = useState({ title: '', data: [], columns: [], component: null });
  const drillDownModalRef = useRef(null);

  // Insights Tab State
  const [facultySort, setFacultySort] = useState({ key: 'totalHours', direction: 'desc' });
  const [roomSort, setRoomSort] = useState({ key: 'hours', direction: 'desc' });
  const [hourlyUsageDayFilter, setHourlyUsageDayFilter] = useState('All');

  // Baylor theme styles
  const tabButtonClass = "px-4 py-2 font-medium rounded-t-lg transition-colors";
  const activeTabClass = `${tabButtonClass} bg-baylor-green text-white`;
  const inactiveTabClass = `${tabButtonClass} bg-gray-100 text-gray-600 hover:bg-gray-200`;
  const cardClass = "bg-white border border-gray-200 rounded-lg shadow-sm p-4";
  const inputClass = "w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900";
  const selectClass = "w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900 appearance-none cursor-pointer hover:border-baylor-green/50 transition-colors";
  const buttonClass = "px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed";
  const secondaryButtonClass = "px-4 py-2 bg-baylor-gold text-baylor-green font-bold rounded-lg hover:bg-baylor-gold/90 transition-colors";
  const editInputClass = "w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green";

  // Effect to handle clicking outside modals
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isRoomModalOpen && roomModalRef.current && !roomModalRef.current.contains(event.target)) setIsRoomModalOpen(false);
      if (isDrillDownModalOpen && drillDownModalRef.current && !drillDownModalRef.current.contains(event.target)) setIsDrillDownModalOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRoomModalOpen, isDrillDownModalOpen]);

  // Utility functions
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');
    let hour, minute, ampm;
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':'); hour = parseInt(parts[0]);
      minute = parseInt(parts[1].replace(/[^\d]/g, '')); ampm = cleaned.includes('pm') ? 'pm' : 'am';
    } else {
      const match = cleaned.match(/(\d+)(am|pm)/);
      if (match) { hour = parseInt(match[1]); minute = 0; ampm = match[2]; } else return null;
    }
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return hour * 60 + (minute || 0);
  };

  const formatMinutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60); const m = minutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  // Memoized data derivations
  const uniqueInstructors = useMemo(() => [...new Set(scheduleData.map(item => item.Instructor.includes('Staff') ? 'Staff' : item.Instructor))].sort(), [scheduleData]);
  const uniqueRooms = useMemo(() => [...new Set(scheduleData.map(item => item.Room).filter(Boolean))].filter(room => room.toLowerCase() !== 'online').sort(), [scheduleData]);
  const filteredInstructors = useMemo(() => uniqueInstructors.filter(instructor => instructor.toLowerCase().includes(searchTerm.toLowerCase())), [uniqueInstructors, searchTerm]);
  
  const commonAvailability = useMemo(() => {
    if (selectedProfessors.length === 0) return {};
    const availability = {};
    const days = ['M', 'T', 'W', 'R', 'F'];
    days.forEach(day => {
      const busyPeriods = [];
      selectedProfessors.forEach(professor => {
        if (professor === 'Staff') return;
        scheduleData.filter(item => item.Instructor === professor && item.Day === day).forEach(item => {
          const start = parseTime(item['Start Time']); const end = parseTime(item['End Time']);
          if (start !== null && end !== null) busyPeriods.push({ start: Math.max(0, start - bufferTime), end: end + bufferTime });
        });
      });
      busyPeriods.sort((a, b) => a.start - b.start);
      const availableSlots = [];
      const dayStart = 8 * 60, dayEnd = 17 * 60; let currentTime = dayStart;
      busyPeriods.forEach(period => {
        if (currentTime < period.start && (period.start - currentTime) >= (meetingDuration + bufferTime)) availableSlots.push({ start: currentTime, end: period.start, duration: period.start - currentTime });
        currentTime = Math.max(currentTime, period.end);
      });
      if (currentTime < dayEnd && (dayEnd - currentTime) >= (meetingDuration + bufferTime)) availableSlots.push({ start: currentTime, end: dayEnd, duration: dayEnd - currentTime });
      availability[day] = availableSlots.filter(slot => slot.duration >= meetingDuration);
    });
    return availability;
  }, [scheduleData, selectedProfessors, meetingDuration, bufferTime]);

  const getIndividualAvailability = (professor) => {
    const availability = {};
    ['M', 'T', 'W', 'R', 'F'].forEach(day => {
      const professorSchedule = scheduleData.filter(item => item.Instructor === professor && item.Day === day);
      const busyPeriodsRaw = professorSchedule.map(item => ({ start: parseTime(item['Start Time']), end: parseTime(item['End Time']), course: item.Course, room: item.Room, title: item['Course Title'] })).filter(p => p.start !== null && p.end !== null);
      const busyPeriodsGrouped = busyPeriodsRaw.reduce((acc, period) => {
        const key = `${period.start}-${period.end}-${period.course}`;
        if (!acc[key]) acc[key] = { ...period, room: [period.room] };
        else if (!acc[key].room.includes(period.room)) acc[key].room.push(period.room);
        return acc;
      }, {});
      const busyPeriods = Object.values(busyPeriodsGrouped).map(p => ({ ...p, room: p.room.sort().join('; ') })).sort((a, b) => a.start - b.start);
      const availableSlots = [];
      const dayStart = 8 * 60, dayEnd = 17 * 60; let currentTime = dayStart;
      busyPeriods.forEach(period => {
        if (currentTime < period.start && (period.start - currentTime) >= 30) availableSlots.push({ start: currentTime, end: period.start, duration: period.start - currentTime });
        currentTime = Math.max(currentTime, period.end);
      });
      if (currentTime < dayEnd && (dayEnd - currentTime) >= 30) availableSlots.push({ start: currentTime, end: dayEnd, duration: dayEnd - currentTime });
      availability[day] = { availableSlots, busyPeriods };
    });
    return availability;
  };
  
  const departmentInsights = useMemo(() => {
    if (scheduleData.length === 0) return null;
    const facultyWorkload = {}; const staffTaughtCourses = new Set();
    const roomUtilization = {}; const processedSessions = new Set();
    uniqueRooms.forEach(room => { roomUtilization[room] = { classes: 0, hours: 0, staffTaughtClasses: 0 }; });
    scheduleData.forEach(item => {
      const instructor = item.Instructor.includes('Staff') ? 'Staff' : item.Instructor;
      const start = parseTime(item['Start Time']), end = parseTime(item['End Time']);
      const duration = (start && end) ? (end - start) / 60 : 0;
      if (roomUtilization[item.Room]) {
        roomUtilization[item.Room].classes++; roomUtilization[item.Room].hours += duration;
        if (instructor === 'Staff') roomUtilization[item.Room].staffTaughtClasses++;
      }
      const sessionKey = `${item.Instructor}-${item.Course}-${item.Day}-${item['Start Time']}-${item['End Time']}`;
      if (processedSessions.has(sessionKey)) return;
      processedSessions.add(sessionKey);
      if (instructor === 'Staff') { staffTaughtCourses.add(item.Course); return; }
      if (!facultyWorkload[instructor]) facultyWorkload[instructor] = { courseSet: new Set(), totalHours: 0 };
      facultyWorkload[instructor].courseSet.add(item.Course); facultyWorkload[instructor].totalHours += duration;
    });
    const finalFacultyWorkload = Object.fromEntries(Object.entries(facultyWorkload).map(([i, d]) => [i, { courses: d.courseSet.size, totalHours: d.totalHours }]));
    return { facultyWorkload: finalFacultyWorkload, roomUtilization, totalClassSessions: processedSessions.size, staffTaughtCourses: staffTaughtCourses.size };
  }, [scheduleData, uniqueRooms]);

  const filteredHourCounts = useMemo(() => {
    const dataToProcess = hourlyUsageDayFilter === 'All' ? scheduleData : scheduleData.filter(item => item.Day === hourlyUsageDayFilter);
    if (dataToProcess.length === 0) {
      const emptyCounts = {}; for (let hour = 8; hour <= 17; hour++) emptyCounts[hour] = 0;
      return { hourCounts: emptyCounts, latestEndTime: 17 * 60, peakHour: { hour: 8, count: 0 } };
    }
    let latestEndTime = 17 * 60;
    dataToProcess.forEach(item => { const end = parseTime(item['End Time']); if (end && end > latestEndTime) latestEndTime = end; });
    const hourCounts = {};
    for (let hour = 8; hour <= Math.ceil(latestEndTime / 60); hour++) hourCounts[hour] = 0;
    dataToProcess.forEach(item => {
      const start = parseTime(item['Start Time']), end = parseTime(item['End Time']);
      if (start && end) {
        const startHour = Math.floor(start / 60), endHour = Math.ceil(end / 60);
        for (let hour = startHour; hour < endHour; hour++) if (hourCounts.hasOwnProperty(hour)) hourCounts[hour]++;
      }
    });
    const peakHour = Object.entries(hourCounts).reduce((max, [h, c]) => c > max.count ? { hour: parseInt(h), count: c } : max, { hour: 8, count: 0 });
    return { hourCounts, latestEndTime, peakHour };
  }, [scheduleData, hourlyUsageDayFilter]);

  const dailyRoomSchedules = useMemo(() => {
    const schedules = {};
    uniqueRooms.forEach(room => {
      schedules[room] = scheduleData
        .filter(item => item.Room === room && item.Day === roomScheduleDay && item['Start Time'] && item['End Time'])
        .reduce((acc, item) => { // Deduplicate identical sessions (e.g., cross-listed courses)
          const key = `${item.Course}-${item['Start Time']}-${item['End Time']}`;
          if (!acc.some(i => `${i.Course}-${i['Start Time']}-${i['End Time']}` === key)) {
            acc.push(item);
          }
          return acc;
        }, [])
        .sort((a, b) => parseTime(a['Start Time']) - parseTime(b['Start Time']));
    });
    return schedules;
  }, [scheduleData, uniqueRooms, roomScheduleDay]);
  
  const sortedFacultyWorkload = useMemo(() => {
    if (!departmentInsights) return [];
    const { key, direction } = facultySort;
    return Object.entries(departmentInsights.facultyWorkload).sort(([profA, dataA], [profB, dataB]) => {
      let valA, valB;
      if (key === 'name') { valA = profA; valB = profB; } else { valA = dataA[key]; valB = dataB[key]; }
      if (valA < valB) return direction === 'asc' ? -1 : 1; if (valA > valB) return direction === 'asc' ? 1 : -1; return 0;
    });
  }, [departmentInsights, facultySort]);

  const sortedRoomUtilization = useMemo(() => {
    if (!departmentInsights) return [];
    const { key, direction } = roomSort;
    return Object.entries(departmentInsights.roomUtilization).sort(([roomA, dataA], [roomB, dataB]) => {
      let valA, valB;
      if (key === 'name') { valA = roomA; valB = roomB; } else { valA = dataA[key]; valB = dataB[key]; }
      if (valA < valB) return direction === 'asc' ? -1 : 1; if (valA > valB) return direction === 'asc' ? 1 : -1; return 0;
    });
  }, [departmentInsights, roomSort]);

  // Event Handlers
  const toggleProfessor = (professor) => setSelectedProfessors(prev => prev.includes(professor) ? prev.filter(p => p !== professor) : [...prev, professor]);
  const findMeetingTimes = () => setShowResults(true);
  const handleSlotClick = (dayCode, dayName, slot) => { setSelectedSlotForRoomSearch({ dayCode, dayName, slot }); setIsRoomModalOpen(true); };
  
  const handleDrillDown = (type, identifier, context) => {
    let title = '', data = [], columns = [], component = null;

    switch (type) {
      case 'individualSchedule':
        title = `Weekly Schedule: ${identifier}`;
        component = <IndividualScheduleView professor={identifier} />;
        break;
      case 'groupDaySchedule':
        title = `Daily Schedules for ${dayNames[context.dayCode]}`;
        component = <GroupDayScheduleView professors={context.professors} dayCode={context.dayCode} />;
        break;
      case 'courseDetails':
        const courseInfo = scheduleData.find(item => item.Course === identifier);
        title = `Details for ${identifier}: ${courseInfo ? courseInfo['Course Title'] : ''}`;
        columns = [{ key: 'Instructor', label: 'Instructor' }, { key: 'Day', label: 'Day' }, { key: 'Start Time', label: 'Start' }, { key: 'End Time', label: 'End' }, { key: 'Room', label: 'Room' }];
        data = scheduleData.filter(item => item.Course === identifier);
        break;
      case 'facultyList':
        title = 'All Faculty Members'; columns = [{ key: 'name', label: 'Name' }];
        data = uniqueInstructors.filter(i => i !== 'Staff').map(name => ({name}));
        break;
      case 'faculty':
        title = `Teaching Load: ${identifier}`;
        columns = [{ key: 'Course', label: 'Course' }, { key: 'Course Title', label: 'Title' }, { key: 'Day', label: 'Day' }, { key: 'Start Time', label: 'Start' }, { key: 'End Time', label: 'End' }, { key: 'Room', label: 'Room' }];
        data = scheduleData.filter(item => item.Instructor === identifier).sort((a,b) => a.Course.localeCompare(b.Course));
        break;
      case 'roomList':
        title = 'All Classrooms'; columns = [{ key: 'name', label: 'Room Name' }];
        data = uniqueRooms.map(name => ({name}));
        break;
      case 'room':
        title = `Schedule for Room: ${identifier} on ${dayNames[context?.day] || 'All Week'}`;
        columns = [{ key: 'Day', label: 'Day' }, { key: 'Start Time', label: 'Start' }, { key: 'End Time', 'label': 'End' }, { key: 'Course', label: 'Course' }, { key: 'Instructor', label: 'Instructor' }];
        data = scheduleData.filter(item => item.Room === identifier && (context?.day ? item.Day === context.day : true)).sort((a,b) => (Object.keys(dayNames).indexOf(a.Day) - Object.keys(dayNames).indexOf(b.Day)) || (parseTime(a['Start Time']) - parseTime(b['Start Time'])));
        break;
      case 'hourly':
        const hour = parseInt(identifier); const dayFilter = context;
        const timeStart = hour * 60; const timeEnd = timeStart + 60;
        const dayString = dayFilter === 'All' ? 'Weekly' : `on ${dayNames[dayFilter]}`;
        title = `Classes ${dayString} Between ${formatMinutesToTime(timeStart)} - ${formatMinutesToTime(timeEnd)}`;
        columns = [{ key: 'Room', label: 'Room' }, { key: 'Course', label: 'Course' }, { key: 'Instructor', label: 'Instructor' }, { key: 'Day', label: 'Day' }, { key: 'Start Time', label: 'Start' }, { key: 'End Time', label: 'End' }];
        data = scheduleData.filter(item => {
            const classStart = parseTime(item['Start Time']); const classEnd = parseTime(item['End Time']);
            const timeMatch = classStart !== null && classEnd !== null && Math.max(classStart, timeStart) < Math.min(classEnd, timeEnd);
            const dayMatch = dayFilter === 'All' || item.Day === dayFilter;
            return timeMatch && dayMatch;
        }).sort((a,b) => a.Room.localeCompare(b.Room));
        break;
      case 'totalSessions':
        title = 'All Weekly Class Sessions';
        columns = [{ key: 'Course', label: 'Course' }, { key: 'Instructor', label: 'Instructor' }, { key: 'Day', label: 'Day' }, { key: 'Start Time', label: 'Time' }, { key: 'Room', label: 'Room' }];
        data = scheduleData.sort((a,b) => a.Course.localeCompare(b.Course));
        break;
      default: return;
    }
    setDrillDownModalContent({ title, data, columns, component });
    setIsDrillDownModalOpen(true);
  };

  const handleFacultySort = (key) => setFacultySort(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));

  const handleDismissWarning = () => {
    setShowWarning(false);
    localStorage.setItem('insightsWarningDismissed', 'true');
  };

  const handleEditClick = (row) => { setEditingRowId(row.id); setEditFormData(row); };
  const handleEditCancel = () => { setEditingRowId(null); setEditFormData({}); };
  const handleEditSave = () => { onDataUpdate(editFormData); setEditingRowId(null); };
  const handleEditFormChange = (e) => setEditFormData({ ...editFormData, [e.target.name]: e.target.value });

  // Sub-components for rendering
  const SortableHeader = ({ label, sortKey, currentSort, onSort }) => {
    const isActive = currentSort.key === sortKey;
    const Icon = isActive ? (currentSort.direction === 'asc' ? '▲' : '▼') : <ChevronsUpDown size={14} className="inline-block text-gray-400" />;
    return <th className="px-4 py-3 text-left text-sm font-serif font-semibold text-baylor-green"><button className="flex items-center gap-2" onClick={() => onSort(sortKey)}>{label}<span className="w-4">{Icon}</span></button></th>;
  };
  
  const IndividualScheduleView = ({ professor }) => {
    const availability = getIndividualAvailability(professor);
    return <div className="space-y-4">{Object.entries(dayNames).map(([dayCode, dayName]) => <DaySchedule key={dayCode} dayName={dayName} dayData={availability[dayCode]} />)}</div>;
  };

  const GroupDayScheduleView = ({ professors, dayCode }) => {
    return <div className="space-y-6">{professors.map(prof => <div key={prof}><h4 className="font-serif font-semibold text-baylor-green mb-2">{prof}</h4><DaySchedule dayName={dayNames[dayCode]} dayData={getIndividualAvailability(prof)[dayCode]} /></div>)}</div>;
  };
  
  const DaySchedule = ({ dayName, dayData }) => (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
      <h4 className="font-serif font-semibold text-baylor-green mb-3">{dayName}</h4>
      <div className="grid md:grid-cols-2 gap-4">
        <div><h5 className="text-sm font-medium text-baylor-green mb-2 border-b border-baylor-gold/30 pb-1">Classes & Commitments</h5>{dayData.busyPeriods.length > 0 ? <div className="space-y-2">{dayData.busyPeriods.map((p, i) => <div key={i} className="bg-baylor-gold/5 border border-baylor-gold/30 rounded-lg p-3"><div className="font-medium text-baylor-green">{formatMinutesToTime(p.start)} - {formatMinutesToTime(p.end)}</div><div className="text-sm text-baylor-green/80">{p.course} - {p.title}</div><div className="text-xs text-gray-500">{p.room}</div></div>)}</div> : <div className="text-gray-500 text-sm p-3">No scheduled classes</div>}</div>
        <div><h5 className="text-sm font-medium text-baylor-green mb-2 border-b border-baylor-gold/30 pb-1">Available Time Slots</h5>{dayData.availableSlots.length > 0 ? <div className="space-y-2">{dayData.availableSlots.map((s, i) => <div key={i} className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-3"><div className="font-medium text-baylor-green">{formatMinutesToTime(s.start)} - {formatMinutesToTime(s.end)}</div><div className="text-sm text-baylor-green/80">{Math.floor(s.duration / 60)}h {s.duration % 60}m available</div></div>)}</div> : <div className="text-gray-500 text-sm p-3">No gaps in schedule</div>}</div>
      </div>
    </div>
  );

  const renderRoomModal = () => {
    if (!isRoomModalOpen || !selectedSlotForRoomSearch) return null;
    const { dayCode, dayName, slot } = selectedSlotForRoomSearch;
    const meetingStart = slot.start, meetingEnd = meetingStart + meetingDuration;
    const availableRooms = uniqueRooms.filter(room => !scheduleData.some(item => item.Day === dayCode && item.Room === room && Math.max(parseTime(item['Start Time']), meetingStart) < Math.min(parseTime(item['End Time']), meetingEnd)));
    return <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in"><div ref={roomModalRef} className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4"><div className="flex justify-between items-center mb-4 border-b border-baylor-gold pb-3"><div><h3 className="text-xl font-serif font-bold text-baylor-green">Available Rooms</h3><p className="text-md text-gray-700">For <span className="font-semibold">{dayName}</span>, from <span className="font-semibold">{formatMinutesToTime(meetingStart)}</span> to <span className="font-semibold">{formatMinutesToTime(meetingEnd)}</span></p></div><button onClick={() => setIsRoomModalOpen(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={20} className="text-gray-600" /></button></div>{availableRooms.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2">{availableRooms.map(room => <div key={room} className="flex items-center p-3 bg-baylor-green/5 border border-baylor-green/20 rounded-lg"><CheckCircle className="w-5 h-5 text-baylor-green mr-3" /><span className="font-medium text-baylor-green">{room}</span></div>)}</div> : <div className="text-center py-12 text-gray-500"><div className="text-2xl mb-2">😔</div><p className="text-lg">No available rooms for this time slot.</p><p className="text-sm">Try a different time or a shorter meeting duration.</p></div>}<div className="mt-6 text-right"><button onClick={() => setIsRoomModalOpen(false)} className={secondaryButtonClass}>Close</button></div></div></div>;
  };

  const renderDrillDownModal = () => {
    if (!isDrillDownModalOpen) return null;
    const { title, data, columns, component } = drillDownModalContent;
    return <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in"><div ref={drillDownModalRef} className="bg-white rounded-xl shadow-2xl p-6 max-w-4xl w-full mx-4 flex flex-col" style={{maxHeight: '90vh'}}><div className="flex justify-between items-center mb-4 border-b border-baylor-gold pb-3 flex-shrink-0"><h3 className="text-xl font-serif font-bold text-baylor-green">{title}</h3><button onClick={() => setIsDrillDownModalOpen(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={20} className="text-gray-600" /></button></div><div className="overflow-y-auto flex-grow pr-2">{component ? component : (data.length > 0 ? <table className="w-full text-sm">
      <thead className="sticky top-0 bg-white shadow-sm"><tr>{columns.map(col => <th key={col.key} className="px-4 py-3 text-left font-serif font-semibold text-baylor-green bg-baylor-green/5">{col.label}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-200">{data.map((row, index) => <tr key={index} className="hover:bg-baylor-green/5">{columns.map(col => <td key={col.key} className="px-4 py-3 text-gray-700">{row[col.key]}</td>)}</tr>)}</tbody>
    </table> : <div className="text-center py-12 text-gray-500"><p className="text-lg">No detailed data to display.</p></div>)}</div><div className="mt-6 text-right flex-shrink-0"><button onClick={() => setIsDrillDownModalOpen(false)} className={secondaryButtonClass}>Close</button></div></div></div>;
  };
  
  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600 text-xl">Loading faculty schedules...</div></div>;

  const dayStart = 8 * 60; // 8:00 AM
  const dayEnd = 18 * 60; // 6:00 PM
  const totalMinutes = dayEnd - dayStart;
  const timeLabels = Array.from({length: (dayEnd - dayStart) / 60 + 1}, (_, i) => dayStart + i * 60);

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6 border border-gray-200">
        <div className="flex flex-wrap">
          {[ { id: 'group', label: 'Group Meetings', icon: Users }, { id: 'individual', label: 'Individual Availability', icon: Calendar }, { id: 'rooms', label: 'Room Schedule', icon: Search }, { id: 'insights', label: 'Department Insights', icon: BarChart2 }, { id: 'data', label: 'Data Management', icon: Edit } ].map(tab => {
            const Icon = tab.icon;
            return <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowResults(false); }} className={`${activeTab === tab.id ? activeTabClass : inactiveTabClass} flex-grow`}><Icon className="mr-2 inline-block" size={16} />{tab.label}</button>;
          })}
        </div>
      </div>

      <div className="space-y-6">
        {activeTab === 'group' && (
          <>{!showResults ? (<div className={cardClass}>
            <div className="mb-8"><h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 flex items-center border-b border-baylor-gold pb-2"><Clock className="mr-2 text-baylor-gold" size={20} />Step 1: Meeting Details</h2><div className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-2">Meeting Duration</label><div className="grid grid-cols-3 md:grid-cols-6 gap-3">{[30, 60, 90, 120, 150, 180].map(d => <button key={d} onClick={() => setMeetingDuration(d)} className={`p-3 rounded-lg border text-center transition-all ${meetingDuration === d ? 'bg-baylor-green text-white border-baylor-green shadow-md' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}><div className="font-medium">{d === 60 ? '1 hr' : d === 120 ? '2 hrs' : `${d}m`}</div></button>)}</div></div><div><label className="block text-sm font-medium text-gray-700 mb-2">Buffer Time (before and after)</label><div className="grid grid-cols-3 md:grid-cols-6 gap-3">{[0, 5, 10, 15, 20, 30].map(b => <button key={b} onClick={() => setBufferTime(b)} className={`p-3 rounded-lg border text-center transition-all ${bufferTime === b ? 'bg-baylor-gold text-baylor-green font-bold border-baylor-gold shadow-md' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}><div className="font-medium">{b === 0 ? 'None' : `${b}m`}</div></button>)}</div></div></div></div>
            <div className="mb-8"><h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 flex items-center border-b border-baylor-gold pb-2"><Users className="mr-2 text-baylor-gold" size={20} />Step 2: Who needs to attend? ({selectedProfessors.length} selected)</h2><div className="mb-4"><div className="relative"><Search className="absolute left-3 top-3 text-baylor-green" size={16} /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`${inputClass} pl-10`} placeholder="Search professors..." /></div></div>{selectedProfessors.length > 0 && <div className="mb-4 p-4 bg-baylor-green/10 rounded-lg border border-baylor-green/20"><div className="flex flex-wrap gap-2">{selectedProfessors.map(p => <span key={p} className="inline-flex items-center px-3 py-1 bg-baylor-green text-white rounded-full text-sm">{p}<button onClick={() => toggleProfessor(p)} className="ml-2 hover:bg-baylor-green/80 rounded-full p-1"><X size={12} /></button></span>)}</div></div>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">{filteredInstructors.map(p => <div key={p} className={`p-3 rounded-lg border transition-all flex justify-between items-center ${selectedProfessors.includes(p) ? (p === 'Staff' ? 'bg-baylor-gold/20 border-baylor-gold text-baylor-green' : 'bg-baylor-green/10 border-baylor-green text-baylor-green') : 'bg-white border-gray-200'}`}><button onClick={() => toggleProfessor(p)} className="flex items-center flex-grow text-left"><div className={`w-3 h-3 rounded-full mr-3 ${selectedProfessors.includes(p) ? (p === 'Staff' ? 'bg-baylor-gold' : 'bg-baylor-green') : 'bg-gray-300'}`}></div><span className="text-sm font-medium">{p}</span></button>{p !== 'Staff' && <button onClick={(e) => { e.stopPropagation(); handleDrillDown('individualSchedule', p); }} className="p-1 rounded-full hover:bg-baylor-green/20"><Eye size={16} className="text-baylor-green" /></button>}</div>)}</div></div>
            <div className="text-center"><button onClick={findMeetingTimes} disabled={selectedProfessors.length === 0} className={`${buttonClass} px-8 py-3 rounded-lg font-bold text-lg shadow-md`}><span className="flex items-center justify-center"><Calendar className="mr-2" size={18} />Find Available Times</span></button>{selectedProfessors.length === 0 && <p className="text-gray-500 text-sm mt-2">Select at least one faculty member to continue</p>}</div>
          </div>) : (<div className="space-y-6">
            <div className={cardClass}><div className="flex items-center justify-between"><h2 className="text-xl font-serif font-semibold text-baylor-green mb-2">Meeting Times Found</h2><button onClick={() => setShowResults(false)} className={`${buttonClass} flex items-center`}><span className="mr-2">←</span> Back to Setup</button></div><div className="mt-4 p-3 bg-baylor-green/5 rounded-lg border border-baylor-green/20"><div className="flex flex-wrap gap-2">{selectedProfessors.map(p => <span key={p} className="px-3 py-1 bg-white rounded-lg text-sm text-baylor-green border border-baylor-green/30 font-medium">{p}</span>)}</div></div></div>
            <div className="grid gap-4">{Object.entries(dayNames).map(([dayCode, dayName]) => { const slots = commonAvailability[dayCode] || []; return (<div key={dayCode} className={cardClass}><div className="flex items-center justify-between mb-4"><h3 className="text-lg font-serif font-semibold text-baylor-green flex items-center"><Calendar className="mr-2 text-baylor-gold" size={18} />{dayName}</h3><div className="flex items-center gap-2"><button onClick={() => handleDrillDown('groupDaySchedule', null, { professors: selectedProfessors, dayCode })} className="text-xs font-semibold text-baylor-green hover:underline">View Daily Schedules</button><span className={`px-3 py-1 rounded-full text-sm font-medium ${slots.length > 0 ? 'bg-baylor-green/10 text-baylor-green' : 'bg-red-100 text-red-800'}`}>{slots.length > 0 ? `${slots.length} slot${slots.length !== 1 ? 's' : ''}` : 'No availability'}</span></div></div>{slots.length > 0 ? <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{slots.map((s, i) => <button key={i} onClick={() => handleSlotClick(dayCode, dayName, s)} className="w-full text-left p-4 bg-baylor-green/5 border border-baylor-green/20 rounded-lg hover:bg-baylor-green/10 hover:shadow-md transition-all"><div className="font-semibold text-baylor-green text-lg">{formatMinutesToTime(s.start)} - {formatMinutesToTime(s.end)}</div><div className="text-sm text-baylor-green/80 mt-1">{Math.floor(s.duration / 60)}h {s.duration % 60}m window</div><div className="text-xs text-baylor-gold font-bold mt-2">Click to Find a Room →</div></button>)}</div> : <div className="text-center py-8 text-gray-500"><div className="text-lg">😞</div><div className="mt-2">No availability found for all participants</div></div>}</div>);})}</div>
          </div>)}</>
        )}
        {activeTab === 'individual' && (<div className={cardClass}><h2 className="text-xl font-serif font-semibold text-baylor-green mb-6 border-b border-baylor-gold pb-2">Individual Professor Availability</h2><div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-2">Select Professor</label><CustomDropdown value={selectedIndividual} onChange={setSelectedIndividual} options={uniqueInstructors.map(i => ({ value: i, label: i }))} placeholder="Choose a professor..." className={selectClass} /></div>{selectedIndividual && <div className="space-y-4"><h3 className="text-lg font-serif font-semibold text-baylor-green border-b border-baylor-gold/50 pb-2">{selectedIndividual}'s Schedule & Availability</h3>{Object.entries(dayNames).map(([dayCode, dayName]) => { const dayData = getIndividualAvailability(selectedIndividual)[dayCode]; return (<div key={dayCode} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm"><h4 className="font-serif font-semibold text-baylor-green mb-3">{dayName}</h4><div className="grid md:grid-cols-2 gap-4"><div><h5 className="text-sm font-medium text-baylor-green mb-2 border-b border-baylor-gold/30 pb-1">Classes & Commitments</h5>{dayData.busyPeriods.length > 0 ? <div className="space-y-2">{dayData.busyPeriods.map((p, i) => <button key={i} onClick={() => handleDrillDown('courseDetails', p.course)} className="w-full text-left bg-baylor-gold/5 border border-baylor-gold/30 rounded-lg p-3 hover:bg-baylor-gold/10 focus:outline-none focus:ring-2 focus:ring-baylor-gold"><div className="font-medium text-baylor-green">{formatMinutesToTime(p.start)} - {formatMinutesToTime(p.end)}</div><div className="text-sm text-baylor-green/80">{p.course} - {p.title}</div><div className="text-xs text-gray-500">{p.room}</div></button>)}</div> : <div className="text-gray-500 text-sm p-3">No scheduled classes</div>}</div><div><h5 className="text-sm font-medium text-baylor-green mb-2 border-b border-baylor-gold/30 pb-1">Available Time Slots</h5>{dayData.availableSlots.length > 0 ? <div className="space-y-2">{dayData.availableSlots.map((s, i) => <div key={i} className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-3"><div className="font-medium text-baylor-green">{formatMinutesToTime(s.start)} - {formatMinutesToTime(s.end)}</div><div className="text-sm text-baylor-green/80">{Math.floor(s.duration / 60)}h {s.duration % 60}m available</div></div>)}</div> : <div className="text-gray-500 text-sm p-3">No gaps in schedule</div>}</div></div></div>); })}</div>}</div>
        )}
        {activeTab === 'rooms' && (
          <div className={cardClass}>
            <h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 border-b border-baylor-gold pb-2">Room Schedule Matrix</h2>
            <div className="flex items-center justify-center gap-1 bg-gray-100 p-1 rounded-lg mb-4">
              {Object.entries(dayNames).map(([dayCode, dayName]) => (
                <button key={dayCode} onClick={() => setRoomScheduleDay(dayCode)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors w-full ${roomScheduleDay === dayCode ? 'bg-baylor-green text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>
                  {dayName}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
                <div className="relative">
                    {/* Timeline Header */}
                    <div className="flex sticky top-0 bg-white z-10 border-b-2 border-baylor-green">
                        <div className="w-40 flex-shrink-0 font-semibold p-2 text-baylor-green">Room</div>
                        <div className="flex-grow flex">
                            {timeLabels.slice(0, -1).map(time => (
                                <div key={time} style={{width: `${(60 / totalMinutes) * 100}%`}} className="text-center text-xs font-medium p-2 border-l border-gray-200">
                                    {formatMinutesToTime(time).replace(':00','')}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Room Rows */}
                    {uniqueRooms.map(room => (
                        <div key={room} className="relative flex items-center border-t border-gray-200" style={{ height: '50px' }}>
                            <div className="w-40 flex-shrink-0 font-medium p-2 text-sm text-baylor-green self-start">{room}</div>
                            <div className="absolute top-0 left-40 right-0 h-full bg-gray-50/50">
                                {/* Grid lines */}
                                {timeLabels.slice(1, -1).map(time => (
                                    <div key={time} style={{ left: `${((time - dayStart) / totalMinutes) * 100}%` }} className="absolute top-0 bottom-0 w-px bg-gray-200"></div>
                                ))}
                                {/* Scheduled Items */}
                                {dailyRoomSchedules[room].map(item => {
                                    const start = parseTime(item['Start Time']);
                                    const end = parseTime(item['End Time']);
                                    if (start === null || end === null || end <= start) return null;

                                    const left = Math.max(0, ((start - dayStart) / totalMinutes) * 100);
                                    const width = (((end - start) / totalMinutes) * 100);

                                    if (end < dayStart || start > dayEnd) return null;

                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => handleDrillDown('courseDetails', item.Course)}
                                            style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: '4px', bottom: '4px' }}
                                            className="px-2 py-0 overflow-hidden text-left text-white text-xs rounded-md bg-baylor-green hover:bg-baylor-gold hover:text-baylor-green shadow-sm transition-all"
                                        >
                                            <div className="font-bold truncate">{item.Course}</div>
                                            <div className="truncate">{item.Instructor}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        )}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            {showWarning && (
              <div className="bg-baylor-gold/10 border border-baylor-gold/30 rounded-lg p-4 text-baylor-green relative">
                <button 
                  onClick={handleDismissWarning}
                  className="absolute top-2 right-2 p-1 hover:bg-baylor-gold/20 rounded-full transition-colors"
                  aria-label="Dismiss warning"
                >
                  <X size={16} className="text-baylor-green" />
                </button>
                <p className="text-sm font-medium pr-6">
                  Note: This data (and app!) is still being refined and may not reflect the final schedule. Please verify any critical information with the department and official University{' '}
                  <button 
                    onClick={() => onNavigate('systems')}
                    className="text-baylor-gold hover:text-baylor-green underline transition-colors"
                  >
                    systems
                  </button>.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <button onClick={() => handleDrillDown('facultyList')} className={`${cardClass} text-left transition-transform hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-baylor-gold`}><div className="text-2xl font-bold text-baylor-green">{uniqueInstructors.filter(i => i !== 'Staff').length}</div><div className="text-gray-600 font-serif">Faculty Members</div></button>
              <button onClick={() => handleDrillDown('totalSessions')} className={`${cardClass} text-left transition-transform hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-baylor-gold`}><div className="text-2xl font-bold text-baylor-green">{departmentInsights.totalClassSessions}</div><div className="text-gray-600 font-serif">Weekly Class Sessions</div><div className="text-sm text-baylor-gold mt-1 font-medium">{departmentInsights.staffTaughtCourses} staff-taught</div></button>
              <button onClick={() => handleDrillDown('roomList')} className={`${cardClass} text-left transition-transform hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-baylor-gold`}><div className="text-2xl font-bold text-baylor-green">{uniqueRooms.length}</div><div className="text-gray-600 font-serif">Classrooms</div></button>
              <div className={`${cardClass}`}><div className="text-2xl font-bold text-baylor-green">{formatMinutesToTime(filteredHourCounts.peakHour.hour * 60)}</div><div className="text-gray-600 font-serif">Peak Hour{hourlyUsageDayFilter !== 'All' && ` (${hourlyUsageDayFilter})`}</div></div>
            </div>

            <div className={`${cardClass} mb-0`}>
              <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 border-b border-baylor-gold/30 pb-2 gap-4">
                <div><h3 className="text-lg font-serif font-semibold text-baylor-green">Hourly Room Usage</h3><span className="text-sm font-normal text-baylor-green/80">Showing until {formatMinutesToTime(filteredHourCounts.latestEndTime)}</span></div>
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                    {['All', 'M', 'T', 'W', 'R', 'F'].map(day => (<button key={day} onClick={() => setHourlyUsageDayFilter(day)} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${hourlyUsageDayFilter === day ? 'bg-baylor-green text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>{day === 'All' ? 'All' : dayNames[day].substring(0,3)}</button>))}
                </div>
              </div>
              <div className="space-y-2">{Object.entries(filteredHourCounts.hourCounts).map(([hour, count]) => { const maxCount = Math.max(...Object.values(filteredHourCounts.hourCounts), 1); return (<button key={hour} onClick={() => handleDrillDown('hourly', hour, hourlyUsageDayFilter)} className="flex items-center w-full text-left group p-1 rounded-md hover:bg-baylor-gold/10"><div className="w-20 text-sm text-baylor-green font-medium">{formatMinutesToTime(parseInt(hour) * 60)}</div><div className="flex-1 mx-4"><div className="bg-gray-200 rounded-full h-5"><div className="bg-baylor-green h-5 rounded-full transition-all duration-500 group-hover:bg-baylor-gold" style={{ width: `${(count / maxCount) * 100}%` }}></div></div></div><div className="w-24 text-sm text-baylor-green font-medium text-right">{count} rooms used</div></button>)})}</div>
            </div>

            <div className={`${cardClass} mb-0`}>
              <div className="flex justify-between items-center mb-4 border-b border-baylor-gold/30 pb-2">
                  <h3 className="text-lg font-serif font-semibold text-baylor-green">Room Utilization</h3>
                  <div className="flex items-center gap-2"><CustomDropdown value={roomSort.key} onChange={(key) => setRoomSort({ ...roomSort, key })} options={[{value: 'name', label: 'Sort by Name'}, {value: 'hours', label: 'Sort by Busiest'}, {value: 'classes', label: 'Sort by Sessions'}]} className="text-sm p-1 border border-gray-300 rounded-md bg-white"/><button onClick={() => setRoomSort(s => ({...s, direction: s.direction === 'asc' ? 'desc' : 'asc'}))} className="p-1.5 border border-gray-300 rounded-md hover:bg-gray-100"><ArrowUpDown size={14} className="text-gray-600" /></button></div>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{sortedRoomUtilization.map(([room, data]) => (<button key={room} onClick={() => handleDrillDown('room', room)} className="border border-baylor-green/20 rounded-lg p-4 bg-baylor-green/5 hover:bg-baylor-green/10 hover:shadow-md transition-all text-left focus:outline-none focus:ring-2 focus:ring-baylor-gold"><div className="font-medium text-baylor-green text-sm mb-2">{room}</div><div className="text-lg font-bold text-baylor-green">{data.hours.toFixed(1)}h</div><div className="text-sm text-baylor-green/80">{data.classes} sessions/week {data.staffTaughtClasses > 0 && <span className="ml-2 text-baylor-gold font-medium">({data.staffTaughtClasses} staff)</span>}</div></button>))}</div>
            </div>

            <div className={`${cardClass} mb-0`}>
              <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4 border-b border-baylor-gold/30 pb-2">Faculty Teaching Load</h3>
              <div className="overflow-x-auto"><table className="w-full"><thead className="bg-baylor-green/5"><tr><SortableHeader label="Professor" sortKey="name" currentSort={facultySort} onSort={handleFacultySort} /><SortableHeader label="Unique Courses" sortKey="courses" currentSort={facultySort} onSort={handleFacultySort} /><SortableHeader label="Weekly Hours" sortKey="totalHours" currentSort={facultySort} onSort={handleFacultySort} /></tr></thead><tbody className="divide-y divide-baylor-green/10">{sortedFacultyWorkload.map(([instructor, data]) => (<tr key={instructor} onClick={() => handleDrillDown('faculty', instructor)} className="hover:bg-baylor-green/5 transition-colors cursor-pointer"><td className="px-4 py-3 text-sm text-baylor-green font-medium">{instructor}</td><td className="px-4 py-3 text-sm text-baylor-green/80 text-center">{data.courses}</td><td className="px-4 py-3 text-sm text-baylor-green/80 font-bold text-center">{data.totalHours.toFixed(1)}</td></tr>))}</tbody></table></div>
            </div>
          </div>
        )}
        {activeTab === 'data' && (
          <div className={cardClass}>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 border-b border-baylor-gold pb-2 gap-4">
              <h2 className="text-xl font-serif font-semibold text-baylor-green">Manage Schedule Data</h2>
              <button onClick={() => setHistoryVisible(!historyVisible)} className={`${secondaryButtonClass} text-sm flex items-center`}>
                <History size={16} className="mr-2" />
                {historyVisible ? 'Hide' : 'Show'} Change History ({editHistory.length})
              </button>
            </div>

            {historyVisible && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-lg font-serif font-semibold text-baylor-green mb-3">Change History</h3>
                {editHistory.length > 0 ? (
                  <ul className="space-y-3 max-h-96 overflow-y-auto">
                    {editHistory.map((change, index) => (
                      <li key={index} className={`p-3 rounded-lg flex items-center justify-between text-sm ${change.isRevert ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'} border`}>
                        <div>
                          <p className="font-medium text-gray-800">
                            <span className="font-bold">{change.instructor}</span>'s <span className="font-bold">{change.course}</span> entry updated.
                          </p>
                          <p className="text-gray-600">
                            Field <span className="font-semibold">{change.field}</span> changed from "{change.oldValue}" to "{change.newValue}".
                          </p>
                          <p className="text-xs text-gray-500 mt-1">{new Date(change.timestamp).toLocaleString()}</p>
                        </div>
                        {!change.isRevert && (
                          <button onClick={() => onRevertChange(change, index)} className="p-2 rounded-full text-gray-600 hover:bg-gray-200 transition-colors">
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-gray-500">No changes have been made yet.</p>}
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-baylor-green/5">
                  <tr>
                    {['Instructor', 'Course', 'Course Title', 'Day', 'Start Time', 'End Time', 'Room', ''].map(h => <th key={h} className="px-2 py-3 text-left font-serif font-semibold text-baylor-green">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {scheduleData.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      {editingRowId === row.id ? (
                        <>
                          <td className="p-1"><input name="Instructor" value={editFormData.Instructor} onChange={handleEditFormChange} className={editInputClass} /></td>
                          <td className="p-1"><input name="Course" value={editFormData.Course} onChange={handleEditFormChange} className={editInputClass} /></td>
                          <td className="p-1"><input name="Course Title" value={editFormData['Course Title']} onChange={handleEditFormChange} className={editInputClass} /></td>
                          <td className="p-1"><input name="Day" value={editFormData.Day} onChange={handleEditFormChange} className={editInputClass} /></td>
                          <td className="p-1"><input name="Start Time" value={editFormData['Start Time']} onChange={handleEditFormChange} className={editInputClass} /></td>
                          <td className="p-1"><input name="End Time" value={editFormData['End Time']} onChange={handleEditFormChange} className={editInputClass} /></td>
                          <td className="p-1"><input name="Room" value={editFormData.Room} onChange={handleEditFormChange} className={editInputClass} /></td>
                          <td className="p-1 text-right">
                            <div className="flex gap-2">
                              <button onClick={handleEditSave} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><Save size={16} /></button>
                              <button onClick={handleEditCancel} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-2 text-gray-700">{row.Instructor}</td>
                          <td className="px-2 py-2 text-gray-700">{row.Course}</td>
                          <td className="px-2 py-2 text-gray-700">{row['Course Title']}</td>
                          <td className="px-2 py-2 text-gray-700">{row.Day}</td>
                          <td className="px-2 py-2 text-gray-700">{row['Start Time']}</td>
                          <td className="px-2 py-2 text-gray-700">{row['End Time']}</td>
                          <td className="px-2 py-2 text-gray-700">{row.Room}</td>
                          <td className="px-2 py-2 text-right">
                            <button onClick={() => handleEditClick(row)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {renderRoomModal()}
      {renderDrillDownModal()}
    </div>
  );
};

export default FacultyScheduleDashboard;