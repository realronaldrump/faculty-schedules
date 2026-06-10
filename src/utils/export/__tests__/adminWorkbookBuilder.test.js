import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildAutoFilterRange,
  buildWorkbookDefinition,
  createWorkbookBuffer,
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
      sheetIds: [SHEET_IDS.programs],
      summaryRows: [{ metric: "Generated At", value: "2026-02-12" }],
      rowsBySheetId: {
        [SHEET_IDS.programs]: [
          {
            programName: "Administration",
            programCode: "ADM",
          },
        ],
      },
    });

    expect(workbookDefinition).toHaveLength(2);
    expect(workbookDefinition[0].id).toBe(SHEET_IDS.summary);
    expect(workbookDefinition[0].rows).toEqual([
      { metric: "Generated At", value: "2026-02-12" },
    ]);
    expect(workbookDefinition[1].id).toBe(SHEET_IDS.programs);
    expect(workbookDefinition[1].rows).toHaveLength(1);
  });

  it("creates a valid workbook package without loading ExcelJS", async () => {
    const buffer = await createWorkbookBuffer({
      workbookSheets: [
        {
          name: "Test Sheet",
          columns: [
            { key: "label", header: "Label", width: 20 },
            { key: "count", header: "Count", width: 12 },
          ],
          rows: [{ label: "A&B <test>", count: 42 }],
        },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file("xl/workbook.xml")).toBeTruthy();
    expect(zip.file("xl/styles.xml")).toBeTruthy();
    expect(zip.file("xl/worksheets/sheet1.xml")).toBeTruthy();

    const sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
    expect(sheetXml).toContain("A&amp;B &lt;test&gt;");
    expect(sheetXml).toContain("<v>42</v>");
  });

  it("preserves whitespace and strips invalid XML characters in string cells", async () => {
    const buffer = await createWorkbookBuffer({
      workbookSheets: [
        {
          name: "Text",
          columns: [{ key: "label", header: "Label", width: 20 }],
          rows: [{ label: "  keep spaces \u0000\uD800 " }],
        },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    const sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");

    expect(sheetXml).toContain('<t xml:space="preserve">  keep spaces  </t>');
    expect(sheetXml).not.toContain("\u0000");
    expect(sheetXml).not.toContain("\uD800");
  });
});
