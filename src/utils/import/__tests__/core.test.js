import { describe, expect, it } from "vitest";
import { buildScheduleImportUpdates } from "../core";

describe("buildScheduleImportUpdates", () => {
  it("preserves unresolved instructor match assignments for existing schedule updates", () => {
    const existingSchedule = {
      id: "schedule_1",
      instructorId: "",
      instructorIds: [],
      instructorAssignments: [],
    };
    const incomingSchedule = {
      instructorId: "",
      instructorIds: [],
      instructorAssignments: [
        {
          matchIssueId: "match_1",
          isPrimary: true,
          percentage: 100,
        },
      ],
    };

    const result = buildScheduleImportUpdates(existingSchedule, incomingSchedule);

    expect(result.hasChanges).toBe(true);
    expect(result.updates.instructorAssignments).toEqual(
      incomingSchedule.instructorAssignments,
    );
  });
});
