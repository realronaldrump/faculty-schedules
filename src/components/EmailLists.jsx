import React, { useState, useMemo } from 'react';
import { Search, Download, Mail, Filter, X, Check, ChevronDown, Users, Copy } from 'lucide-react';
import MultiSelectDropdown from './MultiSelectDropdown';

const EmailLists = ({ facultyData, staffData }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [filters, setFilters] = useState({
    programs: [],
    jobTitles: [],
    facultyOnly: false,
    staffOnly: false,
    adjunctOnly: false,
    tenuredOnly: false,
    hasEmail: true
  });
  const [showFilters, setShowFilters] = useState(false);
  const [exportFormat, setExportFormat] = useState('outlook'); // 'outlook', 'gmail', 'text'
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

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

    combinedDirectoryData.forEach(person => {
      // Extract program from jobTitle (assuming format like "Program - College")
      // For now, we'll use the same logic as departments until programs are implemented
      if (person.jobTitle) {
        const parts = person.jobTitle.split(' - ');
        if (parts.length > 1) {
          programs.add(parts[0].trim());
        }
        jobTitles.add(person.jobTitle);
      }
    });

    return {
      programs: Array.from(programs).sort(),
      jobTitles: Array.from(jobTitles).sort()
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

    // Program filter
    if (filters.programs.length > 0) {
      filtered = filtered.filter(person => {
        if (!person.jobTitle) return false;
        const parts = person.jobTitle.split(' - ');
        const program = parts.length > 1 ? parts[0].trim() : '';
        return filters.programs.includes(program);
      });
    }

    // Job title filter
    if (filters.jobTitles.length > 0) {
      filtered = filtered.filter(person => 
        person.jobTitle && filters.jobTitles.includes(person.jobTitle)
      );
    }

    // Faculty only filter
    if (filters.facultyOnly) {
      filtered = filtered.filter(person => person.roleType === 'faculty' || person.roleType === 'both');
    }

    // Staff only filter
    if (filters.staffOnly) {
      filtered = filtered.filter(person => person.roleType === 'staff' || person.roleType === 'both');
    }

    // Adjunct filter
    if (filters.adjunctOnly) {
      filtered = filtered.filter(person => person.isAdjunct);
    }

    // Tenured filter (only applies to faculty)
    if (filters.tenuredOnly) {
      filtered = filtered.filter(person => person.isTenured && (person.roleType === 'faculty' || person.roleType === 'both'));
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
      showNotification('Please select people first', 'error');
      return;
    }

    switch (format) {
      case 'outlook':
        return generateOutlookFormat(selectedData);
      case 'gmail':
        return generateGmailFormat(selectedData);
      case 'text':
        return generateTextFormat(selectedData);
      default:
        return generateOutlookFormat(selectedData);
    }
  };

  const generateOutlookFormat = (peopleData) => {
    // Create comma-separated email list for Outlook
    const emails = peopleData
      .filter(person => person.email)
      .map(person => `${person.name} <${person.email}>`)
      .join('; ');
    
    copyToClipboard(emails);
    showNotification(`${peopleData.length} contacts copied in Outlook format`);
    
    return emails;
  };

  const generateGmailFormat = (peopleData) => {
    // Create comma-separated email list for Gmail
    const emails = peopleData
      .filter(person => person.email)
      .map(person => person.email)
      .join(', ');
    
    copyToClipboard(emails);
    showNotification(`${peopleData.length} contacts copied in Gmail format`);
    
    return emails;
  };

  const generateTextFormat = (peopleData) => {
    // Create formatted text list
    const textList = peopleData
      .filter(person => person.email)
      .map(person => `${person.name} - ${person.email} - ${person.jobTitle || 'No Title'} - ${person.office || 'No Office'} - ${person.role}`)
      .join('\n');
    
    copyToClipboard(textList);
    showNotification(`${peopleData.length} contacts copied as formatted text`);
    
    return textList;
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
      showNotification('Please select people first', 'error');
      return;
    }

    const csvHeaders = ['Name', 'Email', 'Job Title', 'Office', 'Phone', 'Role'];
    const csvData = selectedData.map(person => [
      person.name || '',
      person.email || '',
      person.jobTitle || '',
      person.office || '',
      person.phone || '',
      person.role || ''
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `directory-email-list-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    showNotification(`CSV downloaded with ${selectedData.length} contacts`);
  };

  const clearFilters = () => {
    setFilters({
      programs: [],
      jobTitles: [],
      facultyOnly: false,
      staffOnly: false,
      adjunctOnly: false,
      tenuredOnly: false,
      hasEmail: true
    });
    setSearchTerm('');
  };

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
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-600">
            {selectedPeople.length} of {filteredData.length} selected
          </span>
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
          
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center px-4 py-2 border rounded-lg transition-colors ${
              showFilters ? 'bg-baylor-green text-white border-baylor-green' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Clear Filters */}
          {(searchTerm || filters.programs.length > 0 || filters.jobTitles.length > 0 || filters.facultyOnly || filters.staffOnly || filters.adjunctOnly || filters.tenuredOnly || !filters.hasEmail) && (
            <button
              onClick={clearFilters}
              className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </button>
          )}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Programs</label>
              <MultiSelectDropdown
                options={filterOptions.programs}
                selected={filters.programs}
                onChange={(selected) => setFilters(prev => ({ ...prev, programs: selected }))}
                placeholder="Select programs..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
              <MultiSelectDropdown
                options={filterOptions.jobTitles}
                selected={filters.jobTitles}
                onChange={(selected) => setFilters(prev => ({ ...prev, jobTitles: selected }))}
                placeholder="Select job titles..."
              />
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Filter Options</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.facultyOnly}
                    onChange={(e) => setFilters(prev => ({ ...prev, facultyOnly: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                  />
                  <span className="ml-2 text-sm text-gray-700">Faculty only</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.staffOnly}
                    onChange={(e) => setFilters(prev => ({ ...prev, staffOnly: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                  />
                  <span className="ml-2 text-sm text-gray-700">Staff only</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.adjunctOnly}
                    onChange={(e) => setFilters(prev => ({ ...prev, adjunctOnly: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                  />
                  <span className="ml-2 text-sm text-gray-700">Adjunct only</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.tenuredOnly}
                    onChange={(e) => setFilters(prev => ({ ...prev, tenuredOnly: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-600"
                  />
                  <span className="ml-2 text-sm text-gray-700">Tenured only</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.hasEmail}
                    onChange={(e) => setFilters(prev => ({ ...prev, hasEmail: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                  />
                  <span className="ml-2 text-sm text-gray-700">Has email address</span>
                </label>
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
                        <p className="text-sm text-gray-600">
                          {person.jobTitle || 'No title'} • {person.role}
                        </p>
                        <p className="text-sm text-gray-500">
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