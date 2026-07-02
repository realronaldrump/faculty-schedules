import { describe, expect, it } from "vitest";
import {
  buildActivityAnalyticsModel,
  buildPageDrilldownModel,
  buildUserDrilldownModel,
} from "../activityAnalytics";

describe("activity analytics aggregation", () => {
  const appDailyRows = [
    {
      dateKey: "2026-03-10",
      uniqueUsers: 2,
      sessionCount: 3,
      pageEnterCount: 8,
      semanticEventCount: 10,
      totalMinutesApprox: 44,
      roleBreakdown: {
        admin: { uniqueUsers: 1, sessionCount: 1, pageEnterCount: 4, semanticEventCount: 5, totalMinutesApprox: 24 },
        staff: { uniqueUsers: 1, sessionCount: 2, pageEnterCount: 4, semanticEventCount: 5, totalMinutesApprox: 20 },
      },
      hourlyBuckets: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        pageEnterCount: hour === 9 ? 4 : 0,
        semanticEventCount: hour === 9 ? 5 : 0,
        totalMinutesApprox: hour === 9 ? 20 : 0,
        uniqueUsers: hour === 9 ? 2 : 0,
      })),
      topActions: [{ actionKey: "navigate", count: 8, uniqueUsers: 2 }],
      topTransitions: [
        {
          fromPageId: "dashboard",
          fromPageLabel: "Dashboard",
          toPageId: "people/directory",
          toPageLabel: "People Directory",
          count: 3,
        },
      ],
    },
    {
      dateKey: "2026-03-11",
      uniqueUsers: 1,
      sessionCount: 1,
      pageEnterCount: 3,
      semanticEventCount: 4,
      totalMinutesApprox: 15,
      roleBreakdown: {
        staff: { uniqueUsers: 1, sessionCount: 1, pageEnterCount: 3, semanticEventCount: 4, totalMinutesApprox: 15 },
      },
      hourlyBuckets: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        pageEnterCount: hour === 10 ? 3 : 0,
        semanticEventCount: hour === 10 ? 4 : 0,
        totalMinutesApprox: hour === 10 ? 15 : 0,
        uniqueUsers: hour === 10 ? 1 : 0,
      })),
      topActions: [{ actionKey: "search", count: 2, uniqueUsers: 1 }],
      topTransitions: [],
    },
  ];

  const pageDailyRows = [
    {
      dateKey: "2026-03-10",
      pageId: "dashboard",
      pageLabel: "Dashboard",
      sectionLabel: "Home",
      uniqueUsers: 2,
      pageEnterCount: 5,
      totalMinutesApprox: 28,
    },
    {
      dateKey: "2026-03-11",
      pageId: "people/directory",
      pageLabel: "People Directory",
      sectionLabel: "People",
      uniqueUsers: 1,
      pageEnterCount: 2,
      totalMinutesApprox: 12,
    },
  ];

  const userDailyRows = [
    {
      dateKey: "2026-03-10",
      uid: "owner",
      email: "owner@example.com",
      displayName: "Owner",
      role: "admin",
      sessionCount: 1,
      totalMinutesApprox: 24,
      pagesVisitedCount: 3,
      pageEnterCount: 4,
      topPagesDetailed: [{ pageId: "dashboard", pageLabel: "Dashboard", count: 2, totalMinutesApprox: 12 }],
      topActions: [{ actionKey: "navigate", count: 4 }],
      hourlyBuckets: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        pageEnterCount: hour === 9 ? 4 : 0,
        semanticEventCount: hour === 9 ? 4 : 0,
        totalMinutesApprox: hour === 9 ? 24 : 0,
      })),
    },
    {
      dateKey: "2026-03-10",
      uid: "staffer",
      email: "staff@example.com",
      displayName: "Staff User",
      role: "staff",
      sessionCount: 2,
      totalMinutesApprox: 20,
      pagesVisitedCount: 4,
      pageEnterCount: 4,
      topPagesDetailed: [{ pageId: "dashboard", pageLabel: "Dashboard", count: 3, totalMinutesApprox: 16 }],
      topActions: [{ actionKey: "navigate", count: 4 }],
      hourlyBuckets: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        pageEnterCount: hour === 9 ? 4 : 0,
        semanticEventCount: hour === 9 ? 4 : 0,
        totalMinutesApprox: hour === 9 ? 20 : 0,
      })),
    },
    {
      dateKey: "2026-03-11",
      uid: "staffer",
      email: "staff@example.com",
      displayName: "Staff User",
      role: "staff",
      sessionCount: 1,
      totalMinutesApprox: 15,
      pagesVisitedCount: 2,
      pageEnterCount: 3,
      topPagesDetailed: [{ pageId: "people/directory", pageLabel: "People Directory", count: 2, totalMinutesApprox: 12 }],
      topActions: [{ actionKey: "search", count: 2 }],
      hourlyBuckets: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        pageEnterCount: hour === 10 ? 3 : 0,
        semanticEventCount: hour === 10 ? 2 : 0,
        totalMinutesApprox: hour === 10 ? 15 : 0,
      })),
    },
  ];

  it("aggregates trends, patterns, and user summaries for the selected range", () => {
    const model = buildActivityAnalyticsModel({
      appDailyRows,
      pageDailyRows,
      userDailyRows,
      rangeDays: 7,
      now: new Date("2026-03-11T18:00:00Z"),
    });

    expect(model.overview.uniqueUsers).toBe(2);
    expect(model.overview.totalMinutesApprox).toBe(59);
    expect(model.overview.semanticEventCount).toBe(6);
    expect(model.patterns.repeatUsers).toBe(1);
    expect(model.patterns.topActions[0]).toEqual(
      expect.objectContaining({ actionKey: "search", count: 2 }),
    );
    expect(model.patterns.topActions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionKey: "navigate" }),
      ]),
    );
    expect(model.trendRows.find((row) => row.dateKey === "2026-03-11")?.isPartial).toBe(true);
    expect(model.topPages[0]).toEqual(
      expect.objectContaining({ pageLabel: "Dashboard", totalMinutesApprox: 28 }),
    );
    expect(model.aggregatedUsers[0]).toEqual(
      expect.objectContaining({ uid: "staffer", totalMinutesApprox: 35 }),
    );
  });

  it("computes period-over-period deltas, weekday grids, and the pages table", () => {
    const priorWindowAppRow = {
      dateKey: "2026-03-01",
      uniqueUsers: 1,
      sessionCount: 2,
      pageEnterCount: 5,
      semanticEventCount: 0,
      totalMinutesApprox: 30,
      hourlyBuckets: [],
      topActions: [],
      topTransitions: [],
    };
    const priorWindowUserRow = {
      dateKey: "2026-03-01",
      uid: "owner",
      email: "owner@example.com",
      displayName: "Owner",
      role: "admin",
      sessionCount: 2,
      totalMinutesApprox: 30,
      pagesVisitedCount: 2,
      pageEnterCount: 5,
      topPagesDetailed: [],
      topActions: [],
      hourlyBuckets: [],
    };

    const model = buildActivityAnalyticsModel({
      appDailyRows: [...appDailyRows, priorWindowAppRow],
      pageDailyRows,
      userDailyRows: [...userDailyRows, priorWindowUserRow],
      rangeDays: 7,
      lookbackDays: 90,
      now: new Date("2026-03-11T18:00:00Z"),
    });

    // Current window: 59 minutes vs prior window: 30 minutes => +97%
    expect(model.deltas.totalMinutesApprox).toBe(97);
    expect(model.deltas.uniqueUsers).toBe(100);

    // 2026-03-10 is a Tuesday (weekday 2) with its minutes at hour 9.
    expect(model.weekHourGrid[2][9]).toBe(20);
    expect(model.weekdayTotals[2].totalMinutesApprox).toBe(44);
    expect(model.busiestDay).toEqual(
      expect.objectContaining({ dateKey: "2026-03-10", totalMinutesApprox: 44 }),
    );

    // Owner was first seen before the 7-day window; staffer only inside it.
    const staffer = model.aggregatedUsers.find((user) => user.uid === "staffer");
    const owner = model.aggregatedUsers.find((user) => user.uid === "owner");
    expect(staffer.isNewInRange).toBe(true);
    expect(owner.isNewInRange).toBe(false);

    expect(model.pagesTable[0]).toEqual(
      expect.objectContaining({
        pageId: "dashboard",
        totalMinutesApprox: 28,
        pageEnterCount: 5,
        peakDayUsers: 2,
        daysUsed: 1,
        lastUsedDateKey: "2026-03-10",
      }),
    );
  });

  it("omits deltas when the lookback cannot cover a prior window", () => {
    const model = buildActivityAnalyticsModel({
      appDailyRows,
      pageDailyRows,
      userDailyRows,
      rangeDays: 90,
      lookbackDays: 90,
      now: new Date("2026-03-11T18:00:00Z"),
    });
    expect(model.deltas).toBeNull();
  });

  it("builds per-page drilldown data from daily page rollups", () => {
    const drilldown = buildPageDrilldownModel({
      rows: pageDailyRows.filter((row) => row.pageId === "dashboard"),
      rangeDays: 7,
      now: new Date("2026-03-11T18:00:00Z"),
    });

    expect(drilldown.summary.totalMinutesApprox).toBe(28);
    expect(drilldown.summary.pageEnterCount).toBe(5);
    expect(drilldown.summary.peakDayUsers).toBe(2);
    expect(drilldown.summary.daysUsed).toBe(1);
    expect(drilldown.trendRows).toHaveLength(1);
  });

  it("builds per-user drilldown data without scanning raw events", () => {
    const drilldown = buildUserDrilldownModel({
      rows: userDailyRows.filter((row) => row.uid === "staffer"),
      rangeDays: 7,
      now: new Date("2026-03-11T18:00:00Z"),
    });

    expect(drilldown.summary.totalMinutesApprox).toBe(35);
    expect(drilldown.summary.activeDays).toBe(2);
    expect(drilldown.topPages[0]).toEqual(
      expect.objectContaining({ pageLabel: "Dashboard" }),
    );
    expect(drilldown.topActions[0]).toEqual(
      expect.objectContaining({ actionKey: "search", count: 2 }),
    );
    expect(drilldown.trendRows).toHaveLength(2);
  });
});
