import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Filter,
  Search,
  TrendingUp,
  Users,
  Award,
  PieChart,
  List,
  LayoutGrid
} from 'lucide-react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import {
  formatCurrency,
  formatHoursValue,
  getStudentAssignments
} from '../../utils/studentWorkers';
import FacultyContactCard from '../FacultyContactCard';

const DEFAULT_FILTERS = {
  jobTitles: [],
  buildings: [],
  supervisors: [],
  activeOnly: true,
  includeEnded: false
};

// Progress bar component for breakdown cards
const ProgressBar = ({ value, maxValue, label, subLabel, color = 'baylor-green' }) => {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 truncate max-w-[60%]">{label}</span>
        <span className="text-sm text-gray-600">{subLabel}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-${color} rounded-full transition-all duration-500 group-hover:bg-baylor-gold`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
};

// Status distribution donut chart (simplified CSS version)
const StatusDonut = ({ data }) => {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return null;

  let offset = 0;
  const segments = data.map((item, index) => {
    const percentage = (item.count / total) * 100;
    const segment = { ...item, percentage, offset };
    offset += percentage;
    return segment;
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          {segments.map((segment, index) => (
            <circle
              key={segment.status}
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke={segment.color}
              strokeWidth="3"
              strokeDasharray={`${segment.percentage} ${100 - segment.percentage}`}
              strokeDashoffset={-segment.offset}
              className="transition-all duration-500"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-gray-700">{total}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {segments.map((segment) => (
          <div key={segment.status} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="text-gray-600">{segment.status}: {segment.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const StudentWorkerAnalytics = ({ studentData = [], onNavigate }) => {
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [sortConfig, setSortConfig] = useState({ key: 'weeklyHours', direction: 'desc' });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedAssignments, setSelectedAssignments] = useState([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const assignments = useMemo(() => {
    if (!Array.isArray(studentData)) return [];

    return studentData.flatMap((student) => {
      const studentAssignments = getStudentAssignments(student);
      return studentAssignments.map((assignment, index) => ({
        ...assignment,
        id: `${student.id || student.email || student.name || 'student'}-${index}`,
        student,
      }));
    });
  }, [studentData]);

  const parseDate = useCallback((value) => {
    if (!value) return null;
    const date = new Date(`${value}T23:59:59`);
    return Number.isNaN(date.getTime()) ? null : date;
  }, []);

  const decorateAssignments = useMemo(() => {
    const now = new Date();
    return assignments.map((assignment) => {
      const student = assignment.student || {};
      const endDate = parseDate(assignment.endDate || student.endDate);
      const startDate = parseDate(assignment.startDate || student.startDate);

      let status = 'Active';
      if (student.isActive === false) {
        status = 'Inactive';
      } else if (endDate && endDate < now) {
        status = 'Ended';
      } else if (startDate && startDate > now) {
        status = 'Upcoming';
      }

      const resolvedBuildings = (assignment.buildings && assignment.buildings.length > 0)
        ? assignment.buildings
        : Array.isArray(student.primaryBuildings)
          ? student.primaryBuildings
          : student.primaryBuilding
            ? [student.primaryBuilding]
            : [];

      const supervisor = assignment.supervisor || student.supervisor || '';

      return {
        ...assignment,
        status,
        resolvedBuildings,
        supervisor,
      };
    });
  }, [assignments, parseDate]);

  const availableJobTitles = useMemo(() => {
    const titles = new Set();
    decorateAssignments.forEach(({ jobTitle }) => {
      if (jobTitle) titles.add(jobTitle);
    });
    return Array.from(titles).sort();
  }, [decorateAssignments]);

  const availableBuildings = useMemo(() => {
    const buildings = new Set();
    decorateAssignments.forEach(({ resolvedBuildings }) => {
      resolvedBuildings.forEach((building) => {
        if (building) buildings.add(building);
      });
    });
    return Array.from(buildings).sort();
  }, [decorateAssignments]);

  const availableSupervisors = useMemo(() => {
    const supervisors = new Set();
    decorateAssignments.forEach(({ supervisor }) => {
      if (supervisor) supervisors.add(supervisor);
    });
    return Array.from(supervisors).sort();
  }, [decorateAssignments]);

  const filteredAssignments = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return decorateAssignments.filter((assignment) => {
      const { student } = assignment;
      if (!student) return false;

      if (normalizedSearch) {
        const searchSource = [
          student.name,
          student.email,
          assignment.jobTitle,
          assignment.supervisor,
          assignment.resolvedBuildings.join(' ')
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchSource.includes(normalizedSearch)) {
          return false;
        }
      }

      if (filters.jobTitles.length > 0) {
        if (!assignment.jobTitle || !filters.jobTitles.includes(assignment.jobTitle)) {
          return false;
        }
      }

      if (filters.supervisors.length > 0) {
        if (!assignment.supervisor || !filters.supervisors.includes(assignment.supervisor)) {
          return false;
        }
      }

      if (filters.buildings.length > 0) {
        if (!assignment.resolvedBuildings.some((b) => filters.buildings.includes(b))) {
          return false;
        }
      }

      if (filters.activeOnly) {
        if (!filters.includeEnded && (assignment.status === 'Ended' || assignment.status === 'Inactive')) {
          return false;
        }
      }

      return true;
    });
  }, [decorateAssignments, filters, searchText]);

  const metricsTotals = useMemo(() => {
    const totalHours = filteredAssignments.reduce((sum, assignment) => sum + (assignment.weeklyHours || 0), 0);
    const totalPay = filteredAssignments.reduce((sum, assignment) => sum + (assignment.weeklyPay || 0), 0);
    const studentCount = new Set(
      filteredAssignments.map((assignment) => assignment.student?.id || assignment.student?.email || assignment.student?.name)
    ).size;
    const avgRate = totalHours > 0 ? totalPay / totalHours : 0;

    return {
      totalHours,
      totalPay,
      avgRate,
      studentCount,
      assignmentCount: filteredAssignments.length,
    };
  }, [filteredAssignments]);

  // Status distribution for donut chart
  const statusDistribution = useMemo(() => {
    const counts = { Active: 0, Ended: 0, Upcoming: 0, Inactive: 0 };
    filteredAssignments.forEach((a) => {
      if (counts.hasOwnProperty(a.status)) {
        counts[a.status]++;
      }
    });
    return [
      { status: 'Active', count: counts.Active, color: '#16a34a' },
      { status: 'Upcoming', count: counts.Upcoming, color: '#2563eb' },
      { status: 'Ended', count: counts.Ended, color: '#6b7280' },
      { status: 'Inactive', count: counts.Inactive, color: '#eab308' },
    ].filter((item) => item.count > 0);
  }, [filteredAssignments]);

  // Top performers (students with most hours)
  const topPerformers = useMemo(() => {
    const studentHours = new Map();
    filteredAssignments.forEach((assignment) => {
      const studentKey = assignment.student?.id || assignment.student?.email || assignment.student?.name;
      if (!studentKey) return;
      const existing = studentHours.get(studentKey) || { student: assignment.student, hours: 0, pay: 0 };
      existing.hours += assignment.weeklyHours || 0;
      existing.pay += assignment.weeklyPay || 0;
      studentHours.set(studentKey, existing);
    });
    return Array.from(studentHours.values())
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
  }, [filteredAssignments]);

  const jobTitleBreakdown = useMemo(() => {
    const map = new Map();
    filteredAssignments.forEach((assignment) => {
      const key = assignment.jobTitle || 'Unassigned';
      const existing = map.get(key) || { hours: 0, pay: 0 };
      existing.hours += assignment.weeklyHours || 0;
      existing.pay += assignment.weeklyPay || 0;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.hours - a.hours);
  }, [filteredAssignments]);

  const buildingBreakdown = useMemo(() => {
    const map = new Map();
    filteredAssignments.forEach((assignment) => {
      assignment.resolvedBuildings.forEach((building) => {
        const key = building || 'Unassigned';
        const existing = map.get(key) || { hours: 0, pay: 0 };
        existing.hours += assignment.weeklyHours || 0;
        existing.pay += assignment.weeklyPay || 0;
        map.set(key, existing);
      });
    });
    return Array.from(map.entries())
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.hours - a.hours);
  }, [filteredAssignments]);

  const supervisorBreakdown = useMemo(() => {
    const map = new Map();
    filteredAssignments.forEach((assignment) => {
      const key = assignment.supervisor || 'Unassigned';
      const existing = map.get(key) || { hours: 0, pay: 0, count: 0 };
      existing.hours += assignment.weeklyHours || 0;
      existing.pay += assignment.weeklyPay || 0;
      existing.count += 1;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.hours - a.hours);
  }, [filteredAssignments]);

  const sortedAssignments = useMemo(() => {
    const sorted = [...filteredAssignments];
    sorted.sort((a, b) => {
      let valueA;
      let valueB;
      switch (sortConfig.key) {
        case 'student':
          valueA = a.student?.name || '';
          valueB = b.student?.name || '';
          break;
        case 'jobTitle':
          valueA = a.jobTitle || '';
          valueB = b.jobTitle || '';
          break;
        case 'supervisor':
          valueA = a.supervisor || '';
          valueB = b.supervisor || '';
          break;
        case 'weeklyHours':
          valueA = a.weeklyHours || 0;
          valueB = b.weeklyHours || 0;
          break;
        case 'hourlyRate':
          valueA = a.hourlyRateNumber || 0;
          valueB = b.hourlyRateNumber || 0;
          break;
        case 'weeklyPay':
          valueA = a.weeklyPay || 0;
          valueB = b.weeklyPay || 0;
          break;
        case 'status':
          valueA = a.status || '';
          valueB = b.status || '';
          break;
        default:
          valueA = '';
          valueB = '';
      }

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        const diff = valueA - valueB;
        return sortConfig.direction === 'asc' ? diff : -diff;
      }

      const comparison = valueA.toString().localeCompare(valueB.toString());
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [filteredAssignments, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const handleStudentClick = useCallback((student) => {
    if (!student) return;
    setSelectedStudent(student);
    setSelectedAssignments(getStudentAssignments(student));
  }, []);

  const handleCloseContactCard = useCallback(() => {
    setSelectedStudent(null);
    setSelectedAssignments([]);
  }, []);

  const handleResetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setSearchText('');
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.jobTitles.length > 0) count++;
    if (filters.buildings.length > 0) count++;
    if (filters.supervisors.length > 0) count++;
    if (searchText.trim()) count++;
    if (!filters.activeOnly) count++;
    if (filters.includeEnded) count++;
    return count;
  }, [filters, searchText]);

  const SortableHeader = ({ label, columnKey }) => {
    const isSorted = sortConfig.key === columnKey;
    const directionIcon = isSorted
      ? sortConfig.direction === 'asc'
        ? '▲'
        : '▼'
      : <ArrowUpDown size={14} className="opacity-40" />;

    return (
      <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">
        <button className="flex items-center gap-2" onClick={() => handleSort(columnKey)}>
          {label}
          <span className="inline-flex items-center justify-center w-4">{directionIcon}</span>
        </button>
      </th>
    );
  };

  const maxJobHours = Math.max(...jobTitleBreakdown.map((j) => j.hours), 1);
  const maxBuildingHours = Math.max(...buildingBreakdown.map((b) => b.hours), 1);
  const maxSupervisorHours = Math.max(...supervisorBreakdown.map((s) => s.hours), 1);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Student Worker Hours & Payroll</h1>
          <p className="text-gray-600">
            Analytics and insights for student worker assignments and estimated payroll
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              onClick={() => onNavigate('people/people-directory?tab=student')}
              className="px-4 py-2 rounded-lg border border-baylor-green/40 text-baylor-green hover:bg-baylor-green/10 transition-colors font-medium"
            >
              View Student Directory
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Filters Section */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-baylor-green/10 rounded-lg">
              <Filter size={18} className="text-baylor-green" />
            </div>
            <div className="text-left">
              <span className="font-semibold text-gray-800">Filters & Search</span>
              {activeFilterCount > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-baylor-gold/20 text-baylor-green text-xs font-medium rounded-full">
                  {activeFilterCount} active
                </span>
              )}
            </div>
          </div>
          {filtersExpanded ? (
            <ChevronUp size={20} className="text-gray-500" />
          ) : (
            <ChevronDown size={20} className="text-gray-500" />
          )}
        </button>

        {filtersExpanded && (
          <div className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search students, jobs, supervisors..."
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green transition-colors"
                />
              </div>

              <MultiSelectDropdown
                options={availableJobTitles}
                selected={filters.jobTitles}
                onChange={(selected) => setFilters((prev) => ({ ...prev, jobTitles: selected }))}
                placeholder="Filter by job title"
              />

              <MultiSelectDropdown
                options={availableBuildings}
                selected={filters.buildings}
                onChange={(selected) => setFilters((prev) => ({ ...prev, buildings: selected }))}
                placeholder="Filter by building"
              />

              <MultiSelectDropdown
                options={availableSupervisors}
                selected={filters.supervisors}
                onChange={(selected) => setFilters((prev) => ({ ...prev, supervisors: selected }))}
                placeholder="Filter by supervisor"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.activeOnly}
                    onChange={(event) => setFilters((prev) => ({ ...prev, activeOnly: event.target.checked }))}
                    className="w-4 h-4 text-baylor-green rounded focus:ring-baylor-green"
                  />
                  Active assignments only
                </label>
                <label className={`flex items-center gap-2 cursor-pointer ${filters.activeOnly ? '' : 'opacity-60'}`}>
                  <input
                    type="checkbox"
                    checked={filters.includeEnded}
                    onChange={(event) => setFilters((prev) => ({ ...prev, includeEnded: event.target.checked }))}
                    disabled={!filters.activeOnly}
                    className="w-4 h-4 text-baylor-green rounded focus:ring-baylor-green"
                  />
                  Include ended assignments
                </label>
              </div>

              <button
                onClick={handleResetFilters}
                className="px-4 py-2 text-sm text-baylor-green font-medium rounded-lg border border-baylor-green/30 hover:bg-baylor-green/10 transition-colors"
              >
                Reset all filters
              </button>
            </div>
          </div>
        )}
      </div>

      {filteredAssignments.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Assignments Found</h3>
          <p className="text-gray-500">
            Adjust the filters or search criteria to see student worker metrics.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Total Weekly Hours</p>
                  <p className="text-3xl font-bold text-baylor-green">{formatHoursValue(metricsTotals.totalHours)}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {metricsTotals.studentCount} student{metricsTotals.studentCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="p-3 bg-baylor-green/10 rounded-lg group-hover:bg-baylor-green/20 transition-colors">
                  <Clock size={24} className="text-baylor-green" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Est. Weekly Payroll</p>
                  <p className="text-3xl font-bold text-baylor-green">{formatCurrency(metricsTotals.totalPay)}</p>
                  <p className="text-sm text-gray-500 mt-1">Across all assignments</p>
                </div>
                <div className="p-3 bg-baylor-green/10 rounded-lg group-hover:bg-baylor-green/20 transition-colors">
                  <DollarSign size={24} className="text-baylor-green" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Average Hourly Rate</p>
                  <p className="text-3xl font-bold text-baylor-green">{formatCurrency(metricsTotals.avgRate)}</p>
                  <p className="text-sm text-gray-500 mt-1">Weighted by hours</p>
                </div>
                <div className="p-3 bg-baylor-green/10 rounded-lg group-hover:bg-baylor-green/20 transition-colors">
                  <TrendingUp size={24} className="text-baylor-green" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Total Assignments</p>
                  <p className="text-3xl font-bold text-baylor-green">{metricsTotals.assignmentCount}</p>
                  <p className="text-sm text-gray-500 mt-1">Currently in view</p>
                </div>
                <div className="p-3 bg-baylor-green/10 rounded-lg group-hover:bg-baylor-green/20 transition-colors">
                  <Users size={24} className="text-baylor-green" />
                </div>
              </div>
            </div>
          </div>

          {/* Tabbed Interface */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Tab Headers */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-colors relative ${activeTab === 'overview'
                    ? 'text-baylor-green bg-baylor-green/5'
                    : 'text-gray-600 hover:text-baylor-green hover:bg-gray-50'
                  }`}
              >
                <LayoutGrid size={18} />
                Overview
                {activeTab === 'overview' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-baylor-gold" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('assignments')}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-colors relative ${activeTab === 'assignments'
                    ? 'text-baylor-green bg-baylor-green/5'
                    : 'text-gray-600 hover:text-baylor-green hover:bg-gray-50'
                  }`}
              >
                <List size={18} />
                Assignments
                <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                  {sortedAssignments.length}
                </span>
                {activeTab === 'assignments' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-baylor-gold" />
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'overview' ? (
                <div className="space-y-6">
                  {/* Top Row: Status + Top Performers */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Status Distribution */}
                    <div className="border border-gray-100 rounded-xl p-5 bg-gray-50/50">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
                        <PieChart size={18} className="text-baylor-green" />
                        Assignment Status
                      </div>
                      {statusDistribution.length > 0 ? (
                        <StatusDonut data={statusDistribution} />
                      ) : (
                        <p className="text-sm text-gray-500">No status data available.</p>
                      )}
                    </div>

                    {/* Top Performers */}
                    <div className="border border-gray-100 rounded-xl p-5 bg-gray-50/50">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
                        <Award size={18} className="text-baylor-gold" />
                        Top Workers by Hours
                      </div>
                      {topPerformers.length > 0 ? (
                        <div className="space-y-3">
                          {topPerformers.map((performer, index) => (
                            <button
                              key={performer.student?.email || index}
                              onClick={() => handleStudentClick(performer.student)}
                              className="w-full flex items-center gap-3 text-left hover:bg-white p-2 -m-2 rounded-lg transition-colors"
                            >
                              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-baylor-gold text-baylor-green' :
                                  index === 1 ? 'bg-gray-300 text-gray-700' :
                                    index === 2 ? 'bg-amber-600 text-white' :
                                      'bg-gray-100 text-gray-600'
                                }`}>
                                {index + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {performer.student?.name || 'Unknown'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatHoursValue(performer.hours)} hrs · {formatCurrency(performer.pay)}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No performers to display.</p>
                      )}
                    </div>
                  </div>

                  {/* Breakdown Charts */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Hours by Job Title */}
                    <div className="border border-gray-100 rounded-xl p-5 bg-gray-50/50">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
                        <Clock size={18} className="text-baylor-green" />
                        Hours by Job Title
                      </div>
                      {jobTitleBreakdown.length > 0 ? (
                        <div className="space-y-3">
                          {jobTitleBreakdown.slice(0, 5).map((item) => (
                            <ProgressBar
                              key={item.label}
                              label={item.label}
                              subLabel={`${formatHoursValue(item.hours)} hrs`}
                              value={item.hours}
                              maxValue={maxJobHours}
                            />
                          ))}
                          {jobTitleBreakdown.length > 5 && (
                            <p className="text-xs text-gray-500 pt-2">
                              +{jobTitleBreakdown.length - 5} more job titles
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No job title data.</p>
                      )}
                    </div>

                    {/* Hours by Building */}
                    <div className="border border-gray-100 rounded-xl p-5 bg-gray-50/50">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
                        <Building2 size={18} className="text-baylor-green" />
                        Hours by Building
                      </div>
                      {buildingBreakdown.length > 0 ? (
                        <div className="space-y-3">
                          {buildingBreakdown.slice(0, 5).map((item) => (
                            <ProgressBar
                              key={item.label}
                              label={item.label}
                              subLabel={`${formatHoursValue(item.hours)} hrs`}
                              value={item.hours}
                              maxValue={maxBuildingHours}
                            />
                          ))}
                          {buildingBreakdown.length > 5 && (
                            <p className="text-xs text-gray-500 pt-2">
                              +{buildingBreakdown.length - 5} more buildings
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No building data.</p>
                      )}
                    </div>

                    {/* Hours by Supervisor */}
                    <div className="border border-gray-100 rounded-xl p-5 bg-gray-50/50">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
                        <Users size={18} className="text-baylor-green" />
                        Hours by Supervisor
                      </div>
                      {supervisorBreakdown.length > 0 ? (
                        <div className="space-y-3">
                          {supervisorBreakdown.slice(0, 5).map((item) => (
                            <ProgressBar
                              key={item.label}
                              label={item.label}
                              subLabel={`${formatHoursValue(item.hours)} hrs · ${item.count}`}
                              value={item.hours}
                              maxValue={maxSupervisorHours}
                            />
                          ))}
                          {supervisorBreakdown.length > 5 && (
                            <p className="text-xs text-gray-500 pt-2">
                              +{supervisorBreakdown.length - 5} more supervisors
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No supervisor data.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Assignments Tab */
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-gray-700">
                      <BarChart3 size={18} className="text-baylor-green" />
                      <span className="font-semibold">Assignment Details</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Click any row to view student details
                    </div>
                  </div>

                  <div className="overflow-x-auto -mx-6">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <SortableHeader label="Student" columnKey="student" />
                          <SortableHeader label="Job Title" columnKey="jobTitle" />
                          <SortableHeader label="Supervisor" columnKey="supervisor" />
                          <th className="px-4 py-3 text-left text-sm font-serif font-semibold text-baylor-green">Buildings</th>
                          <SortableHeader label="Weekly Hours" columnKey="weeklyHours" />
                          <SortableHeader label="Hourly Rate" columnKey="hourlyRate" />
                          <SortableHeader label="Weekly Pay" columnKey="weeklyPay" />
                          <SortableHeader label="Status" columnKey="status" />
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {sortedAssignments.map((assignment) => {
                          const { student } = assignment;
                          const buildingsDisplay = assignment.resolvedBuildings.length > 0
                            ? assignment.resolvedBuildings.join(', ')
                            : '—';

                          return (
                            <tr
                              key={assignment.id}
                              className="hover:bg-baylor-green/5 cursor-pointer transition-colors"
                              onClick={() => handleStudentClick(student)}
                            >
                              <td className="px-4 py-3 text-sm">
                                <div className="font-medium text-gray-900">{student?.name || 'Unknown Student'}</div>
                                <div className="text-xs text-gray-500">{student?.email || 'No email on file'}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{assignment.jobTitle || 'Unassigned'}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{assignment.supervisor || '—'}</td>
                              <td className="px-4 py-3 text-sm text-gray-700 max-w-[150px] truncate">{buildingsDisplay}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 font-medium">{formatHoursValue(assignment.weeklyHours)} hrs</td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {assignment.hourlyRateNumber
                                  ? `${formatCurrency(assignment.hourlyRateNumber)}/hr`
                                  : assignment.hourlyRateDisplay || '—'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 font-medium">{formatCurrency(assignment.weeklyPay)}</td>
                              <td className="px-4 py-3 text-sm">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${assignment.status === 'Active'
                                      ? 'bg-green-100 text-green-800'
                                      : assignment.status === 'Upcoming'
                                        ? 'bg-blue-100 text-blue-800'
                                        : assignment.status === 'Ended'
                                          ? 'bg-gray-100 text-gray-700'
                                          : 'bg-yellow-100 text-yellow-800'
                                    }`}
                                >
                                  {assignment.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {selectedStudent && (
        <FacultyContactCard
          person={selectedStudent}
          onClose={handleCloseContactCard}
          personType="student"
          showStudentSchedule
          studentAssignments={selectedAssignments}
        />
      )}
    </div>
  );
};

export default StudentWorkerAnalytics;
