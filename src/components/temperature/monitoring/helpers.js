import {
  normalizeSingleSpaceKey,
  splitMultiRoom,
} from "../../../utils/locationService";
import { resolveSpaceDisplayName } from "../../../utils/spaceUtils";
import { DEFAULT_SNAPSHOT_TIMES, DEFAULT_TIMEZONE } from "./constants";

export const buildDefaultSettings = ({ buildingCode, buildingName }) => ({
  buildingCode,
  buildingName,
  timezone: DEFAULT_TIMEZONE,
  idealTempFMin: null,
  idealTempFMax: null,
  idealTempRangesBySpaceType: {},
  snapshotTimes: DEFAULT_SNAPSHOT_TIMES.map((slot) => ({
    id: slot.id || `default_${slot.minutes}`,
    ...slot,
  })),
  floorplan: null,
  markers: {},
});

export const sortRooms = (a, b) => {
  const aNum = parseInt(a.spaceNumber || a.roomNumber || "", 10);
  const bNum = parseInt(b.spaceNumber || b.roomNumber || "", 10);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }
  return (a.displayName || a.name || "").localeCompare(
    b.displayName || b.name || "",
    undefined,
    { numeric: true },
  );
};

export const getSpaceLabel = (room, spacesByKey) => {
  if (!room) return "Unknown";
  const rawKey = room.spaceKey || room.id || "";
  const key = normalizeSingleSpaceKey(rawKey);
  const resolved = key ? resolveSpaceDisplayName(key, spacesByKey) : "";
  if (resolved) return resolved;
  if (room.displayName) return room.displayName;
  if (room.name) return room.name;
  if (room.roomNumber) return room.roomNumber;
  if (splitMultiRoom(rawKey).length > 1) return "Multiple rooms";
  return key || room.id || "Unknown";
};

export const toCsvSafe = (value) => {
  const str = value == null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

export const isValidTimeZone = (timeZone) => {
  if (!timeZone) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
};

export const formatTimezoneLabel = (timeZone) => {
  const resolved = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: resolved,
      timeZoneName: "long",
    }).formatToParts(new Date());
    const namePart = parts.find((part) => part.type === "timeZoneName");
    if (!namePart || !namePart.value) return resolved;
    return namePart.value.replace(/\s+(Standard|Daylight)\s+Time$/, " Time");
  } catch (_) {
    return resolved;
  }
};

export const coerceNumber = (value) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
