import React, { useState, useMemo } from 'react';
import { Edit, Save, X, GraduationCap, Mail, Phone, PhoneOff, Clock, Search, ArrowUpDown, Plus, RotateCcw, History, Trash2, Filter, UserCog } from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';
import CustomAlert from './CustomAlert';

const formatPhoneNumber = (phoneStr) => {
    if (!phoneStr) return '-';
    const cleaned = ('' + phoneStr).replace(/\D/g, '');
    if (cleaned.length === 10) {
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return `(${match[1]}) ${match[2]} - ${match[3]}`;
        }
    }
    return phoneStr;
};

const StudentDirectory = ({ studentData, rawScheduleData, onStudentUpdate, onStudentDelete, showNotification }) => {
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [nameSort, setNameSort] = useState('firstName'); // 'firstName' or 'lastName'
  const [selectedStudentForCard, setSelectedStudentForCard] = useState(null);
  const [errors, setErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    phone: '',
    startDate: '',
    hourlyRate: '',
    supervisor: '',
    jobTitle: '',
    primaryBuildings: [], // e.g., ["Mary Gibbs Jones", "Goebel"]
    weeklySchedule: [], // [{ day: 'M', start: '09:00', end: '12:00' }]
    hasNoPhone: false,
  });

  // Undo functionality
  const [changeHistory, setChangeHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    departments: { include: [], exclude: [] },
    supervisors: { include: [], exclude: [] },
    hasEmail: true,
    hasPhone: true,
    activeOnly: true
  });

  // Extract departments and supervisors for filtering
  const availableJobTitles = useMemo(() => {
    const set = new Set();
    studentData.forEach(student => { if (student.jobTitle) set.add(student.jobTitle); });
    return Array.from(set).sort();
  }, [studentData]);

  const availableSupervisors = useMemo(() => {
    const supervisors = new Set();
    studentData.forEach(student => {
      if (student.supervisor) supervisors.add(student.supervisor);
    });
    return Array.from(supervisors).sort();
  }, [studentData]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = studentData.filter(student => {
      if (!student) return false;
      
      // Text filter
      if (filterText) {
        const searchText = filterText.toLowerCase();
        const matchesText = (
          student.name?.toLowerCase().includes(searchText) ||
          student.email?.toLowerCase().includes(searchText) ||
          student.supervisor?.toLowerCase().includes(searchText) ||
          student.jobTitle?.toLowerCase().includes(searchText)
        );
        if (!matchesText) return false;
      }

      return true;
    });

    // Sort data
    return filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortConfig.key) {
        case 'name':
          if (nameSort === 'firstName') {
            aValue = a.firstName || a.name?.split(' ')[0] || '';
            bValue = b.firstName || b.name?.split(' ')[0] || '';
          } else {
            aValue = a.lastName || a.name?.split(' ').slice(-1)[0] || '';
            bValue = b.lastName || b.name?.split(' ').slice(-1)[0] || '';
          }
          break;
        case 'email':
          aValue = a.email || '';
          bValue = b.email || '';
          break;
        case 'jobTitle':
          aValue = a.jobTitle || '';
          bValue = b.jobTitle || '';
          break;
        case 'supervisor':
          aValue = a.supervisor || '';
          bValue = b.supervisor || '';
          break;
        default:
          aValue = a[sortConfig.key] || '';
          bValue = b[sortConfig.key] || '';
      }

      if (sortConfig.direction === 'ascending') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });
  }, [studentData, filterText, sortConfig, nameSort, filters]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
    }));
  };

  const startEdit = (student) => {
    setEditingId(student.id);
    setEditFormData({
      ...student,
      weeklySchedule: Array.isArray(student.weeklySchedule) ? [...student.weeklySchedule] : [],
      primaryBuildings: Array.isArray(student.primaryBuildings) ? [...student.primaryBuildings] : (student.primaryBuilding ? [student.primaryBuilding] : [])
    });
    setErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFormData({});
    setErrors({});
  };

  const validateStudentData = (data) => {
    const errors = {};
    
    if (!data.name?.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!data.email?.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!data.hasNoPhone && !data.phone?.trim()) {
      errors.phone = 'Phone number is required (or check "No Phone")';
    }
    
    if (!Array.isArray(data.weeklySchedule) || data.weeklySchedule.length === 0) {
      errors.weeklySchedule = 'At least one weekly schedule entry is required';
    }
    
    return errors;
  };

  const saveEdit = async () => {
    const validationErrors = validateStudentData(editFormData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      // Save change to history for undo
      const originalStudent = studentData.find(s => s.id === editingId);
      setChangeHistory(prev => [...prev, {
        type: 'update',
        timestamp: new Date().toISOString(),
        originalData: originalStudent,
        newData: {...editFormData}
      }]);

      await onStudentUpdate(editFormData);
      setEditingId(null);
      setEditFormData({});
      setErrors({});
    } catch (error) {
      console.error('Error updating student:', error);
      setErrors({ general: 'Failed to update student. Please try again.' });
    }
  };

  const startCreate = () => {
    setIsCreating(true);
    setErrors({});
  };

  const cancelCreate = () => {
    setIsCreating(false);
    setNewStudent({
      name: '',
      email: '',
      phone: '',
      startDate: '',
      hourlyRate: '',
      supervisor: '',
      jobTitle: '',
      primaryBuildings: [],
      weeklySchedule: [],
      hasNoPhone: false,
    });
    setErrors({});
  };

  const saveCreate = async () => {
    const validationErrors = validateStudentData(newStudent);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      const studentToCreate = {
        ...newStudent,
        isActive: true
      };

      await onStudentUpdate(studentToCreate);
      setIsCreating(false);
      setNewStudent({
        name: '',
        email: '',
        phone: '',
        workSchedule: '',
        startDate: '',
        hourlyRate: '',
        supervisor: '',
        department: '',
        hasNoPhone: false,
      });
      setErrors({});
    } catch (error) {
      console.error('Error creating student:', error);
      setErrors({ general: 'Failed to create student. Please try again.' });
    }
  };

  const confirmDelete = (student) => {
    setStudentToDelete(student);
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (studentToDelete && onStudentDelete) {
      try {
        // Save to history for undo
        setChangeHistory(prev => [...prev, {
          type: 'delete',
          timestamp: new Date().toISOString(),
          originalData: studentToDelete
        }]);

        await onStudentDelete(studentToDelete.id);
        setShowDeleteConfirm(false);
        setStudentToDelete(null);
      } catch (error) {
        console.error('Error deleting student:', error);
      }
    }
  };

  const undoLastChange = () => {
    const lastChange = changeHistory[changeHistory.length - 1];
    if (lastChange) {
      if (lastChange.type === 'update') {
        onStudentUpdate(lastChange.originalData);
      } else if (lastChange.type === 'delete') {
        onStudentUpdate(lastChange.originalData);
      }
      setChangeHistory(prev => prev.slice(0, -1));
    }
  };

  // Helpers for weekly schedule editing
  const [scheduleDraft, setScheduleDraft] = useState({ day: 'M', start: '', end: '' });
  const addScheduleEntry = () => {
    if (!scheduleDraft.day || !scheduleDraft.start || !scheduleDraft.end) return;
    const startMin = scheduleDraft.start;
    const endMin = scheduleDraft.end;
    if (startMin >= endMin) {
      setErrors(prev => ({ ...prev, weeklySchedule: 'End time must be after start time' }));
      return;
    }
    setNewStudent(prev => ({
      ...prev,
      weeklySchedule: [...prev.weeklySchedule, { ...scheduleDraft }]
    }));
    setScheduleDraft({ day: 'M', start: '', end: '' });
    setErrors(prev => ({ ...prev, weeklySchedule: undefined }));
  };
  const removeScheduleEntry = (index) => {
    setNewStudent(prev => ({
      ...prev,
      weeklySchedule: prev.weeklySchedule.filter((_, i) => i !== index)
    }));
  };

  const [editScheduleDraft, setEditScheduleDraft] = useState({ day: 'M', start: '', end: '' });
  const addEditScheduleEntry = () => {
    if (!editScheduleDraft.day || !editScheduleDraft.start || !editScheduleDraft.end) return;
    if (editScheduleDraft.start >= editScheduleDraft.end) {
      setErrors(prev => ({ ...prev, weeklySchedule: 'End time must be after start time' }));
      return;
    }
    setEditFormData(prev => ({
      ...prev,
      weeklySchedule: [...(prev.weeklySchedule || []), { ...editScheduleDraft }]
    }));
    setEditScheduleDraft({ day: 'M', start: '', end: '' });
    setErrors(prev => ({ ...prev, weeklySchedule: undefined }));
  };
  const removeEditScheduleEntry = (index) => {
    setEditFormData(prev => ({
      ...prev,
      weeklySchedule: (prev.weeklySchedule || []).filter((_, i) => i !== index)
    }));
  };

  const formatWeeklySchedule = (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return '-';
    const dayOrder = ['M','T','W','R','F'];
    const dayLabels = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };
    const grouped = {};
    entries.forEach(e => {
      const key = `${e.start}-${e.end}`;
      grouped[key] = grouped[key] || [];
      grouped[key].push(e.day);
    });
    return Object.entries(grouped).map(([time, days]) => {
      const orderedDays = days.sort((a,b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      const dayStr = orderedDays.map(d => dayLabels[d]).join(',');
      const [s, e] = time.split('-');
      return `${dayStr} ${s}–${e}`;
    }).join(' | ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-baylor-green" />
            Student Workers
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {filteredAndSortedData.length} student{filteredAndSortedData.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changeHistory.length > 0 && (
            <button
              onClick={undoLastChange}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center gap-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              Undo
            </button>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center gap-2 text-sm"
          >
            <History className="h-4 w-4" />
            History ({changeHistory.length})
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center gap-2 text-sm"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-baylor-green hover:bg-baylor-green/90 text-white rounded-md flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Student
          </button>
        </div>
      </div>

      {/* Shared datalists for suggestions */}
      <datalist id="supervisor-options">
        {availableSupervisors.map(s => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="jobtitle-options">
        {availableJobTitles.map(t => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <input
          type="text"
          placeholder="Search by name, email, department, supervisor, or schedule..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
        />
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Supervisor</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setFilters(prev => ({
                      ...prev,
                      supervisors: { ...prev.supervisors, include: [e.target.value] }
                    }));
                  }
                }}
              >
                <option value="">All Supervisors</option>
                {availableSupervisors.map(supervisor => (
                  <option key={supervisor} value={supervisor}>{supervisor}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Create New Student Form */}
      {isCreating && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-4">Add New Student Worker</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={newStudent.name}
                onChange={(e) => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                className={`w-full border rounded-md px-3 py-2 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Full name"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={newStudent.email}
                onChange={(e) => setNewStudent(prev => ({ ...prev, email: e.target.value }))}
                className={`w-full border rounded-md px-3 py-2 ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="student@baylor.edu"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  value={newStudent.phone}
                  onChange={(e) => setNewStudent(prev => ({ ...prev, phone: e.target.value }))}
                  disabled={newStudent.hasNoPhone}
                  className={`flex-1 border rounded-md px-3 py-2 ${errors.phone ? 'border-red-500' : 'border-gray-300'} ${newStudent.hasNoPhone ? 'bg-gray-100' : ''}`}
                  placeholder="(254) 710-1234"
                />
                <label className="flex items-center text-sm">
                  <input
                    type="checkbox"
                    checked={newStudent.hasNoPhone}
                    onChange={(e) => setNewStudent(prev => ({ ...prev, hasNoPhone: e.target.checked, phone: e.target.checked ? '' : prev.phone }))}
                    className="mr-1"
                  />
                  No Phone
                </label>
              </div>
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weekly Schedule *</label>
              <div className="flex gap-2 items-end">
                <select
                  className="border rounded-md px-2 py-2"
                  value={scheduleDraft.day}
                  onChange={(e) => setScheduleDraft(prev => ({ ...prev, day: e.target.value }))}
                >
                  <option value="M">Mon</option>
                  <option value="T">Tue</option>
                  <option value="W">Wed</option>
                  <option value="R">Thu</option>
                  <option value="F">Fri</option>
                </select>
                <input type="time" className="border rounded-md px-2 py-2" value={scheduleDraft.start} onChange={e => setScheduleDraft(prev => ({ ...prev, start: e.target.value }))} />
                <span className="text-gray-500">to</span>
                <input type="time" className="border rounded-md px-2 py-2" value={scheduleDraft.end} onChange={e => setScheduleDraft(prev => ({ ...prev, end: e.target.value }))} />
                <button onClick={addScheduleEntry} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm">Add</button>
              </div>
              {errors.weeklySchedule && <p className="text-red-500 text-xs mt-1">{errors.weeklySchedule}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {newStudent.weeklySchedule.map((entry, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded">
                    {entry.day} {entry.start}-{entry.end}
                    <button onClick={() => removeScheduleEntry(idx)} className="text-gray-500 hover:text-gray-700"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {newStudent.weeklySchedule.length === 0 && (
                  <span className="text-xs text-gray-500">No entries added</span>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
              <input
                list="supervisor-options"
                type="text"
                value={newStudent.supervisor}
                onChange={(e) => setNewStudent(prev => ({ ...prev, supervisor: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Supervisor name (select or type new)"
              />
              <datalist id="supervisor-options">
                {availableSupervisors.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
              <input
                list="jobtitle-options"
                type="text"
                value={newStudent.jobTitle}
                onChange={(e) => setNewStudent(prev => ({ ...prev, jobTitle: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Select or type a title"
              />
              <datalist id="jobtitle-options">
                {availableJobTitles.map(t => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Primary Building(s)</label>
              <div className="flex gap-4 items-center text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={newStudent.primaryBuildings.includes('Mary Gibbs Jones')} onChange={(e) => setNewStudent(prev => ({
                    ...prev,
                    primaryBuildings: e.target.checked
                      ? Array.from(new Set([...(prev.primaryBuildings || []), 'Mary Gibbs Jones']))
                      : (prev.primaryBuildings || []).filter(b => b !== 'Mary Gibbs Jones')
                  }))} /> Mary Gibbs Jones
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={newStudent.primaryBuildings.includes('Goebel')} onChange={(e) => setNewStudent(prev => ({
                    ...prev,
                    primaryBuildings: e.target.checked
                      ? Array.from(new Set([...(prev.primaryBuildings || []), 'Goebel']))
                      : (prev.primaryBuildings || []).filter(b => b !== 'Goebel')
                  }))} /> Goebel
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={newStudent.startDate}
                onChange={(e) => setNewStudent(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate</label>
              <input
                type="number"
                step="0.01"
                value={newStudent.hourlyRate}
                onChange={(e) => setNewStudent(prev => ({ ...prev, hourlyRate: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="10.00"
              />
            </div>
          </div>
          {errors.general && (
            <p className="text-red-500 text-sm mt-2">{errors.general}</p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={cancelCreate}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={saveCreate}
              className="px-4 py-2 bg-baylor-green text-white rounded-md hover:bg-baylor-green/90"
            >
              <Save className="h-4 w-4 inline mr-2" />
              Save Student
            </button>
          </div>
        </div>
      )}

      {/* Students Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name
                    <ArrowUpDown className="h-3 w-3" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNameSort(nameSort === 'firstName' ? 'lastName' : 'firstName');
                      }}
                      className="ml-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      ({nameSort === 'firstName' ? 'First' : 'Last'})
                    </button>
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center gap-1">
                    Email
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Weekly Schedule
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('jobTitle')}
                >
                  <div className="flex items-center gap-1">
                    Job Title
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('supervisor')}
                >
                  <div className="flex items-center gap-1">
                    Supervisor
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Building(s)
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedData.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  {editingId === student.id ? (
                    // Edit row
                    <>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={editFormData.name || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                          className={`w-full border rounded px-2 py-1 text-sm ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="email"
                          value={editFormData.email || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                          className={`w-full border rounded px-2 py-1 text-sm ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="tel"
                            value={editFormData.phone || ''}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))}
                            disabled={editFormData.hasNoPhone}
                            className={`flex-1 border rounded px-2 py-1 text-sm ${errors.phone ? 'border-red-500' : 'border-gray-300'} ${editFormData.hasNoPhone ? 'bg-gray-100' : ''}`}
                          />
                          <label className="flex items-center text-xs">
                            <input
                              type="checkbox"
                              checked={editFormData.hasNoPhone || false}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, hasNoPhone: e.target.checked, phone: e.target.checked ? '' : prev.phone }))}
                              className="mr-1"
                            />
                            No Phone
                          </label>
                        </div>
                        {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                      </td>
              <td className="px-6 py-4">
                <div className="flex gap-2 items-end">
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={editScheduleDraft.day}
                    onChange={(e) => setEditScheduleDraft(prev => ({ ...prev, day: e.target.value }))}
                  >
                    <option value="M">Mon</option>
                    <option value="T">Tue</option>
                    <option value="W">Wed</option>
                    <option value="R">Thu</option>
                    <option value="F">Fri</option>
                  </select>
                  <input type="time" className="border rounded px-2 py-1 text-sm" value={editScheduleDraft.start} onChange={e => setEditScheduleDraft(prev => ({ ...prev, start: e.target.value }))} />
                  <span className="text-gray-500 text-xs">to</span>
                  <input type="time" className="border rounded px-2 py-1 text-sm" value={editScheduleDraft.end} onChange={e => setEditScheduleDraft(prev => ({ ...prev, end: e.target.value }))} />
                  <button onClick={addEditScheduleEntry} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs">Add</button>
                </div>
                {errors.weeklySchedule && <p className="text-red-500 text-xs mt-1">{errors.weeklySchedule}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(editFormData.weeklySchedule || []).map((entry, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded">
                      {entry.day} {entry.start}-{entry.end}
                      <button onClick={() => removeEditScheduleEntry(idx)} className="text-gray-500 hover:text-gray-700"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  {(editFormData.weeklySchedule || []).length === 0 && (
                    <span className="text-xs text-gray-500">No entries added</span>
                  )}
                </div>
              </td>
                      <td className="px-6 py-4">
                <input
                  list="jobtitle-options"
                  type="text"
                  value={editFormData.jobTitle || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, jobTitle: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          list="supervisor-options"
                          type="text"
                          value={editFormData.supervisor || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, supervisor: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </td>
              <td className="px-6 py-4">
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={(editFormData.primaryBuildings || []).includes('Mary Gibbs Jones')} onChange={(e) => setEditFormData(prev => ({
                      ...prev,
                      primaryBuildings: e.target.checked
                        ? Array.from(new Set([...(prev.primaryBuildings || []), 'Mary Gibbs Jones']))
                        : (prev.primaryBuildings || []).filter(b => b !== 'Mary Gibbs Jones')
                    }))} /> MGJ
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={(editFormData.primaryBuildings || []).includes('Goebel')} onChange={(e) => setEditFormData(prev => ({
                      ...prev,
                      primaryBuildings: e.target.checked
                        ? Array.from(new Set([...(prev.primaryBuildings || []), 'Goebel']))
                        : (prev.primaryBuildings || []).filter(b => b !== 'Goebel')
                    }))} /> Goebel
                  </label>
                </div>
              </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={saveEdit}
                            className="text-green-600 hover:text-green-800"
                            title="Save"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-gray-600 hover:text-gray-800"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    // Display row
                    <>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {student.name}
                            </div>
                            {student.startDate && (
                              <div className="text-sm text-gray-500">
                                Started: {new Date(student.startDate).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Mail className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{student.email || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {student.hasNoPhone ? (
                            <PhoneOff className="h-4 w-4 text-gray-400 mr-2" />
                          ) : (
                            <Phone className="h-4 w-4 text-gray-400 mr-2" />
                          )}
                          <span className="text-sm text-gray-900">
                            {student.hasNoPhone ? 'No Phone' : formatPhoneNumber(student.phone)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{formatWeeklySchedule(student.weeklySchedule) || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{student.jobTitle || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{student.supervisor || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{Array.isArray(student.primaryBuildings) ? student.primaryBuildings.join(', ') : (student.primaryBuilding || '-')}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setSelectedStudentForCard(student)}
                            className="text-baylor-green hover:text-baylor-green/80"
                            title="View Contact Card"
                          >
                            <UserCog className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => startEdit(student)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(student)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredAndSortedData.length === 0 && (
          <div className="text-center py-12">
            <GraduationCap className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No student workers found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {filterText ? 'Try adjusting your search criteria.' : 'Get started by adding a new student worker.'}
            </p>
          </div>
        )}
      </div>

      {/* Contact Card Modal */}
      {selectedStudentForCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <FacultyContactCard
              person={selectedStudentForCard}
              onClose={() => setSelectedStudentForCard(null)}
              personType="student"
              onUpdate={onStudentUpdate}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete {studentToDelete?.name}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change History */}
      {showHistory && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-4">Recent Changes</h4>
          {changeHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No changes recorded.</p>
          ) : (
            <div className="space-y-2">
              {changeHistory.slice(-5).reverse().map((change, index) => (
                <div key={index} className="text-sm">
                  <span className="font-medium">{change.type}</span>: {change.originalData?.name}
                  <span className="text-gray-500 ml-2">
                    {new Date(change.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentDirectory; 