import React, { useState, useMemo, useCallback } from 'react';
import { Edit, Save, X, Users, Phone, PhoneOff, Building, BuildingIcon, Plus, RotateCcw, History, Trash2, Wifi } from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';
import MultiSelectDropdown from './MultiSelectDropdown';
import { adaptPeopleToStaff } from '../utils/dataAdapter';
import { formatPhoneNumber, extractBuildingName } from '../utils/directoryUtils';
import { useDirectoryState, useDirectoryHandlers } from '../hooks';
import { DeleteConfirmDialog, UniversalDirectory } from './shared';

/**
 * Staff Directory - displays and manages staff members.
 * Refactored to use shared hooks and components for reduced code duplication.
 */
const StaffDirectory = ({
  directoryData,
  onFacultyUpdate,
  onStaffUpdate,
  onStaffDelete,
  programs = [],
  rawScheduleData
}) => {
  // Default filter configuration for staff
  const defaultFilters = {
    jobTitles: [],
    buildings: [],
    isFullTime: 'all',
    isAlsoFaculty: 'all',
    isRemote: 'all'
  };

  const createEmptyStaff = useCallback(() => ({
    name: '',
    jobTitle: '',
    email: '',
    phone: '',
    office: '',
    isFullTime: true,
    isAlsoFaculty: false,
    hasNoPhone: false,
    hasNoOffice: false,
    isRemote: false,
  }), []);

  // Shared state
  const state = useDirectoryState({
    defaultSort: { key: 'name', direction: 'ascending' },
    defaultFilters,
    createEmptyRecord: createEmptyStaff
  });

  const {
    editingId, editFormData, setEditFormData, errors, setErrors,
    filterText, setFilterText, showFilters, setShowFilters, filters, setFilters,
    sortConfig, nameSort, setNameSort,
    showDeleteConfirm, recordToDelete,
    isCreating, setIsCreating, newRecord, setNewRecord,
    changeHistory, showHistory, setShowHistory, setChangeHistory,
    selectedRecord, setSelectedRecord, resetCreateState
  } = state;

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
      updatedRoles.push('staff');
      if (data.isAlsoFaculty) updatedRoles.push('faculty');
    } else {
      updatedRoles = {
        ...(typeof originalRoles === 'object' && originalRoles !== null ? originalRoles : {}),
        staff: true,
        faculty: data.isAlsoFaculty || false
      };
    }
    return {
      ...data,
      phone: (data.phone || '').replace(/\D/g, ''),
      roles: updatedRoles
    };
  }, []);

  // Track changes for undo
  const trackChange = useCallback((originalData, updatedData, action) => {
    const change = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      action,
      originalData: { ...originalData },
      updatedData: { ...updatedData },
      staffId: originalData.id || updatedData.id,
      staffName: originalData.name || updatedData.name
    };
    setChangeHistory(prev => [change, ...prev.slice(0, 19)]);
  }, [setChangeHistory]);

  // Shared handlers
  const handlers = useDirectoryHandlers({
    state,
    data: directoryData,
    onUpdate: onStaffUpdate,
    onDelete: onStaffDelete,
    validate,
    preparePayload,
    trackChange
  });

  const {
    handleEdit, handleCancel, handleSave, handleChange,
    handleCreate, handleCancelCreate, handleCreateChange, handleCreateSave,
    handleSort, handleDelete, confirmDelete, cancelDelete,
    clearFilters, toggleEditPhoneState, toggleEditOfficeState,
    toggleCreatePhoneState, toggleCreateOfficeState, getInputClass
  } = handlers;

  // Adapt data to staff format
  const adaptedStaffData = useMemo(() => {
    if (!directoryData || !Array.isArray(directoryData)) return [];
    return adaptPeopleToStaff(directoryData, [], programs);
  }, [directoryData, programs]);

  // Remove duplicates
  const uniqueDirectoryData = useMemo(() => {
    if (!adaptedStaffData || !Array.isArray(adaptedStaffData)) return [];

    const uniqueMap = new Map();
    adaptedStaffData.forEach(staff => {
      const key = `${staff.name?.toLowerCase()}-${(staff.email || 'no-email').toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, staff);
      } else {
        const existing = uniqueMap.get(key);
        const existingFields = Object.values(existing).filter(v => v && v !== '').length;
        const newFields = Object.values(staff).filter(v => v && v !== '').length;
        if (newFields > existingFields) {
          uniqueMap.set(key, staff);
        }
      }
    });
    return Array.from(uniqueMap.values());
  }, [adaptedStaffData]);

  // Extract filter options
  const filterOptions = useMemo(() => {
    const jobTitles = new Set();
    const buildings = new Set();

    uniqueDirectoryData.forEach(person => {
      if (person.jobTitle) jobTitles.add(person.jobTitle);
      if (person.office) {
        buildings.add(extractBuildingName(person.office));
      } else {
        buildings.add('No Building');
      }
    });

    return {
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

    // Full-time filter
    if (filters.isFullTime !== 'all') {
      data = data.filter(person => {
        if (filters.isFullTime === 'full-time') return person.isFullTime;
        if (filters.isFullTime === 'part-time') return !person.isFullTime;
        return true;
      });
    }

    // Also Faculty filter
    if (filters.isAlsoFaculty !== 'all') {
      data = data.filter(person => {
        if (filters.isAlsoFaculty === 'include') return person.isAlsoFaculty;
        if (filters.isAlsoFaculty === 'exclude') return !person.isAlsoFaculty;
        return true;
      });
    }

    // Remote filter
    if (filters.isRemote !== 'all') {
      data = data.filter(person => {
        if (filters.isRemote === 'include') return person.isRemote;
        if (filters.isRemote === 'exclude') return !person.isRemote;
        return true;
      });
    }

    // Sorting
    data.sort((a, b) => {
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
  }, [uniqueDirectoryData, filterText, filters, sortConfig, nameSort]);

  // Undo change handler
  const undoChange = async (change) => {
    try {
      if (change.action === 'update') {
        const dataToRestore = { ...change.originalData };
        if (dataToRestore.isAlsoFaculty) {
          await onFacultyUpdate(dataToRestore);
        } else {
          await onStaffUpdate(dataToRestore);
        }
        setChangeHistory(prev => prev.filter(c => c.id !== change.id));
      }
    } catch (error) {
      console.error('Error undoing change:', error);
    }
  };

  // Column definitions
  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      render: (staff) => (
        <div className="text-gray-700 font-medium">
          <div>{staff.name}</div>
          {staff.isAlsoFaculty && (
            <div className="text-xs text-baylor-gold font-medium">Also Faculty</div>
          )}
          {staff.isFullTime === false && (
            <div className="text-xs text-baylor-green font-medium">Part Time</div>
          )}
          {staff.isRemote && (
            <div className="text-xs text-cyan-600 font-medium flex items-center gap-1"><Wifi size={12} /> Remote</div>
          )}
        </div>
      ),
      renderEdit: (staff) => (
        <div className="p-2 align-top text-gray-700 font-medium">
          <div className="mb-2">{staff.name}</div>
          <div className="flex items-center gap-2 text-xs">
            <input type="checkbox" id={`fulltime-${staff.id}`} name="isFullTime" checked={!!editFormData.isFullTime} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            <label htmlFor={`fulltime-${staff.id}`} className="font-normal">Full Time</label>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <input type="checkbox" id={`isAlsoFaculty-${staff.id}`} name="isAlsoFaculty" checked={!!editFormData.isAlsoFaculty} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            <label htmlFor={`isAlsoFaculty-${staff.id}`} className="font-normal">Also a faculty member</label>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <input type="checkbox" id={`isRemote-${staff.id}`} name="isRemote" checked={!!editFormData.isRemote} onChange={(e) => {
              const isChecked = e.target.checked;
              setEditFormData(prev => ({
                ...prev,
                isRemote: isChecked,
                ...(isChecked ? { hasNoOffice: true, office: '' } : {})
              }));
            }} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
            <label htmlFor={`isRemote-${staff.id}`} className="font-normal">Remote</label>
          </div>
        </div>
      )
    },
    {
      key: 'jobTitle',
      label: 'Job Title',
      render: (staff) => staff.jobTitle || '-',
      renderEdit: () => (
        <input name="jobTitle" value={editFormData.jobTitle || ''} onChange={handleChange} className={getInputClass('jobTitle')} placeholder="Job Title" />
      )
    },
    {
      key: 'email',
      label: 'Email',
      render: (staff) => staff.email || '-',
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
      render: (staff) => (
        <div className="flex items-center gap-2">
          {staff.hasNoPhone ? (
            <span className="flex items-center gap-1 text-gray-500">
              <PhoneOff size={14} />
              No phone
            </span>
          ) : (
            formatPhoneNumber(staff.phone)
          )}
        </div>
      ),
      renderEdit: () => (
        <div>
          <div className="flex items-center gap-2">
            <input name="phone" value={editFormData.phone || ''} onChange={handleChange} className={getInputClass('phone')} placeholder="10 digits" maxLength="10" disabled={editFormData.hasNoPhone} />
            <button type="button" onClick={toggleEditPhoneState} className={`p-1 rounded transition-colors ${editFormData.hasNoPhone ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`} title={editFormData.hasNoPhone ? 'Has no phone number' : 'Has phone number'}>
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
      render: (staff) => (
        <div className="flex items-center gap-2">
          {staff.hasNoOffice ? (
            <span className="flex items-center gap-1 text-gray-500">
              <BuildingIcon size={14} className="opacity-50" />
              No office
            </span>
          ) : (
            staff.office || '-'
          )}
        </div>
      ),
      renderEdit: () => (
        <div className="flex items-center gap-2">
          <input name="office" value={editFormData.office || ''} onChange={handleChange} className={getInputClass('office')} placeholder="Building & Room" disabled={editFormData.hasNoOffice} />
          <button type="button" onClick={toggleEditOfficeState} className={`p-1 rounded transition-colors ${editFormData.hasNoOffice ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`} title={editFormData.hasNoOffice ? 'Has no office' : 'Has office'}>
            {editFormData.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
          </button>
        </div>
      )
    }
  ], [editFormData, setEditFormData, errors, handleChange, toggleEditPhoneState, toggleEditOfficeState, getInputClass]);

  // Render actions column
  const renderActions = (staff, isEditing) => {
    if (isEditing) {
      return (
        <div className="flex gap-2">
          <button onClick={handleSave} className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"><Save size={16} /></button>
          <button onClick={handleCancel} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
        </div>
      );
    }
    return (
      <div className="flex gap-1 justify-end">
        <button onClick={(e) => { e.stopPropagation(); handleEdit(staff); }} className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"><Edit size={16} /></button>
        <button onClick={(e) => { e.stopPropagation(); handleDelete(staff); }} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
      </div>
    );
  };

  // Create row
  const createRow = isCreating ? (
    <div className="flex items-center border-b border-gray-200 bg-baylor-gold/5">
      <div className="px-4 py-2 flex-1 min-w-0 text-sm align-top text-gray-700 font-medium">
        <input name="name" value={newRecord.name} onChange={handleCreateChange} className={getInputClass('name')} placeholder="Full Name" />
        {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name}</p>}
        <div className="flex items-center gap-2 text-xs mt-2">
          <input type="checkbox" id="new-fulltime" name="isFullTime" checked={newRecord.isFullTime} onChange={handleCreateChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
          <label htmlFor="new-fulltime" className="font-normal">Full Time</label>
        </div>
        <div className="flex items-center gap-2 text-xs mt-1">
          <input type="checkbox" id="new-isAlsoFaculty" name="isAlsoFaculty" checked={newRecord.isAlsoFaculty} onChange={handleCreateChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
          <label htmlFor="new-isAlsoFaculty" className="font-normal">Also a faculty member</label>
        </div>
        <div className="flex items-center gap-2 text-xs mt-1">
          <input type="checkbox" id="new-isRemote" name="isRemote" checked={newRecord.isRemote} onChange={(e) => { handleCreateChange(e); if (e.target.checked) { setNewRecord(prev => ({ ...prev, hasNoOffice: true, office: '' })); } }} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
          <label htmlFor="new-isRemote" className="font-normal">Remote</label>
        </div>
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
      title="Staff Directory"
      icon={Users}
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
      trailingActions={(
        <>
          {changeHistory.length > 0 && (
            <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 px-3 py-2 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 transition-colors">
              <History size={16} />
              Changes ({changeHistory.length})
            </button>
          )}
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
            disabled={typeof window !== 'undefined' && window?.appPermissions && window.appPermissions.canCreateStaff === false}
          >
            <Plus size={18} />
            Add Staff
          </button>
        </>
      )}
      filterContent={(
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
            <MultiSelectDropdown options={filterOptions.jobTitles} selected={filters.jobTitles} onChange={(selected) => setFilters(prev => ({ ...prev, jobTitles: selected }))} placeholder="Select job titles..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buildings</label>
            <MultiSelectDropdown options={filterOptions.buildings} selected={filters.buildings} onChange={(selected) => setFilters(prev => ({ ...prev, buildings: selected }))} placeholder="Select buildings..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Employment Status</label>
              <select value={filters.isFullTime} onChange={(e) => setFilters(prev => ({ ...prev, isFullTime: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="full-time">Full-time Only</option>
                <option value="part-time">Part-time Only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Faculty Status</label>
              <select value={filters.isAlsoFaculty} onChange={(e) => setFilters(prev => ({ ...prev, isAlsoFaculty: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green">
                <option value="all">All</option>
                <option value="include">Also Faculty</option>
                <option value="exclude">Staff Only</option>
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
      bodyTop={showHistory && changeHistory.length > 0 ? (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-medium text-gray-900 mb-3">Recent Changes</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {changeHistory.map((change) => (
              <div key={change.id} className="flex items-center justify-between p-3 bg-white rounded border">
                <div className="flex-1">
                  <div className="font-medium text-sm">{change.action === 'create' ? 'Created' : 'Updated'} {change.staffName}</div>
                  <div className="text-xs text-gray-500">{new Date(change.timestamp).toLocaleString()}</div>
                </div>
                {change.action === 'update' && (
                  <button onClick={() => undoChange(change)} className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors">
                    <RotateCcw size={12} />
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      tableProps={{
        editingId,
        editFormData,
        onRowClick: setSelectedRecord,
        renderActions,
        createRow,
        emptyMessage: 'No staff members found.'
      }}
    >
      {selectedRecord && <FacultyContactCard faculty={selectedRecord} onClose={() => setSelectedRecord(null)} />}
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        record={recordToDelete}
        recordType="staff member"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </UniversalDirectory>
  );
};

export default StaffDirectory;
