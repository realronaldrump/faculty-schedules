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
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));
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
});
