import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  buildWeekDays,
  filterScheduledStudents,
  getScheduledStudents,
  getStudentFilterOptions,
} from "../studentScheduleFilters";

const job = (jobTitle, building, weeklySchedule, extra = {}) => ({
  jobTitle,
  location: [building],
  startDate: "2026-01-05",
  weeklySchedule,
  ...extra,
});

const studentData = [
  {
    id: "k",
    name: "Kira Irwin",
    jobs: [job("Administrative Assistant", "Mary Gibbs Jones", [{ day: "M", start: "09:00", end: "12:30" }])],
  },
  {
    id: "a",
    name: "Allie Dodd",
    jobs: [
      job("Nutrition Lab Assistant", "Goebel", [
        { day: "M", start: "10:00", end: "12:00" },
        { day: "W", start: "13:20", end: "14:30" },
      ]),
      job("Administrative Assistant", "Mary Gibbs Jones", [{ day: "F", start: "13:00", end: "15:00" }]),
    ],
  },
  {
    id: "o",
    name: "Old Hire",
    jobs: [
      job("Apparel Lab Assistant", "Goebel", [{ day: "T", start: "09:00", end: "10:00" }], {
        endDate: "2020-05-01",
      }),
    ],
  },
  { id: "n", name: "No Schedule", jobs: [job("Front Desk", "Goebel", [])] },
];

const scheduled = getScheduledStudents(studentData, null, false);
const names = (students) => students.map((s) => s.name);

describe("getStudentFilterOptions", () => {
  it("lists buildings, jobs, and students sorted by first name", () => {
    const options = getStudentFilterOptions(studentData);
    expect(options.buildings).toEqual(["Goebel", "Mary Gibbs Jones"]);
    expect(options.jobTitles).toEqual([
      "Administrative Assistant",
      "Apparel Lab Assistant",
      "Front Desk",
      "Nutrition Lab Assistant",
    ]);
    expect(options.studentIds).toEqual(["a", "k", "n", "o"]);
    expect(options.studentNames.k).toBe("Kira Irwin");
  });
});

describe("getScheduledStudents", () => {
  it("keeps only scheduled assignments that are active, unless asked for all", () => {
    const active = scheduled.find((s) => s.student.id === "o");
    expect(active.assignments).toEqual([]);
    const all = getScheduledStudents(studentData, null, true).find(
      (s) => s.student.id === "o",
    );
    expect(all.assignments).toHaveLength(1);
    expect(scheduled.find((s) => s.student.id === "n").assignments).toEqual([]);
  });
});

describe("filterScheduledStudents", () => {
  it("returns every scheduled student with no filters", () => {
    expect(names(filterScheduledStudents(scheduled, EMPTY_FILTERS))).toEqual([
      "Kira Irwin",
      "Allie Dodd",
    ]);
  });

  it("filters assignments by building and job, dropping students left with none", () => {
    const goebel = filterScheduledStudents(scheduled, {
      ...EMPTY_FILTERS,
      buildings: ["Goebel"],
    });
    expect(names(goebel)).toEqual(["Allie Dodd"]);
    expect(goebel[0].visibleAssignments.map((a) => a.jobTitle)).toEqual([
      "Nutrition Lab Assistant",
    ]);

    const admin = filterScheduledStudents(scheduled, {
      ...EMPTY_FILTERS,
      jobTitles: ["Administrative Assistant"],
    });
    expect(names(admin)).toEqual(["Kira Irwin", "Allie Dodd"]);
  });

  it("limits to chosen students", () => {
    expect(
      names(filterScheduledStudents(scheduled, { ...EMPTY_FILTERS, studentIds: ["a"] })),
    ).toEqual(["Allie Dodd"]);
  });
});

describe("buildWeekDays", () => {
  it("puts each shift on its weekday in minutes", () => {
    const days = buildWeekDays(filterScheduledStudents(scheduled, EMPTY_FILTERS));
    expect(days.map((d) => d.label)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]);
    expect(days[0].events.map((e) => [e.student.name, e.startMinutes, e.endMinutes])).toEqual([
      ["Kira Irwin", 540, 750],
      ["Allie Dodd", 600, 720],
    ]);
    expect(days[2].events).toHaveLength(1);
    expect(days[4].events[0].assignment.jobTitle).toBe("Administrative Assistant");
  });
});
