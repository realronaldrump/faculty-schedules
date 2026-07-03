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
  lastRunError: "",
  blockingCategories: [],
  totalBlockingIssues: 0,
  safeFixableCount: 0,
  expandedCategories: {},
  pendingActionKey: "",
  pendingMergeConfirmationKey: "",

  baselineReport: null,
  baselinePreviewReport: null,
  isLoadingBaselinePreview: false,
  isRunningBaseline: false,
  loadBaselinePreview: vi.fn(),
  termCode: "",
  termRepairReport: null,
  termRepairPreviewReport: null,
  isLoadingTermRepairPreview: false,
  isRunningTermRepair: false,
  loadTermRepairPreview: vi.fn(),
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
  baylorIdCleanupPreview: null,
  baylorIdCleanupReport: null,
  isLoadingBaylorIdCleanupPreview: false,
  isApplyingBaylorIdCleanup: false,

  handleScan: vi.fn(),
  handleSafeFix: vi.fn(),
  handleCopyValue: vi.fn(),
  handleMergeDuplicate: vi.fn(),
  handleMarkDuplicateAsDistinct: vi.fn(),
  handleRepairSpaceIssue: vi.fn(),
  handleMarkConflictAsDistinct: vi.fn(),
  toggleCategory: vi.fn(),
  cancelMergeConfirmation: vi.fn(),

  runBaseline: vi.fn(async () => {}),
  setTermCode: vi.fn(),
  runTermRepair: vi.fn(),
  loadLocationPreview: vi.fn(),
  applyLocationChanges: vi.fn(async () => {}),
  setOrphanTermFilter: vi.fn(),
  scanOrphans: vi.fn(),
  applyOrphanCleanup: vi.fn(async () => {}),
  loadBaylorIdCleanupPreview: vi.fn(),
  applyBaylorIdCleanup: vi.fn(async () => {}),
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

  it("auto-runs the data check once and renders a calm starting state", () => {
    render(<DataCleanupRepairsPage />);

    expect(mockActions.handleScan).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Data Health Check")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Checking your data" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /checking/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /items that need your choice/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps support tools hidden until shown", () => {
    render(<DataCleanupRepairsPage />);

    expect(
      screen.queryByRole("button", { name: /run full data refresh/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /support tools/i }),
    );

    expect(
      screen.getByRole("button", { name: /show support tools/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /run full data refresh/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /show support tools/i }),
    );

    expect(
      screen.getByRole("button", { name: /run full data refresh/i }),
    ).toBeInTheDocument();
  });

  it("opens confirmation before full data refresh", async () => {
    mockActions.baselinePreviewReport = {
      summary: {
        totalTermsProcessed: 1,
        totalSchedulesProcessed: 10,
      },
    };

    render(<DataCleanupRepairsPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /support tools/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /show support tools/i }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /run full data refresh/i }),
    );

    expect(mockActions.runBaseline).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /run full data refresh\?/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /run refresh/i }));

    await waitFor(() => {
      expect(mockActions.runBaseline).toHaveBeenCalledTimes(1);
    });
  });

  it("opens confirmation before applying Baylor ID cleanup", async () => {
    mockActions.baylorIdCleanupPreview = {
      summary: {
        totalWritesPlanned: 3,
        peopleToUpdate: 1,
        schedulesToUpdate: 1,
        historyDocsToScrub: 1,
      },
      people: { manualReview: [] },
    };

    render(<DataCleanupRepairsPage />);

    fireEvent.click(screen.getByRole("button", { name: /support tools/i }));
    fireEvent.click(screen.getByRole("button", { name: /show support tools/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /apply baylor id cleanup/i }),
    );

    expect(mockActions.applyBaylorIdCleanup).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /apply baylor id cleanup\?/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /apply cleanup/i }));

    await waitFor(() => {
      expect(mockActions.applyBaylorIdCleanup).toHaveBeenCalledTimes(1);
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

    render(<DataCleanupRepairsPage />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /support tools most users never need/i,
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /show support tools/i }),
    );

    const detailsPanels = screen.getAllByTestId("technical-details");
    expect(detailsPanels.length).toBeGreaterThan(0);
    detailsPanels.forEach((panel) => {
      expect(panel.open).toBe(false);
    });
  });

  it("starts with support tools collapsed by default", () => {
    render(<DataCleanupRepairsPage />);

    expect(
      screen.queryByRole("button", { name: /show support tools/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show scary maintenance words in the default visible UI", () => {
    const { container } = render(<DataCleanupRepairsPage />);
    const visibleText = container.textContent.toLowerCase();

    ["orphan", "migration", "baseline", "legacy", "database"].forEach((word) => {
      expect(visibleText).not.toContain(word);
    });
  });

  it("runs routine cleanup from the main action", () => {
    mockActions.scanResult = { timestamp: new Date().toISOString() };
    mockActions.safeFixableCount = 3;
    mockActions.totalBlockingIssues = 3;

    render(<DataCleanupRepairsPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /clean up routine items/i }),
    );

    expect(mockActions.handleSafeFix).toHaveBeenCalledTimes(1);
  });

  it("shows a routine cleanup preview from the cleanup metric", () => {
    mockActions.scanResult = {
      timestamp: new Date().toISOString(),
      autoFixable: {
        highConfidencePeopleDuplicates: 1,
        highConfidenceScheduleDuplicates: 0,
        highConfidenceRoomDuplicates: 0,
        orphanedSchedulesWithName: 1,
        orphanedSpaceLinks: 0,
        legacyModelIssues: 0,
      },
      issues: {
        duplicates: {
          people: [
            {
              records: [
                { id: "person-1", firstName: "Alex", lastName: "Taylor" },
                { id: "person-2", firstName: "Alec", lastName: "Taylor" },
              ],
            },
          ],
        },
        orphaned: [
          {
            type: "orphaned_schedule",
            record: {
              id: "schedule-1",
              courseCode: "MUS 1010",
              section: "01",
              term: "Spring 2026",
              instructorName: "Alex Taylor",
            },
          },
        ],
        legacyModelIssues: [],
      },
    };
    mockActions.safeFixableCount = 2;
    mockActions.totalBlockingIssues = 2;

    render(<DataCleanupRepairsPage />);

    expect(
      screen.queryByText(/routine cleanup preview/i),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /routine cleanup\s+2\s+preview cleanup/i,
      }),
    );

    expect(screen.getByText(/routine cleanup preview/i)).toBeInTheDocument();
    expect(screen.getByText("People duplicates")).toBeInTheDocument();
    expect(screen.getByText("Alex Taylor + Alec Taylor")).toBeInTheDocument();
    expect(
      screen.getByText("Classes missing instructor links"),
    ).toBeInTheDocument();
    expect(screen.getByText("MUS 1010 01 (Spring 2026)")).toBeInTheDocument();
  });

  it("shows manual decisions even while routine cleanup is available", () => {
    mockActions.scanResult = {
      timestamp: new Date().toISOString(),
      autoFixable: {
        highConfidencePeopleDuplicates: 1,
        highConfidenceScheduleDuplicates: 0,
        highConfidenceRoomDuplicates: 0,
        orphanedSchedulesWithName: 0,
        orphanedSpaceLinks: 0,
        legacyModelIssues: 0,
      },
    };
    mockActions.safeFixableCount = 1;
    mockActions.totalBlockingIssues = 2;
    mockActions.blockingCategories = [
      {
        id: "high-confidence-duplicates",
        label: "Possible duplicates",
        count: 1,
        description: "Entries that may be the same person.",
        items: [
          {
            entityType: "people",
            confidence: 0.99,
            records: [
              { id: "person-1", firstName: "Alex", lastName: "Taylor" },
              { id: "person-2", firstName: "Alec", lastName: "Taylor" },
            ],
          },
        ],
      },
      {
        id: "unresolved-import-issues",
        label: "Imported names to match",
        count: 1,
        description: "Imported people that need to be matched or skipped.",
        items: [
          {
            transactionId: "import_preview_1",
            status: "preview",
            issueId: "issue_1",
            semester: "Spring 2026",
          },
        ],
      },
    ];

    render(<DataCleanupRepairsPage />);

    expect(
      screen.getByRole("heading", { name: /items that need your choice/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Imported names to match")).toBeInTheDocument();
    expect(screen.queryByText("Possible duplicates")).not.toBeInTheDocument();
  });

  it("shows remaining routine items after cleanup if the fresh scan still finds them", () => {
    mockActions.scanResult = {
      timestamp: new Date().toISOString(),
      autoFixable: {
        highConfidencePeopleDuplicates: 1,
        highConfidenceScheduleDuplicates: 0,
        highConfidenceRoomDuplicates: 0,
        orphanedSchedulesWithName: 0,
        orphanedSpaceLinks: 0,
        legacyModelIssues: 0,
      },
      issues: {
        duplicates: {
          people: [
            {
              records: [
                { id: "person-1", firstName: "Alex", lastName: "Taylor" },
                { id: "person-2", firstName: "Alec", lastName: "Taylor" },
              ],
            },
          ],
        },
      },
    };
    mockActions.safeFixableCount = 1;
    mockActions.totalBlockingIssues = 1;
    mockActions.safeFixResult = {
      totalFixed: 0,
      errors: ["Failed to merge people: missing permission"],
    };
    mockActions.blockingCategories = [
      {
        id: "high-confidence-duplicates",
        label: "Possible duplicates",
        count: 1,
        description: "Entries that may be the same person.",
        items: [
          {
            entityType: "people",
            confidence: 0.99,
            records: [
              { id: "person-1", firstName: "Alex", lastName: "Taylor" },
              { id: "person-2", firstName: "Alec", lastName: "Taylor" },
            ],
          },
        ],
      },
    ];

    render(<DataCleanupRepairsPage />);

    expect(
      screen.getByRole("heading", { name: /routine cleanup still needs review/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cleanup ran, but 1 routine item is still showing/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /items still showing after cleanup/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Possible duplicates")).toBeInTheDocument();
    expect(screen.getByText(/Failed to merge people/i)).toBeInTheDocument();
  });

  it("explains older-format items that remain after cleanup", () => {
    mockActions.scanResult = {
      timestamp: new Date().toISOString(),
      autoFixable: {
        highConfidencePeopleDuplicates: 0,
        highConfidenceScheduleDuplicates: 0,
        highConfidenceRoomDuplicates: 0,
        orphanedSchedulesWithName: 0,
        orphanedSpaceLinks: 0,
        legacyModelIssues: 1,
      },
      issues: {
        legacyModelIssues: [
          {
            recordType: "people",
            record: {
              id: "person-1",
              name: "Ella Miller",
            },
            touchedFields: ["student_payload_mirror_fields"],
          },
        ],
      },
    };
    mockActions.safeFixableCount = 1;
    mockActions.totalBlockingIssues = 1;
    mockActions.safeFixResult = { totalFixed: 0, errors: [] };
    mockActions.blockingCategories = [
      {
        id: "legacy-model-issues",
        label: "Older data format",
        count: 1,
        description: "Entries saved in an older format.",
        items: [
          {
            recordType: "people",
            record: {
              id: "person-1",
              name: "Ella Miller",
            },
            touchedFields: ["student_payload_mirror_fields"],
          },
        ],
      },
    ];

    render(<DataCleanupRepairsPage />);

    expect(
      screen.getByText("Ella Miller: student worker mirror fields"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ella Miller: older people format"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/student worker mirror fields/i).length).toBe(2);
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
        label: "Possible duplicates",
        count: 1,
        description: "Entries that may be the same person.",
        items: [duplicateItem],
      },
    ];

    render(<DataCleanupRepairsPage />);

    fireEvent.click(screen.getByRole("button", { name: /review merge/i }));

    expect(mockActions.handleMergeDuplicate).toHaveBeenCalledTimes(1);
    expect(mockActions.handleMergeDuplicate).toHaveBeenCalledWith(duplicateItem);
  });

  it("uses inline merge confirmation controls", () => {
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
    mockActions.pendingMergeConfirmationKey = "people:person-1:person-2";
    mockActions.blockingCategories = [
      {
        id: "high-confidence-duplicates",
        label: "Possible duplicates",
        count: 1,
        description: "Entries that may be the same person.",
        items: [duplicateItem],
      },
    ];

    render(<DataCleanupRepairsPage />);

    expect(
      screen.getByRole("button", { name: /yes, merge these/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(mockActions.cancelMergeConfirmation).toHaveBeenCalledTimes(1);
  });

  it("uses actionable unresolved import controls", () => {
    mockActions.scanResult = { timestamp: new Date().toISOString() };
    mockActions.totalBlockingIssues = 2;
    mockActions.blockingCategories = [
      {
        id: "unresolved-import-issues",
        label: "Imported names to match",
        count: 2,
        description: "Imported people that need to be matched or skipped.",
        items: [
          {
            transactionId: "import_preview_1",
            status: "preview",
            issueId: "issue_1",
            importType: "schedule",
            semester: "Spring 2026",
          },
          {
            transactionId: "import_failed_1",
            status: "failed",
            issueId: "issue_2",
            importType: "schedule",
            semester: "Spring 2026",
          },
        ],
      },
    ];

    render(<DataCleanupRepairsPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /continue import decisions/i }),
    );
    expect(navigateMock).toHaveBeenCalledWith(
      "/admin-tools/import-wizard?transaction=import_preview_1&view=resolve",
    );
  });

  it("runs routine cleanup from older-format issue cards", () => {
    mockActions.scanResult = { timestamp: new Date().toISOString() };
    mockActions.totalBlockingIssues = 1;
    mockActions.blockingCategories = [
      {
        id: "legacy-model-issues",
        label: "Older data format",
        count: 1,
        description: "Entries saved in an older format.",
        items: [
          {
            recordType: "people",
            touchedFields: ["jobTitle"],
            message: "Legacy mirrored fields detected.",
          },
        ],
      },
    ];

    render(<DataCleanupRepairsPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /clean up routine items/i }),
    );
    expect(mockActions.handleSafeFix).toHaveBeenCalledTimes(1);
  });
});
