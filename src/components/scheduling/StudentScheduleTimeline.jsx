import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatMinutesCompact,
  formatMinutesToLabel,
} from "../../utils/timeUtils";
import {
  LABEL_OFFSET,
  LABEL_PADDING_X,
  getTimelineWindow,
  layoutTimelineDay,
} from "../../utils/studentScheduleTimeline";

const GUTTER_WIDTH = 112;
const TRACK_INSET = 12; // keeps the first and last hour labels inside the frame
const BAR_HEIGHT = 22;
const LANE_PITCH = 26;
const BAND_PADDING_Y = 8;
const LABEL_FONT_SIZE = 12; // text-xs
const NAME_TIME_GAP = 5;
// PDF export prints at 11in wide. Laying out no wider than that track keeps the
// printout collision-free; on screen, bars simply get wider.
const MAX_LAYOUT_TRACK_WIDTH = 880;

const formatRange = (event) =>
  `${formatMinutesCompact(event.startMinutes)}–${formatMinutesCompact(event.endMinutes)}`;

const formatHours = (hours) => String(Math.round(hours * 10) / 10);

// Measures label text in the page's own font; falls back to an estimate where
// canvas isn't available (tests).
const measureLabel = (() => {
  let context;
  const measure = (text) => {
    if (context === undefined) {
      context = document.createElement("canvas").getContext?.("2d") || null;
    }
    if (!context) return text.length * LABEL_FONT_SIZE * 0.6;
    context.font = `700 ${LABEL_FONT_SIZE}px ${getComputedStyle(document.body).fontFamily}`;
    return context.measureText(text).width;
  };
  return (event) =>
    Math.ceil(
      measure(event.student.name) + NAME_TIME_GAP + measure(formatRange(event)),
    ) + 2;
})();

const ShiftBar = ({ item, dayLabel, color, onSelect }) => {
  const { event, labelSide } = item;
  const jobTitle = event.assignment.jobTitle || "";
  const range = formatRange(event);
  const outsideStyle =
    labelSide === "right"
      ? { left: `calc(100% + ${LABEL_OFFSET}px)` }
      : labelSide === "left"
        ? { right: `calc(100% + ${LABEL_OFFSET}px)` }
        : undefined;

  return (
    <button
      type="button"
      onClick={() => onSelect(event.student)}
      title={[event.student.name, jobTitle, range].filter(Boolean).join(" · ")}
      aria-label={`${event.student.name}, ${jobTitle}, ${dayLabel} ${range}`}
      className="absolute rounded-[3px] text-left text-xs whitespace-nowrap hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-baylor-gold"
      style={{
        left: `${item.left * 100}%`,
        width: `${item.width * 100}%`,
        top: BAND_PADDING_Y + item.lane * LANE_PITCH,
        height: BAR_HEIGHT,
        lineHeight: `${BAR_HEIGHT}px`,
        paddingInline: LABEL_PADDING_X,
        backgroundColor: color.fill,
        color: color.ink,
      }}
    >
      <span className={outsideStyle ? "absolute top-0" : undefined} style={outsideStyle}>
        <span className="font-bold">{event.student.name}</span>
        <span
          className="tabular-nums lining-nums opacity-80"
          style={{ marginLeft: NAME_TIME_GAP }}
        >
          {range}
        </span>
      </span>
    </button>
  );
};

/**
 * StudentScheduleTimeline - the Timeline view of Student Worker Schedules.
 *
 * Time runs across and each weekday is a band, so every shift gets its own
 * row-width bar with the full name and hours. Color shows the job.
 *
 * @param {Array} props.days - [{ id, label, events }] in display order
 * @param {Map} props.jobColors - job title → { fill, ink, swatch }
 * @param {Function} props.onSelectStudent - opens the student's contact card
 */
const StudentScheduleTimeline = ({ days, jobColors, onSelectStudent }) => {
  const trackRef = useRef(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [fontEpoch, setFontEpoch] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setTrackWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  // Labels are measured in Calluna; lay out again once it has loaded.
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return undefined;
    let active = true;
    const relayout = () => active && setFontEpoch((epoch) => epoch + 1);
    fonts.ready.then(relayout);
    fonts.addEventListener?.("loadingdone", relayout);
    return () => {
      active = false;
      fonts.removeEventListener?.("loadingdone", relayout);
    };
  }, []);

  const allEvents = useMemo(() => days.flatMap((day) => day.events), [days]);
  const { startMinutes, endMinutes } = useMemo(
    () => getTimelineWindow(allEvents),
    [allEvents],
  );
  const layoutWidth = Math.min(
    trackWidth || MAX_LAYOUT_TRACK_WIDTH,
    MAX_LAYOUT_TRACK_WIDTH,
  );

  const bands = useMemo(
    () =>
      days.map((day) => {
        const { items, laneCount } = layoutTimelineDay(day.events, {
          startMinutes,
          endMinutes,
          trackWidth: layoutWidth,
          measureLabel,
        });
        return {
          ...day,
          items,
          height:
            BAND_PADDING_Y * 2 +
            Math.max(laneCount, 1) * LANE_PITCH -
            (LANE_PITCH - BAR_HEIGHT),
          studentCount: new Set(day.events.map((event) => event.student.id))
            .size,
          hours:
            day.events.reduce(
              (sum, event) => sum + event.endMinutes - event.startMinutes,
              0,
            ) / 60,
        };
      }),
    // fontEpoch re-runs measurement once the brand font is ready.
    [days, startMinutes, endMinutes, layoutWidth, fontEpoch],
  );

  const legend = useMemo(
    () =>
      [...new Set(allEvents.map((event) => event.assignment.jobTitle))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [allEvents],
  );

  const pct = (minutes) =>
    ((minutes - startMinutes) / (endMinutes - startMinutes)) * 100;
  const hourMarks = [];
  for (let m = startMinutes; m <= endMinutes; m += 60) hourMarks.push(m);
  const gridMarks = [];
  for (let m = startMinutes; m <= endMinutes; m += 30) gridMarks.push(m);
  const gridColumns = { gridTemplateColumns: `${GUTTER_WIDTH}px 1fr` };
  const trackInset = { left: TRACK_INSET, right: TRACK_INSET };

  return (
    <div className="space-y-3">
      <ul
        className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-700"
        aria-label="Job colors"
      >
        {legend.map((title) => (
          <li key={title} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: jobColors.get(title)?.swatch }}
            />
            {title}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <div className="min-w-[720px]">
          <div
            className="grid border-b border-gray-200 bg-white"
            style={gridColumns}
          >
            <div className="border-r border-gray-200" />
            <div className="relative h-8">
              <div ref={trackRef} className="absolute inset-y-0" style={trackInset}>
                {hourMarks.map((minutes, index) => {
                  const isEdge = index === 0 || index === hourMarks.length - 1;
                  return (
                    <span
                      key={minutes}
                      className="absolute top-2 whitespace-nowrap text-xs text-gray-500 tabular-nums lining-nums"
                      style={{
                        left: `${pct(minutes)}%`,
                        transform:
                          index === 0
                            ? "none"
                            : index === hourMarks.length - 1
                              ? "translateX(-100%)"
                              : "translateX(-50%)",
                      }}
                    >
                      {isEdge || minutes === 12 * 60
                        ? formatMinutesToLabel(minutes)
                        : ((minutes / 60 + 11) % 12) + 1}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            {bands.map((band) => (
              <div
                key={band.id}
                className="grid border-b border-gray-200 last:border-b-0 even:bg-gray-50"
                style={gridColumns}
              >
                <div className="border-r border-gray-200 px-4 py-2">
                  <div className="font-bold leading-tight text-baylor-green">
                    {band.label}
                  </div>
                  {band.events.length > 0 && (
                    <div className="mt-0.5 text-xs leading-snug text-gray-500 tabular-nums lining-nums">
                      {band.studentCount}{" "}
                      {band.studentCount === 1 ? "student" : "students"}
                      <br />
                      {formatHours(band.hours)} hrs
                    </div>
                  )}
                </div>
                <div className="relative" style={{ height: band.height }}>
                  <div className="absolute inset-y-0" style={trackInset}>
                    {gridMarks.map((minutes) => (
                      <span
                        key={minutes}
                        aria-hidden="true"
                        className={`absolute inset-y-0 w-px ${minutes % 60 ? "bg-gray-100" : "bg-gray-200"}`}
                        style={{ left: `${pct(minutes)}%` }}
                      />
                    ))}
                    {band.items.length === 0 && (
                      <span className="absolute left-0 top-2 text-xs italic text-gray-400">
                        No shifts
                      </span>
                    )}
                    {band.items.map((item) => (
                      <ShiftBar
                        key={`${item.event.student.id}-${item.event.startMinutes}-${item.event.assignment.jobTitle}`}
                        item={item}
                        dayLabel={band.label}
                        color={jobColors.get(item.event.assignment.jobTitle)}
                        onSelect={onSelectStudent}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentScheduleTimeline;
