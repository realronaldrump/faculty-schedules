import React, { useState, useMemo, useEffect } from 'react';
import { Edit, Save, X, History, RotateCcw, Filter, Search, ChevronsUpDown, Plus, Trash2, ChevronDown, Settings, Download } from 'lucide-react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import FacultyContactCard from '../FacultyContactCard';
import ICSExportPanel from '../export/ICSExportPanel';
import { formatChangeForDisplay } from '../../utils/recentChanges';
import { parseCourseCode } from '../../utils/courseUtils';
import { logExport } from '../../utils/activityLogger';

const CourseManagement = ({
  scheduleData,
  facultyData,
  rawScheduleData,
  editHistory,
  recentChanges = [],
  onDataUpdate,
  onScheduleDelete,
  onRevertChange,
  showNotification,
  availableSemesters = [],
  selectedSemester = ''
}) => {
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [historyVisible, setHistoryVisible] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAddCourseForm, setShowAddCourseForm] = useState(false);
  const [newCourseData, setNewCourseData] = useState({});
  const [filters, setFilters] = useState({ 
    // Basic filters
    instructor: [], 
    day: [], 
    room: [], 
    searchTerm: '',
    // Advanced filters 
    programs: { include: [], exclude: [] },
    sections: [],
    buildings: { include: [], exclude: [] },
    adjunct: 'all', // 'all', 'include', 'exclude'
    tenured: 'all', // 'all', 'include', 'exclude'
    credits: 'all', // 'all', '1', '2', '3', '4+'
    timeOfDay: 'all', // 'all', 'morning', 'afternoon', 'evening'
    scheduleType: 'all', // 'all', 'Class Instruction', 'Lab', etc.
    status: 'all' // 'all', 'Active', 'Cancelled', etc.
  });


  const [activeFilterPreset, setActiveFilterPreset] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'Instructor', direction: 'ascending' });
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportFields, setSelectedExportFields] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());

  const handleICSDownloadComplete = ({ eventCount }) => {
    try {
      logExport('ICS', 'Term schedules', eventCount || 0);
    } catch (_) {}
  };

  const computeCourseMetadata = (courseCode) => {
    if (!courseCode || typeof courseCode !== 'string') {
      return { credits: '', program: '', catalogNumber: '' };
    }
    const parsed = parseCourseCode(courseCode);
    if (parsed?.error) {
      return { credits: '', program: '', catalogNumber: '' };
    }
    const programCode = parsed.program ? parsed.program.toUpperCase() : '';
    return {
      credits: parsed.credits,
      program: programCode,
      catalogNumber: parsed.catalogNumber || ''
    };
  };

  const extractBuildingNameFromRoom = (roomName) => {
    if (!roomName || typeof roomName !== 'string') {
      return 'Other';
    }

    const cleaned = roomName.trim();
    if (!cleaned) return 'Other';

    const lowered = cleaned.toLowerCase();
    if (lowered.includes('online')) {
      return 'Online';
    }
    if (lowered.includes('no room needed')) {
      return 'No Room Needed';
    }
    if (lowered.includes('off campus')) {
      return 'Off Campus';
    }

    const buildingMatch = cleaned.match(/^([^0-9]+)/);
    if (buildingMatch) {
      const withoutParens = buildingMatch[1].replace(/\([^)]*\)/g, '').trim();
      if (withoutParens) {
        return withoutParens;
      }
    }

    const fallback = cleaned.replace(/\([^)]*\)/g, '').trim();
    return fallback || 'Other';
  };

  const computedNewCourseCredits = useMemo(
    () => computeCourseMetadata(newCourseData.Course || '').credits,
    [newCourseData.Course]
  );

  const sortedFaculty = useMemo(() => {
    if (!facultyData) return [];
    return [...facultyData]
      .map(faculty => {
        const name = faculty.name || '';
        // Handles "First Last" and single names like "Staff"
        const nameParts = name.split(' ');
        let lastName = '';
        let firstName = '';

        if (nameParts.length > 1) {
          lastName = nameParts.pop();
          firstName = nameParts.join(' ');
        } else {
          lastName = name;
        }

        const displayName = firstName ? `${lastName}, ${firstName}` : lastName;

        return {
          id: faculty.id,
          originalName: name,
          displayName: displayName,
          lastName: lastName.toLowerCase(),
        };
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [facultyData]);

  // Process recent changes to show schedule-related changes in the legacy format
  const processedChanges = useMemo(() => {
    // Filter for schedule-related changes and convert to legacy format
    const scheduleChanges = recentChanges
      .filter(change => change.collection === 'schedules')
      .map(change => {
        const formatted = formatChangeForDisplay(change);
        // Extract course and instructor info from entity string
        const entityParts = change.entity?.split(' - ') || [];
        const scheduleInfo = entityParts[1] || '';
        const instructorInfo = entityParts[2] || '';
        
        return {
          action: change.action,
          entity: change.entity,
          course: scheduleInfo,
          instructor: instructorInfo,
          field: 'Schedule Data', // Generic field name since we don't have specific field info
          oldValue: '', // Not available in new format
          newValue: '', // Not available in new format
          timestamp: change.timestamp,
          isRevert: false,
          displayAction: formatted.displayAction,
          timeAgo: formatted.timeAgo
        };
      });
    
    // Combine with legacy editHistory for backward compatibility
    return [...scheduleChanges, ...(editHistory || [])];
  }, [recentChanges, editHistory]);

  // Get unique values for filters (using display names)
  const uniqueInstructors = useMemo(() => 
    [...new Set(scheduleData.filter(item => item && item.Instructor).map(item => item.Instructor))].sort(),
    [scheduleData]
  );

  const uniqueRooms = useMemo(() => {
    const all = [];
    scheduleData.forEach(item => {
      if (!item) return;
      if (item.Room && typeof item.Room === 'string') {
        item.Room.split(';').map(s => s.trim()).filter(Boolean).forEach(r => all.push(r));
      }
    });
    return [...new Set(all)].filter(r => r.toLowerCase() !== 'online').sort();
  }, [scheduleData]);

  const uniqueTerms = useMemo(() => 
    [...new Set(scheduleData.filter(item => item && item.Term).map(item => item.Term))].sort(),
    [scheduleData]
  );

  const uniqueSections = useMemo(() => 
    [...new Set(scheduleData.filter(item => item && item.Section).map(item => item.Section))].sort(),
    [scheduleData]
  );

  const uniqueScheduleTypes = useMemo(() => 
    [...new Set(scheduleData.filter(item => item && item['Schedule Type']).map(item => item['Schedule Type']))].sort(),
    [scheduleData]
  );

  const uniqueStatuses = useMemo(() => 
    [...new Set(scheduleData.filter(item => item && item.Status).map(item => item.Status))].sort(),
    [scheduleData]
  );

  // Available fields for export
  const availableExportFields = useMemo(() => {
    const allKeys = new Set();
    scheduleData.forEach(item => {
      if (!item) return;
      Object.keys(item).forEach(k => {
        if (!k.startsWith('_')) allKeys.add(k);
      });
    });
    return Array.from(allKeys).sort();
  }, [scheduleData]);

  // Sync selected fields when modal opens
  useEffect(() => {
    if (exportModalOpen) {
      setSelectedExportFields(availableExportFields);
    }
  }, [exportModalOpen, availableExportFields]);

  // Extract unique filter options
  const filterOptions = useMemo(() => {
    const programs = new Set();
    const buildings = new Set();

    scheduleData.forEach(item => {
      if (!item) return;

      const rawProgram = item.program ?? item.Program ?? item.subjectCode ?? item.subject ?? item['Course Type'];
      if (rawProgram !== undefined && rawProgram !== null) {
        const normalizedProgram = String(rawProgram).trim().toUpperCase();
        if (normalizedProgram) {
          programs.add(normalizedProgram);
        }
      }

      if (item.Room) {
        const rooms = item.Room.split(';').map(s => s.trim()).filter(Boolean);
        if (rooms.length > 0) {
          rooms.forEach(room => {
            const buildingName = extractBuildingNameFromRoom(room);
            if (buildingName) {
              buildings.add(buildingName);
            }
          });
        } else {
          buildings.add('Other');
        }
      }
    });

    return {
      programs: Array.from(programs).sort(),
      buildings: Array.from(buildings).sort()
    };
  }, [scheduleData]);

  // Filter presets for common use cases
  const filterPresets = {
    'all-courses': {
      name: 'All Courses',
      filters: {
        instructor: [], day: [], room: [], searchTerm: '',
        programs: { include: [], exclude: [] },
        sections: [], buildings: { include: [], exclude: [] },
        adjunct: 'all', tenured: 'all', credits: 'all', timeOfDay: 'all',
        scheduleType: 'all', status: 'all'
      }
    },
    'adjunct-courses': {
      name: 'Adjunct-Taught',
      filters: {
        instructor: [], day: [], room: [], searchTerm: '',
        programs: { include: [], exclude: [] },
        sections: [], buildings: { include: [], exclude: [] },
        adjunct: 'include', tenured: 'all', credits: 'all', timeOfDay: 'all',
        scheduleType: 'all', status: 'all'
      }
    },
    'active-courses': {
      name: 'Active Courses Only',
      filters: {
        instructor: [], day: [], room: [], searchTerm: '',
        programs: { include: [], exclude: [] },
        sections: [], buildings: { include: [], exclude: [] },
        adjunct: 'all', tenured: 'all', credits: 'all', timeOfDay: 'all',
        scheduleType: 'all', status: 'Active'
      }
    },
    'morning-classes': {
      name: 'Morning Classes',
      filters: {
        instructor: [], day: [], room: [], searchTerm: '',
        programs: { include: [], exclude: [] },
        sections: [], buildings: { include: [], exclude: [] },
        adjunct: 'all', tenured: 'all', credits: 'all', timeOfDay: 'morning',
        scheduleType: 'all', status: 'all'
      }
    },
    'high-credit': {
      name: 'High Credit Hours',
      filters: {
        instructor: [], day: [], room: [], searchTerm: '',
        programs: { include: [], exclude: [] },
        sections: [], buildings: { include: [], exclude: [] },
        adjunct: 'all', tenured: 'all', credits: '4+', timeOfDay: 'all',
        scheduleType: 'all', status: 'all'
      }
    }
  };

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  // Parse time for sorting and filtering
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');
    let hour, minute, ampm;
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      hour = parseInt(parts[0]);
      minute = parseInt(parts[1].replace(/[^\d]/g, ''));
      ampm = cleaned.includes('pm') ? 'pm' : 'am';
    } else {
      const match = cleaned.match(/(\d+)(am|pm)/);
      if (match) {
        hour = parseInt(match[1]);
        minute = 0;
        ampm = match[2];
      } else return null;
    }
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return hour * 60 + (minute || 0);
  };

  // Helper function to get time of day
  const getTimeOfDay = (timeStr) => {
    const minutes = parseTime(timeStr);
    if (!minutes) return 'unknown';
    if (minutes < 12 * 60) return 'morning'; // Before noon
    if (minutes < 17 * 60) return 'afternoon'; // Before 5 PM
    return 'evening'; // After 5 PM
  };

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    
    let data = [...scheduleData];
    
    // Apply text search filter
    if (filters.searchTerm && filters.searchTerm.trim() !== '') {
      const lowercasedFilter = filters.searchTerm.toLowerCase().trim();
      data = data.filter(item => {
        if (!item) return false;
        return (
          (item.Course?.toLowerCase().includes(lowercasedFilter)) ||
          (item['Course Title']?.toLowerCase().includes(lowercasedFilter)) ||
          (item.Instructor?.toLowerCase().includes(lowercasedFilter)) ||
          (item.Room?.toLowerCase().includes(lowercasedFilter)) ||
          (item.CRN?.toString().toLowerCase().includes(lowercasedFilter)) ||
          (item.Term?.toLowerCase().includes(lowercasedFilter)) ||
          (item.Section?.toLowerCase().includes(lowercasedFilter))
        );
      });
    }
    
    // Apply basic multi-select filters
    if (filters.instructor && Array.isArray(filters.instructor) && filters.instructor.length > 0) {
      data = data.filter(item => item && item.Instructor && filters.instructor.includes(item.Instructor));
    }
    
    if (filters.day && Array.isArray(filters.day) && filters.day.length > 0) {
      data = data.filter(item => item && item.Day && filters.day.includes(item.Day));
    }
    
    if (filters.room && Array.isArray(filters.room) && filters.room.length > 0) {
      data = data.filter(item => {
        if (!item || !item.Room) return false;
        const rooms = item.Room.split(';').map(s => s.trim()).filter(Boolean);
        return rooms.some(r => filters.room.includes(r));
      });
    }

    // Apply section filter
    if (filters.sections && Array.isArray(filters.sections) && filters.sections.length > 0) {
      data = data.filter(item => item && item.Section && filters.sections.includes(item.Section));
    }

    // Apply schedule type filter
    if (filters.scheduleType && filters.scheduleType !== 'all') {
      data = data.filter(item => {
        return item && item['Schedule Type'] && item['Schedule Type'] === filters.scheduleType;
      });
    }

    // Apply status filter
    if (filters.status && filters.status !== 'all') {
      data = data.filter(item => {
        return item && item.Status && item.Status === filters.status;
      });
    }

    // Apply program filters
    if (filters.programs && (filters.programs.include.length > 0 || filters.programs.exclude.length > 0)) {
      data = data.filter(item => {
        if (!item) return false;

        const rawProgram = item.program ?? item.Program ?? item.subjectCode ?? item.subject ?? item['Course Type'];
        const normalizedProgram = rawProgram !== undefined && rawProgram !== null
          ? String(rawProgram).trim().toUpperCase()
          : '';

        const includeMatch = filters.programs.include.length === 0 || filters.programs.include.includes(normalizedProgram);
        const excludeMatch = filters.programs.exclude.length === 0 || !filters.programs.exclude.includes(normalizedProgram);

        return includeMatch && excludeMatch;
      });
    }

    // Apply building filters
    if (filters.buildings && (filters.buildings.include.length > 0 || filters.buildings.exclude.length > 0)) {
      const includeNormalized = filters.buildings.include.map(name => name.toUpperCase());
      const excludeNormalized = filters.buildings.exclude.map(name => name.toUpperCase());

      data = data.filter(item => {
        if (!item || !item.Room) {
          return filters.buildings.include.length === 0;
        }

        const rooms = item.Room.split(';').map(s => s.trim()).filter(Boolean);
        if (rooms.length === 0) {
          return filters.buildings.include.length === 0;
        }

        const normalizedBuildings = rooms.map(room => extractBuildingNameFromRoom(room).toUpperCase());

        const includeMatch = includeNormalized.length === 0 || normalizedBuildings.some(building => includeNormalized.includes(building));
        const excludeMatch = excludeNormalized.length === 0 || !normalizedBuildings.some(building => excludeNormalized.includes(building));

        return includeMatch && excludeMatch;
      });
    }

    // Apply adjunct filter
    if (filters.adjunct && filters.adjunct !== 'all') {
      data = data.filter(item => {
        if (!item || !item.Instructor || !facultyData) return true;
        
        const faculty = facultyData.find(f => f.name === item.Instructor);
        if (filters.adjunct === 'include') {
          return faculty?.isAdjunct === true;
        } else if (filters.adjunct === 'exclude') {
          return faculty?.isAdjunct !== true;
        }
        return true;
      });
    }

    // Apply tenured filter
    if (filters.tenured && filters.tenured !== 'all') {
      data = data.filter(item => {
        if (!item || !item.Instructor || !facultyData) return true;
        
        const faculty = facultyData.find(f => f.name === item.Instructor);
        if (filters.tenured === 'include') {
          return faculty?.isTenured === true;
        } else if (filters.tenured === 'exclude') {
          return faculty?.isTenured !== true;
        }
        return true;
      });
    }

    // Apply credits filter
    if (filters.credits && filters.credits !== 'all') {
      data = data.filter(item => {
        if (!item) return false;
        const credits = parseInt(item.Credits) || 0;
        if (filters.credits === '1') return credits === 1;
        if (filters.credits === '2') return credits === 2;
        if (filters.credits === '3') return credits === 3;
        if (filters.credits === '4+') return credits >= 4;
        return true;
      });
    }

    // Apply time of day filter
    if (filters.timeOfDay && filters.timeOfDay !== 'all') {
      data = data.filter(item => {
        if (!item) return false;
        const timeOfDay = getTimeOfDay(item['Start Time']);
        return timeOfDay === filters.timeOfDay;
      });
    }

    // Group by course, section, term, instructor, room, and time to collapse multi-day sessions into a single row
    const dayOrderMap = { M: 1, T: 2, W: 3, R: 4, F: 5 };
    const groupedMap = {};
    data.forEach(item => {
      if (!item) return;
      const key = `${item.Course}|${item.Section}|${item.Term}|${item.CRN}|${item.Instructor}|${item['Start Time']}|${item['End Time']}|${(item.Room||'')}`;
      if (!groupedMap[key]) {
        groupedMap[key] = { ...item, _daySet: new Set(item.Day ? [item.Day] : []), _originalIds: [item.id] };
      } else if (item.Day) {
        groupedMap[key]._daySet.add(item.Day);
        groupedMap[key]._originalIds.push(item.id);
      }
    });
    data = Object.values(groupedMap).map((entry, index) => {
      const dayPattern = Array.from(entry._daySet)
        .sort((a, b) => dayOrderMap[a] - dayOrderMap[b])
        .join('');
      const { _daySet, _originalIds, ...rest } = entry;
      // Generate unique ID for grouped entries to prevent duplicate key warnings
      const uniqueId = _originalIds.length > 1 ? `grouped_${index}_${_originalIds.join('_')}` : _originalIds[0];
      return { ...rest, Day: dayPattern, id: uniqueId };
    });

    // Sort data
    if (sortConfig.key) {
      data.sort((a, b) => {
        if (!a || !b) return 0;
        
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        // Handle null/undefined values
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return sortConfig.direction === 'ascending' ? 1 : -1;
        if (bValue == null) return sortConfig.direction === 'ascending' ? -1 : 1;
        
        // Special handling for time fields
        if (sortConfig.key === 'Start Time' || sortConfig.key === 'End Time') {
          aValue = parseTime(aValue) || 0;
          bValue = parseTime(bValue) || 0;
        }
        // Special handling for numeric fields
        else if (sortConfig.key === 'CRN' || sortConfig.key === 'Credits') {
          aValue = parseInt(aValue) || 0;
          bValue = parseInt(bValue) || 0;
        }
        // Special handling for day fields to sort by day order
        else if (sortConfig.key === 'Day') {
          const dayOrder = { M: 1, T: 2, W: 3, R: 4, F: 5 };
          aValue = dayOrder[aValue?.[0]] || 99;
          bValue = dayOrder[bValue?.[0]] || 99;
        }
        // Convert to string for comparison
        else {
          aValue = String(aValue).toLowerCase();
          bValue = String(bValue).toLowerCase();
        }
        
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
          }

    return data;
  }, [scheduleData, filters, sortConfig, facultyData]);

  const validateScheduleData = (data) => {
    const errors = [];
    
    if (!data.Course || data.Course.trim() === '') {
      errors.push('Course code is required');
    }
    
    const isOnline = data.isOnline === true || String(data.isOnline).toLowerCase() === 'true';
    const hasDay = data.Day && typeof data.Day === 'string' && /^([MTWRF]+)$/.test(data.Day);
    const hasTimes = Boolean(data['Start Time']) && Boolean(data['End Time']);
    const requiresMeetings = (!isOnline) || (isOnline && (String(data.onlineMode || '').toLowerCase() === 'synchronous'));
    if (requiresMeetings) {
      if (!hasDay) {
        errors.push('Valid day pattern is required (combination of M, T, W, R, F)');
      }
      if (!hasTimes) {
        errors.push('Start time and end time are required');
      }
    }
    
    const startTime = parseTime(data['Start Time']);
    const endTime = parseTime(data['End Time']);
    
    if (startTime && endTime && startTime >= endTime) {
      errors.push('End time must be after start time');
    }

    if (!data.Term || data.Term.trim() === '') {
      errors.push('Term is required');
    }

    if (!data.Section || data.Section.trim() === '') {
      errors.push('Section is required');
    }
    
    return errors;
  };

  // Event handlers
  const handleEditClick = (row) => {
    setEditingRowId(row.id);
    const metadata = computeCourseMetadata(row.Course || row.courseCode || '');
    setEditFormData({
      ...row,
      Credits: metadata.credits !== '' ? metadata.credits : (row.Credits ?? ''),
      Program: metadata.program || row.Program || '',
      program: metadata.program || row.program || '',
      subjectCode: metadata.program || row.subjectCode || '',
      catalogNumber: metadata.catalogNumber || row.catalogNumber || '',
      'Course Type': metadata.program || row['Course Type'] || ''
    });
  };

  const handleEditCancel = () => {
    setEditingRowId(null);
    setEditFormData({});
  };

  const handleEditSave = () => {
    const errors = validateScheduleData(editFormData);
    
    if (errors.length > 0) {
      // Replace blocking alert with inline banner
      setInlineError({ context: 'edit', messages: errors });
      return;
    }
    
    onDataUpdate(editFormData);
    setEditingRowId(null);
    setEditFormData({});
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => {
      if (name === 'Course') {
        const metadata = computeCourseMetadata(value);
        return {
          ...prev,
          Course: value,
          Credits: metadata.credits !== '' ? metadata.credits : (prev.Credits ?? ''),
          Program: metadata.program || prev.Program || '',
          program: metadata.program || prev.program || '',
          subjectCode: metadata.program || prev.subjectCode || '',
          catalogNumber: metadata.catalogNumber || prev.catalogNumber || '',
          'Course Type': metadata.program || prev['Course Type'] || ''
        };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSort = (key) => {
    setSortConfig(prev => {
      const newDirection = prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending';
      return {
        key,
        direction: newDirection
      };
    });
  };

  const handleShowContactCard = (facultyName) => {
    const faculty = facultyData.find(f => f.name === facultyName);
    if (faculty) {
      setSelectedFacultyForCard(faculty);
    }
  };

  const handleDeleteSchedule = (scheduleId) => {
    setInlineConfirm({
      isOpen: true,
      title: 'Delete Schedule Entry',
      message: 'Are you sure you want to delete this schedule entry? This action cannot be undone.',
      onConfirm: () => {
        if (onScheduleDelete) onScheduleDelete(scheduleId);
        setInlineConfirm({ isOpen: false });
      },
      onCancel: () => setInlineConfirm({ isOpen: false })
    });
  };

  const handleAddCourse = () => {
    const dayPattern = Array.isArray(newCourseData.Day) ? newCourseData.Day.join('') : newCourseData.Day;
    const validationData = { ...newCourseData, Day: dayPattern };
    const errors = validateScheduleData(validationData);
    if (errors.length > 0) {
      setInlineError({ context: 'add', messages: errors });
      return;
    }
    // Create new course with unique ID
    const { credits, program, catalogNumber } = computeCourseMetadata(newCourseData.Course || '');
    const courseWithId = {
      ...newCourseData,
      Day: dayPattern,
      // Persist Room as semicolon-separated string for compatibility
      Room: Array.isArray(newCourseData.Rooms) && newCourseData.Rooms.length > 0 ? newCourseData.Rooms.join('; ') : (newCourseData.Room || ''),
      id: `new_${Date.now()}`,
      CRN: newCourseData.CRN || '',
      Status: newCourseData.Status || 'Active',
      'Schedule Type': newCourseData['Schedule Type'] || 'Class Instruction',
      Credits: credits !== '' ? credits : '',
      Program: program,
      program,
      subjectCode: program,
      catalogNumber,
      'Course Type': program
    };
    onDataUpdate(courseWithId);
    setNewCourseData({});
    setShowAddCourseForm(false);
  };

  const handleNewCourseChange = (e) => {
    const { name, value } = e.target;
    setNewCourseData(prev => {
      if (name === 'Course') {
        const metadata = computeCourseMetadata(value);
        return {
          ...prev,
          Course: value,
          Credits: metadata.credits !== '' ? metadata.credits : '',
          Program: metadata.program,
          program: metadata.program,
          subjectCode: metadata.program,
          catalogNumber: metadata.catalogNumber,
          'Course Type': metadata.program
        };
      }
      return { ...prev, [name]: value };
    });
  };

  // Filter preset handlers
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

  const clearFilters = () => {
    const clearedFilters = {
      instructor: [], day: [], room: [], searchTerm: '',
      programs: { include: [], exclude: [] },
      sections: [], buildings: { include: [], exclude: [] },
      adjunct: 'all', tenured: 'all', credits: 'all', timeOfDay: 'all',
      scheduleType: 'all', status: 'all'
    };
    setFilters(clearedFilters);
    setActiveFilterPreset('');
  };

  // Export helpers
  const toggleExportField = (field) => {
    setSelectedExportFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const [inlineError, setInlineError] = useState(null);
  const [inlineConfirm, setInlineConfirm] = useState({ isOpen: false });

  const handleDownloadCSV = () => {
    if (selectedExportFields.length === 0) {
      setInlineError({ context: 'export', messages: ['Please select at least one field to export.'] });
      return;
    }
    const headers = selectedExportFields;
    const rows = filteredAndSortedData.map(row =>
      headers.map(h => {
        const val = row && row[h] !== undefined && row[h] !== null ? row[h] : '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `course-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    setExportModalOpen(false);
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.instructor.length > 0) count++;
    if (filters.day.length > 0) count++;
    if (filters.room.length > 0) count++;
    if (filters.programs.include.length > 0) count++;
    if (filters.programs.exclude.length > 0) count++;
    if (filters.sections.length > 0) count++;
    if (filters.buildings.include.length > 0) count++;
    if (filters.buildings.exclude.length > 0) count++;
    if (filters.adjunct !== 'all') count++;
    if (filters.tenured !== 'all') count++;
    if (filters.credits !== 'all') count++;
    if (filters.timeOfDay !== 'all') count++;
    if (filters.scheduleType !== 'all') count++;
    if (filters.status !== 'all') count++;
    if (filters.searchTerm) count++;
    return count;
  }, [filters]);

  const DataTableHeader = ({ columnKey, label }) => {
    const isSorted = sortConfig.key === columnKey;
    return (
      <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">
        <button className="flex items-center gap-1" onClick={() => handleSort(columnKey)}>
          {label}
          {isSorted ? (
            sortConfig.direction === 'ascending' ? '▲' : '▼'
          ) : (
            <ChevronsUpDown size={14} className="text-gray-400" />
          )}
        </button>
      </th>
    );
  };

  // Get course statistics
  const courseStats = useMemo(() => {
    const stats = {
      totalSessions: scheduleData.length,
      uniqueCourses: new Set(scheduleData.filter(s => s && s.Course).map(s => s.Course)).size,
      uniqueInstructors: new Set(scheduleData.filter(s => s && s.Instructor).map(s => s.Instructor)).size,
      adjunctTaughtSessions: scheduleData.filter(s => {
        if (!s || !s.Instructor || !facultyData) return false;
        const faculty = facultyData.find(f => f.name === s.Instructor);
        return faculty?.isAdjunct;
      }).length
    };
    
    // Calculate busiest day
    const dayCount = {};
    scheduleData.forEach(s => {
      if (s && s.Day) {
        dayCount[s.Day] = (dayCount[s.Day] || 0) + 1;
      }
    });
    
    const busiestDay = Object.entries(dayCount).reduce((max, [day, count]) => 
      count > max.count ? { day, count } : max, { day: '', count: 0 });
    
    stats.busiestDay = busiestDay;
    return stats;
  }, [scheduleData, facultyData]);

  return (
    <div className="space-y-6">
      {inlineError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm flex items-start">
          <X className="w-4 h-4 mr-2 mt-0.5" />
          <div>
            <div className="font-medium mb-1">There were validation issues</div>
            <ul className="list-disc list-inside">
              {inlineError.messages.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
          </div>
          <button className="ml-auto text-gray-500 hover:text-gray-700" onClick={() => setInlineError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {inlineConfirm.isOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{inlineConfirm.title}</h3>
            <p className="text-gray-700 mb-4">{inlineConfirm.message}</p>
            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 rounded bg-gray-100 text-gray-700" onClick={inlineConfirm.onCancel}>Cancel</button>
              <button className="px-4 py-2 rounded bg-red-600 text-white" onClick={inlineConfirm.onConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Course Management</h1>
        <p className="text-gray-600">View, edit, and manage course schedule information</p>
      </div>

      <ICSExportPanel
        availableTerms={availableSemesters}
        defaultTerm={selectedSemester}
        rooms={uniqueRooms}
        description="Export Outlook-compatible calendars for the selected term. Choose one room for an .ics file or multiple rooms for a ZIP archive."
        emptyMessage={uniqueRooms.length > 0 ? 'Use the filters to choose rooms to export.' : 'No rooms are available for the selected term.'}
        onDownloadComplete={handleICSDownloadComplete}
      />

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Sessions</div>
          <div className="text-2xl font-bold text-baylor-green">{courseStats.totalSessions}</div>
          <div className="text-xs text-gray-500">weekly class sessions</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Unique Courses</div>
          <div className="text-2xl font-bold text-baylor-green">{courseStats.uniqueCourses}</div>
          <div className="text-xs text-gray-500">different course offerings</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Active Instructors</div>
          <div className="text-2xl font-bold text-baylor-green">{courseStats.uniqueInstructors}</div>
          <div className="text-xs text-gray-500">faculty and staff</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Adjunct Taught</div>
          <div className="text-2xl font-bold text-baylor-green">{courseStats.adjunctTaughtSessions}</div>
          <div className="text-xs text-gray-500">sessions by adjuncts</div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Header with History Toggle and Add Course */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 border-b border-baylor-gold pb-4 gap-4">
          <div>
            <h2 className="text-xl font-serif font-semibold text-baylor-green">Course Schedule Data</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredAndSortedData.length} of {scheduleData.length} courses shown
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddCourseForm(!showAddCourseForm)}
              className="px-4 py-2 bg-baylor-green text-white font-bold rounded-lg hover:bg-baylor-green/90 transition-colors text-sm flex items-center"
            >
              <Plus size={16} className="mr-2" />
              Add Course
            </button>
            <button
              onClick={() => setHistoryVisible(!historyVisible)}
              className="px-4 py-2 bg-baylor-gold text-baylor-green font-bold rounded-lg hover:bg-baylor-gold/90 transition-colors text-sm flex items-center"
            >
              <History size={16} className="mr-2" />
              {historyVisible ? 'Hide' : 'Show'} History ({processedChanges.length})
            </button>
            <button
              onClick={() => setExportModalOpen(true)}
              className="px-4 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center"
            >
              <Download size={16} className="mr-2" />
              Export
            </button>
          </div>
        </div>

        {/* Add Course Form */}
        {showAddCourseForm && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <h3 className="text-lg font-serif font-semibold text-baylor-green mb-3">Add New Course</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course Code *</label>
                <input
                  name="Course"
                  value={newCourseData.Course || ''}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                  placeholder="e.g., ADM 3330"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course Title *</label>
                <input
                  name="Course Title"
                  value={newCourseData['Course Title'] || ''}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                  placeholder="Course title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CRN</label>
                <input
                  name="CRN"
                  value={newCourseData.CRN || ''}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                  placeholder="Course reference number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instructor *</label>
                <select
                  name="Instructor"
                  value={newCourseData.Instructor || ''}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                >
                  <option value="">Select Instructor</option>
                  <option value="Staff">Staff</option>
                  {sortedFaculty.map(faculty => (
                    <option key={faculty.id} value={faculty.originalName}>
                      {faculty.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                <select
                  name="Term"
                  value={newCourseData.Term || ''}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                >
                  <option value="">Select Term</option>
                  {uniqueTerms.map(term => (
                    <option key={term} value={term}>{term}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section *</label>
                <input
                  name="Section"
                  value={newCourseData.Section || ''}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                  placeholder="e.g., 01, 02"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Days *</label>
                <MultiSelectDropdown
                  options={Object.keys(dayNames)}
                  selected={newCourseData.Day || []}
                  onChange={(selected) => setNewCourseData(prev => ({ ...prev, Day: selected }))}
                  placeholder="Select days..."
                  displayMap={dayNames}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                <input
                  name="Start Time"
                  value={newCourseData['Start Time'] || ''}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                  placeholder="e.g., 9:00 AM"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                <input
                  name="End Time"
                  value={newCourseData['End Time'] || ''}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                  placeholder="e.g., 10:00 AM"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rooms</label>
                <MultiSelectDropdown
                  options={uniqueRooms}
                  selected={Array.isArray(newCourseData.Rooms) ? newCourseData.Rooms : []}
                  onChange={(selected) => setNewCourseData(prev => ({ ...prev, Rooms: selected }))}
                  placeholder="Select one or more rooms..."
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium text-gray-700">Online</label>
                <input
                  type="checkbox"
                  name="isOnline"
                  checked={Boolean(newCourseData.isOnline)}
                  onChange={(e) => setNewCourseData(prev => ({ ...prev, isOnline: e.target.checked }))}
                  className="h-4 w-4 text-baylor-green focus:ring-baylor-green border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Online Mode</label>
                <select
                  name="onlineMode"
                  value={newCourseData.onlineMode || ''}
                  onChange={handleNewCourseChange}
                  disabled={!newCourseData.isOnline}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                >
                  <option value="">Not set</option>
                  <option value="synchronous">Synchronous</option>
                  <option value="asynchronous">Asynchronous</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credits</label>
                <div className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                  {computedNewCourseCredits !== '' ? computedNewCourseCredits : '—'}
                </div>
                <p className="text-xs text-gray-500 mt-1">Auto-calculated from catalog number</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Type</label>
                <select
                  name="Schedule Type"
                  value={newCourseData['Schedule Type'] || 'Class Instruction'}
                  onChange={handleNewCourseChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
                >
                  <option value="Class Instruction">Class Instruction</option>
                  <option value="Lab">Lab</option>
                  <option value="Studio">Studio</option>
                  <option value="Seminar">Seminar</option>
                  <option value="Independent Study">Independent Study</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddCourse}
                className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 flex items-center"
              >
                <Save size={16} className="mr-2" />
                Add Course
              </button>
              <button
                onClick={() => {
                  setShowAddCourseForm(false);
                  setNewCourseData({});
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 flex items-center"
              >
                <X size={16} className="mr-2" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filters Section */}
        <div className="p-4 mb-6 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif font-semibold text-baylor-green flex items-center">
              <Filter size={16} className="mr-2" />
              Filters & Search
              {activeFilterCount > 0 && (
                <span className="ml-2 px-2 py-1 bg-baylor-green text-white text-xs rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </h3>
            <div className="flex items-center space-x-2">
              {/* Filter Presets */}
              <select
                value={activeFilterPreset}
                onChange={(e) => applyFilterPreset(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
              >
                <option value="">Quick filters...</option>
                {Object.entries(filterPresets).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.name}</option>
                ))}
              </select>
              
              {/* Advanced Filters Toggle */}
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`flex items-center px-3 py-2 border rounded-lg transition-colors ${
                  showAdvancedFilters ? 'bg-baylor-green text-white border-baylor-green' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Settings className="w-4 h-4 mr-2" />
                Advanced
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Clear Filters */}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Basic Filters - Always Visible */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="relative">
              <input
                type="text"
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-white text-gray-900"
                placeholder="Search courses, instructors, rooms..."
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            </div>
            <MultiSelectDropdown
              options={uniqueInstructors}
              selected={filters.instructor}
              onChange={(selected) => setFilters({ ...filters, instructor: selected })}
              placeholder="Filter by Instructor..."
            />
            <MultiSelectDropdown
              options={Object.keys(dayNames)}
              selected={filters.day}
              onChange={(selected) => setFilters({ ...filters, day: selected })}
              placeholder="Filter by Day..."
              displayMap={dayNames}
            />
            <MultiSelectDropdown
              options={uniqueRooms}
              selected={filters.room}
              onChange={(selected) => setFilters({ ...filters, room: selected })}
              placeholder="Filter by Room..."
            />
          </div>

          {/* Advanced Filters - Collapsible */}
          {showAdvancedFilters && (
            <div className="pt-4 border-t border-gray-200 space-y-6">
              {/* Program Filters */}
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

              {/* Sections */}
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sections
                  </label>
                  <MultiSelectDropdown
                    options={uniqueSections}
                    selected={filters.sections}
                    onChange={(selected) => setFilters(prev => ({ ...prev, sections: selected }))}
                    placeholder="Select sections..."
                  />
                </div>
              </div>

              {/* Buildings */}
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

              {/* Faculty and Course Attributes */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adjunct Status
                  </label>
                  <select
                    value={filters.adjunct}
                    onChange={(e) => setFilters(prev => ({ ...prev, adjunct: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All Faculty</option>
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
                    <option value="all">All Faculty</option>
                    <option value="include">Tenured Only</option>
                    <option value="exclude">Exclude Tenured</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Credit Hours
                  </label>
                  <select
                    value={filters.credits}
                    onChange={(e) => setFilters(prev => ({ ...prev, credits: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All Credits</option>
                    <option value="1">1 Credit</option>
                    <option value="2">2 Credits</option>
                    <option value="3">3 Credits</option>
                    <option value="4+">4+ Credits</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time of Day
                  </label>
                  <select
                    value={filters.timeOfDay}
                    onChange={(e) => setFilters(prev => ({ ...prev, timeOfDay: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All Times</option>
                    <option value="morning">Morning (Before 12pm)</option>
                    <option value="afternoon">Afternoon (12pm-5pm)</option>
                    <option value="evening">Evening (After 5pm)</option>
                  </select>
                </div>
              </div>

              {/* Schedule Type and Status Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Schedule Type
                  </label>
                  <select
                    value={filters.scheduleType}
                    onChange={(e) => setFilters(prev => ({ ...prev, scheduleType: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All Schedule Types</option>
                    {uniqueScheduleTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  >
                    <option value="all">All Statuses</option>
                    {uniqueStatuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Filter Summary */}
          {activeFilterCount > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{filteredAndSortedData.length}</span> of <span className="font-medium">{scheduleData.length}</span> courses shown
                {activeFilterCount > 0 && (
                  <span className="ml-2">• {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Change History */}
        {historyVisible && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-lg font-serif font-semibold text-baylor-green mb-3">Change History</h3>
            {processedChanges.length > 0 ? (
              <ul className="space-y-3 max-h-96 overflow-y-auto">
                {processedChanges.slice(0, 50).map((change, index) => (
                  <li
                    key={index}
                    className={`p-3 rounded-lg flex items-center justify-between text-sm ${
                      change.isRevert ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'
                    } border`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">
                        {change.displayAction || change.action}: {change.entity || 'Unknown'}
                      </p>
                      {change.instructor && change.course && (
                        <p className="text-gray-600">
                          <button
                            className="font-bold hover:underline"
                            onClick={() => handleShowContactCard(change.instructor)}
                          >
                            {change.instructor}
                          </button>
                          's <span className="font-bold">{change.course}</span> entry.
                        </p>
                      )}
                      {change.field && (change.oldValue || change.newValue) && (
                        <p className="text-gray-600">
                          Field <span className="font-semibold">{change.field}</span> changed from "{change.oldValue}" to "{change.newValue}".
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {change.timeAgo || new Date(change.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!change.isRevert && (
                      <button
                        onClick={() => onRevertChange(change, index)}
                        className="p-2 rounded-full text-gray-600 hover:bg-gray-200 transition-colors"
                        title="Revert this change"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No changes have been made yet.</p>
            )}
          </div>
        )}

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table key={`table-${filteredAndSortedData.length}-${JSON.stringify(sortConfig)}`} className="w-full text-sm">
            <thead className="bg-baylor-green/5">
              <tr>
                <DataTableHeader columnKey="Instructor" label="Instructor" />
                <DataTableHeader columnKey="Course" label="Course" />
                <DataTableHeader columnKey="Course Title" label="Course Title" />
                <DataTableHeader columnKey="CRN" label="CRN" />
                <DataTableHeader columnKey="Term" label="Term" />
                <DataTableHeader columnKey="Section" label="Section" />
                <DataTableHeader columnKey="Day" label="Day" />
                <DataTableHeader columnKey="Start Time" label="Start Time" />
                <DataTableHeader columnKey="End Time" label="End Time" />
                <DataTableHeader columnKey="Room" label="Room" />
                <DataTableHeader columnKey="Credits" label="Credits" />
                <DataTableHeader columnKey="Schedule Type" label="Schedule Type" />
                <DataTableHeader columnKey="Status" label="Status" />
                <DataTableHeader columnKey="isOnline" label="Online" />
                <DataTableHeader columnKey="onlineMode" label="Online Mode" />
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAndSortedData.length > 0 ? (
                filteredAndSortedData.map(row => (
                  <tr key={`${row.id}|${row.CRN||''}|${row.Term||''}|${row.Section||''}`} className="hover:bg-gray-50">
                    {editingRowId === row.id ? (
                      <>
                        <td className="p-1">
                          <select
                            name="Instructor"
                            value={editFormData.Instructor || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                          >
                            <option value="">Select Instructor</option>
                            <option value="Staff">Staff</option>
                            {sortedFaculty.map(faculty => (
                              <option key={faculty.id} value={faculty.originalName}>
                                {faculty.displayName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            name="Course"
                            value={editFormData.Course || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="Course Code"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Course Title"
                            value={editFormData['Course Title'] || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="Course Title"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="CRN"
                            value={editFormData.CRN || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="CRN"
                          />
                        </td>
                        <td className="p-1">
                          <select
                            name="Term"
                            value={editFormData.Term || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                          >
                            <option value="">Select Term</option>
                            {uniqueTerms.map(term => (
                              <option key={term} value={term}>{term}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            name="Section"
                            value={editFormData.Section || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="Section"
                          />
                        </td>
                        <td className="p-1">
                          <MultiSelectDropdown
                            options={Object.keys(dayNames)}
                            selected={editFormData.Day ? editFormData.Day.split('') : []}
                            onChange={(selected) => setEditFormData(prev => ({ ...prev, Day: selected.join('') }))}
                            placeholder="Days..."
                            displayMap={dayNames}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="Start Time"
                            value={editFormData['Start Time'] || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="e.g., 9:00 AM"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            name="End Time"
                            value={editFormData['End Time'] || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                            placeholder="e.g., 10:00 AM"
                          />
                        </td>
                        <td className="p-1">
                          <MultiSelectDropdown
                            options={uniqueRooms}
                            selected={(editFormData.Room || '').split(';').map(s => s.trim()).filter(Boolean)}
                            onChange={(selected) => setEditFormData(prev => ({ ...prev, Room: selected.join('; ') }))}
                            placeholder="Select room(s)..."
                          />
                        </td>
                        <td className="p-1">
                          <div className="w-full p-1 border border-baylor-gold rounded bg-gray-50 text-sm text-gray-700">
                            {(() => {
                              const metadata = computeCourseMetadata(editFormData.Course || row.Course);
                              return metadata.credits !== '' ? metadata.credits : '—';
                            })()}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Auto-calculated</p>
                        </td>
                        <td className="p-1">
                          <select
                            name="Schedule Type"
                            value={editFormData['Schedule Type'] || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                          >
                            <option value="">Select Schedule Type</option>
                            {uniqueScheduleTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <select
                            name="Status"
                            value={editFormData.Status || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                          >
                            <option value="">Select Status</option>
                            {uniqueStatuses.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="isOnline"
                              checked={Boolean(editFormData.isOnline)}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, isOnline: e.target.checked }))}
                              className="h-4 w-4 text-baylor-green focus:ring-baylor-green border-gray-300 rounded"
                            />
                            Online
                          </label>
                        </td>
                        <td className="p-1">
                          <select
                            name="onlineMode"
                            value={editFormData.onlineMode || ''}
                            onChange={handleEditFormChange}
                            disabled={!editFormData.isOnline}
                            className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10 focus:ring-baylor-green focus:border-baylor-green text-sm"
                          >
                            <option value="">Not set</option>
                            <option value="synchronous">Synchronous</option>
                            <option value="asynchronous">Asynchronous</option>
                          </select>
                        </td>
                        <td className="p-1 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={handleEditSave}
                              className="p-2 text-green-600 hover:bg-green-100 rounded-full"
                              title="Save changes"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={handleEditCancel}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                              title="Cancel editing"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-gray-700">
                          <button
                            className="hover:underline text-left"
                            onClick={() => handleShowContactCard(row.Instructor)}
                          >
                            {row.Instructor}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{row.Course}</td>
                        <td className="px-4 py-3 text-gray-700">{row['Course Title']}</td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{row.CRN}</td>
                        <td className="px-4 py-3 text-gray-700">{row.Term}</td>
                        <td className="px-4 py-3 text-gray-700">{row.Section}</td>
                        <td className="px-4 py-3 text-gray-700 text-center">
                          {row.isOnline ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium border border-blue-200">
                              Online
                            </span>
                            ) : !row['Start Time'] || !row['End Time'] ? (
                              <span className="px-1.5 py-0.5 bg-gray-25 text-gray-400 rounded text-xs border border-gray-100">
                                No Meeting Time
                              </span>
                          ) : (
                            <span className="px-2 py-1 bg-baylor-green/10 text-baylor-green rounded text-xs font-medium">
                              {row.Day}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{row['Start Time']}</td>
                        <td className="px-4 py-3 text-gray-700">{row['End Time']}</td>
                        <td className="px-4 py-3 text-gray-700">{row.Room}</td>
                        <td className="px-4 py-3 text-gray-700">{row.Credits}</td>
                        <td className="px-4 py-3 text-gray-700">{row['Schedule Type']}</td>
                        <td className="px-4 py-3 text-gray-700">{row.Status}</td>
                        <td className="px-4 py-3 text-gray-700">{row.isOnline ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-3 text-gray-700">{row.onlineMode ? (row.onlineMode.charAt(0).toUpperCase() + row.onlineMode.slice(1)) : '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => handleEditClick(row)}
                              className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"
                              title="Edit this record"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteSchedule(row._originalId || row.id)}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                              title="Delete this record"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="15" className="px-4 py-8 text-center text-gray-500">
                    {scheduleData.length === 0 ? (
                      <div>
                        <p className="text-lg mb-2">No course data available</p>
                        <p className="text-sm">Import schedule data to get started</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-lg mb-2">No courses match your filters</p>
                        <p className="text-sm">Try adjusting your search criteria</p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Faculty Contact Card Modal */}
      {/* Export Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-serif font-semibold text-baylor-green mb-4">Export Courses</h3>
            <p className="text-sm text-gray-600 mb-4">Select the fields to include in your export.</p>
            <div className="max-h-60 overflow-y-auto grid grid-cols-2 gap-2">
              {availableExportFields.map(field => (
                <label key={field} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedExportFields.includes(field)}
                    onChange={() => toggleExportField(field)}
                    className="h-4 w-4 text-baylor-green focus:ring-baylor-green border-gray-300 rounded"
                  />
                  <span className="text-sm">{field}</span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-between items-center">
              <div className="space-x-2">
                <button
                  onClick={() => setSelectedExportFields(availableExportFields)}
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedExportFields([])}
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                >
                  Clear All
                </button>
              </div>
              <div className="space-x-2">
                <button
                  onClick={handleDownloadCSV}
                  className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 text-sm flex items-center"
                >
                  <Download size={16} className="mr-2" />
                  Download CSV
                </button>
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedFacultyForCard && (
        <FacultyContactCard
          faculty={selectedFacultyForCard}
          onClose={() => setSelectedFacultyForCard(null)}
        />
      )}
    </div>
  );
};

export default CourseManagement;
