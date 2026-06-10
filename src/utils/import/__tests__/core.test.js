import { describe, expect, it } from "vitest";
import {
  buildImportEntityCleanupPreviewOptions,
  buildLinkedPersonResolutionUpdates,
  buildScheduleImportUpdates,
  extractDirectoryPersonFields,
  shouldSkipCommitSecondPassChange,
} from "../core";
import { ImportTransaction } from "../transaction-model";
import { findPersonMatch } from "../../personMatchUtils";

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

describe("extractDirectoryPersonFields", () => {
  it("preserves identifiers from preprocessed directory baseData", () => {
    const fields = extractDirectoryPersonFields({
      raw: {
        Office: "Goebel 101",
      },
      baseData: {
        firstName: "Jane",
        lastName: "Doe",
        baylorId: "123456789",
        externalIds: {
          clssInstructorId: "CLSS.1",
        },
      },
    });

    expect(fields.hasAnyIdentity).toBe(true);
    expect(fields.firstName).toBe("Jane");
    expect(fields.lastName).toBe("Doe");
    expect(fields.baylorId).toBe("123456789");
    expect(fields.clssInstructorId).toBe("CLSS.1");
  });

  it("treats raw Baylor-only directory rows as identifiable", () => {
    const fields = extractDirectoryPersonFields({
      "Baylor ID": "123-456-789",
    });

    expect(fields.hasAnyIdentity).toBe(true);
    expect(fields.baylorId).toBe("123456789");
  });

  it("treats Person Number as Ignite identity instead of Baylor ID", () => {
    const fields = extractDirectoryPersonFields({
      "Person Number": "IG-98765",
    });

    expect(fields.hasAnyIdentity).toBe(true);
    expect(fields.baylorId).toBe("");
    expect(fields.ignitePersonNumber).toBe("98765");
  });

  it("treats legacy Ignite aliases as directory identity", () => {
    const fields = extractDirectoryPersonFields({
      igniteId: "IG-98765",
    });

    expect(fields.hasAnyIdentity).toBe(true);
    expect(fields.ignitePersonNumber).toBe("98765");
  });

  it("prefers canonical baseData for merged directory rows", () => {
    const fields = extractDirectoryPersonFields({
      __merged: true,
      raw: {
        "First Name": "Jane",
        "Last Name": "Doe",
        "E-mail Address": "old.email@baylor.edu",
        Phone: "254-111-0000",
      },
      baseData: {
        firstName: "Jane",
        lastName: "Doe",
        email: "new.email@baylor.edu",
        phone: "2542220000",
        baylorId: "123456789",
      },
    });

    expect(fields.email).toBe("new.email@baylor.edu");
    expect(fields.phone).toBe("2542220000");
    expect(fields.baylorId).toBe("123456789");
  });
});

describe("buildLinkedPersonResolutionUpdates", () => {
  it("persists imported identifiers when linking a proposed person to an existing record", () => {
    const updates = buildLinkedPersonResolutionUpdates(
      {
        id: "person_1",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@baylor.edu",
        externalIds: {},
      },
      {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@baylor.edu",
        baylorId: "123-456-789",
        externalIds: {
          clssInstructorId: "CLSS.1",
        },
      },
    );

    expect(updates.baylorId).toBe("123456789");
    expect(updates.externalIds).toEqual(expect.objectContaining({
      baylorId: "123456789",
      clssInstructorId: "CLSS.1",
    }));
    expect(updates.identityKey).toBeTruthy();
    expect(updates.identityKeys).toEqual(
      expect.arrayContaining([
        "baylor:123456789",
        expect.stringContaining("clss-instructor:"),
      ]),
    );
  });

  it("persists imported Ignite identifiers when linking to an existing record", () => {
    const updates = buildLinkedPersonResolutionUpdates(
      {
        id: "person_1",
        firstName: "Jane",
        lastName: "Doe",
        externalIds: {},
      },
      {
        firstName: "Jane",
        lastName: "Doe",
        ignitePersonNumber: "IG-98765",
        externalIds: {
          personNumber: "98765",
        },
      },
    );

    expect(updates.ignitePersonNumber).toBe("98765");
    expect(updates.externalIds).toEqual(expect.objectContaining({
      ignitePersonNumber: "98765",
      personNumber: "98765",
    }));
    expect(updates.identityKeys).toEqual(
      expect.arrayContaining(["ignite:98765"]),
    );
  });

  it("backfills canonical Ignite external ID fields when legacy aliases already exist", () => {
    const updates = buildLinkedPersonResolutionUpdates(
      {
        id: "person_1",
        firstName: "Jane",
        lastName: "Doe",
        externalIds: {
          igniteId: "98765",
        },
      },
      {
        ignitePersonNumber: "98765",
      },
    );

    expect(updates.ignitePersonNumber).toBe("98765");
    expect(updates.externalIds).toEqual(expect.objectContaining({
      igniteId: "98765",
      ignitePersonNumber: "98765",
      personNumber: "98765",
    }));
  });

  it("uses Ignite identifiers as sufficient metadata for schedule link resolutions", () => {
    const updates = buildLinkedPersonResolutionUpdates(
      {
        id: "person_1",
        firstName: "Jamie",
        lastName: "Doe",
        email: "",
        externalIds: {},
      },
      {
        firstName: "Jamie",
        lastName: "Doe",
        ignitePersonNumber: "98765",
        externalIds: {
          ignitePersonNumber: "98765",
        },
      },
      "schedule",
    );

    expect(updates).toEqual(expect.objectContaining({
      ignitePersonNumber: "98765",
      updatedAt: expect.any(String),
    }));
    expect(updates.externalIds).toEqual(expect.objectContaining({
      ignitePersonNumber: "98765",
      personNumber: "98765",
    }));
    expect(updates.identityKeys).toEqual(
      expect.arrayContaining(["ignite:98765"]),
    );
    expect(updates.email).toBeUndefined();
  });

  it("keeps schedule link resolutions limited to identifiers", () => {
    const updates = buildLinkedPersonResolutionUpdates(
      {
        id: "person_1",
        firstName: "Jamie",
        lastName: "Doe",
        email: "existing@baylor.edu",
        phone: "2541110000",
        roles: ["student"],
        externalIds: {},
      },
      {
        firstName: "Jamie",
        lastName: "Doe",
        email: "incoming@baylor.edu",
        phone: "2542220000",
        roles: ["faculty"],
        baylorId: "123456789",
        externalIds: {
          clssInstructorId: "CLSS.1",
        },
      },
      "schedule",
    );

    expect(updates.baylorId).toBe("123456789");
    expect(updates.externalIds).toEqual(expect.objectContaining({
      baylorId: "123456789",
      clssInstructorId: "CLSS.1",
    }));
    expect(updates.identityKey).toBeTruthy();
    expect(updates.updatedAt).toBeTruthy();
    expect(updates.email).toBeUndefined();
    expect(updates.phone).toBeUndefined();
    expect(updates.roles).toBeUndefined();
  });

  it("backfills identity metadata when linked identifiers already exist", () => {
    const updates = buildLinkedPersonResolutionUpdates(
      {
        id: "person_1",
        firstName: "Jane",
        lastName: "Doe",
        baylorId: "123456789",
        externalIds: {
          baylorId: "123456789",
          clssInstructorId: "CLSS.1",
        },
      },
      {
        baylorId: "123456789",
        externalIds: {
          clssInstructorId: "CLSS.1",
        },
      },
      "schedule",
    );

    expect(updates.baylorId).toBeUndefined();
    expect(updates.externalIds).toBeUndefined();
    expect(updates.identityKey).toBe("baylor:123456789");
    expect(updates.identityKeys).toEqual(
      expect.arrayContaining([
        "baylor:123456789",
        expect.stringContaining("clss-instructor:"),
      ]),
    );
    expect(updates.updatedAt).toBeTruthy();
  });

  it("allows directory link resolutions to merge directory fields", () => {
    const updates = buildLinkedPersonResolutionUpdates(
      {
        id: "person_1",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@baylor.edu",
        phone: "",
        externalIds: {},
      },
      {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane.doe@baylor.edu",
        phone: "2542220000",
      },
      "directory",
    );

    expect(updates.phone).toBe("2542220000");
  });
});

describe("shouldSkipCommitSecondPassChange", () => {
  it("skips changes that were fully handled during the first commit pass", () => {
    const handled = new Set(["change_1"]);

    expect(
      shouldSkipCommitSecondPassChange({ id: "change_1", action: "modify" }, handled),
    ).toBe(true);
    expect(
      shouldSkipCommitSecondPassChange({ id: "change_2", action: "modify" }, handled),
    ).toBe(false);
  });
});

describe("buildImportEntityCleanupPreviewOptions", () => {
  it("keeps import entity cleanup in preview mode for rollback safety", () => {
    expect(
      buildImportEntityCleanupPreviewOptions({
        transactionId: "import_1",
        peopleIds: [" person_1 ", "person_1", ""],
        roomIds: ["ROOM:101"],
      }),
    ).toEqual({
      transactionId: "import_1",
      peopleIds: ["person_1"],
      roomIds: ["ROOM:101"],
      mergePeopleDuplicates: true,
      mergeRoomDuplicates: true,
      dryRun: true,
    });
  });
});

describe("ImportTransaction tracked import side effects", () => {
  it("includes course and term changes in rollback-visible transaction changes", () => {
    const transaction = new ImportTransaction("schedule", "Fall import", "Fall 2026");

    transaction.addChange("courses", "add", { code: "CSI 1301" });
    transaction.addChange(
      "terms",
      "modify",
      { status: "active" },
      { id: "202630", status: "draft" },
    );

    const changes = transaction.getAllChanges();

    expect(changes.map((change) => change.collection)).toEqual(
      expect.arrayContaining(["courses", "terms"]),
    );
    expect(transaction.stats.coursesAdded).toBe(1);
    expect(transaction.stats.termsModified).toBe(1);
    expect(transaction.stats.totalChanges).toBe(2);
  });
});

describe("findPersonMatch", () => {
  it("matches existing people by Ignite person number without using Baylor ID", () => {
    const result = findPersonMatch(
      {
        firstName: "",
        lastName: "",
        ignitePersonNumber: "IG-98765",
      },
      [
        {
          id: "person_a",
          firstName: "Jane",
          lastName: "Doe",
          baylorId: "123456789",
        },
        {
          id: "person_b",
          firstName: "Jamie",
          lastName: "Smith",
          externalIds: {
            ignitePersonNumber: "98765",
          },
        },
      ],
    );

    expect(result.status).toBe("exact");
    expect(result.matchType).toBe("ignitePersonNumber");
    expect(result.person.id).toBe("person_b");
  });

  it("matches existing people by legacy Ignite aliases", () => {
    const result = findPersonMatch(
      {
        firstName: "",
        lastName: "",
        ignitePersonId: "IG-98765",
      },
      [
        {
          id: "person_a",
          firstName: "Jamie",
          lastName: "Smith",
          externalIds: {
            igniteId: "98765",
          },
        },
      ],
    );

    expect(result.status).toBe("exact");
    expect(result.matchType).toBe("ignitePersonNumber");
    expect(result.person.id).toBe("person_a");
  });
});
