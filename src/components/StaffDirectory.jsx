import React, { useState, useMemo } from 'react';
import { Edit, Save, X, Users, Mail, Phone, PhoneOff, Building, BuildingIcon, Search, ArrowUpDown, Plus, RotateCcw, History, Trash2, Filter, UserCog } from 'lucide-react';
import FacultyContactCard from './FacultyContactCard';
import MultiSelectDropdown from './MultiSelectDropdown';
import { adaptPeopleToStaff } from '../utils/dataAdapter';

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

const StaffDirectory = ({ directoryData, onFacultyUpdate, onStaffUpdate, onStaffDelete, programs = [], rawScheduleData }) => {
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [nameSort, setNameSort] = useState('firstName'); // 'firstName' or 'lastName'
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
    hasNoPhone: false,
    hasNoOffice: false,
  });

  // Undo functionality
  const [changeHistory, setChangeHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState(null);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    jobTitles: { include: [], exclude: [] },
    buildings: { include: [], exclude: [] },
    isFullTime: 'all', // 'all', 'full-time', 'part-time'
    isAlsoFaculty: 'all', // 'all', 'include', 'exclude'
    hasEmail: true
  });

  // Replace direct directoryData usage with adapted data
  const adaptedStaffData = useMemo(() => {
    if (!directoryData || !Array.isArray(directoryData)) return [];
    return adaptPeopleToStaff(directoryData, [], programs);
  }, [directoryData, programs]);

  // Remove duplicates from adaptedStaffData and ensure unique entries
  const uniqueDirectoryData = useMemo(() => {
    if (!adaptedStaffData || !Array.isArray(adaptedStaffData)) return [];
    
    const uniqueMap = new Map();
    
    adaptedStaffData.forEach(staff => {
      // Create a unique key based on name and email
      const key = `${staff.name?.toLowerCase()}-${(staff.email || 'no-email').toLowerCase()}`;
      
      // Only add if not already in map, or if this one has more complete data
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, staff);
      } else {
        const existing = uniqueMap.get(key);
        // Keep the one with more complete data (more fields filled)
        const existingFields = Object.values(existing).filter(v => v && v !== '').length;
        const newFields = Object.values(staff).filter(v => v && v !== '').length;
        
        if (newFields > existingFields) {
          uniqueMap.set(key, staff);
        }
      }
    });
    
    return Array.from(uniqueMap.values());
  }, [adaptedStaffData]);

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

    // Baylor ID validation
    if (data.baylorId && !/^\d{9}$/.test(data.baylorId)) {
        newErrors.baylorId = 'Baylor ID must be exactly 9 digits.';
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
      staffId: originalData.id || updatedData.id,
      staffName: originalData.name || updatedData.name
    };
    
    setChangeHistory(prev => [change, ...prev.slice(0, 19)]); // Keep last 20 changes
  };

  const undoChange = async (change) => {
    try {
      if (change.action === 'update') {
        // Restore original data
        const dataToRestore = { ...change.originalData };

        if (dataToRestore.isAlsoFaculty) {
          await onFacultyUpdate(dataToRestore);
        } else {
          await onStaffUpdate(dataToRestore);
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
      setInlineError({ context: 'undo', message: 'Error undoing change: ' + error.message });
    }
  };

  const handleDelete = (staff) => {
    setStaffToDelete(staff);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (staffToDelete && onStaffDelete) {
      try {
        await onStaffDelete(staffToDelete);
        setShowDeleteConfirm(false);
        setStaffToDelete(null);
      } catch (error) {
        console.error('Error deleting staff:', error);
        setInlineError({ context: 'delete', message: 'Error deleting staff: ' + error.message });
      }
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setStaffToDelete(null);
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
      hasNoPhone: false,
      hasNoOffice: false,
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
      hasNoPhone: false,
      hasNoOffice: false,
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

  const handleCreateSave = async () => {
    if (validate(newStaff)) {
      const dataToSave = {
        ...newStaff,
        phone: (newStaff.phone || '').replace(/\D/g, ''),
        roles: {
          staff: true,
          faculty: newStaff.isAlsoFaculty || false
        }
      };
      
      // Track the creation
      trackChange({}, dataToSave, 'create');
      
      await onStaffUpdate(dataToSave);
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

  const handleSave = async () => {
    if (validate(editFormData)) {
        const originalData = uniqueDirectoryData.find(s => s.id === editingId);
        const dataToSave = { ...editFormData };
        const originalRoles = originalData?.roles;
        let updatedRoles;
        if (Array.isArray(originalRoles)) {
          updatedRoles = originalRoles.filter(r => r !== 'faculty' && r !== 'staff');
          // Staff directory always implies staff role
          updatedRoles.push('staff');
          if (dataToSave.isAlsoFaculty) updatedRoles.push('faculty');
        } else {
          updatedRoles = {
            ...(typeof originalRoles === 'object' && originalRoles !== null ? originalRoles : {}),
            staff: true,
            faculty: dataToSave.isAlsoFaculty || false
          };
        }
        dataToSave.roles = updatedRoles;
        const cleanedData = { ...dataToSave, phone: (dataToSave.phone || '').replace(/\D/g, '') };

        // Track the change before saving
        trackChange(originalData, cleanedData, 'update');

        try {
          // Always use onStaffUpdate when editing from staff directory  
          // The handler will manage dual roles properly
          await onStaffUpdate(cleanedData);
          
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

    if (name === 'baylorId') {
        finalValue = finalValue.replace(/\D/g, '').slice(0, 9);
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
      phone: newHasNoPhone ? '' : editFormData.phone
    });
  };

  const toggleEditOfficeState = () => {
    const newHasNoOffice = !editFormData.hasNoOffice;
    setEditFormData({
      ...editFormData,
      hasNoOffice: newHasNoOffice,
      office: newHasNoOffice ? '' : editFormData.office
    });
  };

  const toggleCreatePhoneState = () => {
    const newHasNoPhone = !newStaff.hasNoPhone;
    setNewStaff({
      ...newStaff,
      hasNoPhone: newHasNoPhone,
      phone: newHasNoPhone ? '' : newStaff.phone
    });
  };

  const toggleCreateOfficeState = () => {
    const newHasNoOffice = !newStaff.hasNoOffice;
    setNewStaff({
      ...newStaff,
      hasNoOffice: newHasNoOffice,
      office: newHasNoOffice ? '' : newStaff.office
    });
  };
  
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  // Helper function to extract building name from office location
  const extractBuildingName = (officeLocation) => {
    if (!officeLocation || officeLocation.trim() === '') {
      return 'No Building';
    }

    const office = officeLocation.trim();
    
    // Handle common building name patterns
    const buildingKeywords = ['BUILDING', 'HALL', 'GYMNASIUM', 'TOWER', 'CENTER', 'COMPLEX'];
    
    // Check if office contains building keywords
    for (const keyword of buildingKeywords) {
      const keywordIndex = office.toUpperCase().indexOf(keyword);
      if (keywordIndex !== -1) {
        // Include everything up to and including the keyword
        const endIndex = keywordIndex + keyword.length;
        return office.substring(0, endIndex).trim();
      }
    }
    
    // If no building keywords found, try to extract building name before room numbers
    // Look for patterns where building name ends before standalone numbers
    const match = office.match(/^([A-Za-z\s]+?)(\s+\d+.*)?$/);
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // Handle special cases like "801 WASHINGTON TOWER" where number is part of building name
    // If it starts with a number followed by words, keep it all as building name
    const startsWithNumber = office.match(/^\d+\s+[A-Za-z]/);
    if (startsWithNumber) {
      // Look for room-like patterns at the end
      const roomPattern = office.match(/^(.+?)(\s+\d{2,4}(\s+\d+)*)$/);
      if (roomPattern) {
        return roomPattern[1].trim();
      }
      return office; // Keep whole thing if no clear room pattern
    }
    
    return office; // Fallback: return the whole office location
  };

  // Extract unique values for filter options
  const filterOptions = useMemo(() => {
    const jobTitles = new Set();
    const buildings = new Set();

    uniqueDirectoryData.forEach(person => {
      if (person.jobTitle) {
        jobTitles.add(person.jobTitle);
      }

      // Extract building name from office location
      if (person.office) {
        const buildingName = extractBuildingName(person.office);
        buildings.add(buildingName);
      } else {
        buildings.add('No Building');
      }
    });

    return {
      jobTitles: Array.from(jobTitles).sort(),
      buildings: Array.from(buildings).sort()
    };
  }, [uniqueDirectoryData]);

  const sortedAndFilteredData = useMemo(() => {
    let data = [...uniqueDirectoryData];

    // Search term filter
    if (filterText) {
      const term = filterText.toLowerCase();
      data = data.filter(person => 
        person.name?.toLowerCase().includes(term) ||
        person.email?.toLowerCase().includes(term) ||
        person.jobTitle?.toLowerCase().includes(term) ||
        person.office?.toLowerCase().includes(term)
      );
    }

    // Job title filter (include/exclude)
    if (filters.jobTitles.include.length > 0 || filters.jobTitles.exclude.length > 0) {
      data = data.filter(person => {
        const jobTitle = person.jobTitle || '';
        
        const includeMatch = filters.jobTitles.include.length === 0 || filters.jobTitles.include.includes(jobTitle);
        const excludeMatch = filters.jobTitles.exclude.length === 0 || !filters.jobTitles.exclude.includes(jobTitle);
        
        return includeMatch && excludeMatch;
      });
    }

    // Building filter (include/exclude)
    if (filters.buildings.include.length > 0 || filters.buildings.exclude.length > 0) {
      data = data.filter(person => {
        const buildingName = person.office ? extractBuildingName(person.office) : 'No Building';
        
        const includeMatch = filters.buildings.include.length === 0 || filters.buildings.include.includes(buildingName);
        const excludeMatch = filters.buildings.exclude.length === 0 || !filters.buildings.exclude.includes(buildingName);
        
        return includeMatch && excludeMatch;
      });
    }

    // Full-time filter
    if (filters.isFullTime !== 'all') {
      data = data.filter(person => {
        if (filters.isFullTime === 'full-time') {
          return person.isFullTime;
        } else if (filters.isFullTime === 'part-time') {
          return !person.isFullTime;
        }
        return true;
      });
    }

    // Also Faculty filter
    if (filters.isAlsoFaculty !== 'all') {
      data = data.filter(person => {
        if (filters.isAlsoFaculty === 'include') {
          return person.isAlsoFaculty;
        } else if (filters.isAlsoFaculty === 'exclude') {
          return !person.isAlsoFaculty;
        }
        return true;
      });
    }

    // Has email filter
    if (filters.hasEmail) {
      data = data.filter(person => person.email && person.email.trim() !== '');
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

      if (valA < valB) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (valA > valB) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });

    return data;
  }, [uniqueDirectoryData, filterText, filters, sortConfig, nameSort]);

  const clearFilters = () => {
    setFilters({
      jobTitles: { include: [], exclude: [] },
      buildings: { include: [], exclude: [] },
      isFullTime: 'all',
      isAlsoFaculty: 'all',
      hasEmail: true
    });
    setFilterText('');
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

  const getInputClass = (fieldName) => {
      const baseClass = "w-full p-1 border rounded bg-baylor-gold/10";
      return errors[fieldName] ? `${baseClass} border-red-500` : `${baseClass} border-baylor-gold`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
            <h2 className="text-xl font-serif font-semibold text-baylor-green flex items-center">
              <Users className="mr-2 text-baylor-gold" size={20} />
              Staff Directory ({sortedAndFilteredData.length} members)
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
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    showFilters 
                      ? 'bg-baylor-green text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
                >
                  <Plus size={18} />
                  Add Staff
                </button>
            </div>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Advanced Filters</h3>
              <button
                onClick={clearFilters}
                className="text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
              >
                Clear All Filters
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Job Titles Filter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Include Job Titles
                  </label>
                  <MultiSelectDropdown
                    options={filterOptions.jobTitles}
                    selected={filters.jobTitles.include}
                    onChange={(selected) => setFilters(prev => ({ 
                      ...prev, 
                      jobTitles: { ...prev.jobTitles, include: selected }
                    }))}
                    placeholder="Select job titles to include..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exclude Job Titles
                  </label>
                  <MultiSelectDropdown
                    options={filterOptions.jobTitles}
                    selected={filters.jobTitles.exclude}
                    onChange={(selected) => setFilters(prev => ({ 
                      ...prev, 
                      jobTitles: { ...prev.jobTitles, exclude: selected }
                    }))}
                    placeholder="Select job titles to exclude..."
                  />
                </div>
              </div>

              {/* Buildings Filter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Include Buildings
                  </label>
                  <MultiSelectDropdown
                    options={filterOptions.buildings}
                    selected={filters.buildings.include}
                    onChange={(selected) => setFilters(prev => ({ 
                      ...prev, 
                      buildings: { ...prev.buildings, include: selected }
                    }))}
                    placeholder="Select buildings to include..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exclude Buildings
                  </label>
                  <MultiSelectDropdown
                    options={filterOptions.buildings}
                    selected={filters.buildings.exclude}
                    onChange={(selected) => setFilters(prev => ({ 
                      ...prev, 
                      buildings: { ...prev.buildings, exclude: selected }
                    }))}
                    placeholder="Select buildings to exclude..."
                  />
                </div>
              </div>

              {/* Status Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employment Status
                  </label>
                  <select
                    value={filters.isFullTime}
                    onChange={(e) => setFilters(prev => ({ ...prev, isFullTime: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All</option>
                    <option value="full-time">Full-time Only</option>
                    <option value="part-time">Part-time Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Faculty Status
                  </label>
                  <select
                    value={filters.isAlsoFaculty}
                    onChange={(e) => setFilters(prev => ({ ...prev, isAlsoFaculty: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All</option>
                    <option value="include">Also Faculty</option>
                    <option value="exclude">Staff Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Requirement
                  </label>
                  <select
                    value={filters.hasEmail ? 'yes' : 'no'}
                    onChange={(e) => setFilters(prev => ({ ...prev, hasEmail: e.target.value === 'yes' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="yes">Has Email</option>
                    <option value="no">Include No Email</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Change History */}
        {showHistory && changeHistory.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Recent Changes</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {changeHistory.map((change) => (
                <div key={change.id} className="flex items-center justify-between p-3 bg-white rounded border">
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {change.action === 'create' ? 'Created' : 'Updated'} {change.staffName}
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
                  <SortableHeader label="Baylor ID" columnKey="baylorId" />
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
                    <div className="flex items-center gap-2">
                      <input
                        name="phone"
                        value={newStaff.phone}
                        onChange={handleCreateChange}
                        className={getInputClass('phone')}
                        placeholder="10 digits"
                        maxLength="10"
                        disabled={newStaff.hasNoPhone}
                      />
                      <button
                        type="button"
                        onClick={toggleCreatePhoneState}
                        className={`p-1 rounded transition-colors ${
                          newStaff.hasNoPhone 
                            ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={newStaff.hasNoPhone ? 'Has no phone number' : 'Has phone number'}
                      >
                        {newStaff.hasNoPhone ? <PhoneOff size={16} /> : <Phone size={16} />}
                      </button>
                    </div>
                    {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex items-center gap-2">
                      <input
                        name="office"
                        value={newStaff.office}
                        onChange={handleCreateChange}
                        className={getInputClass('office')}
                        placeholder="Building & Room"
                        disabled={newStaff.hasNoOffice}
                      />
                      <button
                        type="button"
                        onClick={toggleCreateOfficeState}
                        className={`p-1 rounded transition-colors ${
                          newStaff.hasNoOffice 
                            ? 'text-red-600 bg-red-100 hover:bg-red-200' 
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={newStaff.hasNoOffice ? 'Has no office' : 'Has office'}
                      >
                        {newStaff.hasNoOffice ? <BuildingIcon size={16} className="opacity-50" /> : <Building size={16} />}
                      </button>
                    </div>
                  </td>
                  <td className="p-2 align-top text-right">
                    <div className="flex gap-2">
                      <button onClick={handleCreateSave} className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"><Save size={16} /></button>
                      <button onClick={handleCancelCreate} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
                    </div>
                  </td>
                </tr>
              )}
              {sortedAndFilteredData.map((staff, index) => (
                <tr key={`staff-${staff.id || index}-${staff.name}`} className="hover:bg-gray-50" >
                  {editingId === staff.id ? (
                    <>
                      <td className="p-2 align-top text-gray-700 font-medium">
                          <div className='mb-2'>{staff.name}</div>
                          <div className="flex items-center gap-2 text-xs">
                             <input type="checkbox" id={`fulltime-${staff.id || index}`} name="isFullTime" checked={!!editFormData.isFullTime} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                             <label htmlFor={`fulltime-${staff.id || index}`} className="font-normal">Full Time</label>
                          </div>
                          <div className="flex items-center gap-2 text-xs mt-1">
                             <input type="checkbox" id={`isAlsoFaculty-${staff.id || index}`} name="isAlsoFaculty" checked={!!editFormData.isAlsoFaculty} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                             <label htmlFor={`isAlsoFaculty-${staff.id || index}`} className="font-normal">Also a faculty member</label>
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
                       <td className="p-2 align-top">
                         <input 
                           name="baylorId" 
                           value={editFormData.baylorId || ''} 
                           onChange={handleChange} 
                           className={getInputClass('baylorId')} 
                           placeholder="9 digits" 
                           maxLength="9"
                         />
                         {errors.baylorId && <p className="text-red-600 text-xs mt-1">{errors.baylorId}</p>}
                       </td>
                      <td className="p-2 align-top text-right">
                        <div className="flex gap-2">
                                                <button onClick={handleSave} className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"><Save size={16} /></button>
                      <button onClick={handleCancel} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-gray-700 font-medium cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>
                        <div>{staff.name}</div>
                        {staff.isAlsoFaculty && (
                          <div className="text-xs text-baylor-gold font-medium">Also Faculty</div>
                        )}
                        {staff.isFullTime === false && (
                          <div className="text-xs text-baylor-green font-medium">Part Time</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>{staff.jobTitle || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>{staff.email || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>
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
                      </td>
                       <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>
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
                      </td>
                       <td className="px-4 py-3 text-gray-700 cursor-pointer" onClick={() => setSelectedStaffForCard(staff)}>
                         <div className={`font-mono ${staff.baylorId ? 'text-gray-900' : 'text-red-500 italic'}`}>
                           {staff.baylorId || 'Not assigned'}
                         </div>
                       </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                                                  <button onClick={(e) => { e.stopPropagation(); handleEdit(staff); }} className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"><Edit size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(staff); }} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedStaffForCard && <FacultyContactCard faculty={selectedStaffForCard} onClose={() => setSelectedStaffForCard(null)} />}
        
        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete <strong>{staffToDelete?.name}</strong>? This action cannot be undone.
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

export default StaffDirectory;