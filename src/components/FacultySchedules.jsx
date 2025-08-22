import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Calendar, Clock, Search, ChevronDown, ChevronsUpDown, Grid, List, Plus, X, Eye, Info, Building, BookOpen, Users, GraduationCap } from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';

const FacultySchedules = ({ scheduleData, facultyData }) => {
  const [selectedFaculty, setSelectedFaculty] = useState([]);
  const [viewMode, setViewMode] = useState('timeline');
  const [selectedDays, setSelectedDays] = useState(['M', 'T', 'W', 'R', 'F']);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isProgramDropdownOpen, setIsProgramDropdownOpen] = useState(false);
  const [programSearchTerm, setProgramSearchTerm] = useState('');
  const [showAdjuncts, setShowAdjuncts] = useState(true);

  const facultyDropdownRef = useRef(null);
  const programDropdownRef = useRef(null);

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  const handleDayToggle = (dayCode) => {
    setSelectedDays(prev => 
      prev.includes(dayCode) 
        ? prev.filter(d => d !== dayCode) 
        : [...prev, dayCode]
    );
  };

  // Utility functions
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

  // Get unique instructors (filtered by adjunct preference)
  const uniqueInstructors = useMemo(() => {
    const instructorNames = [...new Set(scheduleData.map(item => {
      if (item.instructor) {
        return `${item.instructor.firstName || ''} ${item.instructor.lastName || ''}`.trim();
      }
      return item.Instructor || item.instructorName || '';
    }))].filter(i => i !== '');
    
    // Filter out adjuncts if showAdjuncts is false
    if (!showAdjuncts) {
      return instructorNames.filter(instructorName => {
        const faculty = facultyData.find(f => f.name === instructorName);
        return faculty && !faculty.isAdjunct;
      }).sort();
    }
    
    return instructorNames.sort();
  }, [scheduleData, facultyData, showAdjuncts]);

  const filteredInstructors = useMemo(() => 
    uniqueInstructors.filter(instructor => 
      instructor.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [uniqueInstructors, searchTerm]
  );

  // Get unique programs from faculty data (filtered by adjunct preference)
  const uniquePrograms = useMemo(() => {
    const programs = new Set();
    facultyData.forEach(faculty => {
      // Skip adjuncts if showAdjuncts is false
      if (!showAdjuncts && faculty.isAdjunct) {
        return;
      }
      if (faculty.program && faculty.program.name) {
        programs.add(faculty.program.name);
      }
    });
    return Array.from(programs).sort();
  }, [facultyData, showAdjuncts]);

  const filteredPrograms = useMemo(() => 
    uniquePrograms.filter(program => 
      program.toLowerCase().includes(programSearchTerm.toLowerCase())
    ),
    [uniquePrograms, programSearchTerm]
  );

  // Get faculty names by program (filtered by adjunct preference)
  const getFacultyByProgram = (programName) => {
    return facultyData
      .filter(faculty => {
        // Skip adjuncts if showAdjuncts is false
        if (!showAdjuncts && faculty.isAdjunct) {
          return false;
        }
        return faculty.program && faculty.program.name === programName;
      })
      .map(faculty => faculty.name)
      .filter(name => uniqueInstructors.includes(name)); // Only include faculty with schedules
  };

  // Handle adding all faculty from a program
  const handleAddProgramFaculty = (programName) => {
    const programFaculty = getFacultyByProgram(programName);
    const newFaculty = programFaculty.filter(name => !selectedFaculty.includes(name));
    
    if (newFaculty.length === 0) {
      // All faculty from this program are already selected
      return;
    }
    
    setSelectedFaculty(prev => [...prev, ...newFaculty]);
    setIsProgramDropdownOpen(false);
    setProgramSearchTerm('');
    
    // Show a brief notification (you can replace this with your notification system)
    console.log(`Added ${newFaculty.length} faculty from ${programName} program`);
  };

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (facultyDropdownRef.current && !facultyDropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (programDropdownRef.current && !programDropdownRef.current.contains(event.target)) {
        setIsProgramDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Remove adjunct faculty from selected list when adjunct filter is disabled
  useEffect(() => {
    if (!showAdjuncts) {
      const adjunctFaculty = selectedFaculty.filter(facultyName => {
        const faculty = facultyData.find(f => f.name === facultyName);
        return faculty && faculty.isAdjunct;
      });
      
      if (adjunctFaculty.length > 0) {
        setSelectedFaculty(prev => prev.filter(name => !adjunctFaculty.includes(name)));
      }
    }
  }, [showAdjuncts, facultyData, selectedFaculty]);

  // Get schedule data for selected faculty
  const getFacultyScheduleData = (facultyName, day) => {
    const facultySchedule = scheduleData.filter(item => {
      const instructorName = item.instructor ? 
        `${item.instructor.firstName || ''} ${item.instructor.lastName || ''}`.trim() :
        (item.Instructor || item.instructorName || '');
      
      if (item.meetingPatterns) {
        return instructorName === facultyName && 
               item.meetingPatterns.some(pattern => pattern.day === day);
      }
      
      return instructorName === facultyName && item.Day === day;
    });

    const courses = facultySchedule
      .flatMap(item => {
        if (item.meetingPatterns) {
          return item.meetingPatterns
            .filter(pattern => pattern.day === day)
            .map(pattern => ({
              id: `${item.id}-${pattern.day}`,
              start: parseTime(pattern.startTime),
              end: parseTime(pattern.endTime),
              course: item.courseCode || item.Course,
              title: item.courseTitle || item['Course Title'],
              room: (() => {
                if (item.isOnline) return 'Online';
                if (Array.isArray(item.roomNames) && item.roomNames.length > 0) {
                  return item.roomNames.join('; ');
                }
                return item.room ? (item.room.displayName || item.room.name) : (item.roomName || item.Room);
              })(),
              section: item.section || item.Section,
              credits: item.credits || item.Credits,
              term: item.term || item.Term,
              rawData: item
            }));
        }
        
        return [{
          id: item.id || `${item.Course}-${item['Start Time']}-${item['End Time']}`,
          start: parseTime(item['Start Time']),
          end: parseTime(item['End Time']),
          course: item.Course,
          title: item['Course Title'],
          room: (() => {
            if (item.isOnline) return 'Online';
            if (Array.isArray(item.roomNames) && item.roomNames.length > 0) {
              return item.roomNames.join('; ');
            }
            return item.Room;
          })(),
          section: item.Section,
          credits: item.Credits,
          term: item.Term,
          rawData: item
        }];
      })
      .filter(course => course.start !== null && course.end !== null)
      .sort((a, b) => a.start - b.start);

    return courses;
  };

  // Timeline View for a single day
  const DayTimelineView = ({ dayCode }) => {
    const dayStart = 8 * 60;
    const dayEnd = 18 * 60;
    const totalMinutes = dayEnd - dayStart;
    const timeLabels = Array.from({length: (dayEnd - dayStart) / 60 + 1}, (_, i) => dayStart + i * 60);

    return (
      <div className="mt-6">
        <h2 className="text-xl font-serif font-semibold text-baylor-green mb-4">
          {dayNames[dayCode]}
        </h2>
        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
          <div className="relative min-w-[800px]">
            <div className="flex sticky top-0 bg-white z-10 border-b-2 border-baylor-green">
              <div className="w-48 flex-shrink-0 font-serif font-semibold p-3 text-baylor-green border-r border-gray-200">
                Faculty Member
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
            
            {selectedFaculty.map(facultyName => {
              const courses = getFacultyScheduleData(facultyName, dayCode);
              
              return (
                <div key={facultyName} className="flex border-b border-gray-100 hover:bg-gray-50/50">
                  <div className="w-48 flex-shrink-0 p-4 border-r border-gray-200 bg-gray-50/30">
                    <button
                      onClick={() => {
                        const faculty = facultyData.find(f => f.name === facultyName);
                        if (faculty) setSelectedFacultyForCard(faculty);
                      }}
                      className="font-semibold text-baylor-green hover:underline text-left"
                    >
                      {facultyName}
                    </button>
                    <button
                      onClick={() => setSelectedFaculty(prev => prev.filter(f => f !== facultyName))}
                      className="ml-2 text-gray-400 hover:text-red-500"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex-grow relative h-20">
                    {courses.map(course => {
                      const left = Math.max(0, ((course.start - dayStart) / totalMinutes) * 100);
                      const width = (((course.end - course.start) / totalMinutes) * 100);

                      if (course.end < dayStart || course.start > dayEnd) return null;

                      return (
                        <div
                          key={course.id}
                          style={{ 
                            position: 'absolute', 
                            left: `${left}%`, 
                            width: `${width}%`, 
                            top: '8px', 
                            bottom: '8px' 
                          }}
                          className="px-2 py-1 overflow-hidden text-left text-white text-xs rounded-md bg-baylor-green hover:bg-baylor-gold hover:text-baylor-green shadow-sm transition-all cursor-pointer"
                          onClick={() => setSelectedCourse({ ...course, facultyName })}
                          title={`${course.course} - ${course.title}\n${formatMinutesToTime(course.start)} - ${formatMinutesToTime(course.end)}\nRoom: ${course.room}`}
                        >
                          <div className="font-bold truncate">{course.course}</div>
                          <div className="text-xs opacity-75 truncate">{course.room}</div>
                        </div>
                      );
                    })}
                    
                    {courses.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                        No classes scheduled
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const CourseDetailModal = ({ course, facultyData, onClose }) => {
    if (!course) return null;

    const { rawData, facultyName } = course;
    const faculty = facultyData.find(f => f.name === facultyName);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-opacity" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl p-8 m-4 max-w-lg w-full relative transform transition-all" onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
          
          <div className="mb-6">
            <p className="text-sm font-semibold text-baylor-green tracking-wider uppercase">{course.course}</p>
            <h2 className="text-3xl font-bold font-serif text-gray-900 mt-1">{course.title}</h2>
          </div>

          <div className="space-y-4 text-gray-700">
            <div className="flex items-center">
              <Users size={20} className="text-gray-400 mr-4" />
              <div>
                <p className="font-semibold">Credits</p>
                <p>{rawData.credits} credit hours</p>
              </div>
            </div>
            <div className="flex items-center">
              <Info size={20} className="text-gray-400 mr-4" />
              <div>
                <p className="font-semibold">Section</p>
                <p>{course.section}</p>
              </div>
            </div>
            <div className="flex items-center">
              <Building size={20} className="text-gray-400 mr-4" />
              <div>
                <p className="font-semibold">Room</p>
                <p>{course.room || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <Clock size={20} className="text-gray-400 mr-4" />
              <div>
                <p className="font-semibold">Time</p>
                <p>{formatMinutesToTime(course.start)} - {formatMinutesToTime(course.end)}</p>
              </div>
            </div>
          </div>

          {faculty && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Instructor</h3>
              <FacultyContactCard faculty={faculty} showNotification={() => {}} compact={true} />
            </div>
          )}
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Faculty Schedules</h1>
        <p className="text-gray-600">Compare interactive schedules across faculty members</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Add Faculty to Compare</label>
            <div className="relative" ref={facultyDropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900 flex items-center justify-between"
              >
                <span>Add faculty member...</span>
                <ChevronsUpDown className="w-5 h-5 text-baylor-green" />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
                  <div className="p-2 border-b border-gray-200">
                    <input
                      type="text"
                      placeholder="Search faculty..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-baylor-green focus:border-baylor-green text-sm"
                    />
                  </div>
                  
                  <div className="max-h-48 overflow-auto">
                    {filteredInstructors
                      .filter(instructor => !selectedFaculty.includes(instructor))
                      .length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        {searchTerm ? 'No faculty found matching your search.' : 
                         !showAdjuncts ? 'No full-time faculty available.' : 'No faculty available.'}
                      </div>
                    ) : (
                      filteredInstructors
                        .filter(instructor => !selectedFaculty.includes(instructor))
                        .map((instructor) => (
                          <button
                            key={instructor}
                            onClick={() => {
                              setSelectedFaculty(prev => [...prev, instructor]);
                              setIsDropdownOpen(false);
                              setSearchTerm('');
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-baylor-green/10 transition-colors text-sm"
                          >
                            {instructor}
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Add Faculty by Program</label>
            <div className="relative" ref={programDropdownRef}>
              <button
                onClick={() => setIsProgramDropdownOpen(!isProgramDropdownOpen)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900 flex items-center justify-between"
              >
                <span>Select program...</span>
                <GraduationCap className="w-5 h-5 text-baylor-green" />
              </button>
              
              {isProgramDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
                  <div className="p-2 border-b border-gray-200">
                    <input
                      type="text"
                      placeholder="Search programs..."
                      value={programSearchTerm}
                      onChange={(e) => setProgramSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-baylor-green focus:border-baylor-green text-sm"
                    />
                  </div>
                  
                  <div className="max-h-48 overflow-auto">
                    {filteredPrograms.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        {programSearchTerm ? 'No programs found matching your search.' : 
                         !showAdjuncts ? 'No programs with full-time faculty available.' : 'No programs available.'}
                      </div>
                    ) : (
                      filteredPrograms.map((program) => {
                        const programFaculty = getFacultyByProgram(program);
                        const availableFaculty = programFaculty.filter(name => !selectedFaculty.includes(name));
                        const facultyCount = availableFaculty.length;
                        
                        return (
                          <button
                            key={program}
                            onClick={() => handleAddProgramFaculty(program)}
                            disabled={facultyCount === 0}
                            className={`w-full text-left px-3 py-2 hover:bg-baylor-green/10 transition-colors text-sm ${
                              facultyCount === 0 ? 'text-gray-400 cursor-not-allowed' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{program}</span>
                              <span className="text-xs text-gray-500">
                                {facultyCount === 0 ? 'All selected' : `${facultyCount} faculty`}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Days to View</label>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              {Object.entries(dayNames).map(([dayCode, dayName]) => (
                <button
                  key={dayCode}
                  onClick={() => handleDayToggle(dayCode)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex-1 ${
                    selectedDays.includes(dayCode) 
                      ? 'bg-baylor-green text-white shadow' 
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {dayName.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Adjunct Filter Toggle */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Include Adjunct Faculty</label>
              <p className="text-xs text-gray-500 mt-1">Toggle to show/hide adjunct faculty members</p>
            </div>
            <button
              onClick={() => setShowAdjuncts(!showAdjuncts)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-baylor-green focus:ring-offset-2 ${
                showAdjuncts ? 'bg-baylor-green' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showAdjuncts ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {!showAdjuncts && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-700">
                Adjunct faculty are currently hidden. Only full-time faculty schedules are displayed.
              </p>
            </div>
          )}
        </div>

        {selectedFaculty.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">Comparing:</span>
                <span className="text-sm text-gray-600">
                  {selectedFaculty.length} faculty member{selectedFaculty.length !== 1 ? 's' : ''}
                </span>
              </div>
              {showAdjuncts && (() => {
                const adjunctCount = selectedFaculty.filter(name => {
                  const faculty = facultyData.find(f => f.name === name);
                  return faculty && faculty.isAdjunct;
                }).length;
                return adjunctCount > 0 ? (
                  <div className="text-xs text-gray-500">
                    {adjunctCount} adjunct{adjunctCount !== 1 ? 's' : ''} included
                  </div>
                ) : null;
              })()}
            </div>
            <div className="flex items-center space-x-2 flex-wrap">
              {selectedFaculty.map(facultyName => {
                const faculty = facultyData.find(f => f.name === facultyName);
                const programName = faculty?.program?.name;
                const isAdjunct = faculty?.isAdjunct;
                
                return (
                  <div key={facultyName} className={`flex items-center px-3 py-1 rounded-full text-sm ${
                    isAdjunct 
                      ? 'bg-orange-100 text-orange-700 border border-orange-200' 
                      : 'bg-baylor-green/10 text-baylor-green'
                  }`}>
                    <span>{facultyName}</span>
                    {programName && (
                      <span className="ml-1 text-xs opacity-75">({programName})</span>
                    )}
                    {isAdjunct && (
                      <span className="ml-1 text-xs bg-orange-200 px-1 rounded">Adjunct</span>
                    )}
                    <button
                      onClick={() => setSelectedFaculty(prev => prev.filter(f => f !== facultyName))}
                      className="ml-2 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        {selectedFaculty.length > 0 ? (
          <div className="space-y-8">
            {selectedDays.length > 0 ? (
              selectedDays
                .sort((a, b) => Object.keys(dayNames).indexOf(a) - Object.keys(dayNames).indexOf(b))
                .map(dayCode => <DayTimelineView key={dayCode} dayCode={dayCode} />)
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Days Selected</h3>
                <p className="text-gray-600">
                  Please select at least one day to view schedules.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Faculty to Compare</h3>
            <p className="text-gray-600">
              Choose one or more faculty members to view and compare their schedules.
            </p>
          </div>
        )}
      </div>

      {selectedCourse && (
        <CourseDetailModal 
          course={selectedCourse}
          facultyData={facultyData}
          onClose={() => setSelectedCourse(null)}
        />
      )}

      {selectedFacultyForCard && (
        <FacultyContactCard 
          faculty={selectedFacultyForCard} 
          onClose={() => setSelectedFacultyForCard(null)} 
          showNotification={() => {}} 
        />
      )}
    </div>
  );
};

export default FacultySchedules; 