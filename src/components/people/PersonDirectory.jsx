import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Edit, Save, X, Trash2, Phone, PhoneOff, Building, BuildingIcon, ExternalLink } from 'lucide-react';
import { useDirectoryState, useDirectoryHandlers } from '../../hooks';
import { useData } from '../../contexts/DataContext';
import ConfirmDialog from '../shared/ConfirmDialog';
import UniversalDirectory from '../shared/UniversalDirectory';
import MultiSelectDropdown from '../MultiSelectDropdown';
import {
  buildDirectoryFilterOptions,
  dedupeDirectoryRecords,
  formatPhoneNumber,
  resolveOfficeDetails
} from '../../utils/directoryUtils';
import { resolveOfficeLocations } from '../../utils/spaceUtils';

import SelectDropdown from "../SelectDropdown";
const getNameSortValue = (person, nameSort) => {
  if (nameSort === 'firstName') {
    return (person.firstName || person.name?.split(' ')[0] || '').toLowerCase();
  }
  const nameParts = (person.lastName || person.name || '').split(' ');
  return (person.lastName || nameParts[nameParts.length - 1] || '').toLowerCase();
};

const renderStatusToggles = ({
  toggles,
  formData,
  onChange,
  setFormData,
  idPrefix
}) => (
  toggles.map((toggle, index) => {
    const isHidden = typeof toggle.hidden === 'function' ? toggle.hidden(formData) : toggle.hidden;
    if (isHidden) return null;

    const isDisabled = typeof toggle.disabled === 'function' ? toggle.disabled(formData) : toggle.disabled;
    const containerClassName = `${toggle.className || 'flex items-center gap-2 text-xs'}${isDisabled ? ' opacity-60' : ''}`;
    const isChecked = typeof toggle.getChecked === 'function'
      ? toggle.getChecked(formData)
      : !!formData[toggle.name];

    const handleToggle = (event) => {
      if (typeof toggle.onToggle === 'function') {
        toggle.onToggle(event, { setFormData, onChange });
        return;
      }

      if (toggle.name === 'isRemote' && typeof setFormData === 'function') {
        const isChecked = event.target.checked;
        setFormData(prev => ({
          ...prev,
          isRemote: isChecked,
          ...(isChecked
            ? {
                hasNoOffice: true,
                office: '',
                offices: [],
                officeSpaceId: '',
                officeSpaceIds: [],
              }
            : {})
        }));
        return;
      }

      if (typeof onChange === 'function') {
        onChange(event);
      }
    };

    return (
      <div key={`${toggle.name}-${index}`} className={containerClassName}>
        <input
          type="checkbox"
          id={`${idPrefix}-${toggle.name}`}
          name={toggle.name}
          checked={isChecked}
          onChange={handleToggle}
          disabled={isDisabled}
          className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green disabled:cursor-not-allowed"
        />
        <label htmlFor={`${idPrefix}-${toggle.name}`} className="font-normal">
          {toggle.label}
        </label>
      </div>
    );
  })
);

const buildBaseColumns = ({
  programs,
  editFormData,
  setEditFormData,
  newRecord,
  setNewRecord,
  errors,
  handleChange,
  handleCreateChange,
  toggleEditPhoneState,
  toggleEditOfficeState,
  toggleCreatePhoneState,
  toggleCreateOfficeState,
  getInputClass,
  spacesByKey,
  spacePicker,
}) => {
  const programColumn = {
    key: 'program',
    label: 'Program',
    headerClassName: 'w-[15%]',
    render: (person) => person.program?.name || '-',
    renderEdit: () => (
      <SelectDropdown
        name="programId"
        value={editFormData.programId || ''}
        onChange={handleChange}
        className={getInputClass('programId')}
      >
        <option value="">No Program</option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>{program.name}</option>
        ))}
      </SelectDropdown>
    ),
    renderCreate: () => (
      <SelectDropdown
        name="programId"
        value={newRecord.programId || ''}
        onChange={handleCreateChange}
        className={getInputClass('programId')}
      >
        <option value="">No Program</option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>{program.name}</option>
        ))}
      </SelectDropdown>
    )
  };

  const jobTitleColumn = {
    key: 'jobTitle',
    label: 'Job Title',
    headerClassName: 'w-[15%]',
    render: (person) => person.jobTitle || '-',
    renderEdit: () => (
      <input
        name="jobTitle"
        value={editFormData.jobTitle || ''}
        onChange={handleChange}
        className={getInputClass('jobTitle')}
        placeholder="Job Title"
      />
    ),
    renderCreate: () => (
      <input
        name="jobTitle"
        value={newRecord.jobTitle || ''}
        onChange={handleCreateChange}
        className={getInputClass('jobTitle')}
        placeholder="Job Title"
      />
    )
  };

  const emailColumn = {
    key: 'email',
    label: 'Email',
    headerClassName: 'w-[15%]',
    render: (person) => person.email || '-',
    renderEdit: () => (
      <div>
        <input
          name="email"
          value={editFormData.email || ''}
          onChange={handleChange}
          className={getInputClass('email')}
          placeholder="email@baylor.edu"
        />
        {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
      </div>
    ),
    renderCreate: () => (
      <div>
        <input
          name="email"
          value={newRecord.email || ''}
          onChange={handleCreateChange}
          className={getInputClass('email')}
          placeholder="email@baylor.edu"
        />
        {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
      </div>
    )
  };

  const phoneColumn = {
    key: 'phone',
    label: 'Phone',
    headerClassName: 'w-[120px]',
    render: (person) => (
      <div className="flex items-center gap-2">
        {person.hasNoPhone ? (
          <span className="flex items-center gap-1 text-gray-500">
            <PhoneOff size={14} />
            No phone
          </span>
        ) : (
          formatPhoneNumber(person.phone)
        )}
      </div>
    ),
    renderEdit: () => (
      <div>
        <div className="flex items-center gap-2">
          <input
            name="phone"
            value={editFormData.phone || ''}
            onChange={handleChange}
            className={getInputClass('phone')}
            placeholder="10 digits"
            maxLength="10"
            disabled={editFormData.hasNoPhone}
          />
          <button
            type="button"
            onClick={toggleEditPhoneState}
            className={`p-1 rounded transition-colors ${editFormData.hasNoPhone ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}
            title={editFormData.hasNoPhone ? 'Has no phone number' : 'Has phone number'}
          >
            {editFormData.hasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
          </button>
        </div>
        {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
      </div>
    ),
    renderCreate: () => (
      <div>
        <div className="flex items-center gap-2">
          <input
            name="phone"
            value={newRecord.phone || ''}
            onChange={handleCreateChange}
            className={getInputClass('phone')}
            placeholder="10 digits"
            maxLength="10"
            disabled={newRecord.hasNoPhone}
          />
          <button
            type="button"
            onClick={toggleCreatePhoneState}
            className={`p-1 rounded transition-colors ${newRecord.hasNoPhone ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            {newRecord.hasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
          </button>
        </div>
        {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
      </div>
    )
  };

  const resolvedSpacePicker = spacePicker || { options: [], displayMap: {} };

  const officeColumn = {
    key: 'office',
    label: 'Office',
    headerClassName: 'w-[150px]',
    render: (person) => {
      if (person.hasNoOffice) {
        return (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-gray-500">
              <BuildingIcon size={14} className="opacity-50" />
              No office
            </span>
          </div>
        );
      }

      const locations = resolveOfficeLocations(person, spacesByKey);
      if (locations.length === 0) {
        return <span className="text-gray-400">-</span>;
      }

      const renderOne = (location, idx, total) => {
        const label = location?.displayName || location?.spaceKey || '-';
        const spaceKey = (location?.spaceKey || '').toString().trim();
        const content = (
          <span className={idx === 0 ? 'font-medium' : 'text-gray-600 text-sm'}>
            {label}
            {idx === 0 && total > 1 ? ' (primary)' : ''}
          </span>
        );

        if (!spaceKey) return content;

        return (
          <Link
            to={`/facilities/spaces?spaceKey=${encodeURIComponent(spaceKey)}&usage=office`}
            className="hover:underline text-baylor-green"
            title="View this office in Facilities > Spaces"
          >
            {content}
          </Link>
        );
      };

      if (locations.length === 1) {
        return renderOne(locations[0], 0, 1);
      }
      return (
        <div className="flex flex-col gap-0.5">
          {locations.map((location, idx) => (
            <div key={location?.spaceKey || location?.displayName || idx}>
              {renderOne(location, idx, locations.length)}
            </div>
          ))}
        </div>
      );
    },
    renderEdit: () => {
      const selected = Array.isArray(editFormData.officeSpaceIds)
        ? editFormData.officeSpaceIds.filter(Boolean)
        : editFormData.officeSpaceId
          ? [editFormData.officeSpaceId]
          : [];
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <MultiSelectDropdown
                options={resolvedSpacePicker.options}
                selected={selected}
                onChange={(next) => {
                  const cleaned = Array.isArray(next)
                    ? next
                        .map((v) => (v || '').toString().trim())
                        .filter(Boolean)
                        .slice(0, 3)
                    : [];
                  setEditFormData((prev) => ({
                    ...prev,
                    officeSpaceIds: cleaned,
                    officeSpaceId: cleaned[0] || '',
                    hasNoOffice: cleaned.length > 0 ? false : prev.hasNoOffice,
                  }));
                }}
                placeholder="Select office(s)..."
                displayMap={resolvedSpacePicker.displayMap}
                showSelectedLabels
                menuPortal
                enableSearch
                searchPlaceholder="Search spaces..."
                disabled={editFormData.hasNoOffice}
              />
              <div className="text-[11px] text-gray-500 mt-1">
                Select up to 3 spaces. Office labels are derived from the selected space keys.
              </div>
            </div>
            <button
              type="button"
              onClick={toggleEditOfficeState}
              className={`p-1 rounded transition-colors mt-1 ${editFormData.hasNoOffice ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}
              title={editFormData.hasNoOffice ? 'Has no office' : 'Has office'}
            >
              {editFormData.hasNoOffice ? (
                <BuildingIcon size={16} className="opacity-50" />
              ) : (
                <Building size={16} />
              )}
            </button>
          </div>
          <Link
            to="/facilities/spaces"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-baylor-green transition-colors"
            title="Manage all spaces"
          >
            <ExternalLink size={12} />
            Manage Spaces
          </Link>
        </div>
      );
    },
    renderCreate: () => {
      const selected = Array.isArray(newRecord.officeSpaceIds)
        ? newRecord.officeSpaceIds.filter(Boolean)
        : newRecord.officeSpaceId
          ? [newRecord.officeSpaceId]
          : [];
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <MultiSelectDropdown
                options={resolvedSpacePicker.options}
                selected={selected}
                onChange={(next) => {
                  const cleaned = Array.isArray(next)
                    ? next
                        .map((v) => (v || '').toString().trim())
                        .filter(Boolean)
                        .slice(0, 3)
                    : [];
                  setNewRecord((prev) => ({
                    ...prev,
                    officeSpaceIds: cleaned,
                    officeSpaceId: cleaned[0] || '',
                    hasNoOffice: cleaned.length > 0 ? false : prev.hasNoOffice,
                  }));
                }}
                placeholder="Select office(s)..."
                displayMap={resolvedSpacePicker.displayMap}
                showSelectedLabels
                menuPortal
                enableSearch
                searchPlaceholder="Search spaces..."
                disabled={newRecord.hasNoOffice}
              />
              <div className="text-[11px] text-gray-500 mt-1">
                Select up to 3 spaces.
              </div>
            </div>
            <button
              type="button"
              onClick={toggleCreateOfficeState}
              className={`p-1 rounded transition-colors mt-1 ${newRecord.hasNoOffice ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}
              title={newRecord.hasNoOffice ? 'Has no office' : 'Has office'}
            >
              {newRecord.hasNoOffice ? (
                <BuildingIcon size={16} className="opacity-50" />
              ) : (
                <Building size={16} />
              )}
            </button>
          </div>
        </div>
      );
    }
  };

  return {
    program: programColumn,
    jobTitle: jobTitleColumn,
    email: emailColumn,
    phone: phoneColumn,
    office: officeColumn
  };
};

const buildCreateRow = ({ columns, isCreating, renderCreateActions }) => {
  if (!isCreating) return null;

  // Return table cells (td elements) for use inside a <tr> in DirectoryTable
  return (
    <>
      {columns.map((column) => (
        <td key={column.key} className="px-4 py-3 align-top">
          {column.renderCreate ? column.renderCreate() : null}
        </td>
      ))}
      {renderCreateActions && (
        <td className="px-4 py-3 text-right align-top">
          {renderCreateActions()}
        </td>
      )}
    </>
  );
};

const getPermissionValue = (permission, record) => {
  if (typeof permission === 'function') {
    return permission(record) !== false;
  }
  if (permission === false) return false;
  return true;
};

const ConfiguredPersonDirectory = (props) => {
  const { config } = props;
  const { spacesByKey, spacesList, selectedSemester } = useData();

  const {
    config: _config,
    data = [],
    scheduleData = [],
    programs = [],
    onUpdate,
    onRelatedUpdate,
    onDelete,
    ...rest
  } = props;

  const {
    title,
    icon,
    recordType = 'record',
    defaultSort,
    defaultFilters,
    createEmptyRecord,
    validate = () => ({}),
    preparePayload = (payload) => payload,
    includePrograms = false,
    useExtraState = () => ({}),
    deriveData,
    applyFilters,
    getSortValue,
    getSortPriority,
    searchFields = ['name', 'email', 'jobTitle', 'office'],
    permissions = {},
    enableCreate = false,
    emptyMessage = 'No records found.',
    tableProps,
    onClearFilters,
    changeTracking,
    getFilterOptions,
    getColumns,
    leadingActions,
    trailingActions,
    filterContent,
    bodyTop,
    bodyBottom,
    renderContactCard
  } = config;

  const extraState = useExtraState();

  const state = useDirectoryState({
    defaultSort,
    defaultFilters,
    createEmptyRecord
  });

  const {
    editingId,
    editFormData,
    setEditFormData,
    errors,
    filterText,
    setFilterText,
    showFilters,
    setShowFilters,
    filters,
    sortConfig,
    nameSort,
    setNameSort,
    showDeleteConfirm,
    recordToDelete,
    isCreating,
    newRecord,
    setNewRecord,
    setChangeHistory,
    selectedRecord,
    setSelectedRecord
  } = state;

  const trackChange = useMemo(() => {
    if (!changeTracking) return undefined;
    const { idKey, nameKey } = changeTracking;
    return (originalData, updatedData, action) => {
      const change = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        action,
        originalData: { ...originalData },
        updatedData: { ...updatedData },
        [idKey]: originalData.id || updatedData.id,
        [nameKey]: originalData.name || updatedData.name
      };
      setChangeHistory((prev) => [change, ...prev.slice(0, 19)]);
    };
  }, [changeTracking, setChangeHistory]);

  const handlers = useDirectoryHandlers({
    state,
    data,
    onUpdate,
    onDelete,
    validate,
    preparePayload,
    trackChange
  });

  const {
    handleEdit,
    handleCancel,
    handleSave,
    handleChange,
    handleCancelCreate,
    handleCreateChange,
    handleCreateSave,
    handleSort,
    handleDelete,
    confirmDelete,
    cancelDelete,
    clearFilters,
    toggleEditPhoneState,
    toggleEditOfficeState,
    toggleCreatePhoneState,
    toggleCreateOfficeState,
    getInputClass
  } = handlers;

  const derivedData = useMemo(() => {
    if (typeof deriveData === 'function') {
      return deriveData({ data, scheduleData, programs, extraState, selectedSemester });
    }
    return Array.isArray(data) ? data : [];
  }, [data, scheduleData, programs, extraState, deriveData, selectedSemester]);

  const uniqueDirectoryData = useMemo(() => {
    if (config.dedupe === false) return derivedData;
    return dedupeDirectoryRecords(derivedData);
  }, [config.dedupe, derivedData]);

  const filterOptions = useMemo(() => {
    if (typeof getFilterOptions === 'function') {
      return getFilterOptions(uniqueDirectoryData);
    }
    return buildDirectoryFilterOptions(uniqueDirectoryData, { includePrograms, spacesByKey });
  }, [uniqueDirectoryData, getFilterOptions, includePrograms, spacesByKey]);

  const filteredData = useMemo(() => {
    let result = [...uniqueDirectoryData];

    if (filterText) {
      const term = filterText.toLowerCase();
      result = result.filter((person) => (
        searchFields.some((field) => (person[field] || '').toString().toLowerCase().includes(term))
      ));
    }

    if (Array.isArray(filters.programs) && filters.programs.length > 0) {
      result = result.filter((person) => filters.programs.includes(person.program?.name || ''));
    }

    if (Array.isArray(filters.jobTitles) && filters.jobTitles.length > 0) {
      result = result.filter((person) => filters.jobTitles.includes(person.jobTitle || ''));
    }

    if (Array.isArray(filters.buildings) && filters.buildings.length > 0) {
      result = result.filter((person) => {
        const { buildingName } = resolveOfficeDetails(person, spacesByKey);
        return filters.buildings.includes(buildingName || 'No Building');
      });
    }

    if (typeof applyFilters === 'function') {
      result = applyFilters(result, { filters, filterText, extraState, data: uniqueDirectoryData });
    }

    return result;
  }, [uniqueDirectoryData, filterText, filters, searchFields, applyFilters, extraState, spacesByKey]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];

    sorted.sort((a, b) => {
      if (typeof getSortPriority === 'function') {
        const priorityA = getSortPriority(a, extraState);
        const priorityB = getSortPriority(b, extraState);
        if (priorityA !== priorityB) {
          return priorityB - priorityA;
        }
      }

      let valA;
      let valB;

      if (typeof getSortValue === 'function') {
        valA = getSortValue(a, sortConfig.key, nameSort, extraState);
        valB = getSortValue(b, sortConfig.key, nameSort, extraState);
      }

      if (valA === undefined || valB === undefined) {
        if (sortConfig.key === 'name') {
          valA = getNameSortValue(a, nameSort);
          valB = getNameSortValue(b, nameSort);
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
      }

      if (typeof valA === 'boolean') {
        return valA === valB ? 0 : (valA ? -1 : 1);
      }

      const normalizedA = valA;
      const normalizedB = valB;

      if (normalizedA < normalizedB) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (normalizedA > normalizedB) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredData, sortConfig, nameSort, getSortPriority, getSortValue, extraState]);

  const spacePicker = useMemo(() => {
    const list = Array.isArray(spacesList) ? spacesList : [];
    const seen = new Set();
    const options = [];
    const displayMap = {};
    const typeMap = {};

    list.forEach((space) => {
      if (!space || space.isActive === false) return;
      const key = (space.spaceKey || space.id || '').toString().trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      options.push(key);
      displayMap[key] = (space.displayName || space.name || key).toString().trim() || key;
      typeMap[key] = (space.type || '').toString().trim().toLowerCase();
    });

    options.sort((a, b) => {
      const aOffice = typeMap[a] === 'office';
      const bOffice = typeMap[b] === 'office';
      if (aOffice !== bOffice) return aOffice ? -1 : 1;
      return (displayMap[a] || a).localeCompare(displayMap[b] || b);
    });

    return { options, displayMap };
  }, [spacesList]);

  const baseColumns = useMemo(() => buildBaseColumns({
    programs,
    editFormData,
    setEditFormData,
    newRecord,
    setNewRecord,
    errors,
    handleChange,
    handleCreateChange,
    toggleEditPhoneState,
    toggleEditOfficeState,
    toggleCreatePhoneState,
    toggleCreateOfficeState,
    getInputClass,
    spacesByKey,
    spacePicker
  }), [
    programs,
    editFormData,
    setEditFormData,
    newRecord,
    setNewRecord,
    errors,
    handleChange,
    handleCreateChange,
    toggleEditPhoneState,
    toggleEditOfficeState,
    toggleCreatePhoneState,
    toggleCreateOfficeState,
    getInputClass,
    spacesByKey,
    spacePicker
  ]);

  const columns = useMemo(() => getColumns({
    baseColumns,
    renderStatusToggles,
    editFormData,
    newRecord,
    errors,
    handleChange,
    handleCreateChange,
    setEditFormData,
    setNewRecord,
    programs,
    extraState
  }), [
    getColumns,
    baseColumns,
    editFormData,
    newRecord,
    errors,
    handleChange,
    handleCreateChange,
    setEditFormData,
    setNewRecord,
    programs,
    extraState
  ]);

  const renderActions = useCallback((record, isEditing) => {
    if (isEditing) {
      const canSave = getPermissionValue(permissions.canEdit, record);
      return (
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="p-2 text-green-600 hover:bg-green-100 rounded-full"
            disabled={!canSave}
          >
            <Save size={16} />
          </button>
          <button
            onClick={handleCancel}
            className="p-2 text-red-600 hover:bg-red-100 rounded-full"
          >
            <X size={16} />
          </button>
        </div>
      );
    }

    const canEdit = getPermissionValue(permissions.canEdit, record);
    const canDelete = getPermissionValue(permissions.canDelete, record);

    return (
      <div className="flex gap-1 justify-end">
        <button
          onClick={(event) => { event.stopPropagation(); handleEdit(record); }}
          className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
          disabled={!canEdit}
        >
          <Edit size={16} />
        </button>
        <button
          onClick={(event) => { event.stopPropagation(); handleDelete(record); }}
          className="p-2 text-red-600 hover:bg-red-100 rounded-full"
          disabled={!canDelete}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  }, [permissions, handleSave, handleCancel, handleEdit, handleDelete]);

  const createActions = useCallback(() => (
    <div className="flex gap-2 justify-end">
      <button
        onClick={handleCreateSave}
        className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
        disabled={!getPermissionValue(permissions.canCreate)}
      >
        <Save size={16} />
      </button>
      <button
        onClick={handleCancelCreate}
        className="p-2 text-red-600 hover:bg-red-100 rounded-full"
      >
        <X size={16} />
      </button>
    </div>
  ), [handleCreateSave, handleCancelCreate, permissions.canCreate]);

  const createRow = buildCreateRow({
    columns,
    isCreating: enableCreate && isCreating,
    renderCreateActions: renderActions ? createActions : null
  });

  const handleClearFilters = useCallback(() => {
    clearFilters();
    if (typeof onClearFilters === 'function') {
      onClearFilters({ extraState, state });
    }
  }, [clearFilters, onClearFilters, extraState, state]);

  const leadingNode = typeof leadingActions === 'function'
    ? leadingActions({
      data: sortedData,
      state,
      handlers,
      extraState,
      filterOptions,
      onUpdate,
      onRelatedUpdate
    })
    : leadingActions;

  const trailingNode = typeof trailingActions === 'function'
    ? trailingActions({
      data: sortedData,
      state,
      handlers,
      extraState,
      filterOptions,
      onUpdate,
      onRelatedUpdate
    })
    : trailingActions;

  const filterNode = typeof filterContent === 'function'
    ? filterContent({
      data: sortedData,
      state,
      handlers,
      extraState,
      filterOptions
    })
    : filterContent;

  const bodyTopNode = typeof bodyTop === 'function'
    ? bodyTop({
      data: sortedData,
      state,
      handlers,
      extraState,
      filterOptions,
      onUpdate,
      onRelatedUpdate
    })
    : bodyTop;

  const bodyBottomNode = typeof bodyBottom === 'function'
    ? bodyBottom({
      data: sortedData,
      state,
      handlers,
      extraState,
      filterOptions
    })
    : bodyBottom;

  const deleteDisplayName =
    recordToDelete?.name ||
    recordToDelete?.displayName ||
    recordToDelete?.email ||
    'this record';

  return (
    <UniversalDirectory
      {...rest}
      type="people"
      title={title}
      icon={icon}
      data={sortedData}
      columns={columns}
      sortConfig={sortConfig}
      onSort={handleSort}
      nameSort={nameSort}
      onNameSortChange={setNameSort}
      filterText={filterText}
      onFilterTextChange={setFilterText}
      showFilters={showFilters}
      onToggleFilters={() => setShowFilters(!showFilters)}
      onClearFilters={handleClearFilters}
      filterOptions={filterOptions}
      leadingActions={leadingNode}
      trailingActions={trailingNode}
      filterContent={filterNode}
      bodyTop={bodyTopNode}
      bodyBottom={bodyBottomNode}
      tableProps={{
        editingId,
        editFormData,
        onRowClick: renderContactCard ? setSelectedRecord : undefined,
        renderActions,
        createRow,
        emptyMessage,
        ...tableProps
      }}
      useHtmlTable={true}
    >
      {renderContactCard && selectedRecord && renderContactCard({
        record: selectedRecord,
        onClose: () => setSelectedRecord(null),
        onUpdate,
        onRelatedUpdate
      })}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        variant="danger"
        title={`Delete ${recordType}?`}
        message={
          <div>
            Are you sure you want to delete <strong>{deleteDisplayName}</strong>?
            This action cannot be undone.
          </div>
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </UniversalDirectory>
  );
};

const PersonDirectory = (props) => {
  if (!props.config) {
    return <UniversalDirectory {...props} />;
  }

  return <ConfiguredPersonDirectory {...props} />;
};

export default PersonDirectory;
