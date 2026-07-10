/**
 * Regression coverage for the original data-integrity bug: a person shown as
 * a Program Director in the directory MUST also appear as a director on the
 * corresponding program page (and vice versa), because both views now derive
 * from the single canonical relationship (programs/{id}.directors).
 */
import { describe, expect, it } from "vitest";

import { adaptPeopleToFaculty, adaptPeopleToStaff } from "../dataAdapter";
import {
  DIRECTOR_ROLES,
  addDirector,
  buildDirectorIndex,
  getDirectorAssignments,
  getProgramDirectors,
  matchesDirectorFilter,
  removeDirector,
} from "../directorAssignments";

const PROGRAMS = [
  {
    id: "prog-apparel",
    name: "Apparel Design",
    directors: [
      { personId: "fac-upd", role: "upd" },
      { personId: "fac-both", role: "upd" },
      { personId: "fac-both", role: "gpd" },
    ],
  },
  {
    id: "prog-nutrition",
    name: "Nutrition",
    directors: [
      { personId: "fac-gpd", role: "gpd" },
      { personId: "fac-multi", role: "upd" },
    ],
  },
  {
    id: "prog-interior",
    name: "Interior Design",
    directors: [{ personId: "fac-multi", role: "gpd" }],
  },
  { id: "prog-empty", name: "Child & Family Studies", directors: [] },
];

const PEOPLE = [
  { id: "fac-upd", firstName: "Uma", lastName: "Underwood", roles: ["faculty"], programId: "prog-apparel" },
  { id: "fac-gpd", firstName: "Greg", lastName: "Graduate", roles: ["faculty"], programId: "prog-nutrition" },
  { id: "fac-both", firstName: "Bobbi", lastName: "Bothroles", roles: ["faculty"], programId: "prog-apparel" },
  { id: "fac-multi", firstName: "Mel", lastName: "Multiprogram", roles: ["faculty"], programId: "prog-nutrition" },
  { id: "fac-none", firstName: "Nora", lastName: "Nodirector", roles: ["faculty"], programId: "prog-empty" },
  { id: "staff-dir", firstName: "Sam", lastName: "Staffer", roles: ["staff"] },
];

describe("directory and program pages share one source of truth", () => {
  const facultyView = adaptPeopleToFaculty(PEOPLE, [], PROGRAMS);
  const facultyById = new Map(facultyView.map((f) => [f.id, f]));

  it("every UPD shown in the directory appears as a UPD on that program's page", () => {
    facultyView.forEach((person) => {
      (person.directorAssignments || []).forEach((assignment) => {
        const program = PROGRAMS.find((p) => p.id === assignment.programId);
        const roleDirectors = getProgramDirectors(program, assignment.role);
        expect(
          roleDirectors.some((entry) => entry.personId === person.id),
        ).toBe(true);
      });
    });
  });

  it("every director on a program page carries the same badge in the directory (UPD and GPD)", () => {
    PROGRAMS.forEach((program) => {
      getProgramDirectors(program).forEach(({ personId, role }) => {
        const directoryPerson = facultyById.get(personId);
        expect(directoryPerson).toBeDefined();
        expect(
          directoryPerson.directorAssignments.some(
            (assignment) =>
              assignment.programId === program.id && assignment.role === role,
          ),
        ).toBe(true);
      });
    });
  });

  it("shows every assignment for multi-program and multi-role directors", () => {
    expect(facultyById.get("fac-multi").directorAssignments).toEqual([
      { programId: "prog-nutrition", programName: "Nutrition", role: "upd" },
      { programId: "prog-interior", programName: "Interior Design", role: "gpd" },
    ]);
    expect(facultyById.get("fac-both").directorAssignments).toEqual([
      { programId: "prog-apparel", programName: "Apparel Design", role: "upd" },
      { programId: "prog-apparel", programName: "Apparel Design", role: "gpd" },
    ]);
  });

  it("handles the empty states: no directors on a program, no assignments on a person", () => {
    expect(getProgramDirectors(PROGRAMS[3])).toEqual([]);
    expect(facultyById.get("fac-none").directorAssignments).toEqual([]);
  });

  it("keeps directory filters consistent with program-page role grouping", () => {
    const updOnly = facultyView.filter((p) =>
      matchesDirectorFilter(p.directorAssignments, DIRECTOR_ROLES.UPD),
    );
    const gpdOnly = facultyView.filter((p) =>
      matchesDirectorFilter(p.directorAssignments, DIRECTOR_ROLES.GPD),
    );
    expect(updOnly.map((p) => p.id).sort()).toEqual(
      ["fac-upd", "fac-both", "fac-multi"].sort(),
    );
    expect(gpdOnly.map((p) => p.id).sort()).toEqual(
      ["fac-gpd", "fac-both", "fac-multi"].sort(),
    );
  });

  it("staff records derive director assignments from the same relationship", () => {
    const staffPrograms = [
      {
        id: "prog-apparel",
        name: "Apparel Design",
        directors: [{ personId: "staff-dir", role: "gpd" }],
      },
    ];
    const staffView = adaptPeopleToStaff(PEOPLE, [], staffPrograms);
    const staffer = staffView.find((s) => s.id === "staff-dir");
    expect(staffer.directorAssignments).toEqual([
      { programId: "prog-apparel", programName: "Apparel Design", role: "gpd" },
    ]);
  });

  it("keeps directors visible in the faculty view even without a faculty role", () => {
    const soloDirectorPeople = [
      { id: "dir-only", firstName: "Dee", lastName: "Rector", roles: [] },
    ];
    const soloPrograms = [
      {
        id: "prog-x",
        name: "Program X",
        directors: [{ personId: "dir-only", role: "upd" }],
      },
    ];
    const view = adaptPeopleToFaculty(soloDirectorPeople, [], soloPrograms);
    expect(view.map((p) => p.id)).toContain("dir-only");
  });
});

describe("mutations through the canonical model update every view identically", () => {
  it("assigning a director in one place is reflected in both views after one write", () => {
    const before = PROGRAMS.find((p) => p.id === "prog-empty");
    const updatedProgram = {
      ...before,
      directors: addDirector(before.directors, "fac-none", DIRECTOR_ROLES.GPD),
    };
    const nextPrograms = PROGRAMS.map((p) =>
      p.id === updatedProgram.id ? updatedProgram : p,
    );

    // Program page view
    expect(
      getProgramDirectors(updatedProgram, DIRECTOR_ROLES.GPD).map(
        (e) => e.personId,
      ),
    ).toEqual(["fac-none"]);

    // Directory view (rebuilt from the same data)
    const nextFaculty = adaptPeopleToFaculty(PEOPLE, [], nextPrograms);
    expect(
      nextFaculty.find((p) => p.id === "fac-none").directorAssignments,
    ).toEqual([
      {
        programId: "prog-empty",
        programName: "Child & Family Studies",
        role: "gpd",
      },
    ]);
  });

  it("removing one director leaves unrelated assignments untouched everywhere", () => {
    const apparel = PROGRAMS.find((p) => p.id === "prog-apparel");
    const updated = {
      ...apparel,
      directors: removeDirector(apparel.directors, "fac-both", DIRECTOR_ROLES.UPD),
    };
    const nextPrograms = PROGRAMS.map((p) => (p.id === updated.id ? updated : p));
    const index = buildDirectorIndex(nextPrograms);

    // fac-both keeps GPD for the same program; fac-upd is untouched.
    expect(getDirectorAssignments(index, "fac-both")).toEqual([
      { programId: "prog-apparel", programName: "Apparel Design", role: "gpd" },
    ]);
    expect(getDirectorAssignments(index, "fac-upd")).toEqual([
      { programId: "prog-apparel", programName: "Apparel Design", role: "upd" },
    ]);
    // Other programs are untouched.
    expect(getDirectorAssignments(index, "fac-multi")).toHaveLength(2);
  });
});
