// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSignRoster,
  defaultSignSubtitle,
  defaultSignTitle,
  getSavedSignSettings,
  getSheetSize,
  printedNamePoints,
  saveSignSettings,
  sortDayShifts,
} from "../studentScheduleSign";

const at = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const shift = (id, name, job, start, end) => ({
  student: { id, name },
  assignment: { jobTitle: job },
  startMinutes: at(start),
  endMinutes: at(end),
});

describe("getSheetSize", () => {
  it("turns paper sideways for landscape", () => {
    expect(getSheetSize("letter", "landscape")).toEqual({ widthIn: 11, heightIn: 8.5 });
    expect(getSheetSize("tabloid", "portrait")).toEqual({ widthIn: 11, heightIn: 17 });
    expect(getSheetSize("legal", "landscape")).toEqual({ widthIn: 14, heightIn: 8.5 });
  });

  it("falls back to Letter for an unknown paper", () => {
    expect(getSheetSize("a4", "portrait")).toEqual({ widthIn: 8.5, heightIn: 11 });
  });
});

describe("printedNamePoints", () => {
  it("converts the scaled name size to points", () => {
    expect(printedNamePoints("day", 1)).toBe(10); // 13px × 0.75 = 9.75 → 10
    expect(printedNamePoints("timeline", 2)).toBe(18);
    expect(printedNamePoints("student", 0.5)).toBe(5);
  });
});

describe("default title and subtitle", () => {
  it("names a single filtered building, else a single job", () => {
    expect(defaultSignTitle({ buildings: ["Mary Gibbs Jones"], jobTitles: ["Front Desk"] })).toBe(
      "Mary Gibbs Jones Student Workers",
    );
    expect(defaultSignTitle({ buildings: [], jobTitles: ["Front Desk"] })).toBe(
      "Front Desk Schedule",
    );
    expect(defaultSignTitle({ buildings: [], jobTitles: [] })).toBe("Student Worker Schedule");
    expect(defaultSignTitle({ buildings: ["A", "B"], jobTitles: ["X", "Y"] })).toBe(
      "Student Worker Schedule",
    );
  });

  it("lists the term and any filters the title doesn't name", () => {
    expect(
      defaultSignSubtitle({
        semesterLabel: "Fall 2026",
        buildings: ["A", "B"],
        jobTitles: ["Front Desk", "Lab"],
      }),
    ).toBe("Fall 2026 · A, B · Front Desk, Lab");
    expect(
      defaultSignSubtitle({ semesterLabel: "Fall 2026", buildings: ["A"], jobTitles: ["Lab"] }),
    ).toBe("Fall 2026 · Lab");
    expect(
      defaultSignSubtitle({ semesterLabel: "Fall 2026", buildings: [], jobTitles: ["Lab"] }),
    ).toBe("Fall 2026");
    expect(defaultSignSubtitle({ semesterLabel: "", buildings: ["A"] })).toBe("");
  });
});

describe("sortDayShifts", () => {
  it("orders by start, then end, then name", () => {
    const sorted = sortDayShifts([
      shift("1", "Zoe", "Lab", "10:00", "12:00"),
      shift("2", "Amy", "Lab", "10:00", "12:00"),
      shift("3", "Bo", "Lab", "9:00", "11:00"),
      shift("4", "Cy", "Lab", "10:00", "11:00"),
    ]);
    expect(sorted.map((e) => e.student.name)).toEqual(["Bo", "Cy", "Amy", "Zoe"]);
  });
});

describe("buildSignRoster", () => {
  const days = [
    {
      id: "M",
      events: [
        shift("k", "Kinsey Burnell", "Interior Lab", "15:30", "17:00"),
        shift("k", "Kinsey Burnell", "Interior Lab", "11:00", "14:00"),
        shift("a", "Allie Dodd", "Nutrition Lab", "10:00", "12:00"),
      ],
    },
    {
      id: "T",
      events: [
        shift("a", "Allie Dodd", "Interior Lab", "9:00", "10:00"),
        shift("e", "Eloisa Urrea", "Interior Lab", "10:45", "15:45"),
      ],
    },
  ];

  it("groups rows by job, sorted by job and name", () => {
    const roster = buildSignRoster(days);
    expect(roster.map((g) => g.job)).toEqual(["Interior Lab", "Nutrition Lab"]);
    expect(roster[0].rows.map((r) => r.student.name)).toEqual([
      "Allie Dodd",
      "Eloisa Urrea",
      "Kinsey Burnell",
    ]);
  });

  it("keeps each job's shifts and hours separate for a student with two jobs", () => {
    const roster = buildSignRoster(days);
    const allieInterior = roster[0].rows.find((r) => r.student.id === "a");
    const allieNutrition = roster[1].rows[0];
    expect(allieInterior.hours).toBe(1);
    expect(allieInterior.shifts.M).toEqual([]);
    expect(allieNutrition.hours).toBe(2);
  });

  it("sorts a day's shifts and totals weekly hours", () => {
    const kinsey = buildSignRoster(days)[0].rows.find((r) => r.student.id === "k");
    expect(kinsey.shifts.M.map((e) => e.startMinutes)).toEqual([at("11:00"), at("15:30")]);
    expect(kinsey.hours).toBe(4.5);
  });
});

describe("sign settings", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("defaults to By day on landscape Letter with no note", () => {
    expect(getSavedSignSettings()).toEqual({
      layout: "day",
      paper: "letter",
      orientation: "landscape",
      note: "",
    });
  });

  it("remembers the last settings", () => {
    const settings = {
      layout: "student",
      paper: "tabloid",
      orientation: "portrait",
      note: "Questions? Call the front desk.",
    };
    saveSignSettings(settings);
    expect(getSavedSignSettings()).toEqual(settings);
  });

  it("ignores unknown or corrupted values", () => {
    window.localStorage.setItem(
      "studentScheduleSignSettings",
      JSON.stringify({ layout: "poster", paper: "a4", orientation: "up", note: 7 }),
    );
    expect(getSavedSignSettings()).toEqual({
      layout: "day",
      paper: "letter",
      orientation: "landscape",
      note: "",
    });
    window.localStorage.setItem("studentScheduleSignSettings", "{not json");
    expect(getSavedSignSettings().layout).toBe("day");
  });
});
