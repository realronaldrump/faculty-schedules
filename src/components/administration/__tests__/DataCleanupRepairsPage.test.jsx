// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const showNotificationMock = vi.fn();

let mockActions;

const createMockActions = () => ({
  activeStep: 1,
  setActiveStep: vi.fn(),
  scanResult: null,
  safeFixResult: null,
  isScanning: false,
  isFixingSafe: false,
  blockingCategories: [],
  totalBlockingIssues: 0,
  safeFixableCount: 0,
  expandedCategories: {},
  pendingActionKey: "",
  pendingMergeConfirmationKey: "",

  baselineReport: null,
  isRunningBaseline: false,
  termCode: "",
  termRepairReport: null,
  isRunningTermRepair: false,
  locationPreview: null,
  locationApplyReport: null,
  isLoadingLocationPreview: false,
  isApplyingLocationMigration: false,
  orphanTermFilter: "",
  orphanScan: null,
  orphanCleanupResult: null,
  orphanTotal: 0,
  isScanningOrphans: false,
  isApplyingOrphanCleanup: false,

  handleScan: vi.fn(),
  handleSafeFix: vi.fn(),
  handleCopyValue: vi.fn(),
  handleMergeDuplicate: vi.fn(),
  handleMarkDuplicateAsDistinct: vi.fn(),
  handleRepairSpaceIssue: vi.fn(),
  handleMarkConflictAsDistinct: vi.fn(),
  toggleCategory: vi.fn(),

  runBaseline: vi.fn(async () => {}),
  setTermCode: vi.fn(),
  runTermRepair: vi.fn(),
  loadLocationPreview: vi.fn(),
  applyLocationChanges: vi.fn(async () => {}),
  setOrphanTermFilter: vi.fn(),
  scanOrphans: vi.fn(),
  applyOrphanCleanup: vi.fn(async () => {}),
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: true }),
}));

vi.mock("../../../contexts/UIContext", () => ({
  useUI: () => ({ showNotification: showNotificationMock }),
}));

vi.mock("../../../contexts/ScheduleContext", () => ({
  useSchedules: () => ({
    termOptions: [
      { term: "Spring 2026", termCode: "202610" },
      { term: "Fall 2026", termCode: "202640" },
    ],
    selectedTermMeta: { term: "Spring 2026", termCode: "202610" },
  }),
}));

vi.mock("../data-cleanup/useDataCleanupActions", () => ({
  default: () => mockActions,
}));

import DataCleanupRepairsPage from "../data-cleanup/DataCleanupRepairsPage";

describe("DataCleanupRepairsPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    showNotificationMock.mockReset();
    mockActions = createMockActions();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders unified routine workflow by default", () => {
    render(<DataCleanupRepairsPage initialMode="routine" />);

    expect(
      screen.getByRole("heading", { name: "Data Cleanup & Repairs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run data check/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run safe fixes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /3. review items needing decisions/i }),
    ).toBeInTheDocument();
  });

  it("keeps rare tools hidden until unlocked", () => {
    render(<DataCleanupRepairsPage initialMode="routine" />);

    expect(
      screen.queryByRole("button", { name: /run full baseline repair/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: /rare repair tools/i })[0],
    );

    expect(
      screen.getByRole("button", { name: /unlock rare repair tools/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /run full baseline repair/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /unlock rare repair tools/i }),
    );

    expect(
      screen.getByRole("button", { name: /run full baseline repair/i }),
    ).toBeInTheDocument();
  });

  it("opens confirmation before destructive baseline action", async () => {
    render(<DataCleanupRepairsPage initialMode="routine" />);

    fireEvent.click(
      screen.getAllByRole("button", { name: /rare repair tools/i })[0],
    );
    fireEvent.click(
      screen.getByRole("button", { name: /unlock rare repair tools/i }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /run full baseline repair/i }),
    );

    expect(mockActions.runBaseline).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /run full baseline repair\?/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /run baseline/i }));

    await waitFor(() => {
      expect(mockActions.runBaseline).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps technical details collapsed by default", () => {
    mockActions.baselineReport = {
      summary: {
        totalTermsProcessed: 1,
        totalSchedulesProcessed: 5,
        identityBackfillUpdated: 0,
        blockerCount: 0,
      },
    };

    render(<DataCleanupRepairsPage initialMode="advanced" />);

    fireEvent.click(
      screen.getByRole("button", { name: /unlock rare repair tools/i }),
    );

    const detailsPanels = screen.getAllByTestId("technical-details");
    expect(detailsPanels.length).toBeGreaterThan(0);
    detailsPanels.forEach((panel) => {
      expect(panel.open).toBe(false);
    });
  });

  it("opens advanced section by default for legacy maintenance mode", () => {
    render(<DataCleanupRepairsPage initialMode="advanced" />);

    expect(
      screen.getAllByText(/legacy maintenance route/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /unlock rare repair tools/i }),
    ).toBeInTheDocument();
  });

  it("renders manual decision items and triggers handlers", () => {
    const duplicateItem = {
      entityType: "people",
      confidence: 0.99,
      records: [
        { id: "person-1", firstName: "Alex", lastName: "Taylor" },
        { id: "person-2", firstName: "Alec", lastName: "Taylor" },
      ],
    };

    mockActions.scanResult = { timestamp: new Date().toISOString() };
    mockActions.totalBlockingIssues = 1;
    mockActions.blockingCategories = [
      {
        id: "high-confidence-duplicates",
        label: "Likely duplicate records",
        count: 1,
        description: "Records that likely represent the same person.",
        items: [duplicateItem],
      },
    ];

    render(<DataCleanupRepairsPage initialMode="routine" />);

    fireEvent.click(screen.getByRole("button", { name: /merge records/i }));

    expect(mockActions.handleMergeDuplicate).toHaveBeenCalledTimes(1);
    expect(mockActions.handleMergeDuplicate).toHaveBeenCalledWith(duplicateItem);
  });
});
