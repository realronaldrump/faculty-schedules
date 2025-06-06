import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Clock, Users, Calendar, X, ChevronDown, CheckCircle } from 'lucide-react';

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
        <ChevronDown className={`w-4 h-4 text-baylor-green transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
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

const FacultyScheduleDashboard = () => {
  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfessors, setSelectedProfessors] = useState([]);
  const [meetingDuration, setMeetingDuration] = useState(60);
  const [bufferTime, setBufferTime] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState('group');
  const [selectedIndividual, setSelectedIndividual] = useState('');
  const [roomSearchDay, setRoomSearchDay] = useState('');
  const [roomSearchTime, setRoomSearchTime] = useState('');

  // State for the room finder modal
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [selectedSlotForRoomSearch, setSelectedSlotForRoomSearch] = useState(null);
  
  // **FIX**: Moved useRef to the top level of the component
  const roomModalRef = useRef(null);

  // Baylor theme styles
  const tabButtonClass = "px-4 py-2 font-medium rounded-t-lg";
  const activeTabClass = `${tabButtonClass} bg-baylor-green text-white`;
  const inactiveTabClass = `${tabButtonClass} bg-gray-100 text-gray-600 hover:bg-gray-200`;
  const cardClass = "bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4";
  const inputClass = "w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900";
  const selectClass = "w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900 appearance-none cursor-pointer hover:border-baylor-green/50 transition-colors";
  const timeInputClass = "w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900 cursor-pointer hover:border-baylor-green/50 transition-colors";
  const buttonClass = "px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors";
  const secondaryButtonClass = "px-4 py-2 bg-baylor-gold text-baylor-green font-bold rounded-lg hover:bg-baylor-gold/90 transition-colors";

  // **IMPROVEMENT**: Add effect to handle clicking outside the modal to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isRoomModalOpen && roomModalRef.current && !roomModalRef.current.contains(event.target)) {
        setIsRoomModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRoomModalOpen]);

  // Load and parse CSV data
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/HSD_Instructor_Schedules.csv');
        const csvContent = await response.text();
        
        const lines = csvContent.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        const data = lines.slice(1).flatMap(line => {
          const values = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim().replace(/"/g, ''));
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim().replace(/"/g, ''));
          
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || '';
          });

          const rooms = (obj['Room'] || '').split(';').map(r => r.trim()).filter(Boolean);
          
          if (rooms.length === 0) {
            return [obj];
          }

          return rooms.map(room => ({
            ...obj,
            Room: room,
          }));
        });
        
        setScheduleData(data);
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Utility functions
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');
    let hour, minute, ampm;
    
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      hour = parseInt(parts[0]);
      const minutePart = parts[1];
      minute = parseInt(minutePart.replace(/[^\d]/g, ''));
      ampm = cleaned.includes('pm') ? 'pm' : 'am';
    } else {
      const match = cleaned.match(/(\d+)(am|pm)/);
      if (match) {
        hour = parseInt(match[1]);
        minute = 0;
        ampm = match[2];
      } else {
        return null;
      }
    }
    
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    
    return hour * 60 + (minute || 0);
  };

  const formatMinutesToTime = (minutes) => {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
  };

  const dayNames = {
    'M': 'Monday',
    'T': 'Tuesday', 
    'W': 'Wednesday',
    'R': 'Thursday',
    'F': 'Friday'
  };

  const uniqueInstructors = useMemo(() => 
    [...new Set(scheduleData.map(item => {
      if (item.Instructor.includes('Staff')) {
        return 'Staff';
      }
      return item.Instructor;
    }))].sort()
  , [scheduleData]);

  const uniqueRooms = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Room).filter(Boolean))].sort()
  , [scheduleData]);

  const uniqueCourses = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Course))].sort()
  , [scheduleData]);

  const filteredInstructors = useMemo(() => 
    uniqueInstructors.filter(instructor => 
      instructor.toLowerCase().includes(searchTerm.toLowerCase())
    )
  , [uniqueInstructors, searchTerm]);

  const commonAvailability = useMemo(() => {
    if (selectedProfessors.length === 0) return {};

    const availability = {};
    const days = ['M', 'T', 'W', 'R', 'F'];

    days.forEach(day => {
      const busyPeriods = [];
      
      selectedProfessors.forEach(professor => {
        if (professor === 'Staff') return;
        
        const professorSchedule = scheduleData.filter(item => 
          item.Instructor === professor && item.Day === day
        );
        
        professorSchedule.forEach(item => {
          const start = parseTime(item['Start Time']);
          const end = parseTime(item['End Time']);
          if (start !== null && end !== null) {
            busyPeriods.push({ 
              start: Math.max(0, start - bufferTime), 
              end: end + bufferTime 
            });
          }
        });
      });

      busyPeriods.sort((a, b) => a.start - b.start);

      const availableSlots = [];
      const dayStart = 8 * 60;
      const dayEnd = 17 * 60;
      let currentTime = dayStart;

      busyPeriods.forEach(period => {
        if (currentTime < period.start && (period.start - currentTime) >= (meetingDuration + bufferTime)) {
          availableSlots.push({
            start: currentTime,
            end: period.start,
            duration: period.start - currentTime
          });
        }
        currentTime = Math.max(currentTime, period.end);
      });

      if (currentTime < dayEnd && (dayEnd - currentTime) >= (meetingDuration + bufferTime)) {
        availableSlots.push({
          start: currentTime,
          end: dayEnd,
          duration: dayEnd - currentTime
        });
      }
      
      const finalSlots = availableSlots.filter(slot => slot.duration >= meetingDuration);

      availability[day] = finalSlots;
    });

    return availability;
  }, [scheduleData, selectedProfessors, meetingDuration, bufferTime]);

  const getIndividualAvailability = (professor) => {
    const availability = {};
    const days = ['M', 'T', 'W', 'R', 'F'];

    days.forEach(day => {
      const professorSchedule = scheduleData.filter(item => 
        item.Instructor === professor && item.Day === day
      );

      const busyPeriodsRaw = professorSchedule.map(item => ({
        start: parseTime(item['Start Time']),
        end: parseTime(item['End Time']),
        course: item.Course,
        room: item.Room,
        title: item['Course Title']
      })).filter(period => period.start !== null && period.end !== null);

      const busyPeriodsGrouped = busyPeriodsRaw.reduce((acc, period) => {
        const key = `${period.start}-${period.end}-${period.course}`;
        if (!acc[key]) {
          acc[key] = { ...period, room: [period.room] };
        } else {
          if (!acc[key].room.includes(period.room)) {
            acc[key].room.push(period.room);
          }
        }
        return acc;
      }, {});

      const busyPeriods = Object.values(busyPeriodsGrouped).map(p => ({
        ...p,
        room: p.room.sort().join('; ')
      })).sort((a, b) => a.start - b.start);

      const availableSlots = [];
      const dayStart = 8 * 60;
      const dayEnd = 17 * 60;
      let currentTime = dayStart;

      busyPeriods.forEach(period => {
        if (currentTime < period.start && (period.start - currentTime) >= 30) {
          availableSlots.push({
            start: currentTime,
            end: period.start,
            duration: period.start - currentTime
          });
        }
        currentTime = Math.max(currentTime, period.end);
      });

      if (currentTime < dayEnd && (dayEnd - currentTime) >= 30) {
        availableSlots.push({
          start: currentTime,
          end: dayEnd,
          duration: dayEnd - currentTime
        });
      }

      availability[day] = { availableSlots, busyPeriods };
    });

    return availability;
  };
  
  const getRoomAvailabilityForSlot = (day, slot) => {
    const meetingStart = slot.start;
    const meetingEnd = meetingStart + meetingDuration;

    const busyRooms = new Set();
    scheduleData.forEach(item => {
      if (item.Day === day) {
        const classStart = parseTime(item['Start Time']);
        const classEnd = parseTime(item['End Time']);
        
        if (classStart !== null && classEnd !== null) {
          if (Math.max(classStart, meetingStart) < Math.min(classEnd, meetingEnd)) {
            busyRooms.add(item.Room);
          }
        }
      }
    });

    return uniqueRooms.filter(room => !busyRooms.has(room) && room);
  };

  const getRoomAvailability = (targetDay, targetTime) => {
    const targetMinutes = parseTime(targetTime);
    if (!targetDay || !targetTime || targetMinutes === null) return [];

    const busyRooms = new Set(
      scheduleData
        .filter(item => {
          if (item.Day !== targetDay) return false;
          const start = parseTime(item['Start Time']);
          const end = parseTime(item['End Time']);
          return start !== null && end !== null && targetMinutes >= start && targetMinutes < end;
        })
        .map(item => item.Room)
    );

    return uniqueRooms.filter(room => !busyRooms.has(room));
  };
  
  const departmentInsights = useMemo(() => {
    if (scheduleData.length === 0) return null;

    const hourCounts = {};
    for (let hour = 8; hour < 17; hour++) {
      hourCounts[hour] = 0;
    }

    scheduleData.forEach(item => {
      const start = parseTime(item['Start Time']);
      const end = parseTime(item['End Time']);
      if (start && end) {
        const startHour = Math.floor(start / 60);
        const endHour = Math.ceil(end / 60);
        for (let hour = startHour; hour < endHour; hour++) {
          if (hour >= 8 && hour < 17) {
            hourCounts[hour]++;
          }
        }
      }
    });

    const peakHour = Object.entries(hourCounts).reduce((max, [hour, count]) => 
      count > max.count ? { hour: parseInt(hour), count } : max
    , { hour: 8, count: 0 });

    const facultyWorkload = {};
    const staffTaughtCourses = new Set();
    const roomUtilization = {};
    const processedSessions = new Set(); 

    uniqueRooms.forEach(room => {
        roomUtilization[room] = { classes: 0, hours: 0, staffTaughtClasses: 0 };
    });

    scheduleData.forEach(item => {
        const instructor = item.Instructor.includes('Staff') ? 'Staff' : item.Instructor;
        const start = parseTime(item['Start Time']);
        const end = parseTime(item['End Time']);
        const duration = (start && end) ? (end - start) / 60 : 0;

        if (roomUtilization[item.Room]) {
            roomUtilization[item.Room].classes++;
            roomUtilization[item.Room].hours += duration;
            if (instructor === 'Staff') {
                roomUtilization[item.Room].staffTaughtClasses++;
            }
        }

        const sessionKey = `${item.Instructor}-${item.Course}-${item.Day}-${item['Start Time']}-${item['End Time']}`;
        
        if (processedSessions.has(sessionKey)) {
            return; 
        }
        processedSessions.add(sessionKey);

        if (instructor === 'Staff') {
            staffTaughtCourses.add(item.Course);
            return;
        }

        if (!facultyWorkload[instructor]) {
            facultyWorkload[instructor] = { courseSet: new Set(), totalHours: 0 };
        }
        facultyWorkload[instructor].courseSet.add(item.Course);
        facultyWorkload[instructor].totalHours += duration;
    });

    const finalFacultyWorkload = Object.fromEntries(
        Object.entries(facultyWorkload).map(([instructor, data]) => [
            instructor,
            {
                courses: data.courseSet.size,
                totalHours: data.totalHours
            }
        ])
    );

    return {
      peakHour,
      hourCounts,
      facultyWorkload: finalFacultyWorkload,
      roomUtilization,
      totalClassSessions: processedSessions.size,
      staffTaughtCourses: staffTaughtCourses.size,
      busiestDay: Object.entries(
        scheduleData.reduce((acc, item) => {
          acc[item.Day] = (acc[item.Day] || 0) + 1;
          return acc;
        }, {})
      ).reduce((max, [day, count]) => count > max.count ? { day, count } : max, { day: 'M', count: 0 })
    };
  }, [scheduleData, uniqueRooms]);

  const toggleProfessor = (professor) => {
    setSelectedProfessors(prev => 
      prev.includes(professor)
        ? prev.filter(p => p !== professor)
        : [...prev, professor]
    );
  };

  const findMeetingTimes = () => {
    setShowResults(true);
  };

  const handleSlotClick = (dayCode, dayName, slot) => {
    setSelectedSlotForRoomSearch({ dayCode, dayName, slot });
    setIsRoomModalOpen(true);
  };
  
  const renderRoomModal = () => {
    if (!isRoomModalOpen || !selectedSlotForRoomSearch) {
      return null;
    }

    const { dayCode, dayName, slot } = selectedSlotForRoomSearch;
    const availableRooms = getRoomAvailabilityForSlot(dayCode, slot);
    const meetingStart = slot.start;
    const meetingEnd = meetingStart + meetingDuration;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
        <div 
          ref={roomModalRef}
          className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4 transform transition-all"
        >
          <div className="flex justify-between items-center mb-4 border-b border-baylor-gold pb-3">
            <div>
              <h3 className="text-xl font-serif font-bold text-baylor-green">Available Rooms</h3>
              <p className="text-md text-gray-700">
                For <span className="font-semibold">{dayName}</span>, from <span className="font-semibold">{formatMinutesToTime(meetingStart)}</span> to <span className="font-semibold">{formatMinutesToTime(meetingEnd)}</span>
              </p>
            </div>
            <button
              onClick={() => setIsRoomModalOpen(false)}
              className="p-2 rounded-full hover:bg-gray-200"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>

          {availableRooms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2">
              {availableRooms.map(room => (
                <div key={room} className="flex items-center p-3 bg-baylor-green/5 border border-baylor-green/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-baylor-green mr-3" />
                  <span className="font-medium text-baylor-green">{room}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-2xl mb-2">😔</div>
              <p className="text-lg">No available rooms for this time slot.</p>
              <p className="text-sm">Try a different time or a shorter meeting duration.</p>
            </div>
          )}

          <div className="mt-6 text-right">
            <button
              onClick={() => setIsRoomModalOpen(false)}
              className={secondaryButtonClass}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading || !departmentInsights) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600 text-xl">Loading faculty schedules...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6 border border-gray-200">
        <div className="flex">
          {[
            { id: 'group', label: 'Group Meetings', icon: Users },
            { id: 'individual', label: 'Individual Availability', icon: Calendar },
            { id: 'rooms', label: 'Room Finder', icon: Search },
            { id: 'insights', label: 'Department Insights', icon: Clock },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setShowResults(false);
                }}
                className={activeTab === tab.id ? activeTabClass : inactiveTabClass}
              >
                <Icon className="mr-2 inline-block" size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        
        {/* Group Meeting Tab */}
        {activeTab === 'group' && (
          <>
            {!showResults ? (
              /* Setup Panel */
              <div>
                <div className={cardClass}>
                  
                  <div className="mb-8">
                    <h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 flex items-center border-b border-baylor-gold pb-2">
                      <Clock className="mr-2 text-baylor-gold" size={20} />
                      Step 1: Meeting Details
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Meeting Duration</label>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                          {[30, 60, 90, 120, 150, 180].map(duration => (
                            <button
                              key={duration}
                              onClick={() => setMeetingDuration(duration)}
                              className={`p-3 rounded-lg border text-center transition-all ${
                                meetingDuration === duration
                                  ? 'bg-baylor-green text-white border-baylor-green shadow-md'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              <div className="font-medium">{duration === 60 ? '1 hr' : duration === 120 ? '2 hrs' : `${duration}m`}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Buffer Time (before and after)</label>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                          {[0, 5, 10, 15, 20, 30].map(buffer => (
                            <button
                              key={buffer}
                              onClick={() => setBufferTime(buffer)}
                              className={`p-3 rounded-lg border text-center transition-all ${
                                bufferTime === buffer
                                  ? 'bg-baylor-gold text-baylor-green font-bold border-baylor-gold shadow-md'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              <div className="font-medium">{buffer === 0 ? 'None' : `${buffer}m`}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 flex items-center border-b border-baylor-gold pb-2">
                      <Users className="mr-2 text-baylor-gold" size={20} />
                      Step 2: Who needs to attend? ({selectedProfessors.length} selected)
                    </h2>

                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-3 text-baylor-green" size={16} />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className={inputClass}
                          placeholder="Search professors..."
                        />
                      </div>
                    </div>

                    {selectedProfessors.length > 0 && (
                      <div className="mb-4 p-4 bg-baylor-green/10 rounded-lg border border-baylor-green/20">
                        <div className="flex flex-wrap gap-2">
                          {selectedProfessors.map(professor => (
                            <span
                              key={professor}
                              className="inline-flex items-center px-3 py-1 bg-baylor-green text-white rounded-full text-sm"
                            >
                              {professor}
                              <button
                                onClick={() => toggleProfessor(professor)}
                                className="ml-2 hover:bg-baylor-green/80 rounded-full p-1"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {filteredInstructors.map(professor => (
                        <button
                          key={professor}
                          onClick={() => toggleProfessor(professor)}
                          className={`p-3 text-left rounded-lg border transition-all ${
                            selectedProfessors.includes(professor)
                              ? professor === 'Staff' 
                                ? 'bg-baylor-gold/20 border-baylor-gold text-baylor-green'
                                : 'bg-baylor-green/10 border-baylor-green text-baylor-green'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center">
                            <div className={`w-3 h-3 rounded-full mr-3 ${
                              selectedProfessors.includes(professor) 
                                ? professor === 'Staff'
                                  ? 'bg-baylor-gold'
                                  : 'bg-baylor-green'
                                : 'bg-gray-300'
                            }`}></div>
                            <span className="text-sm font-medium">
                              {professor}
                              {professor === 'Staff' && (
                                <span className="ml-2 text-xs bg-baylor-gold/20 text-baylor-green px-2 py-0.5 rounded-full">
                                  Staff
                                </span>
                              )}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={findMeetingTimes}
                      disabled={selectedProfessors.length === 0}
                      className={`px-8 py-3 rounded-lg font-bold text-lg transition-all ${
                        selectedProfessors.length > 0
                          ? 'bg-baylor-green text-white hover:bg-baylor-green/90 shadow-md'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <span className="flex items-center justify-center">
                        <Calendar className="mr-2" size={18} />
                        Find Available Times
                      </span>
                    </button>
                    {selectedProfessors.length === 0 && (
                      <p className="text-gray-500 text-sm mt-2">Select at least one professor to continue</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Results Panel */
              <div className="space-y-6">
                
                <div className={cardClass}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-serif font-semibold text-baylor-green mb-2">Meeting Times Found</h2>
                      <p className="text-gray-600 mt-1">
                        Click a time slot to find an available room for your {meetingDuration} minute meeting.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowResults(false)}
                      className={`${buttonClass} flex items-center`}
                    >
                      <span className="mr-2">←</span> Back to Setup
                    </button>
                  </div>
                  
                  <div className="mt-4 p-3 bg-baylor-green/5 rounded-lg border border-baylor-green/20">
                    <div className="flex flex-wrap gap-2">
                      {selectedProfessors.map(professor => (
                        <span key={professor} className="px-3 py-1 bg-white rounded-lg text-sm text-baylor-green border border-baylor-green/30 font-medium">
                          {professor}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  {Object.entries(dayNames).map(([dayCode, dayName]) => {
                    const slots = commonAvailability[dayCode] || [];
                    const hasSlots = slots.length > 0;
                    
                    return (
                      <div key={dayCode} className={cardClass}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-serif font-semibold text-baylor-green flex items-center">
                            <Calendar className="mr-2 text-baylor-gold" size={18} />
                            {dayName}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            hasSlots 
                              ? 'bg-baylor-green/10 text-baylor-green' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {hasSlots ? `${slots.length} slot${slots.length !== 1 ? 's' : ''}` : 'No availability'}
                          </span>
                        </div>
                        
                        {hasSlots ? (
                          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {slots.map((slot, index) => (
                              <button
                                key={index}
                                onClick={() => handleSlotClick(dayCode, dayName, slot)}
                                className="w-full text-left p-4 bg-baylor-green/5 border border-baylor-green/20 rounded-lg hover:bg-baylor-green/10 hover:shadow-md transition-all"
                              >
                                <div className="font-semibold text-baylor-green text-lg">
                                  {formatMinutesToTime(slot.start)} - {formatMinutesToTime(slot.end)}
                                </div>
                                <div className="text-sm text-baylor-green/80 mt-1">
                                  {Math.floor(slot.duration / 60)}h {slot.duration % 60}m window
                                </div>
                                <div className="text-xs text-baylor-gold font-bold mt-2">
                                  Click to Find a Room →
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <div className="text-lg">😞</div>
                            <div className="mt-2">No availability found for all participants</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="bg-baylor-gold/10 border border-baylor-gold/30 rounded-lg p-6">
                  <h3 className="font-serif font-semibold text-baylor-green mb-2 border-b border-baylor-gold/30 pb-2">
                    <span className="flex items-center">
                      📝 Schedule Summary
                    </span>
                  </h3>
                  <div className="text-baylor-green">
                    {(() => {
                      const totalSlots = Object.values(commonAvailability).reduce((sum, slots) => sum + slots.length, 0);
                      const availableDays = Object.entries(commonAvailability).filter(([_, slots]) => slots.length > 0);
                      
                      if (totalSlots === 0) {
                        return (
                          <div>
                            <strong>No common availability found.</strong> Try selecting fewer professors or reducing the meeting duration.
                          </div>
                        );
                      }
                      
                      const bestDay = availableDays.sort(([_a, slotsA], [_b, slotsB]) => slotsB.length - slotsA.length)[0];
                      
                      return (
                        <div>
                          <div className="mb-2">Found <strong>{totalSlots} total time slots</strong> across {availableDays.length} days.</div>
                          {bestDay && (
                            <div>Best option: <strong className="font-serif">{dayNames[bestDay[0]]}</strong> with {bestDay[1].length} available slots.</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Individual Availability Tab */}
        {activeTab === 'individual' && (
          <div>
            <div className={cardClass}>
              <h2 className="text-xl font-serif font-semibold text-baylor-green mb-6 border-b border-baylor-gold pb-2">Individual Professor Availability</h2>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Professor</label>
                <CustomDropdown
                  value={selectedIndividual}
                  onChange={setSelectedIndividual}
                  options={uniqueInstructors.map(instructor => ({
                    value: instructor,
                    label: instructor
                  }))}
                  placeholder="Choose a professor..."
                  className={selectClass}
                />
              </div>

              {selectedIndividual && (
                <div className="space-y-4">
                  <h3 className="text-lg font-serif font-semibold text-baylor-green border-b border-baylor-gold/50 pb-2">
                    {selectedIndividual}'s Schedule & Availability
                  </h3>
                  
                  {Object.entries(dayNames).map(([dayCode, dayName]) => {
                    const availability = getIndividualAvailability(selectedIndividual);
                    const dayData = availability[dayCode];
                    
                    return (
                      <div key={dayCode} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                        <h4 className="font-serif font-semibold text-baylor-green mb-3">{dayName}</h4>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                          {/* Busy Periods */}
                          <div>
                            <h5 className="text-sm font-medium text-baylor-green mb-2 border-b border-baylor-gold/30 pb-1">Classes & Commitments</h5>
                            {dayData.busyPeriods.length > 0 ? (
                              <div className="space-y-2">
                                {dayData.busyPeriods.map((period, index) => (
                                  <div key={index} className="bg-baylor-gold/5 border border-baylor-gold/30 rounded-lg p-3">
                                    <div className="font-medium text-baylor-green">
                                      {formatMinutesToTime(period.start)} - {formatMinutesToTime(period.end)}
                                    </div>
                                    <div className="text-sm text-baylor-green/80">{period.course} - {period.title}</div>
                                    <div className="text-xs text-gray-500">{period.room}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-gray-500 text-sm">No scheduled classes</div>
                            )}
                          </div>

                          {/* Available Periods */}
                          <div>
                            <h5 className="text-sm font-medium text-baylor-green mb-2 border-b border-baylor-gold/30 pb-1">Available Time Slots</h5>
                            {dayData.availableSlots.length > 0 ? (
                              <div className="space-y-2">
                                {dayData.availableSlots.map((slot, index) => (
                                  <div key={index} className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-3">
                                    <div className="font-medium text-baylor-green">
                                      {formatMinutesToTime(slot.start)} - {formatMinutesToTime(slot.end)}
                                    </div>
                                    <div className="text-sm text-baylor-green/80">
                                      {Math.floor(slot.duration / 60)}h {slot.duration % 60}m available
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-gray-500 text-sm">No gaps in schedule</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Room Finder Tab */}
        {activeTab === 'rooms' && (
          <div>
            <div className={cardClass}>
              <h2 className="text-xl font-serif font-semibold text-baylor-green mb-6 border-b border-baylor-gold pb-2">Room Availability Finder</h2>
              
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Day</label>
                  <CustomDropdown
                    value={roomSearchDay}
                    onChange={setRoomSearchDay}
                    options={Object.entries(dayNames).map(([code, name]) => ({
                      value: code,
                      label: name
                    }))}
                    placeholder="Select day..."
                    className={selectClass}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <div className="relative">
                    <input
                      type="time"
                      value={roomSearchTime}
                      onChange={(e) => setRoomSearchTime(e.target.value)}
                      className={timeInputClass}
                      min="08:00"
                      max="17:00"
                      step="1800"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                      <Clock className="w-4 h-4 text-baylor-green" />
                    </div>
                  </div>
                </div>
              </div>

              {roomSearchDay && roomSearchTime && (
                <div>
                  <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4 border-b border-baylor-gold/30 pb-2">
                    Available Rooms - {dayNames[roomSearchDay]} at {roomSearchTime}
                  </h3>
                  
                  {(() => {
                    const availableRooms = getRoomAvailability(roomSearchDay, roomSearchTime);
                    return (
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {availableRooms.length > 0 ? (
                          availableRooms.map(room => (
                            <div key={room} className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-4 hover:bg-baylor-green/10 transition-colors">
                              <div className="font-medium text-baylor-green">{room}</div>
                              <div className="text-sm text-baylor-green/80 mt-1">Available</div>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-full text-center py-8 text-gray-500">
                            <div className="text-lg">🚫</div>
                            <div className="mt-2">No rooms available at this time</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Department Insights Tab */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className={`${cardClass} transition-transform hover:scale-105`}>
                <div className="text-2xl font-bold text-baylor-green">{uniqueInstructors.length}</div>
                <div className="text-gray-600 font-serif">Faculty Members</div>
              </div>
              <div className={`${cardClass} transition-transform hover:scale-105`}>
                <div className="text-2xl font-bold text-baylor-green">{departmentInsights.totalClassSessions}</div>
                <div className="text-gray-600 font-serif">Weekly Class Sessions</div>
                <div className="text-sm text-baylor-gold mt-1 font-medium">
                  {departmentInsights.staffTaughtCourses} staff-taught
                </div>
              </div>
              <div className={`${cardClass} transition-transform hover:scale-105`}>
                <div className="text-2xl font-bold text-baylor-green">{uniqueRooms.length}</div>
                <div className="text-gray-600 font-serif">Classrooms</div>
              </div>
              <div className={`${cardClass} transition-transform hover:scale-105`}>
                <div className="text-2xl font-bold text-baylor-green">
                  {formatMinutesToTime(departmentInsights.peakHour.hour * 60)}
                </div>
                <div className="text-gray-600 font-serif">Peak Hour</div>
              </div>
            </div>

            <div className={cardClass}>
              <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4 border-b border-baylor-gold/30 pb-2">Hourly Room Usage</h3>
              <div className="space-y-2">
                {Object.entries(departmentInsights.hourCounts).map(([hour, count]) => {
                  const maxCount = Math.max(...Object.values(departmentInsights.hourCounts));
                  const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  
                  return (
                    <div key={hour} className="flex items-center">
                      <div className="w-20 text-sm text-baylor-green font-medium">
                        {formatMinutesToTime(parseInt(hour) * 60)}
                      </div>
                      <div className="flex-1 mx-4">
                        <div className="bg-gray-200 rounded-full h-5">
                          <div 
                            className="bg-baylor-green h-5 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="w-24 text-sm text-baylor-green font-medium text-right">{count} rooms used</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={cardClass}>
              <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4 border-b border-baylor-gold/30 pb-2">Room Utilization</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(departmentInsights.roomUtilization)
                  .sort(([,a], [,b]) => b.hours - a.hours)
                  .slice(0, 12)
                  .map(([room, data]) => (
                  <div key={room} className="border border-baylor-green/20 rounded-lg p-4 bg-baylor-green/5 hover:bg-baylor-green/10 transition-all">
                    <div className="font-medium text-baylor-green text-sm mb-2">{room}</div>
                    <div className="text-lg font-bold text-baylor-green">{data.hours.toFixed(1)}h</div>
                    <div className="text-sm text-baylor-green/80">
                      {data.classes} sessions/week
                      {data.staffTaughtClasses > 0 && (
                        <span className="ml-2 text-baylor-gold font-medium">
                          ({data.staffTaughtClasses} staff)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={cardClass}>
              <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4 border-b border-baylor-gold/30 pb-2">Faculty Teaching Load</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-baylor-green/5">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-serif font-semibold text-baylor-green">Professor</th>
                      <th className="px-4 py-3 text-left text-sm font-serif font-semibold text-baylor-green">Unique Courses</th>
                      <th className="px-4 py-3 text-left text-sm font-serif font-semibold text-baylor-green">Weekly Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-baylor-green/10">
                    {Object.entries(departmentInsights.facultyWorkload)
                      .sort(([,a], [,b]) => b.totalHours - a.totalHours)
                      .slice(0, 10)
                      .map(([instructor, data]) => (
                      <tr key={instructor} className="hover:bg-baylor-green/5 transition-colors">
                        <td className="px-4 py-3 text-sm text-baylor-green font-medium">{instructor}</td>
                        <td className="px-4 py-3 text-sm text-baylor-green/80">{data.courses}</td>
                        <td className="px-4 py-3 text-sm text-baylor-green/80 font-bold">{data.totalHours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* **FIX**: Render modal using a helper function to keep the main return clean */}
      {renderRoomModal()}

    </div>
  );
};

export default FacultyScheduleDashboard;