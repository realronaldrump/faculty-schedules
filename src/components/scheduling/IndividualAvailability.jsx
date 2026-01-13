import React, { useState, useMemo, useEffect } from 'react';
import { User, Calendar, Clock, Search, ChevronDown, ChevronsUpDown } from 'lucide-react';
import FacultyContactCard from '../FacultyContactCard';
import { parseTime, formatMinutesToTime } from '../../utils/timeUtils';
import { useData } from '../../contexts/DataContext';
import { useSchedules } from '../../contexts/ScheduleContext';
import { usePeople } from '../../contexts/PeopleContext';

const IndividualAvailability = () => {
  const { scheduleData = [], facultyData = [] } = useData();
  const { selectedSemester } = useSchedules();
  const { loadPeople } = usePeople();
  const [selectedIndividual, setSelectedIndividual] = useState('');
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  // Get unique instructors - use relational data when available
  const uniqueInstructors = useMemo(() =>
    [...new Set(scheduleData.flatMap(item => {
      const fallbackName = item.instructor
        ? `${item.instructor.firstName || ''} ${item.instructor.lastName || ''}`.trim()
        : (item.Instructor || item.instructorName || '');
      const list = Array.isArray(item.instructorNames) && item.instructorNames.length > 0
        ? item.instructorNames
        : [fallbackName].filter(Boolean);
      return list;
    }))].filter(i => i && i !== 'Staff').sort(),
    [scheduleData]
  );

  // Filter instructors based on search
  const filteredInstructors = useMemo(() =>
    uniqueInstructors.filter(instructor =>
      instructor.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [uniqueInstructors, searchTerm]
  );

  // Calculate individual availability
  const getIndividualAvailability = (professor) => {
    const availability = {};

    ['M', 'T', 'W', 'R', 'F'].forEach(day => {
      const professorSchedule = scheduleData.filter(item => {
        const fallbackName = item.instructor
          ? `${item.instructor.firstName || ''} ${item.instructor.lastName || ''}`.trim()
          : (item.Instructor || item.instructorName || '');
        const instructorNames = Array.isArray(item.instructorNames) && item.instructorNames.length > 0
          ? item.instructorNames
          : [fallbackName].filter(Boolean);
        const matchesInstructor = instructorNames.includes(professor);

        // For normalized data, check meeting patterns for the day
        if (item.meetingPatterns) {
          return matchesInstructor &&
            item.meetingPatterns.some(pattern => pattern.day === day);
        }

        // Fallback to direct day field
        return matchesInstructor && item.Day === day;
      });

      const busyPeriodsRaw = professorSchedule
        .flatMap(item => {
          // Handle normalized data with meeting patterns
          if (item.meetingPatterns) {
            return item.meetingPatterns
              .filter(pattern => pattern.day === day)
              .map(pattern => ({
                start: parseTime(pattern.startTime),
                end: parseTime(pattern.endTime),
                course: item.courseCode,
                room: (() => {
                  if (item.locationType === 'no_room' || item.isOnline) {
                    return item.locationLabel || 'No Room Needed';
                  }
                  const names = Array.isArray(item.roomNames) && item.roomNames.length > 0
                    ? item.roomNames
                    : [item.room ? item.room.displayName : item.roomName].filter(Boolean);
                  return names.join('; ');
                })(),
                title: item.courseTitle
              }));
          }

          // Fallback to direct fields
          return [{
            start: parseTime(item['Start Time']),
            end: parseTime(item['End Time']),
            course: item.Course,
            room: item.Room,
            // Normalize online display
            ...((item.locationType === 'no_room' || item.isOnline) ? { room: item.locationLabel || 'No Room Needed' } : {}),
            title: item['Course Title']
          }];
        })
        .filter(period => period.start !== null && period.end !== null);

      // Group identical time periods (cross-listed courses)
      const busyPeriodsGrouped = busyPeriodsRaw.reduce((acc, period) => {
        const key = `${period.start}-${period.end}-${period.course}`;
        if (!acc[key]) {
          acc[key] = { ...period, room: [period.room] };
        } else if (!acc[key].room.includes(period.room)) {
          acc[key].room.push(period.room);
        }
        return acc;
      }, {});

      const busyPeriods = Object.values(busyPeriodsGrouped)
        .map(period => ({ ...period, room: period.room.sort().join('; ') }))
        .sort((a, b) => a.start - b.start);

      // Calculate available slots
      const availableSlots = [];
      const dayStart = 8 * 60; // 8:00 AM
      const dayEnd = 17 * 60; // 5:00 PM
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

  const handleShowContactCard = (facultyName) => {
    const faculty = facultyData.find(f => f.name === facultyName);
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    }
  };

  const CustomDropdown = () => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900 appearance-none cursor-pointer hover:border-baylor-green/50 transition-colors flex items-center justify-between"
      >
        <span className="block truncate text-left">
          {selectedIndividual || "Choose a faculty member..."}
        </span>
        <ChevronsUpDown className={`w-5 h-5 text-baylor-green transition-transform ${isDropdownOpen ? 'transform rotate-180' : ''}`} />
      </button>

      {isDropdownOpen && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search faculty..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-baylor-green focus:border-baylor-green text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-auto">
            {filteredInstructors.length > 0 ? (
              filteredInstructors.map((instructor) => (
                <button
                  key={instructor}
                  onClick={() => {
                    setSelectedIndividual(instructor);
                    setIsDropdownOpen(false);
                    setSearchTerm('');
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-baylor-green/10 transition-colors ${instructor === selectedIndividual ? 'bg-baylor-green text-white' : 'text-gray-900'
                    }`}
                >
                  {instructor}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-gray-500 text-sm">No faculty found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const DaySchedule = ({ dayName, dayCode, dayData }) => (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Day Header */}
      <div className="bg-baylor-green/5 px-6 py-4 border-b border-gray-200">
        <h4 className="font-serif font-semibold text-baylor-green text-lg flex items-center">
          <Calendar className="mr-2 text-baylor-gold" size={18} />
          {dayName}
        </h4>
      </div>

      <div className="p-6">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Classes & Commitments */}
          <div>
            <h5 className="text-sm font-semibold text-baylor-green mb-3 border-b border-baylor-gold/30 pb-2 flex items-center">
              <Clock className="mr-2" size={16} />
              Classes & Commitments
            </h5>
            {dayData.busyPeriods.length > 0 ? (
              <div className="space-y-3">
                {dayData.busyPeriods.map((period, index) => (
                  <div key={index} className="bg-baylor-gold/5 border border-baylor-gold/30 rounded-lg p-4 hover:bg-baylor-gold/10 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-baylor-green">
                        {formatMinutesToTime(period.start)} - {formatMinutesToTime(period.end)}
                      </div>
                      <div className="text-xs text-gray-500 bg-white rounded px-2 py-1">
                        {Math.floor((period.end - period.start) / 60)}h {(period.end - period.start) % 60}m
                      </div>
                    </div>
                    <div className="text-sm font-medium text-baylor-green/90 mb-1">
                      {period.course} - {period.title}
                    </div>
                    <div className="text-xs text-gray-600 flex items-center">
                      <span className="font-medium">Room:</span>
                      <span className="ml-1">{period.room}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No scheduled classes</p>
              </div>
            )}
          </div>

          {/* Available Time Slots */}
          <div>
            <h5 className="text-sm font-semibold text-baylor-green mb-3 border-b border-baylor-gold/30 pb-2 flex items-center">
              <Clock className="mr-2" size={16} />
              Available Time Slots
            </h5>
            {dayData.availableSlots.length > 0 ? (
              <div className="space-y-3">
                {dayData.availableSlots.map((slot, index) => (
                  <div key={index} className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-4 hover:bg-baylor-green/10 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-baylor-green">
                        {formatMinutesToTime(slot.start)} - {formatMinutesToTime(slot.end)}
                      </div>
                      <div className="text-xs text-gray-500 bg-white rounded px-2 py-1">
                        {Math.floor(slot.duration / 60)}h {slot.duration % 60}m
                      </div>
                    </div>
                    <div className="text-sm text-baylor-green/80">
                      Available for meetings or appointments
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No gaps in schedule</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Individual Faculty Availability</h1>
        <p className="text-gray-600">View detailed schedule and availability for any faculty member</p>
      </div>

      {/* Faculty Selection */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 flex items-center border-b border-baylor-gold pb-3">
          <User className="mr-2 text-baylor-gold" size={20} />
          Select Faculty Member
        </h2>

        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Choose a faculty member to view their schedule
          </label>
          <CustomDropdown />
        </div>
      </div>

      {/* Schedule Display */}
      {selectedIndividual && (
        <div className="space-y-6">
          {/* Faculty Info Header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-serif font-semibold text-baylor-green border-b border-baylor-gold/50 pb-2 inline-block">
                  <button
                    onClick={() => handleShowContactCard(selectedIndividual)}
                    className="hover:underline"
                  >
                    {selectedIndividual}
                  </button>
                  's Weekly Schedule
                </h3>
                <p className="text-gray-600 mt-2">Schedule and availability for {selectedSemester || 'selected semester'}</p>
              </div>
              <button
                onClick={() => handleShowContactCard(selectedIndividual)}
                className="px-4 py-2 bg-baylor-green/10 text-baylor-green rounded-lg hover:bg-baylor-green/20 transition-colors font-medium text-sm flex items-center"
              >
                <User className="mr-2" size={16} />
                View Contact Info
              </button>
            </div>
          </div>

          {/* Weekly Schedule */}
          <div className="space-y-4">
            {Object.entries(dayNames).map(([dayCode, dayName]) => {
              const dayData = getIndividualAvailability(selectedIndividual)[dayCode];
              return (
                <DaySchedule
                  key={dayCode}
                  dayName={dayName}
                  dayCode={dayCode}
                  dayData={dayData}
                />
              );
            })}
          </div>

          {/* Weekly Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4 border-b border-baylor-gold/30 pb-2">
              Weekly Summary
            </h3>

            <div className="grid md:grid-cols-3 gap-6">
              {(() => {
                const availability = getIndividualAvailability(selectedIndividual);
                const totalBusyPeriods = Object.values(availability).reduce((sum, day) => sum + day.busyPeriods.length, 0);
                const totalAvailableSlots = Object.values(availability).reduce((sum, day) => sum + day.availableSlots.length, 0);
                const totalTeachingHours = Object.values(availability).reduce((sum, day) => {
                  return sum + day.busyPeriods.reduce((daySum, period) => daySum + (period.end - period.start) / 60, 0);
                }, 0);

                return (
                  <>
                    <div className="text-center p-4 bg-baylor-green/5 rounded-lg">
                      <div className="text-2xl font-bold text-baylor-green">{totalBusyPeriods}</div>
                      <div className="text-sm text-gray-600">Weekly Classes</div>
                    </div>
                    <div className="text-center p-4 bg-baylor-gold/10 rounded-lg">
                      <div className="text-2xl font-bold text-baylor-green">{totalTeachingHours.toFixed(1)}h</div>
                      <div className="text-sm text-gray-600">Teaching Hours</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-baylor-green">{totalAvailableSlots}</div>
                      <div className="text-sm text-gray-600">Available Slots</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!selectedIndividual && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Faculty Member</h3>
          <p className="text-gray-600">Choose a faculty member from the dropdown above to view their detailed schedule and availability.</p>
        </div>
      )}

      {/* Faculty Contact Card Modal */}
      {selectedFacultyForCard && (
        <FacultyContactCard
          faculty={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
        />
      )}
    </div>
  );
};

export default IndividualAvailability;
