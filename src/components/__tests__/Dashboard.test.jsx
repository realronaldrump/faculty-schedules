// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";

const navigateMock = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { displayName: "Alex Taylor" },
    userProfile: { roles: [] },
    canAccess: () => true,
    isAdmin: true,
  }),
}));

vi.mock("../../contexts/UIContext", () => ({
  useUI: () => ({
    pinnedPages: [],
    togglePinPage: vi.fn(),
    isPinned: () => false,
  }),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders the launchpad header and search input", () => {
    render(<Dashboard />);

    expect(
      screen.getByRole("heading", { name: /find what you need/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/search destinations/i)).toBeInTheDocument();
  });

  it("filters destinations based on search", () => {
    render(<Dashboard />);

    const input = screen.getByLabelText(/search destinations/i);
    fireEvent.change(input, { target: { value: "Acronyms" } });

    const resultsCard = screen
      .getByText(/search results/i)
      .closest(".university-card");
    expect(resultsCard).toBeInTheDocument();
    expect(within(resultsCard).getByText("Acronyms")).toBeInTheDocument();
  });

  it("navigates to a result on click", () => {
    render(<Dashboard />);

    const input = screen.getByLabelText(/search destinations/i);
    fireEvent.change(input, { target: { value: "Faculty Finder" } });

    const resultsCard = screen
      .getByText(/search results/i)
      .closest(".university-card");
    const resultButton = within(resultsCard).getByRole("button", {
      name: /faculty finder/i,
    });

    fireEvent.click(resultButton);

    expect(navigateMock).toHaveBeenCalledWith("/faculty-finder");
  });
});
