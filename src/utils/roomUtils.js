/**
 * Room Utilities - Facade for Location Service
 *
 * This module provides backward-compatible functions that delegate to locationService.
 * New code should import directly from locationService instead.
 *
 * @deprecated Import from locationService.js instead
 */

import {
  slugify,
  normalizeSpaceNumber,
  splitMultiRoom,
  isSkippableLocation,
  extractSpaceNumber,
  parseRoomLabel as _parseRoomLabel,
  buildSpaceKey,
  resolveBuilding,
  normalizeBuildingName,
  getBuildingDisplay
} from './locationService';

// Re-export for backward compatibility
export const slugifyKeyPart = slugify;
export const normalizeRoomNumber = normalizeSpaceNumber;
export const splitRoomLabels = splitMultiRoom;
export const isSkippableLocationLabel = isSkippableLocation;
export const extractRoomNumberFromLabel = extractSpaceNumber;

/**
 * Resolve a building record from a building name
 * @deprecated Use resolveBuilding from locationService instead
 */
export const resolveBuildingRecord = (buildingName) => {
  return resolveBuilding(buildingName);
};

/**
 * Build a room key from components
 * @deprecated Use buildSpaceKey from locationService instead
 */
export const buildRoomKey = ({ buildingName = '', buildingCode = '', roomNumber = '' } = {}) => {
  const building = resolveBuilding(buildingName);
  const code = (buildingCode || building?.code || '').trim();

  if (!code && !buildingName) return '';

  const normalizedNumber = normalizeSpaceNumber(roomNumber);
  if (!normalizedNumber) return '';

  const base = slugify(code || buildingName);
  if (!base) return '';

  // Legacy format: building_roomnumber (underscore-separated)
  return `${base}_${normalizedNumber}`;
};

/**
 * Parse a room label into structured components
 *
 * @param {string} label - Room label to parse
 * @returns {Object|null} Parsed room data
 *
 * Note: This returns a backward-compatible format. For the new format, use
 * parseRoomLabel from locationService directly.
 */
export const parseRoomLabel = (label) => {
  const parsed = _parseRoomLabel(label);
  if (!parsed) return null;

  // Return backward-compatible format
  return {
    raw: parsed.raw,
    building: parsed.building?.displayName || '',
    buildingCode: parsed.buildingCode || parsed.building?.code || '',
    roomNumber: parsed.spaceNumber,
    roomKey: parsed.spaceKey ? parsed.spaceKey.replace(':', '_').toLowerCase() : '',
    displayName: parsed.displayName,
    // New fields for transition
    spaceKey: parsed.spaceKey,
    spaceNumber: parsed.spaceNumber,
    locationType: parsed.locationType
  };
};

/**
 * Get room key from a room record
 * @deprecated Use spaceKey from room record directly
 */
export const getRoomKeyFromRoomRecord = (room) => {
  if (!room || typeof room !== 'object') return '';

  // Prefer spaceKey (new format)
  if (room.spaceKey) return room.spaceKey;

  // Fall back to roomKey (legacy format)
  const direct = typeof room.roomKey === 'string' ? room.roomKey.trim() : '';
  if (direct) return direct;

  // Derive from components
  const buildingName = normalizeBuildingName(room.building || room.buildingDisplayName || '');
  const roomNumber = normalizeSpaceNumber(
    room.spaceNumber || room.roomNumber || extractSpaceNumber(room.displayName || room.name || '')
  );

  if (!buildingName || !roomNumber) return '';

  return buildRoomKey({ buildingName, roomNumber });
};

export default {
  slugifyKeyPart,
  normalizeRoomNumber,
  splitRoomLabels,
  isSkippableLocationLabel,
  extractRoomNumberFromLabel,
  resolveBuildingRecord,
  buildRoomKey,
  parseRoomLabel,
  getRoomKeyFromRoomRecord
};

