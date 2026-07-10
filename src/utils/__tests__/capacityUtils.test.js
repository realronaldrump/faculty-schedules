import { describe, expect, it } from "vitest";

import { analyzeCapacity, buildCapacityMap } from "../capacityUtils";

const spaces = [
  { displayName: "Goebel 101", capacity: 30 },
  { displayName: "Mary Gibbs Jones 114", capacity: 100 },
];

const rows = [
  // Near-full + waitlist → over capacity
  {
    _originalId: "a",
    Course: "NUTR 1102",
    Section: "01",
    Term: "Spring 2026",
    Room: "Goebel 101",
    Enrollment: "29",
    "Maximum Enrollment": "30",
    "Wait Total": "4",
  },
  // Zero enrollment → under-enrolled
  {
    _originalId: "b",
    Course: "CFS 4695",
    Section: "01",
    Term: "Spring 2026",
    Room: "Goebel 101",
    Enrollment: "0",
    "Maximum Enrollment": "10",
  },
  // Oversized room (cap 25 in a 100-seat room) → room mismatch
  {
    _originalId: "c",
    Course: "ID 2350",
    Section: "02",
    Term: "Spring 2026",
    Room: "Mary Gibbs Jones 114",
    Enrollment: "20",
    "Maximum Enrollment": "25",
  },
  // Healthy section → no flags
  {
    _originalId: "d",
    Course: "ID 3350",
    Section: "01",
    Term: "Spring 2026",
    Room: "Mary Gibbs Jones 114",
    Enrollment: "60",
    "Maximum Enrollment": "90",
  },
];

const meetingRows = [
  ...rows,
  {
    ...rows[0],
    id: "a-meeting-2",
    Day: "W",
  },
];

describe("buildCapacityMap", () => {
  it("maps lowercased display name to capacity", () => {
    const map = buildCapacityMap(spaces);
    expect(map.get("goebel 101")).toBe(30);
    expect(map.get("mary gibbs jones 114")).toBe(100);
  });
});

describe("analyzeCapacity", () => {
  const result = analyzeCapacity({
    scheduleRows: meetingRows,
    term: "Spring 2026",
    capacityByLabel: buildCapacityMap(spaces),
  });

  it("counts sections once even with multiple meeting rows", () => {
    expect(result.summary.total).toBe(4);
  });

  it("buckets over-capacity sections (near-full or waitlisted)", () => {
    expect(result.overCapacity.map((s) => s.course)).toContain("NUTR 1102");
  });

  it("buckets zero / under-enrolled sections", () => {
    expect(result.underEnrolled.map((s) => s.course)).toContain("CFS 4695");
  });

  it("buckets oversized room mismatches", () => {
    expect(result.roomMismatch.map((s) => s.course)).toContain("ID 2350");
  });

  it("leaves healthy sections unflagged", () => {
    const healthy = result.sections.find((s) => s.course === "ID 3350");
    expect(healthy.flags).toHaveLength(0);
  });
});
