import { describe, expect, it } from "vitest";

import {
  getAssignmentStatusForSemester,
  getStudentBadgeStatusForSemester,
  parseStudentWorkerDate,
} from "../studentWorkers";
import { getJobStatus, getStudentStatus } from "../../components/student/StatusBadge.jsx";

describe("studentWorkers (student worker data handling)", () => {
  it("parses YYYY-MM-DD student worker dates as local dates (not UTC)", () => {
    const parsed = parseStudentWorkerDate("2026-02-02");
    expect(parsed).not.toBeNull();
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(1); // Feb (0-indexed)
    expect(parsed.getDate()).toBe(2);
    expect(parsed.getHours()).toBe(0);
  });

  it("rejects impossible date-only values instead of normalizing them", () => {
    expect(parseStudentWorkerDate("2026-02-30")).toBeNull();
    expect(parseStudentWorkerDate("not-a-date")).toBeNull();
  });

  it("treats endDate as inclusive through end-of-day for status checks", () => {
    const student = {
      isActive: true,
      startDate: "2026-02-01",
      endDate: "2026-02-02",
      jobs: [],
      weeklySchedule: [],
      primaryBuildings: [],
    };

    const onEndDateAtNoon = new Date("2026-02-02T12:00:00");
    expect(
      getAssignmentStatusForSemester({}, student, null, {
        referenceDate: onEndDateAtNoon,
      }).status,
    ).toBe("Active");

    const afterEndDate = new Date("2026-02-03T00:00:00");
    expect(
      getAssignmentStatusForSemester({}, student, null, {
        referenceDate: afterEndDate,
      }).status,
    ).toBe("Ended");
  });

  it("treats missing/invalid date ranges as inactive (not active by default)", () => {
    const student = {
      isActive: true,
      startDate: "",
      endDate: "",
      jobs: [],
      weeklySchedule: [],
      primaryBuildings: [],
    };

    expect(
      getAssignmentStatusForSemester({}, student, null, {
        referenceDate: new Date("2026-02-02T12:00:00"),
      }),
    ).toEqual({ status: "Inactive", isActive: false });

    expect(
      getAssignmentStatusForSemester(
        { startDate: "2026-02-30", endDate: "2026-03-10" },
        { ...student, startDate: "", endDate: "" },
        null,
        { referenceDate: new Date("2026-03-01T12:00:00") },
      ),
    ).toEqual({ status: "Inactive", isActive: false });
  });

  it("computes a semester-aware badge status, including partial", () => {
    const semesterMeta = { startDate: "2026-01-10", endDate: "2026-01-20" };
    const student = {
      isActive: true,
      jobs: [
        {
          jobTitle: "Front Desk",
          startDate: "2026-01-10",
          endDate: "2026-01-20",
          weeklySchedule: [],
          location: [],
        },
        {
          jobTitle: "Office Runner",
          startDate: "2025-12-01",
          endDate: "2025-12-31",
          weeklySchedule: [],
          location: [],
        },
      ],
      weeklySchedule: [],
      primaryBuildings: [],
    };

    expect(getStudentBadgeStatusForSemester(student, semesterMeta)).toBe("partial");
  });
});

describe("StatusBadge status helpers", () => {
  it("getStudentStatus uses inclusive endDate semantics", () => {
    const student = {
      isActive: true,
      startDate: "2026-02-01",
      endDate: "2026-02-02",
      jobs: [],
    };

    expect(getStudentStatus(student, new Date("2026-02-02T12:00:00"))).toBe(
      "active",
    );
    expect(getStudentStatus(student, new Date("2026-02-03T00:00:00"))).toBe(
      "ended",
    );
  });

  it("getJobStatus falls back to student dates and uses inclusive endDate semantics", () => {
    const student = {
      isActive: true,
      startDate: "2026-02-01",
      endDate: "2026-02-02",
    };

    expect(getJobStatus({}, student, new Date("2026-02-02T12:00:00"))).toBe(
      "active",
    );
    expect(getJobStatus({}, student, new Date("2026-02-03T00:00:00"))).toBe(
      "ended",
    );
  });
});
