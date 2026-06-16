import { useMemo, useState } from "react";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Maximize2,
  SlidersHorizontal,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import {
  analyzeCapacity,
  buildCapacityMap,
  DEFAULT_THRESHOLDS,
} from "../../utils/capacityUtils";
import CourseDetailModal from "../scheduling/CourseDetailModal";

const pct = (value) => (value == null ? "—" : `${Math.round(value * 100)}%`);

const FillBar = ({ value }) => {
  const clamped = value == null ? 0 : Math.min(Math.max(value, 0), 1.2);
  const over = value != null && value > 1;
  const near = value != null && value >= 0.9;
  const color = over
    ? "bg-red-500"
    : near
      ? "bg-amber-500"
      : "bg-baylor-green";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(clamped, 1) * 100}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 w-10">{pct(value)}</span>
    </div>
  );
};

const MetricCard = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex items-center gap-2 text-xs font-medium uppercase text-gray-500">
      <Icon className={`w-4 h-4 ${tone}`} />
      {label}
    </div>
    <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
  </div>
);

const SORT_COLS = [
  { key: "course",      label: "Course",      get: (s) => s.course ?? "" },
  { key: "instructor",  label: "Instructor",   get: (s) => s.instructor ?? "" },
  { key: "room",        label: "Room",         get: (s) => s.room ?? "" },
  { key: "enrollment",  label: "Enroll / Cap", get: (s) => s.enrollment ?? 0 },
  { key: "fillPct",     label: "Fill",         get: (s) => s.fillPct ?? -1 },
  { key: "waitlist",    label: "Wait",         get: (s) => s.waitlist ?? 0 },
  { key: null,          label: "What to do",   get: null },
];

const SortIcon = ({ col, sortState }) => {
  if (col.key === null) return null;
  if (sortState.col !== col.key) return <ChevronsUpDown className="w-3 h-3 ml-1 inline text-gray-400" />;
  return sortState.dir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 inline text-baylor-green" />
    : <ChevronDown className="w-3 h-3 ml-1 inline text-baylor-green" />;
};

const SectionTable = ({ title, description, rows, onSelect, dataTutorial }) => {
  const [sortState, setSortState] = useState({ col: null, dir: "asc" });

  const sortedRows = useMemo(() => {
    if (!sortState.col) return rows;
    const col = SORT_COLS.find((c) => c.key === sortState.col);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sortState.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortState]);

  const handleSort = (col) => {
    if (col.key === null) return;
    setSortState((prev) =>
      prev.col === col.key
        ? { col: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col: col.key, dir: "asc" }
    );
  };

  return (
  <div
    className="bg-white border border-gray-200 rounded-xl p-5"
    data-tutorial={dataTutorial}
  >
    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    <p className="text-sm text-gray-600 mb-3">{description}</p>
    {rows.length === 0 ? (
      <p className="text-sm text-gray-500">Nothing flagged. 🎉</p>
    ) : (
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="university-table min-w-full">
          <thead>
            <tr>
              {SORT_COLS.map((col) => (
                <th
                  key={col.label}
                  className={`table-header-cell${col.key ? " cursor-pointer select-none hover:bg-gray-100" : ""}`}
                  onClick={() => handleSort(col)}
                >
                  {col.label}
                  <SortIcon col={col} sortState={sortState} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((s) => (
              <tr
                key={s.key}
                className="cursor-pointer hover:bg-baylor-green/5"
                onClick={() => onSelect(s.row)}
              >
                <td className="table-cell font-medium text-gray-800">
                  {s.course}
                  {s.section ? ` · ${s.section}` : ""}
                </td>
                <td className="table-cell text-gray-700">{s.instructor || "—"}</td>
                <td className="table-cell text-gray-700">
                  {s.room || "—"}
                  {s.roomCapacity ? (
                    <span className="text-xs text-gray-400"> (cap {s.roomCapacity})</span>
                  ) : null}
                </td>
                <td className="table-cell text-gray-700">
                  {s.enrollment}
                  {s.max != null ? ` / ${s.max}` : ""}
                </td>
                <td className="table-cell">
                  <FillBar value={s.fillPct} />
                </td>
                <td className="table-cell text-gray-700">
                  {s.waitlist > 0 ? (
                    <span className="text-amber-700 font-medium">{s.waitlist}</span>
                  ) : (
                    "0"
                  )}
                </td>
                <td className="table-cell text-xs text-gray-600 max-w-xs">
                  {s.hints[0] || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
  );
};

const EnrollmentCapacity = () => {
  const {
    scheduleData = [],
    spacesList = [],
    selectedSemester,
    availableSemesters = [],
  } = useData();

  const [term, setTerm] = useState(selectedSemester || "");
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [showThresholds, setShowThresholds] = useState(false);
  const [detail, setDetail] = useState(null);

  const effectiveTerm = term || selectedSemester || "";

  const capacityByLabel = useMemo(
    () => buildCapacityMap(spacesList),
    [spacesList],
  );

  const analysis = useMemo(
    () =>
      analyzeCapacity({
        scheduleRows: scheduleData,
        term: effectiveTerm || null,
        capacityByLabel,
        thresholds,
      }),
    [scheduleData, effectiveTerm, capacityByLabel, thresholds],
  );

  const termOptions = useMemo(() => {
    const fromData = Array.from(
      new Set(scheduleData.map((r) => r.Term).filter(Boolean)),
    );
    return Array.from(new Set([...(availableSemesters || []), ...fromData]));
  }, [scheduleData, availableSemesters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Enrollment &amp; Capacity
          </h1>
          <p className="text-gray-600">
            Actionable flags from the official schedule — what needs a section,
            a bigger room, or a second look.
          </p>
        </div>
        <select
          data-tutorial="capacity-term"
          value={effectiveTerm}
          onChange={(e) => setTerm(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
        >
          {termOptions.length === 0 && <option value="">No terms</option>}
          {termOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        data-tutorial="capacity-metrics"
      >
        <MetricCard
          icon={Users}
          label="Sections"
          value={analysis.summary.total}
          tone="text-gray-400"
        />
        <MetricCard
          icon={TrendingUp}
          label="Over / near cap"
          value={analysis.summary.overCapacity}
          tone="text-amber-500"
        />
        <MetricCard
          icon={TrendingDown}
          label="Under-enrolled"
          value={analysis.summary.underEnrolled}
          tone="text-red-500"
        />
        <MetricCard
          icon={Maximize2}
          label="Room mismatch"
          value={analysis.summary.roomMismatch}
          tone="text-blue-500"
        />
      </div>

      <div>
        <button
          type="button"
          data-tutorial="capacity-thresholds"
          onClick={() => setShowThresholds((v) => !v)}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-baylor-green"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {showThresholds ? "Hide thresholds" : "Adjust thresholds"}
        </button>
        {showThresholds && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <ThresholdInput
              label="Near-full at (%)"
              value={Math.round(thresholds.nearCapPct * 100)}
              onChange={(v) =>
                setThresholds((p) => ({ ...p, nearCapPct: v / 100 }))
              }
            />
            <ThresholdInput
              label="Under-enrolled at (%)"
              value={Math.round(thresholds.underPct * 100)}
              onChange={(v) =>
                setThresholds((p) => ({ ...p, underPct: v / 100 }))
              }
            />
            <ThresholdInput
              label="Min headcount"
              value={thresholds.minEnroll}
              onChange={(v) => setThresholds((p) => ({ ...p, minEnroll: v }))}
            />
            <ThresholdInput
              label="Oversized room ×"
              value={thresholds.oversizedFactor}
              step="0.1"
              onChange={(v) =>
                setThresholds((p) => ({ ...p, oversizedFactor: v }))
              }
            />
          </div>
        )}
      </div>

      {analysis.summary.total === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          No sections found for this term. Import a CLSS file or pick another term.
        </div>
      )}

      <SectionTable
        title="Over / near capacity"
        description="At or above the fill threshold, or with a waitlist: candidates for a larger room or another section."
        rows={analysis.overCapacity}
        onSelect={setDetail}
        dataTutorial="capacity-over"
      />
      <SectionTable
        title="Under-enrolled"
        description="Low or zero enrollment. Review for cancellation or consolidation."
        rows={analysis.underEnrolled}
        onSelect={setDetail}
        dataTutorial="capacity-under"
      />
      <SectionTable
        title="Room capacity mismatch"
        description="Enrollment or cap doesn't fit the assigned room: too small, or much too large."
        rows={analysis.roomMismatch}
        onSelect={setDetail}
        dataTutorial="capacity-mismatch"
      />

      {detail && (
        <CourseDetailModal item={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
};

const ThresholdInput = ({ label, value, onChange, step = "1" }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
    />
  </div>
);

export default EnrollmentCapacity;
