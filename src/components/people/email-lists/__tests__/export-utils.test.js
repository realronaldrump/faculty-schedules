import { describe, expect, it } from "vitest";
import { parseCSVRecords } from "../../../../utils/csvUtils";
import {
  buildDirectoryCsv,
  buildGmailEmailFormat,
  buildOutlookEmailFormat,
  buildStudentWorkersCsv,
} from "../export-utils";

describe("email-list export utilities", () => {
  it("trims and deduplicates copied email addresses", () => {
    const people = [
      { name: 'Alex "Ace"', email: " alex@example.edu " },
      { name: "Duplicate", email: "ALEX@example.edu" },
      { name: "No email", email: "" },
    ];

    expect(buildGmailEmailFormat(people)).toBe("alex@example.edu");
    expect(buildOutlookEmailFormat(people)).toBe(
      '"Alex \\"Ace\\"" <alex@example.edu>',
    );
  });

  it("produces parseable directory CSV for quotes and multiline fields", () => {
    const csv = buildDirectoryCsv([
      {
        name: 'Taylor "T"',
        email: "taylor@example.edu",
        phone: "",
        role: "Staff",
        jobTitle: "Line one\nLine two",
        program: { name: "HSD" },
        courses: [],
      },
    ]);
    const rows = parseCSVRecords(csv);

    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('Taylor "T"');
    expect(rows[1][4]).toBe("Line one\nLine two");
  });

  it("produces student-worker CSV with stable columns", () => {
    const rows = parseCSVRecords(
      buildStudentWorkersCsv([
        {
          name: "Student",
          email: "student@example.edu",
          phone: "",
          allJobTitles: ["Assistant"],
          buildings: ["Cashion"],
        },
      ]),
    );

    expect(rows[0]).toEqual(["Name", "Email", "Phone", "Job Titles", "Buildings"]);
    expect(rows[1][3]).toBe("Assistant");
  });
});
