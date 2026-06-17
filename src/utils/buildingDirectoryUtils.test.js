import { beforeEach, describe, expect, it } from "vitest";

import { buildOfficeBuildingData } from "./buildingDirectoryUtils";
import { applyBuildingConfig, normalizeBuildingConfig } from "./locationService";

beforeEach(() => {
  applyBuildingConfig(
    normalizeBuildingConfig({
      version: 1,
      buildings: [
        { code: "GOEBEL", displayName: "Goebel Building", aliases: ["Goebel"] },
        {
          code: "MGBJ",
          displayName: "Mary Gibbs Jones Building",
          aliases: ["Mary Gibbs Jones"],
        },
      ],
    }),
  );
});

const spacesByKey = new Map([
  [
    "GOEBEL:116",
    {
      id: "GOEBEL:116",
      spaceKey: "GOEBEL:116",
      buildingCode: "GOEBEL",
      buildingDisplayName: "Goebel Building",
      spaceNumber: "116",
      displayName: "Goebel Building 116",
    },
  ],
  [
    "MGBJ:210",
    {
      id: "MGBJ:210",
      spaceKey: "MGBJ:210",
      buildingCode: "MGBJ",
      buildingDisplayName: "Mary Gibbs Jones Building",
      spaceNumber: "210",
      displayName: "Mary Gibbs Jones Building 210",
    },
  ],
]);

const tinaFaculty = {
  id: "person-tina",
  firstName: "Tina",
  lastName: "Dekle",
  name: "Tina M. Dekle",
  email: "tina_dekle@baylor.edu",
  phone: "2547101126",
  jobTitle: "Lab Coordinator",
  officeSpaceId: "GOEBEL:116",
  officeSpaceIds: ["GOEBEL:116"],
  isAdjunct: true,
  isAlsoStaff: true,
  program: { id: "apparel", name: "Apparel" },
};

const tinaStaff = {
  id: "person-tina",
  firstName: "Tina",
  lastName: "Dekle",
  name: "Tina M. Dekle",
  email: "tina_dekle@baylor.edu",
  phone: "2547101126",
  jobTitle: "Lab Coordinator",
  officeSpaceId: "GOEBEL:116",
  officeSpaceIds: ["GOEBEL:116"],
  isAdjunct: true,
  isAlsoFaculty: true,
};

describe("buildOfficeBuildingData", () => {
  it("merges overlapping faculty and staff records into one office row", () => {
    const result = buildOfficeBuildingData({
      facultyData: [tinaFaculty],
      staffData: [tinaStaff],
      spacesByKey,
    });

    const goebel = result["Goebel Building"];
    expect(goebel.people).toHaveLength(1);
    expect(goebel.facultyCount).toBe(1);
    expect(goebel.staffCount).toBe(1);

    expect(goebel.people[0]).toMatchObject({
      id: "person-tina",
      name: "Tina M. Dekle",
      roleType: "both",
      displayRole: "Faculty & Staff",
      buildingName: "Goebel Building",
      roomNumber: "116",
      office: "Goebel Building 116",
      program: { id: "apparel", name: "Apparel" },
    });
  });

  it("keeps the faculty role row when staff is hidden", () => {
    const result = buildOfficeBuildingData({
      facultyData: [tinaFaculty],
      staffData: [tinaStaff],
      spacesByKey,
      showStaff: false,
    });

    const goebel = result["Goebel Building"];
    expect(goebel.people).toHaveLength(1);
    expect(goebel.facultyCount).toBe(1);
    expect(goebel.staffCount).toBe(0);
    expect(goebel.people[0]).toMatchObject({
      roleType: "faculty",
      displayRole: "Adjunct Faculty",
    });
  });

  it("can show staff assignments for adjunct faculty when adjunct faculty are hidden", () => {
    const result = buildOfficeBuildingData({
      facultyData: [tinaFaculty],
      staffData: [tinaStaff],
      spacesByKey,
      showAdjuncts: false,
    });

    const goebel = result["Goebel Building"];
    expect(goebel.people).toHaveLength(1);
    expect(goebel.facultyCount).toBe(0);
    expect(goebel.staffCount).toBe(1);
    expect(goebel.people[0]).toMatchObject({
      roleType: "staff",
      displayRole: "Faculty & Staff",
    });
  });

  it("lists one merged row per assigned office location", () => {
    const faculty = {
      ...tinaFaculty,
      officeSpaceId: "GOEBEL:116",
      officeSpaceIds: ["GOEBEL:116", "MGBJ:210"],
    };
    const staff = {
      ...tinaStaff,
      officeSpaceId: "GOEBEL:116",
      officeSpaceIds: ["GOEBEL:116", "MGBJ:210"],
    };

    const result = buildOfficeBuildingData({
      facultyData: [faculty],
      staffData: [staff],
      spacesByKey,
    });

    expect(result["Goebel Building"].people).toHaveLength(1);
    expect(result["Mary Gibbs Jones Building"].people).toHaveLength(1);
    expect(result["Goebel Building"].people[0].roleType).toBe("both");
    expect(result["Mary Gibbs Jones Building"].people[0]).toMatchObject({
      roleType: "both",
      roomNumber: "210",
      office: "Mary Gibbs Jones Building 210",
    });
  });
});
