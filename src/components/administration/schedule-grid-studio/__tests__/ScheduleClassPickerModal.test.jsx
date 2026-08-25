// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioEntry } from "../../../../utils/scheduleGridStudio";
import ScheduleClassPickerModal from "../ScheduleClassPickerModal";

afterEach(cleanup);

const classes = [
  {
    building: "Mary Gibbs Jones",
    room: "207",
    class: "NUTR 2288",
    section: "01",
    professor: "Stanley Wilfong",
    days: "MWF",
    time: "8:00 am - 8:50 am",
  },
  {
    building: "Mary Gibbs Jones",
    room: "207",
    class: "CFS 3324",
    section: "04",
    professor: "Christine Knefley",
    days: "TR",
    time: "9:30 am - 10:45 am",
  },
  {
    building: "Cashion",
    room: "101",
    class: "HSD 1101",
    section: "02",
    professor: "Taylor Example",
    days: "M",
    time: "11:00 am - 11:50 am",
  },
];

describe("ScheduleClassPickerModal", () => {
  it("uses the app dropdown component instead of browser-native selects", () => {
    render(
      <ScheduleClassPickerModal
        isOpen
        onClose={vi.fn()}
        classes={classes}
        availableSemesters={["Fall 2026", "Spring 2027"]}
        preferredSemester="Fall 2026"
      />,
    );

    expect(document.body.querySelectorAll("select")).toHaveLength(0);
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.matches('[aria-haspopup="listbox"]')),
    ).toHaveLength(3);
  });

  it("filters to the current room, blocks duplicates, and adds selected classes", () => {
    const onAdd = vi.fn();
    render(
      <ScheduleClassPickerModal
        isOpen
        onClose={vi.fn()}
        classes={classes}
        existingEntries={[createStudioEntry(classes[0])]}
        currentBuilding="Mary Gibbs Jones"
        currentRoom="207"
        onAdd={onAdd}
      />,
    );

    expect(screen.getByText("NUTR 2288.01")).toBeInTheDocument();
    expect(screen.getByText("CFS 3324.04")).toBeInTheDocument();
    expect(screen.queryByText("HSD 1101.02")).not.toBeInTheDocument();
    expect(screen.getByText("Already in grid")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /Select NUTR 2288\.01 in Mary Gibbs Jones 207/i,
      }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Select CFS 3324\.04 in Mary Gibbs Jones 207/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));

    expect(onAdd).toHaveBeenCalledWith([
      expect.objectContaining({
        course: "CFS 3324",
        section: "04",
        instructor: "Christine Knefley",
      }),
    ]);
  });

  it("loads a dashboard semester from an empty Studio catalog", async () => {
    const onLoadSemester = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleClassPickerModal
        isOpen
        onClose={vi.fn()}
        availableSemesters={["Fall 2026", "Spring 2027"]}
        preferredSemester="Fall 2026"
        onLoadSemester={onLoadSemester}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load semester" }));
    expect(onLoadSemester).toHaveBeenCalledWith("Fall 2026");
  });
});
