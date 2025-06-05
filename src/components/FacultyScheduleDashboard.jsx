import React, { useState, useMemo, useEffect } from 'react';
import { Search, Clock, Users, Calendar, X } from 'lucide-react';

const FacultyScheduleDashboard = () => {
  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfessors, setSelectedProfessors] = useState([]);
  const [meetingDuration, setMeetingDuration] = useState(60);
  const [bufferTime, setBufferTime] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState('group'); // group, individual, rooms, insights, courses
  const [selectedIndividual, setSelectedIndividual] = useState('');
  const [roomSearchDay, setRoomSearchDay] = useState('');
  const [roomSearchTime, setRoomSearchTime] = useState('');

  // Load and parse CSV data
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/HSD_Instructor_Schedules.csv');
        const csvContent = await response.text();
        
        const lines = csvContent.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        // Use flatMap to handle rows with multiple rooms (separated by ';')
        // This "unrolls" the data, creating a separate row for each room in a multi-room class.
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

          // Split rooms by semicolon and create a distinct record for each.
          const rooms = (obj['Room'] || '').split(';').map(r => r.trim()).filter(Boolean);
          
          if (rooms.length === 0) {
            // If no room is specified, return the object as is in an array for flatMap
            return [obj];
          }

          // Map each room name to a new object, effectively unrolling the data.
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

  // Get unique values for different analyses
  const uniqueInstructors = useMemo(() => 
    [...new Set(scheduleData.map(item => {
      if (item.Instructor.includes('Staff')) {
        return 'Staff';
      }
      return item.Instructor;
    }))].sort()
  , [scheduleData]);

  // uniqueRooms is now correctly populated with individual room names due to the data unrolling.
  const uniqueRooms = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Room).filter(Boolean))].sort()
  , [scheduleData]);

  const uniqueCourses = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Course))].sort()
  , [scheduleData]);

  // Filter instructors by search
  const filteredInstructors = useMemo(() => 
    uniqueInstructors.filter(instructor => 
      instructor.toLowerCase().includes(searchTerm.toLowerCase())
    )
  , [uniqueInstructors, searchTerm]);

  // Find common availability
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
      const dayStart = 8 * 60; // 8:00 AM
      const dayEnd = 17 * 60; // 5:00 PM
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

  // Individual professor availability
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

      // Group periods by time/course to combine multi-room entries for cleaner display
      const busyPeriodsGrouped = busyPeriodsRaw.reduce((acc, period) => {
        const key = `${period.start}-${period.end}-${period.course}`;
        if (!acc[key]) {
          acc[key] = { ...period, room: [period.room] };
        } else {
          // Add room to existing entry if not already present
          if (!acc[key].room.includes(period.room)) {
            acc[key].room.push(period.room);
          }
        }
        return acc;
      }, {});

      const busyPeriods = Object.values(busyPeriodsGrouped).map(p => ({
        ...p,
        room: p.room.sort().join('; ') // Join rooms back for display
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

  // Room availability analysis
  const getRoomAvailability = (targetDay, targetTime) => {
    const targetMinutes = parseTime(targetTime);
    if (!targetDay || !targetTime || targetMinutes === null) return [];

    // Because data is unrolled, we can simply check which rooms are busy at the target time.
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

  // Department insights
  const departmentInsights = useMemo(() => {
    if (scheduleData.length === 0) return null;

    // Peak hours analysis (now more accurate as it counts each room's usage)
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

    // --- New Workload, Session, and Utilization Logic ---
    const facultyWorkload = {};
    const staffTaughtCourses = new Set();
    const roomUtilization = {};
    const processedSessions = new Set(); // Use a Set to avoid double-counting hours for multi-room classes

    // Initialize room utilization
    uniqueRooms.forEach(room => {
        roomUtilization[room] = { classes: 0, hours: 0, staffTaughtClasses: 0 };
    });

    scheduleData.forEach(item => {
        const instructor = item.Instructor.includes('Staff') ? 'Staff' : item.Instructor;
        const start = parseTime(item['Start Time']);
        const end = parseTime(item['End Time']);
        const duration = (start && end) ? (end - start) / 60 : 0;

        // --- Room Utilization (correctly calculated from unrolled data) ---
        if (roomUtilization[item.Room]) {
            roomUtilization[item.Room].classes++;
            roomUtilization[item.Room].hours += duration;
            if (instructor === 'Staff') {
                roomUtilization[item.Room].staffTaughtClasses++;
            }
        }

        // --- Session & Workload Processing ---
        // A unique session is defined by instructor, course, day, and time.
        const sessionKey = `${item.Instructor}-${item.Course}-${item.Day}-${item['Start Time']}-${item['End Time']}`;
        
        // If we've already processed this exact session, skip to avoid inflating workload hours.
        if (processedSessions.has(sessionKey)) {
            return; 
        }
        processedSessions.add(sessionKey);

        if (instructor === 'Staff') {
            staffTaughtCourses.add(item.Course);
            return; // Don't add to faculty workload
        }

        if (!facultyWorkload[instructor]) {
            facultyWorkload[instructor] = { courseSet: new Set(), totalHours: 0 };
        }
        // Add course to a Set to count unique courses per instructor
        facultyWorkload[instructor].courseSet.add(item.Course);
        facultyWorkload[instructor].totalHours += duration;
    });

    // Finalize faculty workload by getting the size of the unique course set
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
      totalClassSessions: processedSessions.size, // Correct count of unique class meetings
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

  if (loading || !departmentInsights) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600 text-xl">Loading faculty schedules...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Faculty Schedule Manager</h1>
          <p className="text-gray-600 mt-1">Comprehensive scheduling tools for your department</p>
          
          {/* Tab Navigation */}
          <div className="mt-4 border-b border-gray-200">
            <nav className="flex space-x-8">
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
                    className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="mr-2" size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        
        {/* Group Meeting Tab */}
        {activeTab === 'group' && (
          <>
            {!showResults ? (
              /* Setup Panel */
              <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border p-8">
                  
                  {/* Step 1: Meeting Duration */}
                  <div className="mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Clock className="mr-2 text-blue-500" size={20} />
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
                                  ? 'bg-blue-500 text-white border-blue-500 shadow-md'
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
                                  ? 'bg-green-500 text-white border-green-500 shadow-md'
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

                  {/* Step 2: Professor Selection */}
                  <div className="mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Users className="mr-2 text-green-500" size={20} />
                      Step 2: Who needs to attend? ({selectedProfessors.length} selected)
                    </h2>

                    {/* Search */}
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Search professors..."
                        />
                      </div>
                    </div>

                    {/* Selected Professors */}
                    {selectedProfessors.length > 0 && (
                      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                        <div className="flex flex-wrap gap-2">
                          {selectedProfessors.map(professor => (
                            <span
                              key={professor}
                              className="inline-flex items-center px-3 py-1 bg-blue-500 text-white rounded-full text-sm"
                            >
                              {professor}
                              <button
                                onClick={() => toggleProfessor(professor)}
                                className="ml-2 hover:bg-blue-600 rounded-full p-1"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Professor Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                      {filteredInstructors.map(professor => (
                        <button
                          key={professor}
                          onClick={() => toggleProfessor(professor)}
                          className={`p-3 text-left rounded-lg border transition-all ${
                            selectedProfessors.includes(professor)
                              ? professor === 'Staff' 
                                ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
                                : 'bg-green-50 border-green-300 text-green-800'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center">
                            <div className={`w-3 h-3 rounded-full mr-3 ${
                              selectedProfessors.includes(professor) 
                                ? professor === 'Staff'
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                                : 'bg-gray-300'
                            }`}></div>
                            <span className="text-sm font-medium">
                              {professor}
                              {professor === 'Staff' && (
                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                                  Staff
                                </span>
                              )}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Find Button */}
                  <div className="text-center">
                    <button
                      onClick={findMeetingTimes}
                      disabled={selectedProfessors.length === 0}
                      className={`px-8 py-3 rounded-lg font-medium text-lg transition-all ${
                        selectedProfessors.length > 0
                          ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Find Available Times
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
                
                {/* Results Header */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Meeting Times Found</h2>
                      <p className="text-gray-600 mt-1">
                        {meetingDuration} minute slots when all {selectedProfessors.length} selected professors are available
                      </p>
                    </div>
                    <button
                      onClick={() => setShowResults(false)}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      ← Back to Setup
                    </button>
                  </div>
                  
                  {/* Selected Professors Summary */}
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex flex-wrap gap-2">
                      {selectedProfessors.map(professor => (
                        <span key={professor} className="px-2 py-1 bg-white rounded text-sm text-gray-700 border">
                          {professor}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Results Grid */}
                <div className="grid gap-4">
                  {Object.entries(dayNames).map(([dayCode, dayName]) => {
                    const slots = commonAvailability[dayCode] || [];
                    const hasSlots = slots.length > 0;
                    
                    return (
                      <div key={dayCode} className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            <Calendar className="mr-2 text-blue-500" size={18} />
                            {dayName}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            hasSlots 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {hasSlots ? `${slots.length} slot${slots.length !== 1 ? 's' : ''}` : 'No availability'}
                          </span>
                        </div>
                        
                        {hasSlots ? (
                          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {slots.map((slot, index) => (
                              <div key={index} className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                <div className="font-semibold text-green-800 text-lg">
                                  {formatMinutesToTime(slot.start)} - {formatMinutesToTime(slot.end)}
                                </div>
                                <div className="text-sm text-green-600 mt-1">
                                  {Math.floor(slot.duration / 60)}h {slot.duration % 60}m window
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <div className="text-lg">😞</div>
                            <div className="mt-2">Everyone has conflicts this day</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                  <h3 className="font-semibold text-blue-900 mb-2">📝 Summary</h3>
                  <div className="text-blue-800">
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
                            <div>Best option: <strong>{dayNames[bestDay[0]]}</strong> with {bestDay[1].length} available slots.</div>
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
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Individual Professor Availability</h2>
              
              {/* Professor Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Professor</label>
                <select
                  value={selectedIndividual}
                  onChange={(e) => setSelectedIndividual(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Choose a professor...</option>
                  {uniqueInstructors.map(instructor => (
                    <option key={instructor} value={instructor}>{instructor}</option>
                  ))}
                </select>
              </div>

              {/* Results */}
              {selectedIndividual && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedIndividual}'s Schedule & Availability
                  </h3>
                  
                  {Object.entries(dayNames).map(([dayCode, dayName]) => {
                    const availability = getIndividualAvailability(selectedIndividual);
                    const dayData = availability[dayCode];
                    
                    return (
                      <div key={dayCode} className="border border-gray-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-800 mb-3">{dayName}</h4>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                          {/* Busy Periods */}
                          <div>
                            <h5 className="text-sm font-medium text-red-800 mb-2">Classes & Commitments</h5>
                            {dayData.busyPeriods.length > 0 ? (
                              <div className="space-y-2">
                                {dayData.busyPeriods.map((period, index) => (
                                  <div key={index} className="bg-red-50 border border-red-200 rounded p-3">
                                    <div className="font-medium text-red-800">
                                      {formatMinutesToTime(period.start)} - {formatMinutesToTime(period.end)}
                                    </div>
                                    <div className="text-sm text-red-600">{period.course} - {period.title}</div>
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
                            <h5 className="text-sm font-medium text-green-800 mb-2">Available Time Slots</h5>
                            {dayData.availableSlots.length > 0 ? (
                              <div className="space-y-2">
                                {dayData.availableSlots.map((slot, index) => (
                                  <div key={index} className="bg-green-50 border border-green-200 rounded p-3">
                                    <div className="font-medium text-green-800">
                                      {formatMinutesToTime(slot.start)} - {formatMinutesToTime(slot.end)}
                                    </div>
                                    <div className="text-sm text-green-600">
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
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Room Availability Finder</h2>
              
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Day</label>
                  <select
                    value={roomSearchDay}
                    onChange={(e) => setRoomSearchDay(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select day...</option>
                    {Object.entries(dayNames).map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <input
                    type="time"
                    value={roomSearchTime}
                    onChange={(e) => setRoomSearchTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {roomSearchDay && roomSearchTime && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Available Rooms - {dayNames[roomSearchDay]} at {roomSearchTime}
                  </h3>
                  
                  {(() => {
                    const availableRooms = getRoomAvailability(roomSearchDay, roomSearchTime);
                    return (
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {availableRooms.length > 0 ? (
                          availableRooms.map(room => (
                            <div key={room} className="bg-green-50 border border-green-200 rounded-lg p-4">
                              <div className="font-medium text-green-800">{room}</div>
                              <div className="text-sm text-green-600 mt-1">Available</div>
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
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="text-2xl font-bold text-blue-600">{uniqueInstructors.length}</div>
                <div className="text-gray-600">Faculty Members</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="text-2xl font-bold text-green-600">{departmentInsights.totalClassSessions}</div>
                <div className="text-gray-600">Weekly Class Sessions</div>
                <div className="text-sm text-gray-500 mt-1">
                  {departmentInsights.staffTaughtCourses} staff-taught
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="text-2xl font-bold text-purple-600">{uniqueRooms.length}</div>
                <div className="text-gray-600">Classrooms</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="text-2xl font-bold text-orange-600">
                  {formatMinutesToTime(departmentInsights.peakHour.hour * 60)}
                </div>
                <div className="text-gray-600">Peak Hour</div>
              </div>
            </div>

            {/* Peak Hours Chart */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Hourly Room Usage</h3>
              <div className="space-y-2">
                {Object.entries(departmentInsights.hourCounts).map(([hour, count]) => {
                  const maxCount = Math.max(...Object.values(departmentInsights.hourCounts));
                  const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  
                  return (
                    <div key={hour} className="flex items-center">
                      <div className="w-20 text-sm text-gray-600">
                        {formatMinutesToTime(parseInt(hour) * 60)}
                      </div>
                      <div className="flex-1 mx-4">
                        <div className="bg-gray-200 rounded-full h-4">
                          <div 
                            className="bg-blue-500 h-4 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="w-16 text-sm text-gray-600 text-right">{count} rooms used</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Room Utilization */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Room Utilization</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(departmentInsights.roomUtilization)
                  .sort(([,a], [,b]) => b.hours - a.hours)
                  .slice(0, 12)
                  .map(([room, data]) => (
                  <div key={room} className="border border-gray-200 rounded-lg p-4">
                    <div className="font-medium text-gray-900 text-sm mb-2">{room}</div>
                    <div className="text-lg font-bold text-blue-600">{data.hours.toFixed(1)}h</div>
                    <div className="text-sm text-gray-600">
                      {data.classes} sessions/week
                      {data.staffTaughtClasses > 0 && (
                        <span className="ml-2 text-yellow-600">
                          ({data.staffTaughtClasses} staff)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Faculty Workload */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Faculty Teaching Load</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Professor</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Unique Courses</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Weekly Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {Object.entries(departmentInsights.facultyWorkload)
                      .sort(([,a], [,b]) => b.totalHours - a.totalHours)
                      .slice(0, 10)
                      .map(([instructor, data]) => (
                      <tr key={instructor} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{instructor}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{data.courses}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{data.totalHours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacultyScheduleDashboard;