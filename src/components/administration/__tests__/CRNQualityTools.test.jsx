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
import { updateDoc } from "firebase/firestore";
import { analyzeCRNCoverage } from "../../../utils/crnMigrationUtils";
import CRNQualityTools from "../CRNQualityTools";

const { showNotificationMock, schedules } = vi.hoisted(() => ({
  showNotificationMock: vi.fn(),
  schedules: [
    { id: "sch-1", courseCode: "ADM 1300", section: "01", term: "Fall 2026", crn: "12345" },
    { id: "sch-2", courseCode: "ADM 1301", section: "01", term: "Fall 2026", crn: "12345" },
  ],
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  updateDoc: vi.fn(async () => {}),
}));
vi.mock("../../../firebase", () => ({ db: {} }));
vi.mock("../../../utils/changeLogger", () => ({ logUpdate: vi.fn() }));
vi.mock("../../../contexts/UIContext", () => ({
  useUI: () => ({ showNotification: showNotificationMock }),
}));
vi.mock("../../../contexts/ScheduleContext", () => ({
  useSchedules: () => ({
    selectedSemester: "Fall 2026",
    termOptions: [],
    getTermByLabel: () => ({ termCode: "202630" }),
  }),
}));
vi.mock("../../../utils/dataImportUtils", () => ({
  fetchSchedulesByTerms: vi.fn(async () => ({ schedules })),
}));
vi.mock("../../../utils/crnMigrationUtils", () => ({
  analyzeCRNCoverage: vi.fn(async () => ({
    coveragePercentage: 100,
    withCRN: 2,
    missingCRN: 0,
    emptyCRN: 0,
    total: 2,
    duplicateCRNs: [
      {
        crn: "12345",
        term: "Fall 2026",
        count: 2,
        records: schedules.map(({ id, courseCode, section, term }) => ({
          id,
          courseCode,
          section,
          term,
        })),
      },
    ],
  })),
}));

afterEach(cleanup);

describe("CRNQualityTools duplicate CRNs", () => {
  it("edits and saves a duplicate row's CRN", async () => {
    render(<CRNQualityTools />);
    fireEvent.click(screen.getByRole("button", { name: /Analyze CRN Coverage/ }));
    await screen.findByText("2 of 2");

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByDisplayValue("12345"), {
      target: { value: "54321" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateDoc).toHaveBeenCalledWith(
        { collection: "schedules", id: "sch-1" },
        { crn: "54321", updatedAt: expect.any(String) },
      ),
    );
    expect(showNotificationMock).toHaveBeenCalledWith(
      "success",
      "CRN Updated",
      "Saved CRN 54321 for ADM 1300 01.",
    );
    await waitFor(() => expect(analyzeCRNCoverage).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: /Analyze CRN Coverage/ });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
  });
});
