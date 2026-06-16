/**
 * ICS / iCalendar utilities
 *
 * Shared building blocks for generating Outlook-compatible .ics calendar files.
 * Extracted from the room export tool so both recurring room calendars and
 * one-off room reservations emit identical, well-formed iCalendar output.
 */

export const dayMetadata = {
  SU: { js: 0, ics: "SU" },
  SUN: { js: 0, ics: "SU" },
  SUNDAY: { js: 0, ics: "SU" },
  U: { js: 0, ics: "SU" },
  M: { js: 1, ics: "MO" },
  MO: { js: 1, ics: "MO" },
  MON: { js: 1, ics: "MO" },
  MONDAY: { js: 1, ics: "MO" },
  T: { js: 2, ics: "TU" },
  TU: { js: 2, ics: "TU" },
  TUE: { js: 2, ics: "TU" },
  TUES: { js: 2, ics: "TU" },
  TUESDAY: { js: 2, ics: "TU" },
  W: { js: 3, ics: "WE" },
  WE: { js: 3, ics: "WE" },
  WED: { js: 3, ics: "WE" },
  WEDNESDAY: { js: 3, ics: "WE" },
  R: { js: 4, ics: "TH" },
  TH: { js: 4, ics: "TH" },
  THU: { js: 4, ics: "TH" },
  THUR: { js: 4, ics: "TH" },
  THURS: { js: 4, ics: "TH" },
  THURSDAY: { js: 4, ics: "TH" },
  F: { js: 5, ics: "FR" },
  FR: { js: 5, ics: "FR" },
  FRI: { js: 5, ics: "FR" },
  FRIDAY: { js: 5, ics: "FR" },
  S: { js: 6, ics: "SA" },
  SA: { js: 6, ics: "SA" },
  SAT: { js: 6, ics: "SA" },
  SATURDAY: { js: 6, ics: "SA" },
};

export const sanitizeForFile = (value) => {
  if (!value) return "untitled";
  return (
    value
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 80) || "untitled"
  );
};

export const pad2 = (num) => String(num).padStart(2, "0");

export const formatLocalDate = (date) =>
  `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;

export const formatLocalDateTime = (date) =>
  `${formatLocalDate(date)}T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

export const formatUtcDateTime = (date) =>
  `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;

export const escapeICS = (text) =>
  (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

export const foldICSLines = (lines) => {
  const maxLen = 75;
  const folded = [];
  lines.forEach((line) => {
    const stringLine = typeof line === "string" ? line : String(line || "");
    if (stringLine.length <= maxLen) {
      folded.push(stringLine);
      return;
    }
    folded.push(stringLine.slice(0, maxLen));
    let pos = maxLen;
    const continuationMax = maxLen - 1;
    while (pos < stringLine.length) {
      folded.push(` ${stringLine.slice(pos, pos + continuationMax)}`);
      pos += continuationMax;
    }
  });
  return folded;
};

export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const cleaned = timeStr.toString().trim().toLowerCase();
  if (!cleaned) return null;

  let match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || "0", 10);
    const period = match[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return hour * 60 + minutes;
  }

  match = cleaned.match(/^(\d{1,2})(am|pm)$/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const period = match[2].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return hour * 60;
  }

  match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hour * 60 + minutes;
  }

  match = cleaned.match(/^(\d{1,2})(\d{2})$/);
  if (match) {
    const hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hour * 60 + minutes;
  }

  return null;
};

export const buildVTimezone = () => [
  "BEGIN:VTIMEZONE",
  "TZID:America/Chicago",
  "X-LIC-LOCATION:America/Chicago",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0600",
  "TZOFFSETTO:-0500",
  "TZNAME:CDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0600",
  "TZNAME:CST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/**
 * Build a complete single-event VCALENDAR string (one-off, non-recurring).
 * Used for room reservations so a staff member can drop the event into Outlook.
 *
 * @param {Object} params
 * @param {string} params.summary - Event title
 * @param {string} [params.location] - Room/location label
 * @param {string} [params.description] - Free-text description
 * @param {string} params.date - "YYYY-MM-DD" local date
 * @param {number} params.startMinutes - Start, minutes from midnight
 * @param {number} params.endMinutes - End, minutes from midnight
 * @param {string} [params.uid] - Stable UID (defaults to a generated one)
 * @returns {string} iCalendar text
 */
export const buildSingleEventICS = ({
  summary,
  location = "",
  description = "",
  date,
  startMinutes,
  endMinutes,
  uid,
}) => {
  const [year, month, day] = (date || "")
    .split("-")
    .map((part) => parseInt(part, 10));
  if (!year || !month || !day) return "";
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return "";

  const startDateTime = new Date(
    year,
    month - 1,
    day,
    Math.floor(startMinutes / 60),
    startMinutes % 60,
    0,
  );
  const endDateTime = new Date(
    year,
    month - 1,
    day,
    Math.floor(endMinutes / 60),
    endMinutes % 60,
    0,
  );

  const eventUid =
    uid ||
    `reservation-${formatLocalDate(startDateTime)}-${pad2(startDateTime.getHours())}${pad2(startDateTime.getMinutes())}-${sanitizeForFile(location)}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//faculty-schedules//Reservations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:America/Chicago",
    ...buildVTimezone(),
    "BEGIN:VEVENT",
    `UID:${escapeICS(eventUid)}@faculty-schedules`,
    `DTSTAMP:${formatUtcDateTime(new Date())}`,
    `SUMMARY:${escapeICS(summary || "Reservation")}`,
  ];

  if (location) lines.push(`LOCATION:${escapeICS(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);

  lines.push(
    `DTSTART;TZID=America/Chicago:${formatLocalDateTime(startDateTime)}`,
    `DTEND;TZID=America/Chicago:${formatLocalDateTime(endDateTime)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  );

  const folded = foldICSLines(lines);
  return `${folded.join("\r\n")}\r\n`;
};

/**
 * Trigger a browser download of an .ics file.
 */
export const downloadICS = (filename, icsString) => {
  if (typeof window === "undefined" || !icsString) return;
  const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
