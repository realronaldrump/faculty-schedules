// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FacultyExplorer from "../FacultyExplorer";

vi.mock("../../../contexts/DataContext", () => ({
  useData: () => ({
    facultyData: [
      {
        id: "faculty-1",
        name: "Jane Doe",
        isAdjunct: false,
        program: { id: "program-1", name: "Music" },
      },
    ],
    scheduleData: [
      {
        id: "schedule-1",
        Course: "MUS 1001",
        Section: "01",
        Room: "WACO 101",
        instructorNames: ["Jane Doe"],
        meetingPatterns: [
          {
            day: "W",
            startTime: "9:00 AM",
            endTime: "10:00 AM",
          },
        ],
      },
    ],
  }),
}));

vi.mock("../../../contexts/ScheduleContext", () => ({
  useSchedules: () => ({
    selectedSemester: "Summer 2026",
    selectedTermMeta: {
      startDate: "2026-06-01",
      endDate: "2026-07-31",
    },
  }),
}));

describe("FacultyExplorer", () => {
  it("renders faculty rows without crashing when the explorer is opened", () => {
    render(
      <FacultyExplorer
        asOfTime={new Date("2026-06-17T09:30:00")}
        initialStatusFilter="active"
      />,
    );

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });
});
