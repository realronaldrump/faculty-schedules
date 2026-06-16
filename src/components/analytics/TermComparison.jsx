import { useEffect, useMemo, useState } from "react";
import { ArrowRight, PlusCircle, MinusCircle, Pencil, Search, Info, Loader2 } from "lucide-react";
import { useSchedules } from "../../contexts/ScheduleContext";
import { sortTerms } from "../../utils/termUtils";
import { fetchSchedulesByTerms } from "../../utils/dataImportUtils";
import {
  buildSectionMapFromEnriched,
  diffSectionMaps,
} from "../../utils/scheduleDiffUtils";

import SelectDropdown from "../SelectDropdown";
const MetricCard = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex items-center gap-2 text-xs font-medium uppercase text-gray-500">
      <Icon className={`w-4 h-4 ${tone}`} />
      {label}
    </div>
    <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
  </div>
);

const matchesSearch = (course, q) =>
  !q || (course || "").toLowerCase().includes(q.toLowerCase());

const TermComparison = () => {
  const { availableSemesters = [] } = useSchedules();
  const [search, setSearch] = useState("");

  const termOptions = useMemo(
    () => sortTerms(Array.from(new Set(availableSemesters || []))),
    [availableSemesters],
  );

  // Default: compare the two most recent terms (sortTerms → most recent first).
  const [termB, setTermB] = useState("");
  const [termA, setTermA] = useState("");

  const effectiveB = termB || termOptions[0] || "";
  const effectiveA = termA || termOptions[1] || termOptions[0] || "";

  const emptyDiff = {
    added: [],
    dropped: [],
    changed: [],
    summary: { added: 0, dropped: 0, changed: 0 },
  };
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState(emptyDiff);

  // scheduleData only holds the selected term, so fetch both terms on demand.
  useEffect(() => {
    if (!effectiveA || !effectiveB) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchSchedulesByTerms({ terms: [effectiveA, effectiveB] })
      .then(({ schedules }) => {
        if (cancelled) return;
        setDiff(
          diffSectionMaps(
            buildSectionMapFromEnriched(schedules, effectiveA),
            buildSectionMapFromEnriched(schedules, effectiveB),
          ),
        );
      })
      .catch((err) => {
        console.error("Term comparison fetch failed", err);
        if (!cancelled) setDiff(emptyDiff);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveA, effectiveB]);

  const added = diff.added.filter((s) => matchesSearch(s.course, search));
  const dropped = diff.dropped.filter((s) => matchesSearch(s.course, search));
  const changed = diff.changed.filter((s) => matchesSearch(s.course, search));

  if (termOptions.length < 2) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Semester Comparison</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex gap-2">
          <Info className="w-5 h-5 flex-shrink-0" />
          Comparison needs at least two imported semesters. Import another semester's CLSS
          file to see what changed.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Semester Comparison</h1>
        <p className="text-gray-600">
          What changed between two semesters of the official schedule.
        </p>
      </div>

      <div
        className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-xl p-4"
        data-tutorial="termcompare-selectors"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <SelectDropdown
            value={effectiveA}
            onChange={(e) => setTermA(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
          >
            {termOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectDropdown>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-400 mb-2.5" />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <SelectDropdown
            value={effectiveB}
            onChange={(e) => setTermB(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
          >
            {termOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectDropdown>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Filter by course
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              data-tutorial="termcompare-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g., NUTR, ID 4433"
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Comparing {effectiveA} → {effectiveB}…
        </div>
      )}

      <div className="grid grid-cols-3 gap-4" data-tutorial="termcompare-metrics">
        <MetricCard icon={PlusCircle} label="Added" value={diff.summary.added} tone="text-emerald-500" />
        <MetricCard icon={MinusCircle} label="Dropped" value={diff.summary.dropped} tone="text-red-500" />
        <MetricCard icon={Pencil} label="Changed" value={diff.summary.changed} tone="text-blue-500" />
      </div>

      <div
        className="bg-white border border-gray-200 rounded-xl p-5"
        data-tutorial="termcompare-added"
      >
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <PlusCircle className="w-4 h-4 text-emerald-500" /> Added in {effectiveB}
        </h3>
        {added.length === 0 ? (
          <p className="text-sm text-gray-500">No new sections.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {added.map((s) => (
              <span
                key={s.course + s.section}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-800"
              >
                {s.course} · {s.section}
                {s.instructor ? (
                  <span className="text-emerald-600/80">— {s.instructor}</span>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <MinusCircle className="w-4 h-4 text-red-500" /> Dropped from {effectiveA}
        </h3>
        {dropped.length === 0 ? (
          <p className="text-sm text-gray-500">No dropped sections.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dropped.map((s) => (
              <span
                key={s.course + s.section}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-800"
              >
                {s.course} · {s.section}
                {s.instructor ? (
                  <span className="text-red-600/80">— {s.instructor}</span>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        className="bg-white border border-gray-200 rounded-xl p-5"
        data-tutorial="termcompare-changed"
      >
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Pencil className="w-4 h-4 text-blue-500" /> Changed
        </h3>
        {changed.length === 0 ? (
          <p className="text-sm text-gray-500">No section changes.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="university-table min-w-full">
              <thead>
                <tr>
                  <th className="table-header-cell">Course</th>
                  <th className="table-header-cell">Field</th>
                  <th className="table-header-cell">{effectiveA}</th>
                  <th className="table-header-cell" />
                  <th className="table-header-cell">{effectiveB}</th>
                </tr>
              </thead>
              <tbody>
                {changed.map((s) =>
                  s.changes.map((c, i) => (
                    <tr key={`${s.key}-${c.field}`}>
                      {i === 0 ? (
                        <td
                          className="table-cell font-medium text-gray-800 align-top"
                          rowSpan={s.changes.length}
                        >
                          {s.course} · {s.section}
                        </td>
                      ) : null}
                      <td className="table-cell text-gray-600">{c.field}</td>
                      <td className="table-cell text-gray-700">{c.from}</td>
                      <td className="table-cell text-gray-400">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </td>
                      <td className="table-cell text-gray-900">{c.to}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TermComparison;
