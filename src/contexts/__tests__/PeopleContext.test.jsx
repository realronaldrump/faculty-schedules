import { describe, expect, it } from "vitest";
import { mapPeopleSnapshotDocs } from "../PeopleContext";

describe("mapPeopleSnapshotDocs", () => {
  it("keeps the Firestore document id when legacy data contains an id field", () => {
    const docs = [
      {
        id: "firestore_doc_id",
        data: () => ({
          id: "legacy_stored_id",
          name: "Jane Student",
          roles: ["student"],
          baylorId: "123456789",
        }),
      },
    ];

    expect(mapPeopleSnapshotDocs(docs)).toEqual([
      {
        id: "firestore_doc_id",
        name: "Jane Student",
        roles: ["student"],
        baylorId: "123456789",
      },
    ]);
  });
});
