import React, { useState, useMemo } from 'react';
import { Edit, Save, X, BookUser, Mail, Phone, PhoneOff, Building, BuildingIcon, Search, ArrowUpDown, Plus, RotateCcw, History, Trash2 } from 'lucide-react';
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

const FacultyDirectory = ({ directoryData, onFacultyUpdate, onStaffUpdate, onFacultyDelete }) => {
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [nameSort, setNameSort] = useState('firstName'); // 'firstName' or 'lastName'
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [errors, setErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [newFaculty, setNewFaculty] = useState({
    name: '',
    jobTitle: '',
    email: '',
    phone: '',
    office: '',
    isAdjunct: false,
    isTenured: false,
    isAlsoStaff: false,
    hasNoPhone: false,
    hasNoOffice: false,
  });

  // Undo functionality
  const [changeHistory, setChangeHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [facultyToDelete, setFacultyToDelete] = useState(null);

  // Remove duplicates from directoryData and ensure unique entries
  const uniqueDirectoryData = useMemo(() => {
    if (!directoryData || !Array.isArray(directoryData)) return [];
    
    const uniqueMap = new Map();
    
    directoryData.forEach(faculty => {
      // Create a unique key based on name and email
      const key = `${faculty.name?.toLowerCase()}-${(faculty.email || 'no-email').toLowerCase()}`;
      
      // Only add if not already in map, or if this one has more complete data
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, faculty);
      } else {
        const existing = uniqueMap.get(key);
        // Keep the one with more complete data (more fields filled)
        const existingFields = Object.values(existing).filter(v => v && v !== '').length;
        const newFields = Object.values(faculty).filter(v => v && v !== '').length;
        
        if (newFields > existingFields) {
          uniqueMap.set(key, faculty);
        }
      }
    });
    
    return Array.from(uniqueMap.values());
  }, [directoryData]);

  const validate = (data) => {
    const newErrors = {};
    
    // Email validation
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        newErrors.email = 'Please enter a valid email address.';
    }

    // Phone validation
    const phoneDigits = (data.phone || '').replace(/\D/g, '');
    if (data.phone && phoneDigits.length !== 10) {
        newErrors.phone = 'Phone number must contain exactly 10 digits.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const trackChange = (originalData, updatedData, action) => {
    const change = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      action,
      originalData: { ...originalData },
      updatedData: { ...updatedData },
      facultyId: originalData.id || updatedData.id,
      facultyName: originalData.name || updatedData.name
    };
    
    setChangeHistory(prev => [change, ...prev.slice(0, 19)]); // Keep last 20 changes
  };

  const undoChange = async (change) => {
    try {
      if (change.action === 'update') {
        // Restore original data
        const dataToRestore = { ...change.originalData };

        if (dataToRestore.isAlsoStaff) {
          await onStaffUpdate(dataToRestore);
        } else {
          await onFacultyUpdate(dataToRestore);
        }

        // Remove this change from history
        setChangeHistory(prev => prev.filter(c => c.id !== change.id));
        
        console.log('Change undone successfully');
      } else if (change.action === 'create') {
        // This would require a delete function - for now just log
        console.log('Cannot undo create action - delete functionality not implemented');
      }
    } catch (error) {
      console.error('Error undoing change:', error);
      alert('Error undoing change: ' + error.message);
    }
  };

  const handleEdit = (faculty) => {
    setErrors({}); // Clear previous errors
    setEditingId(faculty.id);
    setEditFormData(faculty);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditFormData({});
    setErrors({});
  };

  const handleSave = async () => {
    if (validate(editFormData)) {
        const originalData = uniqueDirectoryData.find(f => f.id === editingId);
        const dataToSave = { ...editFormData };
        const cleanedData = { ...dataToSave, phone: (dataToSave.phone || '').replace(/\D/g, '') };

        // Track the change before saving
        trackChange(originalData, cleanedData, 'update');

        try {
          // Always use onFacultyUpdate when editing from faculty directory
          // The handler will manage dual roles properly
          await onFacultyUpdate(cleanedData);
          
          setEditingId(null);
          setErrors({});
        } catch (error) {
          // Remove the change from history if save failed
          setChangeHistory(prev => prev.slice(1));
          throw error;
        }
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let finalValue = type === 'checkbox' ? checked : value;
    
    // Allow only numbers for phone input
    if (name === 'phone') {
        finalValue = finalValue.replace(/\D/g, '');
    }

    const newFormData = {
        ...editFormData,
        [name]: finalValue,
    };
    
    setEditFormData(newFormData);

    // Live validation
    if (Object.keys(errors).length > 0) {
        validate(newFormData);
    }
  };

  const toggleEditPhoneState = () => {
    const newHasNoPhone = !editFormData.hasNoPhone;
    setEditFormData({
      ...editFormData,
      hasNoPhone: newHasNoPhone,
      phone: newHasNoPhone ? '' : editFormData.phone // Clear phone if marking as no phone
    });
  };

  const toggleEditOfficeState = () => {
    const newHasNoOffice = !editFormData.hasNoOffice;
    setEditFormData({
      ...editFormData,
      hasNoOffice: newHasNoOffice,
      office: newHasNoOffice ? '' : editFormData.office // Clear office if marking as no office
    });
  };

  const toggleCreatePhoneState = () => {
    const newHasNoPhone = !newFaculty.hasNoPhone;
    setNewFaculty({
      ...newFaculty,
      hasNoPhone: newHasNoPhone,
      phone: newHasNoPhone ? '' : newFaculty.phone
    });
  };

  const toggleCreateOfficeState = () => {
    const newHasNoOffice = !newFaculty.hasNoOffice;
    setNewFaculty({
      ...newFaculty,
      hasNoOffice: newHasNoOffice,
      office: newHasNoOffice ? '' : newFaculty.office
    });
  };
  
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const handleDelete = (faculty) => {
    setFacultyToDelete(faculty);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (facultyToDelete && onFacultyDelete) {
      try {
        await onFacultyDelete(facultyToDelete);
        setShowDeleteConfirm(false);
        setFacultyToDelete(null);
      } catch (error) {
        console.error('Error deleting faculty:', error);
        alert('Error deleting faculty: ' + error.message);
      }
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setFacultyToDelete(null);
  };

  const handleCreate = () => {
    setIsCreating(true);
    setNewFaculty({
      name: '',
      jobTitle: '',
      email: '',
      phone: '',
      office: '',
      isAdjunct: false,
      isTenured: false,
      isAlsoStaff: false,
      hasNoPhone: false,
      hasNoOffice: false,
    });
    setErrors({});
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewFaculty({
      name: '',
      jobTitle: '',
      email: '',
      phone: '',
      office: '',
      isAdjunct: false,
      isTenured: false,
      isAlsoStaff: false,
      hasNoPhone: false,
      hasNoOffice: false,
    });
    setErrors({});
  };

  const handleCreateChange = (e) => {
    const { name, value, type, checked } = e.target;
    let finalValue = type === 'checkbox' ? checked : value;
    
    if (name === 'phone') {
      finalValue = finalValue.replace(/\D/g, '');
    }

    setNewFaculty(prev => ({
      ...prev,
      [name]: finalValue
    }));

    if (Object.keys(errors).length > 0) {
      validate({ ...newFaculty, [name]: finalValue });
    }
  };

  const handleCreateSave = async () => {
    if (validate(newFaculty)) {
      const dataToSave = {
        ...newFaculty,
        phone: (newFaculty.phone || '').replace(/\D/g, '')
      };
      
      // Track the creation
      trackChange({}, dataToSave, 'create');
      
      await onFacultyUpdate(dataToSave);
      setIsCreating(false);
      setErrors({});
    }
  };
  
  const sortedAndFilteredData = useMemo(() => {
    let data = [...uniqueDirectoryData];

    if (filterText) {
      const lowercasedFilter = filterText.toLowerCase();
      data = data.filter(item =>
        item.name?.toLowerCase().includes(lowercasedFilter) ||
        item.jobTitle?.toLowerCase().includes(lowercasedFilter) ||
        item.email?.toLowerCase().includes(lowercasedFilter) ||
        item.phone?.toLowerCase().includes(lowercasedFilter) ||
        item.office?.toLowerCase().includes(lowercasedFilter)
      );
    }

    data.sort((a, b) => {
      let valA, valB;
      
      if (sortConfig.key === 'name') {
        // Handle special name sorting based on user preference
        if (nameSort === 'firstName') {
          // Extract first name for sorting (part before first space)
          valA = (a.firstName || a.name?.split(' ')[0] || '').toLowerCase();
          valB = (b.firstName || b.name?.split(' ')[0] || '').toLowerCase();
        } else {
          // Extract last name for sorting (part after last space)
          const aNameParts = (a.lastName || a.name || '').split(' ');
          const bNameParts = (b.lastName || b.name || '').split(' ');
          valA = (a.lastName || aNameParts[aNameParts.length - 1] || '').toLowerCase();
          valB = (b.lastName || bNameParts[bNameParts.length - 1] || '').toLowerCase();
        }
      } else if (sortConfig.key === 'program') {
        // Handle program sorting
        valA = (a.program && a.program.name ? a.program.name : '').toLowerCase();
        valB = (b.program && b.program.name ? b.program.name : '').toLowerCase();
      } else {
        valA = a[sortConfig.key];
        valB = b[sortConfig.key];
      }

      if (typeof valA === 'boolean') {
          return (valA === valB) ? 0 : valA ? -1 : 1;
      }

      if (valA < valB) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (valA > valB) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });

    return data;
  }, [uniqueDirectoryData, filterText, sortConfig, nameSort]);

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

  const getInputClass = (fieldName) => {
      const baseClass = "w-full p-1 border rounded bg-baylor-gold/10";
      return errors[fieldName] ? `${baseClass} border-red-500` : `${baseClass} border-baylor-gold`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
            <h2 className="text-xl font-serif font-semibold text-baylor-green flex items-center">
              <BookUser className="mr-2 text-baylor-gold" size={20} />
              Faculty Directory ({sortedAndFilteredData.length} members)
            </h2>
            <div className="flex items-center gap-4">
                {/* Name Sort Options */}
                {sortConfig.key === 'name' && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Sort by:</span>
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                      <button
                        onClick={() => setNameSort('firstName')}
                        className={`px-3 py-1 text-xs ${
                          nameSort === 'firstName' 
                            ? 'bg-baylor-green text-white' 
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        First Name
                      </button>
                      <button
                        onClick={() => setNameSort('lastName')}
                        className={`px-3 py-1 text-xs ${
                          nameSort === 'lastName' 
                            ? 'bg-baylor-green text-white' 
                            : 'bg-white text-gray-700 hover:bg-gray-50'
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
                {changeHistory.length > 0 && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-2 px-3 py-2 bg-baylor-gold text-baylor-green rounded-lg hover:bg-baylor-gold/90 transition-colors"
                  >
                    <History size={16} />
                    Changes ({changeHistory.length})
                  </button>
                )}
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
                >
                  <Plus size={18} />
                  Add Faculty
                </button>
            </div>
        </div>

        {/* Data Import Caution */}
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <p className="flex items-center">
            <span className="mr-2">⚠️</span>
            Data is currently being imported. Some records may be missing or incomplete, and inaccuracies, duplications, and other issues may exist.
          </p>
        </div>

        {/* Change History */}
        {showHistory && changeHistory.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Recent Changes</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {changeHistory.map((change) => (
                <div key={change.id} className="flex items-center justify-between p-3 bg-white rounded border">
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {change.action === 'create' ? 'Created' : 'Updated'} {change.facultyName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(change.timestamp).toLocaleString()}
                    </div>
                  </div>
                  {change.action === 'update' && (
                    <button
                      onClick={() => undoChange(change)}
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
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-baylor-green/5">
                  <SortableHeader label="Name" columnKey="name" />
                  <SortableHeader label="Program" columnKey="program" />
                  <SortableHeader label="Job Title" columnKey="jobTitle" />
                  <SortableHeader label="Email" columnKey="email" />
                  <SortableHeader label="Phone" columnKey="phone" />
                  <SortableHeader label="Office" columnKey="office" />
                  <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isCreating && (
                <tr className="bg-baylor-gold/5">
                  <td className="p-2 align-top text-gray-700 font-medium">
                      <input
                        name="name"
                        value={newFaculty.name}
                        onChange={handleCreateChange}
                        className={getInputClass('name')}
                        placeholder="Full Name"
                      />
                      <div className="flex items-center gap-2 text-xs mt-2">
                         <input
                           type="checkbox"
                           id="new-adjunct"
                           name="isAdjunct"
                           checked={newFaculty.isAdjunct}
                           onChange={handleCreateChange}
                           className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                         />
                         <label htmlFor="new-adjunct" className="font-normal">Adjunct</label>
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-1">
                         <input
                           type="checkbox"
                           id="new-isTenured"
                           name="isTenured"
                           checked={newFaculty.isTenured}
                           onChange={handleCreateChange}
                           className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-600"
                         />
                         <label htmlFor="new-isTenured" className="font-normal">Tenured</label>
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-1">
                         <input type="checkbox" id="new-isAlsoStaff" name="isAlsoStaff" checked={newFaculty.isAlsoStaff} onChange={handleCreateChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                         <label htmlFor="new-isAlsoStaff" className="font-normal">Also a staff member</label>
                      </div>
                  </td>
                  <td className="p-2 align-top">
                      <div className="text-sm text-gray-500 italic">
                        Program will be determined from courses taught
                      </div>
                  </td>
                  <td className="p-2 align-top">
                      <input
                        name="jobTitle"
                        value={newFaculty.jobTitle}
                        onChange={handleCreateChange}
                        className={getInputClass('jobTitle')}
                        placeholder="Job Title"
                      />
                  </td>
                  <td className="p-2 align-top">
                    <input
                      name="email"
                      value={newFaculty.email}
                      onChange={handleCreateChange}
                      className={getInputClass('email')}
                      placeholder="email@baylor.edu"
                    />
                    {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex items-center gap-2">
                      <input
                        name="phone"
                        value={newFaculty.phone}
                        onChange={handleCreateChange}
                        className={getInputClass('phone')}
                        placeholder="10 digits"
                        maxLength="10"
                        disabled={newFaculty.hasNoPhone}
                      />
                      <button
                        type="button"
                        onClick={toggleCreatePhoneState}
                        className={`p-1 rounded transition-colors ${
                          newFaculty.hasNoPhone 
                            ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={newFaculty.hasNoPhone ? 'Has no phone number' : 'Has phone number'}
                      >
                        {newFaculty.hasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
                      </button>
                    </div>
                    {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex items-center gap-2">
                      <input
                        name="office"
                        value={newFaculty.office}
                        onChange={handleCreateChange}
                        className={getInputClass('office')}
                        placeholder="Building & Room"
                        disabled={newFaculty.hasNoOffice}
                      />
                      <button
                        type="button"
                        onClick={toggleCreateOfficeState}
                        className={`p-1 rounded transition-colors ${
                          newFaculty.hasNoOffice 
                            ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={newFaculty.hasNoOffice ? 'Has no office' : 'Has office'}
                      >
                        {newFaculty.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
                      </button>
                    </div>
                  </td>
                  <td className="p-2 align-top text-right">
                    <div className="flex gap-2">
                      <button onClick={handleCreateSave} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><Save size={16} /></button>
                      <button onClick={handleCancelCreate} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
                    </div>
                  </td>
                </tr>
              )}
              {sortedAndFilteredData.map((faculty, index) => (
                <tr key={`faculty-${faculty.id || index}-${faculty.name}`} className="hover:bg-gray-50" >
                  {editingId === faculty.id ? (
                    <>
                      <td className="p-2 align-top text-gray-700 font-medium">
                          <div className='mb-2'>{faculty.name}</div>
                          <div className="flex items-center gap-2 text-xs">
                             <input type="checkbox" id={`adjunct-${faculty.id || index}`} name="isAdjunct" checked={!!editFormData.isAdjunct} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                             <label htmlFor={`adjunct-${faculty.id || index}`} className="font-normal">Adjunct</label>
                          </div>
                          <div className="flex items-center gap-2 text-xs mt-1">
                             <input
                               type="checkbox"
                               id={`isTenured-${faculty.id || index}`}
                               name="isTenured"
                               checked={!!editFormData.isTenured}
                               onChange={handleChange}
                               className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-600"
                             />
                             <label htmlFor={`isTenured-${faculty.id || index}`} className="font-normal">Tenured</label>
                          </div>
                          <div className="flex items-center gap-2 text-xs mt-1">
                             <input type="checkbox" id={`isAlsoStaff-${faculty.id || index}`} name="isAlsoStaff" checked={!!editFormData.isAlsoStaff} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                             <label htmlFor={`isAlsoStaff-${faculty.id || index}`} className="font-normal">Also a staff member</label>
                          </div>
                      </td>
                      <td className="p-2 align-top">
                          <div className="text-sm text-gray-600">
                            {faculty.program ? faculty.program.name : 'No Program'}
                          </div>
                      </td>
                      <td className="p-2 align-top">
                          <input name="jobTitle" value={editFormData.jobTitle || ''} onChange={handleChange} className={getInputClass('jobTitle')} placeholder="Job Title" />
                      </td>
                      <td className="p-2 align-top">
                        <input name="email" value={editFormData.email || ''} onChange={handleChange} className={getInputClass('email')} placeholder="email@baylor.edu" />
                        {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
                      </td>
                      <td className="p-2 align-top">
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
                            className={`p-1 rounded transition-colors ${
                              editFormData.hasNoPhone 
                                ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                                : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            title={editFormData.hasNoPhone ? 'Has no phone number' : 'Has phone number'}
                          >
                            {editFormData.hasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
                          </button>
                        </div>
                        {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
                      </td>
                      <td className="p-2 align-top">
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
                            className={`p-1 rounded transition-colors ${
                              editFormData.hasNoOffice 
                                ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                                : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            title={editFormData.hasNoOffice ? 'Has no office' : 'Has office'}
                          >
                            {editFormData.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
                          </button>
                        </div>
                      </td>
                      <td className="p-2 align-top text-right">
                        <div className="flex gap-2">
                          <button onClick={handleSave} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><Save size={16} /></button>
                          <button onClick={handleCancel} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-gray-700 font-medium cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>
                        <div>{faculty.name}</div>
                        {faculty.program && (
                          <div className="text-xs text-baylor-green font-medium">{faculty.program.name}</div>
                        )}
                        {faculty.isAlsoStaff && (
                          <div className="text-xs text-baylor-gold font-medium">Also Staff</div>
                        )}
                        {faculty.isAdjunct && (
                          <div className="text-xs text-blue-600 font-medium">Adjunct</div>
                        )}
                        {faculty.isTenured && (
                          <div className="text-xs text-purple-600 font-medium">Tenured</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>
                        {faculty.program ? faculty.program.name : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>{faculty.jobTitle || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>{faculty.email || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>
                        <div className="flex items-center gap-2">
                          {faculty.hasNoPhone ? (
                            <span className="flex items-center gap-1 text-gray-500">
                              <PhoneOff size={14} />
                              No phone
                            </span>
                          ) : (
                            formatPhoneNumber(faculty.phone)
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>
                        <div className="flex items-center gap-2">
                          {faculty.hasNoOffice ? (
                            <span className="flex items-center gap-1 text-gray-500">
                              <BuildingIcon size={14} className="opacity-50" />
                              No office
                            </span>
                          ) : (
                            faculty.office || '-'
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(faculty); }} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(faculty); }} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedFacultyForCard && <FacultyContactCard faculty={selectedFacultyForCard} onClose={() => setSelectedFacultyForCard(null)} />}
        
        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete <strong>{facultyToDelete?.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelDelete}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacultyDirectory;