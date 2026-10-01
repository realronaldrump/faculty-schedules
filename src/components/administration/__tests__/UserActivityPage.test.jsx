// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  sync: vi.fn(),
  summaries: vi.fn(),
  today: vi.fn(),
  history: vi.fn(),
  archive: vi.fn(),
  download: vi.fn(),
  owner: true,
}));
vi.mock("../../../contexts/AuthContext.jsx", () => ({
  useAuth: () => ({ isActivityOwner: mocks.owner, user: { uid: "owner" } }),
}));
vi.mock("../../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => name,
  getDocs: (...args) => mocks.getDocs(...args),
  limit: (value) => ({ limit: value }),
  orderBy: (field, direction) => ({ field, direction }),
  query: (...args) => args,
}));
vi.mock("../../../utils/activitySync", () => ({
  syncActivityRollups: (...args) => mocks.sync(...args),
  loadActivitySummaries: (...args) => mocks.summaries(...args),
  loadTodayActivitySummary: (...args) => mocks.today(...args),
}));
vi.mock("../../../utils/activityHistory", () => ({
  ACTIVITY_HISTORY_PAGE_SIZE: 200,
  loadActivityHistoryPage: (...args) => mocks.history(...args),
}));
vi.mock("../../../utils/activityExport", () => ({
  createActivityExportArchive: (...args) => mocks.archive(...args),
}));
vi.mock("../../../utils/csvUtils", async (importOriginal) => ({
  ...await importOriginal(),
  downloadTextFile: (...args) => mocks.download(...args),
}));
import UserActivityPage from "../UserActivityPage";
import {
  formatDateKeyInTimeZone,
  getDateKeyDaysAgo,
} from "../../../utils/activityAnalytics";
const todayDateKey = formatDateKeyInTimeZone(new Date());
const yesterdayDateKey = getDateKeyDaysAgo(1);
const staffPage = {
  pageId: "scheduling/room-grids",
  pageLabel: "Room Grids",
  sectionLabel: "Scheduling",
  pageEnterCount: 4,
  totalMinutesApprox: 12,
  topActions: [{ actionKey: "schedule_pdf_exported", count: 1 }],
};
const staffRow = {
  uid: "staff",
  displayName: "Staff User",
  email: "staff@example.com",
  dateKey: yesterdayDateKey,
  pageEnterCount: 4,
  totalMinutesApprox: 12,
  lastSeenAt: `${yesterdayDateKey}T14:00:00Z`,
  topPagesDetailed: [staffPage],
  topActions: [],
  monitoringVersion: 1,
};
const summaries = {
  todayDateKey,
  analyticsRows: [],
  pageDailyRows: [],
  userDailyRows: [
    staffRow,
    {
      ...staffRow,
      uid: "owner",
      displayName: "Owner",
      pageEnterCount: 90,
      topPagesDetailed: [
        {
          ...staffPage,
          pageId: "admin/user-activity",
          pageLabel: "User Activity",
          pageEnterCount: 90,
        },
      ],
    },
  ],
};
const events = [
  {
    id: "event-1",
    uid: "staff",
    displayName: "Staff User",
    sessionId: "session",
    timestamp: `${yesterdayDateKey}T14:00:00Z`,
    eventType: "page_enter",
    pageId: "dashboard",
  },
  {
    id: "event-2",
    uid: "staff",
    displayName: "Staff User",
    sessionId: "session",
    timestamp: `${yesterdayDateKey}T14:02:00Z`,
    eventType: "action",
    actionKey: "schedule_pdf_exported",
    pageId: "scheduling/room-grids",
  },
];
const Location = () => (
  <output data-testid="location">{useLocation().search}</output>
);
const renderPage = (search = "") =>
  render(
    <MemoryRouter
      initialEntries={[`/admin/user-activity${search}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <UserActivityPage />
      <Location />
    </MemoryRouter>,
  );
const ready = () => screen.findByText(/Summaries refreshed/);

describe("UserActivityPage connected exploration", () => {
  beforeEach(() => {
    mocks.owner = true;
    localStorage.clear();
    Object.values(mocks)
      .filter((mock) => typeof mock?.mockReset === "function")
      .forEach((mock) => mock.mockReset());
    mocks.getDocs.mockResolvedValue({ docs: [] });
    mocks.sync.mockResolvedValue({ mode: "none" });
    mocks.summaries.mockResolvedValue(summaries);
    mocks.today.mockResolvedValue({
      todayDateKey,
      userDailyRows: [],
      analyticsRows: [],
      pageDailyRows: [],
    });
    mocks.history.mockResolvedValue({
      rows: events,
      cursor: null,
      hasMore: false,
    });
    mocks.archive.mockResolvedValue({
      blob: new Blob(["export"]), filename: "activity.zip",
      summary: { eventsExported: 2, userDayRows: 1, eventHistoryComplete: true },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a useful overview excluding the owner, with honest monitoring status", async () => {
    renderPage();
    await ready();
    expect(
      screen.getByRole("button", { name: /People using the app 1/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Features used 1/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Exclude my activity" }),
    ).toBeChecked();
    expect(
      screen.getByText("No failures recorded in this period"),
    ).toBeInTheDocument();
    expect(screen.getByText(/This is not an uptime check/)).toBeInTheDocument();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Exclude my activity" }),
    );
    expect(
      screen.getByRole("button", { name: /People using the app 2/ }),
    ).toBeInTheDocument();
  });

  it("downloads from a simple Export button, preserving scope and reusing loaded events", async () => {
    renderPage("?view=activity&range=7&person=staff&feature=scheduling%2Froom-grids&search=pdf&kind=errors");
    await ready();
    const callsBefore = mocks.history.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));
    await screen.findByText(/Export downloaded/);
    expect(mocks.history).toHaveBeenCalledTimes(callsBefore);
    expect(mocks.archive.mock.calls[0][0]).toMatchObject({
      scope: { person: "staff", feature: "scheduling/room-grids", excludeOwner: true },
      history: { rows: events, coverage: { complete: true, documentsFetched: 0 } },
    });
    expect(mocks.archive.mock.calls[0][0].scope).not.toHaveProperty("search");
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), "activity.zip", "application/zip");
    expect(screen.queryByText(/\bAI\b/i)).not.toBeInTheDocument();
  });

  it("reuses export pagination on subsequent downloads", async () => {
    const older = { ...events[0], id: "older" };
    mocks.history.mockResolvedValueOnce({ rows: events, cursor: { id: "event-1" }, hasMore: true })
      .mockResolvedValue({ rows: [older], cursor: null, hasMore: false });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));
    await screen.findByText(/Export downloaded/);
    expect(mocks.history).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 200, cursor: { id: "event-1" } }));
    expect(mocks.archive.mock.calls[0][0].history.rows).toHaveLength(3);
    const callsBefore = mocks.history.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2));
    expect(mocks.history).toHaveBeenCalledTimes(callsBefore);
  });

  it("exports available data with an explicit notice when extra reads reach the service limit", async () => {
    mocks.history.mockResolvedValueOnce({ rows: events, cursor: { id: "event-1" }, hasMore: true })
      .mockRejectedValue({ code: "resource-exhausted", message: "private database error" });
    mocks.archive.mockResolvedValue({ blob: new Blob(), filename: "partial.zip",
      summary: { eventsExported: 2, userDayRows: 1, eventHistoryComplete: false } });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));
    await screen.findByText(/Event history is partial/);
    expect(mocks.archive.mock.calls[0][0].history.coverage).toMatchObject({ complete: false, errorCode: "resource-exhausted" });
    expect(screen.queryByText(/private database error/)).not.toBeInTheDocument();
  });

  it("connects person details to feature details and filtered activity", async () => {
    renderPage("?view=usage&group=people");
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Staff User" }));
    let dialog = screen.getByRole("dialog", { name: "Staff User" });
    expect(within(dialog).getByText("Features they use")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Room Grids 1 person/ }),
    );
    dialog = screen.getByRole("dialog", { name: "Room Grids" });
    expect(
      within(dialog).getByText("People using this feature"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "All activity" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toContain(
      "feature=scheduling%2Froom-grids",
    );
    expect(screen.getByText("Follow their visits")).toBeInTheDocument();
    expect(
      screen.getByText("Opened the PDF print dialog", { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("preserves search and scope when switching views and returning", async () => {
    renderPage("?view=usage&group=people&person=staff&range=7");
    await ready();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search usage" }), {
      target: { value: "nobody" },
    });
    expect(
      screen.getByText("No people match the current filters."),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Activity", exact: true }),
    );
    expect(
      screen.getByRole("searchbox", { name: "Search activity" }),
    ).toHaveValue("nobody");
    expect(screen.getByTestId("location").textContent).toContain(
      "person=staff",
    );
    fireEvent.click(screen.getByRole("button", { name: "Usage", exact: true }));
    expect(screen.getByRole("searchbox", { name: "Search usage" })).toHaveValue(
      "nobody",
    );
  });

  it("makes unloaded history explicit and finds older matching visits after pagination", async () => {
    const cursor = { id: "cursor" };
    mocks.history
      .mockResolvedValueOnce({
        rows: [{ ...events[0], uid: "other", displayName: "Someone Else" }],
        cursor,
        hasMore: true,
      })
      .mockResolvedValueOnce({ rows: events, cursor: null, hasMore: false });
    renderPage("?view=activity&person=staff");
    await ready();
    expect(
      await screen.findByText(
        /No matching visits in the history loaded so far/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Load older activity" }),
    );
    expect(
      await screen.findByText("Opened the PDF print dialog", { selector: "p" }),
    ).toBeInTheDocument();
    expect(mocks.history).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor }),
    );
    expect(
      screen.queryByRole("button", { name: "Load older activity" }),
    ).not.toBeInTheDocument();
  });

  it("still shows available summaries when a sync status check fails", async () => {
    mocks.sync.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "permission-denied" }),
    );
    renderPage();
    await ready();
    expect(
      screen.getByText(/Summary status could not be checked/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /People using the app 1/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No failures recorded in this period"),
    ).not.toBeInTheDocument();
  });

  it("keeps independent data available when a presence read fails", async () => {
    mocks.getDocs.mockImplementation((query) =>
      Array.isArray(query)
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ docs: [] }),
    );
    renderPage();
    await ready();
    expect(screen.getByRole("alert")).toHaveTextContent("Current presence");
    expect(
      screen.getByRole("button", { name: /People using the app 1/ }),
    ).toBeInTheDocument();
  });

  it("refreshes today without reloading history summaries each minute", async () => {
    const ticks = [];
    vi.spyOn(globalThis, "setInterval").mockImplementation((callback) => {
      ticks.push(callback);
      return ticks.length;
    });
    vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {});
    renderPage();
    await ready();
    await act(async () => {
      ticks.forEach((tick) => tick());
    });
    await waitFor(() => expect(mocks.today).toHaveBeenCalledTimes(1));
    expect(mocks.summaries).toHaveBeenCalledTimes(1);
  });

  it("keeps reviewed separate from resolved and opens the issue's evidence", async () => {
    mocks.summaries.mockResolvedValue({
      ...summaries,
      userDailyRows: [
        {
          ...staffRow,
          failureCounts: {
            failure: {
              workflow: "pdf_export",
              pageId: "scheduling/room-grids",
              errorCode: "unexpected",
              count: 3,
              lastSeenAt: `${yesterdayDateKey}T14:00:00Z`,
            },
          },
        },
      ],
    });
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(screen.getByText("Reviewed", { exact: true })).toBeInTheDocument();
    expect(
      screen.queryByText("Resolved", { exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View activity" }));
    expect(screen.getByTestId("location").textContent).toContain("kind=errors");
  });

  it("restores keyboard focus when closing a person panel", async () => {
    renderPage("?view=usage&group=people");
    await ready();
    const trigger = screen.getByRole("button", { name: "Staff User" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: "Staff User" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not fetch private data for a non-owner", async () => {
    mocks.owner = false;
    renderPage();
    expect(
      screen.getByText(/only available to the configured activity owner/),
    ).toBeInTheDocument();
    expect(mocks.summaries).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("ignores a late history response from the previous date range", async () => {
    let resolveOld;
    mocks.history
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue({ rows: events, cursor: null, hasMore: false });
    renderPage("?view=activity");
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Activity period" }));
    fireEvent.click(screen.getByRole("option", { name: "Last 7 days" }));
    await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(2));
    await screen.findByText("Opened the PDF print dialog", { selector: "p" });
    await act(async () =>
      resolveOld({
        rows: [
          {
            ...events[0],
            id: "stale",
            uid: "stale",
            displayName: "Stale Person",
          },
        ],
        cursor: null,
        hasMore: false,
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Stale Person" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Opened the PDF print dialog", { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("does not race the head refresh against an in-flight older page", async () => {
    const ticks = [];
    vi.spyOn(globalThis, "setInterval").mockImplementation((callback) => {
      ticks.push(callback);
      return ticks.length;
    });
    vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {});
    let resolveMore;
    mocks.history
      .mockResolvedValueOnce({
        rows: events,
        cursor: { id: "cursor" },
        hasMore: true,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMore = resolve;
          }),
      );
    renderPage("?view=activity");
    await ready();
    fireEvent.click(
      await screen.findByRole("button", { name: "Load older activity" }),
    );
    await act(async () => ticks.forEach((tick) => tick()));
    expect(mocks.history).toHaveBeenCalledTimes(2);
    await act(async () =>
      resolveMore({ rows: [], cursor: null, hasMore: false }),
    );
    expect(
      screen.queryByRole("button", { name: "Load older activity" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Opened the PDF print dialog", { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("keeps the previous-visit boundary stable while recording this check-in", async () => {
    const previous = `${yesterdayDateKey}T14:01:00Z`;
    localStorage.setItem(
      "activity-console:v1:owner",
      JSON.stringify({ lastVisit: previous }),
    );
    renderPage("?view=activity&range=since");
    await ready();
    expect(
      screen.getByText(/Daily totals include the day of your last visit/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Opened the PDF print dialog", { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dashboard", exact: true }),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem("activity-console:v1:owner")).lastVisit,
    ).not.toBe(previous);
    expect(mocks.history.mock.calls[0][0].startDateKey).toBe(yesterdayDateKey);
  });
});
