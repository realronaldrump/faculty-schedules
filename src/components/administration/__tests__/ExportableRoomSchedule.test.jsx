// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ExportableRoomSchedule from "../ExportableRoomSchedule";

describe("ExportableRoomSchedule compact class blocks", () => {
  it("keeps short class periods from rendering clipped instructor text", () => {
    render(
      <ExportableRoomSchedule
        spaceLabel="207"
        buildingName="Mary Gibbs Jones"
        semester="Fall 2026"
        classes={[
          {
            days: "M",
            time: "8:00 am - 8:50 am",
            class: "NUTR 2288",
            section: "01",
            professor: "Stanley Wilfong",
          },
          {
            days: "T",
            time: "9:30 am - 10:45 am",
            class: "CFS 3324",
            section: "04",
            professor: "Christine Knefley",
          },
        ]}
      />,
    );

    expect(screen.getByText("NUTR 2288.01")).toBeInTheDocument();
    expect(screen.getByText("8AM-8:50AM")).toBeInTheDocument();
    expect(screen.queryByText("Stanley Wilfong")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("NUTR 2288.01 • 8AM-8:50AM • Stanley Wilfong"),
    ).toBeInTheDocument();

    expect(screen.getByText("Christine Knefley")).toBeInTheDocument();
  });
});
