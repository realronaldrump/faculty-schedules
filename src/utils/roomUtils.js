import { getBuildingConfig, getBuildingFromRoom, normalizeBuildingName } from './buildingUtils';

const KEY_PART_REGEX = /[^a-z0-9]+/g;

export const slugifyKeyPart = (value = '') => {
  return String(value)
    .toLowerCase()
    .replace(KEY_PART_REGEX, '_')
    .replace(/^_+|_+$/g, '');
};

export const normalizeRoomNumber = (value = '') => {
  return String(value).replace(/\s+/g, '').toUpperCase();
};

export const splitRoomLabels = (value) => {
  if (!value || typeof value !== 'string') return [];
  return Array.from(new Set(
    value
      .split(/;|\n|\s*\/\s*/)
      .map((part) => part.trim())
      .filter(Boolean)
  ));
};

export const isSkippableLocationLabel = (label) => {
  if (!label || typeof label !== 'string') return true;
  const trimmed = label.trim();
  if (!trimmed) return true;

  const upper = trimmed.toUpperCase();
  if (upper === 'TBA' || upper === 'TO BE ANNOUNCED') return true;
  if (upper === 'NO ROOM NEEDED') return true;
  if (upper === '(NONE ASSIGNED)' || upper === 'NONE ASSIGNED') return true;
  if (upper.includes('ONLINE')) return true;
  if (upper.includes('ZOOM')) return true;
  if (upper.includes('VIRTUAL')) return true;
  if (upper.includes('GENERAL ASSIGNMENT')) return true;
  if (upper.includes('NO ROOM')) return true;

  return false;
};

export const extractRoomNumberFromLabel = (label = '') => {
  if (!label || typeof label !== 'string') return '';
  const trimmed = label.trim();
  if (!trimmed) return '';

  const cleaned = trimmed.replace(/\s+/g, ' ').trim();
  const decimal = cleaned.match(/(\d{2,4}\.\d{1,3}[A-Za-z]?)\s*$/);
  if (decimal?.[1]) return normalizeRoomNumber(decimal[1]);

  const simple = cleaned.match(/(\d{2,4}[A-Za-z]?)\s*$/);
  if (simple?.[1]) return normalizeRoomNumber(simple[1]);

  const token = cleaned.match(/([\w./-]+)\s*$/);
  if (token?.[1] && /\d/.test(token[1])) return normalizeRoomNumber(token[1]);

  return '';
};

export const resolveBuildingRecord = (buildingName) => {
  const normalized = normalizeBuildingName(buildingName);
  if (!normalized) return null;
  const target = normalized.toLowerCase();

  const config = getBuildingConfig();
  const buildings = Array.isArray(config?.buildings) ? config.buildings : [];

  return buildings.find((building) => {
    if (!building || building.isActive === false) return false;
    const display = (building.displayName || '').toLowerCase();
    const code = (building.code || '').toLowerCase();
    return (display && display === target) || (code && code === target);
  }) || null;
};

export const buildRoomKey = ({ buildingName = '', buildingCode = '', roomNumber = '' } = {}) => {
  const normalizedRoomNumber = normalizeRoomNumber(roomNumber);
  const building = normalizeBuildingName(buildingName);
  const buildingRecord = resolveBuildingRecord(building);
  const code = (buildingCode || buildingRecord?.code || '').trim();

  const base = slugifyKeyPart(code || building);
  if (!base || !normalizedRoomNumber) return '';
  return `${base}_${normalizedRoomNumber}`;
};

export const parseRoomLabel = (label) => {
  if (!label || typeof label !== 'string') return null;
  const raw = label.trim();
  if (!raw) return null;
  if (isSkippableLocationLabel(raw)) return null;

  const buildingName = getBuildingFromRoom(raw);
  if (!buildingName) return null;
  if (buildingName === 'Online' || buildingName === 'Off Campus') return null;

  const roomNumber = extractRoomNumberFromLabel(raw);

  const buildingRecord = resolveBuildingRecord(buildingName);
  const buildingCode = buildingRecord?.code || '';
  const roomKey = roomNumber ? buildRoomKey({ buildingName, buildingCode, roomNumber }) : '';
  const displayName = roomNumber ? `${buildingName} ${roomNumber}` : buildingName;

  return {
    raw,
    building: buildingName,
    buildingCode,
    roomNumber,
    roomKey,
    displayName
  };
};

export const getRoomKeyFromRoomRecord = (room) => {
  if (!room || typeof room !== 'object') return '';
  const direct = typeof room.roomKey === 'string' ? room.roomKey.trim() : '';
  if (direct) return direct;

  const buildingName = normalizeBuildingName(room.building || '');
  const roomNumber = normalizeRoomNumber(room.roomNumber || extractRoomNumberFromLabel(room.displayName || room.name || ''));
  if (!buildingName || !roomNumber) return '';
  return buildRoomKey({ buildingName, roomNumber });
};

