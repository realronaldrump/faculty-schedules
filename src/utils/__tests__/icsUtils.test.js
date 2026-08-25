import { describe, expect, it } from "vitest";

import { foldICSLines } from "../icsUtils";

describe("foldICSLines", () => {
  it("folds by UTF-8 octets without splitting Unicode characters", () => {
    const original = `SUMMARY:${"é".repeat(70)}`;
    const folded = foldICSLines([original]);

    expect(folded.length).toBeGreaterThan(1);
    folded.forEach((line) => {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    });
    expect(folded.join("\r\n").replace(/\r\n[ \t]/g, "")).toBe(original);
  });
});
