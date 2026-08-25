// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioDocumentFromSchedule } from "../../../../utils/scheduleGridStudio";
import ScheduleGridStudioPreview from "../ScheduleGridStudioPreview";

afterEach(cleanup);

const createDocument = () =>
  createStudioDocumentFromSchedule({
    building: "Mary Gibbs Jones",
    room: "207",
    semester: "Fall 2026",
    classes: [
      {
        id: "class-1",
        class: "NUTR 2288",
        section: "01",
        professor: "Stanley Wilfong",
        days: "M",
        time: "8:00 am - 8:50 am",
      },
    ],
  });

describe("ScheduleGridStudioPreview", () => {
  it("keeps instructor names visible in short classes and supports direct selection", () => {
    const onSelectEntry = vi.fn();
    render(
      <ScheduleGridStudioPreview
        document={createDocument()}
        onSelectEntry={onSelectEntry}
      />,
    );

    expect(screen.getByText("Stanley Wilfong")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Edit NUTR 2288 · 01 · Stanley Wilfong/i,
      }),
    );
    expect(onSelectEntry).toHaveBeenCalledWith("class-1");
  });

  it("honors global and per-class visibility settings", () => {
    const document = createDocument();
    const { rerender } = render(
      <ScheduleGridStudioPreview document={document} />,
    );

    rerender(
      <ScheduleGridStudioPreview
        document={{
          ...document,
          visibility: { ...document.visibility, instructor: false },
        }}
      />,
    );
    expect(screen.queryByText("Stanley Wilfong")).not.toBeInTheDocument();

    rerender(
      <ScheduleGridStudioPreview
        document={{
          ...document,
          entries: document.entries.map((entry) => ({
            ...entry,
            hidden: true,
          })),
        }}
      />,
    );
    expect(screen.queryByText("NUTR 2288.01")).not.toBeInTheDocument();
  });

  it("renders the exact custom physical page size for export", () => {
    const document = createDocument();
    const { container } = render(
      <ScheduleGridStudioPreview
        document={{
          ...document,
          layout: {
            ...document.layout,
            preset: "custom",
            widthIn: 11,
            heightIn: 8.5,
          },
        }}
      />,
    );

    const sheet = container.querySelector(".schedule-grid-studio-sheet");
    expect(sheet).toHaveStyle({ width: "11in", height: "8.5in" });
  });
});
