import React, { useState, useMemo } from 'react';
import { Search, Download, Mail, Filter, X, Check, ChevronDown, Users, Copy, Plus, Minus, Settings, UserCog } from 'lucide-react';
import MultiSelectDropdown from './MultiSelectDropdown';

const EmailLists = ({ facultyData, staffData }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [filters, setFilters] = useState({
    // Multi-select filters with include/exclude
    programs: { include: [], exclude: [] },
    jobTitles: { include: [], exclude: [] },
    buildings: { include: [], exclude: [] },
    // Role filters - simplified to radio buttons
    roleFilter: 'all', // 'all', 'faculty', 'staff', 'both'
    // Boolean filters with include/exclude options
    adjunct: 'all', // 'all', 'include', 'exclude'
    tenured: 'all', // 'all', 'include', 'exclude'
    upd: 'all', // 'all', 'include', 'exclude' - NEW UPD filter
    // Email filter
    hasEmail: true
  });
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterPreset, setActiveFilterPreset] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

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

  // Filter presets for common use cases
  const filterPresets = {
    'all-faculty': {
      name: 'All Faculty',
      filters: {
        programs: { include: [], exclude: [] },
        jobTitles: { include: [], exclude: [] },
        buildings: { include: [], exclude: [] },
        roleFilter: 'faculty',
        adjunct: 'all',
        tenured: 'all',
        upd: 'all',
        hasEmail: true
      }
    },
    'tenured-faculty': {
      name: 'Tenured Faculty',
      filters: {
        programs: { include: [], exclude: [] },
        jobTitles: { include: [], exclude: [] },
        buildings: { include: [], exclude: [] },
        roleFilter: 'faculty',
        adjunct: 'all',
        tenured: 'include',
        upd: 'all',
        hasEmail: true
      }
    },
    'adjunct-faculty': {
      name: 'Adjunct Faculty',
      filters: {
        programs: { include: [], exclude: [] },
        jobTitles: { include: [], exclude: [] },
        buildings: { include: [], exclude: [] },
        roleFilter: 'faculty',
        adjunct: 'include',
        tenured: 'all',
        upd: 'all',
        hasEmail: true
      }
    },
    'upd-faculty': {
      name: 'UPD Faculty',
      filters: {
        programs: { include: [], exclude: [] },
        jobTitles: { include: [], exclude: [] },
        buildings: { include: [], exclude: [] },
        roleFilter: 'faculty',
        adjunct: 'all',
        tenured: 'all',
        upd: 'include',
        hasEmail: true
      }
    },
    'all-staff': {
      name: 'All Staff',
      filters: {
        programs: { include: [], exclude: [] },
        jobTitles: { include: [], exclude: [] },
        buildings: { include: [], exclude: [] },
        roleFilter: 'staff',
        adjunct: 'all',
        tenured: 'all',
        upd: 'all',
        hasEmail: true
      }
    }
  };

  // Combine faculty and staff data, removing duplicates
  const combinedDirectoryData = useMemo(() => {
    const allPeople = [];
    
    // Add faculty data with role indicator
    if (facultyData && Array.isArray(facultyData)) {
      facultyData.forEach(person => {
        allPeople.push({
          ...person,
          role: 'Faculty',
          roleType: 'faculty'
        });
      });
    }
    
    // Add staff data with role indicator
    if (staffData && Array.isArray(staffData)) {
      staffData.forEach(person => {
        allPeople.push({
          ...person,
          role: 'Staff',
          roleType: 'staff'
        });
      });
    }
    
    // Remove duplicates (people who are both faculty and staff)
    const uniqueMap = new Map();
    
    allPeople.forEach(person => {
      const key = `${person.name?.toLowerCase()}-${(person.email || 'no-email').toLowerCase()}`;
      
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, person);
      } else {
        const existing = uniqueMap.get(key);
        // If person exists in both datasets, combine roles
        if (existing.roleType !== person.roleType) {
          uniqueMap.set(key, {
            ...existing,
            role: 'Faculty & Staff',
            roleType: 'both',
            isAlsoStaff: true,
            isAlsoFaculty: true
          });
        } else {
          // Keep the one with more complete data
          const existingFields = Object.values(existing).filter(v => v && v !== '').length;
          const newFields = Object.values(person).filter(v => v && v !== '').length;
          
          if (newFields > existingFields) {
            uniqueMap.set(key, person);
          }
        }
      }
    });
    
    return Array.from(uniqueMap.values());
  }, [facultyData, staffData]);

  // Extract unique values for filter options
  const filterOptions = useMemo(() => {
    const programs = new Set();
    const jobTitles = new Set();
    const buildings = new Set();

    combinedDirectoryData.forEach(person => {
      // Extract program from faculty program field or fallback to jobTitle parsing
      if (person.program && person.program.name) {
        programs.add(person.program.name);
      } else if (person.jobTitle) {
        const parts = person.jobTitle.split(' - ');
        if (parts.length > 1) {
          programs.add(parts[0].trim());
        }
      }
      
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
      programs: Array.from(programs).sort(),
      jobTitles: Array.from(jobTitles).sort(),
      buildings: Array.from(buildings).sort()
    };
  }, [combinedDirectoryData]);

  // Apply filters to data
  const filteredData = useMemo(() => {
    let filtered = combinedDirectoryData;

    // Search term filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(person => 
        person.name?.toLowerCase().includes(term) ||
        person.email?.toLowerCase().includes(term) ||
        person.jobTitle?.toLowerCase().includes(term) ||
        person.office?.toLowerCase().includes(term) ||
        person.role?.toLowerCase().includes(term)
      );
    }

    // Program filter (include/exclude)
    if (filters.programs.include.length > 0 || filters.programs.exclude.length > 0) {
      filtered = filtered.filter(person => {
        let programName = '';
        
        // Check faculty program field first
        if (person.program && person.program.name) {
          programName = person.program.name;
        } else if (person.jobTitle) {
          // Fallback to jobTitle parsing for staff or faculty without program data
          const parts = person.jobTitle.split(' - ');
          programName = parts.length > 1 ? parts[0].trim() : '';
        }
        
        // Apply include filter
        const includeMatch = filters.programs.include.length === 0 || filters.programs.include.includes(programName);
        // Apply exclude filter
        const excludeMatch = filters.programs.exclude.length === 0 || !filters.programs.exclude.includes(programName);
        
        return includeMatch && excludeMatch;
      });
    }

    // Job title filter (include/exclude)
    if (filters.jobTitles.include.length > 0 || filters.jobTitles.exclude.length > 0) {
      filtered = filtered.filter(person => {
        const jobTitle = person.jobTitle || '';
        
        // Apply include filter
        const includeMatch = filters.jobTitles.include.length === 0 || filters.jobTitles.include.includes(jobTitle);
        // Apply exclude filter
        const excludeMatch = filters.jobTitles.exclude.length === 0 || !filters.jobTitles.exclude.includes(jobTitle);
        
        return includeMatch && excludeMatch;
      });
    }

    // Building filter (include/exclude)
    if (filters.buildings.include.length > 0 || filters.buildings.exclude.length > 0) {
      filtered = filtered.filter(person => {
        const buildingName = person.office ? extractBuildingName(person.office) : 'No Building';
        
        // Apply include filter
        const includeMatch = filters.buildings.include.length === 0 || filters.buildings.include.includes(buildingName);
        // Apply exclude filter
        const excludeMatch = filters.buildings.exclude.length === 0 || !filters.buildings.exclude.includes(buildingName);
        
        return includeMatch && excludeMatch;
      });
    }

    // Role filter
    if (filters.roleFilter !== 'all') {
      filtered = filtered.filter(person => {
        switch (filters.roleFilter) {
          case 'faculty':
            return person.roleType === 'faculty' || person.roleType === 'both';
          case 'staff':
            return person.roleType === 'staff' || person.roleType === 'both';
          case 'both':
            return person.roleType === 'both';
          default:
            return true;
        }
      });
    }

    // Adjunct filter
    if (filters.adjunct !== 'all') {
      filtered = filtered.filter(person => {
        if (filters.adjunct === 'include') {
          return person.isAdjunct;
        } else if (filters.adjunct === 'exclude') {
          return !person.isAdjunct;
        }
        return true;
      });
    }

    // Tenured filter
    if (filters.tenured !== 'all') {
      filtered = filtered.filter(person => {
        if (filters.tenured === 'include') {
          return person.isTenured && (person.roleType === 'faculty' || person.roleType === 'both');
        } else if (filters.tenured === 'exclude') {
          return !person.isTenured || (person.roleType !== 'faculty' && person.roleType !== 'both');
        }
        return true;
      });
    }

    // UPD filter
    if (filters.upd !== 'all') {
      filtered = filtered.filter(person => {
        if (filters.upd === 'include') {
          return person.isUPD;
        } else if (filters.upd === 'exclude') {
          return !person.isUPD;
        }
        return true;
      });
    }

    // Has email filter
    if (filters.hasEmail) {
      filtered = filtered.filter(person => person.email && person.email.trim() !== '');
    }

    return filtered;
  }, [combinedDirectoryData, searchTerm, filters]);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleSelectAll = () => {
    if (selectedPeople.length === filteredData.length) {
      setSelectedPeople([]);
    } else {
      setSelectedPeople(filteredData.map(p => p.id));
    }
  };

  const handleSelectPerson = (personId) => {
    setSelectedPeople(prev => 
      prev.includes(personId) 
        ? prev.filter(id => id !== personId)
        : [...prev, personId]
    );
  };

  const getSelectedPeopleData = () => {
    return combinedDirectoryData.filter(person => selectedPeople.includes(person.id));
  };

  const generateEmailList = (format) => {
    const selectedData = getSelectedPeopleData();
    
    if (selectedData.length === 0) {
      showNotification('Please select at least one person to generate an email list', 'error');
      return;
    }

    let emailString = '';
    
    switch (format) {
      case 'outlook':
        emailString = generateOutlookFormat(selectedData);
        break;
      case 'gmail':
        emailString = generateGmailFormat(selectedData);
        break;
      case 'text':
        emailString = generateTextFormat(selectedData);
        break;
      default:
        emailString = generateTextFormat(selectedData);
    }
    
    copyToClipboard(emailString);
    showNotification(`${format.charAt(0).toUpperCase() + format.slice(1)} email list copied to clipboard with ${selectedData.length} contacts`);
  };

  const generateOutlookFormat = (peopleData) => {
    const emails = peopleData
      .filter(person => person.email && person.email.trim() !== '')
      .map(person => `"${person.name}" <${person.email}>`)
      .join('; ');
    
    return emails;
  };

  const generateGmailFormat = (peopleData) => {
    const emails = peopleData
      .filter(person => person.email && person.email.trim() !== '')
      .map(person => person.email)
      .join(', ');
    
    return emails;
  };

  const generateTextFormat = (peopleData) => {
    const emailList = peopleData
      .filter(person => person.email && person.email.trim() !== '')
      .map(person => `${person.name} - ${person.email}`)
      .join('\n');
    
    return emailList;
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      showNotification('Failed to copy to clipboard', 'error');
    }
  };

  const downloadCSV = () => {
    const selectedData = getSelectedPeopleData();
    
    if (selectedData.length === 0) {
      showNotification('Please select at least one person to download CSV', 'error');
      return;
    }

    const headers = ['Name', 'Email', 'Job Title', 'Role', 'Program', 'Office', 'Phone'];
    const csvContent = [
      headers.join(','),
      ...selectedData.map(person => [
        `"${person.name || ''}"`,
        `"${person.email || ''}"`,
        `"${person.jobTitle || ''}"`,
        `"${person.role || ''}"`,
        `"${person.program?.name || ''}"`,
        `"${person.office || ''}"`,
        `"${person.phone || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `directory-email-list-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    showNotification(`CSV downloaded with ${selectedData.length} contacts`);
  };

  const clearFilters = () => {
    setFilters({
      programs: { include: [], exclude: [] },
      jobTitles: { include: [], exclude: [] },
      buildings: { include: [], exclude: [] },
      roleFilter: 'all',
      adjunct: 'all',
      tenured: 'all',
      upd: 'all',
      hasEmail: true
    });
    setSearchTerm('');
    setActiveFilterPreset('');
  };

  const applyFilterPreset = (presetKey) => {
    if (presetKey === '') {
      clearFilters();
      setActiveFilterPreset('');
      return;
    }
    
    const preset = filterPresets[presetKey];
    if (preset) {
      setFilters(preset.filters);
      setActiveFilterPreset(presetKey);
    }
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.programs.include.length > 0) count++;
    if (filters.programs.exclude.length > 0) count++;
    if (filters.jobTitles.include.length > 0) count++;
    if (filters.jobTitles.exclude.length > 0) count++;
    if (filters.buildings.include.length > 0) count++;
    if (filters.buildings.exclude.length > 0) count++;
    if (filters.roleFilter !== 'all') count++;
    if (filters.adjunct !== 'all') count++;
    if (filters.tenured !== 'all') count++;
    if (filters.upd !== 'all') count++;
    if (!filters.hasEmail) count++;
    return count;
  }, [filters]);

  const isAllSelected = selectedPeople.length === filteredData.length && filteredData.length > 0;
  const isPartiallySelected = selectedPeople.length > 0 && selectedPeople.length < filteredData.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Lists</h1>
          <p className="text-gray-600 mt-1">
            Filter and select faculty and staff to create email lists for Outlook or other email clients
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {activeFilterCount > 0 && (
            <div className="flex items-center text-sm text-baylor-green">
              <Filter className="w-4 h-4 mr-1" />
              <span className="font-medium">{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active</span>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-600">
              {selectedPeople.length} of {filteredData.length} selected
            </span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, email, title, office, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
            />
          </div>
          
          {/* Filter Presets */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 whitespace-nowrap">Quick filters:</span>
            <select
              value={activeFilterPreset}
              onChange={(e) => applyFilterPreset(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
            >
              <option value="">Custom filters</option>
              {Object.entries(filterPresets).map(([key, preset]) => (
                <option key={key} value={key}>{preset.name}</option>
              ))}
            </select>
          </div>
          
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center px-4 py-2 border rounded-lg transition-colors ${
              showFilters ? 'bg-baylor-green text-white border-baylor-green' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Settings className="w-4 h-4 mr-2" />
            Advanced Filters
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Clear Filters */}
          {(searchTerm || activeFilterCount > 0) && (
            <button
              onClick={clearFilters}
              className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4 mr-1" />
              Clear All
            </button>
          )}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="pt-4 border-t border-gray-200 space-y-6">
            {/* Programs Filter */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Include Programs
                </label>
                <MultiSelectDropdown
                  options={filterOptions.programs}
                  selected={filters.programs.include}
                  onChange={(selected) => setFilters(prev => ({ 
                    ...prev, 
                    programs: { ...prev.programs, include: selected }
                  }))}
                  placeholder="Select programs to include..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Exclude Programs
                </label>
                <MultiSelectDropdown
                  options={filterOptions.programs}
                  selected={filters.programs.exclude}
                  onChange={(selected) => setFilters(prev => ({ 
                    ...prev, 
                    programs: { ...prev.programs, exclude: selected }
                  }))}
                  placeholder="Select programs to exclude..."
                />
              </div>
            </div>

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

            {/* Role and Status Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role Type
                </label>
                <select
                  value={filters.roleFilter}
                  onChange={(e) => setFilters(prev => ({ ...prev, roleFilter: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                >
                  <option value="all">All Roles</option>
                  <option value="faculty">Faculty Only</option>
                  <option value="staff">Staff Only</option>
                  <option value="both">Faculty & Staff</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adjunct Status
                </label>
                <select
                  value={filters.adjunct}
                  onChange={(e) => setFilters(prev => ({ ...prev, adjunct: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                >
                  <option value="all">All</option>
                  <option value="include">Adjunct Only</option>
                  <option value="exclude">Exclude Adjunct</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tenure Status
                </label>
                <select
                  value={filters.tenured}
                  onChange={(e) => setFilters(prev => ({ ...prev, tenured: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                >
                  <option value="all">All</option>
                  <option value="include">Tenured Only</option>
                  <option value="exclude">Exclude Tenured</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  UPD Status
                </label>
                <select
                  value={filters.upd}
                  onChange={(e) => setFilters(prev => ({ ...prev, upd: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                >
                  <option value="all">All</option>
                  <option value="include">UPD Only</option>
                  <option value="exclude">Exclude UPD</option>
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
        )}
      </div>

      {/* Export Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Export Selected People</h3>
            <p className="text-sm text-gray-600 mt-1">
              Choose a format to export the selected contact email list
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={() => generateEmailList('outlook')}
              disabled={selectedPeople.length === 0}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Mail className="w-4 h-4 mr-2" />
              Copy for Outlook
            </button>
            
            <button
              onClick={() => generateEmailList('gmail')}
              disabled={selectedPeople.length === 0}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Mail className="w-4 h-4 mr-2" />
              Copy for Gmail
            </button>
            
            <button
              onClick={() => generateEmailList('text')}
              disabled={selectedPeople.length === 0}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy as Text
            </button>
            
            <button
              onClick={downloadCSV}
              disabled={selectedPeople.length === 0}
              className="flex items-center px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Download CSV
            </button>
          </div>
        </div>
      </div>

      {/* People List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(input) => {
                  if (input) input.indeterminate = isPartiallySelected;
                }}
                onChange={handleSelectAll}
                className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
              />
              <span className="ml-3 text-sm font-medium text-gray-700">
                Select All ({filteredData.length} people)
              </span>
            </label>
            
            {selectedPeople.length > 0 && (
              <span className="text-sm text-baylor-green font-medium">
                {selectedPeople.length} selected
              </span>
            )}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filteredData.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No people match your current filters.</p>
              <p className="text-sm mt-2">Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredData.map((person) => (
                <label
                  key={person.id}
                  className="flex items-center p-4 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPeople.includes(person.id)}
                    onChange={() => handleSelectPerson(person.id)}
                    className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {person.name}
                        </p>
                        <p className="text-sm text-gray-600">
                          {person.email || 'No email'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600 flex items-center justify-end gap-2">
                          {person.jobTitle || 'No title'} • {person.role}
                          {person.isUPD && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              <UserCog size={10} className="mr-1" />
                              UPD
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">
                          {person.program && person.program.name ? (
                            <span className="text-baylor-green font-medium">{person.program.name} • </span>
                          ) : null}
                          {person.office || 'No office'}
                        </p>
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification.show && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg ${
          notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          <div className="flex items-center">
            {notification.type === 'error' ? (
              <X className="w-5 h-5 mr-2" />
            ) : (
              <Check className="w-5 h-5 mr-2" />
            )}
            {notification.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailLists; 