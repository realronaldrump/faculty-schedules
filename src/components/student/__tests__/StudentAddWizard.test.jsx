// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentAddWizard from "../StudentAddWizard";

vi.mock("../TimelineVisualization", () => ({
  default: () => <div>Timeline</div>,
}));

const renderWizard = () =>
  render(
    <StudentAddWizard
      onSave={vi.fn()}
      onCancel={vi.fn()}
      isTutorialMode
    />,
  );

describe("StudentAddWizard tutorial targets", () => {
  it("targets the real Next button instead of the whole navigation footer", () => {
    renderWizard();

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(nextButton).toHaveAttribute("data-tutorial", "wizard-next-btn");
  });
});
