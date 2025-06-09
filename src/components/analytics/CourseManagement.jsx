import React, { useState, useMemo } from 'react';
import { Edit, Save, X, History, RotateCcw, Filter, Search, ChevronsUpDown } from 'lucide-react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import FacultyContactCard from '../FacultyContactCard';

const CourseManagement = ({ scheduleData, facultyData, editHistory, onDataUpdate, onRevertChange }) => {
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [historyVisible, setHistoryVisible] = useState(false);
  const [filters, setFilters] = useState({ instructor: [], day: [], room: [], searchTerm: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'Instructor', direction: 'ascending' });
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);

  // Get unique values for filters
  const uniqueInstructors = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Instructor))].sort(),
    [scheduleData]
  );

  const uniqueRooms = useMemo(() => 
    [...new Set(scheduleData.map(item => item.Room).filter(Boolean))].sort(),
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
        (item['Course Title']?.toLowerCase().includes(lowercasedFilter))
      );
    }
    
    // Apply multi-select filters
    if (filters.instructor.length > 0) {
      data = data.filter(item => filters.instructor.includes(item.Instructor));
    }
    if (filters.day.length > 0) {
      data = data.filter(item => filters.day.includes(item.Day));
    }
    if (filters.room.length > 0) {
      data = data.filter(item => filters.room.includes(item.Room));
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
        // Default string locale-aware sorting
        return aVal.localeCompare(bVal) * directionMultiplier;
      });
    }
    
    return data;
  }, [scheduleData, filters, sortConfig]);

  // Event handlers
  const handleEditClick = (row) => {
    setEditingRowId(row.id);
    setEditFormData(row);
  };

  const handleEditCancel = () => {
    setEditingRowId(null);
    setEditFormData({});
  };

  const handleEditSave = () => {
    onDataUpdate(editFormData);
    setEditingRowId(null);
  };

  const handleEditFormChange = (e) => {
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Course Management</h1>
        <p className="text-gray-600">View and edit course schedule information</p>
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
          <button
            onClick={() => setHistoryVisible(!historyVisible)}
            className="px-4 py-2 bg-baylor-gold text-baylor-green font-bold rounded-lg hover:bg-baylor-gold/90 transition-colors text-sm flex items-center"
          >
            <History size={16} className="mr-2" />
            {historyVisible ? 'Hide' : 'Show'} Change History ({editHistory.length})
          </button>
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
                placeholder="Search Course/Title..."
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
                    <div>
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
                          <input
                            name="Instructor"
                            value={editFormData.Instructor}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Course"
                            value={editFormData.Course}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Course Title"
                            value={editFormData['Course Title']}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Day"
                            value={editFormData.Day}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Start Time"
                            value={editFormData['Start Time']}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="End Time"
                            value={editFormData['End Time']}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Room"
                            value={editFormData.Room}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green"
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
                        <td className="px-4 py-3 text-gray-700 text-center">{row.Day}</td>
                        <td className="px-4 py-3 text-gray-700">{row['Start Time']}</td>
                        <td className="px-4 py-3 text-gray-700">{row['End Time']}</td>
                        <td className="px-4 py-3 text-gray-700">{row.Room}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleEditClick(row)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"
                            title="Edit this record"
                          >
                            <Edit size={16} />
                          </button>
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