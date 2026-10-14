// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StudentSchedules from "../StudentSchedules";
import { printSheets } from "../../../utils/printSheets";

const studentData = [
  {
    id: "s1",
    name: "Kira Irwin",
    jobs: [
      {
        jobTitle: "Administrative Assistant",
        startDate: "2026-01-05",
        location: ["Mary Gibbs Jones"],
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
        location: ["Goebel"],
        weeklySchedule: [
          { day: "M", start: "10:00", end: "12:00" },
          { day: "W", start: "13:20", end: "14:30" },
        ],
      },
    ],
  },
];

vi.mock("../../../contexts/DataContext", () => ({
  useData: () => ({
    studentData,
    selectedSemesterMeta: { term: "Fall 2026" },
  }),
}));

vi.mock("../../../contexts/PeopleContext", () => ({
  usePeople: () => ({ loadPeople: vi.fn() }),
}));

vi.mock("../../../utils/printSheets", () => ({
  printSheets: vi.fn(() => Promise.resolve("Student-Worker-Schedule")),
}));

const openDialog = () => {
  render(<StudentSchedules embedded />);
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  return screen.getByRole("dialog", { name: "Print a one-page schedule" });
};

const sheet = () => document.querySelector(".student-schedule-sign");

// Picks one option from a MultiSelectDropdown, then closes it.
const choose = (trigger, option) => {
  fireEvent.click(trigger);
  const menu = document.querySelector(".app-dropdown-menu");
  fireEvent.click(within(menu).getByText(option));
  fireEvent.mouseDown(document.body);
};

describe("one-page schedule sign", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("studentScheduleTimelineInviteSeen", "1");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    printSheets.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens with the term in the subtitle and the By day layout", () => {
    const dialog = openDialog();
    expect(within(dialog).getByLabelText("Title")).toHaveValue(
      "Student Worker Schedule",
    );
    expect(within(dialog).getByLabelText("Subtitle")).toHaveValue("Fall 2026");
    expect(within(dialog).getByLabelText(/By day/)).toBeChecked();

    const page = within(sheet());
    expect(page.getByText("Monday")).toBeInTheDocument();
    expect(page.getByText("9a–12:30p")).toBeInTheDocument();
    expect(page.getAllByText("Allie Dodd")).toHaveLength(2);
    expect(page.getByText(/^Updated /)).toBeInTheDocument();
    expect(sheet().querySelector("style").textContent).toContain(
      "@page { size: 11in 8.5in; margin: 0; }",
    );
  });

  it("switches layout and paper, and remembers them", () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByLabelText(/By student/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Tabloid" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Portrait" }));

    expect(within(sheet()).getByRole("columnheader", { name: "Hrs/wk" })).toBeInTheDocument();
    expect(sheet().querySelector("style").textContent).toContain(
      "@page { size: 11in 17in; margin: 0; }",
    );
    expect(
      JSON.parse(window.localStorage.getItem("studentScheduleSignSettings")),
    ).toMatchObject({ layout: "student", paper: "tabloid", orientation: "portrait" });
  });

  it("prints the sheet with the title and note the user typed", async () => {
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Front Desk" },
    });
    fireEvent.change(within(dialog).getByLabelText("Note at the bottom"), {
      target: { value: "Questions? Call 254-710-3626" },
    });
    expect(within(sheet()).getByText("Front Desk")).toBeInTheDocument();
    expect(within(sheet()).getByText("Questions? Call 254-710-3626")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Print or save as PDF/ }));
    await waitFor(() => expect(printSheets).toHaveBeenCalledTimes(1));
    expect(printSheets).toHaveBeenCalledWith([sheet()], "Front Desk");
  });

  it("starts with the page's filters", () => {
    render(<StudentSchedules embedded />);
    fireEvent.click(screen.getByRole("button", { name: /Filters & Search/ }));
    choose(screen.getByRole("button", { name: "All Buildings" }), "Goebel");
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const dialog = screen.getByRole("dialog", { name: "Print a one-page schedule" });

    expect(within(dialog).getByRole("button", { name: "Goebel" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Goebel Student Workers");
    expect(within(sheet()).getAllByText("Allie Dodd")).toHaveLength(2);
    expect(within(sheet()).queryByText("Kira Irwin")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Use page filters" })).toBeNull();
  });

  it("filters the sign on its own without changing the page", () => {
    const dialog = openDialog();
    choose(within(dialog).getByRole("button", { name: "All jobs" }), "Administrative Assistant");

    expect(within(dialog).getByLabelText("Title")).toHaveValue(
      "Administrative Assistant Schedule",
    );
    expect(within(sheet()).getByText("Kira Irwin")).toBeInTheDocument();
    expect(within(sheet()).queryByText("Allie Dodd")).toBeNull();

    choose(within(dialog).getByRole("button", { name: "All buildings" }), "Goebel");
    expect(within(dialog).getByText("No shifts match these filters.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Print or save as PDF/ })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Show everyone" }));
    expect(within(sheet()).getByText("Kira Irwin")).toBeInTheDocument();
    expect(within(sheet()).getAllByText("Allie Dodd")).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /Filters & Search/ }));
    expect(screen.getByRole("button", { name: "All Buildings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Job Titles" })).toBeInTheDocument();
  });

  it("keeps a typed title when the filters change", () => {
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Front Desk" },
    });
    choose(within(dialog).getByRole("button", { name: "All buildings" }), "Goebel");
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Front Desk");
    expect(within(dialog).getByLabelText("Subtitle")).toHaveValue("Fall 2026");
  });

  it("reports how large names will print", () => {
    const dialog = openDialog();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      /Fits on one page\. Names print at about [\d.]+ pt\./,
    );
  });
});
