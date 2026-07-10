/* @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rawPeople: [],
  rawPrograms: [],
}));

const mocks = vi.hoisted(() => ({
  doc: vi.fn((...segments) => segments.join("/")),
  updateDoc: vi.fn(),
  loadPrograms: vi.fn(),
  loadPeople: vi.fn(),
  logUpdate: vi.fn(),
  showNotification: vi.fn(),
  canEdit: vi.fn(() => true),
}));

vi.mock("../firebase", () => ({
  db: "db",
  COLLECTIONS: {
    PEOPLE: "people",
    PROGRAMS: "programs",
  },
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: mocks.doc,
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: mocks.updateDoc,
  where: vi.fn(),
}));

vi.mock("../utils/changeLogger", () => ({
  logCreate: vi.fn(),
  logDelete: vi.fn(),
  logUpdate: mocks.logUpdate,
}));

vi.mock("../utils/dataHygiene", () => ({
  deletePersonSafely: vi.fn(),
}));

vi.mock("../contexts/DataContext", () => ({
  useData: () => ({
    rawPeople: state.rawPeople,
    rawPrograms: state.rawPrograms,
    loadPrograms: mocks.loadPrograms,
    spacesByKey: new Map(),
    canEdit: mocks.canEdit,
    canEditFaculty: true,
    canCreateFaculty: true,
    canDeleteFaculty: true,
    canEditStaff: true,
    canCreateStaff: true,
    canEditStudent: true,
    canCreateStudent: true,
    canDeleteStudent: true,
    canCreateProgram: true,
  }),
}));

vi.mock("../contexts/PeopleContext", () => ({
  usePeople: () => ({ loadPeople: mocks.loadPeople }),
}));

vi.mock("../contexts/UIContext", () => ({
  useUI: () => ({ showNotification: mocks.showNotification }),
}));

import usePeopleOperations from "./usePeopleOperations";

describe("usePeopleOperations director assignment cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rawPeople = [];
    state.rawPrograms = [
      {
        id: "program-1",
        name: "Program One",
        directors: [{ personId: "missing-person", role: "upd" }],
      },
    ];
    mocks.canEdit.mockReturnValue(true);
    mocks.updateDoc.mockResolvedValue(undefined);
    mocks.logUpdate.mockResolvedValue(undefined);
    mocks.loadPrograms.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("removes a dangling director assignment without a person document", async () => {
    const { result } = renderHook(() => usePeopleOperations());
    let succeeded;

    await act(async () => {
      succeeded = await result.current.handleDirectorAssignmentChange({
        programId: "program-1",
        personId: "missing-person",
        role: "upd",
        assign: false,
      });
    });

    expect(succeeded).toBe(true);
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      "db/programs/program-1",
      expect.objectContaining({ directors: [] }),
    );
    expect(mocks.loadPrograms).toHaveBeenCalledWith({ force: true });
    expect(mocks.showNotification).toHaveBeenLastCalledWith(
      "success",
      "Director Removed",
      expect.stringContaining("missing-person"),
    );
  });

  it("still rejects assigning a director without a person document", async () => {
    state.rawPrograms[0].directors = [];
    const { result } = renderHook(() => usePeopleOperations());
    let succeeded;

    await act(async () => {
      succeeded = await result.current.handleDirectorAssignmentChange({
        programId: "program-1",
        personId: "missing-person",
        role: "upd",
        assign: true,
      });
    });

    expect(succeeded).toBe(false);
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      "error",
      "Person Not Found",
      expect.any(String),
    );
  });
});
