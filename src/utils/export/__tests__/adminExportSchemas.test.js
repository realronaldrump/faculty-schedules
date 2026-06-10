import { describe, expect, it } from "vitest";
import {
  BULK_EXPORT_SHEET_IDS,
  SHEET_DEFINITIONS,
  SHEET_IDS,
  SHEET_ORDER,
} from "../adminExportSchemas";

describe("adminExportSchemas", () => {
  it("keeps summary first in sheet order", () => {
    expect(SHEET_ORDER[0]).toBe(SHEET_IDS.summary);
  });

  it("defines all bulk export sheets", () => {
    expect(BULK_EXPORT_SHEET_IDS).toHaveLength(9);
    expect(BULK_EXPORT_SHEET_IDS).not.toContain(SHEET_IDS.courses);
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
    expect(headers).toEqual([
      "Name",
      "First Name",
      "Last Name",
      "Roles",
      "Status",
      "Inactive Reason",
      "Email",
      "Phone",
      "Baylor ID",
      "CLSS Instructor ID",
      "Title",
      "Job Title",
      "Department",
      "Program",
      "Office",
      "Office Spaces",
      "Adjunct",
      "UPD",
      "Full Time",
      "Tenured",
      "Remote",
      "Has No Phone",
      "Has No Office",
    ]);
  });

});
