import { describe, expect, it } from "vitest";

import {
  DIRECTOR_ROLES,
  DIRECTOR_ROLE_ORDER,
  addDirector,
  buildDirectorIndex,
  directorsAreEqual,
  formatDirectorAssignment,
  formatDirectorAssignmentList,
  getDirectorAssignments,
  getDirectorEligibilityError,
  getDirectorRoleAbbreviation,
  getDirectorRoleLabel,
  getProgramDirectors,
  hasDirector,
  isDirectorRole,
  matchesDirectorFilter,
  normalizeDirectors,
  reassignDirectorPerson,
  removeDirector,
  removePersonFromDirectors,
  summarizeDirectorRoles,
} from "../directorAssignments";

describe("director role typing", () => {
  it("defines UPD and GPD as the supported role types", () => {
    expect(DIRECTOR_ROLES.UPD).toBe("upd");
    expect(DIRECTOR_ROLES.GPD).toBe("gpd");
    expect(DIRECTOR_ROLE_ORDER).toEqual(["upd", "gpd"]);
  });

  it("validates role values case-insensitively and rejects unknown roles", () => {
    expect(isDirectorRole("upd")).toBe(true);
    expect(isDirectorRole("UPD")).toBe(true);
    expect(isDirectorRole(" Gpd ")).toBe(true);
    expect(isDirectorRole("director")).toBe(false);
    expect(isDirectorRole("")).toBe(false);
    expect(isDirectorRole(null)).toBe(false);
  });

  it("exposes abbreviations and labels", () => {
    expect(getDirectorRoleAbbreviation("upd")).toBe("UPD");
    expect(getDirectorRoleLabel("gpd")).toBe("Graduate Program Director");
    expect(getDirectorRoleAbbreviation("nope")).toBe("");
  });
});

describe("normalizeDirectors", () => {
  it("returns [] for missing or non-array values", () => {
    expect(normalizeDirectors(undefined)).toEqual([]);
    expect(normalizeDirectors(null)).toEqual([]);
    expect(normalizeDirectors("x")).toEqual([]);
  });

  it("drops invalid entries, normalizes role casing, and dedupes", () => {
    const raw = [
      { personId: "p1", role: "UPD" },
      { personId: "p1", role: "upd" },
      { personId: " ", role: "upd" },
      { personId: "p2", role: "chair" },
      { personId: "p2", role: "gpd" },
      null,
      { role: "upd" },
    ];
    expect(normalizeDirectors(raw)).toEqual([
      { personId: "p1", role: "upd" },
      { personId: "p2", role: "gpd" },
    ]);
  });

  it("sorts by role order then personId for stable comparisons", () => {
    const raw = [
      { personId: "b", role: "gpd" },
      { personId: "b", role: "upd" },
      { personId: "a", role: "upd" },
    ];
    expect(normalizeDirectors(raw).map((e) => `${e.personId}:${e.role}`)).toEqual([
      "a:upd",
      "b:upd",
      "b:gpd",
    ]);
  });
});

describe("assignment mutations", () => {
  it("adds an assignment without touching existing ones", () => {
    const directors = [{ personId: "p1", role: "upd" }];
    const next = addDirector(directors, "p2", "gpd");
    expect(next).toEqual([
      { personId: "p1", role: "upd" },
      { personId: "p2", role: "gpd" },
    ]);
    // original untouched
    expect(directors).toEqual([{ personId: "p1", role: "upd" }]);
  });

  it("prevents duplicate (person, role) pairs", () => {
    const directors = [{ personId: "p1", role: "upd" }];
    expect(addDirector(directors, "p1", "UPD")).toEqual([
      { personId: "p1", role: "upd" },
    ]);
  });

  it("allows the same person to hold both UPD and GPD for one program", () => {
    const next = addDirector([{ personId: "p1", role: "upd" }], "p1", "gpd");
    expect(next).toEqual([
      { personId: "p1", role: "upd" },
      { personId: "p1", role: "gpd" },
    ]);
  });

  it("removes exactly one (person, role) assignment", () => {
    const directors = [
      { personId: "p1", role: "upd" },
      { personId: "p1", role: "gpd" },
      { personId: "p2", role: "upd" },
    ];
    expect(removeDirector(directors, "p1", "gpd")).toEqual([
      { personId: "p1", role: "upd" },
      { personId: "p2", role: "upd" },
    ]);
  });

  it("removes all of a person's roles with removePersonFromDirectors", () => {
    const directors = [
      { personId: "p1", role: "upd" },
      { personId: "p1", role: "gpd" },
      { personId: "p2", role: "upd" },
    ];
    expect(removePersonFromDirectors(directors, "p1")).toEqual([
      { personId: "p2", role: "upd" },
    ]);
  });

  it("reassigns a person's entries and dedupes against the target", () => {
    const directors = [
      { personId: "old", role: "upd" },
      { personId: "new", role: "upd" },
      { personId: "old", role: "gpd" },
    ];
    expect(reassignDirectorPerson(directors, "old", "new")).toEqual([
      { personId: "new", role: "upd" },
      { personId: "new", role: "gpd" },
    ]);
  });

  it("compares director lists order-insensitively via normalization", () => {
    expect(
      directorsAreEqual(
        [
          { personId: "b", role: "gpd" },
          { personId: "a", role: "UPD" },
        ],
        [
          { personId: "a", role: "upd" },
          { personId: "b", role: "gpd" },
        ],
      ),
    ).toBe(true);
    expect(directorsAreEqual([{ personId: "a", role: "upd" }], [])).toBe(false);
  });
});

describe("getProgramDirectors / hasDirector", () => {
  const program = {
    id: "prog1",
    name: "Interior Design",
    directors: [
      { personId: "p1", role: "upd" },
      { personId: "p2", role: "gpd" },
      { personId: "p3", role: "upd" },
    ],
  };

  it("supports no directors, one role, or role filtering", () => {
    expect(getProgramDirectors({ id: "empty" })).toEqual([]);
    expect(getProgramDirectors(program, "upd").map((e) => e.personId)).toEqual([
      "p1",
      "p3",
    ]);
    expect(getProgramDirectors(program, "GPD").map((e) => e.personId)).toEqual([
      "p2",
    ]);
  });

  it("answers membership questions", () => {
    expect(hasDirector(program.directors, "p1", "upd")).toBe(true);
    expect(hasDirector(program.directors, "p1", "gpd")).toBe(false);
    expect(hasDirector(undefined, "p1", "upd")).toBe(false);
  });
});

describe("buildDirectorIndex", () => {
  const programs = [
    {
      id: "prog1",
      name: "Apparel",
      directors: [
        { personId: "p1", role: "upd" },
        { personId: "p2", role: "gpd" },
      ],
    },
    {
      id: "prog2",
      name: "Nutrition",
      directors: [
        { personId: "p1", role: "gpd" },
        { personId: "p1", role: "upd" },
      ],
    },
    { id: "prog3", name: "Child & Family Studies", directors: [] },
    { id: "prog4", name: "No Directors Field" },
  ];

  it("indexes every assignment by person across programs and roles", () => {
    const index = buildDirectorIndex(programs);
    expect(getDirectorAssignments(index, "p1")).toEqual([
      { programId: "prog1", programName: "Apparel", role: "upd" },
      { programId: "prog2", programName: "Nutrition", role: "upd" },
      { programId: "prog2", programName: "Nutrition", role: "gpd" },
    ]);
    expect(getDirectorAssignments(index, "p2")).toEqual([
      { programId: "prog1", programName: "Apparel", role: "gpd" },
    ]);
    expect(getDirectorAssignments(index, "nobody")).toEqual([]);
  });

  it("handles empty inputs gracefully", () => {
    expect(buildDirectorIndex().size).toBe(0);
    expect(getDirectorAssignments(null, "p1")).toEqual([]);
  });
});

describe("filters, summaries, and labels", () => {
  const assignments = [
    { programId: "prog1", programName: "Apparel", role: "upd" },
    { programId: "prog2", programName: "Nutrition", role: "gpd" },
  ];

  it("matches director filters", () => {
    expect(matchesDirectorFilter(assignments, "all")).toBe(true);
    expect(matchesDirectorFilter(assignments, "upd")).toBe(true);
    expect(matchesDirectorFilter(assignments, "gpd")).toBe(true);
    expect(matchesDirectorFilter(assignments, "any")).toBe(true);
    expect(matchesDirectorFilter(assignments, "none")).toBe(false);
    expect(matchesDirectorFilter([], "none")).toBe(true);
    expect(matchesDirectorFilter([], "upd")).toBe(false);
    expect(matchesDirectorFilter(undefined, "any")).toBe(false);
  });

  it("summarizes unique role abbreviations in role order", () => {
    expect(summarizeDirectorRoles(assignments)).toEqual(["UPD", "GPD"]);
    expect(
      summarizeDirectorRoles([{ role: "gpd" }, { role: "gpd" }]),
    ).toEqual(["GPD"]);
    expect(summarizeDirectorRoles([])).toEqual([]);
  });

  it("formats assignment labels", () => {
    expect(formatDirectorAssignment(assignments[0])).toBe("UPD — Apparel");
    expect(formatDirectorAssignment({ role: "gpd" })).toBe("GPD");
    expect(formatDirectorAssignmentList(assignments)).toBe(
      "UPD — Apparel; GPD — Nutrition",
    );
    expect(formatDirectorAssignmentList([])).toBe("");
  });
});

describe("eligibility", () => {
  it("rejects adjunct faculty and missing people, accepts others", () => {
    expect(getDirectorEligibilityError(null)).toMatch(/not found/i);
    expect(
      getDirectorEligibilityError({ id: "p1", isAdjunct: true }),
    ).toMatch(/adjunct/i);
    expect(getDirectorEligibilityError({ id: "p1", isAdjunct: false })).toBe(
      null,
    );
  });
});
