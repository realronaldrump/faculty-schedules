import { describe, expect, it } from "vitest";
import {
  BULK_EXPORT_SHEET_IDS,
  INDIVIDUAL_EXPORT_OPTIONS,
  SHEET_DEFINITIONS,
  SHEET_IDS,
  SHEET_ORDER,
} from "../adminExportSchemas";

describe("adminExportSchemas", () => {
  it("keeps summary first in sheet order", () => {
    expect(SHEET_ORDER[0]).toBe(SHEET_IDS.summary);
  });

  it("defines all bulk export sheets", () => {
    expect(BULK_EXPORT_SHEET_IDS).toHaveLength(15);
    expect(BULK_EXPORT_SHEET_IDS).toContain(SHEET_IDS.courses);
    expect(BULK_EXPORT_SHEET_IDS).toContain(SHEET_IDS.roomReservations);
    expect(BULK_EXPORT_SHEET_IDS).toContain(SHEET_IDS.roomGridEntries);
    BULK_EXPORT_SHEET_IDS.forEach((sheetId) => {
      expect(SHEET_DEFINITIONS[sheetId]).toBeTruthy();
      expect(Array.isArray(SHEET_DEFINITIONS[sheetId].columns)).toBe(true);
      expect(SHEET_DEFINITIONS[sheetId].columns.length).toBeGreaterThan(0);
    });
  });

  it("keeps People headers deterministic", () => {
    const headers = SHEET_DEFINITIONS[SHEET_IDS.people].columns.map(
      (column) => column.header,
    );
    expect(headers[0]).toBe("Record ID");
    expect(headers).toEqual(
      expect.arrayContaining([
        "Name",
        "Alternate Emails",
        "Baylor ID",
        "CLSS Instructor ID",
        "Ignite Person Number",
        "Primary Buildings",
        "Director Roles",
        "Has PhD",
        "Created At",
        "Updated At",
      ]),
    );
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("keeps Programs headers covering both director roles", () => {
    const headers = SHEET_DEFINITIONS[SHEET_IDS.programs].columns.map(
      (column) => column.header,
    );
    expect(headers).toEqual([
      "Record ID",
      "Program Name",
      "Program Code",
      "UPD Names",
      "UPD Count",
      "GPD Names",
      "GPD Count",
      "UPD Record IDs",
      "GPD Record IDs",
      "Director Record IDs",
      "Status",
      "Created At",
      "Updated At",
    ]);
  });

  it("makes every bulk sheet reachable through an individual export", () => {
    const individuallyReachable = new Set(
      INDIVIDUAL_EXPORT_OPTIONS.flatMap((option) => option.sheetIds),
    );
    expect(
      [...BULK_EXPORT_SHEET_IDS].every((id) => individuallyReachable.has(id)),
    ).toBe(true);
  });

  it("uses unique column keys on every sheet", () => {
    Object.values(SHEET_DEFINITIONS).forEach((definition) => {
      const keys = definition.columns.map((column) => column.key);
      expect(new Set(keys).size, definition.name).toBe(keys.length);
    });
  });

});
