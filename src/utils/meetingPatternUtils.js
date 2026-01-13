export const parseMeetingPatterns = (source, meetingsStr = '') => {
  const resolveSources = () => {
    let meetingPattern = '';
    let meetings = '';
    if (typeof source === 'string') {
      meetingPattern = source;
    } else if (source && typeof source === 'object') {
      meetingPattern = source['Meeting Pattern'] || source['MeetingPattern'] || '';
      meetings = source['Meetings'] || '';
    }
    if (typeof meetingsStr === 'string' && meetingsStr.trim()) {
      meetings = meetingsStr;
    }
    return { meetingPattern, meetings };
  };

  const { meetingPattern, meetings } = resolveSources();

  const buildSegments = (raw) => (
    (raw || '')
      .replace(/\r/g, '\n')
      .split(/;|\n/)
      .map(segment => segment.trim())
      .filter(Boolean)
  );

  const isExamSegment = (segment) => /final|exam/i.test(segment || '');

  const dedupeSegments = (segments) => {
    const seen = new Set();
    return segments.filter((segment) => {
      const key = segment.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const meetingSegments = dedupeSegments(
    buildSegments(meetings).filter((segment) => !isExamSegment(segment))
  );
  const patternSegments = dedupeSegments(buildSegments(meetingPattern));

  const segments = meetingSegments.length > 0 ? meetingSegments : patternSegments;
  if (segments.length === 0) return [];

  const patterns = [];
  const dayMap = { M: 'M', T: 'T', W: 'W', R: 'R', F: 'F', S: 'S', U: 'U' };

  const pushTimedPattern = (daysStr, startToken, endToken, raw) => {
    const startTime = normalizeTime(startToken);
    const endTime = normalizeTime(endToken);
    if (!startTime || !endTime) return false;

    let pushed = false;
    for (const char of daysStr) {
      const day = dayMap[char.toUpperCase()];
      if (day) {
        patterns.push({
          day,
          startTime,
          endTime,
          startDate: null,
          endDate: null,
          raw
        });
        pushed = true;
      }
    }
    return pushed;
  };

  for (const segment of segments) {
    if (!segment || /does not meet/i.test(segment)) {
      continue;
    }

    const normalized = segment.replace(/\s+/g, ' ').trim();
    const dayMatch = normalized.match(/^([MTWRFSU]+)\s+/i);
    if (dayMatch) {
      const daysStr = dayMatch[1].toUpperCase();
      const remainder = normalized.slice(dayMatch[0].length).trim();
      const timeSplit = remainder.split(/\s*(?:-|to)\s*/i);
      if (timeSplit.length >= 2) {
        const startToken = extractTimeToken(timeSplit[0]);
        const endToken = extractTimeToken(timeSplit[1]);
        if (pushTimedPattern(daysStr, startToken, endToken, normalized)) {
          continue;
        }
      }
    }

    const timeMatches = normalized.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{3,4})/gi);
    if (dayMatch && timeMatches && timeMatches.length >= 2) {
      const startToken = timeMatches[0];
      const endToken = timeMatches[1];
      if (pushTimedPattern(dayMatch[1].toUpperCase(), startToken, endToken, normalized)) {
        continue;
      }
    }

    if (/online/i.test(normalized) || /asynch/i.test(normalized)) {
      patterns.push({
        day: null,
        startTime: '',
        endTime: '',
        startDate: null,
        endDate: null,
        mode: 'online',
        raw: normalized
      });
      continue;
    }

    if (/arranged/i.test(normalized) || /tba/i.test(normalized) || /independent/i.test(normalized)) {
      patterns.push({
        day: null,
        startTime: '',
        endTime: '',
        startDate: null,
        endDate: null,
        mode: 'arranged',
        raw: normalized
      });
      continue;
    }

    patterns.push({
      day: null,
      startTime: '',
      endTime: '',
      startDate: null,
      endDate: null,
      raw: normalized
    });
  }

  return patterns;
};

const extractTimeToken = (value) => {
  if (!value) return '';
  const match = String(value).match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{3,4})/i);
  return match ? match[0] : String(value).trim();
};

export const normalizeTime = (timeStr) => {
  if (!timeStr) return '';

  const cleaned = String(timeStr).toLowerCase().replace(/[^0-9apm:]/g, '').trim();
  if (!cleaned) return '';

  const match = cleaned.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
  if (!match) {
    return String(timeStr).trim();
  }

  let [, hourStr, minuteStr, ampm] = match;
  let hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) {
    return String(timeStr).trim();
  }
  let minute = Number.parseInt(minuteStr ?? '0', 10);
  if (Number.isNaN(minute)) minute = 0;

  if (!ampm) {
    if (hour > 23) {
      return String(timeStr).trim();
    }
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}`;
  }

  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm.toUpperCase()}`;
};
