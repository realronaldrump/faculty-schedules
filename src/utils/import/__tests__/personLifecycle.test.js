import { describe, expect, it } from "vitest";

import { buildPersonImportUpdates } from "../../importHygieneUtils";
import {
  getScheduleInstructorReferenceIds,
  scheduleReferencesPerson,
} from "../../scheduleReferenceUtils";

describe("person lifecycle protections", () => {
  it("preserves inactive status when imports match inactive people", () => {
    const existing = {
      id: "person_inactive",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@example.edu",
      isActive: false,
      inactiveAt: "2025-01-01T00:00:00.000Z",
      inactiveReason: "No longer teaching",
    };
    const incoming = {
      firstName: "Jane",
      lastName: "Doe",
      email: "JANE.DOE@EXAMPLE.EDU",
      isActive: true,
    };

    const { updates } = buildPersonImportUpdates(existing, incoming, {
      updateTimestamp: false,
    });

    expect(updates).not.toHaveProperty("isActive");
    expect(updates).not.toHaveProperty("inactiveAt");
    expect(updates).not.toHaveProperty("inactiveReason");
  });

  it("detects every schedule instructor reference shape", () => {
    expect(
      getScheduleInstructorReferenceIds({
        instructorId: "p1",
        instructorIds: ["p2", "p3"],
        InstructorId: "p4",
        instructorAssignments: [
          { personId: "p5" },
          { instructorId: "p6" },
          { id: "p7" },
        ],
      }),
    ).toEqual(["p1", "p4", "p2", "p3", "p5", "p6", "p7"]);
    expect(scheduleReferencesPerson({ instructorId: "p1" }, "p1")).toBe(true);
    expect(scheduleReferencesPerson({ instructorIds: ["p1", "p2"] }, "p2")).toBe(true);
    expect(scheduleReferencesPerson({ InstructorId: "p3" }, "p3")).toBe(true);
    expect(
      scheduleReferencesPerson(
        { instructorAssignments: [{ personId: "p4" }] },
        "p4",
      ),
    ).toBe(true);
    expect(
      scheduleReferencesPerson(
        { instructorAssignments: [{ instructorId: "p5" }] },
        "p5",
      ),
    ).toBe(true);
    expect(scheduleReferencesPerson({ instructorAssignments: [{ id: "p6" }] }, "p6")).toBe(true);
    expect(scheduleReferencesPerson({ instructorIds: ["p1"] }, "p2")).toBe(false);
  });
});
