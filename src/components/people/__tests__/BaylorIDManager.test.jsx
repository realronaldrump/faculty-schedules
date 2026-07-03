// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BaylorIDManager from "../BaylorIDManager";

const loadPeopleMock = vi.fn();
const handleBaylorIdUpdateMock = vi.fn();
const showNotificationMock = vi.fn();
const canEditMock = vi.fn();

let peopleMock = [];

vi.mock("../../../contexts/PeopleContext", () => ({
  usePeople: () => ({
    people: peopleMock,
    loadPeople: loadPeopleMock,
  }),
}));

vi.mock("../../../contexts/AuthContext", () => ({
  useAuth: () => ({
    isAdmin: true,
  }),
}));

vi.mock("../../../hooks", () => ({
  usePeopleOperations: () => ({
    handleBaylorIdUpdate: handleBaylorIdUpdateMock,
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

vi.mock("../../FacultyContactCard", () => ({
  default: () => null,
}));

describe("BaylorIDManager", () => {
  beforeEach(() => {
    peopleMock = [
      {
        id: "person_with_id",
        name: "Jane Student",
        email: "jane@example.edu",
        baylorId: "123456789",
        roles: ["student"],
        isActive: true,
      },
      {
        id: "person_without_id",
        name: "No Id",
        email: "noid@example.edu",
        baylorId: null,
        roles: ["student"],
        isActive: true,
      },
    ];
    loadPeopleMock.mockResolvedValue(undefined);
    handleBaylorIdUpdateMock.mockResolvedValue({});
    showNotificationMock.mockClear();
    canEditMock.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("removes an assigned Baylor ID through explicit confirmation without sending the ID value", async () => {
    render(<BaylorIDManager embedded />);

    expect(screen.getByText("123456789")).toBeInTheDocument();
    expect(screen.getByText("Not assigned")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Permanently remove Baylor ID"));

    expect(screen.getByRole("dialog")).toHaveTextContent("Jane Student");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("123456789");

    fireEvent.click(screen.getByRole("button", { name: /remove id/i }));

    await waitFor(() => {
      expect(handleBaylorIdUpdateMock).toHaveBeenCalledWith(
        "person_with_id",
        null,
        { remove: true },
      );
    });
  });

  it("saves the current draft Baylor ID instead of the original value", async () => {
    render(<BaylorIDManager embedded />);

    fireEvent.click(screen.getByTitle("Edit Baylor ID"));
    fireEvent.change(screen.getByPlaceholderText("9 digits"), {
      target: { value: "987654321" },
    });
    fireEvent.click(screen.getByTitle("Save"));

    await waitFor(() => {
      expect(handleBaylorIdUpdateMock).toHaveBeenCalledWith(
        "person_with_id",
        "987654321",
      );
    });
  });

  it("removes an existing Baylor ID when the draft is saved blank", async () => {
    render(<BaylorIDManager embedded />);

    fireEvent.click(screen.getByTitle("Edit Baylor ID"));
    fireEvent.change(screen.getByPlaceholderText("9 digits"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTitle("Save"));

    await waitFor(() => {
      expect(handleBaylorIdUpdateMock).toHaveBeenCalledWith(
        "person_with_id",
        null,
        { remove: true },
      );
    });
  });
});
