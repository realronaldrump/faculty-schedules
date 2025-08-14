import React, { useMemo, useState } from 'react';

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
  const [selectedBuilding, setSelectedBuilding] = useState('All');
  const [selectedJobTitle, setSelectedJobTitle] = useState('All');
  const [selectedStudentId, setSelectedStudentId] = useState('All');
  const [dayView, setDayView] = useState('All'); // 'All' or one of DAY_ORDER

  const jobTitles = useMemo(() => {
    const set = new Set();
    studentData.forEach(s => { if (s.jobTitle) set.add(s.jobTitle); });
    return ['All', ...Array.from(set).sort()];
  }, [studentData]);

  const studentsForFilter = useMemo(() => {
    return ['All', ...studentData.map(s => ({ id: s.id, name: s.name }))];
  }, [studentData]);

  const filteredStudents = useMemo(() => {
    return studentData.filter(s => {
      // Ensure we have a structured schedule
      const hasSchedule = Array.isArray(s.weeklySchedule) && s.weeklySchedule.length > 0;
      if (!hasSchedule) return false;

      if (selectedBuilding !== 'All') {
        const buildings = Array.isArray(s.primaryBuildings) ? s.primaryBuildings : (s.primaryBuilding ? [s.primaryBuilding] : []);
        if (!buildings.includes(selectedBuilding)) return false;
      }
      if (selectedJobTitle !== 'All' && s.jobTitle !== selectedJobTitle) return false;
      if (selectedStudentId !== 'All' && s.id !== selectedStudentId) return false;
      return true;
    });
  }, [studentData, selectedBuilding, selectedJobTitle, selectedStudentId]);

  // Determine time bounds for grid (default 8:00 - 18:00)
  const { minStart, maxEnd } = useMemo(() => {
    let min = 8 * 60;
    let max = 18 * 60;
    filteredStudents.forEach(s => {
      (s.weeklySchedule || []).forEach(entry => {
        const start = minutesSinceStartOfDay(entry.start);
        const end = minutesSinceStartOfDay(entry.end);
        if (!isNaN(start)) min = Math.min(min, start);
        if (!isNaN(end)) max = Math.max(max, end);
      });
    });
    // Clamp to sensible bounds
    min = Math.max(6 * 60, Math.min(min, 9 * 60));
    max = Math.min(22 * 60, Math.max(max, 17 * 60));
    return { minStart: min, maxEnd: max };
  }, [filteredStudents]);

  const totalMinutes = Math.max(60, maxEnd - minStart);

  const entriesByDay = useMemo(() => {
    const map = { M: [], T: [], W: [], R: [], F: [] };
    filteredStudents.forEach(s => {
      (s.weeklySchedule || []).forEach(entry => {
        if (map[entry.day]) {
          map[entry.day].push({ ...entry, student: s });
        }
      });
    });
    // sort by start time within each day
    Object.keys(map).forEach(day => {
      map[day].sort((a, b) => minutesSinceStartOfDay(a.start) - minutesSinceStartOfDay(b.start));
    });
    return map;
  }, [filteredStudents]);

  const visibleDays = dayView === 'All' ? DAY_ORDER : [dayView];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Building</label>
          <select
            className="border rounded-md px-3 py-1"
            value={selectedBuilding}
            onChange={e => setSelectedBuilding(e.target.value)}
          >
            <option>All</option>
            <option>Mary Gibbs Jones</option>
            <option>Goebel</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Job Title</label>
          <select
            className="border rounded-md px-3 py-1"
            value={selectedJobTitle}
            onChange={e => setSelectedJobTitle(e.target.value)}
          >
            {jobTitles.map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Student</label>
          <select
            className="border rounded-md px-3 py-1"
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
          >
            {studentsForFilter.map(s => (
              typeof s === 'string'
                ? <option key="All">All</option>
                : <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
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

      <div className="bg-white border border-gray-200 rounded-lg p-4">
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
              {(entriesByDay[d] || []).map((entry, idx) => {
                const start = minutesSinceStartOfDay(entry.start);
                const end = minutesSinceStartOfDay(entry.end);
                const top = ((start - minStart) / totalMinutes) * 100;
                const height = Math.max(2, ((end - start) / totalMinutes) * 100);
                const bg = colorFromString(entry.student.id || entry.student.name || 'student');
                return (
                  <div
                    key={idx}
                    className="absolute left-1 right-1 rounded-md shadow-sm text-xs p-1 overflow-hidden"
                    style={{ top: `${top}%`, height: `${height}%`, background: bg }}
                    title={`${entry.student.name} • ${formatTimeLabel(start)} - ${formatTimeLabel(end)}${entry.student.jobTitle ? ` • ${entry.student.jobTitle}` : ''}`}
                  >
                    <div className="font-medium truncate">{entry.student.name}</div>
                    <div className="truncate">{formatTimeLabel(start)} - {formatTimeLabel(end)}</div>
                    {entry.student.jobTitle && <div className="truncate">{entry.student.jobTitle}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudentSchedules;


