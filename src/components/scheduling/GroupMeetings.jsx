import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Clock, Users, Calendar, X, CheckCircle, Eye } from 'lucide-react';
import FacultyContactCard from '../FacultyContactCard';

const GroupMeetings = ({ scheduleData, facultyData, onNavigate }) => {
  const [selectedProfessors, setSelectedProfessors] = useState([]);
  const [meetingDuration, setMeetingDuration] = useState(60);
  const [bufferTime, setBufferTime] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [selectedSlotForRoomSearch, setSelectedSlotForRoomSearch] = useState(null);
  const roomModalRef = useRef(null);

  // Close room modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isRoomModalOpen && roomModalRef.current && !roomModalRef.current.contains(event.target)) {
        setIsRoomModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRoomModalOpen]);

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

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  // Get unique instructors
  const uniqueInstructors = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Instructor).filter(Boolean))].sort(),
    [scheduleData]
  );

  const uniqueRooms = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Room).filter(Boolean))].filter(room => room.toLowerCase() !== 'online').sort(),
    [scheduleData]
  );

  const filteredInstructors = useMemo(() => 
    uniqueInstructors.filter(instructor => instructor.toLowerCase().includes(searchTerm.toLowerCase())),
    [uniqueInstructors, searchTerm]
  );

  // Calculate common availability
  const commonAvailability = useMemo(() => {
    if (selectedProfessors.length === 0) return {};
    const availability = {};
    const days = ['M', 'T', 'W', 'R', 'F'];
    
    days.forEach(day => {
      const busyPeriods = [];
      selectedProfessors.forEach(professor => {
        // Include all professors in scheduling analysis
        scheduleData.filter(item => item.Instructor === professor && item.Day === day).forEach(item => {
          const start = parseTime(item['Start Time']);
          const end = parseTime(item['End Time']);
          if (start !== null && end !== null) {
            busyPeriods.push({ start: Math.max(0, start - bufferTime), end: end + bufferTime });
          }
        });
      });
      
      busyPeriods.sort((a, b) => a.start - b.start);
      const availableSlots = [];
      const dayStart = 8 * 60, dayEnd = 17 * 60;
      let currentTime = dayStart;
      
      busyPeriods.forEach(period => {
        if (currentTime < period.start && (period.start - currentTime) >= (meetingDuration + bufferTime)) {
          availableSlots.push({ start: currentTime, end: period.start, duration: period.start - currentTime });
        }
        currentTime = Math.max(currentTime, period.end);
      });
      
      if (currentTime < dayEnd && (dayEnd - currentTime) >= (meetingDuration + bufferTime)) {
        availableSlots.push({ start: currentTime, end: dayEnd, duration: dayEnd - currentTime });
      }
      
      availability[day] = availableSlots.filter(slot => slot.duration >= meetingDuration);
    });
    
    return availability;
  }, [scheduleData, selectedProfessors, meetingDuration, bufferTime]);

  // Event handlers
  const toggleProfessor = (professor) => {
    setSelectedProfessors(prev => 
      prev.includes(professor) 
        ? prev.filter(p => p !== professor) 
        : [...prev, professor]
    );
  };

  const handleShowContactCard = (facultyName) => {
    const faculty = facultyData.find(f => f.name === facultyName);
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    }
  };

  const handleSlotClick = (dayCode, dayName, slot) => {
    setSelectedSlotForRoomSearch({ dayCode, dayName, slot });
    setIsRoomModalOpen(true);
  };

  const renderRoomModal = () => {
    if (!isRoomModalOpen || !selectedSlotForRoomSearch) return null;
    
    const { dayCode, dayName, slot } = selectedSlotForRoomSearch;
    const meetingStart = slot.start;
    const meetingEnd = meetingStart + meetingDuration;
    
    const availableRooms = uniqueRooms.filter(room => 
      !scheduleData.some(item => 
        item.Day === dayCode && 
        item.Room === room && 
        Math.max(parseTime(item['Start Time']), meetingStart) < Math.min(parseTime(item['End Time']), meetingEnd)
      )
    );

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
        <div ref={roomModalRef} className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4">
          <div className="flex justify-between items-center mb-4 border-b border-baylor-gold pb-3">
            <div>
              <h3 className="text-xl font-serif font-bold text-baylor-green">Available Rooms</h3>
              <p className="text-md text-gray-700">
                For <span className="font-semibold">{dayName}</span>, from{' '}
                <span className="font-semibold">{formatMinutesToTime(meetingStart)}</span> to{' '}
                <span className="font-semibold">{formatMinutesToTime(meetingEnd)}</span>
              </p>
            </div>
            <button onClick={() => setIsRoomModalOpen(false)} className="p-2 rounded-full hover:bg-gray-200">
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
              className="px-4 py-2 bg-baylor-gold text-baylor-green font-bold rounded-lg hover:bg-baylor-gold/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Group Meeting Scheduler</h1>
        <p className="text-gray-600">Find available times when multiple faculty members can meet</p>
      </div>

      {!showResults ? (
        <div className="space-y-6">
          {/* Meeting Configuration */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 flex items-center border-b border-baylor-gold pb-2">
              <Clock className="mr-2 text-baylor-gold" size={20} />
              Meeting Details
            </h2>
            
            <div className="space-y-6">
              {/* Meeting Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Meeting Duration</label>
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
                      <div className="font-medium">
                        {duration === 60 ? '1 hr' : duration === 120 ? '2 hrs' : `${duration}m`}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Buffer Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Buffer Time (before and after)</label>
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

          {/* Faculty Selection */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 flex items-center border-b border-baylor-gold pb-2">
              <Users className="mr-2 text-baylor-gold" size={20} />
              Select Attendees ({selectedProfessors.length} selected)
            </h2>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-baylor-green" size={16} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900"
                  placeholder="Search professors..."
                />
              </div>
            </div>

            {/* Selected Professors */}
            {selectedProfessors.length > 0 && (
              <div className="mb-4 p-4 bg-baylor-green/10 rounded-lg border border-baylor-green/20">
                <div className="flex flex-wrap gap-2">
                  {selectedProfessors.map(professor => (
                    <span key={professor} className="inline-flex items-center px-3 py-1 bg-baylor-green text-white rounded-full text-sm">
                                          <button
                      className="cursor-pointer hover:underline"
                      onClick={() => handleShowContactCard(professor)}
                    >
                      {professor}
                    </button>
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

            {/* Faculty Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {filteredInstructors.map(professor => (
                <div
                  key={professor}
                  className={`p-3 rounded-lg border transition-all flex justify-between items-center ${
                    selectedProfessors.includes(professor)
                      ? 'bg-baylor-green/10 border-baylor-green text-baylor-green'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <button onClick={() => toggleProfessor(professor)} className="flex items-center flex-grow text-left">
                    <div
                      className={`w-3 h-3 rounded-full mr-3 ${
                        selectedProfessors.includes(professor)
                          ? 'bg-baylor-green'
                          : 'bg-gray-300'
                      }`}
                    ></div>
                    <span
                      className="text-sm font-medium hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowContactCard(professor);
                      }}
                    >
                      {professor}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Could navigate to individual schedule view
                    }}
                    className="p-1 rounded-full hover:bg-baylor-green/20"
                  >
                    <Eye size={16} className="text-baylor-green" />
                  </button>
                </div>
              ))}
            </div>

            {/* Find Meeting Times Button */}
            <div className="text-center mt-6">
              <button
                onClick={() => setShowResults(true)}
                disabled={selectedProfessors.length === 0}
                className="px-8 py-3 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-bold text-lg shadow-md"
              >
                <span className="flex items-center justify-center">
                  <Calendar className="mr-2" size={18} />
                  Find Available Times
                </span>
              </button>
              {selectedProfessors.length === 0 && (
                <p className="text-gray-500 text-sm mt-2">Select at least one faculty member to continue</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Results View */
        <div className="space-y-6">
          {/* Results Header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-semibold text-baylor-green mb-2">Available Meeting Times</h2>
              <button
                onClick={() => setShowResults(false)}
                className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors flex items-center"
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

          {/* Available Time Slots by Day */}
          <div className="grid gap-4">
            {Object.entries(dayNames).map(([dayCode, dayName]) => {
              const slots = commonAvailability[dayCode] || [];
              return (
                <div key={dayCode} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-serif font-semibold text-baylor-green flex items-center">
                      <Calendar className="mr-2 text-baylor-gold" size={18} />
                      {dayName}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        slots.length > 0 ? 'bg-baylor-green/10 text-baylor-green' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {slots.length > 0 ? `${slots.length} slot${slots.length !== 1 ? 's' : ''}` : 'No availability'}
                    </span>
                  </div>
                  
                  {slots.length > 0 ? (
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
                          <div className="text-xs text-baylor-gold font-bold mt-2">Click to Find a Room →</div>
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
        </div>
      )}

      {/* Modals */}
      {renderRoomModal()}
      {selectedFacultyForCard && (
        <FacultyContactCard
          faculty={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
        />
      )}
    </div>
  );
};

export default GroupMeetings;