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

const normalizeSpaceValues = (value) => (
  Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)))
    : []
);

const buildSpaceReferences = ({ spaceIds = [], spaceDisplayNames = [] } = {}) => {
  const ids = normalizeSpaceValues(spaceIds);
  const labels = normalizeSpaceValues(spaceDisplayNames);
  const count = Math.max(ids.length, labels.length);
  const refs = [];

  for (let index = 0; index < count; index += 1) {
    const id = ids[index] || '';
    const label = labels[index] || id;
    if (!id && !label) continue;
    refs.push({ id, label });
  }

  return refs;
};

const patternHasSpaceAssignment = (pattern) =>
  normalizeSpaceValues(pattern?.spaceIds).length > 0 ||
  normalizeSpaceValues(pattern?.spaceDisplayNames).length > 0;

/**
 * Attach canonical room references to meeting patterns.
 *
 * CLSS emits parallel semicolon-delimited room and meeting segments. When the
 * ordered counts match, each source segment belongs to the room at the same
 * index. A single segment applies to every listed room. Existing explicit
 * assignments are preserved unless `force` is requested after room resolution.
 */
export const assignMeetingPatternSpaces = (
  meetingPatterns = [],
  { spaceIds = [], spaceDisplayNames = [], force = false } = {},
) => {
  const patterns = Array.isArray(meetingPatterns)
    ? meetingPatterns.filter(Boolean)
    : [];
  const refs = buildSpaceReferences({ spaceIds, spaceDisplayNames });
  if (patterns.length === 0 || refs.length === 0) {
    return patterns.map((pattern) => ({ ...pattern }));
  }

  const allSpaceIds = refs.map((ref) => ref.id).filter(Boolean);
  const allSpaceDisplayNames = refs.map((ref) => ref.label).filter(Boolean);
  const hasExistingAssignments = patterns.some(patternHasSpaceAssignment);

  if (hasExistingAssignments && !force) {
    return patterns.map((pattern) => {
      if (!patternHasSpaceAssignment(pattern)) {
        return {
          ...pattern,
          spaceIds: allSpaceIds,
          spaceDisplayNames: allSpaceDisplayNames,
        };
      }
      return {
        ...pattern,
        spaceIds: normalizeSpaceValues(pattern.spaceIds),
        spaceDisplayNames: normalizeSpaceValues(pattern.spaceDisplayNames),
      };
    });
  }

  const rawGroupOrder = [];
  const rawGroupIndexes = new Map();
  patterns.forEach((pattern, index) => {
    const raw = String(pattern?.raw || '').trim().toLowerCase();
    if (!raw) return;
    if (!rawGroupIndexes.has(raw)) {
      rawGroupOrder.push(raw);
      rawGroupIndexes.set(raw, []);
    }
    rawGroupIndexes.get(raw).push(index);
  });

  const canPairBySourceOrder =
    refs.length > 1 &&
    rawGroupOrder.length === refs.length &&
    patterns.every((pattern) => String(pattern?.raw || '').trim());
  const refByPatternIndex = new Map();

  if (canPairBySourceOrder) {
    rawGroupOrder.forEach((raw, groupIndex) => {
      rawGroupIndexes.get(raw).forEach((patternIndex) => {
        refByPatternIndex.set(patternIndex, [refs[groupIndex]]);
      });
    });
  }

  return patterns.map((pattern, index) => {
    const assignedRefs = refByPatternIndex.get(index) || refs;
    return {
      ...pattern,
      spaceIds: assignedRefs.map((ref) => ref.id).filter(Boolean),
      spaceDisplayNames: assignedRefs
        .map((ref) => ref.label)
        .filter(Boolean),
    };
  });
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
