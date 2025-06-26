import React, { useState, useMemo } from 'react';
import { Edit, Save, X, History, RotateCcw, Filter, Search, ChevronsUpDown, Plus, Trash2 } from 'lucide-react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import FacultyContactCard from '../FacultyContactCard';

const CourseManagement = ({ 
  scheduleData, 
  facultyData, 
  editHistory, 
  onDataUpdate, 
  onRevertChange
}) => {
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [historyVisible, setHistoryVisible] = useState(false);
  const [filters, setFilters] = useState({ instructor: [], day: [], room: [], searchTerm: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'Instructor', direction: 'ascending' });
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);

  // Get unique values for filters (using display names)
  const uniqueInstructors = useMemo(() => 
    [...new Set(scheduleData.filter(item => item && item.Instructor).map(item => item.Instructor))].sort(),
    [scheduleData]
  );

  const uniqueRooms = useMemo(() => 
    [...new Set(scheduleData.filter(item => item && item.Room).map(item => item.Room))].sort(),
    [scheduleData]
  );

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  // Parse time for sorting
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

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let data = [...scheduleData];
    
    // Apply text search filter
    if (filters.searchTerm) {
      const lowercasedFilter = filters.searchTerm.toLowerCase();
      data = data.filter(item =>
        (item.Course?.toLowerCase().includes(lowercasedFilter)) ||
        (item['Course Title']?.toLowerCase().includes(lowercasedFilter)) ||
        (item.Instructor?.toLowerCase().includes(lowercasedFilter))
      );
    }
    
    // Apply multi-select filters
    if (filters.instructor.length > 0) {
      data = data.filter(item => item && item.Instructor && filters.instructor.includes(item.Instructor));
    }
    if (filters.day.length > 0) {
      data = data.filter(item => item && item.Day && filters.day.includes(item.Day));
    }
    if (filters.room.length > 0) {
      data = data.filter(item => item && item.Room && filters.room.includes(item.Room));
    }

    // Apply sorting
    if (sortConfig.key) {
      data.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        const directionMultiplier = sortConfig.direction === 'ascending' ? 1 : -1;

        // Custom sorting logic for specific columns
        if (sortConfig.key === 'Day') {
          const dayOrder = { M: 1, T: 2, W: 3, R: 4, F: 5 };
          return ((dayOrder[aVal] || 99) - (dayOrder[bVal] || 99)) * directionMultiplier;
        }
        if (sortConfig.key === 'Start Time' || sortConfig.key === 'End Time') {
          return ((parseTime(aVal) || 0) - (parseTime(bVal) || 0)) * directionMultiplier;
        }
        // Default string locale-aware sorting with null checks
        const aString = (aVal || '').toString();
        const bString = (bVal || '').toString();
        return aString.localeCompare(bString) * directionMultiplier;
      });
    }
    
    return data;
  }, [scheduleData, filters, sortConfig]);

  // Validation function for schedule data
  const validateScheduleData = (data) => {
    const errors = [];
    
    if (!data.Course || data.Course.trim() === '') {
      errors.push('Course code is required');
    }
    
    if (!data.Day || !['M', 'T', 'W', 'R', 'F'].includes(data.Day)) {
      errors.push('Valid day is required (M, T, W, R, F)');
    }
    
    if (!data['Start Time'] || !data['End Time']) {
      errors.push('Start time and end time are required');
    }
    
    const startTime = parseTime(data['Start Time']);
    const endTime = parseTime(data['End Time']);
    
    if (startTime && endTime && startTime >= endTime) {
      errors.push('End time must be after start time');
    }
    
    return errors;
  };

  // Event handlers
  const handleEditClick = (row) => {
    setEditingRowId(row.id);
    setEditFormData({ ...row });
  };

  const handleEditCancel = () => {
    setEditingRowId(null);
    setEditFormData({});
  };

  const handleEditSave = () => {
    const errors = validateScheduleData(editFormData);
    
    if (errors.length > 0) {
      alert('Validation errors:\n' + errors.join('\n'));
      return;
    }
    
    onDataUpdate(editFormData);
    setEditingRowId(null);
    setEditFormData({});
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
    }));
  };

  const handleShowContactCard = (facultyName) => {
    const faculty = facultyData.find(f => f.name === facultyName);
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    }
  };

  const handleDeleteSchedule = (scheduleId) => {
    if (window.confirm('Are you sure you want to delete this schedule entry? This action cannot be undone.')) {
      // Note: You'll need to implement this in your App.jsx
      console.log('Delete schedule:', scheduleId);
      // onDeleteSchedule(scheduleId);
    }
  };

  const DataTableHeader = ({ columnKey, label }) => {
    const isSorted = sortConfig.key === columnKey;
    return (
      <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">
        <button className="flex items-center gap-1" onClick={() => handleSort(columnKey)}>
          {label}
          {isSorted ? (
            sortConfig.direction === 'ascending' ? '▲' : '▼'
          ) : (
            <ChevronsUpDown size={14} className="text-gray-400" />
          )}
        </button>
      </th>
    );
  };

  // Get course statistics
  const courseStats = useMemo(() => {
    const stats = {
      totalSessions: scheduleData.length,
      uniqueCourses: new Set(scheduleData.filter(s => s && s.Course).map(s => s.Course)).size,
      uniqueInstructors: new Set(scheduleData.filter(s => s && s.Instructor).map(s => s.Instructor)).size,
      adjunctTaughtSessions: scheduleData.filter(s => {
        if (!s || !s.Instructor) return false;
        // This would need faculty data to check if instructor is adjunct
        // For now, return 0 since this logic should be handled in the main analytics
        return false;
      }).length
    };
    
    // Calculate busiest day
    const dayCount = {};
    scheduleData.forEach(s => {
      if (s && s.Day) {
        dayCount[s.Day] = (dayCount[s.Day] || 0) + 1;
      }
    });
    
    const busiestDay = Object.entries(dayCount).reduce((max, [day, count]) => 
      count > max.count ? { day, count } : max, { day: '', count: 0 });
    
    stats.busiestDay = busiestDay;
    return stats;
  }, [scheduleData]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Course Management</h1>
        <p className="text-gray-600">View, edit, and manage course schedule information</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Sessions</div>
          <div className="text-2xl font-bold text-baylor-green">{courseStats.totalSessions}</div>
          <div className="text-xs text-gray-500">weekly class sessions</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Unique Courses</div>
          <div className="text-2xl font-bold text-baylor-green">{courseStats.uniqueCourses}</div>
          <div className="text-xs text-gray-500">different course offerings</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Active Instructors</div>
          <div className="text-2xl font-bold text-baylor-green">{courseStats.uniqueInstructors}</div>
          <div className="text-xs text-gray-500">faculty and staff</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Busiest Day</div>
          <div className="text-2xl font-bold text-baylor-green">
            {courseStats.busiestDay.day ? dayNames[courseStats.busiestDay.day]?.substring(0, 3) : 'N/A'}
          </div>
          <div className="text-xs text-gray-500">{courseStats.busiestDay.count} sessions</div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Header with History Toggle */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 border-b border-baylor-gold pb-4 gap-4">
          <div>
            <h2 className="text-xl font-serif font-semibold text-baylor-green">Course Schedule Data</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredAndSortedData.length} of {scheduleData.length} courses shown
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setHistoryVisible(!historyVisible)}
              className="px-4 py-2 bg-baylor-gold text-baylor-green font-bold rounded-lg hover:bg-baylor-gold/90 transition-colors text-sm flex items-center"
            >
              <History size={16} className="mr-2" />
              {historyVisible ? 'Hide' : 'Show'} History ({editHistory.length})
            </button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="p-4 mb-6 bg-gray-50 rounded-lg border">
          <h3 className="font-serif font-semibold text-baylor-green mb-3 flex items-center">
            <Filter size={16} className="mr-2" />
            Filters & Search
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MultiSelectDropdown
              options={uniqueInstructors}
              selected={filters.instructor}
              onChange={(selected) => setFilters({ ...filters, instructor: selected })}
              placeholder="Filter by Instructor..."
            />
            <MultiSelectDropdown
              options={Object.keys(dayNames)}
              selected={filters.day}
              onChange={(selected) => setFilters({ ...filters, day: selected })}
              placeholder="Filter by Day..."
              displayMap={dayNames}
            />
            <MultiSelectDropdown
              options={uniqueRooms}
              selected={filters.room}
              onChange={(selected) => setFilters({ ...filters, room: selected })}
              placeholder="Filter by Room..."
            />
            <div className="relative">
              <input
                type="text"
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900"
                placeholder="Search Course/Title/Instructor..."
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            </div>
          </div>
          
          {/* Clear Filters */}
          {(filters.instructor.length > 0 || filters.day.length > 0 || filters.room.length > 0 || filters.searchTerm) && (
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Active filters: {[
                  filters.instructor.length > 0 && `${filters.instructor.length} instructors`,
                  filters.day.length > 0 && `${filters.day.length} days`,
                  filters.room.length > 0 && `${filters.room.length} rooms`,
                  filters.searchTerm && 'text search'
                ].filter(Boolean).join(', ')}
              </div>
              <button
                onClick={() => setFilters({ instructor: [], day: [], room: [], searchTerm: '' })}
                className="text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Change History */}
        {historyVisible && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-lg font-serif font-semibold text-baylor-green mb-3">Change History</h3>
            {editHistory.length > 0 ? (
              <ul className="space-y-3 max-h-96 overflow-y-auto">
                {editHistory.map((change, index) => (
                  <li
                    key={index}
                    className={`p-3 rounded-lg flex items-center justify-between text-sm ${
                      change.isRevert ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'
                    } border`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">
                        <button
                          className="font-bold hover:underline"
                          onClick={() => handleShowContactCard(change.instructor)}
                        >
                          {change.instructor}
                        </button>
                        's <span className="font-bold">{change.course}</span> entry updated.
                      </p>
                      <p className="text-gray-600">
                        Field <span className="font-semibold">{change.field}</span> changed from "{change.oldValue}" to "{change.newValue}".
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(change.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!change.isRevert && (
                      <button
                        onClick={() => onRevertChange(change, index)}
                        className="p-2 rounded-full text-gray-600 hover:bg-gray-200 transition-colors"
                        title="Revert this change"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No changes have been made yet.</p>
            )}
          </div>
        )}

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-baylor-green/5">
              <tr>
                <DataTableHeader columnKey="Instructor" label="Instructor" />
                <DataTableHeader columnKey="Course" label="Course" />
                <DataTableHeader columnKey="Course Title" label="Course Title" />
                <DataTableHeader columnKey="Day" label="Day" />
                <DataTableHeader columnKey="Start Time" label="Start Time" />
                <DataTableHeader columnKey="End Time" label="End Time" />
                <DataTableHeader columnKey="Room" label="Room" />
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAndSortedData.length > 0 ? (
                filteredAndSortedData.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {editingRowId === row.id ? (
                      <>
                        <td className="p-1">
                          <select
                            name="Instructor"
                            value={editFormData.Instructor || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                          >
                            <option value="">Select Instructor</option>
                            <option value="Staff">Staff</option>
                            {facultyData.map(faculty => (
                              <option key={faculty.id} value={faculty.name}>
                                {faculty.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            name="Course"
                            value={editFormData.Course || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="Course Code"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Course Title"
                            value={editFormData['Course Title'] || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="Course Title"
                          />
                        </td>
                        <td className="p-1">
                          <select
                            name="Day"
                            value={editFormData.Day || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                          >
                            <option value="">Day</option>
                            {Object.entries(dayNames).map(([code, name]) => (
                              <option key={code} value={code}>{code} - {name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            name="Start Time"
                            value={editFormData['Start Time'] || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="e.g., 9:00 AM"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="End Time"
                            value={editFormData['End Time'] || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="e.g., 10:00 AM"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Room"
                            value={editFormData.Room || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="Room Name"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={handleEditSave}
                              className="p-2 text-green-600 hover:bg-green-100 rounded-full"
                              title="Save changes"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={handleEditCancel}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                              title="Cancel editing"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-gray-700">
                          <button
                            className="hover:underline text-left"
                            onClick={() => handleShowContactCard(row.Instructor)}
                          >
                            {row.Instructor}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{row.Course}</td>
                        <td className="px-4 py-3 text-gray-700">{row['Course Title']}</td>
                        <td className="px-4 py-3 text-gray-700 text-center">
                          <span className="px-2 py-1 bg-baylor-green/10 text-baylor-green rounded text-xs font-medium">
                            {row.Day}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{row['Start Time']}</td>
                        <td className="px-4 py-3 text-gray-700">{row['End Time']}</td>
                        <td className="px-4 py-3 text-gray-700">{row.Room}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => handleEditClick(row)}
                              className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"
                              title="Edit this record"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteSchedule(row.id)}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                              title="Delete this record"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                    {scheduleData.length === 0 ? (
                      <div>
                        <p className="text-lg mb-2">No course data available</p>
                        <p className="text-sm">Import schedule data to get started</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-lg mb-2">No courses match your filters</p>
                        <p className="text-sm">Try adjusting your search criteria</p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

export default CourseManagement;