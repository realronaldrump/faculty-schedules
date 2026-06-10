import { describe, expect, it } from "vitest";

import {
  buildPersonLegacyFixUpdates,
  detectLegacyModelIssues,
} from "../../../../utils/dataHygiene";

describe("legacy model cleanup", () => {
  it("does not flag canonical student job aggregates as legacy cleanup", () => {
    const weeklySchedule = [{ day: "T", start: "10:00", end: "12:00" }];
    const person = {
      id: "person-clean-student",
      firstName: "Sam",
      lastName: "Student",
      roles: ["student"],
      jobs: [
        {
          jobTitle: "Desk Assistant",
          supervisorId: "advisor-1",
          location: ["GOEBEL"],
          weeklySchedule,
        },
      ],
      primaryBuildings: ["GOEBEL"],
      primaryBuilding: "GOEBEL",
      weeklySchedule,
    };

    const { updates, touchedFields } = buildPersonLegacyFixUpdates(person);
    const issues = detectLegacyModelIssues([person], []);

    expect(updates).toEqual({});
    expect(touchedFields).toEqual([]);
    expect(issues).toEqual([]);
  });
});
