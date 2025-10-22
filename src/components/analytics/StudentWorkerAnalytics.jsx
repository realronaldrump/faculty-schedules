import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  BarChart3,
  Building2,
  Clock,
  DollarSign,
  Filter,
  Search,
  Users
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

const StudentWorkerAnalytics = ({ studentData = [], onNavigate }) => {
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [sortConfig, setSortConfig] = useState({ key: 'weeklyHours', direction: 'desc' });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedAssignments, setSelectedAssignments] = useState([]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Student Worker Hours &amp; Payroll</h1>
          <p className="text-gray-600 max-w-2xl">
            Explore student worker assignments, weekly hours, and estimated payroll totals. Use the filters below to focus on
            specific roles, supervisors, or buildings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              onClick={() => onNavigate('people/people-directory?tab=student')}
              className="px-4 py-2 rounded-lg border border-baylor-green/40 text-baylor-green hover:bg-baylor-green/10 transition-colors"
            >
              View Student Directory
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 text-gray-700 font-medium">
          <Filter size={16} />
          <span>Analytics Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search students, jobs, supervisors..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.activeOnly}
                onChange={(event) => setFilters((prev) => ({ ...prev, activeOnly: event.target.checked }))}
              />
              Active assignments only
            </label>
            <label className={`flex items-center gap-2 ${filters.activeOnly ? '' : 'opacity-60'}`}>
              <input
                type="checkbox"
                checked={filters.includeEnded}
                onChange={(event) => setFilters((prev) => ({ ...prev, includeEnded: event.target.checked }))}
                disabled={!filters.activeOnly}
              />
              Include ended assignments
            </label>
          </div>

          <button
            onClick={handleResetFilters}
            className="px-3 py-2 text-sm text-baylor-green font-medium rounded-lg border border-baylor-green/30 hover:bg-baylor-green/10"
          >
            Reset filters
          </button>
        </div>
      </div>

      {filteredAssignments.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-600">
          No assignments match the current filters. Adjust the filters or search criteria to see student worker metrics.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total Weekly Hours</p>
              <p className="text-2xl font-semibold text-gray-900">{formatHoursValue(metricsTotals.totalHours)} hrs</p>
              <p className="text-xs text-gray-500 mt-1">Across {metricsTotals.studentCount} student worker{metricsTotals.studentCount === 1 ? '' : 's'}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Estimated Weekly Payroll</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(metricsTotals.totalPay)}</p>
              <p className="text-xs text-gray-500 mt-1">Hourly rate × hours for each assignment</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Average Hourly Rate</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(metricsTotals.avgRate)}</p>
              <p className="text-xs text-gray-500 mt-1">Weighted by assignment hours</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Assignments Count</p>
              <p className="text-2xl font-semibold text-gray-900">{metricsTotals.assignmentCount}</p>
              <p className="text-xs text-gray-500 mt-1">Assignments currently in view</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                <Clock size={16} className="text-baylor-green" />
                Hours by Job Title
              </div>
              {jobTitleBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500">No job title information available.</p>
              ) : (
                <ul className="space-y-2">
                  {jobTitleBreakdown.map((item) => (
                    <li key={item.label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{item.label}</span>
                      <span className="text-gray-900 font-medium">
                        {formatHoursValue(item.hours)} hrs <span className="text-gray-400">·</span> {formatCurrency(item.pay)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                <Building2 size={16} className="text-baylor-green" />
                Hours by Building
              </div>
              {buildingBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500">No building assignments recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {buildingBreakdown.map((item) => (
                    <li key={item.label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{item.label}</span>
                      <span className="text-gray-900 font-medium">
                        {formatHoursValue(item.hours)} hrs <span className="text-gray-400">·</span> {formatCurrency(item.pay)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                <Users size={16} className="text-baylor-green" />
                Hours by Supervisor
              </div>
              {supervisorBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500">No supervisor assignments recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {supervisorBreakdown.map((item) => (
                    <li key={item.label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{item.label}</span>
                      <span className="text-gray-900 font-medium">
                        {formatHoursValue(item.hours)} hrs <span className="text-gray-400">·</span> {formatCurrency(item.pay)}
                        <span className="text-gray-400"> · </span>
                        <span className="text-gray-500">{item.count} assignment{item.count === 1 ? '' : 's'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2 text-gray-700">
                <BarChart3 size={18} className="text-baylor-green" />
                <span className="font-semibold">Assignment Detail</span>
                <span className="text-sm text-gray-500">({sortedAssignments.length} results)</span>
              </div>
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <DollarSign size={16} className="text-gray-400" />
                Totals reflect filtered assignments only
              </div>
            </div>
            <div className="overflow-x-auto">
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
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedAssignments.map((assignment) => {
                    const { student } = assignment;
                    const buildingsDisplay = assignment.resolvedBuildings.length > 0
                      ? assignment.resolvedBuildings.join(', ')
                      : '—';

                    return (
                      <tr
                        key={assignment.id}
                        className="hover:bg-baylor-green/5 cursor-pointer"
                        onClick={() => handleStudentClick(student)}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="font-medium text-gray-900">{student?.name || 'Unknown Student'}</div>
                          <div className="text-xs text-gray-500">{student?.email || 'No email on file'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{assignment.jobTitle || 'Unassigned'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{assignment.supervisor || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{buildingsDisplay}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{formatHoursValue(assignment.weeklyHours)} hrs</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {assignment.hourlyRateNumber
                            ? `${formatCurrency(assignment.hourlyRateNumber)} / hr`
                            : assignment.hourlyRateDisplay || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(assignment.weeklyPay)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              assignment.status === 'Active'
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
