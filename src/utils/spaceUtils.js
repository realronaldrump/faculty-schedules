/**
 * Space Utilities - Canonical helpers for resolving spaces across the app.
 */

import {
  buildSpaceKey,
  formatSpaceDisplayName,
  normalizeSpaceNumber,
  parseSpaceKey,
  resolveBuildingDisplayName,
  splitMultiRoom,
  validateSpaceKey,
} from './locationService';

export const normalizeSpaceRecord = (space = {}, docId = '') => {
  if (!space || typeof space !== 'object') {
    return { id: docId };
  }

  const base = { ...space };
  // Canonical: Firestore doc id == spaceKey.
  const id = docId || base.id || '';

  let spaceKey = (base.spaceKey || id || '').toString().trim();
  let buildingCode = (base.buildingCode || '').toString().trim();
  let spaceNumber = (base.spaceNumber || '').toString().trim();
  let buildingDisplayName = (base.buildingDisplayName || '').toString().trim();

  if (spaceKey) {
    const parsedKey = parseSpaceKey(spaceKey);
    const canonicalKey =
      parsedKey?.buildingCode && parsedKey?.spaceNumber
        ? buildSpaceKey(parsedKey.buildingCode, parsedKey.spaceNumber)
        : '';
    if (canonicalKey && validateSpaceKey(canonicalKey).valid) {
      const canonicalParts = parseSpaceKey(canonicalKey);
      spaceKey = canonicalKey;
      buildingCode = canonicalParts?.buildingCode || parsedKey.buildingCode;
      spaceNumber = canonicalParts?.spaceNumber || parsedKey.spaceNumber;
    }
  }

  const normalizedNumber = normalizeSpaceNumber(spaceNumber);
  const canonicalSpaceKey =
    buildingCode && normalizedNumber
      ? buildSpaceKey(buildingCode, normalizedNumber)
      : '';
  if (!spaceKey && canonicalSpaceKey) spaceKey = canonicalSpaceKey;
  if (canonicalSpaceKey && validateSpaceKey(canonicalSpaceKey).valid) {
    spaceKey = canonicalSpaceKey;
    const parts = parseSpaceKey(canonicalSpaceKey);
    buildingCode = parts?.buildingCode || buildingCode;
    spaceNumber = parts?.spaceNumber || normalizedNumber;
  }

  const resolvedFromConfig = buildingCode
    ? resolveBuildingDisplayName(buildingCode)
    : '';
  const resolvedBuildingName =
    resolvedFromConfig || buildingDisplayName || buildingCode;
  const rawDisplayName = (base.displayName || '').toString().trim();
  const hasCombinedDisplayName = splitMultiRoom(rawDisplayName).length > 1;
  const canonicalDisplayName = formatSpaceDisplayName({
    buildingCode,
    buildingDisplayName: resolvedBuildingName,
    spaceNumber: normalizedNumber,
  });
  const displayName =
    (hasCombinedDisplayName && canonicalDisplayName
      ? canonicalDisplayName
      : rawDisplayName) ||
    canonicalDisplayName;

  return {
    ...base,
    id,
    spaceKey,
    buildingCode: (buildingCode || '').toString().trim().toUpperCase(),
    buildingDisplayName: resolvedBuildingName || '',
    spaceNumber: normalizedNumber || '',
    displayName,
  };
};

export const resolveSpaceDisplayName = (spaceKey, spacesByKey) => {
  if (!spaceKey) return '';
  const raw = (spaceKey || '').toString().trim();
  const parsedInput = parseSpaceKey(raw);
  const canonicalKey =
    parsedInput?.buildingCode && parsedInput?.spaceNumber
      ? buildSpaceKey(parsedInput.buildingCode, parsedInput.spaceNumber)
      : '';
  const lookupKey = canonicalKey || raw;
  const map = spacesByKey instanceof Map ? spacesByKey : null;
  const space = map ? map.get(lookupKey) : spacesByKey?.[lookupKey];
  if (space) {
    const normalized = normalizeSpaceRecord(space, space.id);
    return normalized.displayName || normalized.spaceKey || '';
  }

  const parsed = parsedInput || parseSpaceKey(lookupKey);
  if (!parsed?.buildingCode || !parsed?.spaceNumber) return spaceKey;
  return formatSpaceDisplayName({
    buildingCode: parsed.buildingCode,
    spaceNumber: parsed.spaceNumber,
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
  const displayNames = spaceIds
    .map((id) => resolveSpaceDisplayName(id, spacesByKey))
    .filter(Boolean);

  return {
    displayNames,
    display: displayNames.join('; '),
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
  const resolveOne = (spaceId) => {
    const rawId = (spaceId || '').toString().trim();
    const parsedKey = parseSpaceKey(rawId);
    const canonicalId = parsedKey?.buildingCode && parsedKey?.spaceNumber
      ? buildSpaceKey(parsedKey.buildingCode, parsedKey.spaceNumber)
      : '';
    const id = canonicalId || rawId;
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
          buildingDisplayName: resolveBuildingDisplayName(parsedKey.buildingCode),
          spaceNumber: parsedKey.spaceNumber,
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

    return null;
  };

  const officeSpaceIds = Array.isArray(person.officeSpaceIds)
    ? person.officeSpaceIds
    : person.officeSpaceId
      ? [person.officeSpaceId]
      : [];

  officeSpaceIds.forEach((spaceId) => {
    const resolved = resolveOne(spaceId);
    if (resolved) results.push(resolved);
  });

  return results;
};

export default {
  normalizeSpaceRecord,
  resolveSpaceDisplayName,
  resolveScheduleSpaces,
  resolveOfficeLocation,
  resolveOfficeLocations
};
