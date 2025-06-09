import React, { useState, useMemo } from 'react';
import { MapPin, Calendar, Clock, Search, Grid, List, Filter } from 'lucide-react';
import FacultyContactCard from '../FacultyContactCard';

const RoomSchedules = ({ scheduleData, facultyData }) => {
  const [roomScheduleDay, setRoomScheduleDay] = useState('M');
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' or 'list'
  const [selectedRoom, setSelectedRoom] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

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

  // Get unique rooms
  const uniqueRooms = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Room).filter(Boolean))]
      .filter(room => room.toLowerCase() !== 'online')
      .sort(),
    [scheduleData]
  );

  // Filter rooms based on search
  const filteredRooms = useMemo(() => 
    uniqueRooms.filter(room => room.toLowerCase().includes(searchTerm.toLowerCase())),
    [uniqueRooms, searchTerm]
  );

  // Calculate daily room schedules
  const dailyRoomSchedules = useMemo(() => {
    const schedules = {};
    const roomsToShow = selectedRoom ? [selectedRoom] : filteredRooms;
    
    roomsToShow.forEach(room => {
      schedules[room] = scheduleData
        .filter(item => 
          item.Room === room && 
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

  const handleShowContactCard = (facultyName) => {
    const faculty = facultyData.find(f => f.name === facultyName);
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    }
  };

  // Timeline view component
  const TimelineView = () => {
    const dayStart = 8 * 60; // 8:00 AM
    const dayEnd = 18 * 60; // 6:00 PM
    const totalMinutes = dayEnd - dayStart;
    const timeLabels = Array.from({length: (dayEnd - dayStart) / 60 + 1}, (_, i) => dayStart + i * 60);

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
          {Object.keys(dailyRoomSchedules).map(room => (
            <div key={room} className="relative flex items-center border-t border-gray-200 hover:bg-gray-50" style={{ height: '60px' }}>
              <div className="w-40 flex-shrink-0 font-medium p-3 text-sm text-baylor-green border-r border-gray-200">
                <div className="font-semibold">{room}</div>
                <div className="text-xs text-gray-500">
                  {roomStats[room]?.sessions || 0} sessions • {(roomStats[room]?.hours || 0).toFixed(1)}h
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
                      key={item.id}
                      style={{ 
                        position: 'absolute', 
                        left: `${left}%`, 
                        width: `${width}%`, 
                        top: '6px', 
                        bottom: '6px' 
                      }}
                      className="px-2 py-1 overflow-hidden text-left text-white text-xs rounded-md bg-baylor-green hover:bg-baylor-gold hover:text-baylor-green shadow-sm transition-all cursor-pointer group"
                    >
                      <div className="font-bold truncate">{item.Course}</div>
                      <button
                        className="truncate hover:underline w-full text-left"
                        onClick={() => handleShowContactCard(item.Instructor)}
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
      {Object.keys(dailyRoomSchedules).map(room => (
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
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
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
                          onClick={() => handleShowContactCard(session.Instructor)}
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
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
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

          {/* Room Filter */}
          <div className="flex-1 max-w-xs">
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

          {/* View Mode Toggle */}
          <div className="flex-1 max-w-xs">
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
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Rooms Shown</div>
          <div className="text-2xl font-bold text-baylor-green">
            {Object.keys(dailyRoomSchedules).length}
          </div>
          <div className="text-xs text-gray-500">of {uniqueRooms.length} total</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Sessions</div>
          <div className="text-2xl font-bold text-baylor-green">
            {Object.values(dailyRoomSchedules).reduce((sum, sessions) => sum + sessions.length, 0)}
          </div>
          <div className="text-xs text-gray-500">on {dayNames[roomScheduleDay]}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Hours</div>
          <div className="text-2xl font-bold text-baylor-green">
            {Object.values(roomStats).reduce((sum, stat) => sum + stat.hours, 0).toFixed(1)}h
          </div>
          <div className="text-xs text-gray-500">class time</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Avg Utilization</div>
          <div className="text-2xl font-bold text-baylor-green">
            {Object.keys(roomStats).length > 0 
              ? (Object.values(roomStats).reduce((sum, stat) => sum + stat.utilization, 0) / Object.keys(roomStats).length).toFixed(0)
              : 0}%
          </div>
          <div className="text-xs text-gray-500">of 9-hour day</div>
        </div>
      </div>

      {/* Schedule Display */}
      <div>
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

        {Object.keys(dailyRoomSchedules).length > 0 ? (
          viewMode === 'timeline' ? <TimelineView /> : <ListView />
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
    </div>
  );
};

export default RoomSchedules;