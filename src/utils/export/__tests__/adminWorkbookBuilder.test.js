import { describe, expect, it } from "vitest";
import {
  buildAutoFilterRange,
  buildWorkbookDefinition,
  getWorkbookSheetOrder,
  toColumnLetter,
} from "../adminWorkbookBuilder";
import { SHEET_IDS } from "../adminExportSchemas";

describe("adminWorkbookBuilder", () => {
  it("converts column numbers to letters", () => {
    expect(toColumnLetter(1)).toBe("A");
    expect(toColumnLetter(26)).toBe("Z");
    expect(toColumnLetter(27)).toBe("AA");
    expect(toColumnLetter(52)).toBe("AZ");
  });

  it("builds auto-filter range from column count", () => {
    expect(buildAutoFilterRange(0)).toBeNull();
    expect(buildAutoFilterRange(1)).toBe("A1:A1");
    expect(buildAutoFilterRange(5)).toBe("A1:E1");
  });

  it("keeps summary first and applies canonical ordering", () => {
    const ordered = getWorkbookSheetOrder([
      SHEET_IDS.roomGrids,
      SHEET_IDS.people,
      SHEET_IDS.roomGrids,
    ]);

    expect(ordered).toEqual([
      SHEET_IDS.summary,
      SHEET_IDS.people,
      SHEET_IDS.roomGrids,
    ]);
  });

  it("builds workbook definition with summary and selected sheets", () => {
    const workbookDefinition = buildWorkbookDefinition({
      sheetIds: [SHEET_IDS.courses],
      summaryRows: [{ metric: "Generated At", value: "2026-02-12" }],
      rowsBySheetId: {
        [SHEET_IDS.courses]: [
          {
            courseCode: "ADM 1300",
            courseTitle: "Foundations",
          },
        ],
      },
    });

    expect(workbookDefinition).toHaveLength(2);
    expect(workbookDefinition[0].id).toBe(SHEET_IDS.summary);
    expect(workbookDefinition[0].rows).toEqual([
      { metric: "Generated At", value: "2026-02-12" },
    ]);
    expect(workbookDefinition[1].id).toBe(SHEET_IDS.courses);
    expect(workbookDefinition[1].rows).toHaveLength(1);
  });
});
