import React, { useState, useMemo, useCallback } from 'react';
import { Edit, Save, X, BookUser, Phone, PhoneOff, Building, BuildingIcon, Plus, Trash2, BookOpen, UserCog, Download, Wifi } from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';
import MultiSelectDropdown from './MultiSelectDropdown';
import { formatPhoneNumber, extractBuildingName } from '../utils/directoryUtils';
import { useDirectoryState, useDirectoryHandlers } from '../hooks';
import { DeleteConfirmDialog, UniversalDirectory } from './shared';

/**
 * Faculty Directory - displays and manages faculty members.
 * Refactored to use shared hooks and components for reduced code duplication.
 */
const FacultyDirectory = ({
  facultyData,
  scheduleData = [],
  rawScheduleData,
  onFacultyUpdate,
  onStaffUpdate,
  onFacultyDelete,
  programs = []
}) => {
  // Default filter configuration for faculty
  const defaultFilters = {
    programs: [],
    jobTitles: [],
    buildings: [],
    adjunct: 'exclude',
    tenured: 'all',
    upd: 'all',
    courseCount: 'all',
    isAlsoStaff: 'all',
    hasPhD: 'all',
    hasBaylorId: 'all',
    isRemote: 'all'
  };

  const createEmptyFaculty = useCallback(() => ({
    name: '',
    jobTitle: '',
    email: '',
    phone: '',
    office: '',
    baylorId: '',
    isAdjunct: false,
    isTenured: false,
    isAlsoStaff: false,
    hasNoPhone: false,
    hasNoOffice: false,
    hasPhD: false,
    isRemote: false,
  }), []);

  // Shared state
  const state = useDirectoryState({
    defaultSort: { key: 'courseCount', direction: 'descending' },
    defaultFilters,
    createEmptyRecord: createEmptyFaculty
  });

  const {
    editingId, editFormData, setEditFormData, errors, setErrors,
    filterText, setFilterText, showFilters, setShowFilters, filters, setFilters,
    sortConfig, nameSort, setNameSort,
    showDeleteConfirm, recordToDelete,
    isCreating, setIsCreating, newRecord, setNewRecord,
    selectedRecord, setSelectedRecord, resetCreateState
  } = state;

  // Faculty-specific state
  const [showOnlyWithCourses, setShowOnlyWithCourses] = useState(false);
  const [pinUPDsFirst, setPinUPDsFirst] = useState(false);

  // Validation function
  const validate = useCallback((data) => {
    const newErrors = {};

    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    const phoneDigits = (data.phone || '').replace(/\D/g, '');
    if (data.phone && phoneDigits.length !== 10) {
      newErrors.phone = 'Phone number must contain exactly 10 digits.';
    }

    if (data.baylorId && !/^\d{9}$/.test(data.baylorId)) {
      newErrors.baylorId = 'Baylor ID must be exactly 9 digits.';
    }

    return newErrors;
  }, []);

  // Prepare payload for save
  const preparePayload = useCallback((data) => {
    const originalRoles = data.roles;
    let updatedRoles;
    if (Array.isArray(originalRoles)) {
      updatedRoles = originalRoles.filter(r => r !== 'faculty' && r !== 'staff');
      updatedRoles.push('faculty');
      if (data.isAlsoStaff) updatedRoles.push('staff');
    } else {
      updatedRoles = {
        ...(typeof originalRoles === 'object' && originalRoles !== null ? originalRoles : {}),
        faculty: true,
        staff: data.isAlsoStaff || false
      };
    }
    return {
      ...data,
      phone: (data.phone || '').replace(/\D/g, ''),
      roles: updatedRoles
    };
  }, []);

  // Shared handlers
  const handlers = useDirectoryHandlers({
    state,
    data: facultyData,
    onUpdate: onFacultyUpdate,
    onDelete: onFacultyDelete,
    validate,
    preparePayload
  });

  const {
    handleEdit, handleCancel, handleSave, handleChange,
    handleCreate, handleCancelCreate, handleCreateChange, handleCreateSave,
    handleSort, handleDelete, confirmDelete, cancelDelete,
    clearFilters: baseClearFilters, toggleEditPhoneState, toggleEditOfficeState,
    toggleCreatePhoneState, toggleCreateOfficeState, getInputClass
  } = handlers;

  // Extended clear filters for faculty-specific state
  const clearFilters = useCallback(() => {
    baseClearFilters();
    setShowOnlyWithCourses(false);
  }, [baseClearFilters]);

  // Calculate course counts for each faculty member
  const facultyWithCourseCounts = useMemo(() => {
    if (!facultyData || !Array.isArray(facultyData)) return [];

    return facultyData.map(faculty => {
      const facultyName = faculty.name;
      const facultyCourses = (scheduleData || []).filter(schedule => {
        const instructorName = schedule.instructor
          ? `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim()
          : (schedule.instructorName || schedule.Instructor || '');
        return instructorName === facultyName;
      });

      const uniqueCourses = [...new Set(facultyCourses.map(schedule =>
        schedule.courseCode || schedule.Course || ''
      ))].filter(courseCode => courseCode.trim() !== '');

      return {
        ...faculty,
        courseCount: uniqueCourses.length,
        courses: facultyCourses.map(schedule => ({
          courseCode: schedule.courseCode || schedule.Course || '',
          courseTitle: schedule.courseTitle || schedule['Course Title'] || '',
          section: schedule.section || schedule.Section || '',
          term: schedule.term || schedule.Term || '',
          credits: schedule.credits || schedule.Credits || ''
        }))
      };
    });
  }, [facultyData, scheduleData]);

  // Remove duplicates
  const uniqueDirectoryData = useMemo(() => {
    if (!facultyWithCourseCounts || !Array.isArray(facultyWithCourseCounts)) return [];

    const uniqueMap = new Map();
    facultyWithCourseCounts.forEach(faculty => {
      const key = `${faculty.name?.toLowerCase()}-${(faculty.email || 'no-email').toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, faculty);
      } else {
        const existing = uniqueMap.get(key);
        const existingFields = Object.values(existing).filter(v => v && v !== '').length;
        const newFields = Object.values(faculty).filter(v => v && v !== '').length;
        if (newFields > existingFields) {
          uniqueMap.set(key, faculty);
        }
      }
    });
    return Array.from(uniqueMap.values());
  }, [facultyWithCourseCounts]);

  // Extract filter options
  const filterOptions = useMemo(() => {
    const programsSet = new Set();
    const jobTitles = new Set();
    const buildings = new Set();

    uniqueDirectoryData.forEach(person => {
      if (person.program?.name) programsSet.add(person.program.name);
      if (person.jobTitle) jobTitles.add(person.jobTitle);
      if (person.office) {
        buildings.add(extractBuildingName(person.office));
      } else {
        buildings.add('No Building');
      }
    });

    return {
      programs: Array.from(programsSet).sort(),
      jobTitles: Array.from(jobTitles).sort(),
      buildings: Array.from(buildings).sort()
    };
  }, [uniqueDirectoryData]);

  // Filter and sort data
  const sortedAndFilteredData = useMemo(() => {
    let data = [...uniqueDirectoryData];

    // Search filter
    if (filterText) {
      const term = filterText.toLowerCase();
      data = data.filter(person =>
        person.name?.toLowerCase().includes(term) ||
        person.email?.toLowerCase().includes(term) ||
        person.jobTitle?.toLowerCase().includes(term) ||
        person.office?.toLowerCase().includes(term)
      );
    }

    // Program filter
    if ((filters.programs || []).length > 0) {
      data = data.filter(person => filters.programs.includes(person.program?.name || ''));
    }

    // Job title filter
    if ((filters.jobTitles || []).length > 0) {
      data = data.filter(person => filters.jobTitles.includes(person.jobTitle || ''));
    }

    // Building filter
    if ((filters.buildings || []).length > 0) {
      data = data.filter(person => {
        const buildingName = person.office ? extractBuildingName(person.office) : 'No Building';
        return filters.buildings.includes(buildingName);
      });
    }

    // Status filters
    if (filters.adjunct !== 'all') {
      data = data.filter(person => filters.adjunct === 'include' ? person.isAdjunct : !person.isAdjunct);
    }
    if (filters.tenured !== 'all') {
      data = data.filter(person => filters.tenured === 'include' ? person.isTenured : !person.isTenured);
    }
    if (filters.upd !== 'all') {
      data = data.filter(person => filters.upd === 'include' ? person.isUPD : !person.isUPD);
    }
    if (filters.isAlsoStaff !== 'all') {
      data = data.filter(person => filters.isAlsoStaff === 'include' ? person.isAlsoStaff : !person.isAlsoStaff);
    }
    if (filters.hasPhD !== 'all') {
      data = data.filter(person => filters.hasPhD === 'include' ? person.hasPhD : !person.hasPhD);
    }
    if (filters.isRemote !== 'all') {
      data = data.filter(person => filters.isRemote === 'include' ? person.isRemote : !person.isRemote);
    }

    // Course count filter
    if (showOnlyWithCourses || filters.courseCount === 'with-courses') {
      data = data.filter(person => person.courseCount > 0);
    } else if (filters.courseCount === 'without-courses') {
      data = data.filter(person => person.courseCount === 0);
    }

    // Baylor ID filter
    if (filters.hasBaylorId === 'with-id') {
      data = data.filter(person => person.baylorId && person.baylorId.trim() !== '');
    } else if (filters.hasBaylorId === 'without-id') {
      data = data.filter(person => !person.baylorId || person.baylorId.trim() === '');
    }

    // Sorting
    data.sort((a, b) => {
      // Optional: bring UPDs to the top
      if (pinUPDsFirst) {
        if (!!a.isUPD && !b.isUPD) return -1;
        if (!a.isUPD && !!b.isUPD) return 1;
      }

      let valA, valB;
      if (sortConfig.key === 'name') {
        if (nameSort === 'firstName') {
          valA = (a.firstName || a.name?.split(' ')[0] || '').toLowerCase();
          valB = (b.firstName || b.name?.split(' ')[0] || '').toLowerCase();
        } else {
          const aNameParts = (a.lastName || a.name || '').split(' ');
          const bNameParts = (b.lastName || b.name || '').split(' ');
          valA = (a.lastName || aNameParts[aNameParts.length - 1] || '').toLowerCase();
          valB = (b.lastName || bNameParts[bNameParts.length - 1] || '').toLowerCase();
        }
      } else if (sortConfig.key === 'program') {
        valA = (a.program?.name || '').toLowerCase();
        valB = (b.program?.name || '').toLowerCase();
      } else if (sortConfig.key === 'courseCount') {
        valA = a.courseCount || 0;
        valB = b.courseCount || 0;
      } else {
        valA = a[sortConfig.key];
        valB = b[sortConfig.key];
      }

      if (typeof valA === 'boolean') {
        return (valA === valB) ? 0 : valA ? -1 : 1;
      }

      if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });

    return data;
  }, [uniqueDirectoryData, filterText, filters, sortConfig, nameSort, showOnlyWithCourses, pinUPDsFirst]);

  // Export to CSV
  const exportToCSV = useCallback(() => {
    const headers = ['Name', 'Program', 'Job Title', 'Email', 'Phone', 'Office', 'Baylor ID', 'Courses', 'Remote'];
    const rows = sortedAndFilteredData.map(faculty => [
      faculty.name || '',
      faculty.program?.name || '',
      faculty.jobTitle || '',
      faculty.email || '',
      faculty.hasNoPhone ? 'No phone' : formatPhoneNumber(faculty.phone),
      faculty.hasNoOffice ? 'No office' : (faculty.office || ''),
      faculty.baylorId || 'Not assigned',
      faculty.courseCount || 0,
      faculty.isRemote ? 'Yes' : 'No'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `faculty-directory-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [sortedAndFilteredData]);

  // Column definitions
  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      render: (faculty) => (
        <div className="text-gray-700 font-medium">
          <div>{faculty.name}</div>
          {faculty.program && <div className="text-xs text-baylor-green font-medium">{faculty.program.name}</div>}
          {faculty.isUPD && <div className="text-xs text-amber-600 font-medium flex items-center gap-1"><UserCog size={12} /> UPD</div>}
          {faculty.isAlsoStaff && <div className="text-xs text-baylor-gold font-medium">Also Staff</div>}
          {faculty.isAdjunct && <div className="text-xs text-blue-600 font-medium">Adjunct</div>}
          {faculty.isTenured && <div className="text-xs text-purple-600 font-medium">Tenured</div>}
          {faculty.hasPhD && <div className="text-xs text-green-600 font-medium">PhD</div>}
          {faculty.isRemote && <div className="text-xs text-cyan-600 font-medium flex items-center gap-1"><Wifi size={12} /> Remote</div>}
        </div>
      ),
      renderEdit: (faculty) => (
        <div className="p-2 align-top text-gray-700 font-medium">
          <div className="mb-2">{faculty.name}</div>
          <div className="flex items-center gap-2 text-xs">
            <input type="checkbox" id={`adjunct-${faculty.id}`} name="isAdjunct" checked={!!editFormData.isAdjunct} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            <label htmlFor={`adjunct-${faculty.id}`} className="font-normal">Adjunct</label>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <input type="checkbox" id={`isTenured-${faculty.id}`} name="isTenured" checked={!!editFormData.isTenured} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            <label htmlFor={`isTenured-${faculty.id}`} className="font-normal">Tenured</label>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <input type="checkbox" id={`isAlsoStaff-${faculty.id}`} name="isAlsoStaff" checked={!!editFormData.isAlsoStaff} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            <label htmlFor={`isAlsoStaff-${faculty.id}`} className="font-normal">Also a staff member</label>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <input type="checkbox" id={`hasPhD-${faculty.id}`} name="hasPhD" checked={!!editFormData.hasPhD} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            <label htmlFor={`hasPhD-${faculty.id}`} className="font-normal">Has PhD</label>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <input type="checkbox" id={`isRemote-${faculty.id}`} name="isRemote" checked={!!editFormData.isRemote} onChange={(e) => {
              const isChecked = e.target.checked;
              setEditFormData(prev => ({
                ...prev,
                isRemote: isChecked,
                ...(isChecked ? { hasNoOffice: true, office: '' } : {})
              }));
            }} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            <label htmlFor={`isRemote-${faculty.id}`} className="font-normal">Remote</label>
          </div>
        </div>
      )
    },
    {
      key: 'program',
      label: 'Program',
      render: (faculty) => faculty.program?.name || '-',
      renderEdit: () => (
        <select name="programId" value={editFormData.programId || ''} onChange={handleChange} className={getInputClass('programId')}>
          <option value="">No Program</option>
          {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
        </select>
      )
    },
    {
      key: 'jobTitle',
      label: 'Job Title',
      render: (faculty) => faculty.jobTitle || '-',
      renderEdit: () => <input name="jobTitle" value={editFormData.jobTitle || ''} onChange={handleChange} className={getInputClass('jobTitle')} placeholder="Job Title" />
    },
    {
      key: 'email',
      label: 'Email',
      render: (faculty) => faculty.email || '-',
      renderEdit: () => (
        <div>
          <input name="email" value={editFormData.email || ''} onChange={handleChange} className={getInputClass('email')} placeholder="email@baylor.edu" />
          {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
        </div>
      )
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (faculty) => (
        <div className="flex items-center gap-2">
          {faculty.hasNoPhone ? <span className="flex items-center gap-1 text-gray-500"><PhoneOff size={14} /> No phone</span> : formatPhoneNumber(faculty.phone)}
        </div>
      ),
      renderEdit: () => (
        <div>
          <div className="flex items-center gap-2">
            <input name="phone" value={editFormData.phone || ''} onChange={handleChange} className={getInputClass('phone')} placeholder="10 digits" maxLength="10" disabled={editFormData.hasNoPhone} />
            <button type="button" onClick={toggleEditPhoneState} className={`p-1 rounded transition-colors ${editFormData.hasNoPhone ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}>
              {editFormData.hasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
            </button>
          </div>
          {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
        </div>
      )
    },
    {
      key: 'office',
      label: 'Office',
      render: (faculty) => (
        <div className="flex items-center gap-2">
          {faculty.hasNoOffice ? <span className="flex items-center gap-1 text-gray-500"><BuildingIcon size={14} className="opacity-50" /> No office</span> : (faculty.office || '-')}
        </div>
      ),
      renderEdit: () => (
        <div className="flex items-center gap-2">
          <input name="office" value={editFormData.office || ''} onChange={handleChange} className={getInputClass('office')} placeholder="Building & Room" disabled={editFormData.hasNoOffice} />
          <button type="button" onClick={toggleEditOfficeState} className={`p-1 rounded transition-colors ${editFormData.hasNoOffice ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}>
            {editFormData.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
          </button>
        </div>
      )
    },
    {
      key: 'courseCount',
      label: 'Courses',
      render: (faculty) => faculty.courseCount,
      renderEdit: (faculty) => <div className="text-sm text-gray-600">{faculty.courseCount || 0}</div>
    }
  ], [editFormData, setEditFormData, errors, handleChange, toggleEditPhoneState, toggleEditOfficeState, getInputClass, programs]);

  // Render actions column
  const renderActions = (faculty, isEditing) => {
    if (isEditing) {
      return (
        <div className="flex gap-2">
          <button onClick={handleSave} className="p-2 text-green-600 hover:bg-green-100 rounded-full" disabled={typeof window !== 'undefined' && window?.appPermissions?.canEditFaculty === false}><Save size={16} /></button>
          <button onClick={handleCancel} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
        </div>
      );
    }
    return (
      <div className="flex gap-1 justify-end">
        <button onClick={(e) => { e.stopPropagation(); handleEdit(faculty); }} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full" disabled={typeof window !== 'undefined' && window?.appPermissions?.canEditFaculty === false}><Edit size={16} /></button>
        <button onClick={(e) => { e.stopPropagation(); handleDelete(faculty); }} className="p-2 text-red-600 hover:bg-red-100 rounded-full" disabled={typeof window !== 'undefined' && window?.appPermissions?.canDeleteFaculty === false}><Trash2 size={16} /></button>
      </div>
    );
  };

  // Create row
  const createRow = isCreating ? (
    <div className="flex items-center border-b border-gray-200 bg-baylor-gold/5">
      <div className="px-4 py-2 flex-1 min-w-0 text-sm align-top text-gray-700 font-medium">
        <input name="name" value={newRecord.name} onChange={handleCreateChange} className={getInputClass('name')} placeholder="Full Name" />
        <div className="flex items-center gap-2 text-xs mt-2">
          <input type="checkbox" id="new-adjunct" name="isAdjunct" checked={newRecord.isAdjunct} onChange={handleCreateChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
          <label htmlFor="new-adjunct" className="font-normal">Adjunct</label>
        </div>
        <div className="flex items-center gap-2 text-xs mt-1">
          <input type="checkbox" id="new-isTenured" name="isTenured" checked={newRecord.isTenured} onChange={handleCreateChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
          <label htmlFor="new-isTenured" className="font-normal">Tenured</label>
        </div>
        <div className="flex items-center gap-2 text-xs mt-1">
          <input type="checkbox" id="new-isAlsoStaff" name="isAlsoStaff" checked={newRecord.isAlsoStaff} onChange={handleCreateChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
          <label htmlFor="new-isAlsoStaff" className="font-normal">Also a staff member</label>
        </div>
        <div className="flex items-center gap-2 text-xs mt-1">
          <input type="checkbox" id="new-hasPhD" name="hasPhD" checked={newRecord.hasPhD} onChange={handleCreateChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
          <label htmlFor="new-hasPhD" className="font-normal">Has PhD</label>
        </div>
        <div className="flex items-center gap-2 text-xs mt-1">
          <input type="checkbox" id="new-isRemote" name="isRemote" checked={newRecord.isRemote} onChange={(e) => { handleCreateChange(e); if (e.target.checked) { setNewRecord(prev => ({ ...prev, hasNoOffice: true, office: '' })); } }} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
          <label htmlFor="new-isRemote" className="font-normal">Remote</label>
        </div>
      </div>
      <div className="px-4 py-2 flex-1 min-w-0 text-sm align-top">
        <select name="programId" value={newRecord.programId || ''} onChange={handleCreateChange} className={getInputClass('programId')}>
          <option value="">No Program</option>
          {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
        </select>
      </div>
      <div className="px-4 py-2 flex-1 min-w-0 text-sm align-top">
        <input name="jobTitle" value={newRecord.jobTitle} onChange={handleCreateChange} className={getInputClass('jobTitle')} placeholder="Job Title" />
      </div>
      <div className="px-4 py-2 flex-1 min-w-0 text-sm align-top">
        <input name="email" value={newRecord.email} onChange={handleCreateChange} className={getInputClass('email')} placeholder="email@baylor.edu" />
        {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
      </div>
      <div className="px-4 py-2 flex-1 min-w-0 text-sm align-top">
        <div className="flex items-center gap-2">
          <input name="phone" value={newRecord.phone} onChange={handleCreateChange} className={getInputClass('phone')} placeholder="10 digits" maxLength="10" disabled={newRecord.hasNoPhone} />
          <button type="button" onClick={toggleCreatePhoneState} className={`p-1 rounded transition-colors ${newRecord.hasNoPhone ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}>
            {newRecord.hasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
          </button>
        </div>
        {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
      </div>
      <div className="px-4 py-2 flex-1 min-w-0 text-sm align-top">
        <div className="flex items-center gap-2">
          <input name="office" value={newRecord.office} onChange={handleCreateChange} className={getInputClass('office')} placeholder="Building & Room" disabled={newRecord.hasNoOffice} />
          <button type="button" onClick={toggleCreateOfficeState} className={`p-1 rounded transition-colors ${newRecord.hasNoOffice ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}>
            {newRecord.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
          </button>
        </div>
      </div>
      <div className="px-4 py-2 flex-1 min-w-0 text-sm align-top">
        <div className="text-sm text-gray-500 italic">Calculated from courses</div>
      </div>
      <div className="px-4 py-2 w-28 flex-none text-right align-top">
        <div className="flex gap-2 justify-end">
          <button onClick={handleCreateSave} className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"><Save size={16} /></button>
          <button onClick={handleCancelCreate} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <UniversalDirectory
      type="people"
      title="Faculty Directory"
      icon={BookUser}
      data={sortedAndFilteredData}
      columns={columns}
      sortConfig={sortConfig}
      onSort={handleSort}
      nameSort={nameSort}
      onNameSortChange={setNameSort}
      filterText={filterText}
      onFilterTextChange={setFilterText}
      showFilters={showFilters}
      onToggleFilters={() => setShowFilters(!showFilters)}
      onClearFilters={clearFilters}
      filterOptions={filterOptions}
      leadingActions={(
        <>
          <button
            onClick={() => setPinUPDsFirst(prev => !prev)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${pinUPDsFirst ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'}`}
            title="Bring Undergraduate Program Directors to the top"
          >
            <UserCog size={16} />
            <span className="text-xs font-medium">UPD first</span>
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showOnlyWithCourses} onChange={e => setShowOnlyWithCourses(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            Only show faculty with at least 1 course
          </label>
        </>
      )}
      trailingActions={(
        <>
          <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Download size={18} /> Export CSV
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
            disabled={typeof window !== 'undefined' && window?.appPermissions?.canAddFaculty === false}
          >
            <Plus size={18} /> Add Faculty
          </button>
        </>
      )}
      filterContent={(
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Programs</label>
            <MultiSelectDropdown options={filterOptions.programs} selected={filters.programs} onChange={(selected) => setFilters(prev => ({ ...prev, programs: selected }))} placeholder="Select programs..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
            <MultiSelectDropdown options={filterOptions.jobTitles} selected={filters.jobTitles} onChange={(selected) => setFilters(prev => ({ ...prev, jobTitles: selected }))} placeholder="Select job titles..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buildings</label>
            <MultiSelectDropdown options={filterOptions.buildings} selected={filters.buildings} onChange={(selected) => setFilters(prev => ({ ...prev, buildings: selected }))} placeholder="Select buildings..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Adjunct Status</label>
              <select value={filters.adjunct} onChange={(e) => setFilters(prev => ({ ...prev, adjunct: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="include">Adjunct Only</option>
                <option value="exclude">Exclude Adjunct</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tenure Status</label>
              <select value={filters.tenured} onChange={(e) => setFilters(prev => ({ ...prev, tenured: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="include">Tenured Only</option>
                <option value="exclude">Exclude Tenured</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">UPD Status</label>
              <select value={filters.upd} onChange={(e) => setFilters(prev => ({ ...prev, upd: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="include">UPD Only</option>
                <option value="exclude">Exclude UPD</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Staff Status</label>
              <select value={filters.isAlsoStaff} onChange={(e) => setFilters(prev => ({ ...prev, isAlsoStaff: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="include">Also Staff</option>
                <option value="exclude">Faculty Only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Course Status</label>
              <select value={filters.courseCount} onChange={(e) => setFilters(prev => ({ ...prev, courseCount: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="with-courses">Teaching Courses</option>
                <option value="without-courses">Not Teaching</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">PhD Status</label>
              <select value={filters.hasPhD} onChange={(e) => setFilters(prev => ({ ...prev, hasPhD: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="include">PhD Only</option>
                <option value="exclude">Exclude PhD</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Baylor ID Status</label>
              <select value={filters.hasBaylorId} onChange={(e) => setFilters(prev => ({ ...prev, hasBaylorId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="with-id">Has Baylor ID</option>
                <option value="without-id">Missing Baylor ID</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Remote Status</label>
              <select value={filters.isRemote} onChange={(e) => setFilters(prev => ({ ...prev, isRemote: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="include">Remote Only</option>
                <option value="exclude">Exclude Remote</option>
              </select>
            </div>
          </div>
        </>
      )}
      tableProps={{
        editingId,
        editFormData,
        onRowClick: setSelectedRecord,
        renderActions,
        createRow,
        emptyMessage: 'No faculty members found.'
      }}
    >
      {selectedRecord && <FacultyContactCard faculty={selectedRecord} onClose={() => setSelectedRecord(null)} />}
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        record={recordToDelete}
        recordType="faculty member"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </UniversalDirectory>
  );
};

export default FacultyDirectory;
