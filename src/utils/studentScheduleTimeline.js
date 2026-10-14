/**
 * studentScheduleTimeline.js - layout and preferences for the Timeline view of
 * Student Worker Schedules.
 *
 * Timeline turns the weekly calendar on its side: time runs across, each day is
 * a band, and each shift is a bar labeled with the student's full name and
 * hours. Shifts never share width, so nothing is truncated; a busier day just
 * gets more lanes.
 */
import { STUDENT_SCHEDULE_RULES } from "./studentScheduleUtils";
import { formatMinutesCompact } from "./timeUtils";

// Label geometry shared by the layout and the bars that render it (px).
export const LABEL_PADDING_X = 7;
export const LABEL_OFFSET = 6;
const LANE_GAP = 8;

// Baylor Green and University Gold lead. The rest are Baylor's supporting
// colors already used in this app (Baylor Blue, the PMS greens and golds, and
// silver last so a job never looks disabled), ordered so the first five are
// easy to tell apart.
export const JOB_COLORS = [
  { fill: "#D3E7DD", ink: "#154734", swatch: "#154734" }, // Baylor Green, PMS 3435
  { fill: "#FFEDC2", ink: "#5C4300", swatch: "#FFB81C" }, // University Gold, PMS 1235
  { fill: "#DDE8EE", ink: "#003F5C", swatch: "#003F5C" }, // Baylor Blue
  { fill: "#EAF1D6", ink: "#46590F", swatch: "#7FA028" }, // PMS 377
  { fill: "#EFE4CC", ink: "#5E4A12", swatch: "#B8952F" }, // PMS 7753
  { fill: "#D3EDEA", ink: "#0A5249", swatch: "#0F7A6E" }, // PMS 3298
  { fill: "#E6EADC", ink: "#3E4A26", swatch: "#7A8B5A" }, // PMS 575
  { fill: "#ECECEC", ink: "#383838", swatch: "#8D8D8D" }, // Baylor Silver
];

/**
 * Give each job title one color. Titles are sorted so a job keeps its color
 * however the visible list is filtered.
 */
export const assignJobColors = (jobTitles) => {
  const colors = new Map();
  [...new Set(jobTitles.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .forEach((title, index) => {
      colors.set(title, JOB_COLORS[index % JOB_COLORS.length]);
    });
  return colors;
};

/** "9a–12:30p" for a shift. */
export const formatShiftRange = (event) =>
  `${formatMinutesCompact(event.startMinutes)}–${formatMinutesCompact(event.endMinutes)}`;

/** Hours to one decimal, without a trailing ".0". */
export const formatHours = (hours) => String(Math.round(hours * 10) / 10);

/** Sorted job titles of the given shifts, for a color key. */
export const listJobTitles = (events) =>
  [...new Set(events.map((event) => event.assignment.jobTitle))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

/** The schedule window (8 AM–5 PM), widened to whole hours for any shift outside it. */
export const getTimelineWindow = (events) =>
  events.reduce(
    (window, event) => ({
      startMinutes: Math.min(
        window.startMinutes,
        Math.floor(event.startMinutes / 60) * 60,
      ),
      endMinutes: Math.max(
        window.endMinutes,
        Math.ceil(event.endMinutes / 60) * 60,
      ),
    }),
    {
      startMinutes: STUDENT_SCHEDULE_RULES.startMinutes,
      endMinutes: STUDENT_SCHEDULE_RULES.endMinutes,
    },
  );

/**
 * Lay out one day's shifts in lanes.
 *
 * A shift's footprint is its bar plus its label. A label that doesn't fit
 * inside the bar sits to its right, or to its left when the end of the day is
 * in the way, and lanes are packed on that footprint so no text is covered.
 * A student's later shift reuses their lane when it is free.
 *
 * Positions come back in px for `trackWidth`; render them as percentages. The
 * layout stays collision-free at any wider track, because bars grow while
 * labels keep their size.
 *
 * @param {Array} events - { student, startMinutes, endMinutes }
 * @param {Object} options
 * @param {number} options.startMinutes - Window start
 * @param {number} options.endMinutes - Window end
 * @param {number} options.trackWidth - Track width in px used for the layout
 * @param {Function} options.measureLabel - event → label text width in px
 * @returns {{ items: Array, laneCount: number }}
 */
export const layoutTimelineDay = (
  events,
  { startMinutes, endMinutes, trackWidth, measureLabel },
) => {
  const pxPerMinute = trackWidth / (endMinutes - startMinutes);
  const items = events.map((event) => {
    const left = (event.startMinutes - startMinutes) * pxPerMinute;
    const width = (event.endMinutes - event.startMinutes) * pxPerMinute;
    const labelWidth = measureLabel(event);
    const fitsInside = labelWidth + LABEL_PADDING_X * 2 <= width;
    const fitsRight = left + width + LABEL_OFFSET + labelWidth <= trackWidth;
    const fitsLeft = left - LABEL_OFFSET - labelWidth >= 0;
    const labelSide = fitsInside
      ? "inside"
      : fitsRight || !fitsLeft
        ? "right"
        : "left";
    return {
      event,
      labelSide,
      left: left / trackWidth,
      width: width / trackWidth,
      from: labelSide === "left" ? left - LABEL_OFFSET - labelWidth : left,
      to:
        labelSide === "right"
          ? left + width + LABEL_OFFSET + labelWidth
          : left + width,
    };
  });

  const laneEnds = [];
  const laneByStudent = new Map();
  const isFree = (lane, item) => laneEnds[lane] + LANE_GAP <= item.from;
  [...items]
    .sort(
      (a, b) =>
        a.from - b.from || a.event.startMinutes - b.event.startMinutes,
    )
    .forEach((item) => {
      const ownLane = laneByStudent.get(item.event.student.id);
      let lane =
        ownLane !== undefined && isFree(ownLane, item)
          ? ownLane
          : laneEnds.findIndex((_, index) => isFree(index, item));
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.to;
      laneByStudent.set(item.event.student.id, lane);
      item.lane = lane;
    });

  return {
    items: items.sort((a, b) => a.lane - b.lane || a.from - b.from),
    laneCount: laneEnds.length,
  };
};

// ---- View preference + first-visit invite (localStorage, per browser) ----

const CALENDAR_VIEW_STORAGE_KEY = "studentScheduleCalendarView";
const TIMELINE_INVITE_STORAGE_KEY = "studentScheduleTimelineInviteSeen";

export const getSavedCalendarView = () => {
  try {
    return window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) === "timeline"
      ? "timeline"
      : "classic";
  } catch {
    return "classic";
  }
};

export const saveCalendarView = (view) => {
  try {
    window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, view);
  } catch (error) {
    console.error("Failed to save calendar view", error);
  }
};

export const hasSeenTimelineInvite = () => {
  try {
    return window.localStorage.getItem(TIMELINE_INVITE_STORAGE_KEY) === "1";
  } catch {
    // Fail closed: a dismissal couldn't persist, so don't ask on every visit.
    return true;
  }
};

export const markTimelineInviteSeen = () => {
  try {
    window.localStorage.setItem(TIMELINE_INVITE_STORAGE_KEY, "1");
  } catch (error) {
    console.error("Failed to save Timeline invite state", error);
  }
};
