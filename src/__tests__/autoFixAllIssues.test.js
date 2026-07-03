import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn((_db, name) => ({ kind: "collection", name })),
  doc: vi.fn((_db, collectionName, id) => ({ kind: "doc", collectionName, id })),
  deleteField: vi.fn(() => ({ __deleteField: true })),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    delete: vi.fn(),
    set: vi.fn(),
    commit: vi.fn(async () => {}),
  })),
  query: vi.fn((...args) => ({ kind: "query", args })),
  where: vi.fn((...args) => ({ kind: "where", args })),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  limit: vi.fn((count) => ({ kind: "limit", count })),
  setDoc: vi.fn(),
}));

const changeLoggerMocks = vi.hoisted(() => ({
  logStandardization: vi.fn(async () => {}),
  logMerge: vi.fn(async () => {}),
  logBulkUpdate: vi.fn(async () => {}),
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => firestoreMocks);

vi.mock("../utils/changeLogger", () => changeLoggerMocks);

const { autoFixAllIssues } = await import("../utils/dataHygiene");

const snapshot = (records = []) => ({
  docs: records.map(({ id, data }) => ({
    id,
    ref: { id },
    data: () => data,
  })),
});

describe("autoFixAllIssues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const collectionReads = new Map();

    firestoreMocks.getDocs.mockImplementation(async (ref) => {
      const name = ref?.name || "";
      const readNumber = (collectionReads.get(name) || 0) + 1;
      collectionReads.set(name, readNumber);

      if (name === "people" && readNumber === 1) {
        return snapshot([
          {
            id: "person-1",
            data: {
              firstName: "Jane",
              lastName: "Doe",
              roles: ["faculty"],
              isUPD: true,
              programId: "program-1",
            },
          },
        ]);
      }

      if (name === "programs" && readNumber === 1) {
        return snapshot([
          {
            id: "program-1",
            data: {
              name: "Interior Design",
              directors: [],
            },
          },
        ]);
      }

      return snapshot([]);
    });
  });

  it("migrates people.isUPD into program directors before standardization strips the flag", async () => {
    const result = await autoFixAllIssues({
      fixLegacyModel: true,
      standardizeData: true,
      mergeHighConfidenceDuplicates: false,
      backfillInstructorIds: false,
      fixLocations: false,
    });

    expect(result.legacyModel.fixed).toBe(2);
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: "programs", id: "program-1" }),
      expect.objectContaining({
        directors: [{ personId: "person-1", role: "upd" }],
      }),
    );
    expect(firestoreMocks.updateDoc.mock.calls[0][0]).toEqual(
      expect.objectContaining({ collectionName: "programs", id: "program-1" }),
    );
  });
});
