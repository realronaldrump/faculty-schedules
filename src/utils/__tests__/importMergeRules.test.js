import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ db: {} }));

const { buildScheduleImportUpdates } = await import("../importTransactionUtils");

describe("buildScheduleImportUpdates", () => {
  it("updates authoritative fields when they change", () => {
    const existing = {
      instructionMethod: "Face-to-Face",
      identityKey: "clss:202610:2962",
      identityKeys: ["clss:202610:2962"],
    };
    const incoming = {
      instructionMethod: "Hybrid",
      identityKey: "clss:202610:2962",
      identityKeys: ["clss:202610:2962"],
    };

    const { updates, hasChanges } = buildScheduleImportUpdates(
      existing,
      incoming,
    );
    expect(hasChanges).toBe(true);
    expect(updates.instructionMethod).toBe("Hybrid");
  });

  it("avoids overwriting stronger identity keys", () => {
    const existing = {
      identityKey: "clss:202610:2962",
      identityKeys: ["clss:202610:2962", "crn:202610:39316"],
    };
    const incoming = {
      identityKey: "crn:202610:39316",
      identityKeys: ["crn:202610:39316"],
    };

    const { updates } = buildScheduleImportUpdates(existing, incoming);
    expect(updates.identityKey).toBeUndefined();
  });

  it("keeps longer course titles from being overwritten", () => {
    const existing = {
      courseTitle: "Fashion Theory and Consumer Behavior",
    };
    const incoming = {
      courseTitle: "Fash Theory & Consump Behav",
    };

    const { updates } = buildScheduleImportUpdates(existing, incoming);
    expect(updates.courseTitle).toBeUndefined();
  });

  it("allows clearing room fields when explicitly permitted", () => {
    const existing = {
      roomName: "Mary Gibbs Jones (FCS) 213",
      roomNames: ["Mary Gibbs Jones (FCS) 213"],
    };
    const incoming = {
      roomName: "",
      roomNames: [],
    };

    const { updates } = buildScheduleImportUpdates(existing, incoming, {
      allowEmptyFields: ["roomName", "roomNames"],
    });
    expect(updates.roomName).toBe("");
    expect(updates.roomNames).toEqual([]);
  });
});
