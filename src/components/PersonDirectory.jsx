import React, { useCallback, useMemo } from 'react';
import { Edit, Save, X, Trash2, Phone, PhoneOff, Building, BuildingIcon } from 'lucide-react';
import { useDirectoryState, useDirectoryHandlers } from '../hooks';
import { DeleteConfirmDialog, UniversalDirectory } from './shared';
import {
  buildDirectoryFilterOptions,
  dedupeDirectoryRecords,
  extractBuildingName,
  formatPhoneNumber
} from '../utils/directoryUtils';

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
          ...(isChecked ? { hasNoOffice: true, office: '' } : {})
        }));
        return;
      }

      if (typeof onChange === 'function') {
        onChange(event);
      }
    };

    return (
      <div key={`${toggle.name}-${index}`} className={toggle.className || 'flex items-center gap-2 text-xs mt-1'}>
        <input
          type="checkbox"
          id={`${idPrefix}-${toggle.name}`}
          name={toggle.name}
          checked={!!formData[toggle.name]}
          onChange={handleToggle}
          className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
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
  newRecord,
  errors,
  handleChange,
  handleCreateChange,
  toggleEditPhoneState,
  toggleEditOfficeState,
  toggleCreatePhoneState,
  toggleCreateOfficeState,
  getInputClass
}) => {
  const programColumn = {
    key: 'program',
    label: 'Program',
    render: (person) => person.program?.name || '-',
    renderEdit: () => (
      <select
        name="programId"
        value={editFormData.programId || ''}
        onChange={handleChange}
        className={getInputClass('programId')}
      >
        <option value="">No Program</option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>{program.name}</option>
        ))}
      </select>
    ),
    renderCreate: () => (
      <select
        name="programId"
        value={newRecord.programId || ''}
        onChange={handleCreateChange}
        className={getInputClass('programId')}
      >
        <option value="">No Program</option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>{program.name}</option>
        ))}
      </select>
    )
  };

  const jobTitleColumn = {
    key: 'jobTitle',
    label: 'Job Title',
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

  const officeColumn = {
    key: 'office',
    label: 'Office',
    render: (person) => (
      <div className="flex items-center gap-2">
        {person.hasNoOffice ? (
          <span className="flex items-center gap-1 text-gray-500">
            <BuildingIcon size={14} className="opacity-50" />
            No office
          </span>
        ) : (
          person.office || '-'
        )}
      </div>
    ),
    renderEdit: () => (
      <div className="flex items-center gap-2">
        <input
          name="office"
          value={editFormData.office || ''}
          onChange={handleChange}
          className={getInputClass('office')}
          placeholder="Building & Room"
          disabled={editFormData.hasNoOffice}
        />
        <button
          type="button"
          onClick={toggleEditOfficeState}
          className={`p-1 rounded transition-colors ${editFormData.hasNoOffice ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}
          title={editFormData.hasNoOffice ? 'Has no office' : 'Has office'}
        >
          {editFormData.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
        </button>
      </div>
    ),
    renderCreate: () => (
      <div className="flex items-center gap-2">
        <input
          name="office"
          value={newRecord.office || ''}
          onChange={handleCreateChange}
          className={getInputClass('office')}
          placeholder="Building & Room"
          disabled={newRecord.hasNoOffice}
        />
        <button
          type="button"
          onClick={toggleCreateOfficeState}
          className={`p-1 rounded transition-colors ${newRecord.hasNoOffice ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100'}`}
        >
          {newRecord.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
        </button>
      </div>
    )
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

  return (
    <div className="flex items-center border-b border-gray-200 bg-baylor-gold/5">
      {columns.map((column) => (
        <div key={column.key} className="px-4 py-2 flex-1 min-w-0 text-sm align-top">
          {column.renderCreate ? column.renderCreate() : null}
        </div>
      ))}
      {renderCreateActions && (
        <div className="px-4 py-2 w-28 flex-none text-right align-top">
          {renderCreateActions()}
        </div>
      )}
    </div>
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
    handleCreate,
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
      return deriveData({ data, scheduleData, programs, extraState });
    }
    return Array.isArray(data) ? data : [];
  }, [data, scheduleData, programs, extraState, deriveData]);

  const uniqueDirectoryData = useMemo(() => {
    if (config.dedupe === false) return derivedData;
    return dedupeDirectoryRecords(derivedData);
  }, [config.dedupe, derivedData]);

  const filterOptions = useMemo(() => {
    if (typeof getFilterOptions === 'function') {
      return getFilterOptions(uniqueDirectoryData);
    }
    return buildDirectoryFilterOptions(uniqueDirectoryData, { includePrograms });
  }, [uniqueDirectoryData, getFilterOptions, includePrograms]);

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
        const buildingName = person.office ? extractBuildingName(person.office) : 'No Building';
        return filters.buildings.includes(buildingName);
      });
    }

    if (typeof applyFilters === 'function') {
      result = applyFilters(result, { filters, filterText, extraState, data: uniqueDirectoryData });
    }

    return result;
  }, [uniqueDirectoryData, filterText, filters, searchFields, applyFilters, extraState]);

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

  const baseColumns = useMemo(() => buildBaseColumns({
    programs,
    editFormData,
    newRecord,
    errors,
    handleChange,
    handleCreateChange,
    toggleEditPhoneState,
    toggleEditOfficeState,
    toggleCreatePhoneState,
    toggleCreateOfficeState,
    getInputClass
  }), [
    programs,
    editFormData,
    newRecord,
    errors,
    handleChange,
    handleCreateChange,
    toggleEditPhoneState,
    toggleEditOfficeState,
    toggleCreatePhoneState,
    toggleCreateOfficeState,
    getInputClass
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
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        record={recordToDelete}
        recordType={recordType}
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
