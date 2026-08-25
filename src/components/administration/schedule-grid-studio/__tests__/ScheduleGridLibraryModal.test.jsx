// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlankStudioDocument } from "../../../../utils/scheduleGridStudio";
import ScheduleGridLibraryModal from "../ScheduleGridLibraryModal";

afterEach(cleanup);

describe("ScheduleGridLibraryModal", () => {
  it("searches organized templates and opens the selected design", () => {
    const onOpen = vi.fn();
    const templates = [
      {
        id: "mgj-207",
        kind: "studio",
        createdAt: 2,
        studio: createBlankStudioDocument({
          name: "MGJ 207 door sign",
          folder: "Fall 2026",
          room: "207",
        }),
      },
      {
        id: "cashion-101",
        kind: "studio",
        createdAt: 1,
        studio: createBlankStudioDocument({
          name: "Cashion 101",
          folder: "Spring 2027",
          room: "101",
        }),
      },
    ];

    render(
      <ScheduleGridLibraryModal
        isOpen
        templates={templates}
        onClose={vi.fn()}
        onOpen={onOpen}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "207" },
    });
    expect(screen.getByText("MGJ 207 door sign")).toBeInTheDocument();
    expect(screen.queryByText("Cashion 101")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledWith(templates[0]);
  });
});
