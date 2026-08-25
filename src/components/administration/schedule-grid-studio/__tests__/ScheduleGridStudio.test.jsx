// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlankStudioDocument } from "../../../../utils/scheduleGridStudio";
import ScheduleGridStudio from "../ScheduleGridStudio";

afterEach(cleanup);

describe("ScheduleGridStudio", () => {
  it("uses branded dropdowns for Studio layout and entry controls", () => {
    render(
      <ScheduleGridStudio
        initialDocument={createBlankStudioDocument({
          entries: [{ course: "CFS 1305", days: ["M"] }],
        })}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Layout" }));

    expect(document.body.querySelectorAll("select")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Page size" }),
    ).toHaveAttribute("aria-haspopup", "listbox");
    expect(
      screen.getByRole("button", { name: "Time guides" }),
    ).toHaveAttribute("aria-haspopup", "listbox");
    expect(
      screen.getByRole("button", { name: "Instructor names" }),
    ).toHaveAttribute("aria-haspopup", "listbox");
    expect(
      screen.getByRole("button", { name: "Block detail" }),
    ).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("creates and saves a manual in-app schedule", async () => {
    const onSaveTemplate = vi.fn().mockResolvedValue({ id: "saved-grid-1" });
    render(
      <ScheduleGridStudio
        initialDocument={createBlankStudioDocument()}
        canSave
        onSaveTemplate={onSaveTemplate}
        onBack={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Template name"), {
      target: { value: "MGJ 207 custom door sign" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Blank class" }));
    fireEvent.change(screen.getByLabelText("Instructor"), {
      target: { value: "Scott Morris" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(onSaveTemplate).toHaveBeenCalledTimes(1));
    expect(onSaveTemplate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: "MGJ 207 custom door sign",
        entries: [expect.objectContaining({ instructor: "Scott Morris" })],
      }),
    );
  });

  it("adds an existing schedule class without manual re-entry", () => {
    render(
      <ScheduleGridStudio
        initialDocument={createBlankStudioDocument({
          building: "Mary Gibbs Jones",
          room: "207",
        })}
        availableClasses={[
          {
            building: "Mary Gibbs Jones",
            room: "207",
            class: "NUTR 2288",
            section: "01",
            professor: "Stanley Wilfong",
            days: "MWF",
            time: "8:00 am - 8:50 am",
          },
        ]}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "From schedule" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Select NUTR 2288\.01 in Mary Gibbs Jones 207/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));

    expect(screen.getAllByText("NUTR 2288.01").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Stanley Wilfong").length).toBeGreaterThan(0);
  });
});
