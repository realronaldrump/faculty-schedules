import React, { useState, useMemo, useRef } from 'react';
import { Edit, Save, X, Search, Download, GripVertical, Plus, Trash2, Check, ArrowUpDown, Filter } from 'lucide-react';
import MultiSelectDropdown from './MultiSelectDropdown';

const BaylorIDManagement = ({ facultyData, scheduleData = [], onFacultyUpdate, onFacultyDelete, programs = [] }) => {
  const [searchText, setSearchText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [columnOrder, setColumnOrder] = useState(['firstName', 'lastName', 'program', 'baylorId', 'courses']);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'lastName', direction: 'ascending' });
  const [errors, setErrors] = useState({});

  // Column definitions with display names
  const columnDefinitions = {
    firstName: { label: 'First Name', width: 'w-1/6' },
    lastName: { label: 'Last Name', width: 'w-1/6' },
    program: { label: 'Program', width: 'w-1/4' },
    baylorId: { label: 'Baylor ID', width: 'w-1/6' },
    courses: { label: 'Courses Taught', width: 'w-1/4' }
  };

  // Add filtering state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    programs: { include: [], exclude: [] },
    adjunct: 'all',
    tenured: 'all',
    upd: 'all',
    hasEmail: true,
    courseCount: 'all',
    isAlsoStaff: 'all',
    hasBaylorId: 'all'
  });

  // Process faculty data with course information
  const processedFacultyData = useMemo(() => {
    if (!facultyData || !Array.isArray(facultyData)) return [];
    
    return facultyData.map(faculty => {
      // Calculate courses taught
      const facultyName = faculty.name;
      const facultyCourses = scheduleData.filter(schedule => {
        const instructorName = schedule.instructor ? 
          `${schedule.instructor.firstName || ''} ${schedule.instructor.lastName || ''}`.trim() :
          (schedule.instructorName || schedule.Instructor || '');
        
        return instructorName === facultyName;
      });
      
      // Get unique courses (by course code)
      const uniqueCourses = [...new Set(facultyCourses.map(schedule => 
        schedule.courseCode || schedule.Course || ''
      ))].filter(courseCode => courseCode.trim() !== '');

      // Extract first and last names
      const nameParts = (faculty.name || '').split(' ');
      const firstName = faculty.firstName || nameParts[0] || '';
      const lastName = faculty.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

             return {
         ...faculty,
         firstName,
         lastName,
         baylorId: faculty.baylorId || '',
         program: faculty.program || null,
         coursesArray: uniqueCourses,
         coursesDisplay: uniqueCourses.join(', ') || 'No courses assigned'
       };
    });
  }, [facultyData, scheduleData]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let data = [...processedFacultyData];

    // Apply search filter
    if (searchText) {
      const search = searchText.toLowerCase();
             data = data.filter(faculty => 
         faculty.firstName?.toLowerCase().includes(search) ||
         faculty.lastName?.toLowerCase().includes(search) ||
         faculty.program?.name?.toLowerCase().includes(search) ||
         faculty.baylorId?.toString().includes(search) ||
         faculty.coursesDisplay?.toLowerCase().includes(search)
       );
    }

         // Apply filters
     if (filters.programs.include.length > 0 || filters.programs.exclude.length > 0) {
       data = data.filter(faculty => {
         const programName = faculty.program?.name || '';
         const includeMatch = filters.programs.include.length === 0 || filters.programs.include.includes(programName);
         const excludeMatch = filters.programs.exclude.length === 0 || !filters.programs.exclude.includes(programName);
         return includeMatch && excludeMatch;
       });
     }

     if (filters.adjunct !== 'all') {
       data = data.filter(faculty => {
         if (filters.adjunct === 'include') return faculty.isAdjunct;
         if (filters.adjunct === 'exclude') return !faculty.isAdjunct;
         return true;
       });
     }

     if (filters.tenured !== 'all') {
       data = data.filter(faculty => {
         if (filters.tenured === 'include') return faculty.isTenured;
         if (filters.tenured === 'exclude') return !faculty.isTenured;
         return true;
       });
     }

     if (filters.upd !== 'all') {
       data = data.filter(faculty => {
         if (filters.upd === 'include') return faculty.isUPD;
         if (filters.upd === 'exclude') return !faculty.isUPD;
         return true;
       });
     }

     if (filters.isAlsoStaff !== 'all') {
       data = data.filter(faculty => {
         if (filters.isAlsoStaff === 'include') return faculty.isAlsoStaff;
         if (filters.isAlsoStaff === 'exclude') return !faculty.isAlsoStaff;
         return true;
       });
     }

     if (filters.hasEmail) {
       data = data.filter(faculty => faculty.email && faculty.email.trim() !== '');
     }

     if (filters.courseCount === 'with-courses') {
       data = data.filter(faculty => faculty.coursesArray.length > 0);
     } else if (filters.courseCount === 'without-courses') {
       data = data.filter(faculty => faculty.coursesArray.length === 0);
     }

     if (filters.hasBaylorId === 'with-id') {
       data = data.filter(faculty => faculty.baylorId && faculty.baylorId.trim() !== '');
     } else if (filters.hasBaylorId === 'without-id') {
       data = data.filter(faculty => !faculty.baylorId || faculty.baylorId.trim() === '');
     }

     // Apply sorting
     data.sort((a, b) => {
       let valueA = a[sortConfig.key] || '';
       let valueB = b[sortConfig.key] || '';

       // Handle special cases
       if (sortConfig.key === 'courses') {
         valueA = a.coursesArray.length;
         valueB = b.coursesArray.length;
       } else if (sortConfig.key === 'program') {
         valueA = (a.program?.name || '').toLowerCase();
         valueB = (b.program?.name || '').toLowerCase();
       } else if (sortConfig.key === 'baylorId') {
         valueA = parseInt(valueA) || 0;
         valueB = parseInt(valueB) || 0;
       } else if (typeof valueA === 'string') {
         valueA = valueA.toLowerCase();
         valueB = valueB.toLowerCase();
       }

       if (valueA < valueB) return sortConfig.direction === 'ascending' ? -1 : 1;
       if (valueA > valueB) return sortConfig.direction === 'ascending' ? 1 : -1;
       return 0;
     });

    return data;
     }, [processedFacultyData, searchText, sortConfig, filters]);

   // Extract unique values for filter options
   const filterOptions = useMemo(() => {
     const programs = new Set();

     processedFacultyData.forEach(faculty => {
       if (faculty.program?.name) {
         programs.add(faculty.program.name);
       }
     });

     return {
       programs: Array.from(programs).sort()
     };
   }, [processedFacultyData]);

  // Validation function
  const validate = (data) => {
    const newErrors = {};
    
    // Baylor ID validation
    if (data.baylorId) {
      const baylorIdStr = data.baylorId.toString();
      if (!/^\d{9}$/.test(baylorIdStr)) {
        newErrors.baylorId = 'Baylor ID must be exactly 9 digits.';
      }
      
      // Check for duplicates (excluding current faculty being edited)
      const isDuplicate = processedFacultyData.some(faculty => 
        faculty.id !== data.id && 
        faculty.baylorId === data.baylorId && 
        data.baylorId !== ''
      );
      
      if (isDuplicate) {
        newErrors.baylorId = 'This Baylor ID is already assigned to another faculty member.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle drag and drop for columns
  const handleDragStart = (e, columnKey) => {
    setDraggedColumn(columnKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetColumnKey) => {
    e.preventDefault();
    
    if (draggedColumn && draggedColumn !== targetColumnKey) {
      const newColumnOrder = [...columnOrder];
      const draggedIndex = newColumnOrder.indexOf(draggedColumn);
      const targetIndex = newColumnOrder.indexOf(targetColumnKey);
      
      // Remove dragged column and insert at target position
      newColumnOrder.splice(draggedIndex, 1);
      newColumnOrder.splice(targetIndex, 0, draggedColumn);
      
      setColumnOrder(newColumnOrder);
    }
    
    setDraggedColumn(null);
  };

  // Export functionality
  const exportToCSV = () => {
    const headers = columnOrder.map(key => columnDefinitions[key].label);
         const rows = filteredAndSortedData.map(faculty => 
       columnOrder.map(key => {
         if (key === 'courses') return faculty.coursesDisplay;
         if (key === 'program') return faculty.program?.name || '';
         return faculty[key] || '';
       })
     );

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `baylor-id-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Editing functions
  const handleEdit = (faculty) => {
    setErrors({});
    setEditingId(faculty.id);
         setEditFormData({
       id: faculty.id,
       firstName: faculty.firstName,
       lastName: faculty.lastName,
       programId: faculty.programId || faculty.program?.id || '',
       baylorId: faculty.baylorId
     });
  };

  const handleSave = async () => {
    if (validate(editFormData)) {
      try {
        // Find the original faculty data
        const originalFaculty = facultyData.find(f => f.id === editFormData.id);
        
        // Update the faculty data with new values
                 const updatedFaculty = {
           ...originalFaculty,
           firstName: editFormData.firstName,
           lastName: editFormData.lastName,
           name: `${editFormData.firstName} ${editFormData.lastName}`.trim(),
           programId: editFormData.programId,
           baylorId: editFormData.baylorId
         };

        await onFacultyUpdate(updatedFaculty);
        setEditingId(null);
        setEditFormData({});
        setErrors({});
      } catch (error) {
        console.error('Error updating faculty:', error);
      }
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditFormData({});
    setErrors({});
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let finalValue = value;
    
    // Handle Baylor ID input - only allow digits and limit to 9
    if (name === 'baylorId') {
      finalValue = value.replace(/\D/g, '').slice(0, 9);
    }

    const newFormData = {
      ...editFormData,
      [name]: finalValue
    };
    
    setEditFormData(newFormData);

    // Live validation
    if (Object.keys(errors).length > 0) {
      validate(newFormData);
    }
  };

  const clearFilters = () => {
    setFilters({
      programs: { include: [], exclude: [] },
      adjunct: 'all',
      tenured: 'all',
      upd: 'all',
      hasEmail: true,
      courseCount: 'all',
      isAlsoStaff: 'all',
      hasBaylorId: 'all'
    });
    setSearchText('');
  };

  const handleSort = (columnKey) => {
    let direction = 'ascending';
    if (sortConfig.key === columnKey && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key: columnKey, direction });
  };

  const handleDelete = async (faculty) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Faculty',
      message: `Are you sure you want to remove ${faculty.firstName} ${faculty.lastName} from the system? This action cannot be undone.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await onFacultyDelete(faculty);
        } catch (error) {
          console.error('Error deleting faculty:', error);
        } finally {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }
      },
      onCancel: () => setConfirmState(prev => ({ ...prev, isOpen: false }))
    });
  };

  const SortableHeader = ({ columnKey, label }) => {
    const isSorted = sortConfig.key === columnKey;
    const direction = isSorted ? sortConfig.direction : null;
    
    return (
      <div className="flex items-center gap-2">
        <GripVertical 
          size={16} 
          className="text-gray-400 cursor-move"
          draggable
          onDragStart={(e) => handleDragStart(e, columnKey)}
        />
        <button 
          onClick={() => handleSort(columnKey)}
          className="flex items-center gap-1 hover:text-baylor-green transition-colors"
        >
          {label}
          {isSorted ? (
            direction === 'ascending' ? '▲' : '▼'
          ) : (
            <ArrowUpDown size={14} className="opacity-30" />
          )}
        </button>
      </div>
    );
  };

  const getInputClass = (fieldName) => {
    const baseClass = "w-full p-2 border rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green";
    return errors[fieldName] ? `${baseClass} border-red-500` : `${baseClass} border-gray-300`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-serif font-semibold text-baylor-green">
              Baylor ID Management
            </h2>
            <p className="text-gray-600 mt-1">
              Manage faculty Baylor ID numbers and program assignments. Drag column headers to reorder.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder="Search faculty..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
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
            
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
            >
              <Download size={18} />
              Export CSV
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

              {/* Status Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
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
                    Staff Status
                  </label>
                  <select
                    value={filters.isAlsoStaff}
                    onChange={(e) => setFilters(prev => ({ ...prev, isAlsoStaff: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All</option>
                    <option value="include">Also Staff</option>
                    <option value="exclude">Faculty Only</option>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Course Status
                  </label>
                  <select
                    value={filters.courseCount}
                    onChange={(e) => setFilters(prev => ({ ...prev, courseCount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All</option>
                    <option value="with-courses">Teaching Courses</option>
                    <option value="without-courses">Not Teaching</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Baylor ID Status
                  </label>
                  <select
                    value={filters.hasBaylorId}
                    onChange={(e) => setFilters(prev => ({ ...prev, hasBaylorId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All</option>
                    <option value="with-id">Has Baylor ID</option>
                    <option value="without-id">Missing Baylor ID</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p className="flex items-center">
            <span className="mr-2">💡</span>
            Showing {filteredAndSortedData.length} faculty members. 
            {filteredAndSortedData.filter(f => !f.baylorId).length > 0 && 
              ` ${filteredAndSortedData.filter(f => !f.baylorId).length} need Baylor ID assignment.`
            }
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-baylor-green/5">
                {columnOrder.map((columnKey) => (
                  <th 
                    key={columnKey}
                    className={`px-4 py-3 text-left font-serif font-semibold text-baylor-green ${columnDefinitions[columnKey].width}`}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, columnKey)}
                  >
                    <SortableHeader 
                      columnKey={columnKey} 
                      label={columnDefinitions[columnKey].label} 
                    />
                  </th>
                ))}
                <th className="px-4 py-3 w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAndSortedData.map((faculty, index) => (
                <tr key={`faculty-${faculty.id || index}`} className="hover:bg-gray-50">
                  {editingId === faculty.id ? (
                    // Edit mode
                    <>
                      {columnOrder.map((columnKey) => (
                        <td key={columnKey} className="px-4 py-3">
                          {columnKey === 'courses' ? (
                            <div className="text-sm text-gray-600">
                              {faculty.coursesDisplay}
                            </div>
                                                     ) : columnKey === 'program' ? (
                             <div>
                               <select
                                 name="programId"
                                 value={editFormData.programId || ''}
                                 onChange={handleChange}
                                 className={getInputClass('programId')}
                               >
                                 <option value="">Select Program</option>
                                 {programs.map(program => (
                                   <option key={program.id} value={program.id}>{program.name}</option>
                                 ))}
                               </select>
                             </div>
                          ) : columnKey === 'baylorId' ? (
                            <div>
                              <input
                                type="text"
                                name="baylorId"
                                value={editFormData.baylorId || ''}
                                onChange={handleChange}
                                placeholder="9 digits"
                                maxLength={9}
                                className={getInputClass('baylorId')}
                              />
                              {errors.baylorId && (
                                <p className="text-red-600 text-xs mt-1">{errors.baylorId}</p>
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              name={columnKey}
                              value={editFormData[columnKey] || ''}
                              onChange={handleChange}
                              className={getInputClass(columnKey)}
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button 
                            onClick={handleSave}
                            className="p-2 text-green-600 hover:bg-green-100 rounded-full transition-colors"
                          >
                            <Save size={16} />
                          </button>
                          <button 
                            onClick={handleCancel}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    // View mode
                    <>
                      {columnOrder.map((columnKey) => (
                        <td key={columnKey} className="px-4 py-3">
                          {columnKey === 'courses' ? (
                            <div className="text-sm">
                              {faculty.coursesDisplay}
                            </div>
                          ) : columnKey === 'baylorId' ? (
                            <div className={`font-mono ${faculty.baylorId ? 'text-gray-900' : 'text-red-500 italic'}`}>
                              {faculty.baylorId || 'Not assigned'}
                            </div>
                                                     ) : columnKey === 'program' ? (
                             <div className="text-gray-900">
                               {faculty.program?.name || '-'}
                             </div>
                           ) : (
                             <div className="text-gray-900">
                               {faculty[columnKey] || '-'}
                             </div>
                           )}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleEdit(faculty)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(faculty)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredAndSortedData.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {searchText ? 'No faculty members match your search.' : 'No faculty members found.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BaylorIDManagement; 