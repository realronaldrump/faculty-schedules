// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadPeopleMock = vi.fn();
const showNotificationMock = vi.fn();
const canEditMock = vi.fn();
const updateDocMock = vi.fn();
const docMock = vi.fn();
const logUpdateMock = vi.fn();

const defaultPeople = [
  {
    id: "adj-1",
    firstName: "Jane",
    lastName: "Doe",
    name: "Jane Doe",
    email: "jane@example.edu",
    baylorId: "123456789",
    isAdjunct: true,
    isActive: true,
    roles: ["faculty"],
    programId: "program-1",
  },
];
let peopleMock = defaultPeople;

vi.mock("firebase/firestore", () => ({
  doc: (...args) => docMock(...args),
  updateDoc: (...args) => updateDocMock(...args),
}));

vi.mock("../../../firebase", () => ({
  db: { type: "mock-db" },
  COLLECTIONS: { PEOPLE: "people" },
}));

vi.mock("../../../utils/changeLogger", () => ({
  logUpdate: (...args) => logUpdateMock(...args),
}));

vi.mock("../../../contexts/PeopleContext", () => ({
  usePeople: () => ({
    people: peopleMock,
    loadPeople: loadPeopleMock,
  }),
}));

vi.mock("../../../contexts/DataContext", () => ({
  useData: () => ({
    scheduleData: [
      {
        id: "schedule-1",
        courseCode: "ADM 1300",
        section: "01",
        courseTitle: "Seminar",
        instructorIds: ["adj-1"],
        maxEnrollment: 25,
      },
    ],
    selectedSemester: "Spring 2026",
    availableSemesters: ["Spring 2026"],
    setSelectedSemester: vi.fn(),
  }),
}));

vi.mock("../../../contexts/UIContext", () => ({
  useUI: () => ({
    showNotification: showNotificationMock,
  }),
}));

vi.mock("../../../utils/permissions", () => ({
  usePermissions: () => ({
    canEdit: canEditMock,
  }),
}));

import PAFWorkflow from "../PAFWorkflow";

describe("PAFWorkflow", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    peopleMock = defaultPeople;
    loadPeopleMock.mockReset();
    showNotificationMock.mockReset();
    canEditMock.mockReset();
    canEditMock.mockReturnValue(true);
    updateDocMock.mockReset();
    updateDocMock.mockResolvedValue(undefined);
    docMock.mockReset();
    docMock.mockReturnValue({ path: "people/adj-1" });
    logUpdateMock.mockReset();
    logUpdateMock.mockResolvedValue(undefined);
  });

  it("saves Ignite # with a narrow people update payload", async () => {
    render(<PAFWorkflow />);

    fireEvent.click(screen.getByText("Doe, Jane"));
    fireEvent.click(screen.getByTitle("Edit Ignite #"));
    fireEvent.change(screen.getByPlaceholderText("Numeric ID"), {
      target: { value: "98765" },
    });
    fireEvent.click(screen.getByTitle("Save"));

    await waitFor(() => {
      expect(updateDocMock).toHaveBeenCalledTimes(1);
    });

    expect(docMock).toHaveBeenCalledWith({ type: "mock-db" }, "people", "adj-1");
    expect(updateDocMock).toHaveBeenCalledWith(
      { path: "people/adj-1" },
      {
        ignitePersonNumber: "98765",
        externalIds: {
          ignitePersonNumber: "98765",
          personNumber: "98765",
        },
        updatedAt: expect.any(String),
      },
    );
    expect(updateDocMock.mock.calls[0][1]).not.toHaveProperty("firstName");
    expect(updateDocMock.mock.calls[0][1]).not.toHaveProperty("isAdjunct");
    await waitFor(() => {
      expect(loadPeopleMock).toHaveBeenCalledWith({ force: true });
    });
    expect(showNotificationMock).toHaveBeenCalledWith(
      "success",
      "Updated",
      "Ignite # updated for Jane Doe",
    );
  });

  it("clears legacy Ignite # fallbacks when saving an empty value", async () => {
    peopleMock = [
      {
        ...defaultPeople[0],
        externalIds: {
          clssInstructorId: "CLSS.1",
          ignitePersonNumber: "98765",
          personNumber: "98765",
        },
      },
    ];

    render(<PAFWorkflow />);

    fireEvent.click(screen.getByText("Doe, Jane"));
    fireEvent.click(screen.getByTitle("Edit Ignite #"));
    expect(screen.getByPlaceholderText("Numeric ID")).toHaveValue("98765");
    fireEvent.change(screen.getByPlaceholderText("Numeric ID"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTitle("Save"));

    await waitFor(() => {
      expect(updateDocMock).toHaveBeenCalledTimes(1);
    });

    expect(updateDocMock).toHaveBeenCalledWith(
      { path: "people/adj-1" },
      {
        ignitePersonNumber: "",
        externalIds: {
          clssInstructorId: "CLSS.1",
        },
        updatedAt: expect.any(String),
      },
    );
  });

  it("does not show success when the Ignite # update fails", async () => {
    updateDocMock.mockRejectedValueOnce(new Error("permission denied"));

    render(<PAFWorkflow />);

    fireEvent.click(screen.getByText("Doe, Jane"));
    fireEvent.click(screen.getByTitle("Edit Ignite #"));
    fireEvent.change(screen.getByPlaceholderText("Numeric ID"), {
      target: { value: "98765" },
    });
    fireEvent.click(screen.getByTitle("Save"));

    await waitFor(() => {
      expect(showNotificationMock).toHaveBeenCalledWith(
        "error",
        "Update Failed",
        "Ignite # was not saved. Please try again.",
      );
    });
    expect(showNotificationMock).not.toHaveBeenCalledWith(
      "success",
      "Updated",
      expect.any(String),
    );
  });
});
