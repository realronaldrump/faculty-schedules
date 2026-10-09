import { describe, expect, it } from "vitest";
import {
  actionLabel,
  buildUsageModel,
  buildVisits,
  collapseVisitEvents,
  filterVisits,
  getExplorerWindow,
  mergeEventPages,
} from "../activityExplorer";

const page = (pageId, pageEnterCount, totalMinutesApprox = 0) => ({
  pageId,
  pageLabel: pageId,
  pageEnterCount,
  totalMinutesApprox,
  topActions: [],
});
const rows = [
  {
    uid: "staff",
    displayName: "Staff",
    dateKey: "2026-09-08",
    pageEnterCount: 3,
    totalMinutesApprox: 12,
    lastSeenAt: "2026-09-08T14:00:00Z",
    topPagesDetailed: [page("dashboard", 1, 2), page("room-grids", 2, 10)],
  },
  {
    uid: "staff",
    displayName: "Staff",
    dateKey: "2026-09-09",
    pageEnterCount: 4,
    totalMinutesApprox: 20,
    lastSeenAt: "2026-09-09T14:00:00Z",
    topPagesDetailed: [page("room-grids", 4, 20)],
  },
  {
    uid: "other",
    displayName: "Other",
    dateKey: "2026-09-09",
    pageEnterCount: 2,
    totalMinutesApprox: 7,
    lastSeenAt: "2026-09-09T15:00:00Z",
    topPagesDetailed: [page("room-grids", 2, 7)],
  },
  {
    uid: "owner",
    displayName: "Owner",
    dateKey: "2026-09-10",
    pageEnterCount: 99,
    totalMinutesApprox: 100,
    topPagesDetailed: [page("admin/user-activity", 99, 100)],
  },
];
const options = {
  rows,
  ownerUid: "owner",
  startDateKey: "2026-09-07",
  endDateKey: "2026-09-10",
};
const event = (id, uid, time, pageId = "dashboard", extra = {}) => ({
  id,
  uid,
  displayName: uid,
  sessionId: uid,
  timestamp: `2026-09-09T${time}:00Z`,
  eventType: "page_enter",
  pageId,
  ...extra,
});

describe("activity exploration", () => {
  it("reconciles independently stored failures without double-counting timeline and daily reports", () => {
    const failure = {
      pageId: "room-grids",
      workflow: "pdf_export",
      errorCode: "unexpected",
      count: 2,
      lastSeenAt: "2026-09-09T14:00:00Z",
    };
    const reported = event("error", "staff", "14:00", "room-grids", {
      eventType: "error",
      metadata: { workflow: "pdf_export", errorCode: "unexpected" },
    });
    const model = buildUsageModel({
      ...options,
      rows: [{ ...rows[1], failureCounts: { error: failure } }],
      events: [reported, reported],
    });
    expect(model.failures[0].count).toBe(2);
    const eventOnly = buildUsageModel({
      ...options,
      rows: [],
      events: [reported],
    });
    expect(eventOnly.failures[0].count).toBe(1);
    expect(eventOnly.failures[0].people.has("staff")).toBe(true);
  });
  it("excludes the owner consistently and computes distinct people, features and calendar days", () => {
    const model = buildUsageModel(options);
    expect(model.people).toHaveLength(2);
    expect(model.features).toHaveLength(2);
    expect(model.activeDays).toBe(2);
    expect(model.pageViews).toBe(9);
    expect(model.minutes).toBe(39);
    expect(
      model.features.find((item) => item.id === "room-grids"),
    ).toMatchObject({ activeDays: 2, peopleCount: 2, pageViews: 8 });
    expect(model.people.find((item) => item.id === "staff").featureCount).toBe(
      2,
    );
    expect(buildUsageModel({ ...options, excludeOwner: false }).pageViews).toBe(
      108,
    );
  });
  it("filters feature and person totals together, without using app-wide values", () => {
    const model = buildUsageModel({
      ...options,
      person: "staff",
      feature: "room-grids",
    });
    expect(model.pageViews).toBe(6);
    expect(model.minutes).toBe(30);
    expect(model.people).toHaveLength(1);
    expect(model.features).toHaveLength(1);
  });
  it("includes every calendar date and leaves the current day partial", () => {
    expect(
      buildUsageModel(options).trendRows.map((row) => [
        row.dateKey,
        row.uniqueUsers,
        row.isPartial,
      ]),
    ).toEqual([
      ["2026-09-07", 0, false],
      ["2026-09-08", 1, false],
      ["2026-09-09", 2, false],
      ["2026-09-10", 0, true],
    ]);
  });
  it("uses the latest timestamp regardless of daily row order", () => {
    const model = buildUsageModel({ ...options, rows: [...rows].reverse() });
    expect(model.people.find((item) => item.id === "staff").lastSeenAt).toBe(
      "2026-09-09T14:00:00Z",
    );
  });
  it("groups failures from complete daily summaries even when their events are not loaded", () => {
    const failure = {
      pageId: "room-grids",
      workflow: "pdf_export",
      errorCode: "unexpected",
      count: 2,
      lastSeenAt: "2026-09-09T14:00:00Z",
    };
    const model = buildUsageModel({
      ...options,
      rows: [
        { ...rows[1], monitoringVersion: 1, failureCounts: { error: failure } },
        { ...rows[2], monitoringVersion: 1, failureCounts: { error: failure } },
      ],
    });
    expect(model.failures[0].count).toBe(4);
    expect(model.failures[0].people.size).toBe(2);
    expect(model.reportingPeople).toBe(2);
  });
  it("splits long-lived browser sessions into visits without mixing people", () => {
    const visits = buildVisits([
      event("a", "staff", "14:00"),
      event("b", "other", "14:02"),
      event("c", "staff", "14:04", "room-grids"),
      event("d", "staff", "15:00"),
      event("e", "staff", "15:02", "room-grids", { sessionId: "new-tab" }),
    ]);
    expect(visits).toHaveLength(4);
    expect(
      visits.find((visit) => visit.id === "a").events.map((item) => item.id),
    ).toEqual(["a", "c"]);
  });
  it("retains navigation context when a visit matches an action filter", () => {
    const visits = buildVisits([
      event("a", "staff", "14:00"),
      event("b", "staff", "14:01", "room-grids"),
      event("c", "staff", "14:02", "room-grids", {
        eventType: "action",
        actionKey: "schedule_pdf_exported",
      }),
    ]);
    const filtered = filterVisits(visits, {
      feature: "room-grids",
      kind: "actions",
      search: "print dialog",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].events).toHaveLength(3);
    expect(filterVisits(visits, { kind: "errors" })).toHaveLength(0);
  });
  it("honors exact last-visit time, owner exclusion, and history boundaries", () => {
    const visits = buildVisits(
      [
        event("a", "staff", "14:00"),
        event("b", "staff", "14:02"),
        event("c", "owner", "14:03"),
      ],
      {
        sinceMs: Date.parse("2026-09-09T14:01:00Z"),
        ownerUid: "owner",
        hasMore: true,
      },
    );
    expect(visits).toHaveLength(1);
    expect(visits[0].events).toHaveLength(1);
    expect(visits[0].partial).toBe(true);
  });
  it("collapses only consecutive matching events and merges overlapping pagination safely", () => {
    const visits = buildVisits([
      event("a", "staff", "14:00"),
      event("b", "staff", "14:01"),
      event("c", "staff", "14:02", "room-grids"),
    ]);
    expect(
      collapseVisitEvents(visits[0].events).map((group) => group.count),
    ).toEqual([2, 1]);
    expect(
      mergeEventPages([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]),
    ).toHaveLength(3);
  });
  it("keeps old since-last-visit and all-time windows unclipped and uses truthful action labels", () => {
    const now = new Date("2026-09-10T18:00:00Z");
    expect(getExplorerWindow("since", "2026-01-15T15:00:00Z", now)).toMatchObject({
      startDateKey: "2026-01-15",
      since: true,
      sinceMs: Date.parse("2026-01-15T15:00:00Z"),
    });
    expect(getExplorerWindow("all", "", now)).toMatchObject({
      startDateKey: "2026-01-01",
      endDateKey: "2026-09-10",
      allTime: true,
    });
    expect(actionLabel("schedule_pdf_exported")).toBe(
      "Opened the PDF print dialog",
    );
    expect(actionLabel("update_courses")).toBe("Updated courses");
  });
});
