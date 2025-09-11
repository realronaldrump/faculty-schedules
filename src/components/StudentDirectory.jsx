import React, { useState, useMemo } from 'react';
import { Edit, Save, X, GraduationCap, Mail, Phone, PhoneOff, Clock, Search, ArrowUpDown, Plus, RotateCcw, History, Trash2, Filter } from 'lucide-react';
import MultiSelectDropdown from './MultiSelectDropdown';
import FacultyContactCard from './FacultyContactCard';

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
    jobs: [
      { jobTitle: '', supervisor: '', hourlyRate: '', location: [], weeklySchedule: [] }
    ]
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
    jobTitles: { include: [], exclude: [] },
    buildings: { include: [], exclude: [] },
    hasEmail: true,
    hasPhone: true,
    activeOnly: true
  });

  // Extract departments and supervisors for filtering
  const availableJobTitles = useMemo(() => {
    const set = new Set();
    studentData.forEach(student => {
      // include top-level for legacy
      if (student.jobTitle) set.add(student.jobTitle);
      // include each job title
      if (Array.isArray(student.jobs)) {
        student.jobs.forEach(j => { if (j?.jobTitle) set.add(j.jobTitle); });
      }
    });
    return Array.from(set).sort();
  }, [studentData]);

  const availableSupervisors = useMemo(() => {
    const supervisors = new Set();
    studentData.forEach(student => {
      if (student.supervisor) supervisors.add(student.supervisor);
    });
    return Array.from(supervisors).sort();
  }, [studentData]);

  const availableBuildings = useMemo(() => {
    const buildings = new Set();
    (studentData || []).forEach(student => {
      if (Array.isArray(student.primaryBuildings)) {
        student.primaryBuildings.forEach(b => { if (b) buildings.add(b); });
      } else if (student.primaryBuilding) {
        buildings.add(student.primaryBuilding);
      }
      if (Array.isArray(student.jobs)) {
        student.jobs.forEach(j => {
          if (Array.isArray(j.location)) {
            j.location.forEach(b => { if (b) buildings.add(b); });
          } else if (j.location) {
            buildings.add(j.location);
          }
        });
      }
    });
    return Array.from(buildings).sort();
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
          student.jobTitle?.toLowerCase().includes(searchText) ||
          (Array.isArray(student.jobs) && student.jobs.some(j => (j?.jobTitle || '').toLowerCase().includes(searchText) || (j?.supervisor || '').toLowerCase().includes(searchText)))
        );
        if (!matchesText) return false;
      }

      // Job Titles filter (include/exclude across top-level and job entries)
      if ((filters.jobTitles?.include?.length || 0) > 0 || (filters.jobTitles?.exclude?.length || 0) > 0) {
        const titlesSet = new Set();
        if (student.jobTitle) titlesSet.add(student.jobTitle);
        if (Array.isArray(student.jobs)) {
          student.jobs.forEach(j => { if (j?.jobTitle) titlesSet.add(j.jobTitle); });
        }
        const titles = Array.from(titlesSet);
        const includeOk = (filters.jobTitles.include.length === 0) || titles.some(t => filters.jobTitles.include.includes(t));
        const excludeOk = (filters.jobTitles.exclude.length === 0) || !titles.some(t => filters.jobTitles.exclude.includes(t));
        if (!(includeOk && excludeOk)) return false;
      }

      // Buildings filter (include/exclude across primaryBuildings/primaryBuilding and job locations)
      if ((filters.buildings?.include?.length || 0) > 0 || (filters.buildings?.exclude?.length || 0) > 0) {
        const bldgSet = new Set();
        if (Array.isArray(student.primaryBuildings)) {
          student.primaryBuildings.forEach(b => { if (b) bldgSet.add(b); });
        } else if (student.primaryBuilding) {
          bldgSet.add(student.primaryBuilding);
        }
        if (Array.isArray(student.jobs)) {
          student.jobs.forEach(j => {
            if (Array.isArray(j.location)) j.location.forEach(b => { if (b) bldgSet.add(b); });
            else if (j.location) bldgSet.add(j.location);
          });
        }
        const studentBuildings = Array.from(bldgSet);
        const includeOk = (filters.buildings.include.length === 0) || studentBuildings.some(b => filters.buildings.include.includes(b));
        const excludeOk = (filters.buildings.exclude.length === 0) || !studentBuildings.some(b => filters.buildings.exclude.includes(b));
        if (!(includeOk && excludeOk)) return false;
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
      primaryBuildings: Array.isArray(student.primaryBuildings) ? [...student.primaryBuildings] : (student.primaryBuilding ? [student.primaryBuilding] : []),
      jobs: Array.isArray(student.jobs) && student.jobs.length > 0 ? student.jobs : [{
        jobTitle: student.jobTitle || '',
        supervisor: student.supervisor || '',
        hourlyRate: student.hourlyRate || '',
        location: Array.isArray(student.primaryBuildings) ? student.primaryBuildings : (student.primaryBuilding ? [student.primaryBuilding] : []),
        weeklySchedule: Array.isArray(student.weeklySchedule) ? [...student.weeklySchedule] : []
      }]
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
    
    const hasTopLevel = Array.isArray(data.weeklySchedule) && data.weeklySchedule.length > 0;
    const hasJobLevel = Array.isArray(data.jobs) && data.jobs.some(j => Array.isArray(j.weeklySchedule) && j.weeklySchedule.length > 0);
    if (!hasTopLevel && !hasJobLevel) {
      errors.weeklySchedule = 'At least one job must have a weekly schedule entry';
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

      const jobs = Array.isArray(editFormData.jobs) ? editFormData.jobs : [];
      const firstJob = jobs[0] || {};
      const unifiedWeekly = jobs.flatMap(j => Array.isArray(j.weeklySchedule) ? j.weeklySchedule : []);
      const unifiedBuildings = Array.from(new Set(jobs.flatMap(j => Array.isArray(j.location) ? j.location : (j.location ? [j.location] : []))));
      const payload = {
        ...editFormData,
        jobs,
        weeklySchedule: unifiedWeekly.length > 0 ? unifiedWeekly : (editFormData.weeklySchedule || []),
        primaryBuildings: unifiedBuildings.length > 0 ? unifiedBuildings : (editFormData.primaryBuildings || []),
        jobTitle: firstJob.jobTitle || editFormData.jobTitle || '',
        supervisor: firstJob.supervisor || editFormData.supervisor || '',
        hourlyRate: firstJob.hourlyRate || editFormData.hourlyRate || ''
      };

      await onStudentUpdate(payload);
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
      jobs: [ { jobTitle: '', supervisor: '', hourlyRate: '', location: [], weeklySchedule: [] } ]
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
      const jobs = Array.isArray(newStudent.jobs) ? newStudent.jobs : [];
      const firstJob = jobs[0] || {};
      const unifiedWeekly = jobs.flatMap(j => Array.isArray(j.weeklySchedule) ? j.weeklySchedule : []);
      const unifiedBuildings = Array.from(new Set(jobs.flatMap(j => Array.isArray(j.location) ? j.location : (j.location ? [j.location] : []))));
      const studentToCreate = {
        ...newStudent,
        isActive: true,
        jobs,
        weeklySchedule: unifiedWeekly.length > 0 ? unifiedWeekly : (newStudent.weeklySchedule || []),
        primaryBuildings: unifiedBuildings.length > 0 ? unifiedBuildings : (newStudent.primaryBuildings || []),
        jobTitle: firstJob.jobTitle || newStudent.jobTitle || '',
        supervisor: firstJob.supervisor || newStudent.supervisor || '',
        hourlyRate: firstJob.hourlyRate || newStudent.hourlyRate || ''
      };

      await onStudentUpdate(studentToCreate);
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
        jobs: [ { jobTitle: '', supervisor: '', hourlyRate: '', location: [], weeklySchedule: [] } ]
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
  const [newJobsDrafts, setNewJobsDrafts] = useState([{ day: 'M', start: '', end: '' }]);
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
  const [editJobsDrafts, setEditJobsDrafts] = useState([{ day: 'M', start: '', end: '' }]);
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
    const to12Hour = (timeStr) => {
      if (!timeStr || typeof timeStr !== 'string') return timeStr || '';
      const [hStr, mStr = '00'] = timeStr.split(':');
      let hour = parseInt(hStr, 10);
      if (Number.isNaN(hour)) return timeStr;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      if (hour === 0) hour = 12;
      const minutes = (mStr || '00').padStart(2, '0');
      return `${hour}:${minutes} ${ampm}`;
    };
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
      return `${dayStr} ${to12Hour(s)}–${to12Hour(e)}`;
    }).join(' | ');
  };

  const formatTime12h = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return timeStr || '';
    const [hStr, mStr = '00'] = timeStr.split(':');
    let hour = parseInt(hStr, 10);
    if (Number.isNaN(hour)) return timeStr;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    const minutes = (mStr || '00').padStart(2, '0');
    return `${hour}:${minutes} ${ampm}`;
  };

  const SortableHeader = ({ label, columnKey }) => {
    const isSorted = sortConfig.key === columnKey;
    const directionIcon = isSorted ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : <ArrowUpDown size={14} className="opacity-30" />;
    return (
      <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">
        <button className="flex items-center gap-2" onClick={() => handleSort(columnKey)}>
          {label}
          {directionIcon}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
          <h2 className="text-xl font-serif font-semibold text-baylor-green flex items-center">
            <GraduationCap className="mr-2 text-baylor-gold" size={20} />
            Student Directory ({filteredAndSortedData.length})
          </h2>
          <div className="flex items-center gap-4">
            {sortConfig.key === 'name' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Sort by:</span>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    onClick={() => setNameSort('firstName')}
                    className={`px-3 py-1 text-xs ${
                      nameSort === 'firstName' ? 'bg-baylor-green text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    First Name
                  </button>
                  <button
                    onClick={() => setNameSort('lastName')}
                    className={`px-3 py-1 text-xs ${
                      nameSort === 'lastName' ? 'bg-baylor-green text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Last Name
                  </button>
                </div>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Filter directory..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                showFilters ? 'bg-baylor-green text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Filter size={16} />
              Filters
            </button>
            {changeHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 px-3 py-2 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 transition-colors"
              >
                <History size={16} />
                Changes ({changeHistory.length})
              </button>
            )}
            {changeHistory.length > 0 && (
              <button
                onClick={undoLastChange}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RotateCcw size={16} />
                Undo
              </button>
            )}
            <button
              onClick={startCreate}
              className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
            >
              <Plus size={18} />
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

        {/* Advanced Filters */}
        {showFilters && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Advanced Filters</h3>
            <button
              onClick={() => {
                setFilters({
                  departments: { include: [], exclude: [] },
                  supervisors: { include: [], exclude: [] },
                  jobTitles: { include: [], exclude: [] },
                  buildings: { include: [], exclude: [] },
                  hasEmail: true,
                  hasPhone: true,
                  activeOnly: true
                });
                setFilterText('');
              }}
              className="text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
            >
              Clear All Filters
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Supervisor</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Include Job Titles</label>
              <MultiSelectDropdown
                options={availableJobTitles}
                selected={filters.jobTitles.include}
                onChange={(selected) => setFilters(prev => ({
                  ...prev,
                  jobTitles: { ...prev.jobTitles, include: selected }
                }))}
                placeholder="Select job titles to include..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Exclude Job Titles</label>
              <MultiSelectDropdown
                options={availableJobTitles}
                selected={filters.jobTitles.exclude}
                onChange={(selected) => setFilters(prev => ({
                  ...prev,
                  jobTitles: { ...prev.jobTitles, exclude: selected }
                }))}
                placeholder="Select job titles to exclude..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Include Buildings</label>
              <MultiSelectDropdown
                options={availableBuildings}
                selected={filters.buildings.include}
                onChange={(selected) => setFilters(prev => ({
                  ...prev,
                  buildings: { ...prev.buildings, include: selected }
                }))}
                placeholder="Select buildings to include..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Exclude Buildings</label>
              <MultiSelectDropdown
                options={availableBuildings}
                selected={filters.buildings.exclude}
                onChange={(selected) => setFilters(prev => ({
                  ...prev,
                  buildings: { ...prev.buildings, exclude: selected }
                }))}
                placeholder="Select buildings to exclude..."
              />
            </div>
          </div>
        </div>
        )}

        {/* Create New Student Form */}
        {isCreating && (
        <div className="bg-baylor-gold/5 border border-baylor-gold/30 rounded-lg p-4">
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
              <div className="space-y-4">
                {(newStudent.jobs || []).map((job, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-md p-3">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-medium text-gray-900">Job {idx + 1}</div>
                      {(newStudent.jobs || []).length > 1 && (
                        <button onClick={() => {
                          setNewStudent(prev => ({ ...prev, jobs: prev.jobs.filter((_, i) => i !== idx) }));
                          setNewJobsDrafts(prev => prev.filter((_, i) => i !== idx));
                        }} className="text-red-600 text-xs">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <input type="text" placeholder="Job Title" value={job.jobTitle || ''} onChange={e => setNewStudent(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, jobTitle: e.target.value } : j)}))} className="border rounded-md px-3 py-2" />
                      <input type="text" placeholder="Supervisor" value={job.supervisor || ''} onChange={e => setNewStudent(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, supervisor: e.target.value } : j)}))} className="border rounded-md px-3 py-2" />
                      <input type="number" step="0.01" placeholder="Hourly Rate" value={job.hourlyRate || ''} onChange={e => setNewStudent(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, hourlyRate: e.target.value } : j)}))} className="border rounded-md px-3 py-2" />
                      <div className="flex gap-4 items-center text-sm">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={(job.location || []).includes('Mary Gibbs Jones')} onChange={(e) => setNewStudent(prev => ({
                            ...prev,
                            jobs: prev.jobs.map((j,i)=> i===idx? { ...j, location: e.target.checked ? Array.from(new Set([...(j.location || []), 'Mary Gibbs Jones'])) : (j.location || []).filter(b => b !== 'Mary Gibbs Jones') } : j)
                          }))} /> MGJ
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={(job.location || []).includes('Goebel')} onChange={(e) => setNewStudent(prev => ({
                            ...prev,
                            jobs: prev.jobs.map((j,i)=> i===idx? { ...j, location: e.target.checked ? Array.from(new Set([...(j.location || []), 'Goebel'])) : (j.location || []).filter(b => b !== 'Goebel') } : j)
                          }))} /> Goebel
                        </label>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex gap-2 items-end">
                        <select className="border rounded-md px-2 py-2" value={(newJobsDrafts[idx]||{}).day || 'M'} onChange={e => setNewJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), day: e.target.value } : d))}>
                          <option value="M">Mon</option>
                          <option value="T">Tue</option>
                          <option value="W">Wed</option>
                          <option value="R">Thu</option>
                          <option value="F">Fri</option>
                        </select>
                        <input type="time" className="border rounded-md px-2 py-2" value={(newJobsDrafts[idx]||{}).start || ''} onChange={e => setNewJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), start: e.target.value } : d))} />
                        <span className="text-gray-500">to</span>
                        <input type="time" className="border rounded-md px-2 py-2" value={(newJobsDrafts[idx]||{}).end || ''} onChange={e => setNewJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), end: e.target.value } : d))} />
                        <button onClick={() => {
                          const draft = newJobsDrafts[idx] || { day: 'M', start: '', end: '' };
                          if (!draft.day || !draft.start || !draft.end) return;
                          if (draft.start >= draft.end) { setErrors(prev => ({ ...prev, weeklySchedule: 'End time must be after start time' })); return; }
                          setNewStudent(prev => ({
                            ...prev,
                            jobs: prev.jobs.map((j,i)=> i===idx? { ...j, weeklySchedule: [...(j.weeklySchedule || []), { ...draft }] } : j)
                          }));
                          setNewJobsDrafts(prev => prev.map((d,i)=> i===idx? { day: 'M', start: '', end: '' } : d));
                          setErrors(prev => ({ ...prev, weeklySchedule: undefined }));
                        }} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm">Add</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(job.weeklySchedule || []).map((entry, k) => (
                          <span key={k} className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded">
                            {entry.day} {formatTime12h(entry.start)}-{formatTime12h(entry.end)}
                            <button onClick={() => setNewStudent(prev => ({ ...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, weeklySchedule: (j.weeklySchedule || []).filter((_, x) => x !== k) } : j) }))} className="text-gray-500 hover:text-gray-700"><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                        {(job.weeklySchedule || []).length === 0 && (
                          <span className="text-xs text-gray-500">No entries added</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => { setNewStudent(prev => ({ ...prev, jobs: [...(prev.jobs || []), { jobTitle: '', supervisor: '', hourlyRate: '', location: [], weeklySchedule: [] }] })); setNewJobsDrafts(prev => ([...prev, { day: 'M', start: '', end: '' }])); }} className="px-3 py-2 bg-baylor-green/10 text-baylor-green rounded-md text-sm">Add Job</button>
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
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={saveCreate}
              className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90"
            >
              <Save className="h-4 w-4 inline mr-2" />
              Save Student
            </button>
          </div>
        </div>
        )}

        {/* Students Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-baylor-green/5">
                <SortableHeader label="Name" columnKey="name" />
                <SortableHeader label="Email" columnKey="email" />
                <SortableHeader label="Phone" columnKey="phone" />
                <SortableHeader label="Weekly Schedule" columnKey="weeklySchedule" />
                <SortableHeader label="Job Title" columnKey="jobTitle" />
                <SortableHeader label="Supervisor" columnKey="supervisor" />
                <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Building(s)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAndSortedData.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  {editingId === student.id ? (
                    // Edit row
                    <>
                      <td className="p-2 align-top">
                        <input
                          type="text"
                          value={editFormData.name || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                          className={`w-full border rounded px-2 py-1 text-sm ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                      </td>
                      <td className="p-2 align-top">
                        <input
                          type="email"
                          value={editFormData.email || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                          className={`w-full border rounded px-2 py-1 text-sm ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                      </td>
                      <td className="p-2 align-top">
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
              <td className="p-2 align-top" colSpan={3}>
                <div className="space-y-3">
                  <div className="text-xs text-gray-500">Manage jobs, locations, pay rates, supervisors, and schedules below.</div>
                  <div className="space-y-3">
                    {(editFormData.jobs || []).map((job, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-md p-2">
                        <div className="flex justify-between items-center mb-2">
                          <div className="font-medium text-gray-900 text-sm">Job {idx + 1}</div>
                          {(editFormData.jobs || []).length > 1 && (
                            <button onClick={() => { setEditFormData(prev => ({ ...prev, jobs: prev.jobs.filter((_, i) => i !== idx) })); setEditJobsDrafts(prev => prev.filter((_, i) => i !== idx)); }} className="text-red-600 text-xs">Remove</button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <input type="text" placeholder="Job Title" value={job.jobTitle || ''} onChange={e => setEditFormData(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, jobTitle: e.target.value } : j)}))} className="border rounded px-2 py-1 text-sm" />
                          <input type="text" placeholder="Supervisor" value={job.supervisor || ''} onChange={e => setEditFormData(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, supervisor: e.target.value } : j)}))} className="border rounded px-2 py-1 text-sm" />
                          <input type="number" step="0.01" placeholder="Hourly Rate" value={job.hourlyRate || ''} onChange={e => setEditFormData(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, hourlyRate: e.target.value } : j)}))} className="border rounded px-2 py-1 text-sm" />
                          <div className="flex gap-3 items-center text-xs">
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={(job.location || []).includes('Mary Gibbs Jones')} onChange={(e) => setEditFormData(prev => ({
                                ...prev,
                                jobs: prev.jobs.map((j,i)=> i===idx? { ...j, location: e.target.checked ? Array.from(new Set([...(j.location || []), 'Mary Gibbs Jones'])) : (j.location || []).filter(b => b !== 'Mary Gibbs Jones') } : j)
                              }))} /> MGJ
                            </label>
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={(job.location || []).includes('Goebel')} onChange={(e) => setEditFormData(prev => ({
                                ...prev,
                                jobs: prev.jobs.map((j,i)=> i===idx? { ...j, location: e.target.checked ? Array.from(new Set([...(j.location || []), 'Goebel'])) : (j.location || []).filter(b => b !== 'Goebel') } : j)
                              }))} /> Goebel
                            </label>
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="flex gap-2 items-end">
                            <select className="border rounded px-2 py-1 text-sm" value={(editJobsDrafts[idx]||{}).day || 'M'} onChange={e => setEditJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), day: e.target.value } : d))}>
                              <option value="M">Mon</option>
                              <option value="T">Tue</option>
                              <option value="W">Wed</option>
                              <option value="R">Thu</option>
                              <option value="F">Fri</option>
                            </select>
                            <input type="time" className="border rounded px-2 py-1 text-sm" value={(editJobsDrafts[idx]||{}).start || ''} onChange={e => setEditJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), start: e.target.value } : d))} />
                            <span className="text-gray-500 text-xs">to</span>
                            <input type="time" className="border rounded px-2 py-1 text-sm" value={(editJobsDrafts[idx]||{}).end || ''} onChange={e => setEditJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), end: e.target.value } : d))} />
                            <button onClick={() => {
                              const draft = editJobsDrafts[idx] || { day: 'M', start: '', end: '' };
                              if (!draft.day || !draft.start || !draft.end) return;
                              if (draft.start >= draft.end) { setErrors(prev => ({ ...prev, weeklySchedule: 'End time must be after start time' })); return; }
                              setEditFormData(prev => ({
                                ...prev,
                                jobs: prev.jobs.map((j,i)=> i===idx? { ...j, weeklySchedule: [...(j.weeklySchedule || []), { ...draft }] } : j)
                              }));
                              setEditJobsDrafts(prev => prev.map((d,i)=> i===idx? { day: 'M', start: '', end: '' } : d));
                              setErrors(prev => ({ ...prev, weeklySchedule: undefined }));
                            }} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs">Add</button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(job.weeklySchedule || []).map((entry, k) => (
                              <span key={k} className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded">
                                {entry.day} {formatTime12h(entry.start)}-{formatTime12h(entry.end)}
                                <button onClick={() => setEditFormData(prev => ({ ...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, weeklySchedule: (j.weeklySchedule || []).filter((_, x) => x !== k) } : j) }))} className="text-gray-500 hover:text-gray-700"><X className="h-3 w-3" /></button>
                              </span>
                            ))}
                            {(job.weeklySchedule || []).length === 0 && (
                              <span className="text-xs text-gray-500">No entries added</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => { setEditFormData(prev => ({ ...prev, jobs: [...(prev.jobs || []), { jobTitle: '', supervisor: '', hourlyRate: '', location: [], weeklySchedule: [] }] })); setEditJobsDrafts(prev => ([...prev, { day: 'M', start: '', end: '' }])); }} className="px-2 py-1 bg-baylor-green/10 text-baylor-green rounded text-xs">Add Job</button>
                    {errors.weeklySchedule && <p className="text-red-500 text-xs mt-1">{errors.weeklySchedule}</p>}
                  </div>
                </div>
              </td>
              <td className="p-2 align-top">
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
                      <td className="p-2 align-top text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={saveEdit}
                            className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
                            title="Save"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    // Display row
                    <>
                      <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelectedStudentForCard(student)}>
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <Mail className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{student.email || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
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
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{formatWeeklySchedule(student.weeklySchedule) || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{student.jobTitle || '-'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{student.supervisor || '-'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{Array.isArray(student.primaryBuildings) ? student.primaryBuildings.join(', ') : (student.primaryBuilding || '-')}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => startEdit(student)}
                            className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => confirmDelete(student)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                            title="Delete"
                          >
                            <Trash2 size={16} />
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