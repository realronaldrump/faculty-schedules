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
  let spaceNumber = (base.spaceNumber || base.roomNumber || '').toString().trim();
  let buildingDisplayName = (base.buildingDisplayName || base.building || '').toString().trim();

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

  if ((!buildingCode || !buildingDisplayName) && (base.building || base.buildingDisplayName)) {
    const resolved = resolveBuilding(base.building || base.buildingDisplayName || '');
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
    || base.name
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
    displayName,
    name: base.name || displayName || '',
    roomNumber: base.roomNumber || normalizedNumber || '',
    building: base.building || resolvedBuildingName || buildingCode || ''
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
    : (Array.isArray(schedule.roomNames) && schedule.roomNames.length > 0
      ? schedule.roomNames
      : (schedule.roomName ? [schedule.roomName] : []));

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

export const resolveOfficeLocation = (person, spacesByKey) => {
  if (!person) {
    return {
      spaceKey: '',
      buildingCode: '',
      buildingDisplayName: '',
      spaceNumber: '',
      displayName: ''
    };
  }

  const officeSpaceId = (person.officeSpaceId || '').toString().trim();
  if (officeSpaceId) {
    const map = spacesByKey instanceof Map ? spacesByKey : null;
    const space = map ? map.get(officeSpaceId) : spacesByKey?.[officeSpaceId];
    if (space) {
      const normalized = normalizeSpaceRecord(space, space.id);
      return {
        spaceKey: normalized.spaceKey || officeSpaceId,
        buildingCode: normalized.buildingCode || '',
        buildingDisplayName: normalized.buildingDisplayName || '',
        spaceNumber: normalized.spaceNumber || '',
        displayName: normalized.displayName || ''
      };
    }

    const parsedKey = parseSpaceKey(officeSpaceId);
    if (parsedKey?.buildingCode && parsedKey?.spaceNumber) {
      const displayName = formatSpaceDisplayName({
        buildingCode: parsedKey.buildingCode,
        spaceNumber: parsedKey.spaceNumber
      });
      return {
        spaceKey: officeSpaceId,
        buildingCode: parsedKey.buildingCode,
        buildingDisplayName: resolveBuildingDisplayName(parsedKey.buildingCode),
        spaceNumber: normalizeSpaceNumber(parsedKey.spaceNumber),
        displayName
      };
    }
  }

  const office = (person.office || '').toString().trim();
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

  return {
    spaceKey: '',
    buildingCode: '',
    buildingDisplayName: '',
    spaceNumber: '',
    displayName: ''
  };
};

export default {
  normalizeSpaceRecord,
  resolveSpaceDisplayName,
  resolveScheduleSpaces,
  resolveOfficeLocation
};
