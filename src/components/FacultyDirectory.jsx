import React, { useState, useMemo } from 'react';
import { Edit, Save, X, BookUser, Mail, Phone, Building, Search, ArrowUpDown, Plus, RotateCcw, History } from 'lucide-react';
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

const FacultyDirectory = ({ directoryData, onFacultyUpdate, onStaffUpdate }) => {
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
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
    isAlsoStaff: false,
  });

  // Undo functionality
  const [changeHistory, setChangeHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

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
        const { sourceCollection } = change.originalData;
        const dataToRestore = { ...change.originalData };
        delete dataToRestore.sourceCollection;

        if (sourceCollection === 'staff') {
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
        const { sourceCollection, ...dataToSave } = editFormData;
        const cleanedData = { ...dataToSave, phone: (dataToSave.phone || '').replace(/\D/g, '') };

        // Track the change before saving
        trackChange(originalData, cleanedData, 'update');

        try {
          if (sourceCollection === 'staff') {
              await onStaffUpdate(cleanedData);
          } else {
              await onFacultyUpdate(cleanedData);
          }
          
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
  
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
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
      isAlsoStaff: false,
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
      isAlsoStaff: false,
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
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];

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
  }, [uniqueDirectoryData, filterText, sortConfig]);

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
            Data is currently being imported. Some records may be missing or incomplete, and inaccuracies may exist.
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
                         <input type="checkbox" id="new-isAlsoStaff" name="isAlsoStaff" checked={newFaculty.isAlsoStaff} onChange={handleCreateChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                         <label htmlFor="new-isAlsoStaff" className="font-normal">Also a staff member</label>
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
                    <input
                      name="phone"
                      value={newFaculty.phone}
                      onChange={handleCreateChange}
                      className={getInputClass('phone')}
                      placeholder="10 digits"
                      maxLength="10"
                    />
                    {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
                  </td>
                  <td className="p-2 align-top">
                      <input
                        name="office"
                        value={newFaculty.office}
                        onChange={handleCreateChange}
                        className={getInputClass('office')}
                        placeholder="Building & Room"
                      />
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
                             <input type="checkbox" id={`isAlsoStaff-${faculty.id || index}`} name="isAlsoStaff" checked={!!editFormData.isAlsoStaff} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                             <label htmlFor={`isAlsoStaff-${faculty.id || index}`} className="font-normal">Also a staff member</label>
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
                        <input name="phone" value={editFormData.phone || ''} onChange={handleChange} className={getInputClass('phone')} placeholder="10 digits" maxLength="10" />
                        {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
                      </td>
                      <td className="p-2 align-top">
                          <input name="office" value={editFormData.office || ''} onChange={handleChange} className={getInputClass('office')} placeholder="Building & Room" />
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
                        {faculty.sourceCollection === 'staff' && (
                          <div className="text-xs text-baylor-gold font-medium">Also Staff</div>
                        )}
                        {faculty.isAdjunct && (
                          <div className="text-xs text-blue-600 font-medium">Adjunct</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>{faculty.jobTitle || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>{faculty.email || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>{formatPhoneNumber(faculty.phone)}</td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedFacultyForCard(faculty)}>{faculty.office || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(faculty); }} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedFacultyForCard && <FacultyContactCard faculty={selectedFacultyForCard} onClose={() => setSelectedFacultyForCard(null)} />}
      </div>
    </div>
  );
};

export default FacultyDirectory;