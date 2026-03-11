// @vitest-environment node
import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { rollupActivityForDateKeys } = require("../activityAnalytics");

describe("rollupActivityForDateKeys", () => {
  const events = [
    {
      id: "e1",
      uid: "owner",
      email: "owner@example.com",
      displayName: "Owner",
      role: "admin",
      sessionId: "s1",
      eventType: "page_enter",
      actionKey: "navigate",
      pageId: "dashboard",
      pageLabel: "Dashboard",
      sectionLabel: "Home",
      timestamp: new Date("2026-03-10T14:00:00Z"),
    },
    {
      id: "e2",
      uid: "owner",
      email: "owner@example.com",
      displayName: "Owner",
      role: "admin",
      sessionId: "s1",
      eventType: "action",
      actionKey: "search",
      pageId: "dashboard",
      pageLabel: "Dashboard",
      sectionLabel: "Home",
      timestamp: new Date("2026-03-10T14:03:00Z"),
    },
    {
      id: "e3",
      uid: "owner",
      email: "owner@example.com",
      displayName: "Owner",
      role: "admin",
      sessionId: "s1",
      eventType: "page_enter",
      actionKey: "navigate",
      pageId: "people/directory",
      pageLabel: "People Directory",
      sectionLabel: "People",
      timestamp: new Date("2026-03-10T14:08:00Z"),
    },
    {
      id: "e4",
      uid: "staffer",
      email: "staff@example.com",
      displayName: "Staff User",
      role: "staff",
      sessionId: "s2",
      eventType: "page_enter",
      actionKey: "navigate",
      pageId: "dashboard",
      pageLabel: "Dashboard",
      sectionLabel: "Home",
      timestamp: new Date("2026-03-10T15:00:00Z"),
    },
    {
      id: "e5",
      uid: "staffer",
      email: "staff@example.com",
      displayName: "Staff User",
      role: "staff",
      sessionId: "s2",
      eventType: "page_enter",
      actionKey: "navigate",
      pageId: "admin/settings",
      pageLabel: "App Settings",
      sectionLabel: "Administration",
      timestamp: new Date("2026-03-10T16:10:00Z"),
    },
    {
      id: "e6",
      uid: "staffer",
      email: "staff@example.com",
      displayName: "Staff User",
      role: "staff",
      sessionId: "s2",
      eventType: "action",
      actionKey: "save",
      pageId: "admin/settings",
      pageLabel: "App Settings",
      sectionLabel: "Administration",
      timestamp: new Date("2026-03-10T16:12:00Z"),
    },
  ];

  it("builds app, page, and user summaries from raw events", () => {
    const [result] = rollupActivityForDateKeys(events, ["2026-03-10"]);

    expect(result.analyticsDoc.dateKey).toBe("2026-03-10");
    expect(result.analyticsDoc.uniqueUsers).toBe(2);
    expect(result.analyticsDoc.sessionCount).toBe(2);
    expect(result.analyticsDoc.pageEnterCount).toBe(4);
    expect(result.analyticsDoc.totalMinutesApprox).toBe(40);
    expect(result.analyticsDoc.topActions[0].actionKey).toBe("navigate");
    expect(result.analyticsDoc.topTransitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromPageId: "dashboard",
          toPageId: "people/directory",
          count: 1,
        }),
        expect.objectContaining({
          fromPageId: "dashboard",
          toPageId: "admin/settings",
          count: 1,
        }),
      ]),
    );

    expect(result.pageDocs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: "dashboard",
          uniqueUsers: 2,
          pageEnterCount: 2,
          totalMinutesApprox: 38,
        }),
      ]),
    );

    expect(result.userDocs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uid: "owner",
          pagesVisitedCount: 2,
          totalMinutesApprox: 9,
          topPagesDetailed: expect.arrayContaining([
            expect.objectContaining({
              pageId: "dashboard",
              totalMinutesApprox: 8,
            }),
          ]),
        }),
      ]),
    );
  });

  it("is deterministic for repeated rebuilds of the same date range", () => {
    const first = rollupActivityForDateKeys(events, ["2026-03-10"]);
    const second = rollupActivityForDateKeys(events, ["2026-03-10"]);
    expect(second).toEqual(first);
  });
});
