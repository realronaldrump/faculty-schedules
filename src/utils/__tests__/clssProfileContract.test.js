import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { extractScheduleRowBaseData } from "../importScheduleRowUtils";
import { normalizeClssRow } from "../import/clss/normalize-row";
import { parseClssFile } from "../import/clss/parse-clss-file";

const fixturePath = path.resolve(
  process.cwd(),
  "src/utils/__tests__/fixtures/CLSSExportSpring2026.sanitized.csv",
);
const fixtureText = fs.readFileSync(fixturePath, "utf-8");

describe("CLSS profile contract", () => {
  it("parses the current CLSS fixture and reports mapped schema", () => {
    const parsed = parseClssFile(fixtureText, { strict: true });

    expect(parsed.isClss).toBe(true);
    expect(parsed.rows.length).toBeGreaterThan(50);
    expect(parsed.schemaReport.profileId).toBe("baylor-clss-default");
    expect(parsed.schemaReport.missingRequired).toEqual([]);
    expect(Object.keys(parsed.schemaReport.headerMap)).toEqual(
      expect.arrayContaining([
        "clss_id",
        "course_code",
        "section",
        "crn",
        "instructor",
        "term",
      ]),
    );
  });

  it("parses reordered headers and alias-based renamed headers", () => {
    const csvText = [
      "Faculty,Section Number,Course Reference Number,CLSS Identifier,Semester,Course Code,Extra Notes",
      "\"Doe, Jane\",01,33070,2962,Spring 2026,ID 1300,keep this extra column",
    ].join("\n");

    const parsed = parseClssFile(csvText, { strict: true });

    expect(parsed.isClss).toBe(true);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.schemaReport.missingRequired).toEqual([]);
    expect(parsed.schemaReport.unknownColumns).toContain("Extra Notes");

    const row = parsed.rows[0];
    expect(row.__clssCanonical.course_code).toBe("ID 1300");
    expect(row.__clssCanonical.instructor).toBe("Doe, Jane");
    expect(row.__clssCanonical.crn).toBe("33070");
    expect(row.__clssCanonical.term).toBe("Spring 2026");
  });

  it("fails fast when required CLSS columns are missing in strict mode", () => {
    const csvText = [
      "Instructor,Section #,CLSS ID,Term,Course",
      "\"Doe, Jane\",01,2962,Spring 2026,ID 1300",
    ].join("\n");

    expect(() => parseClssFile(csvText, { strict: true })).toThrow(
      /Missing required CLSS columns/i,
    );
  });

  it("does not satisfy required fields from substring header collisions", () => {
    const csvText = [
      "CLSS ID,CRN,Course,Section #,Instructor ID,Term Code",
      "2962,33070,ID 1300,01,998877,202610",
    ].join("\n");

    const nonStrict = parseClssFile(csvText, { strict: false });
    expect(nonStrict.schemaReport.missingRequired).toEqual(
      expect.arrayContaining(["instructor", "term"]),
    );

    expect(() => parseClssFile(csvText, { strict: true })).toThrow(
      /Missing required CLSS columns/i,
    );
  });

  it("does not let optional partial matches steal more specific exact columns", () => {
    const csvText = [
      "CLSS ID,CRN,Course,Section #,Instructor,Term,Maximum Enrollment",
      '2962,33070,ID 1300,01,"Doe, Jane",Spring 2026,30',
    ].join("\n");

    const parsed = parseClssFile(csvText, { strict: true });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.schemaReport.headerMap.maximum_enrollment).toBe(
      "Maximum Enrollment",
    );
    expect(parsed.schemaReport.headerMap.enrollment).toBeUndefined();
    expect(parsed.rows[0].__clssCanonical.enrollment).toBe("");
    expect(parsed.rows[0].__clssCanonical.maximum_enrollment).toBe("30");
  });

  it("keeps canonical row values stable for the import extraction pipeline", () => {
    const canonicalRow = normalizeClssRow(
      ["2962", "ID 1300", "01", "33070", "Doe, Jane", "Spring 2026", "GOEBEL 101"],
      {
        fieldToIndex: {
          clss_id: 0,
          course_code: 1,
          section: 2,
          crn: 3,
          instructor: 4,
          term: 5,
          room: 6,
        },
      },
    );

    delete canonicalRow.Course;
    delete canonicalRow["Section #"];
    delete canonicalRow.CRN;
    delete canonicalRow.Instructor;
    delete canonicalRow.Term;
    delete canonicalRow.Room;

    const baseData = extractScheduleRowBaseData(canonicalRow, "Spring 2026");

    expect(baseData.courseCode).toBe("ID 1300");
    expect(baseData.section).toBe("01");
    expect(baseData.crn).toBe("33070");
    expect(baseData.term).toBe("Spring 2026");
    expect(baseData.normalizedInstructorName).toContain("Doe");
    expect(baseData.spaceDisplayNames.join(" ")).toContain("GOEBEL");
  });
});
