import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  REDACTED_BAYLOR_ID,
  isValidBaylorId,
  normalizeBaylorId,
  scrubRemovedBaylorId,
} = require("./baylorId.js");

describe("Baylor ID function helpers", () => {
  it("normalizes blank values to null and non-null values to digits", () => {
    expect(normalizeBaylorId(null)).toBeNull();
    expect(normalizeBaylorId("   ")).toBeNull();
    expect(normalizeBaylorId("123-456-789")).toBe("123456789");
    expect(isValidBaylorId("123-456-789")).toBe(true);
    expect(isValidBaylorId("12345")).toBe(false);
  });

  it("scrubs a removed Baylor ID from nested history payloads", () => {
    const removedId = "123456789";
    const scrubbed = scrubRemovedBaylorId(
      {
        documentId: "person_1",
        changes: {
          baylorId: removedId,
          instructorBaylorId: removedId,
          externalIds: { baylorId: removedId },
          note: `Changed Baylor ID from ${removedId}`,
        },
        metadata: {
          fieldChanges: {
            baylorId: { from: removedId, to: null },
          },
          identityKeys: [`baylor:${removedId}`, "email:jane@example.edu"],
        },
      },
      removedId,
    );

    expect(scrubbed.changes.baylorId).toBeNull();
    expect(scrubbed.changes.instructorBaylorId).toBeNull();
    expect(scrubbed.changes.externalIds.baylorId).toBeNull();
    expect(JSON.stringify(scrubbed)).not.toContain(removedId);
    expect(JSON.stringify(scrubbed)).toContain(REDACTED_BAYLOR_ID);
  });
});
