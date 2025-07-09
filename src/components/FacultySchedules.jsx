import React, { useState, useMemo } from 'react';
import { User, Calendar, Clock, Search, ChevronDown, ChevronsUpDown, Grid, List, Plus, X, Eye, Info, Building, BookOpen, Users } from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';

const FacultySchedules = ({ scheduleData, facultyData }) => {
  const [selectedFaculty, setSelectedFaculty] = useState([]);
  const [viewMode, setViewMode] = useState('timeline');
  const [selectedDays, setSelectedDays] = useState(['M', 'T', 'W', 'R', 'F']);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);

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

  // Get unique instructors
  const uniqueInstructors = useMemo(() => 
    [...new Set(scheduleData.map(item => {
      if (item.instructor) {
        return `${item.instructor.firstName || ''} ${item.instructor.lastName || ''}`.trim();
      }
      return item.Instructor || item.instructorName || '';
    }))].filter(i => i !== '').sort(),
    [scheduleData]
  );

  const filteredInstructors = useMemo(() => 
    uniqueInstructors.filter(instructor => 
      instructor.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [uniqueInstructors, searchTerm]
  );

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
              room: item.room ? (item.room.displayName || item.room.name) : (item.roomName || item.Room),
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
          room: item.Room,
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

    const levelMap = {
      1: 'Freshman (1000-level)',
      2: 'Sophomore (2000-level)',
      3: 'Junior (3000-level)',
      4: 'Senior (4000-level)',
      5: 'Graduate (5000-level)',
      6: 'Graduate (6000-level)',
    };

    const courseLevelDisplay = levelMap[rawData.courseLevel] || `Level ${rawData.courseLevel}` || 'N/A';

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
              <BookOpen size={20} className="text-gray-400 mr-4" />
              <div>
                <p className="font-semibold">Course Level</p>
                <p>{courseLevelDisplay}</p>
              </div>
            </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Add Faculty to Compare</label>
            <div className="relative">
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
                      ))}
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

        {selectedFaculty.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Comparing:</span>
              {selectedFaculty.map(facultyName => (
                <div key={facultyName} className="flex items-center bg-baylor-green/10 text-baylor-green px-3 py-1 rounded-full text-sm">
                  <span>{facultyName}</span>
                  <button
                    onClick={() => setSelectedFaculty(prev => prev.filter(f => f !== facultyName))}
                    className="ml-2 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
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