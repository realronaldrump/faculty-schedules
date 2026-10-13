// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StudentSchedules from "../StudentSchedules";

const studentData = [
  {
    id: "s1",
    name: "Kira Irwin",
    jobs: [
      {
        jobTitle: "Administrative Assistant",
        startDate: "2026-01-05",
        weeklySchedule: [{ day: "M", start: "09:00", end: "12:30" }],
      },
    ],
  },
  {
    id: "s2",
    name: "Allie Dodd",
    jobs: [
      {
        jobTitle: "Nutrition Lab Assistant",
        startDate: "2026-01-05",
        weeklySchedule: [{ day: "W", start: "13:20", end: "14:30" }],
      },
    ],
  },
];

vi.mock("../../../contexts/DataContext", () => ({
  useData: () => ({ studentData, selectedSemesterMeta: null }),
}));

vi.mock("../../../contexts/PeopleContext", () => ({
  usePeople: () => ({ loadPeople: vi.fn() }),
}));

const pressed = (name) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("Student Worker Schedules calendar views", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens in Classic and invites first-time visitors to try Timeline", () => {
    render(<StudentSchedules embedded />);
    expect(
      screen.getByRole("dialog", { name: "Try the new Timeline view" }),
    ).toBeInTheDocument();
    expect(pressed("Classic")).toBe("true");
    expect(screen.getByText("Kira Irwin")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Job colors" })).toBeNull();
  });

  it("switches to Timeline from the invite and remembers it", () => {
    render(<StudentSchedules embedded />);
    fireEvent.click(screen.getByRole("button", { name: "Try Timeline" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pressed("Timeline")).toBe("true");
    expect(
      screen.getByRole("button", {
        name: "Kira Irwin, Administrative Assistant, Monday 9a–12:30p",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Job colors" })).toHaveTextContent(
      "Nutrition Lab Assistant",
    );

    cleanup();
    render(<StudentSchedules embedded />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pressed("Timeline")).toBe("true");
  });

  it("keeps Classic when the invite is declined, and the toggle switches either way", () => {
    render(<StudentSchedules embedded />);
    fireEvent.click(screen.getByRole("button", { name: "Keep Classic" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pressed("Classic")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(pressed("Timeline")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Classic" }));
    expect(pressed("Classic")).toBe("true");

    cleanup();
    render(<StudentSchedules embedded />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pressed("Classic")).toBe("true");
  });
});
