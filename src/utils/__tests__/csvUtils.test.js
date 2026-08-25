// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  buildCSVContent,
  downloadTextFile,
  escapeCSVCell,
  neutralizeSpreadsheetFormula,
  parseCSVRecords,
  serializeCSVValue,
} from "../csvUtils";

describe("csvUtils exports", () => {
  it("round-trips commas, quotes, and multiline UTF-8 values", () => {
    const csv = buildCSVContent(
      ["Name", "Notes"],
      [["José \"Joe\"", "Line one, then\nline two"]],
    );

    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(parseCSVRecords(csv)).toEqual([
      ["Name", "Notes"],
      ["José \"Joe\"", "Line one, then\nline two"],
    ]);
  });

  it("neutralizes formula-looking strings without changing numeric values", () => {
    expect(neutralizeSpreadsheetFormula("=HYPERLINK(\"bad\")")).toBe(
      "'=HYPERLINK(\"bad\")",
    );
    expect(neutralizeSpreadsheetFormula("  @SUM(A1:A2)")).toBe(
      "'  @SUM(A1:A2)",
    );
    expect(neutralizeSpreadsheetFormula(-12)).toBe(-12);
    expect(escapeCSVCell("+cmd")).toBe("\"'+cmd\"");
    expect(escapeCSVCell(-12)).toBe('"-12"');
  });

  it("serializes nested values without object-placeholder data loss", () => {
    expect(serializeCSVValue(["A", "B"])).toBe("A; B");
    expect(serializeCSVValue({ role: "primary", percentage: 100 })).toBe(
      '{"role":"primary","percentage":100}',
    );
    expect(escapeCSVCell([{ personId: "one" }])).toBe(
      '"{""personId"":""one""}"',
    );
  });

  it("always releases the temporary download URL", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeChild = vi.spyOn(document.body, "removeChild");
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });

    downloadTextFile("hello", "test.txt");

    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(appendChild).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledOnce();

    click.mockRestore();
  });
});
