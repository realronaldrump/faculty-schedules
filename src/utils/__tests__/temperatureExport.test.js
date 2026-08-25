import { describe, expect, it } from "vitest";
import {
  buildTemperatureRawExportRows,
  buildTemperatureSnapshotExportRows,
  TEMPERATURE_RAW_EXPORT_HEADERS,
  TEMPERATURE_SNAPSHOT_EXPORT_HEADERS,
  toExportIsoTimestamp,
} from "../temperatureExport";

const timestamp = (iso) => ({ toDate: () => new Date(iso) });

describe("temperatureExport", () => {
  it("preserves snapshot identifiers, targets, and source timestamps", () => {
    const rows = buildTemperatureSnapshotExportRows({
      records: [
        {
          id: "snapshot-1",
          buildingCode: "CSHN",
          spaceKey: "CSHN:101",
          dateLocal: "2026-08-25",
          snapshotTimeId: "morning",
          snapshotLabel: "Morning",
          targetMinutes: 540,
          toleranceMinutes: 15,
          sourceReadingUtc: timestamp("2026-08-25T14:01:00.000Z"),
          sourceDeviceId: "device-1",
        },
      ],
      resolveSpaceLabel: () => "Cashion 101",
    });

    expect(TEMPERATURE_SNAPSHOT_EXPORT_HEADERS).toHaveLength(rows[0].length);
    expect(rows[0]).toEqual(
      expect.arrayContaining([
        "snapshot-1",
        "CSHN:101",
        "morning",
        540,
        15,
        "2026-08-25T14:01:00.000Z",
        "device-1",
      ]),
    );
  });

  it("flattens raw samples with their UTC timestamps and source IDs", () => {
    const rows = buildTemperatureRawExportRows({
      records: [
        {
          id: "reading-day-1",
          buildingCode: "CSHN",
          deviceId: "device-1",
          dateLocal: "2026-08-25",
          samples: {
            0: {
              rawLocal: "2026-08-25 09:00:00",
              utc: timestamp("2026-08-25T14:00:00.000Z"),
              temperatureF: 72.5,
              temperatureC: 22.5,
              humidity: 45,
            },
          },
        },
      ],
      deviceDocs: {
        "device-1": {
          label: "Sensor 101",
          mapping: { spaceKey: "CSHN:101" },
        },
      },
      resolveSpaceLabel: () => "Cashion 101",
    });

    expect(TEMPERATURE_RAW_EXPORT_HEADERS).toHaveLength(rows[0].length);
    expect(rows[0]).toEqual(
      expect.arrayContaining([
        "reading-day-1",
        "0",
        "CSHN:101",
        "device-1",
        "Sensor 101",
        "2026-08-25T14:00:00.000Z",
        72.5,
        22.5,
        45,
      ]),
    );
  });

  it("honors room filters and normalizes timestamp values", () => {
    const rows = buildTemperatureRawExportRows({
      records: [
        { id: "one", deviceId: "one", samples: { 0: { rawLocal: "x" } } },
        { id: "two", deviceId: "two", samples: { 0: { rawLocal: "y" } } },
      ],
      deviceDocs: {
        one: { mapping: { spaceKey: "CSHN:101" } },
        two: { mapping: { spaceKey: "CSHN:102" } },
      },
      selectedSpaceKeys: ["CSHN:102"],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("two");
    expect(toExportIsoTimestamp("not-a-date")).toBe("");
  });
});
