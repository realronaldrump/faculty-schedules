import admin from 'firebase-admin';
import JSZip from 'jszip';
import { DateTime } from 'luxon';

export const config = { runtime: 'nodejs18.x' };

const TZID = 'America/Chicago';
const VTIMEZONE_LINES = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'X-LIC-LOCATION:America/Chicago',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0500',
  'TZNAME:CDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0600',
  'TZNAME:CST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE'
];

const SCHEDULE_SKIP_KEYS = [
  'noClassDates',
  'noClasses',
  'holidayDates',
  'holidays',
  'exceptions',
  'exceptionDates',
  'cancelledMeetings',
  'cancelledDates',
  'canceledDates',
  'skipDates',
  'skipMeetingDates',
  'nonInstructionalDates',
  'blackoutDates'
];

let firestoreInstance;

const getServiceAccountConfig = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (error) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error);
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  return null;
};

const ensureFirestore = () => {
  if (firestoreInstance) return firestoreInstance;
  if (!admin.apps.length) {
    const serviceAccount = getServiceAccountConfig();
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      admin.initializeApp();
    }
  }
  firestoreInstance = admin.firestore();
  return firestoreInstance;
};

const normalizeRoomName = (room) => {
  if (!room) return '';
  return room.toString().trim().toLowerCase().replace(/\s+/g, ' ');
};

const fileSafe = (value, fallback = 'value') => {
  if (!value) return fallback;
  const cleaned = value.toString().trim().replace(/[^A-Za-z0-9-_]+/g, '_');
  return cleaned || fallback;
};

const escapeText = (text) => (text || '')
  .toString()
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const foldLines = (lines) => {
  const maxLen = 75;
  const folded = [];
  lines.forEach((line) => {
    const value = line == null ? '' : line.toString();
    if (value.length <= maxLen) {
      folded.push(value);
      return;
    }
    folded.push(value.slice(0, maxLen));
    let index = maxLen;
    const continuation = maxLen - 1;
    while (index < value.length) {
      folded.push(' ' + value.slice(index, index + continuation));
      index += continuation;
    }
  });
  return folded;
};
const toDateTime = (value) => {
  if (!value && value !== 0) return null;
  if (DateTime.isDateTime(value)) {
    return value.setZone(TZID);
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone: TZID });
  }
  if (typeof value === 'number') {
    return DateTime.fromMillis(value, { zone: TZID });
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    let dt = DateTime.fromISO(trimmed, { zone: TZID });
    if (dt.isValid) return dt;
    const formats = ['M/d/yyyy', 'M/d/yy', 'MM/dd/yyyy', 'MM/dd/yy', 'yyyy/MM/dd', 'yyyyMMdd'];
    for (const format of formats) {
      dt = DateTime.fromFormat(trimmed, format, { zone: TZID });
      if (dt.isValid) return dt;
    }
    return null;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      return DateTime.fromJSDate(value.toDate(), { zone: TZID });
    }
    if (typeof value.seconds === 'number') {
      const millis = (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
      return DateTime.fromMillis(millis, { zone: TZID });
    }
    if (value.date) {
      return toDateTime(value.date);
    }
    if (value.startDate || value.endDate) {
      const start = toDateTime(value.startDate || value.start);
      const end = toDateTime(value.endDate || value.end);
      if (start?.isValid) return start;
      if (end?.isValid) return end;
    }
  }
  return null;
};

const collectDates = (input, addIso) => {
  if (!input && input !== 0) return;
  if (Array.isArray(input)) {
    input.forEach((item) => collectDates(item, addIso));
    return;
  }
  if (typeof input === 'string') {
    const parts = input.split(/[,;]+/).map(part => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach(part => collectDates(part, addIso));
      return;
    }
    const dt = toDateTime(input);
    if (dt?.isValid) addIso(dt);
    return;
  }
  if (DateTime.isDateTime(input)) {
    if (input.isValid) addIso(input);
    return;
  }
  if (input instanceof Date || typeof input === 'number' || (input && typeof input.seconds === 'number')) {
    const dt = toDateTime(input);
    if (dt?.isValid) addIso(dt);
    return;
  }
  if (typeof input === 'object') {
    if (input.date) {
      collectDates(input.date, addIso);
    }
    const start = toDateTime(input.startDate || input.start || input.begin);
    const end = toDateTime(input.endDate || input.end || input.finish);
    if (start?.isValid && end?.isValid) {
      let cursor = start.startOf('day');
      const last = end.startOf('day');
      while (cursor <= last) {
        addIso(cursor);
        cursor = cursor.plus({ days: 1 });
      }
      return;
    }
    Object.keys(input).forEach((key) => {
      if (!['startDate', 'start', 'begin', 'endDate', 'end', 'finish', 'date'].includes(key)) {
        collectDates(input[key], addIso);
      }
    });
  }
};

const buildScheduleSkipSet = (schedule, pattern) => {
  const skipSet = new Set();
  const addIso = (dt) => {
    if (dt?.isValid) skipSet.add(dt.toISODate());
  };
  SCHEDULE_SKIP_KEYS.forEach((key) => collectDates(schedule?.[key], addIso));
  if (pattern) {
    SCHEDULE_SKIP_KEYS.forEach((key) => collectDates(pattern?.[key], addIso));
  }
  return skipSet;
};

const extractScheduleRooms = (schedule) => {
  const rooms = new Set();
  const add = (value) => {
    if (!value && value !== 0) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (typeof value === 'string') {
      value.split(/[,;]+/).map(part => part.trim()).filter(Boolean).forEach((part) => rooms.add(part));
      return;
    }
    if (typeof value === 'object') {
      if (value.displayName) add(value.displayName);
      if (value.name) add(value.name);
    }
  };
  add(schedule?.roomNames);
  add(schedule?.rooms);
  add(schedule?.roomName);
  add(schedule?.Room);
  add(schedule?.room);
  return Array.from(rooms);
};

const DAY_ALIASES = {
  M: 1, MON: 1, MONDAY: 1,
  T: 2, TU: 2, TUE: 2, TUESDAY: 2,
  W: 3, WE: 3, WED: 3, WEDNESDAY: 3,
  R: 4, TH: 4, THU: 4, THUR: 4, THURSDAY: 4,
  F: 5, FR: 5, FRI: 5, FRIDAY: 5,
  S: 6, SA: 6, SAT: 6, SATURDAY: 6,
  U: 7, SU: 7, SUN: 7, SUNDAY: 7
};

const weekdayToByDay = {
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
  7: 'SU'
};

const mapDayCode = (value) => {
  if (!value) return null;
  const trimmed = value.toString().trim().toUpperCase();
  if (!trimmed) return null;
  if (DAY_ALIASES[trimmed] != null) return DAY_ALIASES[trimmed];
  if (trimmed.length > 2) {
    if (DAY_ALIASES[trimmed.slice(0, 2)]) return DAY_ALIASES[trimmed.slice(0, 2)];
    if (DAY_ALIASES[trimmed.slice(0, 1)]) return DAY_ALIASES[trimmed.slice(0, 1)];
  }
  return null;
};

const parseDayPattern = (pattern) => {
  if (!pattern) return [];
  const cleaned = pattern.toString().toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleaned) return [];
  const result = [];
  let index = 0;
  while (index < cleaned.length) {
    const char = cleaned[index];
    if (char === 'T' && cleaned[index + 1] === 'H') {
      result.push('R');
      index += 2;
      continue;
    }
    if (char === 'S' && cleaned[index + 1] === 'U') {
      result.push('SU');
      index += 2;
      continue;
    }
    if (char === 'S' && cleaned[index + 1] === 'A') {
      result.push('SA');
      index += 2;
      continue;
    }
    result.push(char);
    index += 1;
  }
  return Array.from(new Set(result));
};

const parseTimeString = (value) => {
  if (!value) return null;
  const stringValue = value.toString().trim();
  if (!stringValue) return null;
  const formats = ['h:mm a', 'h:mma', 'hh:mm a', 'H:mm', 'HH:mm', 'h a'];
  for (const format of formats) {
    const dt = DateTime.fromFormat(stringValue, format, { zone: TZID });
    if (dt.isValid) {
      return { hour: dt.hour, minute: dt.minute };
    }
  }
  const fromIso = DateTime.fromISO(stringValue, { zone: TZID });
  if (fromIso.isValid) {
    return { hour: fromIso.hour, minute: fromIso.minute };
  }
  return null;
};

const buildFallbackPatterns = (schedule) => {
  const dayString = schedule?.Day || schedule?.day;
  const startTime = schedule?.['Start Time'] || schedule?.startTime || schedule?.start_time;
  const endTime = schedule?.['End Time'] || schedule?.endTime || schedule?.end_time;
  if (!dayString || !startTime || !endTime) return [];
  const days = parseDayPattern(dayString);
  return days.map(day => ({ day, startTime, endTime }));
};

const fetchTermDocument = async (db, term) => {
  const trimmed = term.trim();
  const candidates = [
    { field: 'name', value: trimmed },
    { field: 'term', value: trimmed },
    { field: 'displayName', value: trimmed },
    { field: 'termName', value: trimmed },
    { field: 'termCode', value: trimmed }
  ];
  for (const candidate of candidates) {
    try {
      const snapshot = await db.collection('terms').where(candidate.field, '==', candidate.value).limit(1).get();
      if (!snapshot.empty) {
        return snapshot.docs[0].data();
      }
    } catch (error) {
      // ignore missing collection errors
    }
  }
  return null;
};

const resolveTermInfo = (termDoc, schedules, fallbackTermName) => {
  const startCandidates = [];
  const endCandidates = [];

  const pushRange = (startValue, endValue) => {
    const start = toDateTime(startValue);
    const end = toDateTime(endValue);
    if (start?.isValid) startCandidates.push(start);
    if (end?.isValid) endCandidates.push(end);
  };

  if (termDoc) {
    pushRange(termDoc.startDate || termDoc.start || termDoc.start_of_term || termDoc.termStart || termDoc.beginDate,
      termDoc.endDate || termDoc.end || termDoc.end_of_term || termDoc.termEnd || termDoc.finishDate);
    if (termDoc.academicDates) {
      pushRange(termDoc.academicDates.startDate, termDoc.academicDates.endDate);
    }
  }

  schedules.forEach((schedule) => {
    pushRange(schedule.startDate || schedule.termStart || schedule.customStartDate || schedule.start_date,
      schedule.endDate || schedule.termEnd || schedule.customEndDate || schedule.end_date);
    const patterns = Array.isArray(schedule.meetingPatterns) ? schedule.meetingPatterns : [];
    patterns.forEach((pattern) => {
      pushRange(pattern?.startDate || pattern?.start, pattern?.endDate || pattern?.end);
    });
  });

  if (startCandidates.length === 0 || endCandidates.length === 0) {
    throw new Error('No term start or end dates found for the selected term.');
  }

  const startDate = DateTime.min(...startCandidates).startOf('day');
  const endDate = DateTime.max(...endCandidates).endOf('day');
  if (endDate < startDate) {
    throw new Error('The detected term date range is invalid.');
  }

  const skipDateSet = new Set();
  const addIso = (dt) => {
    if (dt?.isValid) skipDateSet.add(dt.toISODate());
  };
  if (termDoc) {
    ['noClassDates', 'noClassDays', 'holidays', 'holidayDates', 'breaks', 'excludedDates', 'nonInstructionalDates', 'blackoutDates']
      .forEach((key) => collectDates(termDoc[key], addIso));
  }

  schedules.forEach((schedule) => {
    const scheduleSkips = buildScheduleSkipSet(schedule);
    scheduleSkips.forEach((iso) => skipDateSet.add(iso));
  });

  return {
    termName: termDoc?.name || termDoc?.term || fallbackTermName,
    startDate,
    endDate,
    skipDateSet
  };
};
const createEvent = (schedule, pattern, roomName, termInfo, uniqueIdSegment) => {
  const dayValue = pattern?.day || schedule?.Day;
  const weekday = mapDayCode(dayValue);
  if (!weekday) return null;

  const timeStart = parseTimeString(pattern?.startTime || schedule?.startTime || schedule?.['Start Time']);
  const timeEnd = parseTimeString(pattern?.endTime || schedule?.endTime || schedule?.['End Time']);
  if (!timeStart || !timeEnd) return null;
  if ((timeEnd.hour * 60 + timeEnd.minute) <= (timeStart.hour * 60 + timeStart.minute)) return null;

  let rangeStart = toDateTime(pattern?.startDate || schedule?.startDate || schedule?.customStartDate) || termInfo.startDate;
  let rangeEnd = toDateTime(pattern?.endDate || schedule?.endDate || schedule?.customEndDate) || termInfo.endDate;

  if (!rangeStart || !rangeEnd) return null;
  if (rangeStart < termInfo.startDate) rangeStart = termInfo.startDate;
  if (rangeEnd > termInfo.endDate) rangeEnd = termInfo.endDate;
  if (rangeEnd < rangeStart) return null;

  let firstOccurrence = rangeStart;
  if (firstOccurrence.weekday !== weekday) {
    const diff = (weekday + 7 - firstOccurrence.weekday) % 7;
    firstOccurrence = firstOccurrence.plus({ days: diff });
  }
  if (firstOccurrence > rangeEnd) return null;

  let lastOccurrence = rangeEnd;
  if (lastOccurrence.weekday !== weekday) {
    const diffBack = (lastOccurrence.weekday - weekday + 7) % 7;
    lastOccurrence = lastOccurrence.minus({ days: diffBack });
  }
  if (lastOccurrence < firstOccurrence) return null;

  const startDateTime = firstOccurrence.set({ hour: timeStart.hour, minute: timeStart.minute, second: 0, millisecond: 0 });
  const endDateTime = firstOccurrence.set({ hour: timeEnd.hour, minute: timeEnd.minute, second: 0, millisecond: 0 });
  const lastEndDateTime = lastOccurrence.set({ hour: timeEnd.hour, minute: timeEnd.minute, second: 0, millisecond: 0 });

  const byDay = weekdayToByDay[weekday];
  if (!byDay) return null;

  const scheduleSkipSet = buildScheduleSkipSet(schedule, pattern);
  const exdates = [];
  const combinedSkip = new Set([...termInfo.skipDateSet, ...scheduleSkipSet]);
  combinedSkip.forEach((isoDate) => {
    const dt = DateTime.fromISO(isoDate, { zone: TZID });
    if (!dt.isValid) return;
    if (dt < startDateTime.startOf('day') || dt > lastEndDateTime.endOf('day')) return;
    if (dt.weekday !== weekday) return;
    const ex = dt.set({ hour: timeStart.hour, minute: timeStart.minute, second: 0, millisecond: 0 });
    if (ex >= startDateTime && ex <= lastEndDateTime) {
      exdates.push(ex.toFormat("yyyyMMdd'T'HHmmss"));
    }
  });
  exdates.sort();

  const summaryParts = [];
  if (schedule.courseCode || schedule.Course) summaryParts.push(schedule.courseCode || schedule.Course);
  if (schedule.Section || schedule.section) summaryParts.push(`Sec ${schedule.Section || schedule.section}`);
  const summaryBase = summaryParts.join(' ').trim();
  const fullSummary = summaryBase
    ? `${summaryBase}${schedule['Course Title'] || schedule.courseTitle ? ` - ${schedule['Course Title'] || schedule.courseTitle}` : ''}`
    : (schedule['Course Title'] || schedule.courseTitle || roomName);

  const descriptionParts = [];
  if (schedule['Course Title'] || schedule.courseTitle) descriptionParts.push(schedule['Course Title'] || schedule.courseTitle);
  if (schedule.Instructor || schedule.instructorName) descriptionParts.push(`Instructor: ${schedule.Instructor || schedule.instructorName}`);
  if (schedule.Section || schedule.section) descriptionParts.push(`Section: ${schedule.Section || schedule.section}`);
  if (schedule.CRN || schedule.crn) descriptionParts.push(`CRN: ${schedule.CRN || schedule.crn}`);
  if (schedule.term || schedule.Term) descriptionParts.push(`Term: ${schedule.term || schedule.Term}`);
  const description = descriptionParts.join('\n');

  const uidBase = schedule.id || schedule._originalId || schedule.CRN || schedule.crn || schedule.courseCode || schedule.Course || 'course';
  const uid = `${fileSafe(uidBase)}-${uniqueIdSegment}@faculty-schedules`;

  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'")}`,
    `SUMMARY:${escapeText(fullSummary)}`,
    `LOCATION:${escapeText(roomName)}`,
    `DTSTART;TZID=${TZID}:${startDateTime.toFormat("yyyyMMdd'T'HHmmss")}`,
    `DTEND;TZID=${TZID}:${endDateTime.toFormat("yyyyMMdd'T'HHmmss")}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${lastEndDateTime.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}`
  ];
  if (description) {
    lines.push(`DESCRIPTION:${escapeText(description)}`);
  }
  exdates.forEach((exdate) => {
    lines.push(`EXDATE;TZID=${TZID}:${exdate}`);
  });
  lines.push('END:VEVENT');

  return { lines, count: 1 };
};

const buildCalendarForRoom = (roomLabel, normalizedRoom, schedules, termInfo) => {
  const events = [];
  let eventCount = 0;

  schedules.forEach((schedule) => {
    const scheduleRooms = extractScheduleRooms(schedule);
    const match = scheduleRooms.find((candidate) => normalizeRoomName(candidate) === normalizedRoom);
    if (!match && normalizedRoom) return;
    const locationName = match || roomLabel;

    let patterns = Array.isArray(schedule.meetingPatterns) ? schedule.meetingPatterns : [];
    if (!patterns.length) {
      patterns = buildFallbackPatterns(schedule);
    }
    patterns.forEach((pattern, index) => {
      const event = createEvent(schedule, pattern, locationName, termInfo, `${normalizedRoom}-${index}`);
      if (event) {
        events.push(...event.lines);
        eventCount += event.count;
      }
    });
  });

  if (eventCount === 0) {
    return { ics: null, eventCount: 0 };
  }

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//faculty-schedules//ICS Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`${termInfo.termName || ''} ${roomLabel}`.trim() || roomLabel)}`,
    `X-WR-TIMEZONE:${TZID}`,
    ...VTIMEZONE_LINES
  ];

  const lines = [...header, ...events, 'END:VCALENDAR'];
  const folded = foldLines(lines);
  return { ics: `${folded.join('\r\n')}\r\n`, eventCount };
};
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const term = (req.query.term || '').toString().trim();
  const roomsParam = req.query.rooms;
  const rooms = Array.isArray(roomsParam)
    ? roomsParam.map(value => value.toString().trim())
    : roomsParam
      ? [roomsParam.toString().trim()]
      : [];
  const uniqueRooms = Array.from(new Set(rooms.filter(Boolean)));

  if (!term) {
    return res.status(400).json({ error: 'The term parameter is required.' });
  }
  if (uniqueRooms.length === 0) {
    return res.status(400).json({ error: 'At least one room must be specified.' });
  }

  try {
    const db = ensureFirestore();
    const termDoc = await fetchTermDocument(db, term);

    const schedulesCollection = db.collection('schedules');
    let scheduleDocs = [];

    try {
      const snapshot = await schedulesCollection.where('term', '==', term).get();
      scheduleDocs = snapshot.docs;
    } catch (error) {
      // ignore and try fallback
    }

    if (!scheduleDocs.length) {
      try {
        const snapshot = await schedulesCollection.where('Term', '==', term).get();
        scheduleDocs = snapshot.docs;
      } catch (error) {
        // ignore fallback errors
      }
    }

    if (!scheduleDocs.length) {
      return res.status(404).json({ error: 'No schedules were found for the requested term.' });
    }

    const schedules = scheduleDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const termInfo = resolveTermInfo(termDoc, schedules, term);

    const requestedRooms = uniqueRooms.map((room) => ({
      original: room,
      normalized: normalizeRoomName(room)
    }));

    const calendars = requestedRooms.map(({ original, normalized }) => {
      const { ics, eventCount } = buildCalendarForRoom(original, normalized, schedules, termInfo);
      return { original, normalized, ics, eventCount };
    }).filter((entry) => entry.ics);

    if (!calendars.length) {
      return res.status(404).json({ error: 'No scheduled meetings were found for the selected rooms.' });
    }

    const totalEvents = calendars.reduce((sum, item) => sum + (item.eventCount || 0), 0);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Event-Count', totalEvents.toString());

    if (calendars.length === 1) {
      const calendar = calendars[0];
      const fileName = `${fileSafe(termInfo.termName || term, 'term')}-${fileSafe(calendar.original, 'room')}.ics`;
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.status(200).send(calendar.ics);
    }

    const zip = new JSZip();
    calendars.forEach((calendar) => {
      const fileName = `${fileSafe(termInfo.termName || term, 'term')}-${fileSafe(calendar.original, 'room')}.ics`;
      zip.file(fileName, calendar.ics);
    });
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const roomSlug = calendars.length > 3
      ? `${fileSafe(calendars[0].original, 'room')}-and-${calendars.length - 1}-more`
      : calendars.map((calendar) => fileSafe(calendar.original, 'room')).join('-');
    const zipName = `${fileSafe(termInfo.termName || term, 'term')}-${roomSlug || 'rooms'}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    return res.status(200).send(zipBuffer);
  } catch (error) {
    console.error('Failed to export ICS:', error);
    return res.status(500).json({ error: 'Unable to build calendar export at this time.' });
  }
}
