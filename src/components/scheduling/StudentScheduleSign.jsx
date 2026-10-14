import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useFontEpoch from "../../hooks/useFontEpoch";
import {
  JobLegend,
  TIMELINE_CHROME_WIDTH,
  TimelineGrid,
} from "./StudentScheduleTimeline";
import {
  formatHours,
  formatShiftRange,
  listJobTitles,
} from "../../utils/studentScheduleTimeline";
import {
  PX_PER_IN,
  SIGN_MARGIN_IN,
  buildSignRoster,
  getSheetSize,
  sortDayShifts,
} from "../../utils/studentScheduleSign";

const BAYLOR_GREEN = "#154734";
const UNIVERSITY_GOLD = "#FFB81C";
const BRAND_MARK_SRC = "/brand/hsd-brand-mark-horizontal-green.svg";
const BRAND_MARK_ASPECT = 293 / 66;

const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const FIT_START = {
  lo: MIN_SCALE,
  hi: MAX_SCALE,
  scale: MAX_SCALE,
  loFits: false,
  done: false,
  overflow: false,
};

/**
 * Finds the largest scale (MIN_SCALE–MAX_SCALE) at which the content, laid
 * out at boxWidth / scale and then scaled, fits inside the box. Laying out
 * wider before scaling down keeps the content filling the page width.
 * Binary search, one synchronous layout pass per step.
 */
const useOnePageFit = (boxRef, contentRef, resetDeps) => {
  const [fit, setFit] = useState(FIT_START);

  useLayoutEffect(() => setFit(FIT_START), resetDeps);

  useLayoutEffect(() => {
    if (fit.done) return;
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const fits =
      content.scrollHeight * fit.scale <= box.clientHeight + 0.5 &&
      content.scrollWidth <= content.clientWidth + 1;
    const lo = fits ? fit.scale : fit.lo;
    const hi = fits ? fit.hi : fit.scale;
    const loFits = fits || fit.loFits;
    if ((fits && fit.scale === MAX_SCALE) || hi - lo < 0.01) {
      setFit({ lo, hi, scale: lo, loFits, done: true, overflow: !loFits });
    } else {
      setFit({ lo, hi, scale: (lo + hi) / 2, loFits, done: false, overflow: false });
    }
  });

  return fit;
};

const Swatch = ({ color }) => (
  <span
    aria-hidden="true"
    className="inline-block h-[0.7em] w-[0.7em] shrink-0 rounded-sm"
    style={{ backgroundColor: color?.swatch }}
  />
);

const DayColumns = ({ days, jobColors }) => (
  <div
    className="grid gap-x-4"
    style={{
      gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
      fontSize: 13,
    }}
  >
    {days.map((day) => {
      const shifts = sortDayShifts(day.events);
      return (
        <section key={day.id} className="min-w-0">
          <div
            className="mb-1 border-b-2 pb-1 font-bold leading-tight"
            style={{ color: BAYLOR_GREEN, borderColor: UNIVERSITY_GOLD, fontSize: "1.2em" }}
          >
            {day.label}
          </div>
          {shifts.length === 0 && (
            <div className="py-1.5 italic text-gray-500">No shifts</div>
          )}
          {shifts.map((event) => {
            const color = jobColors.get(event.assignment.jobTitle);
            return (
              <div
                key={`${event.student.id}-${event.startMinutes}-${event.assignment.jobTitle}`}
                className="break-words border-b border-gray-200 py-1.5 leading-snug last:border-b-0"
              >
                <div
                  className="flex items-center gap-1.5 font-bold tabular-nums lining-nums"
                  style={{ color: color?.ink }}
                >
                  <Swatch color={color} />
                  {formatShiftRange(event)}
                </div>
                <div className="font-semibold text-gray-900">
                  {event.student.name}
                </div>
                <div className="text-gray-600" style={{ fontSize: "0.8em" }}>
                  {event.assignment.jobTitle}
                </div>
              </div>
            );
          })}
        </section>
      );
    })}
  </div>
);

const Roster = ({ days, jobColors }) => {
  const groups = useMemo(() => buildSignRoster(days), [days]);
  return (
    <table
      className="w-full border-collapse"
      style={{ fontSize: 13, tableLayout: "fixed" }}
    >
      <colgroup>
        <col style={{ width: "21%" }} />
        {days.map((day) => (
          <col key={day.id} />
        ))}
        <col style={{ width: "8%" }} />
      </colgroup>
      <thead>
        <tr className="text-left text-white" style={{ backgroundColor: BAYLOR_GREEN }}>
          <th className="px-2 py-1.5 font-bold">Student</th>
          {days.map((day) => (
            <th key={day.id} className="px-2 py-1.5 font-bold">
              {day.label}
            </th>
          ))}
          <th className="px-2 py-1.5 text-right font-bold">Hrs/wk</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(({ job, rows }) => {
          const color = jobColors.get(job);
          return [
            <tr key={`job-${job}`}>
              <td
                colSpan={days.length + 2}
                className="px-2 pb-1 pt-2.5 font-bold"
                style={{ color: color?.ink }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Swatch color={color} />
                  {job}
                </span>
              </td>
            </tr>,
            ...rows.map((row, index) => (
              <tr
                key={`${job}-${row.student.id}`}
                className={`border-b border-gray-200 align-top ${index % 2 ? "bg-gray-50" : ""}`}
              >
                <td className="break-words px-2 py-1.5 font-semibold text-gray-900">
                  {row.student.name}
                </td>
                {days.map((day) => (
                  <td
                    key={day.id}
                    className="px-2 py-1.5 tabular-nums lining-nums text-gray-900"
                  >
                    {row.shifts[day.id].map((event) => (
                      <div key={event.startMinutes}>{formatShiftRange(event)}</div>
                    ))}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums lining-nums text-gray-700">
                  {formatHours(row.hours)}
                </td>
              </tr>
            )),
          ];
        })}
      </tbody>
    </table>
  );
};

const formatUpdated = (date) =>
  date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

/**
 * StudentScheduleSign - a one-page, print-sized Student Worker Schedule sign.
 *
 * The sheet is exactly one page of the chosen paper (with its own @page rule)
 * and scales the schedule to fill the space under the header, so it always
 * prints on a single page. `onFit` reports the final scale.
 */
const StudentScheduleSign = forwardRef(function StudentScheduleSign(
  { settings, title, subtitle, days, jobColors, onFit },
  ref,
) {
  const { layout, paper, orientation, note } = settings;
  const { widthIn, heightIn } = getSheetSize(paper, orientation);
  const bodyWidth = (widthIn - SIGN_MARGIN_IN * 2) * PX_PER_IN;
  // Header and footer type grow with the paper so Tabloid signs read farther away.
  const headerScale = Math.min(widthIn, heightIn) / 8.5;
  const fontEpoch = useFontEpoch();
  const boxRef = useRef(null);
  const contentRef = useRef(null);
  const fit = useOnePageFit(boxRef, contentRef, [
    layout,
    paper,
    orientation,
    note,
    title,
    subtitle,
    days,
    fontEpoch,
  ]);

  useEffect(() => {
    if (fit.done) onFit?.({ scale: fit.scale, overflow: fit.overflow });
  }, [fit.done, fit.scale, fit.overflow]);

  const contentWidth = bodyWidth / fit.scale;
  const legendTitles = useMemo(
    () => listJobTitles(days.flatMap((day) => day.events)),
    [days],
  );
  const markHeightIn = 0.6 * headerScale;

  return (
    <div
      ref={ref}
      className="student-schedule-sign flex shrink-0 flex-col overflow-hidden bg-white text-gray-900"
      style={{
        width: `${widthIn}in`,
        height: `${heightIn}in`,
        padding: `${SIGN_MARGIN_IN}in`,
        boxSizing: "border-box",
        fontFamily: '"calluna", Georgia, serif',
      }}
    >
      <style>{`
        @page { size: ${widthIn}in ${heightIn}in; margin: 0; }
        .student-schedule-sign { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      `}</style>

      <header className="flex shrink-0 items-start justify-between gap-6">
        <div className="min-w-0">
          <div
            className="font-bold leading-tight"
            style={{ color: BAYLOR_GREEN, fontSize: 30 * headerScale }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              className="mt-1 leading-snug text-gray-700"
              style={{ fontSize: 15 * headerScale }}
            >
              {subtitle}
            </div>
          )}
        </div>
        <img
          src={BRAND_MARK_SRC}
          alt="Baylor University, Robbins College of Health and Human Sciences, Human Sciences and Design"
          className="shrink-0"
          style={{
            height: `${markHeightIn}in`,
            width: `${markHeightIn * BRAND_MARK_ASPECT}in`,
          }}
        />
      </header>

      <div
        className="shrink-0"
        style={{
          height: 3 * headerScale,
          backgroundColor: UNIVERSITY_GOLD,
          margin: `${10 * headerScale}px 0 ${12 * headerScale}px`,
        }}
      />

      {layout !== "student" && legendTitles.length > 0 && (
        <div className="mb-2.5 shrink-0" style={{ fontSize: 12 * headerScale }}>
          <JobLegend
            titles={legendTitles}
            jobColors={jobColors}
            className="text-gray-800"
          />
        </div>
      )}

      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={contentRef}
          style={{
            width: contentWidth,
            transform: `scale(${fit.scale})`,
            transformOrigin: "top left",
          }}
        >
          {layout === "timeline" && (
            <div className="overflow-hidden rounded border border-gray-300">
              <TimelineGrid
                days={days}
                jobColors={jobColors}
                layoutWidth={contentWidth - 2 - TIMELINE_CHROME_WIDTH}
                outlined
              />
            </div>
          )}
          {layout === "day" && <DayColumns days={days} jobColors={jobColors} />}
          {layout === "student" && <Roster days={days} jobColors={jobColors} />}
        </div>
      </div>

      <footer
        className="mt-3 flex shrink-0 items-end justify-between gap-6 border-t border-gray-300 pt-2"
        style={{ fontSize: 12 * headerScale }}
      >
        <div
          className="min-w-0 font-semibold leading-snug"
          style={{ color: BAYLOR_GREEN, fontSize: 14 * headerScale }}
        >
          {note}
        </div>
        <div className="shrink-0 whitespace-nowrap text-gray-600">
          Updated {formatUpdated(new Date())}
        </div>
      </footer>
    </div>
  );
});

export default StudentScheduleSign;
