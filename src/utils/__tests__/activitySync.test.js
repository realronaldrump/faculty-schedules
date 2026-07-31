// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ type: "collection", name }),
  doc: (_db, name, id) => ({ type: "doc", name, id }),
  getDoc: (...args) => firestoreMocks.getDoc(...args),
  getDocs: (...args) => firestoreMocks.getDocs(...args),
  limit: (value) => ({ type: "limit", value }),
  orderBy: (field, direction) => ({ type: "orderBy", field, direction }),
  query: (...parts) => ({ type: "query", parts }),
  serverTimestamp: () => ({ type: "serverTimestamp" }),
  setDoc: (...args) => firestoreMocks.setDoc(...args),
  startAfter: (value) => ({ type: "startAfter", value }),
  where: (field, operator, value) => ({
    type: "where",
    field,
    operator,
    value,
  }),
  writeBatch: (...args) => firestoreMocks.writeBatch(...args),
}));

import {
  ROLLUP_SCHEMA_VERSION,
  loadActivitySummaries,
  planRollupSync,
  syncActivityRollups,
} from "../activitySync";

const snapshotFrom = (rows) => ({
  docs: rows.map((data, index) => ({
    id: data.id || `row-${index}`,
    ref: { type: "doc", id: data.id || `row-${index}` },
    data: () => data,
  })),
  empty: rows.length === 0,
  size: rows.length,
});

const getCollectionName = (queryRef) => queryRef.parts[0].name;

describe("planRollupSync", () => {
  const todayDateKey = "2026-03-11";

  beforeEach(() => {
    Object.values(firestoreMocks).forEach((mock) => mock.mockReset());
  });

  it("plans a full rebuild on first run (no meta state)", () => {
    const plan = planRollupSync({ metaState: null, todayDateKey });
    expect(plan.mode).toBe("full");
    expect(plan.startDateKey).toBe("2025-12-12");
    expect(plan.endDateKey).toBe("2026-03-10");
    expect(plan.dateKeys).toHaveLength(89);
  });

  it("plans a full rebuild when the schema version changed", () => {
    const plan = planRollupSync({
      metaState: {
        coveredThroughDateKey: "2026-03-10",
        schemaVersion: ROLLUP_SCHEMA_VERSION - 1,
      },
      todayDateKey,
    });
    expect(plan.mode).toBe("full");
  });

  it("does nothing when rollups already cover through yesterday", () => {
    const plan = planRollupSync({
      metaState: {
        coveredThroughDateKey: "2026-03-10",
        schemaVersion: ROLLUP_SCHEMA_VERSION,
      },
      todayDateKey,
    });
    expect(plan.mode).toBe("none");
    expect(plan.dateKeys).toHaveLength(0);
  });

  it("plans an incremental rollup for only the uncovered days", () => {
    const plan = planRollupSync({
      metaState: {
        coveredThroughDateKey: "2026-03-08",
        schemaVersion: ROLLUP_SCHEMA_VERSION,
      },
      todayDateKey,
    });
    expect(plan.mode).toBe("incremental");
    expect(plan.dateKeys).toEqual(["2026-03-09", "2026-03-10"]);
  });

  it("clamps a stale watermark to the lookback window", () => {
    const plan = planRollupSync({
      metaState: {
        coveredThroughDateKey: "2025-01-01",
        schemaVersion: ROLLUP_SCHEMA_VERSION,
      },
      todayDateKey,
    });
    expect(plan.mode).toBe("incremental");
    expect(plan.startDateKey).toBe("2025-12-12");
    expect(plan.endDateKey).toBe("2026-03-10");
  });
});

describe("loadActivitySummaries", () => {
  beforeEach(() => {
    Object.values(firestoreMocks).forEach((mock) => mock.mockReset());
  });

  it("preserves stored legacy app/page rollups and navigation transitions", async () => {
    const legacyApp = {
      id: "2026-03-10",
      dateKey: "2026-03-10",
      uniqueUsers: 1,
      sessionCount: 1,
      pageEnterCount: 2,
      totalMinutesApprox: 8,
      topTransitions: [
        {
          fromPageId: "dashboard",
          fromPageLabel: "Dashboard",
          toPageId: "people/directory",
          toPageLabel: "People Directory",
          count: 1,
        },
      ],
    };
    const legacyPage = {
      id: "2026-03-10_dashboard",
      dateKey: "2026-03-10",
      pageId: "dashboard",
      pageLabel: "Dashboard",
      sectionLabel: "Home",
      pageEnterCount: 1,
      totalMinutesApprox: 7,
      uniqueUsers: 1,
    };
    const legacyUser = {
      id: "2026-03-10_owner",
      dateKey: "2026-03-10",
      uid: "owner",
      displayName: "Owner",
      role: "admin",
      sessionCount: 1,
      pageEnterCount: 2,
      pagesVisitedCount: 2,
      totalMinutesApprox: 8,
      topPagesDetailed: [legacyPage],
    };

    firestoreMocks.getDocs.mockImplementation(async (queryRef) => {
      const rowsByCollection = {
        userActivityAnalyticsDaily: [legacyApp],
        userActivityPageDaily: [legacyPage],
        userActivityDaily: [legacyUser],
      };
      return snapshotFrom(rowsByCollection[getCollectionName(queryRef)] || []);
    });

    const loaded = await loadActivitySummaries({
      now: new Date("2026-03-11T12:00:00Z"),
    });

    expect(loaded.analyticsRows).toEqual([
      expect.objectContaining({
        dateKey: "2026-03-10",
        totalMinutesApprox: 8,
        topTransitions: legacyApp.topTransitions,
      }),
    ]);
    expect(loaded.pageDailyRows).toEqual([
      expect.objectContaining({
        pageId: "dashboard",
        totalMinutesApprox: 7,
      }),
    ]);
  });

  it("does not present schema-v2 page-entry counters as elapsed time", async () => {
    const directV2 = {
      dateKey: "2026-03-10",
      uid: "owner",
      displayName: "Owner",
      role: "admin",
      schemaVersion: 2,
      sessionIds: ["session-1"],
      pageEnterCount: 7,
      totalMinutesApprox: 7,
      pageCounts: {
        dashboard: {
          pageId: "dashboard",
          pageLabel: "Dashboard",
          sectionLabel: "Home",
          pageEnterCount: 7,
          totalMinutesApprox: 7,
        },
      },
    };
    firestoreMocks.getDocs.mockImplementation(async (queryRef) =>
      snapshotFrom(
        getCollectionName(queryRef) === "userActivityDaily" ? [directV2] : [],
      ),
    );

    const loaded = await loadActivitySummaries({
      now: new Date("2026-03-11T12:00:00Z"),
    });

    expect(loaded.analyticsRows[0]).toEqual(
      expect.objectContaining({ pageEnterCount: 7, totalMinutesApprox: 0 }),
    );
    expect(loaded.pageDailyRows[0]).toEqual(
      expect.objectContaining({ pageEnterCount: 7, totalMinutesApprox: 0 }),
    );
    expect(loaded.userDailyRows[0].totalMinutesApprox).toBe(0);
    expect(loaded.userDailyRows[0].pagesVisitedCount).toBe(1);
  });

  it("derives common paths from schema-v3 transition counters", async () => {
    const directV3 = {
      dateKey: "2026-03-10",
      uid: "owner",
      displayName: "Owner",
      role: "admin",
      schemaVersion: 3,
      sessionIds: ["session-1"],
      pageEnterCount: 3,
      totalMinutesApprox: 5,
      pageCounts: {
        directory: {
          pageId: "people/directory",
          pageLabel: "People Directory",
          sectionLabel: "People",
          pageEnterCount: 3,
          totalMinutesApprox: 5,
        },
      },
      transitionCounts: {
        path: {
          fromPageId: "dashboard",
          fromPageLabel: "Dashboard",
          toPageId: "people/directory",
          toPageLabel: "People Directory",
          count: 2,
        },
      },
    };
    firestoreMocks.getDocs.mockImplementation(async (queryRef) =>
      snapshotFrom(
        getCollectionName(queryRef) === "userActivityDaily" ? [directV3] : [],
      ),
    );

    const loaded = await loadActivitySummaries({
      now: new Date("2026-03-11T12:00:00Z"),
    });

    expect(loaded.analyticsRows[0].topTransitions).toEqual([
      expect.objectContaining({
        fromPageId: "dashboard",
        toPageId: "people/directory",
        count: 2,
      }),
    ]);
  });

  it("uses only measured v3 dwell when a document was upgraded from v2", async () => {
    const upgradedSummary = {
      dateKey: "2026-03-10",
      uid: "owner",
      displayName: "Owner",
      role: "admin",
      schemaVersion: 3,
      sessionIds: ["session-1"],
      pageEnterCount: 9,
      trackedPageEnterCount: 1,
      // This field contains the old v2 page-entry inflation and must be ignored.
      totalMinutesApprox: 9.5,
      measuredMinutes: 0.5,
      pageCounts: {
        dashboard: {
          pageId: "dashboard",
          pageLabel: "Dashboard",
          sectionLabel: "Home",
          pageEnterCount: 9,
          trackedPageEnterCount: 1,
          totalMinutesApprox: 9.5,
          measuredMinutes: 0.5,
        },
      },
    };
    firestoreMocks.getDocs.mockImplementation(async (queryRef) =>
      snapshotFrom(
        getCollectionName(queryRef) === "userActivityDaily"
          ? [upgradedSummary]
          : [],
      ),
    );

    const loaded = await loadActivitySummaries({
      now: new Date("2026-03-11T12:00:00Z"),
    });

    expect(loaded.analyticsRows[0].totalMinutesApprox).toBe(0.5);
    expect(loaded.analyticsRows[0].pageEnterCount).toBe(1);
    expect(loaded.pageDailyRows[0].totalMinutesApprox).toBe(0.5);
    expect(loaded.pageDailyRows[0].pageEnterCount).toBe(1);
    expect(loaded.userDailyRows[0].totalMinutesApprox).toBe(0.5);
  });
});

describe("syncActivityRollups", () => {
  beforeEach(() => {
    Object.values(firestoreMocks).forEach((mock) => mock.mockReset());
    firestoreMocks.setDoc.mockResolvedValue();
    firestoreMocks.writeBatch.mockImplementation(() => ({
      delete: vi.fn(),
      set: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    }));
  });

  it("backfills uncovered raw-event days and advances the real watermark", async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        coveredThroughDateKey: "2026-03-08",
        schemaVersion: ROLLUP_SCHEMA_VERSION,
      }),
    });
    const rawEvent = {
      id: "event-1",
      uid: "owner",
      displayName: "Owner",
      role: "admin",
      sessionId: "session-1",
      eventType: "page_enter",
      actionKey: "navigate",
      pageId: "dashboard",
      pageLabel: "Dashboard",
      sectionLabel: "Home",
      timestamp: new Date("2026-03-09T18:00:00Z"),
    };
    firestoreMocks.getDocs.mockImplementation(async (queryRef) => {
      const collectionName = getCollectionName(queryRef);
      if (collectionName !== "userActivityEvents") return snapshotFrom([]);
      const timestampWheres = queryRef.parts.filter(
        (part) => part.type === "where" && part.field === "timestamp",
      );
      const isRangeRead = timestampWheres.some(
        (part) => part.operator === ">=",
      );
      return snapshotFrom(isRangeRead ? [rawEvent] : []);
    });

    const result = await syncActivityRollups({
      now: new Date("2026-03-11T12:00:00Z"),
    });

    expect(result).toEqual(
      expect.objectContaining({
        mode: "incremental",
        rolledDayCount: 1,
        eventCount: 1,
        coveredThroughDateKey: "2026-03-10",
      }),
    );
    expect(firestoreMocks.writeBatch).toHaveBeenCalled();
    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "userActivityMeta", id: "rollupState" }),
      expect.objectContaining({
        coveredThroughDateKey: "2026-03-10",
        schemaVersion: ROLLUP_SCHEMA_VERSION,
        lastSyncMode: "incremental",
        lastSyncEventCount: 1,
      }),
    );
  });

  it("never overwrites a modern direct user summary during a full backfill", async () => {
    const batchSet = vi.fn();
    firestoreMocks.writeBatch.mockImplementation(() => ({
      delete: vi.fn(),
      set: batchSet,
      commit: vi.fn(() => Promise.resolve()),
    }));
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        coveredThroughDateKey: "2026-03-08",
        schemaVersion: ROLLUP_SCHEMA_VERSION - 1,
      }),
    });
    const directSummary = {
      id: "2026-03-10_owner",
      dateKey: "2026-03-10",
      uid: "owner",
      schemaVersion: 3,
      pageEnterCount: 1,
      totalMinutesApprox: 4,
    };
    const rawEvent = {
      id: "event-1",
      uid: "owner",
      displayName: "Owner",
      role: "admin",
      sessionId: "session-1",
      eventType: "page_enter",
      actionKey: "navigate",
      pageId: "dashboard",
      pageLabel: "Dashboard",
      sectionLabel: "Home",
      timestamp: new Date("2026-03-10T18:00:00Z"),
    };
    firestoreMocks.getDocs.mockImplementation(async (queryRef) => {
      const collectionName = getCollectionName(queryRef);
      if (collectionName === "userActivityDaily") {
        return snapshotFrom([directSummary]);
      }
      if (collectionName !== "userActivityEvents") return snapshotFrom([]);
      const isRangeRead = queryRef.parts.some(
        (part) =>
          part.type === "where" &&
          part.field === "timestamp" &&
          part.operator === ">=",
      );
      return snapshotFrom(isRangeRead ? [rawEvent] : []);
    });

    await syncActivityRollups({
      now: new Date("2026-03-11T12:00:00Z"),
    });

    expect(
      batchSet.mock.calls.some(([ref]) => ref.name === "userActivityDaily"),
    ).toBe(false);
    expect(
      batchSet.mock.calls.some(
        ([ref]) => ref.name === "userActivityAnalyticsDaily",
      ),
    ).toBe(true);
  });
});
