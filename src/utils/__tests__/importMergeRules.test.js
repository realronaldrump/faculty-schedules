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

  it("treats room name order and casing as equivalent", () => {
    const existing = {
      roomNames: ["Mary Gibbs Jones (FCS) 213", "Goebel Building 111"],
    };
    const incoming = {
      roomNames: ["goebel building 111", "MARY GIBBS JONES (FCS) 213"],
    };

    const { updates, hasChanges } = buildScheduleImportUpdates(existing, incoming);
    expect(hasChanges).toBe(false);
    expect(updates.roomNames).toBeUndefined();
  });

  it("treats meeting pattern order as equivalent", () => {
    const existing = {
      meetingPatterns: [
        { day: "M", startTime: "8:00 AM", endTime: "9:00 AM", raw: "M 8:00 AM-9:00 AM" },
        { day: "W", startTime: "8:00 AM", endTime: "9:00 AM", raw: "W 8:00 AM-9:00 AM" },
      ],
    };
    const incoming = {
      meetingPatterns: [
        { day: "W", startTime: "8:00 AM", endTime: "9:00 AM", raw: "W 8:00 AM-9:00 AM" },
        { day: "M", startTime: "8:00 AM", endTime: "9:00 AM", raw: "M 8:00 AM-9:00 AM" },
      ],
    };

    const { updates, hasChanges } = buildScheduleImportUpdates(existing, incoming);
    expect(hasChanges).toBe(false);
    expect(updates.meetingPatterns).toBeUndefined();
  });
});
