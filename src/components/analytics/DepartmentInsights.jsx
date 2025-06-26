import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  Users, 
  Clock, 
  MapPin, 
  BookOpen,
  ArrowUpDown,
  X,
  TrendingUp,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import FacultyContactCard from '../FacultyContactCard';

const DepartmentInsights = ({ scheduleData, facultyData, onNavigate, analytics }) => {
  const [showWarning, setShowWarning] = useState(() => localStorage.getItem('insightsWarningDismissed') !== 'true');
  const [facultySort, setFacultySort] = useState({ key: 'totalHours', direction: 'desc' });
  const [roomSort, setRoomSort] = useState({ key: 'hours', direction: 'desc' });
  const [hourlyUsageDayFilter, setHourlyUsageDayFilter] = useState('All');
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

  // Calculate hourly usage (specific to this component)
  const filteredHourCounts = useMemo(() => {
    const dataToProcess = hourlyUsageDayFilter === 'All' 
      ? scheduleData 
      : scheduleData.filter(item => item.Day === hourlyUsageDayFilter);
    
    if (dataToProcess.length === 0) {
      const emptyCounts = {};
      for (let hour = 8; hour <= 17; hour++) emptyCounts[hour] = 0;
      return { hourCounts: emptyCounts, latestEndTime: 17 * 60, peakHour: { hour: 8, count: 0 } };
    }
    
    let latestEndTime = 17 * 60;
    dataToProcess.forEach(item => {
      const end = parseTime(item['End Time']);
      if (end && end > latestEndTime) latestEndTime = end;
    });
    
    const hourCounts = {};
    for (let hour = 8; hour <= Math.ceil(latestEndTime / 60); hour++) {
      hourCounts[hour] = 0;
    }
    
    dataToProcess.forEach(item => {
      const start = parseTime(item['Start Time']);
      const end = parseTime(item['End Time']);
      if (start && end) {
        const startHour = Math.floor(start / 60);
        const endHour = Math.ceil(end / 60);
        for (let hour = startHour; hour < endHour; hour++) {
          if (hourCounts.hasOwnProperty(hour)) hourCounts[hour]++;
        }
      }
    });
    
    const peakHour = Object.entries(hourCounts).reduce(
      (max, [hour, count]) => count > max.count ? { hour: parseInt(hour), count } : max,
      { hour: 8, count: 0 }
    );
    
    return { hourCounts, latestEndTime, peakHour };
  }, [scheduleData, hourlyUsageDayFilter]);

  // Sort faculty workload from the analytics prop
  const sortedFacultyWorkload = useMemo(() => {
    if (!analytics || !analytics.facultyWorkload) return [];
    const { key, direction } = facultySort;
    return Object.entries(analytics.facultyWorkload).sort(([profA, dataA], [profB, dataB]) => {
      let valA, valB;
      if (key === 'name') {
        valA = profA;
        valB = profB;
      } else {
        valA = dataA[key];
        valB = dataB[key];
      }
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [analytics, facultySort]);

  // Sort room utilization from the analytics prop
  const sortedRoomUtilization = useMemo(() => {
    if (!analytics || !analytics.roomUtilization) return [];
    const { key, direction } = roomSort;
    return Object.entries(analytics.roomUtilization).sort(([roomA, dataA], [roomB, dataB]) => {
      let valA, valB;
      if (key === 'name') {
        valA = roomA;
        valB = roomB;
      } else {
        valA = dataA[key];
        valB = dataB[key];
      }
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [analytics, roomSort]);

  // Event handlers
  const handleFacultySort = (key) => {
    setFacultySort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleDismissWarning = () => {
    setShowWarning(false);
    localStorage.setItem('insightsWarningDismissed', 'true');
  };

  const handleShowContactCard = (facultyName) => {
    const faculty = facultyData.find(f => f.name === facultyName);
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    }
  };

  const SortableHeader = ({ label, sortKey, currentSort, onSort }) => {
    const isActive = currentSort.key === sortKey;
    const Icon = isActive ? (currentSort.direction === 'asc' ? '▲' : '▼') : <ArrowUpDown size={14} className="inline-block text-gray-400" />;
    return (
      <th className="px-4 py-3 text-left text-sm font-serif font-semibold text-baylor-green">
        <button className="flex items-center gap-2" onClick={() => onSort(sortKey)}>
          {label}
          <span className="w-4">{Icon}</span>
        </button>
      </th>
    );
  };

  if (!analytics) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Department Insights</h1>
          <p className="text-gray-600">Analytics and metrics for faculty scheduling</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h2>
          <p className="text-gray-600 mb-6">Import schedule data to view department analytics and insights</p>
          <button 
            onClick={() => onNavigate('administration/data-import')}
            className="px-6 py-3 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors font-medium"
          >
            Import Schedule Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Department Insights</h1>
        <p className="text-gray-600">Analytics and metrics for faculty scheduling</p>
      </div>

      {/* Warning Banner */}
      {showWarning && (
        <div className="bg-baylor-gold/10 border border-baylor-gold/30 rounded-lg p-4 text-baylor-green relative">
          <button 
            onClick={handleDismissWarning}
            className="absolute top-2 right-2 p-1 hover:bg-baylor-gold/20 rounded-full transition-colors"
          >
            <X size={16} className="text-baylor-green" />
          </button>
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-baylor-gold mr-3 mt-0.5 flex-shrink-0" />
            <div className="pr-6">
              <p className="text-sm font-medium">Data Verification Notice</p>
              <p className="text-sm mt-1">
                This data is still being refined and may not reflect the final schedule. Please verify any critical information with the department and official University{' '}
                <button 
                  onClick={() => onNavigate('administration/baylor-systems')}
                  className="text-baylor-gold hover:text-baylor-green underline transition-colors"
                >
                  systems
                </button>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Faculty Members</p>
              <p className="text-3xl font-bold text-baylor-green">{analytics.facultyCount}</p>
              <p className="text-sm text-gray-500">Teaching this semester</p>
            </div>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <Users className="w-6 h-6 text-baylor-green" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Weekly Sessions</p>
              <p className="text-3xl font-bold text-baylor-green">{analytics.totalSessions}</p>
              <p className="text-sm text-gray-500">{analytics.adjunctTaughtSessions} adjunct-taught</p>
            </div>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <BookOpen className="w-6 h-6 text-baylor-green" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Classrooms</p>
              <p className="text-3xl font-bold text-baylor-green">{analytics.roomsInUse}</p>
              <p className="text-sm text-gray-500">In active use</p>
            </div>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <MapPin className="w-6 h-6 text-baylor-green" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Peak Hour</p>
              <p className="text-3xl font-bold text-baylor-green">
                {formatMinutesToTime(filteredHourCounts.peakHour.hour * 60).replace(':00', '')}
              </p>
              <p className="text-sm text-gray-500">{filteredHourCounts.peakHour.count} rooms in use</p>
            </div>
            <div className="p-3 bg-baylor-green/10 rounded-lg">
              <Clock className="w-6 h-6 text-baylor-green" />
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Usage Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 border-b border-baylor-gold/30 pb-4 gap-4">
          <div>
            <h3 className="text-lg font-serif font-semibold text-baylor-green">Hourly Room Usage</h3>
            <p className="text-sm text-gray-600">
              Room utilization throughout the day • Showing until {formatMinutesToTime(filteredHourCounts.latestEndTime)}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            {['All', 'M', 'T', 'W', 'R', 'F'].map(day => (
              <button
                key={day}
                onClick={() => setHourlyUsageDayFilter(day)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  hourlyUsageDayFilter === day 
                    ? 'bg-baylor-green text-white shadow' 
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                {day === 'All' ? 'All' : dayNames[day]?.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>
        
        <div className="space-y-2">
          {Object.entries(filteredHourCounts.hourCounts).map(([hour, count]) => {
            const maxCount = Math.max(...Object.values(filteredHourCounts.hourCounts), 1);
            return (
              <div key={hour} className="flex items-center w-full text-left group p-2 rounded-md hover:bg-baylor-gold/10 transition-colors">
                <div className="w-20 text-sm text-baylor-green font-medium">
                  {formatMinutesToTime(parseInt(hour) * 60).replace(':00', '')}
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-gray-200 rounded-full h-6 relative overflow-hidden">
                    <div 
                      className="bg-baylor-green h-6 rounded-full transition-all duration-500 group-hover:bg-baylor-gold relative"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    >
                      {count > 0 && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                          {count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-24 text-sm text-baylor-green font-medium text-right">
                  {count} {count === 1 ? 'room' : 'rooms'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Faculty Workload */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6 border-b border-baylor-gold/30 pb-4">
          <div>
            <h3 className="text-lg font-serif font-semibold text-baylor-green">Faculty Teaching Load</h3>
            <p className="text-sm text-gray-600">Weekly hours and course assignments by faculty member</p>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-baylor-green/5">
              <tr>
                <SortableHeader label="Professor" sortKey="name" currentSort={facultySort} onSort={handleFacultySort} />
                <SortableHeader label="Unique Courses" sortKey="courses" currentSort={facultySort} onSort={handleFacultySort} />
                <SortableHeader label="Weekly Hours" sortKey="totalHours" currentSort={facultySort} onSort={handleFacultySort} />
                <th className="px-4 py-3 text-left text-sm font-serif font-semibold text-baylor-green">Load Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-baylor-green/10">
              {sortedFacultyWorkload.map(([instructor, data]) => {
                const loadStatus = data.totalHours >= 12 ? 'high' : data.totalHours >= 6 ? 'moderate' : 'light';
                const statusColors = {
                  high: 'bg-red-100 text-red-800',
                  moderate: 'bg-yellow-100 text-yellow-800',
                  light: 'bg-green-100 text-green-800'
                };
                
                return (
                  <tr key={instructor} className="hover:bg-baylor-green/5 transition-colors">
                    <td className="px-4 py-3 text-sm text-baylor-green font-medium">
                      <button
                        className="hover:underline text-left"
                        onClick={() => handleShowContactCard(instructor)}
                      >
                        {instructor}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-baylor-green/80 text-center font-medium">
                      {data.courses}
                    </td>
                    <td className="px-4 py-3 text-sm text-baylor-green/80 font-bold text-center">
                      {data.totalHours.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[loadStatus]}`}>
                        {loadStatus} load
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Room Utilization */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6 border-b border-baylor-gold/30 pb-4">
          <div>
            <h3 className="text-lg font-serif font-semibold text-baylor-green">Room Utilization</h3>
            <p className="text-sm text-gray-600">Weekly usage statistics by classroom</p>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedRoomUtilization.map(([room, data]) => (
            <div key={room} className="border border-baylor-green/20 rounded-lg p-4 bg-baylor-green/5 hover:bg-baylor-green/10 transition-all">
              <div className="font-medium text-baylor-green text-sm mb-2">{room}</div>
              <div className="text-2xl font-bold text-baylor-green">{data.hours.toFixed(1)}h</div>
              <div className="text-sm text-baylor-green/80">
                {data.classes} sessions/week
                {data.adjunctTaughtClasses > 0 && (
                  <span className="ml-2 text-baylor-gold font-medium">
                    ({data.adjunctTaughtClasses} adjunct)
                  </span>
                )}
              </div>
              <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-baylor-green h-2 rounded-full"
                    style={{ width: `${Math.min((data.hours / 40) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {((data.hours / 40) * 100).toFixed(0)}% utilization
                </div>
              </div>
            </div>
          ))}
        </div>
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

export default DepartmentInsights;