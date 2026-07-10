import { describe, expect, it } from "vitest";

import {
  buildSectionMap,
  buildSectionMapFromEnriched,
  diffSectionMaps,
  diffTerms,
} from "../scheduleDiffUtils";

const fall = [
  {
    _originalId: "f1",
    Term: "Fall 2025",
    Course: "NUTR 1102",
    Section: "01",
    Instructor: "Smith",
    Room: "Goebel 101",
    Day: "M",
    "Start Time": "9:00 AM",
    "End Time": "9:50 AM",
    "Maximum Enrollment": "30",
  },
  {
    _originalId: "f1",
    Term: "Fall 2025",
    Course: "NUTR 1102",
    Section: "01",
    Instructor: "Smith",
    Room: "Goebel 101",
    Day: "W",
    "Start Time": "9:00 AM",
    "End Time": "9:50 AM",
    "Maximum Enrollment": "30",
  },
  {
    _originalId: "f2",
    Term: "Fall 2025",
    Course: "ID 4433",
    Section: "01",
    Instructor: "Theriot",
    Room: "Mary Gibbs Jones 114",
    Day: "T",
    "Start Time": "2:00 PM",
    "End Time": "3:15 PM",
    "Maximum Enrollment": "20",
  },
];

const spring = [
  // NUTR 1102 changed instructor + room
  {
    _originalId: "s1",
    Term: "Spring 2026",
    Course: "NUTR 1102",
    Section: "01",
    Instructor: "Jones",
    Room: "Mary Gibbs Jones 114",
    Day: "M",
    "Start Time": "9:00 AM",
    "End Time": "9:50 AM",
    "Maximum Enrollment": "30",
  },
  {
    _originalId: "s1",
    Term: "Spring 2026",
    Course: "NUTR 1102",
    Section: "01",
    Instructor: "Jones",
    Room: "Mary Gibbs Jones 114",
    Day: "W",
    "Start Time": "9:00 AM",
    "End Time": "9:50 AM",
    "Maximum Enrollment": "30",
  },
  // New section
  {
    _originalId: "s2",
    Term: "Spring 2026",
    Course: "CFS 4695",
    Section: "01",
    Instructor: "McAninch",
    Room: "Goebel 110",
    Day: "F",
    "Start Time": "1:00 PM",
    "End Time": "1:50 PM",
    "Maximum Enrollment": "15",
  },
];

describe("buildSectionMap", () => {
  it("aggregates meeting rows into one section with a combined pattern", () => {
    const map = buildSectionMap(fall, "Fall 2025");
    expect(map.size).toBe(2);
    const nutr = map.get("NUTR 1102|01");
    expect(nutr.meetingPattern).toContain("MW");
    expect(nutr.meetingPattern).toContain("9:00 AM");
  });
});

describe("diffTerms", () => {
  const result = diffTerms({
    rowsA: fall,
    termA: "Fall 2025",
    rowsB: spring,
    termB: "Spring 2026",
  });

  it("detects added sections", () => {
    expect(result.summary.added).toBe(1);
    expect(result.added[0].course).toBe("CFS 4695");
  });

  it("detects dropped sections", () => {
    expect(result.summary.dropped).toBe(1);
    expect(result.dropped[0].course).toBe("ID 4433");
  });

  it("detects changed fields with before/after", () => {
    expect(result.summary.changed).toBe(1);
    const changed = result.changed[0];
    expect(changed.course).toBe("NUTR 1102");
    const fields = changed.changes.map((c) => c.field);
    expect(fields).toContain("Instructor");
    expect(fields).toContain("Room");
    const instructor = changed.changes.find((c) => c.field === "Instructor");
    expect(instructor.from).toBe("Smith");
    expect(instructor.to).toBe("Jones");
  });
});

describe("enriched schedule comparisons", () => {
  it("detects a weekend day change when the meeting time is unchanged", () => {
    const buildSchedules = (day) => [
      {
        term: "Spring 2026",
        courseCode: "TEST 1000",
        section: "01",
        instructorName: "Doe, Jane",
        locationDisplay: "Goebel 101",
        meetingPatterns: [
          { day, startTime: "9:00 AM", endTime: "9:50 AM" },
        ],
      },
    ];

    const saturday = buildSectionMapFromEnriched(
      buildSchedules("S"),
      "Spring 2026",
    );
    const sunday = buildSectionMapFromEnriched(
      buildSchedules("U"),
      "Spring 2026",
    );

    expect(saturday.get("TEST 1000|01").meetingPattern).toContain("S 9:00 AM");
    expect(sunday.get("TEST 1000|01").meetingPattern).toContain("U 9:00 AM");

    const result = diffSectionMaps(saturday, sunday);
    expect(result.summary.changed).toBe(1);
    expect(result.changed[0].changes).toContainEqual(
      expect.objectContaining({ field: "Time" }),
    );
  });
});
