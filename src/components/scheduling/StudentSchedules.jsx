import React, { useMemo, useState, useRef } from 'react';
import { Download } from 'lucide-react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import ExportModal from '../admin/ExportModal';
import FacultyContactCard from '../FacultyContactCard';
import { logExport } from '../../utils/activityLogger';

const DAY_ORDER = ['M','T','W','R','F'];
const DAY_LABELS = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

// Layout tuning for readability and export quality
const TIME_COLUMN_WIDTH = 104; // px, wide enough for full time labels
const BASE_PX_PER_HOUR = 56;   // default visual density
const MAX_PX_PER_HOUR = 120;   // cap to avoid excessively tall views
const MIN_EVENT_HEIGHT_PX = 44; // ensure at least ~3 short lines + padding

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

// Brand-aligned accent mapping
const ACCENTS = [
  { border: '#154734', bg: 'rgba(21, 71, 52, 0.08)' },   // Baylor Green tint
  { border: '#1F7A1F', bg: 'rgba(31, 122, 31, 0.07)' },  // Green variant
  { border: '#B68B00', bg: 'rgba(182, 139, 0, 0.12)' },  // Baylor Gold tint
  { border: '#0E6E6E', bg: 'rgba(14, 110, 110, 0.08)' }, // Teal accent
  { border: '#3F4C5A', bg: 'rgba(63, 76, 90, 0.08)' },   // Slate accent
];

const accentForString = (str) => {
  const key = String(str || 'accent');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  const idx = Math.abs(hash) % ACCENTS.length;
  return ACCENTS[idx];
};

const accentForStudentAndJob = (studentId, jobTitle) => {
  // Enhanced color coding: combines student ID and job title for unique color assignment
  // - Same student with different job titles gets different colors
  // - Different students with the same job title get different colors (based on student ID)
  // - Provides more granular visual distinction than student-only coloring
  const combinedKey = `${studentId || 'unknown'}|${jobTitle || 'no-title'}`;
  return accentForString(combinedKey);
};

const StudentSchedules = ({ studentData = [] }) => {
  const [selectedBuildings, setSelectedBuildings] = useState([]);
  const [selectedJobTitles, setSelectedJobTitles] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [dayView, setDayView] = useState('All'); // 'All' or one of DAY_ORDER
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedStudentForCard, setSelectedStudentForCard] = useState(null);
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

  // Dynamically scale vertical density (pixels per hour) to prevent content cropping
  const pixelsPerHour = useMemo(() => {
    // Find the minimum duration (in minutes) among visible entries
    let minDuration = Infinity;
    const days = dayView === 'All' ? DAY_ORDER : [dayView];
    days.forEach(d => {
      (entriesByDayWithLayout[d] || []).forEach(item => {
        const duration = Math.max(1, item.end - item.start);
        if (duration < minDuration) minDuration = duration;
      });
    });

    if (!isFinite(minDuration)) return BASE_PX_PER_HOUR;

    // Compute required px/hour so the smallest event gets at least MIN_EVENT_HEIGHT_PX
    const required = Math.ceil((MIN_EVENT_HEIGHT_PX * 60) / Math.max(15, minDuration));
    return Math.min(MAX_PX_PER_HOUR, Math.max(BASE_PX_PER_HOUR, required));
  }, [entriesByDayWithLayout, dayView]);

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

  const handleScheduleClick = (student) => {
    setSelectedStudentForCard(student);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-serif font-semibold text-baylor-green">Filters</h3>
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
        <div className="flex items-center justify-between mb-4">
          <div></div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">View</label>
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
            <label className="block text-xs text-gray-600 mb-1">Buildings</label>
            <MultiSelectDropdown
              options={buildingOptions}
              selected={selectedBuildings}
              onChange={setSelectedBuildings}
              placeholder="All Buildings"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Job Titles</label>
            <MultiSelectDropdown
              options={jobTitleOptions}
              selected={selectedJobTitles}
              onChange={setSelectedJobTitles}
              placeholder="All Job Titles"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-xs text-gray-600 mb-1">Students</label>
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

      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm" ref={scheduleGridRef}>
        {/* Time scale header */}
        <div className="grid gap-x-2" style={{ gridTemplateColumns: `${TIME_COLUMN_WIDTH}px repeat(${visibleDays.length}, 1fr)` }}>
          <div></div>
          {visibleDays.map(d => (
            <div key={d} className="text-center text-sm font-serif font-semibold text-baylor-green py-1">{DAY_LABELS[d]}</div>
          ))}
        </div>
        <div className="grid gap-x-2" style={{ gridTemplateColumns: `${TIME_COLUMN_WIDTH}px repeat(${visibleDays.length}, 1fr)` }}>
          {/* Time scale */}
          <div className="relative" style={{ height: `${(totalMinutes/60)*pixelsPerHour}px` }}>
            {Array.from({ length: Math.floor(totalMinutes / 60) + 1 }).map((_, i) => {
              const m = minStart + i * 60;
              const top = (i * 60) / totalMinutes * 100;
              return (
                <div key={i} className="absolute left-0 right-0 flex items-center" style={{ top: `${top}%` }}>
                  <div className="text-xs text-gray-600 w-full pr-2 text-right font-medium">{formatTimeLabel(m)}</div>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {visibleDays.map(d => (
            <div key={d} className="relative border-l border-gray-100" style={{ height: `${(totalMinutes/60)*pixelsPerHour}px` }}>
              {/* Hour lines */}
              {Array.from({ length: Math.floor(totalMinutes / 60) + 1 }).map((_, i) => {
                const top = (i * 60) / totalMinutes * 100;
                return (
                  <div key={i} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${top}%` }} />
                );
              })}
              {/* Half-hour lines (dashed) */}
              {Array.from({ length: Math.floor(totalMinutes / 30) }).map((_, i) => {
                const minutes = (i + 1) * 30;
                if (minutes % 60 === 0) return null; // skip where hour line already exists
                const top = (minutes / totalMinutes) * 100;
                return (
                  <div key={`half-${i}`} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: `${top}%`, opacity: 0.5, borderStyle: 'dashed' }} />
                );
              })}
              {/* Entries */}
              {(entriesByDayWithLayout[d] || []).map((item, idx) => {
                const { entry, start, end, col, columns } = item;
                const top = ((start - minStart) / totalMinutes) * 100;
                const height = Math.max(3, ((end - start) / totalMinutes) * 100);
                const durationMinutes = end - start;
                const accent = accentForStudentAndJob(entry.student.id, entry.jobTitle);
                const gap = 6; // px between columns
                const widthCalc = `calc((100% - ${(columns - 1) * gap}px) / ${columns})`;
                const leftCalc = `calc(${(col * 100) / columns}% + ${col * gap}px)`;

                // Dynamic font sizing to fit text without scrollbars
                const eventHeightPx = (durationMinutes / 60) * pixelsPerHour; // matches column scale
                let fontSizePx = 12;
                if (eventHeightPx < 44) fontSizePx = 11;
                if (eventHeightPx < 34) fontSizePx = 10;
                if (eventHeightPx < 26) fontSizePx = 9;
                if (eventHeightPx < 20) fontSizePx = 8;

                return (
                  <div
                    key={idx}
                    lang="en"
                    className="absolute rounded-md shadow-sm p-1.5 ring-1 ring-black/5 text-gray-900 bg-white hover:shadow-md cursor-pointer flex flex-col justify-center items-center text-center"
                    style={{ top: `${top}%`, height: `${height}%`, width: widthCalc, left: leftCalc, background: accent.bg, borderLeft: `4px solid ${accent.border}`, overflow: 'hidden', fontSize: `${fontSizePx}px` }}
                    title={`Click to view ${entry.student.name}'s contact information • ${formatTimeLabel(start)} - ${formatTimeLabel(end)}${entry.jobTitle ? ` • ${entry.jobTitle}` : ''} (Color-coded by student + job title)`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleScheduleClick(entry.student);
                    }}
                  >
                    <div className="font-semibold leading-tight whitespace-normal break-normal" style={{ wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'auto' }}>{entry.student.name}</div>
                    <div className="leading-tight whitespace-normal break-normal" style={{ wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'auto' }}>{formatTimeLabel(start)} - {formatTimeLabel(end)}</div>
                    {entry.jobTitle && <div className="leading-tight whitespace-normal break-normal" style={{ wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'auto' }}>{entry.jobTitle}</div>}
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

      {/* Contact Card Modal */}
      {selectedStudentForCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <FacultyContactCard
              person={selectedStudentForCard}
              onClose={() => setSelectedStudentForCard(null)}
              personType="student"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentSchedules;


