import { describe, expect, it } from "vitest";

import {
  buildIgnitePersonNumberUpdate,
  buildPAFCoursesByInstructorId,
  formatCourseForPAF,
  getIgnitePersonNumber,
  normalizeIgnitePersonNumber,
} from "../pafUtils";

describe("pafUtils", () => {
  it("formats max enrollment through the shared enrollment aliases", () => {
    const formatted = formatCourseForPAF({
      courseCode: "ADM 1300",
      section: "01",
      courseTitle: "Seminar",
      "Max Enrollment": "25 seats",
    });

    expect(formatted.courseLine).toBe("ADM 1300-01 Seminar");
    expect(formatted.maxEnrollment).toBe(25);
    expect(formatted.maxEnrollmentValue).toBe("25");
  });

  it("normalizes and resolves Ignite person numbers from canonical and legacy fields", () => {
    expect(normalizeIgnitePersonNumber(" 12-345 ")).toBe("12345");
    expect(
      getIgnitePersonNumber({
        externalIds: { ignitePersonNumber: "00987" },
      }),
    ).toBe("00987");
    expect(getIgnitePersonNumber({ personNumber: "77 88" })).toBe("7788");
  });

  it("builds Ignite updates that sync canonical and legacy fallback fields", () => {
    const timestamp = "2026-05-22T12:00:00.000Z";

    expect(
      buildIgnitePersonNumberUpdate(
        {
          externalIds: {
            clssInstructorId: "CLSS.1",
            ignitePersonNumber: "111",
            personNumber: "111",
          },
          personNumber: "111",
        },
        "",
        timestamp,
      ),
    ).toEqual({
      ignitePersonNumber: "",
      personNumber: "",
      externalIds: {
        clssInstructorId: "CLSS.1",
      },
      updatedAt: timestamp,
    });

    expect(
      buildIgnitePersonNumberUpdate(
        {
          externalIds: {
            clssInstructorId: "CLSS.1",
          },
        },
        "IG-98765",
        timestamp,
      ),
    ).toEqual({
      ignitePersonNumber: "98765",
      externalIds: {
        clssInstructorId: "CLSS.1",
        ignitePersonNumber: "98765",
        personNumber: "98765",
      },
        updatedAt: timestamp,
      });
  });

  it("keeps existing Ignite alias fields synchronized when saving a value", () => {
    const timestamp = "2026-05-22T12:00:00.000Z";

    expect(
      buildIgnitePersonNumberUpdate(
        {
          externalIds: {
            clssInstructorId: "CLSS.1",
            ignitePersonId: "111",
            igniteId: "111",
          },
          igniteId: "111",
        },
        "98765",
        timestamp,
      ),
    ).toEqual({
      ignitePersonNumber: "98765",
      igniteId: "98765",
      externalIds: {
        clssInstructorId: "CLSS.1",
        ignitePersonNumber: "98765",
        personNumber: "98765",
        ignitePersonId: "98765",
        igniteId: "98765",
      },
      updatedAt: timestamp,
    });
  });

  it("matches PAF courses by ids, assignments, and instructor name fallbacks", () => {
    const people = [
      { id: "adj-1", firstName: "Jane", lastName: "Doe", name: "Jane Doe" },
      { id: "adj-2", firstName: "John", lastName: "Smith", name: "John Smith" },
    ];
    const schedules = [
      {
        id: "section-1-0",
        _originalId: "section-1",
        courseCode: "ADM 1300",
        section: "01",
        instructorIds: ["adj-1"],
      },
      {
        id: "section-1-1",
        _originalId: "section-1",
        courseCode: "ADM 1300",
        section: "01",
        instructorIds: ["adj-1"],
      },
      {
        id: "section-2",
        courseCode: "CFS 2355",
        section: "02",
        instructorNames: ["John Smith"],
      },
      {
        id: "section-3",
        courseCode: "HSD 3300",
        section: "03",
        Instructor: "Doe, Jane / Other, Person",
      },
      {
        id: "section-4",
        courseCode: "NUR 4400",
        section: "04",
        instructorAssignments: [{ personId: "adj-2" }],
      },
    ];

    const byInstructor = buildPAFCoursesByInstructorId(schedules, people);

    expect(byInstructor.get("adj-1").map((course) => course.id)).toEqual([
      "section-1-0",
      "section-3",
    ]);
    expect(byInstructor.get("adj-2").map((course) => course.id)).toEqual([
      "section-2",
      "section-4",
    ]);
  });

  it("does not guess when a name-only instructor match is ambiguous", () => {
    const people = [
      { id: "adj-1", firstName: "Alex", lastName: "Taylor" },
      { id: "adj-2", firstName: "Alex", lastName: "Taylor" },
    ];
    const schedules = [
      {
        id: "section-1",
        courseCode: "ADM 1300",
        section: "01",
        instructorName: "Alex Taylor",
      },
    ];

    expect(buildPAFCoursesByInstructorId(schedules, people).size).toBe(0);
  });
});
