// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  documents: new Map(), rows: [], version: 0, listeners: new Set(),
  sequence: 0, failWrite: null, writeGate: null, deleted: [],
  notification: vi.fn(), writes: vi.fn(),
}));
vi.mock("../../firebase", () => ({ db: "local-test-only", COLLECTIONS: { PEOPLE: "people", PROGRAMS: "programs" } }));
vi.mock("firebase/firestore", () => {
  const deleted = Symbol("deleteField");
  const write = async (ref, updates) => {
    store.writes(ref.id);
    if (store.writeGate) await store.writeGate;
    if (store.failWrite) { const error = store.failWrite; store.failWrite = null; throw error; }
    const data = structuredClone(store.documents.get(ref.id) || {});
    for (const [path, value] of updates) {
      let target = data;
      for (const key of path.slice(0, -1)) target = target[key] ||= {};
      if (value === deleted) delete target[path.at(-1)];
      else target[path.at(-1)] = structuredClone(value);
    }
    store.documents.set(ref.id, data);
  };
  return {
    collection: () => ({ collection: "people" }),
    doc: (...args) => ({ id: args.length === 1 ? `created-${++store.sequence}` : args.at(-1) }),
    FieldPath: class { constructor(...segments) { this.segments = segments; } },
    deleteField: () => deleted,
    setDoc: (ref, data) => write(ref, Object.entries(data).map(([key, value]) => [[key], value])),
    updateDoc: (ref, fields, value, ...more) => {
      if (!fields.segments) return write(ref, Object.entries(fields).map(([key, entry]) => [[key], entry]));
      const entries = [[fields.segments, value]];
      for (let i = 0; i < more.length; i += 2) entries.push([more[i].segments, more[i + 1]]);
      return write(ref, entries);
    },
    getDoc: async (ref) => ({ id: ref.id, exists: () => store.documents.has(ref.id), data: () => structuredClone(store.documents.get(ref.id)) }),
    addDoc: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(),
  };
});
vi.mock("../../contexts/DataContext", async () => {
  const { useSyncExternalStore } = await import("react");
  const { applySemesterSchedule } = await import("../../utils/studentWorkers");
  const { buildPeopleIndex } = await import("../../utils/peopleUtils");
  const subscribe = (listener) => { store.listeners.add(listener); return () => store.listeners.delete(listener); };
  return { useData: () => {
    useSyncExternalStore(subscribe, () => store.version);
    return {
      rawPeople: store.rows, rawPrograms: [], directorIndex: new Map(), peopleIndex: buildPeopleIndex(store.rows),
      studentData: store.rows.map((student) => applySemesterSchedule(student, "Fall 2026")),
      selectedSemester: "Fall 2026", selectedSemesterMeta: { startDate: "2026-08-01", endDate: "2026-12-31" },
    };
  } };
});
vi.mock("../../contexts/PeopleContext", () => ({ usePeople: () => ({ loadPeople: async () => {
  store.rows = [...store.documents].map(([id, data]) => ({ ...structuredClone(data), id }));
  store.version += 1;
  store.listeners.forEach((listener) => listener());
} }) }));
vi.mock("../../contexts/UIContext", () => ({ useUI: () => ({ showNotification: store.notification }) }));
vi.mock("../../contexts/AppConfigContext", () => ({ useAppConfig: () => ({ buildingConfigVersion: 0 }) }));
vi.mock("../../contexts/AuthContext.jsx", () => ({ useAuth: () => ({ user: null, userProfile: null }) }));
vi.mock("../../utils/activityTracking", () => ({ buildActivityActor: () => null, logUserActivityEvent: vi.fn() }));
vi.mock("../../utils/tutorialProgress", () => ({ markTutorialCompleted: vi.fn(), markTutorialStarted: vi.fn(), resetTutorialProgress: vi.fn(), subscribeTutorialProgress: vi.fn(), updateTutorialStep: vi.fn() }));
vi.mock("../../utils/changeLogger", () => ({ logCreate: vi.fn(), logUpdate: vi.fn(), logDelete: vi.fn() }));
vi.mock("../../utils/dataHygiene", () => ({ deletePersonSafely: async (id) => { store.deleted.push(id); store.documents.delete(id); } }));
vi.mock("../../hooks", async () => ({ usePeopleOperations: (await vi.importActual("../../hooks/usePeopleOperations")).default }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/people/directory" }) }));
vi.mock("../people/PersonDirectory", () => ({ default: (props) => <>
  {props.trailingActions}
  {props.data.map((student) => <div key={student.id}>{student.name}{props.tableProps.renderActions(student)}</div>)}
  {props.bodyBottom}
</> }));

import StudentDirectory from "../StudentDirectory";
import TutorialOverlay from "../help/TutorialOverlay";
import { TutorialProvider, useTutorial } from "../../contexts/TutorialContext";

let tutorial;
function Harness() {
  tutorial = useTutorial();
  return <><button data-tutorial="student-workers-card">Student Workers</button><StudentDirectory /><TutorialOverlay /></>;
}
const existingJob = { id: "job-1", jobTitle: "Office Assistant", hourlyRate: "10", location: [], buildings: [], weeklySchedule: [{ day: "M", start: "09:00", end: "10:00" }], startDate: "2026-08-01", endDate: "" };
const seedStudent = (id, name = "Example Student") => ({
  id, name, email: `${id}@example.edu`, roles: ["student"], isActive: true,
  hasNoPhone: true, startDate: "2026-08-01", endDate: "", jobs: [existingJob],
  semesterSchedules: { "202640": { semester: "Fall 2026", jobs: [existingJob] }, "202610": { semester: "Spring 2026", jobs: [{ ...existingJob, jobTitle: "Spring Assignment" }] } },
});
const enterJob = () => {
  fireEvent.change(screen.getByPlaceholderText("e.g., Front Desk Assistant"), { target: { value: "Front Desk Assistant" } });
  fireEvent.change(screen.getByPlaceholderText("12.50"), { target: { value: "12.50" } });
};
const mount = () => render(<TutorialProvider><Harness /></TutorialProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  store.documents = new Map([["student-1", seedStudent("student-1")]]);
  store.rows = [seedStudent("student-1")];
  store.version = 0; store.sequence = 0; store.failWrite = null; store.writeGate = null; store.deleted = [];
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("student directory save and tutorial flow", () => {
  it("persists a pending job through the real save hook and reopens it without replacing another semester", async () => {
    mount();
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Jobs & Schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Job" }));
    enterJob();
    // Another user's Spring edit is newer than the open editor's snapshot.
    store.documents.get("student-1").semesterSchedules["202610"].jobs[0].jobTitle = "Revised Spring Assignment";
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(store.documents.get("student-1").semesterSchedules["202640"].jobs).toHaveLength(2);
    expect(store.documents.get("student-1").semesterSchedules["202610"].jobs[0].jobTitle).toBe("Revised Spring Assignment");
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Jobs & Schedule" }));
    expect(within(screen.getByRole("dialog")).getByText("Front Desk Assistant")).toBeInTheDocument();
    expect(store.notification.mock.calls.filter(([type]) => type === "success")).toHaveLength(1);
  });

  it("keeps the editor and new job after a rejected write and permits a successful retry", async () => {
    mount();
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Jobs & Schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Job" }));
    enterJob();
    store.failWrite = Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your changes are still here");
    expect(store.documents.get("student-1").jobs).toHaveLength(1);
    expect(store.notification.mock.calls.some(([type]) => type === "success")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(store.documents.get("student-1").jobs).toHaveLength(2);
    expect(store.documents.size).toBe(1);
  });

  it("walks all 17 tutorial steps, waits for persistence, and cleans up only its own created record", async () => {
    store.documents.set("other-tutorial", seedStudent("other-tutorial", "[TUTORIAL] Another Session"));
    store.rows.push(seedStudent("other-tutorial", "[TUTORIAL] Another Session"));
    mount();
    act(() => tutorial.startTutorial("add-student-worker"));
    const next = async () => {
      const previous = tutorial.currentStepIndex;
      if (tutorial.currentStep.action) await waitFor(() => expect(tutorial.actionCompleted).toBe(true));
      const card = document.querySelector('[data-tutorial="instruction-card"]');
      fireEvent.click(within(card).getByRole("button", { name: "Next" }));
      await waitFor(() => expect(tutorial.currentStepIndex).toBe(previous + 1));
    };
    await next(); // 1: welcome
    await next(); // 2: already on student tab
    fireEvent.click(screen.getByRole("button", { name: "Add Student" }));
    await next(); // 3: wizard opened
    await next(); // 4: overview
    await next(); // 5: pre-filled basic information is valid
    fireEvent.click(document.querySelector('[data-tutorial="wizard-next-btn"]'));
    await next(); // 6: employment form opened
    await next(); // 7: employment dates
    fireEvent.click(document.querySelector('[data-tutorial="wizard-next-btn"]'));
    await next(); // 8: jobs opened
    await next(); // 9: jobs intro
    fireEvent.click(screen.getByRole("button", { name: "Add Job Assignment" }));
    await next(); // 10: job form opened
    fireEvent.change(screen.getByPlaceholderText("e.g., Front Desk Assistant"), { target: { value: "Tutorial Example Job" } });
    expect(tutorial.actionCompleted).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("12.50"), { target: { value: "12.50" } });
    await next(); // 11: title AND rate entered
    expect(screen.getByPlaceholderText("e.g., Front Desk Assistant")).toHaveValue("Tutorial Example Job");
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    expect(tutorial.actionCompleted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Add time" }));
    await next(); // 12: actual shift added
    fireEvent.click(screen.getByRole("button", { name: "Save Job" }));
    await next(); // 13: valid assignment committed
    fireEvent.click(document.querySelector('[data-tutorial="wizard-next-btn"]'));
    await next(); // 14: review opened
    await next(); // 15: review
    let finishWrite;
    store.writeGate = new Promise((resolve) => { finishWrite = resolve; });
    fireEvent.click(screen.getByRole("button", { name: "Save Student" }));
    expect(tutorial.actionCompleted).toBe(false);
    expect(screen.getByRole("button", { name: "Close tutorial" })).toBeDisabled();
    await act(async () => tutorial.endTutorial(false));
    expect(tutorial.activeTutorial).not.toBeNull();
    await act(async () => finishWrite());
    await next(); // 16: database acknowledged creation
    expect(tutorial.currentStepIndex).toBe(16);
    expect(tutorial.tutorialStudentId).toBe("created-1");
    expect(store.documents.get("created-1").semesterSchedules["202640"].jobs[0]).toMatchObject({ jobTitle: "Tutorial Example Job", hourlyRate: "12.50", weeklySchedule: [{ day: "M", start: "08:00", end: "09:00" }] });
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(tutorial.activeTutorial).toBeNull());
    expect(store.deleted).toEqual(["created-1"]);
    expect(store.documents.has("other-tutorial")).toBe(true);
    expect(store.documents.has("created-1")).toBe(false);
  }, 15000);

  it("keeps creation failures on the review step without completing the tutorial save action", async () => {
    mount();
    act(() => tutorial.startTutorial("add-student-worker", 15));
    fireEvent.click(screen.getByRole("button", { name: "Add Student" }));
    fireEvent.change(screen.getByPlaceholderText("e.g., John Doe"), { target: { value: "Renamed Tutorial Student" } });
    fireEvent.click(document.querySelector('[data-tutorial="wizard-next-btn"]'));
    fireEvent.click(document.querySelector('[data-tutorial="wizard-next-btn"]'));
    fireEvent.click(screen.getByRole("button", { name: "Add Job Assignment" }));
    enterJob();
    fireEvent.click(document.querySelector('[data-tutorial="wizard-next-btn"]'));
    store.failWrite = new Error("The connection was lost. Please try again.");
    fireEvent.click(screen.getByRole("button", { name: "Save Student" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The connection was lost");
    expect(tutorial.currentStepIndex).toBe(15);
    expect(tutorial.actionCompleted).toBe(false);
    expect(store.documents.size).toBe(1);
    expect(screen.getByText("Front Desk Assistant")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Student" }));
    await waitFor(() => expect(tutorial.actionCompleted).toBe(true));
    expect(store.documents.get("created-2").jobs[0].jobTitle).toBe("Front Desk Assistant");
    expect(tutorial.tutorialStudentId).toBe("created-2");
    await act(async () => tutorial.endTutorial(false));
    expect(store.deleted).toEqual(["created-2"]);
  });

  it("keeps a failed cleanup available for retry and prevents overlapping Finish submissions", async () => {
    mount();
    let finishCleanup;
    const cleanupStudent = vi.fn()
      .mockRejectedValueOnce(new Error("Deletion temporarily unavailable"))
      .mockImplementationOnce(() => new Promise((resolve) => { finishCleanup = resolve; }));
    act(() => {
      tutorial.startTutorial("add-student-worker", 16);
      tutorial.setTutorialStudentId("owned-test-student");
      tutorial.registerCleanupCallback(cleanupStudent);
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be removed");
    expect(tutorial.activeTutorial).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    await act(async () => tutorial.endTutorial(true));
    expect(cleanupStudent).toHaveBeenCalledTimes(2);
    await act(async () => finishCleanup());
    expect(tutorial.activeTutorial).toBeNull();
    expect(cleanupStudent).toHaveBeenLastCalledWith("owned-test-student");
  });
});
