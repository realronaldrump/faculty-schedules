const HEADER_NORMALIZE_REGEX = /\s+/g;

export const normalizeCsvHeader = (value) => {
  if (!value) return '';
  return value
    .replace(/\ufeff/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(HEADER_NORMALIZE_REGEX, ' ')
    .trim()
    .toLowerCase();
};

export const detectGoveeCsvColumns = (headers = []) => {
  const normalized = headers.map(normalizeCsvHeader);
  let timestampIndex = -1;
  let temperatureIndex = -1;
  let humidityIndex = -1;
  let temperatureUnit = null;

  normalized.forEach((header, index) => {
    if (timestampIndex === -1 && header.includes('timestamp')) {
      timestampIndex = index;
    }
    if (temperatureIndex === -1 && header.includes('temperature')) {
      temperatureIndex = index;
      if (header.includes('fahrenheit')) temperatureUnit = 'F';
      if (header.includes('celsius')) temperatureUnit = 'C';
    }
    if (humidityIndex === -1 && header.includes('humidity')) {
      humidityIndex = index;
    }
  });

  if (timestampIndex === -1) {
    normalized.forEach((header, index) => {
      if (timestampIndex === -1 && header.includes('time')) {
        timestampIndex = index;
      }
    });
  }

  return {
    timestampIndex,
    temperatureIndex,
    humidityIndex,
    temperatureUnit
  };
};

export const parseDeviceLabelFromFilename = (filename = '') => {
  const baseName = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const trimmed = baseName.replace(/\s*\[\d+\]$/i, '').replace(/\s*\(\d+\)$/i, '');
  const lower = trimmed.toLowerCase();
  const exportIndex = lower.lastIndexOf('_export_');
  if (exportIndex !== -1) {
    return trimmed.slice(0, exportIndex).trim();
  }
  const altMatch = trimmed.match(/^(.*?)(?:\s+export\s+|export_)/i);
  if (altMatch && altMatch[1]) return altMatch[1].trim();
  return trimmed.trim();
};

export const normalizeMatchText = (value = '') => {
  try {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .replace(HEADER_NORMALIZE_REGEX, ' ')
      .trim()
      .toLowerCase();
  } catch (_) {
    return value
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .replace(HEADER_NORMALIZE_REGEX, ' ')
      .trim()
      .toLowerCase();
  }
};

export const extractRoomTokens = (label = '') => {
  const tokens = new Set();
  const normalized = label.replace(/,/g, ' ');
  const decimalMatches = normalized.match(/\b\d{2,4}\.\d{1,3}[A-Za-z]?\b/g) || [];
  decimalMatches.forEach((m) => tokens.add(m));
  const numberMatches = normalized.match(/\b\d{2,4}[A-Za-z]?\b/g) || [];
  numberMatches.forEach((m) => tokens.add(m));
  const prefixedMatches = normalized.match(/\b[A-Za-z]{1,3}\d{2,4}\b/g) || [];
  prefixedMatches.forEach((m) => tokens.add(m));
  return Array.from(tokens);
};

export const normalizeRoomNumber = (value = '') => {
  return value.replace(/\s+/g, '').toUpperCase();
};

export const toBuildingKey = (buildingName = '') => {
  const cleaned = buildingName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'unknown';
};

export const toDeviceId = (buildingName = '', deviceLabel = '') => {
  const buildingKey = toBuildingKey(buildingName);
  const labelSlug = deviceLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = `${buildingKey}__${labelSlug || 'device'}`;
  if (base.length <= 120) return base;
  const hash = simpleHash(base);
  return `${base.slice(0, 90)}__${hash}`;
};

export const toDeviceDayId = (deviceId = '', dateLocal = '') => {
  return `${deviceId}__${dateLocal}`;
};

export const toSnapshotDocId = (buildingName = '', roomId = '', dateLocal = '', snapshotId = '') => {
  return `${toBuildingKey(buildingName)}__${roomId}__${dateLocal}__${snapshotId}`;
};

const simpleHash = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export const parseLocalTimestamp = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    raw: trimmed
  };
};

export const toDateKey = (parts) => {
  if (!parts) return '';
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getMinutesSinceMidnight = (parts) => {
  if (!parts) return null;
  return (parts.hour * 60) + parts.minute;
};

const getZonedParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const output = {};
  parts.forEach((p) => {
    if (p.type !== 'literal') output[p.type] = p.value;
  });
  return {
    year: Number(output.year),
    month: Number(output.month),
    day: Number(output.day),
    hour: Number(output.hour),
    minute: Number(output.minute),
    second: Number(output.second)
  };
};

export const zonedTimeToUtc = (parts, timeZone) => {
  if (!parts || !timeZone) return null;
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const zonedParts = getZonedParts(new Date(utcGuess), timeZone);
  const zonedAsUtc = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second
  );
  const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const diffMs = desiredAsUtc - zonedAsUtc;
  return new Date(utcGuess + diffMs);
};

export const formatDateInTimeZone = (date, timeZone) => {
  if (!date) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
};
