import { describe, expect, it } from "vitest";

import { buildDirectorMigrationPlan } from "../directorMigration";

const person = (id, overrides = {}) => ({
  id,
  name: `Person ${id}`,
  ...overrides,
});

const program = (id, overrides = {}) => ({
  id,
  name: `Program ${id}`,
  ...overrides,
});

describe("buildDirectorMigrationPlan", () => {
  it("migrates assignments confirmed by both legacy sources", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1", { isUPD: true, programId: "prog1" })],
      [program("prog1", { updIds: ["p1"] })],
    );

    expect(plan.assignments).toEqual([
      expect.objectContaining({
        programId: "prog1",
        personId: "p1",
        role: "upd",
        source: "program updIds",
      }),
    ]);
    const update = plan.programUpdates.find((u) => u.programId === "prog1");
    expect(update.directors).toEqual([{ personId: "p1", role: "upd" }]);
    expect(plan.peopleCleanups).toEqual([
      expect.objectContaining({ personId: "p1" }),
    ]);
    expect(plan.orphaned).toEqual([]);
    expect(plan.manualReview).toEqual([]);
  });

  it("migrates program-side updIds even when the person flag is missing", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1", { programId: "prog1" })],
      [program("prog1", { updIds: ["p1"] })],
    );
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0].source).toBe("program updIds");
  });

  it("migrates the legacy singular updId field", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1")],
      [program("prog1", { updId: "p1" })],
    );
    expect(plan.assignments).toEqual([
      expect.objectContaining({ programId: "prog1", personId: "p1", role: "upd" }),
    ]);
    expect(plan.programUpdates[0].hadLegacyFields).toBe(true);
  });

  it("migrates directory-flag-only people through their program membership", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1", { isUPD: true, programId: "prog1" })],
      [program("prog1")],
    );
    expect(plan.assignments).toEqual([
      expect.objectContaining({
        programId: "prog1",
        personId: "p1",
        role: "upd",
        source: "directory flag + program membership",
      }),
    ]);
  });

  it("preserves both sides when the legacy sources point at different programs", () => {
    // prog1's management page assigned p1 as UPD, while the directory flag
    // plus program membership says p1 directs prog2. Neither source is
    // silently discarded: both directorships migrate (cross-program
    // directing is supported by the canonical model).
    const plan = buildDirectorMigrationPlan(
      [person("p1", { isUPD: true, programId: "prog2" })],
      [program("prog1", { updIds: ["p1"] }), program("prog2")],
    );
    expect(plan.assignments).toEqual([
      expect.objectContaining({
        programId: "prog1",
        personId: "p1",
        source: "program updIds",
      }),
      expect.objectContaining({
        programId: "prog2",
        personId: "p1",
        source: "directory flag + program membership",
      }),
    ]);
  });

  it("reports flagged people without a resolvable program for manual review", () => {
    const plan = buildDirectorMigrationPlan(
      [
        person("p1", { isUPD: true }),
        person("p2", { isUPD: true, programId: "ghost" }),
      ],
      [program("prog1")],
    );
    expect(plan.assignments).toEqual([]);
    expect(plan.manualReview).toHaveLength(2);
    expect(plan.manualReview[0].reason).toMatch(/no program assignment/i);
    expect(plan.manualReview[1].reason).toMatch(/does not match any program/i);
    // Their legacy flags are only removed by the explicit migration apply,
    // never by the routine auto-fix.
    expect(plan.peopleCleanups).toEqual([]);
    expect(plan.manualReviewCleanups.map((c) => c.personId)).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("reports and drops orphaned updIds references", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1")],
      [program("prog1", { updIds: ["p1", "deleted-person"] })],
    );
    expect(plan.orphaned).toEqual([
      expect.objectContaining({
        programId: "prog1",
        personId: "deleted-person",
      }),
    ]);
    expect(plan.programUpdates[0].directors).toEqual([
      { personId: "p1", role: "upd" },
    ]);
  });

  it("follows mergedInto chains to the surviving person", () => {
    const plan = buildDirectorMigrationPlan(
      [
        person("old", { mergedInto: "new" }),
        person("new"),
      ],
      [program("prog1", { updIds: ["old"] })],
    );
    expect(plan.assignments).toEqual([
      expect.objectContaining({ personId: "new" }),
    ]);
    expect(plan.orphaned).toEqual([]);
  });

  it("migrates a merged person's directory flag to the survivor", () => {
    const plan = buildDirectorMigrationPlan(
      [
        person("old", {
          isUPD: true,
          programId: "prog1",
          mergedInto: "new",
        }),
        person("new"),
      ],
      [program("prog1")],
    );

    expect(plan.assignments).toEqual([
      expect.objectContaining({
        programId: "prog1",
        personId: "new",
        source: "directory flag + program membership",
      }),
    ]);
    expect(plan.peopleCleanups).toEqual([
      expect.objectContaining({ personId: "old" }),
    ]);
    expect(plan.manualReview).toEqual([]);
  });

  it("routes ineligible adjunct legacy assignments to manual review", () => {
    const plan = buildDirectorMigrationPlan(
      [
        person("from-list", { isAdjunct: true }),
        person("from-flag", {
          isAdjunct: true,
          isUPD: true,
          programId: "prog2",
        }),
      ],
      [
        program("prog1", { updIds: ["from-list"] }),
        program("prog2"),
      ],
    );

    expect(plan.assignments).toEqual([]);
    expect(plan.manualReview).toHaveLength(2);
    expect(plan.manualReview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personId: "from-list", programId: "prog1" }),
        expect.objectContaining({ personId: "from-flag", programId: "prog2" }),
      ]),
    );
    plan.manualReview.forEach((entry) => {
      expect(entry.reason).toMatch(/adjunct/i);
    });
    expect(plan.programUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ programId: "prog1", directors: [] }),
      ]),
    );
    expect(plan.peopleCleanups).toEqual([]);
    expect(plan.manualReviewCleanups).toEqual([
      expect.objectContaining({ personId: "from-flag" }),
    ]);
  });

  it("dedupes duplicate updIds entries and flag+list overlap", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1", { isUPD: true, programId: "prog1" })],
      [program("prog1", { updIds: ["p1", "p1"], updId: "p1" })],
    );
    expect(plan.assignments).toHaveLength(1);
    expect(plan.programUpdates[0].directors).toEqual([
      { personId: "p1", role: "upd" },
    ]);
  });

  it("preserves existing canonical directors (including GPD) while migrating", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1"), person("p2")],
      [
        program("prog1", {
          directors: [{ personId: "p2", role: "gpd" }],
          updIds: ["p1"],
        }),
      ],
    );
    expect(plan.programUpdates[0].directors).toEqual([
      { personId: "p1", role: "upd" },
      { personId: "p2", role: "gpd" },
    ]);
  });

  it("still cleans legacy fields when updIds is an empty array", () => {
    const plan = buildDirectorMigrationPlan(
      [],
      [program("prog1", { updIds: [] })],
    );
    expect(plan.assignments).toEqual([]);
    expect(plan.programUpdates).toEqual([
      expect.objectContaining({ programId: "prog1", hadLegacyFields: true }),
    ]);
  });

  it("normalizes programs that only lack the directors field", () => {
    const plan = buildDirectorMigrationPlan([], [program("prog1")]);
    expect(plan.programUpdates).toEqual([
      expect.objectContaining({ programId: "prog1", directors: [] }),
    ]);
  });

  it("strips the legacy flag even when it is false", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1", { isUPD: false })],
      [program("prog1", { directors: [] })],
    );
    expect(plan.peopleCleanups).toEqual([
      expect.objectContaining({ personId: "p1" }),
    ]);
  });

  it("is a no-op when data is already canonical (idempotent re-run)", () => {
    const plan = buildDirectorMigrationPlan(
      [person("p1")],
      [
        program("prog1", {
          directors: [
            { personId: "p1", role: "upd" },
            { personId: "p1", role: "gpd" },
          ],
        }),
      ],
    );
    expect(plan.assignments).toEqual([]);
    expect(plan.programUpdates).toEqual([]);
    expect(plan.peopleCleanups).toEqual([]);
    expect(plan.manualReviewCleanups).toEqual([]);
    expect(plan.orphaned).toEqual([]);
    expect(plan.manualReview).toEqual([]);
  });

  it("summarizes the plan for the admin preview", () => {
    const plan = buildDirectorMigrationPlan(
      [
        person("p1", { isUPD: true, programId: "prog1" }),
        person("p2", { isUPD: true }),
      ],
      [program("prog1", { updIds: ["p1", "gone"] }), program("prog2")],
    );
    expect(plan.summary).toEqual(
      expect.objectContaining({
        programsTotal: 2,
        peopleTotal: 2,
        migratedAssignments: 1,
        orphanedReferences: 1,
        manualReviewCount: 1,
        peopleFlagsToRemove: 2,
      }),
    );
  });
});
