// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StudentEditModal from "../StudentEditModal";
import StudentAddWizard from "../StudentAddWizard";

const student = {
  id: "student-1",
  name: "Example Student",
  email: "example@example.edu",
  startDate: "2026-10-06",
  endDate: "",
  isActive: true,
  jobs: [],
};
const enterJob = (title = "Front Desk Assistant") => {
  fireEvent.change(screen.getByPlaceholderText("e.g., Front Desk Assistant"), {
    target: { value: title },
  });
  fireEvent.change(screen.getByPlaceholderText("12.50"), {
    target: { value: "12.50" },
  });
};
const openNewJob = () => {
  fireEvent.click(screen.getByRole("button", { name: "Jobs & Schedule" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Job" }));
};
const openWizardJobs = () => {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};

afterEach(cleanup);

describe("student job drafts and persistence", () => {
  it("captures a new job in the main save without a separate Save Job click", async () => {
    const onSave = vi.fn().mockResolvedValue({ id: student.id });
    render(<StudentEditModal student={student} onSave={onSave} onClose={vi.fn()} />);
    openNewJob();
    enterJob();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].jobs).toEqual([
      expect.objectContaining({ jobTitle: "Front Desk Assistant", hourlyRate: "12.50" }),
    ]);
  });

  it("preserves a new job across parent redraws and tab switches", () => {
    const props = { student, onSave: vi.fn(), onClose: vi.fn() };
    const view = render(<StudentEditModal {...props} />);
    openNewJob();
    enterJob();
    view.rerender(<StudentEditModal {...props} semesterLabel="Fall 2026" />);
    expect(screen.getByPlaceholderText("e.g., Front Desk Assistant")).toHaveValue("Front Desk Assistant");
    fireEvent.click(screen.getByRole("button", { name: "Basic Info" }));
    fireEvent.click(screen.getByRole("button", { name: "Jobs & Schedule" }));
    expect(screen.getByPlaceholderText("e.g., Front Desk Assistant")).toHaveValue("Front Desk Assistant");
  });

  it("keeps the draft and displays a rejected save so it can be retried", async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error("Your account cannot edit student workers."))
      .mockResolvedValueOnce({ id: student.id });
    render(<StudentEditModal student={student} onSave={onSave} onClose={vi.fn()} />);
    openNewJob();
    enterJob();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account cannot edit student workers.");
    expect(screen.getByPlaceholderText("e.g., Front Desk Assistant")).toHaveValue("Front Desk Assistant");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].jobs).toHaveLength(1);
  });

  it("prevents duplicate submissions while the write is pending", async () => {
    let finish;
    const onSave = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(<StudentEditModal student={student} onSave={onSave} onClose={vi.fn()} />);
    openNewJob();
    enterJob();
    const save = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    await act(async () => finish({ id: student.id }));
  });

  it("blocks a pending job with an invalid date range instead of silently dropping it", () => {
    const onSave = vi.fn();
    render(<StudentEditModal student={student} onSave={onSave} onClose={vi.fn()} />);
    openNewJob();
    enterJob();
    const dates = document.querySelectorAll('[data-tutorial="job-form"] input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-10-10" } });
    fireEvent.change(dates[1], { target: { value: "2026-10-09" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("End date cannot be before start date");
  });

  it("commits the wizard's pending new job when continuing to review", async () => {
    const onSave = vi.fn().mockResolvedValue({ id: "new-student" });
    render(<StudentAddWizard isTutorialMode onSave={onSave} onCancel={vi.fn()} />);
    openWizardJobs();
    fireEvent.click(screen.getByRole("button", { name: "Add Job Assignment" }));
    enterJob();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Save Student" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Student" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].jobs[0]).toMatchObject({ jobTitle: "Front Desk Assistant", hourlyRate: "12.50" });
  });

  it("preserves a wizard draft when tutorial state redraws its parent", () => {
    const props = { isTutorialMode: true, onSave: vi.fn(), onCancel: vi.fn() };
    const view = render(<StudentAddWizard {...props} />);
    openWizardJobs();
    fireEvent.click(screen.getByRole("button", { name: "Add Job Assignment" }));
    enterJob();
    view.rerender(<StudentAddWizard {...props} semesterLabel="Fall 2026" />);
    expect(screen.getByPlaceholderText("e.g., Front Desk Assistant")).toHaveValue("Front Desk Assistant");
  });

  it("captures pending changes to an existing job without changing another job", async () => {
    const jobs = [
      { id: "job-1", jobTitle: "Office Assistant", hourlyRate: "10", weeklySchedule: [] },
      { id: "job-2", jobTitle: "Lab Assistant", hourlyRate: "11", weeklySchedule: [] },
    ];
    const onSave = vi.fn().mockResolvedValue({ id: student.id });
    render(<StudentEditModal student={{ ...student, jobs }} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Jobs & Schedule" }));
    fireEvent.click(screen.getAllByTitle("Edit")[0]);
    enterJob("Updated Office Assignment");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].jobs.map((job) => job.jobTitle)).toEqual(["Updated Office Assignment", "Lab Assistant"]);
  });

  it("discards a canceled new draft without saving it or changing the original jobs", async () => {
    const onSave = vi.fn().mockResolvedValue({ id: student.id });
    render(<StudentEditModal student={student} onSave={onSave} onClose={vi.fn()} />);
    openNewJob();
    enterJob();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].jobs).toEqual([]);
  });
});
