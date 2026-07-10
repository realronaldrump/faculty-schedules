import { describe, expect, it } from "vitest";

import {
  buildBaylorIdOptionalityCleanupPlan,
  buildPersonLegacyFixUpdates,
  buildScheduleLegacyFixUpdates,
  detectLegacyModelIssues,
  filterDuplicatesByScopedRecordIds,
  scrubBaylorIdHistoryData,
} from "../dataHygiene";

describe("legacy model cleanup helpers", () => {
  it("detects and prepares schedule legacy mirror cleanup updates", () => {
    const schedule = {
      id: "schedule-1",
      Course: "ID 1300",
      "Section #": "01",
      CRN: "33070",
      Term: "Spring 2026",
      Instructor: "Doe, Jane",
      Room: "GOEBEL:101",
    };

    const { updates, touchedFields } = buildScheduleLegacyFixUpdates(schedule);

    expect(touchedFields).toEqual(
      expect.arrayContaining([
        "Course",
        "Section #",
        "CRN",
        "Term",
        "Instructor",
        "Room",
      ]),
    );
    expect(updates.courseCode).toBe("ID 1300");
    expect(updates.section).toBe("01");
    expect(updates.crn).toBe("33070");
    expect(updates.term).toBe("Spring 2026");
    expect(updates.instructorName).toBe("Doe, Jane");
    expect(updates.locationLabel).toBe("GOEBEL:101");
    expect(updates).toHaveProperty("Course");
    expect(updates).toHaveProperty("CRN");
  });

  it("detects and prepares person legacy identity and student payload cleanup", () => {
    const person = {
      id: "person-1",
      firstName: "Jane",
      lastName: "Doe",
      roles: { student: true },
      clssInstructorId: "123456789",
      baylorId: "987654321",
      jobTitle: "Student Worker",
      supervisor: "Supervisor Name",
      supervisorId: "supervisor-1",
      hourlyRate: "15.00",
      jobs: [
        {
          jobTitle: "Student Worker",
          supervisor: "Supervisor Name",
          hourlyRate: "15.00",
          location: ["GOEBEL"],
          weeklySchedule: [{ day: "M", startTime: "09:00 AM", endTime: "11:00 AM" }],
        },
      ],
    };

    const { updates, touchedFields } = buildPersonLegacyFixUpdates(person);

    expect(updates.roles).toEqual(["student"]);
    expect(updates.externalIds).toEqual(
      expect.objectContaining({
        clssInstructorId: "123456789",
        baylorId: "987654321",
      }),
    );
    expect(touchedFields).toContain("student_payload_mirror_fields");
    expect(updates).toHaveProperty("jobTitle");
    expect(updates).toHaveProperty("supervisor");
    expect(updates).toHaveProperty("supervisorId");
    expect(updates).toHaveProperty("hourlyRate");
    expect(updates.jobs[0].supervisorId).toBe("supervisor-1");
  });

  it("does not flag person records when externalIds already match canonical fields", () => {
    const person = {
      id: "person-clean",
      firstName: "Jane",
      lastName: "Doe",
      roles: ["faculty"],
      baylorId: "987654321",
      externalIds: {
        clssInstructorId: "123456789",
        baylorId: "987654321",
        emails: ["jane@baylor.edu"],
      },
    };

    const { updates, touchedFields } = buildPersonLegacyFixUpdates(person);

    expect(updates).toEqual({});
    expect(touchedFields).toEqual([]);
  });

  it("reports legacy model issues in a unified issue list", () => {
    const people = [
      {
        id: "person-1",
        firstName: "Jane",
        lastName: "Doe",
        roles: { faculty: true },
        clssInstructorId: "111111111",
      },
    ];
    const schedules = [
      {
        id: "schedule-1",
        Course: "ID 1300",
        CRN: "33070",
      },
    ];

    const issues = detectLegacyModelIssues(people, schedules);

    expect(issues.length).toBe(2);
    expect(issues.map((issue) => issue.type)).toEqual(
      expect.arrayContaining(["legacy_schedule_fields", "legacy_person_fields"]),
    );
  });

  it("flags legacy program-director state and prepares canonical updates", () => {
    const people = [
      {
        id: "person-1",
        firstName: "Jane",
        lastName: "Doe",
        roles: ["faculty"],
        isUPD: true,
        programId: "program-1",
        externalIds: { emails: ["jane@baylor.edu"] },
      },
    ];
    const programs = [
      { id: "program-1", name: "Interior Design", updIds: ["person-1"] },
    ];

    const issues = detectLegacyModelIssues(people, [], programs);
    const programIssue = issues.find(
      (issue) => issue.type === "legacy_program_director_fields",
    );
    const flagIssue = issues.find(
      (issue) => issue.type === "legacy_person_director_flag",
    );

    expect(programIssue).toBeTruthy();
    expect(programIssue.recordType).toBe("programs");
    expect(programIssue.updates.directors).toEqual([
      { personId: "person-1", role: "upd" },
    ]);
    expect(programIssue.updates).toHaveProperty("updIds");
    expect(programIssue.updates).toHaveProperty("updId");
    expect(programIssue.autoFixable).toBe(true);

    expect(flagIssue).toBeTruthy();
    expect(flagIssue.recordType).toBe("people");
    expect(flagIssue.updates).toHaveProperty("isUPD");

    // Program canonicalization must be queued before flag removal so legacy
    // assignment data is never dropped ahead of being migrated.
    expect(issues.indexOf(programIssue)).toBeLessThan(
      issues.indexOf(flagIssue),
    );
  });

  it("does not emit director issues for canonical data or when programs are absent", () => {
    const cleanPeople = [
      { id: "person-1", firstName: "Jane", lastName: "Doe", roles: ["faculty"] },
    ];
    const cleanPrograms = [
      {
        id: "program-1",
        name: "Interior Design",
        directors: [{ personId: "person-1", role: "gpd" }],
      },
    ];

    expect(
      detectLegacyModelIssues(cleanPeople, [], cleanPrograms).filter((issue) =>
        issue.type.startsWith("legacy_program_director"),
      ),
    ).toEqual([]);

    // Without programs in scope, no director issues are produced (the flag
    // is never stripped in isolation).
    const flaggedPeople = [
      { id: "person-2", firstName: "Flag", lastName: "Only", isUPD: true },
    ];
    expect(
      detectLegacyModelIssues(flaggedPeople, []).filter(
        (issue) => issue.type === "legacy_person_director_flag",
      ),
    ).toEqual([]);
  });

  it("keeps ineligible legacy director assignments out of routine auto-fix", () => {
    const issues = detectLegacyModelIssues(
      [
        {
          id: "person-adjunct",
          firstName: "Adjunct",
          lastName: "Faculty",
          roles: ["faculty"],
          isAdjunct: true,
        },
      ],
      [],
      [
        {
          id: "program-1",
          name: "Interior Design",
          updIds: ["person-adjunct"],
        },
      ],
    );
    const programIssue = issues.find(
      (issue) => issue.type === "legacy_program_director_fields",
    );

    expect(programIssue).toEqual(
      expect.objectContaining({
        recordType: "programs",
        autoFixable: false,
        manualReview: expect.arrayContaining([
          expect.objectContaining({ personId: "person-adjunct" }),
        ]),
      }),
    );
    expect(programIssue).not.toHaveProperty("updates");
  });

  it("surfaces a flag-only ineligible director as a standalone manual review", () => {
    const issues = detectLegacyModelIssues(
      [
        {
          id: "person-adjunct",
          firstName: "Adjunct",
          lastName: "Faculty",
          roles: ["faculty"],
          isAdjunct: true,
          isUPD: true,
          programId: "program-1",
        },
      ],
      [],
      [
        {
          id: "program-1",
          name: "Interior Design",
          directors: [],
        },
      ],
    );

    expect(issues).toEqual([
      expect.objectContaining({
        type: "legacy_person_director_flag",
        recordType: "people",
        autoFixable: false,
        manualReview: expect.arrayContaining([
          expect.objectContaining({ personId: "person-adjunct" }),
        ]),
      }),
    ]);
    expect(issues[0]).not.toHaveProperty("updates");
  });

  it("builds sanitized Baylor ID optionality cleanup plans", () => {
    const removedValue = "123456789";
    const { report, plans } = buildBaylorIdOptionalityCleanupPlan({
      peopleDocs: [
        {
          id: "person-1",
          data: {
            firstName: "Jane",
            lastName: "Doe",
            baylorId: "",
            externalIds: { baylorId: " " },
            identityKey: `baylor:${removedValue}`,
            identityKeys: [`baylor:${removedValue}`, "email:jane@example.edu"],
            identitySource: "baylor",
          },
        },
      ],
      scheduleDocs: [
        {
          id: "schedule-1",
          data: {
            courseCode: "BIO 1300",
            section: "01",
            instructorId: "person-1",
            instructorBaylorId: removedValue,
          },
        },
      ],
      historyDocsByCollection: {
        changeLog: [
          {
            id: "change-1",
            data: {
              message: `Changed Baylor ID from ${removedValue}`,
              changes: {
                baylorId: { from: removedValue, to: "" },
              },
            },
          },
        ],
        editHistory: [],
      },
      importTransactionDocs: [
        {
          id: "import-1",
          data: {
            status: "committed",
            diff: [{ field: "baylorId", from: removedValue, to: "987654321" }],
          },
        },
      ],
    });

    expect(report.summary.peopleToUpdate).toBe(1);
    expect(report.summary.schedulesToUpdate).toBe(1);
    expect(report.summary.historyDocsToScrub).toBe(1);
    expect(report.summary.importTransactionsToScrub).toBe(1);
    expect(JSON.stringify(report)).not.toContain(removedValue);
    expect(JSON.stringify(report)).not.toContain("987654321");

    expect(plans.people[0].updates.baylorId).toBeNull();
    expect(plans.people[0].updates.externalIds.baylorId).toBeNull();
    expect(plans.people[0].updates.identityKeys).toEqual([
      "email:jane@example.edu",
    ]);
    expect(plans.schedules[0].updates.instructorBaylorId).toBeNull();
    expect(JSON.stringify(plans.history[0].updates)).not.toContain(removedValue);
    expect(JSON.stringify(plans.importTransactions[0].updates)).not.toContain(
      removedValue,
    );
    expect(JSON.stringify(plans.importTransactions[0].updates)).not.toContain(
      "987654321",
    );
  });

  it("skips active import previews during Baylor ID history scrubbing", () => {
    const activeValue = "123456789";
    const { report, plans } = buildBaylorIdOptionalityCleanupPlan({
      importTransactionDocs: [
        {
          id: "preview-1",
          data: {
            status: "preview",
            proposedPerson: { baylorId: activeValue },
          },
        },
      ],
    });

    expect(report.summary.activeImportTransactionsSkipped).toBe(1);
    expect(report.summary.importTransactionsToScrub).toBe(0);
    expect(plans.importTransactions).toEqual([]);
    expect(JSON.stringify(report)).not.toContain(activeValue);
  });

  it("redacts Baylor ID values from diff-shaped history payloads", () => {
    const scrubbed = scrubBaylorIdHistoryData({
      diff: [
        {
          field: "externalIds.baylorId",
          from: "123456789",
          to: "987654321",
        },
      ],
      identityKey: "baylor:123456789",
      identityKeys: ["baylor:987654321", "email:jane@example.edu"],
    });

    expect(JSON.stringify(scrubbed)).not.toContain("123456789");
    expect(JSON.stringify(scrubbed)).not.toContain("987654321");
    expect(scrubbed.diff[0].field).toBe("externalIds.baylorId");
    expect(scrubbed.identityKeys).toContain("email:jane@example.edu");
  });

  it("promotes top-level student mirror fields into canonical jobs when jobs are missing", () => {
    const person = {
      id: "person-legacy-student",
      roles: ["student"],
      jobTitle: "Desk Assistant",
      supervisor: "Advisor Person",
      supervisorId: "advisor-1",
      hourlyRate: "12.50",
      primaryBuilding: "GOEBEL",
      weeklySchedule: [{ day: "T", start: "10:00", end: "12:00" }],
      semesterSchedules: {
        "202610": {
          semester: "Spring 2026",
          semesterCode: "202610",
          jobTitle: "Desk Assistant",
          supervisor: "Advisor Person",
          supervisorId: "advisor-1",
          hourlyRate: "12.50",
          primaryBuilding: "GOEBEL",
          weeklySchedule: [{ day: "T", start: "10:00", end: "12:00" }],
        },
      },
    };

    const { updates, touchedFields } = buildPersonLegacyFixUpdates(person);

    expect(Array.isArray(updates.jobs)).toBe(true);
    expect(updates.jobs).toHaveLength(1);
    expect(updates.jobs[0]).toEqual(
      expect.objectContaining({
        jobTitle: "Desk Assistant",
        supervisorId: "advisor-1",
        hourlyRate: "12.50",
      }),
    );
    expect(updates).toHaveProperty("jobTitle");
    expect(updates).toHaveProperty("supervisor");
    expect(updates).toHaveProperty("supervisorId");
    expect(updates).toHaveProperty("hourlyRate");
    expect(updates.semesterSchedules["202610"]).toEqual(
      expect.objectContaining({
        jobs: expect.any(Array),
      }),
    );
    expect(updates.semesterSchedules["202610"].jobTitle).toBeUndefined();
    expect(touchedFields).toEqual(
      expect.arrayContaining([
        "jobs",
        "student_payload_promoted_to_job",
        "student_payload_mirror_fields",
        "semester_schedule_mirror_fields",
      ]),
    );
  });

  it("backfills partial semester jobs before removing semester mirror fields", () => {
    const person = {
      id: "person-partial-semester-job",
      roles: ["student"],
      semesterSchedules: {
        "202610": {
          semester: "Spring 2026",
          jobTitle: "Desk Assistant",
          supervisor: "Advisor Person",
          supervisorId: "advisor-1",
          hourlyRate: "12.50",
          jobs: [{ jobTitle: "Desk Assistant", supervisor: "Advisor Person" }],
        },
      },
    };

    const { updates } = buildPersonLegacyFixUpdates(person);
    const semester = updates.semesterSchedules["202610"];

    expect(semester.jobs[0]).toEqual(
      expect.objectContaining({
        jobTitle: "Desk Assistant",
        supervisor: "Advisor Person",
        supervisorId: "advisor-1",
        hourlyRate: "12.50",
      }),
    );
    expect(semester.jobTitle).toBeUndefined();
    expect(semester.supervisorId).toBeUndefined();
  });

  it("filters duplicate cleanup candidates to records touched by an import", () => {
    const duplicates = [
      {
        type: "email",
        records: [{ id: "old-person-1" }, { id: "old-person-2" }],
      },
      {
        type: "email",
        records: [{ id: "new-person-1" }, { id: "old-person-3" }],
      },
    ];

    expect(filterDuplicatesByScopedRecordIds(duplicates, ["new-person-1"])).toEqual([
      duplicates[1],
    ]);
    expect(filterDuplicatesByScopedRecordIds(duplicates, [])).toEqual([]);
    expect(filterDuplicatesByScopedRecordIds(duplicates, undefined)).toEqual(
      duplicates,
    );
  });
});
