import {
  buildVTimezone,
  dayMetadata,
  escapeICS,
  foldICSLines,
  formatUtcDateTime,
  pad2,
  parseTimeToMinutes,
  sanitizeForFile,
} from "./icsUtils";
import {
  assignMeetingPatternSpaces,
  parseMeetingPatterns,
} from "./meetingPatternUtils";
import { splitMultiRoom } from "./locationService";
import { normalizeTermDateValue, normalizeTermLabel } from "./termUtils";

const TIME_ZONE = "America/Chicago";
const ICS_DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const normalizeText = (value) => String(value || "").trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase();

const isCancelledSchedule = (schedule) =>
  normalizeKey(schedule?.status).startsWith("cancel");

const isPhysicalRoomLabel = (label) => {
  const normalized = normalizeKey(label);
  return Boolean(
    normalized &&
      normalized !== "online" &&
      !normalized.includes("no room") &&
      !normalized.includes("general assignment") &&
      !normalized.includes("tba"),
  );
};

const addRoomReference = (map, id, label) => {
  const normalizedId = normalizeText(id);
  const normalizedLabel = normalizeText(label || id);
  if (!isPhysicalRoomLabel(normalizedLabel)) return;
  const key = normalizedId || normalizeKey(normalizedLabel);
  if (!key || map.has(key)) return;
  map.set(key, { id: normalizedId, label: normalizedLabel });
};

export const extractRoomReferences = (schedule = {}) => {
  const refs = new Map();
  const ids = Array.isArray(schedule.spaceIds) ? schedule.spaceIds : [];
  const labels = Array.isArray(schedule.spaceDisplayNames)
    ? schedule.spaceDisplayNames
    : [];
  const canonicalCount = Math.max(ids.length, labels.length);
  for (let index = 0; index < canonicalCount; index += 1) {
    addRoomReference(refs, ids[index], labels[index]);
  }

  const addLegacyRoom = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      splitMultiRoom(value).forEach((label) => addRoomReference(refs, "", label));
      return;
    }
    addRoomReference(refs, value.spaceKey || value.id, value.displayName);
  };

  if (refs.size === 0) {
    (Array.isArray(schedule.rooms) ? schedule.rooms : []).forEach(addLegacyRoom);
    addLegacyRoom(schedule.room);
    addLegacyRoom(schedule.Room);
  }

  return Array.from(refs.values());
};

const getMeetingPatterns = (schedule = {}) => {
  if (Array.isArray(schedule.meetingPatterns) && schedule.meetingPatterns.length > 0) {
    return schedule.meetingPatterns;
  }
  if (Array.isArray(schedule.meetings) && schedule.meetings.length > 0) {
    return schedule.meetings;
  }
  if (schedule["Meeting Pattern"] || schedule.Meetings) {
    return parseMeetingPatterns(
      schedule["Meeting Pattern"] || "",
      schedule.Meetings || "",
    );
  }
  if (schedule.Day && (schedule["Start Time"] || schedule.startTime)) {
    return [
      {
        day: schedule.Day,
        startTime: schedule["Start Time"] || schedule.startTime,
        endTime: schedule["End Time"] || schedule.endTime,
      },
    ];
  }
  return [];
};

const roomMatches = (room, candidate) =>
  Boolean(
    (room.id && candidate.id && room.id === candidate.id) ||
      normalizeKey(room.label) === normalizeKey(candidate.label),
  );

const patternsForRoom = (schedule, room) => {
  const roomRefs = extractRoomReferences(schedule);
  const assignedPatterns = assignMeetingPatternSpaces(getMeetingPatterns(schedule), {
    spaceIds: roomRefs.map((ref) => ref.id),
    spaceDisplayNames: roomRefs.map((ref) => ref.label),
  });

  return assignedPatterns.filter((pattern) => {
    const patternRefs = extractRoomReferences({
      spaceIds: pattern.spaceIds,
      spaceDisplayNames: pattern.spaceDisplayNames,
    });
    return patternRefs.some((candidate) => roomMatches(room, candidate));
  });
};

const parseDateParts = (value) => {
  const normalized = normalizeTermDateValue(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parts = {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
};

const dateOrdinal = (parts) =>
  Date.UTC(parts.year, parts.month - 1, parts.day);

const compareDateParts = (left, right) => dateOrdinal(left) - dateOrdinal(right);

const maxDateParts = (left, right) =>
  compareDateParts(left, right) >= 0 ? left : right;

const minDateParts = (left, right) =>
  compareDateParts(left, right) <= 0 ? left : right;

const addDays = (parts, count) => {
  const date = new Date(dateOrdinal(parts));
  date.setUTCDate(date.getUTCDate() + count);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const weekdayForDate = (parts) => new Date(dateOrdinal(parts)).getUTCDay();

const formatDateParts = (parts) =>
  `${parts.year}${pad2(parts.month)}${pad2(parts.day)}`;

const formatLocalDateTime = (parts, minutes, seconds = 0) =>
  `${formatDateParts(parts)}T${pad2(Math.floor(minutes / 60))}${pad2(minutes % 60)}${pad2(seconds)}`;

const zonedPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const readZonedParts = (date) => {
  const values = {};
  zonedPartsFormatter.formatToParts(date).forEach((part) => {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  });
  return values;
};

const zonedDateTimeToUtc = (parts, hour, minute, second) => {
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    second,
  );
  let guess = desiredAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = readZonedParts(new Date(guess));
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const adjustment = desiredAsUtc - actualAsUtc;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
};

const computeFirstOccurrence = (start, jsDays) => {
  const allowed = new Set(jsDays);
  let candidate = start;
  for (let offset = 0; offset < 14; offset += 1) {
    if (allowed.has(weekdayForDate(candidate))) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
};

const groupPatterns = (patterns, schedule, termConfig) => {
  const termStart = parseDateParts(termConfig.startDate);
  const termEnd = parseDateParts(termConfig.endDate);
  if (!termStart || !termEnd || compareDateParts(termEnd, termStart) < 0) return [];

  const groups = new Map();
  patterns.forEach((pattern) => {
    const startMinutes = parseTimeToMinutes(pattern?.startTime);
    const endMinutes = parseTimeToMinutes(pattern?.endTime);
    const meta = dayMetadata[normalizeText(pattern?.day).toUpperCase()];
    if (
      !meta ||
      startMinutes == null ||
      endMinutes == null ||
      endMinutes <= startMinutes
    ) {
      return;
    }

    const patternStart =
      parseDateParts(pattern?.startDate) ||
      parseDateParts(schedule?.startDate) ||
      termStart;
    const patternEnd =
      parseDateParts(pattern?.endDate) ||
      parseDateParts(schedule?.endDate) ||
      termEnd;
    const effectiveStart = maxDateParts(patternStart, termStart);
    const effectiveEnd = minDateParts(patternEnd, termEnd);
    if (compareDateParts(effectiveEnd, effectiveStart) < 0) return;

    const key = [
      startMinutes,
      endMinutes,
      formatDateParts(effectiveStart),
      formatDateParts(effectiveEnd),
    ].join("|");
    const group = groups.get(key) || {
      startMinutes,
      endMinutes,
      effectiveStart,
      effectiveEnd,
      jsDays: new Set(),
      icsDays: new Set(),
    };
    group.jsDays.add(meta.js);
    group.icsDays.add(meta.ics);
    groups.set(key, group);
  });

  return Array.from(groups.values());
};

const buildEventLines = ({
  room,
  schedule,
  group,
  exceptions,
  generatedAt,
  usedUids,
}) => {
  const firstOccurrence = computeFirstOccurrence(
    group.effectiveStart,
    Array.from(group.jsDays),
  );
  if (compareDateParts(firstOccurrence, group.effectiveEnd) > 0) return [];

  const icsDays = ICS_DAY_ORDER.filter((day) => group.icsDays.has(day));
  const byday = icsDays.join(",");
  const roomUidPart = sanitizeForFile(room.id || room.label);
  const scheduleUidPart = sanitizeForFile(
    schedule?.id || schedule?._originalId || "schedule",
  );
  const uidBase = [
    roomUidPart,
    scheduleUidPart,
    byday,
    formatDateParts(firstOccurrence),
    group.startMinutes,
    group.endMinutes,
    formatDateParts(group.effectiveEnd),
  ].join("-");
  let uid = uidBase;
  let suffix = 2;
  while (usedUids.has(uid)) {
    uid = `${uidBase}-${suffix}`;
    suffix += 1;
  }
  usedUids.add(uid);

  const baseName =
    schedule?.courseCode || schedule?.Course || schedule?.title || "Class";
  const summary = [baseName, schedule?.section ? String(schedule.section) : null]
    .filter(Boolean)
    .join(" - ");
  const description = [];
  if (schedule?.courseTitle || schedule?.["Course Title"]) {
    description.push(`Title: ${schedule.courseTitle || schedule["Course Title"]}`);
  }
  if (schedule?.instructorName || schedule?.Instructor) {
    description.push(
      `Instructor: ${schedule.instructorName || schedule.Instructor}`,
    );
  }
  if (schedule?.crn || schedule?.CRN) {
    description.push(`CRN: ${schedule.crn || schedule.CRN}`);
  }
  if (schedule?.term) description.push(`Semester: ${schedule.term}`);
  if (schedule?.notes) description.push(String(schedule.notes));

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}@faculty-schedules`,
    `DTSTAMP:${formatUtcDateTime(generatedAt)}`,
    `SUMMARY:${escapeICS(summary)}`,
  ];
  if (description.length > 0) {
    lines.push(`DESCRIPTION:${escapeICS(description.join("\n"))}`);
  }
  lines.push(
    `LOCATION:${escapeICS(room.label)}`,
    `DTSTART;TZID=${TIME_ZONE}:${formatLocalDateTime(firstOccurrence, group.startMinutes)}`,
    `DTEND;TZID=${TIME_ZONE}:${formatLocalDateTime(firstOccurrence, group.endMinutes)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${formatUtcDateTime(
      zonedDateTimeToUtc(group.effectiveEnd, 23, 59, 59),
    )}`,
  );

  (exceptions || []).forEach((exception) => {
    const exceptionDate = parseDateParts(exception?.date);
    if (
      !exceptionDate ||
      compareDateParts(exceptionDate, group.effectiveStart) < 0 ||
      compareDateParts(exceptionDate, group.effectiveEnd) > 0 ||
      !group.jsDays.has(weekdayForDate(exceptionDate))
    ) {
      return;
    }
    lines.push(
      `EXDATE;TZID=${TIME_ZONE}:${formatLocalDateTime(exceptionDate, group.startMinutes)}`,
    );
  });

  lines.push("END:VEVENT");
  return lines;
};

const scheduleMatchesTerm = (schedule, selectedTerm) => {
  if (!selectedTerm) return true;
  const normalizedSelected = normalizeTermLabel(selectedTerm);
  const normalizedSchedule = normalizeTermLabel(schedule?.term || schedule?.termCode || "");
  return normalizedSchedule === normalizedSelected;
};

export const getDetectedRoomReferences = (schedules = [], selectedTerm = "") => {
  const rooms = new Map();
  schedules.forEach((schedule) => {
    if (isCancelledSchedule(schedule) || !scheduleMatchesTerm(schedule, selectedTerm)) {
      return;
    }
    extractRoomReferences(schedule).forEach((room) => {
      const key = room.id || normalizeKey(room.label);
      if (!rooms.has(key)) rooms.set(key, room);
    });
  });
  return Array.from(rooms.values()).sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { numeric: true }),
  );
};

export const buildRoomCalendarExport = ({
  schedules = [],
  selectedTerm = "",
  termConfig = {},
  selectedRoomLabels,
  generatedAt = new Date(),
} = {}) => {
  const matchingSchedules = schedules.filter((schedule) =>
    scheduleMatchesTerm(schedule, selectedTerm),
  );
  const cancelledScheduleCount = matchingSchedules.filter(isCancelledSchedule).length;
  const activeSchedules = matchingSchedules.filter(
    (schedule) => !isCancelledSchedule(schedule),
  );
  const detectedRooms = getDetectedRoomReferences(activeSchedules, selectedTerm);
  const selectedKeys = Array.isArray(selectedRoomLabels)
    ? new Set(selectedRoomLabels.map(normalizeKey))
    : null;
  const targetRooms = selectedKeys
    ? detectedRooms.filter(
        (room) => selectedKeys.has(normalizeKey(room.label)) || selectedKeys.has(normalizeKey(room.id)),
      )
    : detectedRooms;
  const calendars = [];
  const emptyRooms = [];

  targetRooms.forEach((room) => {
    const header = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//faculty-schedules//OutlookRoomExport//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-TIMEZONE:${TIME_ZONE}`,
      `X-WR-CALNAME:${escapeICS(`${room.label} - ${selectedTerm}`)}`,
      ...buildVTimezone(),
    ];
    const lines = [...header];
    const usedUids = new Set();
    let eventCount = 0;

    activeSchedules.forEach((schedule) => {
      if (!extractRoomReferences(schedule).some((candidate) => roomMatches(room, candidate))) {
        return;
      }
      const groups = groupPatterns(
        patternsForRoom(schedule, room),
        schedule,
        termConfig,
      );
      groups.forEach((group) => {
        const eventLines = buildEventLines({
          room,
          schedule,
          group,
          exceptions: termConfig.exceptions || [],
          generatedAt,
          usedUids,
        });
        if (eventLines.length === 0) return;
        lines.push(...eventLines);
        eventCount += 1;
      });
    });

    if (eventCount === 0) {
      emptyRooms.push(room);
      return;
    }
    lines.push("END:VCALENDAR");
    calendars.push({
      room,
      eventCount,
      filenameBase: sanitizeForFile(room.label),
      ics: `${foldICSLines(lines).join("\r\n")}\r\n`,
    });
  });

  return {
    calendars,
    detectedRooms,
    emptyRooms,
    cancelledScheduleCount,
    totalEventCount: calendars.reduce(
      (total, calendar) => total + calendar.eventCount,
      0,
    ),
  };
};
