import React, { useState, useMemo } from 'react';
import { Edit, Save, X, GraduationCap, Mail, Phone, PhoneOff, Clock, Search, ArrowUpDown, Plus, RotateCcw, History, Trash2, Filter, Download, BarChart3, DollarSign } from 'lucide-react';
import MultiSelectDropdown from './MultiSelectDropdown';
import FacultyContactCard from './FacultyContactCard';

const parseHourlyRate = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isFinite(parsed) ? parsed : 0;
};

const calculateEntryMinutes = (entry) => {
  if (!entry || !entry.start || !entry.end) return 0;
  const parseTime = (timeStr) => {
    if (typeof timeStr !== 'string') return null;
    const [hourStr, minuteStr = '0'] = timeStr.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return hour * 60 + minute;
  };

  const startMinutes = parseTime(entry.start);
  const endMinutes = parseTime(entry.end);
  if (startMinutes === null || endMinutes === null) return 0;
  const diff = endMinutes - startMinutes;
  return diff > 0 ? diff : 0;
};

const calculateWeeklyHoursFromSchedule = (schedule) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 0;
  const totalMinutes = schedule.reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
  return totalMinutes / 60;
};

const WEEKDAY_OPTIONS = [
  { value: 'M', label: 'Mon' },
  { value: 'T', label: 'Tue' },
  { value: 'W', label: 'Wed' },
  { value: 'R', label: 'Thu' },
  { value: 'F', label: 'Fri' },
  { value: 'S', label: 'Sat' },
  { value: 'U', label: 'Sun' },
];

const createEmptyAssignment = () => ({
  jobTitle: '',
  supervisor: '',
  hourlyRate: '',
  location: [],
  weeklySchedule: [],
  startDate: '',
  endDate: ''
});

const createEmptyStudentDraft = () => ({
  name: '',
  email: '',
  phone: '',
  hasNoPhone: false,
  startDate: '',
  endDate: '',
  isActive: true,
  primaryBuildings: [],
  weeklySchedule: [],
  jobs: [createEmptyAssignment()]
});

const trimValue = (value) => (typeof value === 'string' ? value.trim() : value);

const sanitizeWeeklyEntries = (entries) => {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      day: entry?.day || '',
      start: entry?.start || '',
      end: entry?.end || ''
    }))
    .filter((entry) => entry.day && entry.start && entry.end && entry.start < entry.end);
};

const prepareStudentPayload = (student) => {
  if (!student) return {};

  const jobsArray = Array.isArray(student.jobs) ? student.jobs : [];
  const normalizedJobs = jobsArray
    .map((job) => {
      if (!job) return createEmptyAssignment();
      const rawLocations = Array.isArray(job.location)
        ? job.location
        : (job.location ? [job.location] : []);
      const locations = Array.from(new Set(rawLocations.map((loc) => trimValue(loc)).filter(Boolean)));
      return {
        jobTitle: trimValue(job.jobTitle || ''),
        supervisor: trimValue(job.supervisor || ''),
        hourlyRate: trimValue(job.hourlyRate || ''),
        location: locations,
        weeklySchedule: sanitizeWeeklyEntries(job.weeklySchedule)
      };
    })
    .filter((job) =>
      job.jobTitle ||
      job.supervisor ||
      job.hourlyRate ||
      (Array.isArray(job.location) && job.location.length > 0) ||
      (Array.isArray(job.weeklySchedule) && job.weeklySchedule.length > 0)
    );

  const aggregatedWeeklySchedule = normalizedJobs.flatMap((job) => job.weeklySchedule);
  const aggregatedBuildings = Array.from(new Set(normalizedJobs.flatMap((job) => job.location)));
  const fallbackBuildings = Array.isArray(student.primaryBuildings)
    ? student.primaryBuildings.map((b) => trimValue(b)).filter(Boolean)
    : (student.primaryBuilding ? [trimValue(student.primaryBuilding)] : []);
  const fallbackWeekly = sanitizeWeeklyEntries(student.weeklySchedule);

  const primaryJob = normalizedJobs[0] || {};

  return {
    ...student,
    name: trimValue(student.name || ''),
    email: trimValue(student.email || ''),
    phone: student.hasNoPhone ? '' : trimValue(student.phone || ''),
    jobs: normalizedJobs,
    weeklySchedule: aggregatedWeeklySchedule.length > 0 ? aggregatedWeeklySchedule : fallbackWeekly,
    primaryBuildings: aggregatedBuildings.length > 0 ? aggregatedBuildings : fallbackBuildings,
    jobTitle: primaryJob.jobTitle || trimValue(student.jobTitle || ''),
    supervisor: primaryJob.supervisor || trimValue(student.supervisor || ''),
    hourlyRate: primaryJob.hourlyRate || trimValue(student.hourlyRate || ''),
  };
};

const getStudentAssignments = (student) => {
  if (!student) return [];

  const fallbackSchedule = Array.isArray(student.weeklySchedule) ? student.weeklySchedule : [];
  const fallbackBuildings = Array.isArray(student.primaryBuildings)
    ? student.primaryBuildings.filter(Boolean)
    : (student.primaryBuilding ? [student.primaryBuilding] : []);

  const jobs = Array.isArray(student.jobs) && student.jobs.length > 0
    ? student.jobs
    : [{
        jobTitle: student.jobTitle || '',
        supervisor: student.supervisor || '',
        hourlyRate: student.hourlyRate,
        location: fallbackBuildings,
        weeklySchedule: fallbackSchedule
      }];

  return jobs.map((job, index) => {
    const schedule = Array.isArray(job.weeklySchedule) && job.weeklySchedule.length > 0
      ? job.weeklySchedule
      : fallbackSchedule;

    const buildings = Array.isArray(job.location)
      ? job.location.filter(Boolean)
      : (job.location ? [job.location] : fallbackBuildings);

    const hourlyRateNumber = parseHourlyRate(job.hourlyRate ?? student.hourlyRate);
    const weeklyHours = calculateWeeklyHoursFromSchedule(schedule);
    const weeklyPay = hourlyRateNumber * weeklyHours;

    return {
      ...job,
      jobTitle: job.jobTitle || student.jobTitle || `Assignment ${index + 1}`,
      supervisor: job.supervisor || student.supervisor || '',
      schedule,
      buildings,
      hourlyRateNumber,
      hourlyRateDisplay: hourlyRateNumber ? `$${hourlyRateNumber.toFixed(2)}` : (job.hourlyRate || student.hourlyRate || ''),
      weeklyHours,
      weeklyPay,
    };
  });
};

const getStudentTotalWeeklyHours = (student) => {
  return getStudentAssignments(student).reduce((sum, assignment) => sum + assignment.weeklyHours, 0);
};

const toComparableValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value)) return value.join(' ').toLowerCase();
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value).toLowerCase();
};

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

const StudentDirectory = ({ studentData, rawScheduleData, onStudentUpdate, onStudentDelete, showNotification }) => {
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [nameSort, setNameSort] = useState('firstName'); // 'firstName' or 'lastName'
  const [selectedStudentForCard, setSelectedStudentForCard] = useState(null);
  const [errors, setErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [newStudent, setNewStudent] = useState(createEmptyStudentDraft);
  const [assignmentDrafts, setAssignmentDrafts] = useState([{ day: 'M', start: '', end: '' }]);
  const [assignmentBuildingDrafts, setAssignmentBuildingDrafts] = useState(['']);

  const assignmentBuildingOptions = useMemo(() => {
    const existingSelections = (newStudent.jobs || []).flatMap((job) =>
      Array.isArray(job.location) ? job.location.filter(Boolean) : []
    );
    return Array.from(new Set([...(availableBuildings || []), ...existingSelections]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [availableBuildings, newStudent.jobs]);

  const updateAssignmentField = (index, field, value) => {
    setNewStudent((prev) => ({
      ...prev,
      jobs: prev.jobs.map((job, jobIndex) =>
        jobIndex === index ? { ...job, [field]: value } : job
      )
    }));
    if (field === 'jobTitle') {
      setErrors((prev) => ({ ...prev, assignments: undefined }));
    }
  };

  const updateAssignmentLocations = (index, locations) => {
    setNewStudent((prev) => {
      const nextJobs = prev.jobs.map((job, jobIndex) =>
        jobIndex === index ? { ...job, location: locations } : job
      );
      return {
        ...prev,
        jobs: nextJobs,
        primaryBuildings: deriveBuildingsFromJobs(nextJobs)
      };
    });
  };

  const updateAssignmentDraft = (index, updates) => {
    setAssignmentDrafts((prev) =>
      prev.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...updates } : draft
      )
    );
  };

  const updateCustomLocationDraft = (index, value) => {
    setAssignmentBuildingDrafts((prev) =>
      prev.map((draft, draftIndex) => (draftIndex === index ? value : draft))
    );
  };

  const addCustomLocation = (index) => {
    const value = (assignmentBuildingDrafts[index] || '').trim();
    if (!value) return;
    setAssignmentBuildingDrafts((prev) =>
      prev.map((draft, draftIndex) => (draftIndex === index ? '' : draft))
    );
    setNewStudent((prev) => {
      const nextJobs = prev.jobs.map((job, jobIndex) => {
        if (jobIndex !== index) return job;
        const existing = Array.isArray(job.location) ? job.location : [];
        return {
          ...job,
          location: Array.from(new Set([...existing.filter(Boolean), value]))
        };
      });
      return {
        ...prev,
        jobs: nextJobs,
        primaryBuildings: deriveBuildingsFromJobs(nextJobs)
      };
    });
  };

  const addScheduleEntryToAssignment = (index) => {
    const draft = assignmentDrafts[index] || { day: 'M', start: '', end: '' };
    if (!draft.day || !draft.start || !draft.end) {
      setErrors((prev) => ({
        ...prev,
        weeklySchedule: 'Provide a day, start time, and end time before adding.'
      }));
      return;
    }
    if (draft.start >= draft.end) {
      setErrors((prev) => ({
        ...prev,
        weeklySchedule: 'End time must be after start time.'
      }));
      return;
    }
    setNewStudent((prev) => ({
      ...prev,
      jobs: prev.jobs.map((job, jobIndex) =>
        jobIndex === index
          ? {
              ...job,
              weeklySchedule: [
                ...(Array.isArray(job.weeklySchedule) ? job.weeklySchedule : []),
                { day: draft.day, start: draft.start, end: draft.end }
              ]
            }
          : job
      )
    }));
    setAssignmentDrafts((prev) =>
      prev.map((item, draftIndex) =>
        draftIndex === index ? { day: draft.day, start: '', end: '' } : item
      )
    );
    setErrors((prev) => ({ ...prev, weeklySchedule: undefined }));
  };

  const removeScheduleEntryFromAssignment = (assignmentIndex, entryIndex) => {
    setNewStudent((prev) => ({
      ...prev,
      jobs: prev.jobs.map((job, jobIndex) =>
        jobIndex === assignmentIndex
          ? {
              ...job,
              weeklySchedule: (job.weeklySchedule || []).filter((_, i) => i !== entryIndex)
            }
          : job
      )
    }));
  };

  const addAssignment = () => {
    setNewStudent((prev) => ({
      ...prev,
      jobs: [...prev.jobs, createEmptyAssignment()]
    }));
    setAssignmentDrafts((prev) => [...prev, { day: 'M', start: '', end: '' }]);
    setAssignmentBuildingDrafts((prev) => [...prev, '']);
    setErrors((prev) => ({ ...prev, assignments: undefined }));
  };

  const removeAssignment = (index) => {
    setNewStudent((prev) => {
      const nextJobs = prev.jobs.filter((_, jobIndex) => jobIndex !== index);
      return {
        ...prev,
        jobs: nextJobs,
        primaryBuildings: deriveBuildingsFromJobs(nextJobs)
      };
    });
    setAssignmentDrafts((prev) => prev.filter((_, draftIndex) => draftIndex !== index));
    setAssignmentBuildingDrafts((prev) => prev.filter((_, draftIndex) => draftIndex !== index));
  };

  const assignmentBuildingsPreview = useMemo(
    () => deriveBuildingsFromJobs(newStudent.jobs),
    [newStudent.jobs]
  );

  // Undo functionality
  const [changeHistory, setChangeHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    departments: { include: [], exclude: [] },
    supervisors: { include: [], exclude: [] },
    jobTitles: [],
    buildings: [],
    hasEmail: true,
    hasPhone: true,
    activeOnly: true,
    includeEnded: false
  });
  const [metricsFilters, setMetricsFilters] = useState({ jobTitles: [], buildings: [] });

  // Extract departments and supervisors for filtering
  const availableJobTitles = useMemo(() => {
    const set = new Set();
    studentData.forEach(student => {
      // include top-level for legacy
      if (student.jobTitle) set.add(student.jobTitle);
      // include each job title
      if (Array.isArray(student.jobs)) {
        student.jobs.forEach(j => { if (j?.jobTitle) set.add(j.jobTitle); });
      }
    });
    return Array.from(set).sort();
  }, [studentData]);

  const availableSupervisors = useMemo(() => {
    const supervisors = new Set();
    studentData.forEach(student => {
      if (student.supervisor) supervisors.add(student.supervisor);
    });
    return Array.from(supervisors).sort();
  }, [studentData]);

  const availableBuildings = useMemo(() => {
    const buildings = new Set();
    (studentData || []).forEach(student => {
      if (Array.isArray(student.primaryBuildings)) {
        student.primaryBuildings.forEach(b => { if (b) buildings.add(b); });
      } else if (student.primaryBuilding) {
        buildings.add(student.primaryBuilding);
      }
      if (Array.isArray(student.jobs)) {
        student.jobs.forEach(j => {
          if (Array.isArray(j.location)) {
            j.location.forEach(b => { if (b) buildings.add(b); });
          } else if (j.location) {
            buildings.add(j.location);
          }
        });
      }
    });
    return Array.from(buildings).sort();
  }, [studentData]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = studentData.filter(student => {
      if (!student) return false;

      // Text filter
      if (filterText) {
        const searchText = filterText.toLowerCase();
        const matchesText = (
          student.name?.toLowerCase().includes(searchText) ||
          student.email?.toLowerCase().includes(searchText) ||
          student.supervisor?.toLowerCase().includes(searchText) ||
          student.jobTitle?.toLowerCase().includes(searchText) ||
          (Array.isArray(student.jobs) && student.jobs.some(j => (j?.jobTitle || '').toLowerCase().includes(searchText) || (j?.supervisor || '').toLowerCase().includes(searchText)))
        );
        if (!matchesText) return false;
      }

      // Status filters: activeOnly and includeEnded
      if (filters.activeOnly) {
        const now = new Date();
        const endStr = student.endDate || (Array.isArray(student.jobs) && student.jobs[0]?.endDate) || '';
        const ended = (() => {
          if (!endStr) return false;
          const end = new Date(`${endStr}T23:59:59`);
          return !isNaN(end.getTime()) && end < now;
        })();
        const inactive = student.isActive === false;
        if ((inactive || ended) && !filters.includeEnded) return false;
      }

      // Job Titles filter (include-only across top-level and job entries)
      if ((filters.jobTitles || []).length > 0) {
        const titlesSet = new Set();
        if (student.jobTitle) titlesSet.add(student.jobTitle);
        if (Array.isArray(student.jobs)) {
          student.jobs.forEach(j => { if (j?.jobTitle) titlesSet.add(j.jobTitle); });
        }
        const titles = Array.from(titlesSet);
        if (!titles.some(t => filters.jobTitles.includes(t))) return false;
      }

      // Buildings filter (include-only across primaryBuildings/primaryBuilding and job locations)
      if ((filters.buildings || []).length > 0) {
        const bldgSet = new Set();
        if (Array.isArray(student.primaryBuildings)) {
          student.primaryBuildings.forEach(b => { if (b) bldgSet.add(b); });
        } else if (student.primaryBuilding) {
          bldgSet.add(student.primaryBuilding);
        }
        if (Array.isArray(student.jobs)) {
          student.jobs.forEach(j => {
            if (Array.isArray(j.location)) j.location.forEach(b => { if (b) bldgSet.add(b); });
            else if (j.location) bldgSet.add(j.location);
          });
        }
        const studentBuildings = Array.from(bldgSet);
        if (!studentBuildings.some(b => filters.buildings.includes(b))) return false;
      }

      return true;
    });

    // Sort data
    return filtered.sort((a, b) => {
      if (sortConfig.key === 'weeklyHours') {
        const aHours = getStudentTotalWeeklyHours(a);
        const bHours = getStudentTotalWeeklyHours(b);
        const diff = aHours - bHours;
        if (diff !== 0) {
          return sortConfig.direction === 'ascending' ? diff : -diff;
        }
      }

      let aValue;
      let bValue;

      switch (sortConfig.key) {
        case 'name':
          if (nameSort === 'firstName') {
            aValue = a.firstName || a.name?.split(' ')[0] || '';
            bValue = b.firstName || b.name?.split(' ')[0] || '';
          } else {
            aValue = a.lastName || a.name?.split(' ').slice(-1)[0] || '';
            bValue = b.lastName || b.name?.split(' ').slice(-1)[0] || '';
          }
          break;
        case 'email':
          aValue = a.email || '';
          bValue = b.email || '';
          break;
        case 'jobTitle':
          aValue = a.jobTitle || '';
          bValue = b.jobTitle || '';
          break;
        case 'supervisor':
          aValue = a.supervisor || '';
          bValue = b.supervisor || '';
          break;
        default:
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
      }

      const normalizedA = toComparableValue(aValue);
      const normalizedB = toComparableValue(bValue);

      if (typeof normalizedA === 'number' && typeof normalizedB === 'number') {
        const diff = normalizedA - normalizedB;
        if (diff === 0) return 0;
        return sortConfig.direction === 'ascending' ? diff : -diff;
      }

      const comparison = normalizedA.toString().localeCompare(normalizedB.toString());
      return sortConfig.direction === 'ascending' ? comparison : -comparison;
    });
  }, [studentData, filterText, sortConfig, nameSort, filters]);

  const filteredAssignments = useMemo(() => {
    return filteredAndSortedData.flatMap(student =>
      getStudentAssignments(student).map(assignment => ({
        ...assignment,
        student,
      }))
    );
  }, [filteredAndSortedData]);

  const metricsAssignments = useMemo(() => {
    return filteredAssignments.filter(assignment => {
      if ((metricsFilters.jobTitles || []).length > 0 && assignment.jobTitle) {
        if (!metricsFilters.jobTitles.includes(assignment.jobTitle)) {
          return false;
        }
      } else if ((metricsFilters.jobTitles || []).length > 0 && !assignment.jobTitle) {
        return false;
      }

      if ((metricsFilters.buildings || []).length > 0) {
        const assignmentBuildings = (assignment.buildings || []).length > 0
          ? assignment.buildings
          : (assignment.student?.primaryBuildings || assignment.student?.primaryBuilding
              ? Array.isArray(assignment.student?.primaryBuildings)
                ? assignment.student.primaryBuildings
                : [assignment.student.primaryBuilding]
              : []);

        if (!assignmentBuildings.some(b => metricsFilters.buildings.includes(b))) {
          return false;
        }
      }

      return true;
    });
  }, [filteredAssignments, metricsFilters]);

  const metricsTotals = useMemo(() => {
    const totalHours = metricsAssignments.reduce((sum, assignment) => sum + assignment.weeklyHours, 0);
    const totalPay = metricsAssignments.reduce((sum, assignment) => sum + assignment.weeklyPay, 0);
    const studentCount = new Set(metricsAssignments.map(a => a.student?.id || a.student?.email || a.student?.name)).size;
    const avgRate = totalHours > 0 ? totalPay / totalHours : 0;
    return { totalHours, totalPay, studentCount, avgRate };
  }, [metricsAssignments]);

  const jobTitleBreakdown = useMemo(() => {
    const map = new Map();
    metricsAssignments.forEach(assignment => {
      const key = assignment.jobTitle || 'Unassigned';
      const existing = map.get(key) || { hours: 0, pay: 0 };
      existing.hours += assignment.weeklyHours;
      existing.pay += assignment.weeklyPay;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.hours - a.hours);
  }, [metricsAssignments]);

  const buildingBreakdown = useMemo(() => {
    const map = new Map();
    metricsAssignments.forEach(assignment => {
      const buildings = (assignment.buildings && assignment.buildings.length > 0)
        ? assignment.buildings
        : (assignment.student?.primaryBuildings && assignment.student.primaryBuildings.length > 0
            ? assignment.student.primaryBuildings
            : assignment.student?.primaryBuilding
              ? [assignment.student.primaryBuilding]
              : ['Unassigned']);

      buildings.forEach(building => {
        const key = building || 'Unassigned';
        const existing = map.get(key) || { hours: 0, pay: 0 };
        existing.hours += assignment.weeklyHours;
        existing.pay += assignment.weeklyPay;
        map.set(key, existing);
      });
    });

    return Array.from(map.entries())
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.hours - a.hours);
  }, [metricsAssignments]);

  const formatCurrency = (value) => {
    const numberValue = Number(value || 0);
    return `$${numberValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatHoursValue = (value) => {
    const numberValue = Number(value || 0);
    return numberValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
    }));
  };

  const startEdit = (student) => {
    if (typeof window !== 'undefined' && window?.appPermissions && window.appPermissions.canEditStudent === false) {
      return;
    }
    setEditingId(student.id);
    setEditFormData({
      ...student,
      weeklySchedule: Array.isArray(student.weeklySchedule) ? [...student.weeklySchedule] : [],
      primaryBuildings: Array.isArray(student.primaryBuildings) ? [...student.primaryBuildings] : (student.primaryBuilding ? [student.primaryBuilding] : []),
      jobs: Array.isArray(student.jobs) && student.jobs.length > 0 ? student.jobs : [{
        jobTitle: student.jobTitle || '',
        supervisor: student.supervisor || '',
        hourlyRate: student.hourlyRate || '',
        location: Array.isArray(student.primaryBuildings) ? student.primaryBuildings : (student.primaryBuilding ? [student.primaryBuilding] : []),
        weeklySchedule: Array.isArray(student.weeklySchedule) ? [...student.weeklySchedule] : []
      }]
    });
    setErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFormData({});
    setErrors({});
  };

  const validateStudentData = (data) => {
    const prepared = prepareStudentPayload(data);
    const errors = {};

    if (!prepared.name?.trim()) {
      errors.name = 'Name is required';
    }

    if (!prepared.email?.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prepared.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!prepared.hasNoPhone && !prepared.phone?.trim()) {
      errors.phone = 'Phone number is required (or check "No Phone")';
    }

    const jobs = Array.isArray(prepared.jobs) ? prepared.jobs : [];
    if (jobs.length === 0) {
      errors.assignments = 'Add at least one job assignment for the student worker.';
    }

    const missingTitle = jobs.some(job => !job.jobTitle?.trim());
    if (missingTitle) {
      errors.assignments = errors.assignments
        ? `${errors.assignments} Each assignment needs a job title.`
        : 'Each assignment needs a job title.';
    }

    const hasTopLevel = Array.isArray(prepared.weeklySchedule) && prepared.weeklySchedule.length > 0;
    const hasJobLevel = jobs.some(j => Array.isArray(j.weeklySchedule) && j.weeklySchedule.length > 0);
    if (!hasTopLevel && !hasJobLevel) {
      errors.weeklySchedule = 'Add at least one scheduled time block for this student.';
    }

    const assignmentMissingSchedule = jobs.some((job) =>
      (job.jobTitle || (Array.isArray(job.location) && job.location.length > 0) || job.supervisor || job.hourlyRate) &&
      (!Array.isArray(job.weeklySchedule) || job.weeklySchedule.length === 0)
    );
    if (assignmentMissingSchedule && !errors.weeklySchedule) {
      errors.weeklySchedule = 'Each job assignment needs at least one scheduled time block.';
    }

    return errors;
  };

  const saveEdit = async () => {
    const payload = prepareStudentPayload(editFormData);
    const validationErrors = validateStudentData(payload);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      // Save change to history for undo
      const originalStudent = studentData.find(s => s.id === editingId);
      setChangeHistory(prev => [...prev, {
        type: 'update',
        timestamp: new Date().toISOString(),
        originalData: originalStudent,
        newData: {...editFormData}
      }]);

      await onStudentUpdate(payload);
      setEditingId(null);
      setEditFormData({});
      setErrors({});
    } catch (error) {
      console.error('Error updating student:', error);
      setErrors({ general: 'Failed to update student. Please try again.' });
    }
  };

  const resetCreateState = () => {
    setNewStudent(createEmptyStudentDraft());
    setAssignmentDrafts([{ day: 'M', start: '', end: '' }]);
    setAssignmentBuildingDrafts(['']);
  };

  const startCreate = () => {
    if (typeof window !== 'undefined' && window?.appPermissions && window.appPermissions.canCreateStudent === false) {
      return;
    }
    setIsCreating(true);
    resetCreateState();
    setErrors({});
  };

  const cancelCreate = () => {
    setIsCreating(false);
    resetCreateState();
    setErrors({});
  };

  const saveCreate = async () => {
    const payload = prepareStudentPayload(newStudent);
    const validationErrors = validateStudentData(payload);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await onStudentUpdate({ ...payload, isActive: payload.isActive !== undefined ? payload.isActive : true });
      setIsCreating(false);
      resetCreateState();
      setErrors({});
    } catch (error) {
      console.error('Error creating student:', error);
      setErrors({ general: 'Failed to create student. Please try again.' });
    }
  };

  const confirmDelete = (student) => {
    if (typeof window !== 'undefined' && window?.appPermissions && window.appPermissions.canDeleteStudent === false) {
      return;
    }
    setStudentToDelete(student);
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (studentToDelete && onStudentDelete) {
      try {
        // Save to history for undo
        setChangeHistory(prev => [...prev, {
          type: 'delete',
          timestamp: new Date().toISOString(),
          originalData: studentToDelete
        }]);

        await onStudentDelete(studentToDelete.id);
        setShowDeleteConfirm(false);
        setStudentToDelete(null);
      } catch (error) {
        console.error('Error deleting student:', error);
      }
    }
  };

  const undoLastChange = () => {
    const lastChange = changeHistory[changeHistory.length - 1];
    if (lastChange) {
      if (lastChange.type === 'update') {
        onStudentUpdate(lastChange.originalData);
      } else if (lastChange.type === 'delete') {
        onStudentUpdate(lastChange.originalData);
      }
      setChangeHistory(prev => prev.slice(0, -1));
    }
  };

  // Helpers for weekly schedule editing
  const deriveBuildingsFromJobs = (jobs) => Array.from(new Set((jobs || []).flatMap(job => Array.isArray(job.location) ? job.location.filter(Boolean) : [])));

  const [editScheduleDraft, setEditScheduleDraft] = useState({ day: 'M', start: '', end: '' });
  const [editJobsDrafts, setEditJobsDrafts] = useState([{ day: 'M', start: '', end: '' }]);
  const addEditScheduleEntry = () => {
    if (!editScheduleDraft.day || !editScheduleDraft.start || !editScheduleDraft.end) return;
    if (editScheduleDraft.start >= editScheduleDraft.end) {
      setErrors(prev => ({ ...prev, weeklySchedule: 'End time must be after start time' }));
      return;
    }
    setEditFormData(prev => ({
      ...prev,
      weeklySchedule: [...(prev.weeklySchedule || []), { ...editScheduleDraft }]
    }));
    setEditScheduleDraft({ day: 'M', start: '', end: '' });
    setErrors(prev => ({ ...prev, weeklySchedule: undefined }));
  };
  const removeEditScheduleEntry = (index) => {
    setEditFormData(prev => ({
      ...prev,
      weeklySchedule: (prev.weeklySchedule || []).filter((_, i) => i !== index)
    }));
  };

  const formatWeeklySchedule = (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return '-';
    const dayOrder = ['M','T','W','R','F'];
    const dayLabels = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };
    const to12Hour = (timeStr) => {
      if (!timeStr || typeof timeStr !== 'string') return timeStr || '';
      const [hStr, mStr = '00'] = timeStr.split(':');
      let hour = parseInt(hStr, 10);
      if (Number.isNaN(hour)) return timeStr;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      if (hour === 0) hour = 12;
      const minutes = (mStr || '00').padStart(2, '0');
      return `${hour}:${minutes} ${ampm}`;
    };
    const grouped = {};
    entries.forEach(e => {
      const key = `${e.start}-${e.end}`;
      grouped[key] = grouped[key] || [];
      grouped[key].push(e.day);
    });
    return Object.entries(grouped).map(([time, days]) => {
      const orderedDays = days.sort((a,b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      const dayStr = orderedDays.map(d => dayLabels[d]).join(',');
      const [s, e] = time.split('-');
      return `${dayStr} ${to12Hour(s)}–${to12Hour(e)}`;
    }).join(' | ');
  };

  const formatTime12h = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return timeStr || '';
    const [hStr, mStr = '00'] = timeStr.split(':');
    let hour = parseInt(hStr, 10);
    if (Number.isNaN(hour)) return timeStr;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    const minutes = (mStr || '00').padStart(2, '0');
    return `${hour}:${minutes} ${ampm}`;
  };

  const exportToCSV = () => {
    const headers = [
      'Type',
      'Name',
      'Job Title',
      'Supervisor',
      'Email',
      'Phone',
      'Building(s)',
      'Start Date',
      'End Date',
      'Hourly Rate',
      'Weekly Hours',
      'Weekly Pay',
      'Weekly Schedule'
    ];

    const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = [];

    filteredAndSortedData.forEach(student => {
      const assignments = getStudentAssignments(student);
      if (assignments.length === 0) {
        rows.push([
          'Student Worker',
          student.name || '',
          student.jobTitle || '',
          student.supervisor || '',
          student.email || '',
          student.hasNoPhone ? 'No Phone' : formatPhoneNumber(student.phone),
          Array.isArray(student.primaryBuildings) ? student.primaryBuildings.join('; ') : (student.primaryBuilding || ''),
          student.startDate || '',
          student.endDate || '',
          '',
          '0.00',
          '0.00',
          formatWeeklySchedule(student.weeklySchedule)
        ]);
        return;
      }

      assignments.forEach(assignment => {
        rows.push([
          'Student Worker',
          student.name || '',
          assignment.jobTitle || '',
          assignment.supervisor || '',
          student.email || '',
          student.hasNoPhone ? 'No Phone' : formatPhoneNumber(student.phone),
          (assignment.buildings && assignment.buildings.length > 0)
            ? assignment.buildings.join('; ')
            : (Array.isArray(student.primaryBuildings) ? student.primaryBuildings.join('; ') : (student.primaryBuilding || '')),
          student.startDate || '',
          student.endDate || '',
          assignment.hourlyRateNumber ? assignment.hourlyRateNumber.toFixed(2) : (assignment.hourlyRateDisplay || ''),
          assignment.weeklyHours ? assignment.weeklyHours.toFixed(2) : '0.00',
          assignment.weeklyPay ? assignment.weeklyPay.toFixed(2) : '0.00',
          formatWeeklySchedule(assignment.schedule)
        ]);
      });
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(escapeCell).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `student-worker-directory-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
          <h2 className="text-xl font-serif font-semibold text-baylor-green flex items-center">
            <GraduationCap className="mr-2 text-baylor-gold" size={20} />
            Student Directory ({filteredAndSortedData.length})
          </h2>
          <div className="flex flex-wrap items-center justify-end gap-4">
            {sortConfig.key === 'name' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Sort by:</span>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    onClick={() => setNameSort('firstName')}
                    className={`px-3 py-1 text-xs ${
                      nameSort === 'firstName' ? 'bg-baylor-green text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    First Name
                  </button>
                  <button
                    onClick={() => setNameSort('lastName')}
                    className={`px-3 py-1 text-xs ${
                      nameSort === 'lastName' ? 'bg-baylor-green text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Last Name
                  </button>
                </div>
              </div>
            )}
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Filter directory..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
              />
            </div>
            <div className="min-w-[200px]">
              <MultiSelectDropdown
                options={availableJobTitles}
                selected={filters.jobTitles}
                onChange={(selected) => setFilters(prev => ({
                  ...prev,
                  jobTitles: selected
                }))}
                placeholder="Filter by title"
              />
            </div>
            <div className="min-w-[200px]">
              <MultiSelectDropdown
                options={availableBuildings}
                selected={filters.buildings}
                onChange={(selected) => setFilters(prev => ({
                  ...prev,
                  buildings: selected
                }))}
                placeholder="Filter by building"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                showFilters ? 'bg-baylor-green text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
            {changeHistory.length > 0 && (
              <button
                onClick={undoLastChange}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RotateCcw size={16} />
                Undo
              </button>
            )}
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.activeOnly}
                  onChange={(e) => setFilters(prev => ({ ...prev, activeOnly: e.target.checked }))}
                />
                Active only
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filters.includeEnded}
                  onChange={(e) => setFilters(prev => ({ ...prev, includeEnded: e.target.checked }))}
                />
                Include ended
              </label>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              onClick={startCreate}
              className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
              disabled={typeof window !== 'undefined' && window?.appPermissions && window.appPermissions.canCreateStudent === false}
            >
              <Plus size={18} />
              Add Student
            </button>
          </div>
        </div>

        {/* Shared datalists for suggestions */}
      <datalist id="supervisor-options">
        {availableSupervisors.map(s => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="jobtitle-options">
        {availableJobTitles.map(t => (
          <option key={t} value={t} />
        ))}
      </datalist>

        {/* Advanced Filters */}
        {showFilters && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Advanced Filters</h3>
            <button
              onClick={() => {
                setFilters({
                  departments: { include: [], exclude: [] },
                  supervisors: { include: [], exclude: [] },
                  jobTitles: [],
                  buildings: [],
                  hasEmail: true,
                  hasPhone: true,
                  activeOnly: true
                });
                setFilterText('');
              }}
              className="text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
            >
              Clear All Filters
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Supervisor</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setFilters(prev => ({
                      ...prev,
                      supervisors: { ...prev.supervisors, include: [e.target.value] }
                    }));
                  }
                }}
              >
                <option value="">All Supervisors</option>
                {availableSupervisors.map(supervisor => (
                  <option key={supervisor} value={supervisor}>{supervisor}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Job Titles</label>
              <MultiSelectDropdown
                options={availableJobTitles}
                selected={filters.jobTitles}
                onChange={(selected) => setFilters(prev => ({
                  ...prev,
                  jobTitles: selected
                }))}
                placeholder="Select job titles..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buildings</label>
              <MultiSelectDropdown
                options={availableBuildings}
                selected={filters.buildings}
                onChange={(selected) => setFilters(prev => ({
                  ...prev,
                  buildings: selected
                }))}
                placeholder="Select buildings..."
              />
            </div>
          </div>
        </div>
        )}

        {/* Metrics Overview */}
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-baylor-green/10 text-baylor-green">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Student Worker Hours &amp; Payroll</h3>
                <p className="text-sm text-gray-600">Metrics update automatically based on the directory filters.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[200px]">
                <MultiSelectDropdown
                  options={availableJobTitles}
                  selected={metricsFilters.jobTitles}
                  onChange={(selected) => setMetricsFilters(prev => ({
                    ...prev,
                    jobTitles: selected
                  }))}
                  placeholder="Metrics by title"
                />
              </div>
              <div className="min-w-[200px]">
                <MultiSelectDropdown
                  options={availableBuildings}
                  selected={metricsFilters.buildings}
                  onChange={(selected) => setMetricsFilters(prev => ({
                    ...prev,
                    buildings: selected
                  }))}
                  placeholder="Metrics by building"
                />
              </div>
              {(metricsFilters.jobTitles.length > 0 || metricsFilters.buildings.length > 0) && (
                <button
                  onClick={() => setMetricsFilters({ jobTitles: [], buildings: [] })}
                  className="px-3 py-2 text-sm text-baylor-green font-medium rounded-lg border border-baylor-green/30 hover:bg-baylor-green/10"
                >
                  Reset metrics filters
                </button>
              )}
            </div>
          </div>

          {metricsAssignments.length === 0 ? (
            <div className="text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-lg p-4">
              No assignments match the current filters. Adjust the directory or metrics filters to see totals.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Total Weekly Hours</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatHoursValue(metricsTotals.totalHours)} hrs</p>
                  <p className="text-xs text-gray-500 mt-1">Across {metricsTotals.studentCount} student worker{metricsTotals.studentCount === 1 ? '' : 's'}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Estimated Weekly Payroll</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(metricsTotals.totalPay)}</p>
                  <p className="text-xs text-gray-500 mt-1">Sum of hourly rate × hours for each assignment</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Average Hourly Rate</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(metricsTotals.avgRate)}</p>
                  <p className="text-xs text-gray-500 mt-1">Weighted by assignment hours</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Assignments Count</p>
                  <p className="text-2xl font-semibold text-gray-900">{metricsAssignments.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Active assignments in view</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Hours by Job Title</h4>
                  {jobTitleBreakdown.length === 0 ? (
                    <p className="text-sm text-gray-500">No job title information available.</p>
                  ) : (
                    <ul className="space-y-2">
                      {jobTitleBreakdown.map((item) => (
                        <li key={item.label} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{item.label}</span>
                          <span className="text-gray-900 font-medium">{formatHoursValue(item.hours)} hrs <span className="text-gray-400">·</span> {formatCurrency(item.pay)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Hours by Building</h4>
                  {buildingBreakdown.length === 0 ? (
                    <p className="text-sm text-gray-500">No building assignments recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {buildingBreakdown.map((item) => (
                        <li key={item.label} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{item.label}</span>
                          <span className="text-gray-900 font-medium">{formatHoursValue(item.hours)} hrs <span className="text-gray-400">·</span> {formatCurrency(item.pay)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create New Student Form */}
        {isCreating && (
          <div className="bg-white border border-baylor-gold/40 rounded-lg p-6 shadow-sm">
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900">Add Student Worker</h4>
              <p className="text-sm text-gray-600 mt-1">
                Provide contact information and define at least one job assignment with scheduled hours.
              </p>
            </div>

            <div className="space-y-6">
              <section className="space-y-3">
                <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Student Details</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={newStudent.name}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewStudent(prev => ({ ...prev, name: value }));
                        if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                      }}
                      className={`w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Full name"
                    />
                    {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={newStudent.email}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewStudent(prev => ({ ...prev, email: value }));
                        if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                      }}
                      className={`w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="student@baylor.edu"
                    />
                    {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <input
                        type="tel"
                        value={newStudent.phone}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNewStudent(prev => ({ ...prev, phone: value }));
                          if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined }));
                        }}
                        disabled={newStudent.hasNoPhone}
                        className={`flex-1 border rounded-md px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green ${errors.phone ? 'border-red-500' : 'border-gray-300'} ${newStudent.hasNoPhone ? 'bg-gray-100 text-gray-500' : ''}`}
                        placeholder="(254) 710-1234"
                      />
                      <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={newStudent.hasNoPhone}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNewStudent(prev => ({ ...prev, hasNoPhone: checked, phone: checked ? '' : prev.phone }));
                            if (checked) setErrors(prev => ({ ...prev, phone: undefined }));
                          }}
                          className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                        />
                        No phone on file
                      </label>
                    </div>
                    {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employment Window</h5>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={newStudent.startDate || ''}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, startDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={newStudent.endDate || ''}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, endDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newStudent.isActive !== false}
                      onChange={(e) => setNewStudent(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                    />
                    Active student worker
                  </label>
                  {newStudent.endDate && (
                    <span className="text-xs text-gray-500">Automatically inactivates after {new Date(newStudent.endDate).toLocaleDateString()}</span>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Job Assignments</h5>
                    <p className="text-sm text-gray-600">List each job along with buildings covered and the weekly schedule.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addAssignment}
                    className="self-start inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-baylor-green border border-baylor-green/40 rounded-md hover:bg-baylor-green/10"
                  >
                    <Plus className="h-4 w-4" />
                    Add Assignment
                  </button>
                </div>

                {errors.assignments && <p className="text-sm text-red-600">{errors.assignments}</p>}

                <div className="space-y-4">
                  {(newStudent.jobs || []).map((job, idx) => {
                    const draft = assignmentDrafts[idx] || { day: 'M', start: '', end: '' };
                    const locations = Array.isArray(job.location) ? job.location.filter(Boolean) : [];
                    const weeklyEntries = Array.isArray(job.weeklySchedule) ? job.weeklySchedule : [];
                    const weeklyHours = calculateWeeklyHoursFromSchedule(weeklyEntries);
                    return (
                      <div key={idx} className="border border-gray-200 rounded-lg bg-gray-50/80 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Assignment {idx + 1}</p>
                            {locations.length > 0 && (
                              <p className="text-xs text-gray-500 mt-1">{locations.join(', ')}</p>
                            )}
                          </div>
                          {(newStudent.jobs || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeAssignment(idx)}
                              className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Job Title *</label>
                            <input
                              type="text"
                              list="jobtitle-options"
                              value={job.jobTitle || ''}
                              onChange={(e) => updateAssignmentField(idx, 'jobTitle', e.target.value)}
                              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                              placeholder="e.g., Front Desk Assistant"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Supervisor</label>
                            <input
                              type="text"
                              list="supervisor-options"
                              value={job.supervisor || ''}
                              onChange={(e) => updateAssignmentField(idx, 'supervisor', e.target.value)}
                              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                              placeholder="Supervisor name"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Hourly Rate</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={job.hourlyRate || ''}
                              onChange={(e) => updateAssignmentField(idx, 'hourlyRate', e.target.value)}
                              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                              placeholder="12.00"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Primary Location(s)</label>
                            <MultiSelectDropdown
                              options={assignmentBuildingOptions}
                              selected={locations}
                              onChange={(selected) => updateAssignmentLocations(idx, selected)}
                              placeholder="Select building(s)"
                            />
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                              <input
                                type="text"
                                value={assignmentBuildingDrafts[idx] || ''}
                                onChange={(e) => updateCustomLocationDraft(idx, e.target.value)}
                                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                                placeholder="Add another location"
                              />
                              <button
                                type="button"
                                onClick={() => addCustomLocation(idx)}
                                className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-gray-200 pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <h6 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Weekly Schedule</h6>
                            {weeklyEntries.length > 0 && (
                              <span className="text-xs text-gray-500">≈ {formatHoursValue(weeklyHours)} hrs/week</span>
                            )}
                          </div>
                          {weeklyEntries.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {weeklyEntries.map((entry, entryIdx) => (
                                <span key={entryIdx} className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-700">
                                  {entry.day} {formatTime12h(entry.start)} - {formatTime12h(entry.end)}
                                  <button
                                    type="button"
                                    onClick={() => removeScheduleEntryFromAssignment(idx, entryIdx)}
                                    className="text-gray-400 hover:text-gray-600"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">No time blocks added yet.</p>
                          )}

                          <div className="mt-3 flex flex-wrap items-end gap-3">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Day</label>
                              <select
                                className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                                value={draft.day || 'M'}
                                onChange={(e) => updateAssignmentDraft(idx, { day: e.target.value })}
                              >
                                {WEEKDAY_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Start</label>
                              <input
                                type="time"
                                className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                                value={draft.start || ''}
                                onChange={(e) => updateAssignmentDraft(idx, { start: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">End</label>
                              <input
                                type="time"
                                className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                                value={draft.end || ''}
                                onChange={(e) => updateAssignmentDraft(idx, { end: e.target.value })}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => addScheduleEntryToAssignment(idx)}
                              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-baylor-green text-white rounded-md hover:bg-baylor-green/90"
                            >
                              <Plus className="h-4 w-4" />
                              Add Time
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {errors.weeklySchedule && <p className="text-sm text-red-600">{errors.weeklySchedule}</p>}

                <div className="rounded-lg bg-gray-50 border border-dashed border-gray-300 px-4 py-3 text-xs text-gray-600">
                  <span className="font-medium text-gray-700">Buildings covered:</span>{' '}
                  {assignmentBuildingsPreview.length > 0
                    ? assignmentBuildingsPreview.join(', ')
                    : 'Add locations to each assignment to populate this list.'}
                </div>
              </section>
            </div>

            {errors.general && (
              <p className="text-red-500 text-sm mt-4">{errors.general}</p>
            )}

            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-end gap-3">
              <button
                type="button"
                onClick={cancelCreate}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCreate}
                className="px-4 py-2 bg-baylor-green text-white rounded-lg text-sm font-medium hover:bg-baylor-green/90"
              >
                <Save className="h-4 w-4 inline mr-2" />
                Save Student
              </button>
            </div>
          </div>
        )}
        {/* Students Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-baylor-green/5">
                <SortableHeader label="Name" columnKey="name" />
                <SortableHeader label="Email" columnKey="email" />
                <SortableHeader label="Phone" columnKey="phone" />
                <SortableHeader label="Weekly Schedule" columnKey="weeklySchedule" />
                <SortableHeader label="Weekly Hours" columnKey="weeklyHours" />
                <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Wage</th>
                <SortableHeader label="Job Title" columnKey="jobTitle" />
                <SortableHeader label="Supervisor" columnKey="supervisor" />
                <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Building(s)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAndSortedData.map((student) => {
                const assignments = getStudentAssignments(student);
                const totalWeeklyHours = assignments.reduce((sum, assignment) => sum + assignment.weeklyHours, 0);
                const totalWeeklyPay = assignments.reduce((sum, assignment) => sum + assignment.weeklyPay, 0);
                return (
                  <tr key={student.id} className="hover:bg-gray-50">
                  {editingId === student.id ? (
                    // Edit row
                    <>
                      <td className="p-2 align-top">
                        <input
                          type="text"
                          value={editFormData.name || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                          className={`w-full border rounded px-2 py-1 text-sm ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                      </td>
                      <td className="p-2 align-top">
                        <input
                          type="email"
                          value={editFormData.email || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                          className={`w-full border rounded px-2 py-1 text-sm ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                      </td>
                      <td className="p-2 align-top">
                        <div className="space-y-3">
                          {/* Contact Info */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="tel"
                                value={editFormData.phone || ''}
                                onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))}
                                disabled={editFormData.hasNoPhone}
                                className={`flex-1 border rounded px-2 py-1 text-sm ${errors.phone ? 'border-red-500' : 'border-gray-300'} ${editFormData.hasNoPhone ? 'bg-gray-100' : ''}`}
                              />
                              <label className="flex items-center text-xs whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={editFormData.hasNoPhone || false}
                                  onChange={(e) => setEditFormData(prev => ({ ...prev, hasNoPhone: e.target.checked, phone: e.target.checked ? '' : prev.phone }))}
                                  className="mr-1"
                                />
                                No Phone
                              </label>
                            </div>
                            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                          </div>

                          {/* Employment Dates */}
                          <div className="border-t pt-3">
                            <label className="block text-xs font-medium text-gray-700 mb-2">Employment Period</label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Start Date</label>
                                <input 
                                  type="date" 
                                  className="border rounded px-2 py-1 w-full text-xs" 
                                  value={editFormData.startDate || ''} 
                                  onChange={e => setEditFormData(prev => ({ ...prev, startDate: e.target.value }))} 
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">End Date</label>
                                <input 
                                  type="date" 
                                  className="border rounded px-2 py-1 w-full text-xs" 
                                  value={editFormData.endDate || ''} 
                                  onChange={e => setEditFormData(prev => ({ ...prev, endDate: e.target.value }))} 
                                />
                              </div>
                            </div>
                            <div className="mt-2">
                              <label className="flex items-center gap-2 text-xs">
                                <input 
                                  type="checkbox" 
                                  checked={editFormData.isActive !== false} 
                                  onChange={e => setEditFormData(prev => ({ ...prev, isActive: e.target.checked }))} 
                                  className="rounded"
                                />
                                <span className="font-medium">Active Employee</span>
                              </label>
                              {editFormData.endDate && (
                                <p className="text-xs text-gray-500 mt-1">Will auto-inactivate after end date</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
              <td className="p-2 align-top" colSpan={5}>
                <div className="space-y-4">
                  {/* Job Management Header */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900">Job Management</h4>
                    <button 
                      onClick={() => { 
                        setEditFormData(prev => ({ ...prev, jobs: [...(prev.jobs || []), { jobTitle: '', supervisor: '', hourlyRate: '', location: [], weeklySchedule: [] }] })); 
                        setEditJobsDrafts(prev => ([...prev, { day: 'M', start: '', end: '' }])); 
                      }} 
                      className="px-3 py-1 bg-baylor-green text-white text-xs rounded hover:bg-baylor-green/90 transition-colors"
                    >
                      + Add Job
                    </button>
                  </div>

                  {/* Jobs List */}
                  <div className="space-y-3">
                    {(editFormData.jobs || []).map((job, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                        {/* Job Header */}
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-medium text-gray-900 text-sm">Job {idx + 1}</h5>
                          {(editFormData.jobs || []).length > 1 && (
                            <button 
                              onClick={() => { 
                                setEditFormData(prev => ({ ...prev, jobs: prev.jobs.filter((_, i) => i !== idx) })); 
                                setEditJobsDrafts(prev => prev.filter((_, i) => i !== idx)); 
                              }} 
                              className="text-red-600 hover:text-red-800 text-xs font-medium"
                            >
                              Remove Job
                            </button>
                          )}
                        </div>

                        {/* Job Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Job Title</label>
                            <input 
                              type="text" 
                              placeholder="e.g., Administrative Assistant" 
                              value={job.jobTitle || ''} 
                              onChange={e => setEditFormData(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, jobTitle: e.target.value } : j)}))} 
                              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Supervisor</label>
                            <input 
                              type="text" 
                              placeholder="Supervisor name" 
                              value={job.supervisor || ''} 
                              onChange={e => setEditFormData(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, supervisor: e.target.value } : j)}))} 
                              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Hourly Rate ($)</label>
                            <input 
                              type="number" 
                              step="0.01" 
                              placeholder="0.00" 
                              value={job.hourlyRate || ''} 
                              onChange={e => setEditFormData(prev => ({...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, hourlyRate: e.target.value } : j)}))} 
                              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                            <div className="flex gap-4 items-center text-sm">
                              <label className="flex items-center gap-2">
                                <input 
                                  type="checkbox" 
                                  checked={(job.location || []).includes('Mary Gibbs Jones')} 
                                  onChange={(e) => setEditFormData(prev => ({
                                    ...prev,
                                    jobs: prev.jobs.map((j,i)=> i===idx? { ...j, location: e.target.checked ? Array.from(new Set([...(j.location || []), 'Mary Gibbs Jones'])) : (j.location || []).filter(b => b !== 'Mary Gibbs Jones') } : j)
                                  }))} 
                                  className="rounded"
                                />
                                Mary Gibbs Jones
                              </label>
                              <label className="flex items-center gap-2">
                                <input 
                                  type="checkbox" 
                                  checked={(job.location || []).includes('Goebel')} 
                                  onChange={(e) => setEditFormData(prev => ({
                                    ...prev,
                                    jobs: prev.jobs.map((j,i)=> i===idx? { ...j, location: e.target.checked ? Array.from(new Set([...(j.location || []), 'Goebel'])) : (j.location || []).filter(b => b !== 'Goebel') } : j)
                                  }))} 
                                  className="rounded"
                                />
                                Goebel
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Schedule Section */}
                        <div className="border-t pt-3">
                          <label className="block text-xs font-medium text-gray-700 mb-2">Weekly Schedule</label>
                          
                          {/* Add Schedule Entry */}
                          <div className="flex items-end gap-2 mb-3">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Day</label>
                              <select 
                                className="border border-gray-300 rounded px-2 py-1 text-sm" 
                                value={(editJobsDrafts[idx]||{}).day || 'M'} 
                                onChange={e => setEditJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), day: e.target.value } : d))}
                              >
                                <option value="M">Monday</option>
                                <option value="T">Tuesday</option>
                                <option value="W">Wednesday</option>
                                <option value="R">Thursday</option>
                                <option value="F">Friday</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Start Time</label>
                              <input 
                                type="time" 
                                className="border border-gray-300 rounded px-2 py-1 text-sm" 
                                value={(editJobsDrafts[idx]||{}).start || ''} 
                                onChange={e => setEditJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), start: e.target.value } : d))} 
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">End Time</label>
                              <input 
                                type="time" 
                                className="border border-gray-300 rounded px-2 py-1 text-sm" 
                                value={(editJobsDrafts[idx]||{}).end || ''} 
                                onChange={e => setEditJobsDrafts(prev => prev.map((d,i)=> i===idx? { ...(d||{}), end: e.target.value } : d))} 
                              />
                            </div>
                            <button 
                              onClick={() => {
                                const draft = editJobsDrafts[idx] || { day: 'M', start: '', end: '' };
                                if (!draft.day || !draft.start || !draft.end) return;
                                if (draft.start >= draft.end) { setErrors(prev => ({ ...prev, weeklySchedule: 'End time must be after start time' })); return; }
                                setEditFormData(prev => ({
                                  ...prev,
                                  jobs: prev.jobs.map((j,i)=> i===idx? { ...j, weeklySchedule: [...(j.weeklySchedule || []), { ...draft }] } : j)
                                }));
                                setEditJobsDrafts(prev => prev.map((d,i)=> i===idx? { day: 'M', start: '', end: '' } : d));
                                setErrors(prev => ({ ...prev, weeklySchedule: undefined }));
                              }} 
                              className="px-3 py-1 bg-baylor-green text-white text-xs rounded hover:bg-baylor-green/90 transition-colors"
                            >
                              Add Time
                            </button>
                          </div>

                          {/* Schedule Entries */}
                          <div className="space-y-2">
                            {(job.weeklySchedule || []).map((entry, k) => (
                              <div key={k} className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2">
                                <span className="text-sm">
                                  {entry.day === 'M' ? 'Monday' : entry.day === 'T' ? 'Tuesday' : entry.day === 'W' ? 'Wednesday' : entry.day === 'R' ? 'Thursday' : 'Friday'} 
                                  {' '}{formatTime12h(entry.start)} - {formatTime12h(entry.end)}
                                </span>
                                <button 
                                  onClick={() => setEditFormData(prev => ({ ...prev, jobs: prev.jobs.map((j,i)=> i===idx? { ...j, weeklySchedule: (j.weeklySchedule || []).filter((_, x) => x !== k) } : j) }))} 
                                  className="text-red-500 hover:text-red-700 p-1"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            {(job.weeklySchedule || []).length === 0 && (
                              <div className="text-center text-gray-500 text-sm py-4 border border-gray-200 rounded bg-gray-50">
                                No schedule entries yet
                              </div>
                            )}
                          </div>
                          {errors.weeklySchedule && <p className="text-red-500 text-xs mt-2">{errors.weeklySchedule}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </td>
              <td className="p-2 align-top">
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={(editFormData.primaryBuildings || []).includes('Mary Gibbs Jones')} onChange={(e) => setEditFormData(prev => ({
                      ...prev,
                      primaryBuildings: e.target.checked
                        ? Array.from(new Set([...(prev.primaryBuildings || []), 'Mary Gibbs Jones']))
                        : (prev.primaryBuildings || []).filter(b => b !== 'Mary Gibbs Jones')
                    }))} /> MGJ
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={(editFormData.primaryBuildings || []).includes('Goebel')} onChange={(e) => setEditFormData(prev => ({
                      ...prev,
                      primaryBuildings: e.target.checked
                        ? Array.from(new Set([...(prev.primaryBuildings || []), 'Goebel']))
                        : (prev.primaryBuildings || []).filter(b => b !== 'Goebel')
                    }))} /> Goebel
                  </label>
                </div>
              </td>
                      <td className="p-2 align-top text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={saveEdit}
                            className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
                            title="Save"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    // Display row
                    <>
                      <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelectedStudentForCard(student)}>
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {student.name}
                            </div>
                            <div className="text-xs text-gray-500 space-x-2">
                              {student.startDate && (
                                <span>Start: {new Date(student.startDate).toLocaleDateString()}</span>
                              )}
                              {student.endDate && (
                                <span>End: {new Date(student.endDate).toLocaleDateString()}</span>
                              )}
                              {student.isActive === false && (
                                <span className="text-red-600 font-medium">Inactive</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <Mail className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{student.email || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          {student.hasNoPhone ? (
                            <PhoneOff className="h-4 w-4 text-gray-400 mr-2" />
                          ) : (
                            <Phone className="h-4 w-4 text-gray-400 mr-2" />
                          )}
                          <span className="text-sm text-gray-900">
                            {student.hasNoPhone ? 'No Phone' : formatPhoneNumber(student.phone)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{formatWeeklySchedule(student.weeklySchedule) || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top">
                        <div className="text-sm text-gray-900 font-medium">
                          {totalWeeklyHours > 0 ? `${formatHoursValue(totalWeeklyHours)} hrs` : '-'}
                        </div>
                        {assignments.length > 1 && (
                          <div className="mt-1 space-y-1 text-xs text-gray-500">
                            {assignments.map((assignment, idx) => (
                              <div key={idx}>
                                {(assignment.jobTitle || `Assignment ${idx + 1}`)}: {formatHoursValue(assignment.weeklyHours)} hrs
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-top">
                        <div className="flex items-center gap-2 text-sm text-gray-900 font-medium">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                          {assignments.length === 0 ? '-' : `${formatCurrency(totalWeeklyPay)} / wk`}
                        </div>
                        <div className="mt-1 space-y-1 text-xs text-gray-500">
                          {assignments.length === 0 ? (
                            <span>No wage data</span>
                          ) : (
                            assignments.map((assignment, idx) => (
                              <div key={idx}>
                                {(assignment.jobTitle || `Assignment ${idx + 1}`)}: {assignment.hourlyRateNumber ? `${formatCurrency(assignment.hourlyRateNumber)} / hr` : (assignment.hourlyRateDisplay || 'Rate N/A')}
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{student.jobTitle || '-'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{student.supervisor || '-'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{Array.isArray(student.primaryBuildings) ? student.primaryBuildings.join(', ') : (student.primaryBuilding || '-')}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => startEdit(student)}
                            className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
                            title="Edit"
                            disabled={typeof window !== 'undefined' && window?.appPermissions && window.appPermissions.canEditStudent === false}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => confirmDelete(student)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                            title="Delete"
                            disabled={typeof window !== 'undefined' && window?.appPermissions && window.appPermissions.canDeleteStudent === false}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredAndSortedData.length === 0 && (
          <div className="text-center py-12">
            <GraduationCap className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No student workers found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {filterText ? 'Try adjusting your search criteria.' : 'Get started by adding a new student worker.'}
            </p>
          </div>
        )}
      </div>

      {/* Contact Card Modal */}
      {selectedStudentForCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <FacultyContactCard
              person={selectedStudentForCard}
              onClose={() => setSelectedStudentForCard(null)}
              personType="student"
              onUpdate={onStudentUpdate}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete {studentToDelete?.name}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change History */}
      {showHistory && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-4">Recent Changes</h4>
          {changeHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No changes recorded.</p>
          ) : (
            <div className="space-y-2">
              {changeHistory.slice(-5).reverse().map((change, index) => (
                <div key={index} className="text-sm">
                  <span className="font-medium">{change.type}</span>: {change.originalData?.name}
                  <span className="text-gray-500 ml-2">
                    {new Date(change.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentDirectory; 