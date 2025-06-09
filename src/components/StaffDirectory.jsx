import React, { useState, useMemo } from 'react';
import { Edit, Save, X, Users, Mail, Phone, Building, Search, ArrowUpDown, Plus } from 'lucide-react';
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

const StaffDirectory = ({ directoryData, onFacultyUpdate, onStaffUpdate }) => {
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [selectedStaffForCard, setSelectedStaffForCard] = useState(null);
  const [errors, setErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    jobTitle: '',
    email: '',
    phone: '',
    office: '',
    isFullTime: true,
    isAlsoFaculty: false,
  });

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

  const handleCreate = () => {
    setIsCreating(true);
    setNewStaff({
      name: '',
      jobTitle: '',
      email: '',
      phone: '',
      office: '',
      isFullTime: true,
      isAlsoFaculty: false,
    });
    setErrors({});
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewStaff({
      name: '',
      jobTitle: '',
      email: '',
      phone: '',
      office: '',
      isFullTime: true,
      isAlsoFaculty: false,
    });
    setErrors({});
  };

  const handleCreateChange = (e) => {
    const { name, value, type, checked } = e.target;
    const finalValue = type === 'checkbox' ? checked : value;
    const updatedForm = { ...newStaff, [name]: finalValue };
    setNewStaff(updatedForm);
    if (Object.keys(errors).length > 0) validate(updatedForm);
  };

  const handleCreateSave = () => {
    if (validate(newStaff)) {
      const dataToSave = {
        ...newStaff,
        phone: (newStaff.phone || '').replace(/\D/g, '')
      };
      onStaffUpdate(dataToSave);
      setIsCreating(false);
      setErrors({});
    }
  };

  const handleEdit = (staff) => {
    setErrors({}); // Clear previous errors
    setEditingId(staff.id);
    setEditFormData(staff);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditFormData({});
    setErrors({});
  };

  const handleSave = () => {
    if (validate(editFormData)) {
        const { sourceCollection, ...dataToSave } = editFormData;
        const cleanedData = { ...dataToSave, phone: (dataToSave.phone || '').replace(/\D/g, '') };

        if (sourceCollection === 'faculty') {
            onFacultyUpdate(cleanedData);
        } else {
            onStaffUpdate(cleanedData);
        }
        setEditingId(null);
        setErrors({});
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
  
  const sortedAndFilteredData = useMemo(() => {
    let data = [...directoryData];

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
  }, [directoryData, filterText, sortConfig]);

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
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
          <h2 className="text-xl font-serif font-semibold text-baylor-green flex items-center">
            <Users className="mr-2 text-baylor-gold" size={20} />
            Staff Directory
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
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
              >
                <Plus size={18} />
                Add Staff
              </button>
          </div>
      </div>
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
                      value={newStaff.name}
                      onChange={handleCreateChange}
                      className={getInputClass('name')}
                      placeholder="Full Name"
                    />
                    {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name}</p>}
                    <div className="flex items-center gap-2 text-xs mt-2">
                       <input
                         type="checkbox"
                         id="new-fulltime"
                         name="isFullTime"
                         checked={newStaff.isFullTime}
                         onChange={handleCreateChange}
                         className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                       />
                       <label htmlFor="new-fulltime" className="font-normal">Full Time</label>
                    </div>
                    <div className="flex items-center gap-2 text-xs mt-1">
                       <input
                         type="checkbox"
                         id="new-isAlsoFaculty"
                         name="isAlsoFaculty"
                         checked={newStaff.isAlsoFaculty}
                         onChange={handleCreateChange}
                         className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                       />
                       <label htmlFor="new-isAlsoFaculty" className="font-normal">Also a faculty member</label>
                    </div>
                </td>
                <td className="p-2 align-top">
                    <input
                      name="jobTitle"
                      value={newStaff.jobTitle}
                      onChange={handleCreateChange}
                      className={getInputClass('jobTitle')}
                      placeholder="Job Title"
                    />
                </td>
                <td className="p-2 align-top">
                  <input
                    name="email"
                    value={newStaff.email}
                    onChange={handleCreateChange}
                    className={getInputClass('email')}
                    placeholder="email@baylor.edu"
                  />
                  {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
                </td>
                <td className="p-2 align-top">
                  <input
                    name="phone"
                    value={newStaff.phone}
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
                      value={newStaff.office}
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
            {sortedAndFilteredData.map(staff => (
              <tr key={`${staff.sourceCollection}-${staff.id}`} className="hover:bg-gray-50" >
                {editingId === staff.id ? (
                  <>
                    <td className="p-2 align-top text-gray-700 font-medium">
                        <div className='mb-2'>{staff.name}</div>
                        <div className="flex items-center gap-2 text-xs">
                           <input type="checkbox" id={`fulltime-${staff.id}`} name="isFullTime" checked={!!editFormData.isFullTime} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                           <label htmlFor={`fulltime-${staff.id}`} className="font-normal">Full Time</label>
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-1">
                           <input type="checkbox" id={`isAlsoFaculty-${staff.id}`} name="isAlsoFaculty" checked={!!editFormData.isAlsoFaculty} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                           <label htmlFor={`isAlsoFaculty-${staff.id}`} className="font-normal">Also a faculty member</label>
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
                    <td className="px-4 py-3 text-gray-700 font-medium cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>{staff.name}</td>
                    <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>{staff.jobTitle || '-'}</td>
                    <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>{staff.email || '-'}</td>
                    <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>{formatPhoneNumber(staff.phone)}</td>
                    <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>{staff.office || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(staff); }} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedStaffForCard && <FacultyContactCard faculty={selectedStaffForCard} onClose={() => setSelectedStaffForCard(null)} />}
    </div>
  );
};

export default StaffDirectory; 