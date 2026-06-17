// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";

const navigateMock = vi.fn();
let mockPinnedPages = [];

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
    pinnedPages: mockPinnedPages,
    togglePinPage: vi.fn(),
    isPinned: (pageId) => mockPinnedPages.includes(pageId),
  }),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mockPinnedPages = [];
  });

  it("renders the launchpad header and search input", () => {
    render(<Dashboard />);

    expect(
      screen.getByRole("heading", { name: /what are you looking for\?/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/search destinations/i)).toBeInTheDocument();
  });

  it("filters destinations based on search", () => {
    render(<Dashboard />);

    const input = screen.getByLabelText(/search destinations/i);
    fireEvent.change(input, { target: { value: "Acronyms" } });

    const resultsLabel = screen.getByText(/search results/i);
    const resultsPanel = resultsLabel?.parentElement?.parentElement;
    expect(resultsPanel).toBeTruthy();
    expect(
      within(resultsPanel).getByRole("button", { name: /acronyms/i }),
    ).toBeInTheDocument();
  });

  it("navigates to a result on click", () => {
    render(<Dashboard />);

    const input = screen.getByLabelText(/search destinations/i);
    fireEvent.change(input, { target: { value: "Today" } });

    const resultsLabel = screen.getByText(/search results/i);
    const resultsPanel = resultsLabel?.parentElement?.parentElement;
    expect(resultsPanel).toBeTruthy();
    const resultButton = within(resultsPanel).getByRole("button", {
      name: /today/i,
    });

    fireEvent.click(resultButton);

    expect(navigateMock).toHaveBeenCalledWith("/live-view");
  });

  it("places the getting started pin target on an unpinned page", () => {
    mockPinnedPages = ["dashboard"];

    render(<Dashboard />);

    const tutorialPinButton = document.querySelector('[data-tutorial="pin-button"]');
    expect(tutorialPinButton).toBeInTheDocument();
    expect(tutorialPinButton).toHaveAttribute("title", "Pin for quick access");
  });
});
