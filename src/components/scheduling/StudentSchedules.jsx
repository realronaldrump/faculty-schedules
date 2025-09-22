import React, { useMemo, useState, useRef } from 'react';
import { Download } from 'lucide-react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import ExportModal from '../admin/ExportModal';
import { logExport } from '../../utils/activityLogger';

const DAY_ORDER = ['M','T','W','R','F'];
const DAY_LABELS = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };

function minutesSinceStartOfDay(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm] = timeStr.split(':').map(v => parseInt(v, 10));
  return (hh * 60) + (mm || 0);
}

function formatTimeLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr12 = ((h + 11) % 12) + 1;
  return `${hr12}:${m.toString().padStart(2,'0')} ${ampm}`;
}

const colorFromString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 70%)`;
};

const StudentSchedules = ({ studentData = [] }) => {
  const [selectedBuildings, setSelectedBuildings] = useState([]);
  const [selectedJobTitles, setSelectedJobTitles] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [dayView, setDayView] = useState('All'); // 'All' or one of DAY_ORDER
  const [showExportModal, setShowExportModal] = useState(false);
  const scheduleGridRef = useRef(null);

  const buildingOptions = useMemo(() => {
    const set = new Set();
    studentData.forEach(s => {
      const jobs = Array.isArray(s.jobs) && s.jobs.length > 0
        ? s.jobs
        : [{ location: Array.isArray(s.primaryBuildings) ? s.primaryBuildings : (s.primaryBuilding ? [s.primaryBuilding] : []) }];
      jobs.forEach(j => {
        const buildings = Array.isArray(j.location) ? j.location : (j.location ? [j.location] : []);
        buildings.forEach(b => { if (b) set.add(b); });
      });
    });
    return Array.from(set).sort();
  }, [studentData]);

  const jobTitleOptions = useMemo(() => {
    const set = new Set();
    studentData.forEach(s => {
      const jobs = Array.isArray(s.jobs) && s.jobs.length > 0 ? s.jobs : [{ jobTitle: s.jobTitle }];
      jobs.forEach(j => { if (j?.jobTitle) set.add(j.jobTitle); });
    });
    return Array.from(set).sort();
  }, [studentData]);

  const studentIdOptions = useMemo(() => {
    return studentData.map(s => s.id).filter(Boolean);
  }, [studentData]);

  const studentIdToNameMap = useMemo(() => {
    const map = {};
    studentData.forEach(s => { if (s.id) map[s.id] = s.name || s.id; });
    return map;
  }, [studentData]);

  const filteredStudents = useMemo(() => {
    return studentData.filter(s => {
      const jobs = Array.isArray(s.jobs) && s.jobs.length > 0
        ? s.jobs
        : [{
            jobTitle: s.jobTitle,
            location: Array.isArray(s.primaryBuildings) ? s.primaryBuildings : (s.primaryBuilding ? [s.primaryBuilding] : []),
            weeklySchedule: Array.isArray(s.weeklySchedule) ? s.weeklySchedule : []
          }];

      // Ensure at least one job has schedule entries
      const hasAnySchedule = jobs.some(j => Array.isArray(j.weeklySchedule) && j.weeklySchedule.length > 0);
      if (!hasAnySchedule) return false;

      // Buildings filter: at least one job matches
      if (selectedBuildings.length > 0) {
        const matchesBuilding = jobs.some(j => {
          const buildings = Array.isArray(j.location) ? j.location : (j.location ? [j.location] : []);
          return buildings.some(b => selectedBuildings.includes(b));
        });
        if (!matchesBuilding) return false;
      }

      // Job titles filter: at least one job matches
      if (selectedJobTitles.length > 0) {
        const matchesTitle = jobs.some(j => j?.jobTitle && selectedJobTitles.includes(j.jobTitle));
        if (!matchesTitle) return false;
      }

      // Students filter: match any
      if (selectedStudentIds.length > 0) {
        if (!selectedStudentIds.includes(s.id)) return false;
      }

      return true;
    });
  }, [studentData, selectedBuildings, selectedJobTitles, selectedStudentIds]);

  // Determine time bounds for grid (default 8:00 - 18:00)
  const { minStart, maxEnd } = useMemo(() => {
    let min = 8 * 60;
    let max = 18 * 60;
    filteredStudents.forEach(s => {
      const jobs = Array.isArray(s.jobs) && s.jobs.length > 0 ? s.jobs : [{ weeklySchedule: s.weeklySchedule }];
      jobs.forEach(j => {
        (j.weeklySchedule || []).forEach(entry => {
          const start = minutesSinceStartOfDay(entry.start);
          const end = minutesSinceStartOfDay(entry.end);
          if (!isNaN(start)) min = Math.min(min, start);
          if (!isNaN(end)) max = Math.max(max, end);
        });
      });
    });
    // Clamp to sensible bounds
    min = Math.max(6 * 60, Math.min(min, 9 * 60));
    max = Math.min(22 * 60, Math.max(max, 17 * 60));
    return { minStart: min, maxEnd: max };
  }, [filteredStudents]);

  const totalMinutes = Math.max(60, maxEnd - minStart);

  const entriesByDayWithLayout = useMemo(() => {
    const layoutMap = { M: [], T: [], W: [], R: [], F: [] };

    const layoutDay = (entries) => {
      const sorted = [...entries].sort((a, b) => minutesSinceStartOfDay(a.start) - minutesSinceStartOfDay(b.start));
      const results = [];
      let groupItems = [];
      let groupEndMax = -Infinity;
      let colEndTimes = [];
      let maxCols = 0;

      const finalizeGroup = () => {
        groupItems.forEach(item => results.push({ ...item, columns: Math.max(1, maxCols) }));
        groupItems = [];
        groupEndMax = -Infinity;
        colEndTimes = [];
        maxCols = 0;
      };

      sorted.forEach(entry => {
        const start = minutesSinceStartOfDay(entry.start);
        const end = minutesSinceStartOfDay(entry.end);
        if (groupItems.length > 0 && start >= groupEndMax) {
          finalizeGroup();
        }

        // assign column greedily
        let assignedCol = -1;
        for (let i = 0; i < colEndTimes.length; i++) {
          if (colEndTimes[i] <= start) { assignedCol = i; break; }
        }
        if (assignedCol === -1) {
          assignedCol = colEndTimes.length;
          colEndTimes.push(end);
        } else {
          colEndTimes[assignedCol] = end;
        }
        maxCols = Math.max(maxCols, colEndTimes.length);
        groupEndMax = Math.max(groupEndMax, end);
        groupItems.push({ entry, start, end, col: assignedCol });
      });

      if (groupItems.length > 0) finalizeGroup();
      return results;
    };

    // Build map by day
    const temp = { M: [], T: [], W: [], R: [], F: [] };
    filteredStudents.forEach(s => {
      const jobs = Array.isArray(s.jobs) && s.jobs.length > 0
        ? s.jobs
        : [{ jobTitle: s.jobTitle, weeklySchedule: s.weeklySchedule, location: Array.isArray(s.primaryBuildings) ? s.primaryBuildings : (s.primaryBuilding ? [s.primaryBuilding] : []) }];
      jobs.forEach(j => {
        // Apply per-job filters
        const jobTitleMatch = selectedJobTitles.length === 0 || (j?.jobTitle && selectedJobTitles.includes(j.jobTitle));
        const buildingMatch = selectedBuildings.length === 0 || (() => {
          const locs = Array.isArray(j.location) ? j.location : (j.location ? [j.location] : []);
          return locs.some(b => selectedBuildings.includes(b));
        })();
        if (!jobTitleMatch || !buildingMatch) return;

        (j.weeklySchedule || []).forEach(e => {
          if (!e || !e.day) return;
          if (temp[e.day]) temp[e.day].push({ ...e, student: s, jobTitle: j.jobTitle });
        });
      });
    });

    Object.keys(temp).forEach(day => {
      layoutMap[day] = layoutDay(temp[day]);
    });

    return layoutMap;
  }, [filteredStudents]);

  const visibleDays = dayView === 'All' ? DAY_ORDER : [dayView];

  const handleExport = async (format) => {
    const title = `Student Worker Schedules - ${dayView === 'All' ? 'All Days' : DAY_LABELS[dayView]}`;
    try {
      await logExport(format.toUpperCase(), 'Student worker schedules', filteredStudents.length);
    } catch (error) {
      console.error('Failed to log export:', error);
    }
    // The actual export is handled by the ExportModal
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
          <div>
            <button
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-baylor-green bg-white border border-baylor-green rounded-lg hover:bg-baylor-green hover:text-white transition-colors"
              title="Export schedule"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">View</label>
            <select
              className="border rounded-md px-3 py-1"
              value={dayView}
              onChange={e => setDayView(e.target.value)}
            >
              <option value="All">All Days</option>
              {DAY_ORDER.map(d => (
                <option key={d} value={d}>{DAY_LABELS[d]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Buildings</label>
            <MultiSelectDropdown
              options={buildingOptions}
              selected={selectedBuildings}
              onChange={setSelectedBuildings}
              placeholder="All Buildings"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Job Titles</label>
            <MultiSelectDropdown
              options={jobTitleOptions}
              selected={selectedJobTitles}
              onChange={setSelectedJobTitles}
              placeholder="All Job Titles"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Students</label>
            <MultiSelectDropdown
              options={studentIdOptions}
              selected={selectedStudentIds}
              onChange={setSelectedStudentIds}
              placeholder="All Students"
              displayMap={studentIdToNameMap}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4" ref={scheduleGridRef}>
        {/* Time scale header */}
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}>
          <div></div>
          {visibleDays.map(d => (
            <div key={d} className="text-center text-sm font-medium text-gray-700">{DAY_LABELS[d]}</div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}>
          {/* Time scale */}
          <div className="relative" style={{ height: `${(totalMinutes/60)*48}px` }}>
            {Array.from({ length: Math.floor(totalMinutes / 60) + 1 }).map((_, i) => {
              const m = minStart + i * 60;
              const top = (i * 60) / totalMinutes * 100;
              return (
                <div key={i} className="absolute left-0 right-0 flex items-center" style={{ top: `${top}%` }}>
                  <div className="text-xs text-gray-500 w-full">{formatTimeLabel(m)}</div>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {visibleDays.map(d => (
            <div key={d} className="relative border-l border-gray-100" style={{ height: `${(totalMinutes/60)*48}px` }}>
              {/* Hour lines */}
              {Array.from({ length: Math.floor(totalMinutes / 60) + 1 }).map((_, i) => {
                const top = (i * 60) / totalMinutes * 100;
                return (
                  <div key={i} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${top}%` }} />
                );
              })}
              {/* Entries */}
              {(entriesByDayWithLayout[d] || []).map((item, idx) => {
                const { entry, start, end, col, columns } = item;
                const top = ((start - minStart) / totalMinutes) * 100;
                const height = Math.max(3, ((end - start) / totalMinutes) * 100);
                const durationMinutes = end - start;
                const bg = colorFromString(entry.student.id || entry.student.name || 'student');
                const gap = 4; // px between columns
                const widthCalc = `calc((100% - ${(columns - 1) * gap}px) / ${columns})`;
                const leftCalc = `calc(${(col * 100) / columns}% + ${col * gap}px)`;

                // Dynamic font sizing to fit text without scrollbars
                const eventHeightPx = (durationMinutes / 60) * 48; // matches column scale (48px per hour)
                let fontSizePx = 12;
                if (eventHeightPx < 44) fontSizePx = 11;
                if (eventHeightPx < 34) fontSizePx = 10;
                if (eventHeightPx < 26) fontSizePx = 9;
                if (eventHeightPx < 20) fontSizePx = 8;

                return (
                  <div
                    key={idx}
                    className="absolute rounded-md shadow-sm p-1 bg-white/90"
                    style={{ top: `${top}%`, height: `${height}%`, width: widthCalc, left: leftCalc, background: bg, overflow: 'hidden', fontSize: `${fontSizePx}px`, lineHeight: 1.15 }}
                    title={`${entry.student.name} • ${formatTimeLabel(start)} - ${formatTimeLabel(end)}${entry.jobTitle ? ` • ${entry.jobTitle}` : ''}`}
                  >
                    <div className="font-semibold">{entry.student.name}</div>
                    <div>{formatTimeLabel(start)} - {formatTimeLabel(end)}</div>
                    {entry.jobTitle && <div>{entry.jobTitle}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        scheduleTableRef={scheduleGridRef}
        title={`Student Worker Schedules - ${dayView === 'All' ? 'All Days' : DAY_LABELS[dayView]}`}
        onExport={handleExport}
      />
    </div>
  );
};

export default StudentSchedules;


