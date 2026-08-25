import { normalizeSingleSpaceKey } from "./locationService";

export const TEMPERATURE_SNAPSHOT_EXPORT_HEADERS = Object.freeze([
  "Snapshot Record ID",
  "Building Code",
  "Building",
  "Space ID",
  "Room",
  "Date",
  "Snapshot Time ID",
  "Snapshot Time",
  "Target Minutes",
  "Tolerance Minutes",
  "Temperature F",
  "Temperature C",
  "Humidity",
  "Status",
  "Timezone",
  "Delta Minutes",
  "Source Local Timestamp",
  "Source UTC Timestamp",
  "Source Device ID",
  "Source Device Label",
  "Created At",
  "Updated At",
]);

export const TEMPERATURE_RAW_EXPORT_HEADERS = Object.freeze([
  "Reading Record ID",
  "Sample Key",
  "Building Code",
  "Building",
  "Space ID",
  "Room",
  "Device ID",
  "Device Label",
  "Date",
  "Local Timestamp",
  "UTC Timestamp",
  "Timezone",
  "Temperature F",
  "Temperature C",
  "Humidity",
  "Record Created At",
  "Record Updated At",
]);

export const toExportIsoTimestamp = (value) => {
  if (!value) return "";
  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString()
    : "";
};

const compareExportRows = (left, right, indexes) => {
  for (const index of indexes) {
    const comparison = String(left[index] ?? "").localeCompare(
      String(right[index] ?? ""),
      undefined,
      { numeric: true },
    );
    if (comparison !== 0) return comparison;
  }
  return 0;
};

export const buildTemperatureSnapshotExportRows = ({
  records = [],
  fallbackBuildingCode = "",
  fallbackBuildingName = "",
  fallbackTimezone = "",
  resolveSpaceLabel = () => "",
} = {}) =>
  records
    .map((record) => {
      const spaceKey = normalizeSingleSpaceKey(record?.spaceKey || "");
      return [
        record?.id || "",
        record?.buildingCode || fallbackBuildingCode,
        record?.buildingName || fallbackBuildingName || fallbackBuildingCode,
        spaceKey,
        resolveSpaceLabel(spaceKey, record) ||
          record?.spaceLabel ||
          record?.roomName ||
          "",
        record?.dateLocal || "",
        record?.snapshotTimeId || "",
        record?.snapshotLabel || "",
        record?.targetMinutes ?? "",
        record?.toleranceMinutes ?? "",
        record?.temperatureF ?? "",
        record?.temperatureC ?? "",
        record?.humidity ?? "",
        record?.status || "",
        record?.timezone || fallbackTimezone,
        record?.deltaMinutes ?? "",
        record?.sourceReadingLocal || "",
        toExportIsoTimestamp(record?.sourceReadingUtc),
        record?.sourceDeviceId || "",
        record?.sourceDeviceLabel || "",
        toExportIsoTimestamp(record?.createdAt),
        toExportIsoTimestamp(record?.updatedAt),
      ];
    })
    .sort((left, right) => compareExportRows(left, right, [5, 8, 3, 0]));

export const buildTemperatureRawExportRows = ({
  records = [],
  deviceDocs = {},
  selectedSpaceKeys = [],
  fallbackBuildingCode = "",
  fallbackBuildingName = "",
  fallbackTimezone = "",
  resolveSpaceLabel = () => "",
} = {}) => {
  const selectedSpaces = new Set(
    (selectedSpaceKeys || [])
      .map((value) => normalizeSingleSpaceKey(value || ""))
      .filter(Boolean),
  );
  const rows = [];

  records.forEach((record) => {
    const device = deviceDocs[record?.deviceId] || {};
    const spaceKey = normalizeSingleSpaceKey(
      device?.mapping?.spaceKey || device?.spaceKey || record?.spaceKey || "",
    );
    if (selectedSpaces.size > 0 && !selectedSpaces.has(spaceKey)) return;

    const samples =
      record?.samples && typeof record.samples === "object" ? record.samples : {};
    Object.entries(samples).forEach(([sampleKey, sample]) => {
      rows.push([
        record?.id || "",
        sampleKey,
        record?.buildingCode || device?.buildingCode || fallbackBuildingCode,
        record?.buildingName || device?.buildingName || fallbackBuildingName,
        spaceKey,
        resolveSpaceLabel(spaceKey, record, device) || "",
        record?.deviceId || "",
        device?.label || record?.deviceLabel || record?.deviceId || "",
        record?.dateLocal || "",
        sample?.rawLocal || "",
        toExportIsoTimestamp(sample?.utc),
        record?.timezone || fallbackTimezone,
        sample?.temperatureF ?? "",
        sample?.temperatureC ?? "",
        sample?.humidity ?? "",
        toExportIsoTimestamp(record?.createdAt),
        toExportIsoTimestamp(record?.updatedAt),
      ]);
    });
  });

  return rows.sort((left, right) =>
    compareExportRows(left, right, [8, 10, 9, 6, 1]),
  );
};
