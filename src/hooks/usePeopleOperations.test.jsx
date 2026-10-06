/* @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rawPeople: [],
  rawPrograms: [],
  studentPermission: true,
}));

const mocks = vi.hoisted(() => ({
  doc: vi.fn((...segments) => segments.join("/")),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
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
  getDoc: mocks.getDoc,
  getDocs: vi.fn(),
  query: vi.fn(),
  setDoc: mocks.setDoc,
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
    canEditStudent: () => state.studentPermission,
    canCreateStudent: () => state.studentPermission,
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

describe("student save outcomes", () => {
  const student = {
    id: "student-1", name: "Example Student", email: "example@example.edu",
    roles: ["student"], jobs: [], semesterSchedules: {},
  };
  beforeEach(() => {
    vi.clearAllMocks();
    state.studentPermission = true;
    state.rawPeople = [student];
    mocks.doc.mockImplementation((...segments) => ({ id: segments.at(-1), path: segments.join("/") }));
    mocks.updateDoc.mockResolvedValue(undefined);
    mocks.setDoc.mockResolvedValue(undefined);
    mocks.loadPeople.mockResolvedValue(undefined);
    mocks.getDoc.mockResolvedValue({ exists: () => false });
  });
  afterEach(() => {
    cleanup();
    mocks.doc.mockImplementation((...segments) => segments.join("/"));
  });

  it("rejects a failed database write instead of allowing an outer success message", async () => {
    const error = Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" });
    mocks.updateDoc.mockRejectedValueOnce(error);
    const { result } = renderHook(() => usePeopleOperations());
    await expect(result.current.handleStudentUpdate(student)).rejects.toBe(error);
    expect(mocks.loadPeople).not.toHaveBeenCalled();
    expect(mocks.showNotification.mock.calls.some(([type]) => type === "success")).toBe(false);
  });

  it("rejects a denied permission before writing", async () => {
    state.studentPermission = false;
    const { result } = renderHook(() => usePeopleOperations());
    await expect(result.current.handleStudentUpdate(student)).rejects.toMatchObject({ code: "permission-denied" });
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it("returns the saved record identity after the write and refresh", async () => {
    const { result } = renderHook(() => usePeopleOperations());
    const saved = await result.current.handleStudentUpdate(student);
    expect(saved).toMatchObject({ id: student.id });
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(mocks.loadPeople).toHaveBeenCalledWith({ force: true, throwOnError: true });
  });

  it("does not create a duplicate when an edited record no longer exists", async () => {
    state.rawPeople = [];
    const { result } = renderHook(() => usePeopleOperations());
    await expect(result.current.handleStudentUpdate(student)).rejects.toMatchObject({ code: "not-found" });
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it("does not report an acknowledged write as failed when refreshing the directory fails", async () => {
    mocks.loadPeople.mockRejectedValueOnce(new Error("Offline during directory refresh"));
    const { result } = renderHook(() => usePeopleOperations());
    const saved = await result.current.handleStudentUpdate(student);
    expect(saved).toMatchObject({ id: student.id, refreshFailed: true });
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(mocks.showNotification).toHaveBeenCalledWith("warning", "Student Saved", expect.stringContaining("refresh"));
  });
});
