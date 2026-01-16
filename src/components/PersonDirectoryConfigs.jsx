import React, { useState } from 'react';
import {
  BookOpen,
  BookUser,
  Download,
  History,
  Plus,
  RotateCcw,
  UserCog,
  Users,
  Wifi
} from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';
import MultiSelectDropdown from './MultiSelectDropdown';
import { adaptPeopleToStaff } from '../utils/dataAdapter';
import { formatPhoneNumber, validateDirectoryEntry } from '../utils/directoryUtils';

const canUseWindow = typeof window !== 'undefined';

const buildCourseCounts = (records = [], scheduleData = [], filterFn = () => true) => {
  if (!Array.isArray(records)) return [];

  return records
    .filter(filterFn)
    .map((faculty) => {
      const facultyCourses = (scheduleData || []).filter((schedule) => {
        const scheduleInstructorIds = Array.isArray(schedule.instructorIds)
          ? schedule.instructorIds
          : [];
        const primaryInstructorId = schedule.instructorId || schedule.InstructorId || '';
        const effectiveIds = scheduleInstructorIds.length > 0
          ? scheduleInstructorIds
          : (primaryInstructorId ? [primaryInstructorId] : []);
        if (effectiveIds.length > 0) {
          return effectiveIds.includes(faculty.id);
        }
        const fallbackNames = Array.isArray(schedule.instructorNames)
          ? schedule.instructorNames
          : [schedule.instructorName || schedule.Instructor || ''].filter(Boolean);
        return fallbackNames.includes(faculty.name);
      });

      const uniqueCourses = [...new Set(facultyCourses.map((schedule) =>
        schedule.courseCode || schedule.Course || ''
      ))].filter((courseCode) => courseCode.trim() !== '');

      return {
        ...faculty,
        courseCount: uniqueCourses.length,
        courses: facultyCourses.map((schedule) => ({
          courseCode: schedule.courseCode || schedule.Course || '',
          courseTitle: schedule.courseTitle || schedule['Course Title'] || '',
          section: schedule.section || schedule.Section || '',
          term: schedule.term || schedule.Term || '',
          credits: schedule.credits || schedule.Credits || ''
        }))
      };
    });
};

const useFacultyExtras = () => {
  const [showOnlyWithCourses, setShowOnlyWithCourses] = useState(false);
  const [pinUPDsFirst, setPinUPDsFirst] = useState(false);
  return { showOnlyWithCourses, setShowOnlyWithCourses, pinUPDsFirst, setPinUPDsFirst };
};

const useAdjunctExtras = () => {
  const [showOnlyWithCourses, setShowOnlyWithCourses] = useState(false);
  return { showOnlyWithCourses, setShowOnlyWithCourses };
};

const useNoExtras = () => ({});

const exportFacultyCSV = (records = []) => {
  const headers = ['Name', 'Program', 'Job Title', 'Email', 'Phone', 'Office', 'Baylor ID', 'Courses', 'Remote'];
  const rows = records.map((faculty) => [
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
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
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
};

const renderHistoryPanel = ({
  changeHistory,
  showHistory,
  title,
  labelKey,
  onUndo
}) => {
  if (!showHistory || changeHistory.length === 0) return null;

  return (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="font-medium text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {changeHistory.map((change) => (
          <div key={change.id} className="flex items-center justify-between p-3 bg-white rounded border">
            <div className="flex-1">
              <div className="font-medium text-sm">
                {change.action === 'create' ? 'Created' : 'Updated'} {change[labelKey]}
              </div>
              <div className="text-xs text-gray-500">{new Date(change.timestamp).toLocaleString()}</div>
            </div>
            {change.action === 'update' && (
              <button
                onClick={() => onUndo(change)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              >
                <RotateCcw size={12} />
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const facultyDirectoryConfig = {
  title: 'Faculty Directory',
  icon: BookUser,
  recordType: 'faculty member',
  defaultSort: { key: 'courseCount', direction: 'descending' },
  defaultFilters: {
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
  },
  includePrograms: true,
  createEmptyRecord: () => ({
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
    isRemote: false
  }),
  validate: validateDirectoryEntry,
  preparePayload: (data) => {
    const originalRoles = data.roles;
    let updatedRoles;
    if (Array.isArray(originalRoles)) {
      updatedRoles = originalRoles.filter((role) => role !== 'faculty' && role !== 'staff');
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
  },
  useExtraState: useFacultyExtras,
  deriveData: ({ data, scheduleData }) => buildCourseCounts(data, scheduleData),
  applyFilters: (records, { filters, extraState }) => {
    let filtered = [...records];

    if (filters.adjunct !== 'all') {
      filtered = filtered.filter((person) => filters.adjunct === 'include' ? person.isAdjunct : !person.isAdjunct);
    }
    if (filters.tenured !== 'all') {
      filtered = filtered.filter((person) => filters.tenured === 'include' ? person.isTenured : !person.isTenured);
    }
    if (filters.upd !== 'all') {
      filtered = filtered.filter((person) => filters.upd === 'include' ? person.isUPD : !person.isUPD);
    }
    if (filters.isAlsoStaff !== 'all') {
      filtered = filtered.filter((person) => filters.isAlsoStaff === 'include' ? person.isAlsoStaff : !person.isAlsoStaff);
    }
    if (filters.hasPhD !== 'all') {
      filtered = filtered.filter((person) => filters.hasPhD === 'include' ? person.hasPhD : !person.hasPhD);
    }
    if (filters.isRemote !== 'all') {
      filtered = filtered.filter((person) => filters.isRemote === 'include' ? person.isRemote : !person.isRemote);
    }

    if (extraState.showOnlyWithCourses || filters.courseCount === 'with-courses') {
      filtered = filtered.filter((person) => person.courseCount > 0);
    } else if (filters.courseCount === 'without-courses') {
      filtered = filtered.filter((person) => person.courseCount === 0);
    }

    if (filters.hasBaylorId === 'with-id') {
      filtered = filtered.filter((person) => person.baylorId && person.baylorId.trim() !== '');
    } else if (filters.hasBaylorId === 'without-id') {
      filtered = filtered.filter((person) => !person.baylorId || person.baylorId.trim() === '');
    }

    return filtered;
  },
  getSortPriority: (person, extraState) => (extraState.pinUPDsFirst ? (person.isUPD ? 1 : 0) : 0),
  permissions: {
    canEdit: () => !canUseWindow || window?.appPermissions?.canEditFaculty !== false,
    canDelete: () => !canUseWindow || window?.appPermissions?.canDeleteFaculty !== false,
    canCreate: () => !canUseWindow || window?.appPermissions?.canAddFaculty !== false
  },
  enableCreate: true,
  emptyMessage: 'No faculty members found.',
  getColumns: ({ baseColumns, renderStatusToggles, editFormData, newRecord, handleChange, handleCreateChange, setEditFormData, setNewRecord }) => {
    const statusToggles = [
      { name: 'isAdjunct', label: 'Adjunct', className: 'flex items-center gap-2 text-xs' },
      { name: 'isTenured', label: 'Tenured' },
      { name: 'isAlsoStaff', label: 'Also a staff member' },
      { name: 'hasPhD', label: 'Has PhD' },
      { name: 'isRemote', label: 'Remote' }
    ];

    return [
      {
        key: 'name',
        label: 'Name',
        render: (faculty) => (
          <div className="text-gray-700 font-medium">
            <div>{faculty.name}</div>
            {faculty.program && <div className="text-xs text-baylor-green font-medium">{faculty.program.name}</div>}
            {faculty.isUPD && (
              <div className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <UserCog size={12} /> UPD
              </div>
            )}
            {faculty.isAlsoStaff && <div className="text-xs text-baylor-gold font-medium">Also Staff</div>}
            {faculty.isAdjunct && <div className="text-xs text-baylor-gold font-medium">Adjunct</div>}
            {faculty.isTenured && <div className="text-xs text-baylor-gold font-medium">Tenured</div>}
            {faculty.hasPhD && <div className="text-xs text-green-600 font-medium">PhD</div>}
            {faculty.isRemote && (
              <div className="text-xs text-link-green font-medium flex items-center gap-1">
                <Wifi size={12} /> Remote
              </div>
            )}
          </div>
        ),
        renderEdit: (faculty) => (
          <div className="p-2 align-top text-gray-700 font-medium">
            <div className="mb-2">{faculty.name}</div>
            {renderStatusToggles({
              toggles: statusToggles,
              formData: editFormData,
              onChange: handleChange,
              setFormData: setEditFormData,
              idPrefix: `faculty-${faculty.id}`
            })}
          </div>
        ),
        renderCreate: () => (
          <div className="text-gray-700 font-medium">
            <input
              name="name"
              value={newRecord.name || ''}
              onChange={handleCreateChange}
              className="w-full p-1 border rounded bg-baylor-gold/10 border-baylor-gold"
              placeholder="Full Name"
            />
            {renderStatusToggles({
              toggles: statusToggles,
              formData: newRecord,
              onChange: handleCreateChange,
              setFormData: setNewRecord,
              idPrefix: 'new-faculty'
            })}
          </div>
        )
      },
      baseColumns.program,
      baseColumns.jobTitle,
      baseColumns.email,
      baseColumns.phone,
      baseColumns.office,
      {
        key: 'courseCount',
        label: 'Courses',
        render: (faculty) => faculty.courseCount,
        renderEdit: (faculty) => <div className="text-sm text-gray-600">{faculty.courseCount || 0}</div>,
        renderCreate: () => <div className="text-sm text-gray-500 italic">Calculated from courses</div>
      }
    ];
  },
  leadingActions: ({ extraState }) => (
    <>
      <button
        onClick={() => extraState.setPinUPDsFirst((prev) => !prev)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${extraState.pinUPDsFirst ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'}`}
        title="Bring Undergraduate Program Directors to the top"
      >
        <UserCog size={16} />
        <span className="text-xs font-medium">UPD first</span>
      </button>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={extraState.showOnlyWithCourses}
          onChange={(event) => extraState.setShowOnlyWithCourses(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
        />
        Only show faculty with at least 1 course
      </label>
    </>
  ),
  trailingActions: ({ handlers, data }) => (
    <>
      <button
        onClick={() => exportFacultyCSV(data)}
        className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
      >
        <Download size={18} /> Export CSV
      </button>
      <button
        onClick={handlers.handleCreate}
        className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
        disabled={canUseWindow && window?.appPermissions?.canAddFaculty === false}
      >
        <Plus size={18} /> Add Faculty
      </button>
    </>
  ),
  filterContent: ({ state, filterOptions }) => (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Programs</label>
        <MultiSelectDropdown
          options={filterOptions.programs}
          selected={state.filters.programs}
          onChange={(selected) => state.setFilters((prev) => ({ ...prev, programs: selected }))}
          placeholder="Select programs..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
        <MultiSelectDropdown
          options={filterOptions.jobTitles}
          selected={state.filters.jobTitles}
          onChange={(selected) => state.setFilters((prev) => ({ ...prev, jobTitles: selected }))}
          placeholder="Select job titles..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Buildings</label>
        <MultiSelectDropdown
          options={filterOptions.buildings}
          selected={state.filters.buildings}
          onChange={(selected) => state.setFilters((prev) => ({ ...prev, buildings: selected }))}
          placeholder="Select buildings..."
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Adjunct Status</label>
          <select
            value={state.filters.adjunct}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, adjunct: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">Adjunct Only</option>
            <option value="exclude">Exclude Adjunct</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tenure Status</label>
          <select
            value={state.filters.tenured}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, tenured: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">Tenured Only</option>
            <option value="exclude">Exclude Tenured</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">UPD Status</label>
          <select
            value={state.filters.upd}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, upd: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">UPD Only</option>
            <option value="exclude">Exclude UPD</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Staff Status</label>
          <select
            value={state.filters.isAlsoStaff}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, isAlsoStaff: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">Also Staff</option>
            <option value="exclude">Faculty Only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Course Status</label>
          <select
            value={state.filters.courseCount}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, courseCount: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="with-courses">Teaching Courses</option>
            <option value="without-courses">Not Teaching</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">PhD Status</label>
          <select
            value={state.filters.hasPhD}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, hasPhD: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">PhD Only</option>
            <option value="exclude">Exclude PhD</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Baylor ID Status</label>
          <select
            value={state.filters.hasBaylorId}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, hasBaylorId: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="with-id">Has Baylor ID</option>
            <option value="without-id">Missing Baylor ID</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Remote Status</label>
          <select
            value={state.filters.isRemote}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, isRemote: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">Remote Only</option>
            <option value="exclude">Exclude Remote</option>
          </select>
        </div>
      </div>
    </>
  ),
  onClearFilters: ({ extraState }) => {
    extraState.setShowOnlyWithCourses(false);
  },
  renderContactCard: ({ record, onClose }) => (
    <FacultyContactCard faculty={record} onClose={onClose} />
  )
};

const staffDirectoryConfig = {
  title: 'Staff Directory',
  icon: Users,
  recordType: 'staff member',
  defaultSort: { key: 'name', direction: 'ascending' },
  defaultFilters: {
    jobTitles: [],
    buildings: [],
    isFullTime: 'all',
    isAlsoFaculty: 'all',
    isRemote: 'all'
  },
  createEmptyRecord: () => ({
    name: '',
    jobTitle: '',
    email: '',
    phone: '',
    office: '',
    isFullTime: true,
    isAlsoFaculty: false,
    hasNoPhone: false,
    hasNoOffice: false,
    isRemote: false
  }),
  validate: validateDirectoryEntry,
  preparePayload: (data) => {
    const originalRoles = data.roles;
    let updatedRoles;
    if (Array.isArray(originalRoles)) {
      updatedRoles = originalRoles.filter((role) => role !== 'faculty' && role !== 'staff');
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
  },
  useExtraState: useNoExtras,
  deriveData: ({ data, programs }) => (Array.isArray(data) ? adaptPeopleToStaff(data, [], programs) : []),
  changeTracking: { idKey: 'staffId', nameKey: 'staffName' },
  applyFilters: (records, { filters }) => {
    let filtered = [...records];

    if (filters.isFullTime !== 'all') {
      filtered = filtered.filter((person) => {
        if (filters.isFullTime === 'full-time') return person.isFullTime;
        if (filters.isFullTime === 'part-time') return !person.isFullTime;
        return true;
      });
    }

    if (filters.isAlsoFaculty !== 'all') {
      filtered = filtered.filter((person) => {
        if (filters.isAlsoFaculty === 'include') return person.isAlsoFaculty;
        if (filters.isAlsoFaculty === 'exclude') return !person.isAlsoFaculty;
        return true;
      });
    }

    if (filters.isRemote !== 'all') {
      filtered = filtered.filter((person) => {
        if (filters.isRemote === 'include') return person.isRemote;
        if (filters.isRemote === 'exclude') return !person.isRemote;
        return true;
      });
    }

    return filtered;
  },
  permissions: {
    canCreate: () => !canUseWindow || (window?.appPermissions?.canCreateStaff !== false)
  },
  enableCreate: true,
  emptyMessage: 'No staff members found.',
  getColumns: ({ baseColumns, renderStatusToggles, editFormData, newRecord, handleChange, handleCreateChange, setEditFormData, setNewRecord }) => {
    const statusToggles = [
      { name: 'isFullTime', label: 'Full Time', className: 'flex items-center gap-2 text-xs' },
      { name: 'isAlsoFaculty', label: 'Also a faculty member' },
      { name: 'isRemote', label: 'Remote' }
    ];

    return [
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
              <div className="text-xs text-link-green font-medium flex items-center gap-1">
                <Wifi size={12} /> Remote
              </div>
            )}
          </div>
        ),
        renderEdit: (staff) => (
          <div className="p-2 align-top text-gray-700 font-medium">
            <div className="mb-2">{staff.name}</div>
            {renderStatusToggles({
              toggles: statusToggles,
              formData: editFormData,
              onChange: handleChange,
              setFormData: setEditFormData,
              idPrefix: `staff-${staff.id}`
            })}
          </div>
        ),
        renderCreate: () => (
          <div className="text-gray-700 font-medium">
            <input
              name="name"
              value={newRecord.name || ''}
              onChange={handleCreateChange}
              className="w-full p-1 border rounded bg-baylor-gold/10 border-baylor-gold"
              placeholder="Full Name"
            />
            {renderStatusToggles({
              toggles: statusToggles,
              formData: newRecord,
              onChange: handleCreateChange,
              setFormData: setNewRecord,
              idPrefix: 'new-staff'
            })}
          </div>
        )
      },
      baseColumns.jobTitle,
      baseColumns.email,
      baseColumns.phone,
      baseColumns.office
    ];
  },
  trailingActions: ({ handlers, state }) => (
    <>
      {state.changeHistory.length > 0 && (
        <button
          onClick={() => state.setShowHistory(!state.showHistory)}
          className="flex items-center gap-2 px-3 py-2 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 transition-colors"
        >
          <History size={16} />
          Changes ({state.changeHistory.length})
        </button>
      )}
      <button
        onClick={handlers.handleCreate}
        className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
        disabled={canUseWindow && window?.appPermissions?.canCreateStaff === false}
      >
        <Plus size={18} />
        Add Staff
      </button>
    </>
  ),
  filterContent: ({ state, filterOptions }) => (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
        <MultiSelectDropdown
          options={filterOptions.jobTitles}
          selected={state.filters.jobTitles}
          onChange={(selected) => state.setFilters((prev) => ({ ...prev, jobTitles: selected }))}
          placeholder="Select job titles..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Buildings</label>
        <MultiSelectDropdown
          options={filterOptions.buildings}
          selected={state.filters.buildings}
          onChange={(selected) => state.setFilters((prev) => ({ ...prev, buildings: selected }))}
          placeholder="Select buildings..."
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Employment Status</label>
          <select
            value={state.filters.isFullTime}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, isFullTime: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="full-time">Full-time Only</option>
            <option value="part-time">Part-time Only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Faculty Status</label>
          <select
            value={state.filters.isAlsoFaculty}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, isAlsoFaculty: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">Also Faculty</option>
            <option value="exclude">Staff Only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Remote Status</label>
          <select
            value={state.filters.isRemote}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, isRemote: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">Remote Only</option>
            <option value="exclude">Exclude Remote</option>
          </select>
        </div>
      </div>
    </>
  ),
  bodyTop: ({ state, onUpdate, onRelatedUpdate }) => {
    const undoChange = async (change) => {
      if (change.action !== 'update') return;

      try {
        const dataToRestore = { ...change.originalData };
        if (dataToRestore.isAlsoFaculty && onRelatedUpdate) {
          await onRelatedUpdate(dataToRestore);
        } else if (onUpdate) {
          await onUpdate(dataToRestore);
        }
        state.setChangeHistory((prev) => prev.filter((item) => item.id !== change.id));
      } catch (error) {
        console.error('Error undoing change:', error);
      }
    };

    return renderHistoryPanel({
      changeHistory: state.changeHistory,
      showHistory: state.showHistory,
      title: 'Recent Changes',
      labelKey: 'staffName',
      onUndo: undoChange
    });
  },
  renderContactCard: ({ record, onClose }) => (
    <FacultyContactCard faculty={record} onClose={onClose} />
  )
};

const adjunctDirectoryConfig = {
  title: 'Adjunct Faculty Directory',
  icon: BookUser,
  recordType: 'adjunct faculty member',
  defaultSort: { key: 'courseCount', direction: 'descending' },
  defaultFilters: {
    programs: [],
    jobTitles: [],
    buildings: [],
    courseCount: 'all',
    isRemote: 'all'
  },
  includePrograms: true,
  createEmptyRecord: () => ({
    name: '',
    jobTitle: '',
    email: '',
    phone: '',
    office: '',
    baylorId: '',
    isAdjunct: true,
    isTenured: false,
    isAlsoStaff: false,
    hasNoPhone: false,
    hasNoOffice: false,
    isRemote: false
  }),
  validate: validateDirectoryEntry,
  preparePayload: (data) => ({
    ...data,
    phone: (data.phone || '').replace(/\D/g, ''),
    isAdjunct: true
  }),
  useExtraState: useAdjunctExtras,
  deriveData: ({ data, scheduleData }) => buildCourseCounts(
    data,
    scheduleData,
    (faculty) => faculty.isAdjunct
  ),
  changeTracking: { idKey: 'facultyId', nameKey: 'facultyName' },
  applyFilters: (records, { filters, extraState }) => {
    let filtered = [...records];

    if (extraState.showOnlyWithCourses || filters.courseCount === 'with-courses') {
      filtered = filtered.filter((person) => person.courseCount > 0);
    } else if (filters.courseCount === 'without-courses') {
      filtered = filtered.filter((person) => person.courseCount === 0);
    }

    if (filters.isRemote !== 'all') {
      filtered = filtered.filter((person) => filters.isRemote === 'include' ? person.isRemote : !person.isRemote);
    }

    return filtered;
  },
  permissions: {
    canEdit: () => !canUseWindow || window?.appPermissions?.canEditAdjunct !== false,
    canDelete: () => !canUseWindow || window?.appPermissions?.canDeleteAdjunct !== false,
    canCreate: () => !canUseWindow || window?.appPermissions?.canCreateAdjunct !== false
  },
  enableCreate: true,
  emptyMessage: 'No adjunct faculty found.',
  getColumns: ({ baseColumns, renderStatusToggles, editFormData, newRecord, handleChange, handleCreateChange, setEditFormData, setNewRecord }) => {
    const statusToggles = [
      { name: 'isAdjunct', label: 'Adjunct', className: 'flex items-center gap-2 text-xs' },
      { name: 'isTenured', label: 'Tenured' },
      { name: 'isAlsoStaff', label: 'Also a staff member' },
      { name: 'isRemote', label: 'Remote' }
    ];

    return [
      {
        key: 'name',
        label: 'Name',
        render: (faculty) => (
          <div className="text-gray-700 font-medium">
            <div>{faculty.name}</div>
            {faculty.program && (
              <div className="text-xs text-baylor-green font-medium">{faculty.program.name}</div>
            )}
            <div className="text-xs text-baylor-gold font-medium">Adjunct</div>
            {faculty.isAlsoStaff && (
              <div className="text-xs text-baylor-gold font-medium">Also Staff</div>
            )}
            {faculty.isTenured && (
              <div className="text-xs text-baylor-gold font-medium">Tenured</div>
            )}
            {faculty.isRemote && (
              <div className="text-xs text-link-green font-medium flex items-center gap-1">
                <Wifi size={12} /> Remote
              </div>
            )}
          </div>
        ),
        renderEdit: (faculty) => (
          <div className="p-2 align-top text-gray-700 font-medium">
            <div className="mb-2">{faculty.name}</div>
            {renderStatusToggles({
              toggles: statusToggles,
              formData: editFormData,
              onChange: handleChange,
              setFormData: setEditFormData,
              idPrefix: `adjunct-${faculty.id}`
            })}
          </div>
        ),
        renderCreate: () => (
          <div className="text-gray-700 font-medium">
            <input
              name="name"
              value={newRecord.name || ''}
              onChange={handleCreateChange}
              className="w-full p-1 border rounded bg-baylor-gold/10 border-baylor-gold"
              placeholder="Full Name"
            />
            {renderStatusToggles({
              toggles: statusToggles,
              formData: newRecord,
              onChange: handleCreateChange,
              setFormData: setNewRecord,
              idPrefix: 'new-adjunct'
            })}
          </div>
        )
      },
      baseColumns.program,
      baseColumns.jobTitle,
      baseColumns.email,
      baseColumns.phone,
      baseColumns.office,
      {
        key: 'courseCount',
        label: 'Courses',
        render: (faculty) => (
          <div className="flex items-center gap-2">
            <span>{faculty.courseCount}</span>
            {faculty.courseCount > 0 && <BookOpen size={14} className="text-baylor-green" />}
          </div>
        ),
        renderEdit: (faculty) => (
          <div className="text-sm text-gray-600">{faculty.courseCount || 0}</div>
        )
      }
    ];
  },
  leadingActions: ({ extraState }) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={extraState.showOnlyWithCourses}
        onChange={(event) => extraState.setShowOnlyWithCourses(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
      />
      Only show adjunct with at least 1 course
    </label>
  ),
  trailingActions: ({ handlers, state }) => (
    <>
      {state.changeHistory.length > 0 && (
        <button
          onClick={() => state.setShowHistory(!state.showHistory)}
          className="flex items-center gap-2 px-3 py-2 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 transition-colors"
        >
          <History size={16} />
          Changes ({state.changeHistory.length})
        </button>
      )}
      <button
        onClick={handlers.handleCreate}
        className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
        disabled={canUseWindow && window?.appPermissions?.canCreateAdjunct === false}
      >
        <Plus size={18} />
        Add Adjunct
      </button>
    </>
  ),
  filterContent: ({ state, filterOptions }) => (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Programs</label>
        <MultiSelectDropdown
          options={filterOptions.programs}
          selected={state.filters.programs}
          onChange={(selected) => state.setFilters((prev) => ({ ...prev, programs: selected }))}
          placeholder="Select programs..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
        <MultiSelectDropdown
          options={filterOptions.jobTitles}
          selected={state.filters.jobTitles}
          onChange={(selected) => state.setFilters((prev) => ({ ...prev, jobTitles: selected }))}
          placeholder="Select job titles..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Buildings</label>
        <MultiSelectDropdown
          options={filterOptions.buildings}
          selected={state.filters.buildings}
          onChange={(selected) => state.setFilters((prev) => ({ ...prev, buildings: selected }))}
          placeholder="Select buildings..."
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Course Status</label>
          <select
            value={state.filters.courseCount}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, courseCount: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="with-courses">Teaching Courses</option>
            <option value="without-courses">Not Teaching</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Remote Status</label>
          <select
            value={state.filters.isRemote}
            onChange={(event) => state.setFilters((prev) => ({ ...prev, isRemote: event.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
          >
            <option value="all">All</option>
            <option value="include">Remote Only</option>
            <option value="exclude">Exclude Remote</option>
          </select>
        </div>
      </div>
    </>
  ),
  onClearFilters: ({ extraState }) => {
    extraState.setShowOnlyWithCourses(false);
  },
  bodyTop: ({ state, onUpdate, onRelatedUpdate }) => {
    const undoChange = async (change) => {
      if (change.action !== 'update') return;

      try {
        const dataToRestore = { ...change.originalData };
        if (dataToRestore.isAlsoStaff && onRelatedUpdate) {
          await onRelatedUpdate(dataToRestore);
        } else if (onUpdate) {
          await onUpdate(dataToRestore);
        }
        state.setChangeHistory((prev) => prev.filter((item) => item.id !== change.id));
      } catch (error) {
        console.error('Error undoing change:', error);
      }
    };

    return renderHistoryPanel({
      changeHistory: state.changeHistory,
      showHistory: state.showHistory,
      title: 'Recent Changes',
      labelKey: 'facultyName',
      onUndo: undoChange
    });
  },
  renderContactCard: ({ record, onClose }) => (
    <FacultyContactCard faculty={record} onClose={onClose} />
  )
};

export { facultyDirectoryConfig, staffDirectoryConfig, adjunctDirectoryConfig };
