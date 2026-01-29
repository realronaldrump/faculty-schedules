/**
 * Space Utilities - Canonical helpers for resolving spaces across the app.
 */

import {
  buildSpaceKey,
  formatSpaceDisplayName,
  normalizeSpaceNumber,
  parseRoomLabel,
  parseMultiRoom,
  parseSpaceKey,
  resolveBuilding,
  resolveBuildingDisplayName
} from './locationService';

export const normalizeSpaceRecord = (space = {}, docId = '') => {
  if (!space || typeof space !== 'object') {
    return { id: docId };
  }

  const base = { ...space };
  const id = base.id || docId;

  let spaceKey = (base.spaceKey || '').toString().trim();
  let buildingCode = (base.buildingCode || '').toString().trim().toUpperCase();
  let spaceNumber = (base.spaceNumber || '').toString().trim();
  let buildingDisplayName = (base.buildingDisplayName || '').toString().trim();

  if (spaceKey && (!buildingCode || !spaceNumber)) {
    const parsedKey = parseSpaceKey(spaceKey);
    if (parsedKey?.buildingCode) buildingCode = parsedKey.buildingCode.toUpperCase();
    if (parsedKey?.spaceNumber) spaceNumber = parsedKey.spaceNumber;
  }

  if ((!buildingCode || !spaceNumber || !buildingDisplayName) && (base.displayName || base.name)) {
    const parsed = parseRoomLabel(base.displayName || base.name);
    if (parsed?.buildingCode) buildingCode = parsed.buildingCode.toUpperCase();
    if (parsed?.spaceNumber) spaceNumber = parsed.spaceNumber;
    if (!buildingDisplayName && parsed?.building?.displayName) {
      buildingDisplayName = parsed.building.displayName;
    }
  }

  if ((!buildingCode || !buildingDisplayName) && base.buildingDisplayName) {
    const resolved = resolveBuilding(base.buildingDisplayName || '');
    if (!buildingCode && resolved?.code) buildingCode = resolved.code.toUpperCase();
    if (!buildingDisplayName && resolved?.displayName) buildingDisplayName = resolved.displayName;
  }

  const normalizedNumber = normalizeSpaceNumber(spaceNumber);
  if (!spaceKey && buildingCode && normalizedNumber) {
    spaceKey = buildSpaceKey(buildingCode, normalizedNumber);
  }

  const resolvedFromConfig = buildingCode ? resolveBuildingDisplayName(buildingCode) : '';
  const resolvedBuildingName = (resolvedFromConfig && resolvedFromConfig !== buildingCode)
    ? resolvedFromConfig
    : (buildingDisplayName || resolvedFromConfig || buildingCode);
  const displayName = base.displayName
    || formatSpaceDisplayName({
      buildingCode,
      buildingDisplayName: resolvedBuildingName,
      spaceNumber: normalizedNumber
    });

  return {
    ...base,
    id,
    spaceKey,
    buildingCode,
    buildingDisplayName: resolvedBuildingName || '',
    spaceNumber: normalizedNumber || '',
    displayName
  };
};

export const resolveSpaceDisplayName = (spaceKey, spacesByKey) => {
  if (!spaceKey) return '';
  const map = spacesByKey instanceof Map ? spacesByKey : null;
  const space = map ? map.get(spaceKey) : spacesByKey?.[spaceKey];
  if (space) {
    const normalized = normalizeSpaceRecord(space, space.id);
    return normalized.displayName || normalized.spaceKey || '';
  }

  const parsed = parseSpaceKey(spaceKey);
  if (!parsed?.buildingCode || !parsed?.spaceNumber) return spaceKey;
  return formatSpaceDisplayName({
    buildingCode: parsed.buildingCode,
    spaceNumber: parsed.spaceNumber
  });
};

export const resolveScheduleSpaces = (schedule, spacesByKey) => {
  if (!schedule) {
    return { displayNames: [], display: '' };
  }

  if (schedule.isOnline || schedule.locationType === 'virtual') {
    return { displayNames: [], display: schedule.locationLabel || 'Online' };
  }
  if (schedule.locationType === 'no_room' || schedule.locationType === 'none') {
    return { displayNames: [], display: schedule.locationLabel || 'No Room Needed' };
  }

  const spaceIds = Array.isArray(schedule.spaceIds)
    ? schedule.spaceIds.filter(Boolean)
    : [];
  const resolvedNames = spaceIds
    .map((id) => resolveSpaceDisplayName(id, spacesByKey))
    .filter(Boolean);

  const fallbackNames = Array.isArray(schedule.spaceDisplayNames) && schedule.spaceDisplayNames.length > 0
    ? schedule.spaceDisplayNames
    : [];

  let displayNames = resolvedNames.length > 0 ? resolvedNames : fallbackNames;

  if (resolvedNames.length === 0 && fallbackNames.length > 0) {
    const parsed = parseMultiRoom(fallbackNames.join('; '));
    const parsedNames = Array.isArray(parsed?.spaceKeys)
      ? parsed.spaceKeys
        .map((id) => resolveSpaceDisplayName(id, spacesByKey))
        .filter(Boolean)
      : [];
    if (parsedNames.length > 0) {
      displayNames = parsedNames;
    }
  }

  return {
    displayNames,
    display: displayNames.join('; ')
  };
};

/**
 * Resolve a single office location from person data.
 * Returns the primary office (first in array).
 * For multiple offices, use resolveOfficeLocations instead.
 */
export const resolveOfficeLocation = (person, spacesByKey) => {
  const locations = resolveOfficeLocations(person, spacesByKey);
  return locations[0] || {
    spaceKey: '',
    buildingCode: '',
    buildingDisplayName: '',
    spaceNumber: '',
    displayName: ''
  };
};

/**
 * Resolve all office locations for a person.
 * Supports both officeSpaceIds array and officeSpaceId string.
 * @returns {Array} Array of office location objects
 */
export const resolveOfficeLocations = (person, spacesByKey) => {
  if (!person) return [];

  const results = [];
  const map = spacesByKey instanceof Map ? spacesByKey : null;

  // Helper to resolve a single space ID
  const resolveOne = (spaceId, officeStr) => {
    const id = (spaceId || '').toString().trim();
    if (id) {
      const space = map ? map.get(id) : spacesByKey?.[id];
      if (space) {
        const normalized = normalizeSpaceRecord(space, space.id);
        return {
          spaceKey: normalized.spaceKey || id,
          buildingCode: normalized.buildingCode || '',
          buildingDisplayName: normalized.buildingDisplayName || '',
          spaceNumber: normalized.spaceNumber || '',
          displayName: normalized.displayName || ''
        };
      }

      const parsedKey = parseSpaceKey(id);
      if (parsedKey?.buildingCode && parsedKey?.spaceNumber) {
        const displayName = formatSpaceDisplayName({
          buildingCode: parsedKey.buildingCode,
          spaceNumber: parsedKey.spaceNumber
        });
        return {
          spaceKey: id,
          buildingCode: parsedKey.buildingCode,
          buildingDisplayName: resolveBuildingDisplayName(parsedKey.buildingCode),
          spaceNumber: normalizeSpaceNumber(parsedKey.spaceNumber),
          displayName
        };
      }
    }

    // Try parsing from office string
    const office = (officeStr || '').toString().trim();
    if (office) {
      const parsed = parseRoomLabel(office);
      if (parsed?.buildingCode || parsed?.spaceNumber) {
        const displayName = formatSpaceDisplayName({
          buildingCode: parsed.buildingCode || parsed?.building?.code || '',
          buildingDisplayName: parsed?.building?.displayName || '',
          spaceNumber: parsed.spaceNumber || ''
        });
        return {
          spaceKey: parsed.spaceKey || '',
          buildingCode: parsed.buildingCode || parsed?.building?.code || '',
          buildingDisplayName: parsed?.building?.displayName || '',
          spaceNumber: normalizeSpaceNumber(parsed.spaceNumber || ''),
          displayName: displayName || parsed.displayName || office
        };
      }
    }

    return null;
  };

  // First try new array fields
  const officeSpaceIds = Array.isArray(person.officeSpaceIds) ? person.officeSpaceIds : [];
  const offices = Array.isArray(person.offices) ? person.offices : [];

  if (officeSpaceIds.length > 0 || offices.length > 0) {
    const maxLen = Math.max(officeSpaceIds.length, offices.length);
    for (let i = 0; i < maxLen; i++) {
      const resolved = resolveOne(officeSpaceIds[i], offices[i]);
      if (resolved) results.push(resolved);
    }
  }

  // Fall back to singular office fields if no array data
  if (results.length === 0) {
    const resolved = resolveOne(person.officeSpaceId, person.office);
    if (resolved) results.push(resolved);
  }

  return results;
};

export default {
  normalizeSpaceRecord,
  resolveSpaceDisplayName,
  resolveScheduleSpaces,
  resolveOfficeLocation,
  resolveOfficeLocations
};
