import { describe, expect, it } from "vitest";
import { buildAdminExportPackage, getIndividualFileName } from "../adminExportData";
import { BULK_EXPORT_SHEET_IDS, SHEET_IDS } from "../adminExportSchemas";

const sourceData = {
  people: [
    {
      id: "supervisor-1",
      name: "Supervisor One",
      email: "supervisor@example.edu",
      roles: ["staff"],
      isActive: true,
    },
    {
      id: "student-1",
      name: "Student One",
      email: "student@example.edu",
      roles: ["student"],
      isActive: true,
      jobs: [
        {
          id: "root-projection",
          jobTitle: "Do not duplicate",
          startDate: "2026-08-01",
          endDate: "2026-12-31",
        },
      ],
      semesterSchedules: {
        202640: {
          semester: "Fall 2026",
          semesterCode: "202640",
          jobs: [
            {
              id: "fall-job",
              jobTitle: "Fall Assistant",
              supervisorId: "supervisor-1",
              hourlyRate: "$12.50",
              startDate: "2026-08-24",
              endDate: "2026-12-11",
              location: ["Cashion"],
              weeklySchedule: [
                { day: "M", start: "09:00", end: "11:00" },
              ],
            },
          ],
        },
        202710: {
          semester: "Spring 2027",
          semesterCode: "202710",
          jobs: [
            {
              id: "spring-job",
              jobTitle: "Spring Assistant",
              startDate: "2027-01-11",
              endDate: "2027-05-07",
              weeklySchedule: [
                { day: "T", start: "10:00", end: "11:30" },
              ],
            },
          ],
        },
      },
    },
  ],
  schedules: [
    {
      id: "section-fall",
      term: "Fall 2026",
      termCode: "202640",
      academicYear: 2026,
      courseCode: "HSD 1301",
      subjectCode: "HSD",
      catalogNumber: "1301",
      courseLevel: 1000,
      courseTitle: "Foundations",
      section: "01",
      crn: "12345",
      clssId: "clss-1",
      departmentCode: "HSD",
      credits: 3,
      instructorIds: ["supervisor-1"],
      instructorAssignments: [
        { personId: "supervisor-1", percentage: 100, isPrimary: true },
      ],
      isOnline: false,
      spaceIds: ["CSHN:101"],
      spaceDisplayNames: ["Cashion 101"],
      meetingPatterns: [
        {
          day: "M",
          startTime: "09:00",
          endTime: "09:50",
          spaceIds: ["CSHN:101"],
          spaceDisplayNames: ["Cashion 101"],
        },
      ],
      enrollment: 20,
      maxEnrollment: 24,
      openSeats: 4,
      waitCap: 5,
      waitTotal: 1,
      waitAvailable: 4,
      crossListCrns: ["54321"],
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-02-01T12:00:00.000Z",
    },
    {
      id: "section-spring",
      term: "Spring 2027",
      termCode: "202710",
      courseCode: "HSD 2301",
      section: "01",
      crn: "67890",
      meetingPatterns: [],
      spaceIds: [],
    },
  ],
  courses: [
    {
      id: "HSD_1301",
      courseCode: "HSD 1301",
      title: "Foundations",
      subjectCode: "HSD",
      catalogNumber: "1301",
      courseLevel: 1000,
      credits: 3,
      departmentCode: "HSD",
    },
  ],
  programs: [
    {
      id: "program-1",
      name: "Human Sciences",
      code: "HSD",
      directors: [{ personId: "supervisor-1", role: "upd" }],
    },
  ],
  spaces: [
    {
      id: "CSHN:101",
      spaceKey: "CSHN:101",
      buildingCode: "CSHN",
      buildingDisplayName: "Cashion",
      spaceNumber: "101",
      displayName: "Cashion 101",
      type: "Classroom",
      isActive: true,
      isReservable: true,
    },
  ],
  buildings: [
    { id: "cashion", code: "CSHN", displayName: "Cashion", isActive: true },
  ],
  terms: [
    {
      id: "202640",
      term: "Fall 2026",
      termCode: "202640",
      startDate: "2026-08-24",
      endDate: "2026-12-11",
      status: "active",
    },
    {
      id: "202710",
      term: "Spring 2027",
      termCode: "202710",
      startDate: "2027-01-11",
      endDate: "2027-05-07",
      status: "active",
    },
  ],
  reservations: [
    { id: "fall-res", date: "2026-09-01", title: "Fall meeting" },
    { id: "spring-res", date: "2027-02-01", title: "Spring meeting" },
  ],
  baylorAcronyms: [
    { id: "acro-1", acronym: "HSD", standsFor: "Human Sciences and Design" },
  ],
  emailListPresets: [
    { id: "preset-1", name: "Leads", personIds: ["supervisor-1"] },
  ],
  calendarExceptions: [
    {
      id: "rooms",
      termExceptions: {
        "Fall 2026": [{ date: "2026-11-26", label: "Thanksgiving" }],
        "Spring 2027": [{ date: "2027-03-08", label: "Spring break" }],
      },
    },
  ],
  roomGrids: [
    {
      id: "grid-fall",
      title: "Fall grid",
      semester: "Fall 2026",
      kind: "studio",
      studio: {
        schemaVersion: 1,
        name: "Fall grid",
        semester: "Fall 2026",
        favorite: true,
        entries: [
          {
            id: "entry-1",
            course: "HSD 1301",
            section: "01",
            days: ["M", "W"],
            start: "09:00",
            end: "09:50",
          },
        ],
      },
    },
    {
      id: "grid-spring",
      title: "Spring grid",
      semester: "Spring 2027",
      html: "<div>legacy</div>",
    },
  ],
};

describe("buildAdminExportPackage", () => {
  it("includes every current operational sheet in the bulk workbook", async () => {
    const result = await buildAdminExportPackage({ sourceData });

    expect(result.sheetIds).toEqual(BULK_EXPORT_SHEET_IDS);
    expect(result.rowsBySheetId[SHEET_IDS.courses]).toHaveLength(1);
    expect(result.rowsBySheetId[SHEET_IDS.roomReservations]).toHaveLength(2);
    expect(result.rowsBySheetId[SHEET_IDS.baylorAcronyms][0].recordId).toBe(
      "acro-1",
    );
    expect(result.rowsBySheetId[SHEET_IDS.emailListPresets][0]).toMatchObject({
      personCount: 1,
      people: "Supervisor One",
      emails: "supervisor@example.edu",
    });
    expect(result.rowsBySheetId[SHEET_IDS.roomGridEntries][0]).toMatchObject({
      gridId: "grid-fall",
      entryId: "entry-1",
      days: "M; W",
    });
  });

  it("exports stored semester jobs instead of the mutable root projection", async () => {
    const result = await buildAdminExportPackage({
      sheetIds: [SHEET_IDS.studentWorkerAssignments],
      sourceData,
    });
    const rows = result.rowsBySheetId[SHEET_IDS.studentWorkerAssignments];

    expect(rows.map((row) => row.assignmentId)).toEqual([
      "fall-job",
      "spring-job",
    ]);
    expect(rows.map((row) => row.assignmentId)).not.toContain("root-projection");
    expect(rows[0]).toMatchObject({
      term: "Fall 2026",
      termCode: "202640",
      supervisor: "Supervisor One",
      weeklyHours: 2,
      weeklyPay: "$25.00",
    });
  });

  it("applies selected-semester scope to every term-bound dataset", async () => {
    const result = await buildAdminExportPackage({
      termScope: "selected",
      selectedTerm: "Fall 2026",
      selectedTermMeta: sourceData.terms[0],
      sourceData,
    });

    expect(
      result.rowsBySheetId[SHEET_IDS.studentWorkerAssignments].map(
        (row) => row.assignmentId,
      ),
    ).toEqual(["fall-job"]);
    expect(result.rowsBySheetId[SHEET_IDS.courseSections]).toHaveLength(1);
    expect(result.rowsBySheetId[SHEET_IDS.sectionMeetings]).toHaveLength(1);
    expect(
      result.rowsBySheetId[SHEET_IDS.roomReservations].map((row) => row.recordId),
    ).toEqual(["fall-res"]);
    expect(result.rowsBySheetId[SHEET_IDS.calendarExceptions]).toHaveLength(1);
    expect(result.rowsBySheetId[SHEET_IDS.roomGrids]).toHaveLength(1);
    expect(result.rowsBySheetId[SHEET_IDS.roomGridEntries]).toHaveLength(1);
  });

  it("exports current schedule and space fields with stable IDs", async () => {
    const result = await buildAdminExportPackage({ sourceData });
    expect(result.rowsBySheetId[SHEET_IDS.courseSections][0]).toMatchObject({
      recordId: "section-fall",
      academicYear: 2026,
      subjectCode: "HSD",
      catalogNumber: "1301",
      clssId: "clss-1",
      instructorIds: "supervisor-1",
      instructorAssignments: "Supervisor One (100%, primary)",
      spaceIds: "CSHN:101",
      openSeats: 4,
      waitAvailable: 4,
      crossListCrns: "54321",
    });
    expect(result.rowsBySheetId[SHEET_IDS.spaces][0]).toMatchObject({
      recordId: "CSHN:101",
      isReservable: "Yes",
    });
  });

  it("includes semester scope in individual workbook filenames", () => {
    expect(
      getIndividualFileName({
        label: "Course Sections",
        termScopeInfo: {
          scope: "selected",
          termLabel: "Fall 2026",
          termCode: "202640",
        },
      }),
    ).toMatch(/^hsd-course-sections-export-fall-2026-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("marks semester scope as not applicable for global-only exports", async () => {
    const result = await buildAdminExportPackage({
      sheetIds: [SHEET_IDS.baylorAcronyms],
      termScope: "selected",
      selectedTerm: "Fall 2026",
      sourceData,
    });

    expect(result.termScopeApplied).toBe(false);
    expect(result.summaryRows).toContainEqual({
      metric: "Semester Scope",
      value: "Not applicable to the included global sheets",
    });
  });

  it("does not silently include every reservation when semester dates are missing", async () => {
    const result = await buildAdminExportPackage({
      sheetIds: [SHEET_IDS.roomReservations],
      termScope: "selected",
      selectedTerm: "Summer 2027",
      selectedTermMeta: { term: "Summer 2027", termCode: "202720" },
      sourceData,
    });

    expect(result.rowsBySheetId[SHEET_IDS.roomReservations]).toEqual([]);
    expect(result.summaryRows).toContainEqual({
      metric: "Scope Notice",
      value:
        "Room Reservations were omitted because the selected semester does not have both a start date and an end date.",
    });
  });
});
