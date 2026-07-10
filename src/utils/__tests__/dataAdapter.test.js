import { describe, expect, it } from "vitest";

import { adaptPeopleToFaculty, adaptPeopleToStaff } from "../dataAdapter";

describe("dataAdapter active filtering", () => {
  it("adaptPeopleToFaculty excludes inactive when includeInactive is false", () => {
    const people = [
      { id: "f1", firstName: "Ada", lastName: "Active", roles: ["faculty"], isActive: true },
      { id: "f2", firstName: "Ivy", lastName: "Inactive", roles: ["faculty"], isActive: false },
      { id: "f3", firstName: "Mia", lastName: "Missing", roles: ["faculty"] }
    ];

    const result = adaptPeopleToFaculty(people, [], [], { includeInactive: false });
    const ids = result.map((p) => p.id);
    expect(ids).toEqual(["f1", "f3"]);
  });

  it("adaptPeopleToStaff excludes inactive when includeInactive is false", () => {
    const people = [
      { id: "s1", firstName: "Sam", lastName: "Active", roles: ["staff"], isActive: true },
      { id: "s2", firstName: "Ina", lastName: "Inactive", roles: ["staff"], isActive: false },
      { id: "s3", firstName: "Nia", lastName: "Missing", roles: ["staff"] }
    ];

    const result = adaptPeopleToStaff(people, [], [], { includeInactive: false });
    const ids = result.map((p) => p.id);
    expect(ids).toEqual(["s1", "s3"]);
  });

  it("defaults isActive to true when missing", () => {
    const people = [
      { id: "f1", firstName: "Ada", lastName: "Active", roles: ["faculty"] }
    ];

    const result = adaptPeopleToFaculty(people, [], [], { includeInactive: false });
    expect(result[0].isActive).toBe(true);
  });
});
