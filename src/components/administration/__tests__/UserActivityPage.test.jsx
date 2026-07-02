// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDocsMock = vi.fn();
const syncActivityRollupsMock = vi.fn();
const loadActivitySummariesMock = vi.fn();

vi.mock("../../../contexts/AuthContext.jsx", () => ({
  useAuth: () => ({ isActivityOwner: true }),
}));

vi.mock("../../../firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...args) => ({ type: "collection", args })),
  getDocs: (...args) => getDocsMock(...args),
  limit: vi.fn((value) => ({ type: "limit", value })),
  orderBy: vi.fn((field, direction) => ({ type: "orderBy", field, direction })),
  query: vi.fn((...args) => ({ type: "query", args })),
}));

vi.mock("../../../utils/activitySync", () => ({
  SUMMARY_LOOKBACK_DAYS: 90,
  syncActivityRollups: (...args) => syncActivityRollupsMock(...args),
  loadActivitySummaries: (...args) => loadActivitySummariesMock(...args),
}));

import UserActivityPage from "../UserActivityPage";
import {
  formatDateKeyInTimeZone,
  getDateKeyDaysAgo,
} from "../../../utils/activityAnalytics";

// The page builds its model against the real current date, so fixtures must
// use live dateKeys to fall inside the selected range.
const todayDateKey = formatDateKeyInTimeZone(new Date());
const yesterdayDateKey = getDateKeyDaysAgo(1);

const emptySummaries = {
  todayDateKey,
  analyticsRows: [],
  pageDailyRows: [],
  userDailyRows: [],
};

const populatedSummaries = {
  todayDateKey,
  analyticsRows: [
    {
      dateKey: yesterdayDateKey,
      uniqueUsers: 1,
      sessionCount: 2,
      pageEnterCount: 6,
      semanticEventCount: 3,
      totalMinutesApprox: 42,
      hourlyBuckets: [],
      topActions: [],
      topTransitions: [],
    },
  ],
  pageDailyRows: [
    {
      dateKey: yesterdayDateKey,
      pageId: "dashboard",
      pageLabel: "Dashboard",
      sectionLabel: "Home",
      uniqueUsers: 1,
      pageEnterCount: 6,
      totalMinutesApprox: 42,
    },
  ],
  userDailyRows: [
    {
      dateKey: yesterdayDateKey,
      uid: "staffer",
      email: "staff@example.com",
      displayName: "Staff User",
      role: "staff",
      sessionCount: 2,
      totalMinutesApprox: 42,
      pagesVisitedCount: 3,
      pageEnterCount: 6,
      topPagesDetailed: [],
      topActions: [],
      hourlyBuckets: [],
    },
  ],
};

describe("UserActivityPage", () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    getDocsMock.mockResolvedValue({ docs: [] });
    syncActivityRollupsMock.mockReset();
    syncActivityRollupsMock.mockResolvedValue({
      mode: "none",
      rolledDayCount: 0,
      eventCount: 0,
      prunedCount: 0,
      coveredThroughDateKey: "2026-03-10",
      lastSyncAt: null,
    });
    loadActivitySummariesMock.mockReset();
    loadActivitySummariesMock.mockResolvedValue(emptySummaries);
  });

  afterEach(() => {
    cleanup();
  });

  it("loads bounded summaries automatically on open and reports up-to-date status", async () => {
    render(<UserActivityPage />);

    await waitFor(() => {
      expect(syncActivityRollupsMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(loadActivitySummariesMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Up to date · today is live/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/No activity recorded in this range yet/i),
    ).toBeInTheDocument();
    // No manual rebuild affordance anywhere.
    expect(screen.queryByText(/rebuild/i)).not.toBeInTheDocument();
  });

  it("still loads stored summaries when the status check fails", async () => {
    syncActivityRollupsMock.mockRejectedValue(
      Object.assign(new Error("Missing or insufficient permissions."), {
        code: "permission-denied",
      }),
    );
    loadActivitySummariesMock.mockResolvedValue(populatedSummaries);

    render(<UserActivityPage />);

    expect(
      await screen.findByText(/Summary status could not be checked/i),
    ).toBeInTheDocument();
    // Overview still renders from the stored summaries.
    expect(await screen.findByText(/Usage trend/i)).toBeInTheDocument();
  });

  it("shows the users table with filters on the Users tab", async () => {
    loadActivitySummariesMock.mockResolvedValue(populatedSummaries);
    render(<UserActivityPage />);

    await screen.findByText(/Up to date · today is live/i);
    fireEvent.click(screen.getByRole("button", { name: /^Users$/i }));

    expect(await screen.findByText("Staff User")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search name or email/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search name or email/i), {
      target: { value: "nobody" },
    });
    expect(
      await screen.findByText(/No users match the current filters/i),
    ).toBeInTheDocument();
  });
});
