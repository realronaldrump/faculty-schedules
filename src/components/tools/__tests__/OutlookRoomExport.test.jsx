// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let rawScheduleData = [];
let scheduleContext = {};
const setSelectedSemesterMock = vi.fn();
const notifications = vi.fn();

vi.mock("../../../contexts/DataContext", () => ({
  useData: () => ({ rawScheduleData }),
}));

vi.mock("../../../contexts/ScheduleContext", () => ({
  useSchedules: () => scheduleContext,
}));

vi.mock("../../../contexts/UIContext", () => ({
  useUI: () => ({ showNotification: notifications }),
}));

vi.mock("../../../contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ termConfig: undefined, termConfigVersion: 1 }),
}));

vi.mock("../../../contexts/AuthContext", () => ({
  useAuth: () => ({ canAccess: () => true }),
}));

vi.mock("../../../firebase", () => ({
  db: {},
  COLLECTIONS: { OUTLOOK_EXCEPTIONS: "outlookExceptions" },
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((...args) => ({ args })),
  onSnapshot: vi.fn(() => () => {}),
  runTransaction: vi.fn(async (_db, operation) =>
    operation({
      get: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
      set: vi.fn(),
    }),
  ),
}));

import OutlookRoomExport from "../OutlookRoomExport";

const term = (label, termCode, startDate, endDate) => ({
  term: label,
  termCode,
  startDate,
  endDate,
  status: "active",
});

const renderExport = () =>
  render(
    <MemoryRouter>
      <OutlookRoomExport />
    </MemoryRouter>,
  );

describe("OutlookRoomExport", () => {
  beforeEach(() => {
    rawScheduleData = [
      {
        id: "schedule-1",
        term: "Fall 2026",
        courseCode: "TEST 1000",
        section: "01",
        status: "Active",
        spaceIds: ["GOEBEL:101"],
        spaceDisplayNames: ["Goebel Building 101"],
        meetingPatterns: [{ day: null, startTime: "", endTime: "" }],
      },
    ];
    scheduleContext = {
      selectedSemester: "Fall 2026",
      setSelectedSemester: setSelectedSemesterMock,
      availableSemesters: ["Fall 2026", "Spring 2026"],
      termOptions: [
        term("Fall 2026", "202630", "2026-08-24", "2026-12-09"),
        term("Spring 2026", "202610", "2026-01-20", "2026-05-06"),
      ],
    };
    setSelectedSemesterMock.mockReset();
    notifications.mockReset();
    localStorage.clear();
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:audit"),
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses the app-wide semester control so selecting a term triggers schedule loading", async () => {
    renderExport();

    const semesterControl = await screen.findByLabelText("Semester");
    fireEvent.click(semesterControl);
    fireEvent.click(screen.getByRole("option", { name: "Spring 2026" }));

    expect(setSelectedSemesterMock).toHaveBeenCalledWith("Spring 2026");
  });

  it("programmatically labels every export form control", async () => {
    renderExport();

    expect(await screen.findByLabelText("Semester")).toBeInTheDocument();
    expect(screen.getByLabelText("Semester start date")).toBeInTheDocument();
    expect(screen.getByLabelText("Semester end date")).toBeInTheDocument();
    expect(screen.getByLabelText("Search rooms")).toBeInTheDocument();
    expect(screen.getByLabelText("No-class date")).toBeInTheDocument();
    expect(screen.getByLabelText("Exception label (optional)")).toBeInTheDocument();
  });

  it("warns instead of claiming success when no selected room has a valid event", async () => {
    renderExport();

    expect(await screen.findByText(/1 rooms detected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Download per-room ICS/i }));

    await waitFor(() => {
      expect(notifications).toHaveBeenCalledWith(
        "warning",
        "Nothing to export",
        expect.stringMatching(/valid recurring class meetings/i),
      );
    });
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });
});
