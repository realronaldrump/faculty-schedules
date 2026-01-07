import React, { useState, useMemo, useEffect } from 'react';
import { Search, Download, Mail, Filter, X, Check, ChevronDown, Users, Plus, Minus, Settings, UserCog, BookOpen, Wifi, Save, Edit2, Trash2, FolderOpen, GraduationCap } from 'lucide-react';
import MultiSelectDropdown from './MultiSelectDropdown';
import FacultyContactCard from './FacultyContactCard';
import CustomAlert from './CustomAlert';
import { useData } from '../contexts/DataContext';
import { usePeople } from '../contexts/PeopleContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmailListPresets } from '../hooks/useEmailListPresets';

const EmailLists = () => {
  const { facultyData = [], staffData = [], studentData = [], scheduleData = [] } = useData();
  const { loadPeople } = usePeople();
  const { isAdmin, user } = useAuth();
  const { presets, loading: presetsLoading, createPreset, updatePreset, deletePreset } = useEmailListPresets();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [nameSort, setNameSort] = useState('firstName');
  const [filters, setFilters] = useState({
    // Multi-select filters with include/exclude
    programs: { include: [], exclude: [] },
    jobTitles: { include: [], exclude: [] },
    buildings: { include: [], exclude: [] },
    // Role filters - simplified to radio buttons
    roleFilter: 'all', // 'all', 'faculty', 'staff', 'both'
    // Boolean filters with include/exclude options
    adjunct: 'exclude', // 'all', 'include', 'exclude'
    tenured: 'all', // 'all', 'include', 'exclude'
    upd: 'all', // 'all', 'include', 'exclude' - NEW UPD filter
    isRemote: 'all', // 'all', 'include', 'exclude' - Remote filter
    // Email filter
    hasEmail: true
  });
  const [showFilters, setShowFilters] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [showOnlyWithCourses, setShowOnlyWithCourses] = useState(false);
  const [outlookVersion, setOutlookVersion] = useState('new'); // 'new' uses commas, 'old' uses semicolons

  // Preset management state
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null); // null for create, preset object for edit
  const [presetName, setPresetName] = useState('');
  const [presetSaving, setPresetSaving] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(''); // tracks which preset is loaded

  // Student Worker State
  const [activeTab, setActiveTab] = useState('faculty-staff'); // 'faculty-staff' | 'student-workers'
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [studentFilters, setStudentFilters] = useState({
    buildings: { include: [], exclude: [] },
    jobTitles: { include: [], exclude: [] },
    hasEmail: true
  });
  const [studentSortConfig, setStudentSortConfig] = useState({ key: 'name', direction: 'ascending' });


  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

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

  // Combine faculty and staff data, removing duplicates and calculating course counts
  const combinedDirectoryData = useMemo(() => {
    const allPeople = [];

    // Add faculty data with role indicator and course count calculation
    if (facultyData && Array.isArray(facultyData)) {
      facultyData.forEach(person => {
        // Calculate course count for faculty
        const facultyName = person.name;
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

        allPeople.push({
          ...person,
          role: 'Faculty',
          roleType: 'faculty',
          courseCount: uniqueCourses.length,
          courses: facultyCourses.map(schedule => ({
            courseCode: schedule.courseCode || schedule.Course || '',
            courseTitle: schedule.courseTitle || schedule['Course Title'] || '',
            section: schedule.section || schedule.Section || '',
            term: schedule.term || schedule.Term || '',
            credits: schedule.credits || schedule.Credits || '',
            level: schedule.courseLevel,
            program: schedule.program,
          }))
        });
      });
    }

    // Add staff data with role indicator
    if (staffData && Array.isArray(staffData)) {
      staffData.forEach(person => {
        allPeople.push({
          ...person,
          role: 'Staff',
          roleType: 'staff',
          courseCount: 0, // Staff don't teach courses
          courses: []
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
            isAlsoFaculty: true,
            courseCount: Math.max(existing.courseCount || 0, person.courseCount || 0),
            courses: [...(existing.courses || []), ...(person.courses || [])]
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
    return Array.from(uniqueMap.values());
  }, [facultyData, staffData, scheduleData]);

  // Process Student Data
  const processedStudentData = useMemo(() => {
    return studentData.map(student => {
      // Extract buildings from primaryBuildings and jobs
      const buildings = new Set();

      if (Array.isArray(student.primaryBuildings)) {
        student.primaryBuildings.forEach(b => { if (b) buildings.add(b); });
      } else if (student.primaryBuilding) {
        buildings.add(student.primaryBuilding);
      }

      if (Array.isArray(student.jobs)) {
        student.jobs.forEach(job => {
          if (Array.isArray(job.location)) {
            job.location.forEach(l => { if (l) buildings.add(l); });
          } else if (job.location) {
            buildings.add(job.location);
          }
        });
      }

      // Extract Job Titles
      const jobTitles = new Set();
      if (student.jobTitle) jobTitles.add(student.jobTitle);
      if (Array.isArray(student.jobs)) {
        student.jobs.forEach(job => {
          if (job.jobTitle) jobTitles.add(job.jobTitle);
        });
      }

      return {
        ...student,
        buildings: Array.from(buildings),
        allJobTitles: Array.from(jobTitles)
      };
    });
  }, [studentData]);

  // Student Filter Options
  const studentFilterOptions = useMemo(() => {
    const buildings = new Set();
    const jobTitles = new Set();

    processedStudentData.forEach(student => {
      student.buildings.forEach(b => buildings.add(b));
      student.allJobTitles.forEach(t => jobTitles.add(t));
    });

    return {
      buildings: Array.from(buildings).sort(),
      jobTitles: Array.from(jobTitles).sort()
    };
  }, [processedStudentData]);

  // Filtered Student Data
  const filteredStudentData = useMemo(() => {
    let filtered = [...processedStudentData];

    // Search
    if (studentSearchTerm) {
      const term = studentSearchTerm.toLowerCase();
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        s.allJobTitles.some(t => t.toLowerCase().includes(term)) ||
        s.buildings.some(b => b.toLowerCase().includes(term))
      );
    }

    // Has Email
    if (studentFilters.hasEmail) {
      filtered = filtered.filter(s => s.email && s.email.trim() !== '');
    }

    // Building Filter
    if (studentFilters.buildings.include.length > 0) {
      filtered = filtered.filter(s => s.buildings.some(b => studentFilters.buildings.include.includes(b)));
    }
    if (studentFilters.buildings.exclude.length > 0) {
      filtered = filtered.filter(s => !s.buildings.some(b => studentFilters.buildings.exclude.includes(b)));
    }

    // Job Title Filter
    if (studentFilters.jobTitles.include.length > 0) {
      filtered = filtered.filter(s => s.allJobTitles.some(t => studentFilters.jobTitles.include.includes(t)));
    }
    if (studentFilters.jobTitles.exclude.length > 0) {
      filtered = filtered.filter(s => !s.allJobTitles.some(t => studentFilters.jobTitles.exclude.includes(t)));
    }

    // Sort
    filtered.sort((a, b) => {
      const { key, direction } = studentSortConfig;
      let valA = '', valB = '';

      switch (key) {
        case 'name':
          valA = (a.firstName || a.name?.split(' ')[0] || '').toLowerCase();
          valB = (b.firstName || b.name?.split(' ')[0] || '').toLowerCase();
          break; // Simple sorting for now
        case 'email':
          valA = (a.email || '').toLowerCase();
          valB = (b.email || '').toLowerCase();
          break;
        case 'buildings':
          valA = (a.buildings[0] || '').toLowerCase();
          valB = (b.buildings[0] || '').toLowerCase();
          break;
        default:
          valA = (a[key] || '').toString().toLowerCase();
          valB = (b[key] || '').toString().toLowerCase();
      }

      if (valA < valB) return direction === 'ascending' ? -1 : 1;
      if (valA > valB) return direction === 'ascending' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [processedStudentData, studentSearchTerm, studentFilters, studentSortConfig]);

  // Student Selection Handlers
  const handleSelectAllStudents = () => {
    if (selectedStudents.length === filteredStudentData.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudentData.map(s => s.id));
    }
  };

  const handleSelectStudent = (id) => {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleStudentSort = (key) => {
    setStudentSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
    }));
  };

  const clearStudentFilters = () => {
    setStudentFilters({
      buildings: { include: [], exclude: [] },
      jobTitles: { include: [], exclude: [] },
      hasEmail: true
    });
    setStudentSearchTerm('');
    setSelectedStudents([]);
  };

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

  // Sorting helper
  const sortedData = useMemo(() => {
    const data = [...combinedDirectoryData];
    data.sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA;
      let valB;
      switch (key) {
        case 'name':
          if (nameSort === 'firstName') {
            valA = (a.firstName || (a.name || '').split(' ')[0] || '').toLowerCase();
            valB = (b.firstName || (b.name || '').split(' ')[0] || '').toLowerCase();
          } else {
            const aNameParts = (a.lastName || a.name || '').split(' ');
            const bNameParts = (b.lastName || b.name || '').split(' ');
            valA = (a.lastName || aNameParts[aNameParts.length - 1] || '').toLowerCase();
            valB = (b.lastName || bNameParts[bNameParts.length - 1] || '').toLowerCase();
          }
          break;
        case 'email':
          valA = (a.email || '').toLowerCase();
          valB = (b.email || '').toLowerCase();
          break;
        case 'role':
          valA = (a.role || '').toLowerCase();
          valB = (b.role || '').toLowerCase();
          break;
        case 'jobTitle':
          valA = (a.jobTitle || '').toLowerCase();
          valB = (b.jobTitle || '').toLowerCase();
          break;
        case 'program':
          valA = (a.program && a.program.name ? a.program.name : '').toLowerCase();
          valB = (b.program && b.program.name ? b.program.name : '').toLowerCase();
          break;
        case 'status':
          // status combines chips: roleType/badges. Approximate with tuple
          valA = `${a.roleType || ''}-${a.isUPD ? 1 : 0}-${(a.courseCount || 0) > 0 ? 1 : 0}`;
          valB = `${b.roleType || ''}-${b.isUPD ? 1 : 0}-${(b.courseCount || 0) > 0 ? 1 : 0}`;
          break;
        default:
          valA = a[key];
          valB = b[key];
      }
      if (valA < valB) return direction === 'ascending' ? -1 : 1;
      if (valA > valB) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
    return data;
  }, [combinedDirectoryData, sortConfig, nameSort]);

  // Apply filters to data
  const filteredData = useMemo(() => {
    let filtered = sortedData;

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

    // Remote filter
    if (filters.isRemote !== 'all') {
      filtered = filtered.filter(person => {
        if (filters.isRemote === 'include') {
          return person.isRemote;
        } else if (filters.isRemote === 'exclude') {
          return !person.isRemote;
        }
        return true;
      });
    }

    // Has email filter
    if (filters.hasEmail) {
      filtered = filtered.filter(person => person.email && person.email.trim() !== '');
    }

    // Remove the automatic exclusion. Instead, use the filter state:
    if (showOnlyWithCourses) {
      filtered = filtered.filter(person => {
        if (person.roleType === 'faculty' || person.roleType === 'both') {
          return person.courseCount > 0;
        }
        return true; // Keep staff members
      });
    }

    return filtered;
  }, [sortedData, searchTerm, filters, showOnlyWithCourses]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
    }));
  };

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
    if (activeTab === 'student-workers') {
      return processedStudentData.filter(s => selectedStudents.includes(s.id));
    }
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
      default:
        emailString = generateGmailFormat(selectedData);
        break;
    }

    copyToClipboard(emailString);
    // Show a generic success notification
    showNotification(`Email list copied to clipboard with ${selectedData.length} contacts`);
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
      .map(person => person.email);
    const separator = outlookVersion === 'old' ? '; ' : ', ';
    return emails.join(separator);
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
    const peopleToExport = getSelectedPeopleData();
    if (peopleToExport.length === 0) {
      showNotification('Please select at least one person to download CSV', 'error');
      return;
    }

    if (activeTab === 'student-workers') {
      // Student Worker CSV
      const headers = ['Name', 'Email', 'Phone', 'Job Titles', 'Buildings'];
      const rows = peopleToExport.map(p => ({
        'Name': p.name || '',
        'Email': p.email || '',
        'Phone': p.phone || '',
        'Job Titles': p.allJobTitles.join('; '),
        'Buildings': p.buildings.join('; ')
      }));

      const csvContent = [
        headers.join(','),
        ...rows.map(row => Object.values(row).map(val => `"${val || ''}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `student-workers-list-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
      showNotification(`CSV downloaded with ${peopleToExport.length} students`);
      return;
    }


    // CSV Headers
    const headers = [
      'Name', 'Email', 'Phone', 'Role', 'Job Title', 'Program', 'Office', 'Building',
      'Is Adjunct', 'Is Tenured', 'Is UPD', 'Is Remote',
      'Course Count (current semester)', 'Courses Taught (current semester)'
    ];

    // CSV Rows
    const rows = peopleToExport.map(p => ({
      'Name': p.name || '',
      'Email': p.email || '',
      'Phone': p.phone || '',
      'Role': p.role || '',
      'Job Title': p.jobTitle || '',
      'Program': p.program?.name || '',
      'Office': p.office || '',
      'Building': extractBuildingName(p.office || ''),
      'Is Adjunct': p.isAdjunct ? 'Yes' : 'No',
      'Is Tenured': p.isTenured ? 'Yes' : 'No',
      'Is UPD': p.isUPD ? 'Yes' : 'No',
      'Is Remote': p.isRemote ? 'Yes' : 'No',
      'Course Count (current semester)': p.courseCount || 0,
      'Courses Taught (current semester)': p.courses && p.courses.length > 0
        ? p.courses.map(c => `${c.courseCode} (${c.credits} cr) - ${c.courseTitle}`).join('; ')
        : '',
    }));

    // Convert to CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => Object.values(row).map(val => `"${val || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `directory-email-list-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    showNotification(`CSV downloaded with ${peopleToExport.length} contacts`);
  };

  const clearFilters = () => {
    setFilters({
      programs: { include: [], exclude: [] },
      jobTitles: { include: [], exclude: [] },
      buildings: { include: [], exclude: [] },
      roleFilter: 'all',
      adjunct: 'exclude',
      tenured: 'all',
      upd: 'all',
      isRemote: 'all',
      hasEmail: true
    });
    setSearchTerm('');
    setSelectedPeople([]);
    setSelectedPresetId('');
  };

  // Preset management handlers
  const handleOpenCreatePreset = () => {
    if (selectedPeople.length === 0) {
      showNotification('Please select at least one person to create a preset', 'error');
      return;
    }
    setEditingPreset(null);
    setPresetName('');
    setShowPresetModal(true);
  };

  const handleOpenEditPreset = (preset) => {
    setEditingPreset(preset);
    setPresetName(preset.name);
    // Load the preset's people into selection
    setSelectedPeople(preset.personIds || []);
    setShowPresetModal(true);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      showNotification('Please enter a preset name', 'error');
      return;
    }
    if (selectedPeople.length === 0) {
      showNotification('Please select at least one person', 'error');
      return;
    }

    setPresetSaving(true);
    try {
      if (editingPreset) {
        await updatePreset(editingPreset.id, presetName, selectedPeople);
        showNotification(`Preset "${presetName}" updated successfully`);
      } else {
        await createPreset(presetName, selectedPeople);
        showNotification(`Preset "${presetName}" created successfully`);
      }
      setShowPresetModal(false);
      setPresetName('');
      setEditingPreset(null);
    } catch (error) {
      console.error('Error saving preset:', error);
      showNotification(`Failed to save preset: ${error.message}`, 'error');
    } finally {
      setPresetSaving(false);
    }
  };

  const handleDeletePreset = async (preset) => {
    if (!isAdmin) {
      showNotification('Only administrators can delete presets', 'error');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the preset "${preset.name}"?`)) {
      return;
    }
    try {
      await deletePreset(preset.id);
      showNotification(`Preset "${preset.name}" deleted`);
    } catch (error) {
      console.error('Error deleting preset:', error);
      showNotification(`Failed to delete preset: ${error.message}`, 'error');
    }
  };

  const handleLoadPreset = (presetId) => {
    if (!presetId) {
      setSelectedPeople([]);
      return;
    }
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      // Filter to only include IDs that still exist in combined data
      const validIds = preset.personIds.filter(id =>
        combinedDirectoryData.some(person => person.id === id)
      );
      // 1. Identify valid people for this preset
      const selectedPeopleData = combinedDirectoryData.filter(p => validIds.includes(p.id));
      const hasAdjuncts = selectedPeopleData.some(p => p.isAdjunct);

      // 2. Reset filters to ensure visibility, but handle adjuncts dynamically
      setFilters({
        programs: { include: [], exclude: [] },
        jobTitles: { include: [], exclude: [] },
        buildings: { include: [], exclude: [] },
        roleFilter: 'all',
        adjunct: hasAdjuncts ? 'all' : 'exclude', // Unhide adjuncts if needed
        tenured: 'all',
        upd: 'all',
        isRemote: 'all',
        hasEmail: true
      });
      setSearchTerm('');

      // 3. Set the selection
      setSelectedPeople(validIds);

      if (validIds.length !== preset.personIds.length) {
        showNotification(
          `Loaded ${validIds.length} of ${preset.personIds.length} people (some may have been removed)`,
          'info'
        );
      } else {
        showNotification(`Loaded preset "${preset.name}" with ${validIds.length} people`);
      }
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
    if (filters.isRemote !== 'all') count++;
    if (!filters.hasEmail) count++;
    return count;
  }, [filters]);

  // Check if filters are at default values (adjuncts excluded)
  const isDefaultFilters = useMemo(() => {
    return (
      filters.programs.include.length === 0 &&
      filters.programs.exclude.length === 0 &&
      filters.jobTitles.include.length === 0 &&
      filters.jobTitles.exclude.length === 0 &&
      filters.buildings.include.length === 0 &&
      filters.buildings.exclude.length === 0 &&
      filters.roleFilter === 'all' &&
      filters.adjunct === 'exclude' &&
      filters.tenured === 'all' &&
      filters.upd === 'all' &&
      filters.isRemote === 'all' &&
      filters.hasEmail === true &&
      searchTerm === ''
    );
  }, [filters, searchTerm]);

  const isAllSelected = selectedPeople.length === filteredData.length && filteredData.length > 0;
  const isPartiallySelected = selectedPeople.length > 0 && selectedPeople.length < filteredData.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Lists</h1>
          <p className="text-gray-600 mt-1">
            Filter and select faculty and staff to create email lists for any email client
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

      {/* Tab Selectors */}
      <div>
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('faculty-staff')}
              className={`${activeTab === 'faculty-staff'
                ? 'border-baylor-green text-baylor-green'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <Users className="w-4 h-4" />
              Faculty & Staff
            </button>
            <button
              onClick={() => setActiveTab('student-workers')}
              className={`${activeTab === 'student-workers'
                ? 'border-baylor-green text-baylor-green'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <GraduationCap className="w-4 h-4" />
              Student Workers
            </button>
          </nav>
        </div>
      </div>

      {/* Faculty & Staff Content */}
      {activeTab === 'faculty-staff' && (
        <>
          {/* Default Filters Notice */}
          {isDefaultFilters && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center text-xs font-bold mt-0.5">
                !
              </div>
              <div className="text-sm text-amber-800">
                <span className="font-medium">Note:</span> Adjunct faculty are hidden by default.
                Uncheck "Exclude Adjuncts" below or use the Advanced Filters to include them.
              </div>
            </div>
          )}

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

              {/* Saved Presets */}
              <div className="flex items-center space-x-2">
                <FolderOpen className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedPresetId}
                  onChange={(e) => {
                    setSelectedPresetId(e.target.value);
                    handleLoadPreset(e.target.value);
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green min-w-[180px]"
                >
                  <option value="">Load preset...</option>
                  {presetsLoading ? (
                    <option disabled>Loading...</option>
                  ) : presets.length === 0 ? (
                    <option disabled>No presets saved</option>
                  ) : (
                    presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} ({preset.personIds?.length || 0} people)
                      </option>
                    ))
                  )}
                </select>

                {/* Save as Preset Button */}
                <button
                  onClick={handleOpenCreatePreset}
                  disabled={selectedPeople.length === 0}
                  className="flex items-center px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={selectedPeople.length === 0 ? 'Select people first' : 'Save selected people as preset'}
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save Preset
                </button>
              </div>

              {/* Exclude Adjuncts Toggle */}
              <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filters.adjunct === 'exclude'}
                  onChange={(e) => {
                    setFilters(prev => ({
                      ...prev,
                      adjunct: e.target.checked ? 'exclude' : 'all'
                    }));
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                <span>Exclude Adjuncts</span>
              </label>

              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center px-4 py-2 border rounded-lg transition-colors ${showFilters ? 'bg-baylor-green text-white border-baylor-green' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <Settings className="w-4 h-4 mr-2" />
                Advanced Filters
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {/* Clear Filters */}
              <button
                onClick={clearFilters}
                disabled={isDefaultFilters && selectedPeople.length === 0 && !selectedPresetId}
                className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:text-gray-400"
              >
                <X className="w-4 h-4 mr-1" />
                Clear All
              </button>
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
                      Remote Status
                    </label>
                    <select
                      value={filters.isRemote}
                      onChange={(e) => setFilters(prev => ({ ...prev, isRemote: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                    >
                      <option value="all">All</option>
                      <option value="include">Remote Only</option>
                      <option value="exclude">Exclude Remote</option>
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
                <div className="hidden sm:flex items-center space-x-2">
                  <span className="text-sm text-gray-600 whitespace-nowrap">Outlook version:</span>
                  <select
                    value={outlookVersion}
                    onChange={(e) => setOutlookVersion(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="new">New (comma)</option>
                    <option value="old">Old (semicolon)</option>
                  </select>
                </div>
                <button
                  onClick={() => generateEmailList('gmail')}
                  disabled={selectedPeople.length === 0}
                  className="flex items-center px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Copy Emails
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
            {/* Course count filter UI */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showOnlyWithCourses}
                    onChange={e => setShowOnlyWithCourses(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                  />
                  Only show faculty with at least 1 course
                </label>
                {sortConfig.key === 'name' && (
                  <div className="hidden md:flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Sort by:</span>
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                      <button
                        onClick={() => setNameSort('firstName')}
                        className={`px-3 py-1 text-xs ${nameSort === 'firstName'
                          ? 'bg-baylor-green text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        First Name
                      </button>
                      <button
                        onClick={() => setNameSort('lastName')}
                        className={`px-3 py-1 text-xs ${nameSort === 'lastName'
                          ? 'bg-baylor-green text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        Last Name
                      </button>
                    </div>
                  </div>
                )}
              </div>
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

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = isPartiallySelected;
                        }}
                        onChange={handleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                      />
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button className="flex items-center gap-2" onClick={() => handleSort('name')}>
                        Contact
                        <span className="text-gray-400">{sortConfig.key === 'name' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button className="flex items-center gap-2" onClick={() => handleSort('role')}>
                        Role
                        <span className="text-gray-400">{sortConfig.key === 'role' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button className="flex items-center gap-2" onClick={() => handleSort('status')}>
                        Status
                        <span className="text-gray-400">{sortConfig.key === 'status' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredData.map((person) => (
                    <tr key={person.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedPeople.includes(person.id)}
                          onChange={() => handleSelectPerson(person.id)}
                          className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedFacultyForCard(person)}
                          className="font-medium text-gray-900 hover:text-baylor-green text-left hover:underline"
                        >
                          {person.name}
                        </button>
                        <div className="text-sm text-gray-500">{person.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{person.jobTitle || 'No title'}</div>
                        <div className="text-sm text-gray-500">{person.program?.name || 'No program'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${person.isAdjunct ? 'bg-purple-100 text-purple-800' :
                            person.roleType === 'faculty' ? 'bg-baylor-green/10 text-baylor-green' :
                              person.roleType === 'staff' ? 'bg-green-100 text-green-800' :
                                'bg-baylor-gold/20 text-baylor-gold'
                            }`}>
                            {person.isAdjunct ? 'Adjunct' : person.role}
                          </span>
                          {person.isUPD && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              UPD
                            </span>
                          )}
                          {person.isRemote && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-link-green/10 text-link-green">
                              <Wifi size={12} className="mr-1" />
                              Remote
                            </span>
                          )}
                          {(person.roleType === 'faculty' || person.roleType === 'both') && person.courseCount > 0 && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-baylor-green/10 text-baylor-green">
                              {person.courseCount} course{person.courseCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredData.length === 0 && (
              <div className="p-8 text-center text-gray-500 border-t border-gray-200">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No people match your current filters.</p>
                <p className="text-sm mt-2">Try adjusting your search or filter criteria.</p>
              </div>
            )}
          </div>

          {selectedFacultyForCard && (
            <FacultyContactCard
              faculty={selectedFacultyForCard}
              onClose={() => setSelectedFacultyForCard(null)}
            />
          )}

          {/* Preset Management Section */}
          {presets.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-baylor-green" />
                Saved Presets
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-baylor-green/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => handleLoadPreset(preset.id)}
                        className="font-medium text-gray-900 hover:text-baylor-green truncate block w-full text-left"
                        title={`Load "${preset.name}"`}
                      >
                        {preset.name}
                      </button>
                      <p className="text-xs text-gray-500 truncate">
                        {preset.personIds?.length || 0} people
                        {preset.createdBy && <span className="ml-1">• by {preset.createdBy.split('@')[0]}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => handleOpenEditPreset(preset)}
                        className="p-1.5 text-gray-400 hover:text-baylor-green hover:bg-gray-100 rounded transition-colors"
                        title="Edit preset"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeletePreset(preset)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Delete preset (admin only)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preset Modal */}
          {showPresetModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-baylor-green">
                  <h3 className="text-lg font-semibold text-white">
                    {editingPreset ? 'Edit Preset' : 'Create New Preset'}
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Preset Name
                    </label>
                    <input
                      type="text"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="e.g., Faculty Meeting Professors, Remote Adjuncts, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                      autoFocus
                    />
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">{selectedPeople.length}</span> people will be saved in this preset
                    </p>
                    {selectedPeople.length > 0 && (
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        <ul className="text-xs text-gray-500 space-y-0.5">
                          {combinedDirectoryData
                            .filter(p => selectedPeople.includes(p.id))
                            .slice(0, 10)
                            .map(p => (
                              <li key={p.id} className="truncate">• {p.name}</li>
                            ))}
                          {selectedPeople.length > 10 && (
                            <li className="text-gray-400 italic">...and {selectedPeople.length - 10} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowPresetModal(false);
                      setPresetName('');
                      setEditingPreset(null);
                    }}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePreset}
                    disabled={!presetName.trim() || selectedPeople.length === 0 || presetSaving}
                    className="px-4 py-2 text-sm bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {presetSaving ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {editingPreset ? 'Update Preset' : 'Save Preset'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Student Workers Content */}
      {
        activeTab === 'student-workers' && (
          <>
            {/* Student Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
              <div className="flex items-center gap-4">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search student workers..."
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green"
                  />
                </div>

                {/* Clear Filters */}
                {(studentFilters.buildings.include.length > 0 || studentFilters.buildings.exclude.length > 0 ||
                  studentFilters.jobTitles.include.length > 0 || studentFilters.jobTitles.exclude.length > 0 || studentSearchTerm) && (
                    <button onClick={clearStudentFilters} className="text-sm text-gray-500 hover:text-gray-700 flex items-center">
                      <X className="w-4 h-4 mr-1" /> Clear
                    </button>
                  )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                {/* Building Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Buildings</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <MultiSelectDropdown
                        options={studentFilterOptions.buildings}
                        selected={studentFilters.buildings.include}
                        onChange={(sel) => setStudentFilters(prev => ({ ...prev, buildings: { ...prev.buildings, include: sel } }))}
                        placeholder="Include buildings..."
                      />
                    </div>
                    <div className="flex-1">
                      <MultiSelectDropdown
                        options={studentFilterOptions.buildings}
                        selected={studentFilters.buildings.exclude}
                        onChange={(sel) => setStudentFilters(prev => ({ ...prev, buildings: { ...prev.buildings, exclude: sel } }))}
                        placeholder="Exclude buildings..."
                      />
                    </div>
                  </div>
                </div>

                {/* Job Title Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
                  <MultiSelectDropdown
                    options={studentFilterOptions.jobTitles}
                    selected={studentFilters.jobTitles.include}
                    onChange={(sel) => setStudentFilters(prev => ({ ...prev, jobTitles: { ...prev.jobTitles, include: sel } }))}
                    placeholder="Filter by job title..."
                  />
                </div>
              </div>
            </div>

            {/* Student Export Actions */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Export Students</h3>
                <p className="text-sm text-gray-600">{selectedStudents.length} students selected</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => generateEmailList('gmail')}
                  disabled={selectedStudents.length === 0}
                  className="flex items-center px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50"
                >
                  <Mail className="w-4 h-4 mr-2" /> Copy Emails
                </button>
                <button
                  onClick={downloadCSV}
                  disabled={selectedStudents.length === 0}
                  className="flex items-center px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50"
                >
                  <Download className="w-4 h-4 mr-2" /> CSV
                </button>
              </div>
            </div>

            {/* Student List Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Header Select All */}
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center">
                <input
                  type="checkbox"
                  checked={filteredStudentData.length > 0 && selectedStudents.length === filteredStudentData.length}
                  onChange={handleSelectAllStudents}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green mr-3"
                />
                <span className="text-sm font-medium text-gray-700">Select All</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left">Selected</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleStudentSort('name')}>
                        Name {studentSortConfig.key === 'name' && (studentSortConfig.direction === 'ascending' ? '▲' : '▼')}
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job Titles</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buildings</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredStudentData.map(student => (
                      <tr key={student.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedStudents.includes(student.id)}
                            onChange={() => handleSelectStudent(student.id)}
                            className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{student.name}</div>
                          <div className="text-sm text-gray-500">{student.email}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {student.allJobTitles.join(', ') || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {student.buildings.map(b => (
                            <span key={b} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 mr-1">
                              {b}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                    {filteredStudentData.length === 0 && (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                          No student workers match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      }

      {/* Preset Modal */}
      {
        showPresetModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-baylor-green">
                <h3 className="text-lg font-semibold text-white">
                  {editingPreset ? 'Edit Preset' : 'Create New Preset'}
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preset Name
                  </label>
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="e.g., Faculty Meeting Professors, Remote Adjuncts, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                    autoFocus
                  />
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">{selectedPeople.length}</span> people will be saved in this preset
                  </p>
                  {selectedPeople.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      <ul className="text-xs text-gray-500 space-y-0.5">
                        {combinedDirectoryData
                          .filter(p => selectedPeople.includes(p.id))
                          .slice(0, 10)
                          .map(p => (
                            <li key={p.id} className="truncate">• {p.name}</li>
                          ))}
                        {selectedPeople.length > 10 && (
                          <li className="text-gray-400 italic">...and {selectedPeople.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowPresetModal(false);
                    setPresetName('');
                    setEditingPreset(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePreset}
                  disabled={!presetName.trim() || selectedPeople.length === 0 || presetSaving}
                  className="px-4 py-2 text-sm bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {presetSaving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingPreset ? 'Update Preset' : 'Save Preset'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Notification */}
      {
        notification.show && (
          <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-baylor-green text-white'
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
        )
      }
    </div >
  );
};

export default EmailLists; 
