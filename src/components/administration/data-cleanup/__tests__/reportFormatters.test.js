import { describe, expect, it } from "vitest";
import {
  DATA_HEALTH_STATES,
  buildDataHealthViewModel,
  summarizeBaselinePreview,
  summarizeBaselineReport,
  summarizeLocationApplyReport,
  summarizeLocationPreview,
  summarizeOrphanCleanup,
  summarizeOrphanScan,
  summarizeTermRepairPreview,
  summarizeTermRepairReport,
} from "../reportFormatters";

describe("report formatters", () => {
  it("builds friendly workflow states", () => {
    expect(
      buildDataHealthViewModel({ isScanning: true }).state,
    ).toBe(DATA_HEALTH_STATES.checking);

    expect(
      buildDataHealthViewModel({
        scanResult: { timestamp: "2026-05-21T12:00:00.000Z" },
        safeFixableCount: 3,
        totalBlockingIssues: 3,
      }).title,
    ).toBe("Routine cleanup available");

    expect(
      buildDataHealthViewModel({
        scanResult: { timestamp: "2026-05-21T12:00:00.000Z" },
        isFixingSafe: true,
      }).title,
    ).toBe("Cleaning up routine items");

    expect(
      buildDataHealthViewModel({
        scanResult: { timestamp: "2026-05-21T12:00:00.000Z" },
        safeFixableCount: 0,
        totalBlockingIssues: 2,
      }).title,
    ).toBe("Needs your choice");

    expect(
      buildDataHealthViewModel({
        scanResult: { timestamp: "2026-05-21T12:00:00.000Z" },
        totalBlockingIssues: 0,
      }).title,
    ).toBe("All clear");

    expect(
      buildDataHealthViewModel({ lastRunError: "Permission denied" }).title,
    ).toBe("Could not finish");
  });

  it("formats full data refresh summary", () => {
    const summary = summarizeBaselineReport({
      summary: {
        totalTermsProcessed: 4,
        totalSchedulesProcessed: 340,
        identityBackfillUpdated: 29,
        blockerCount: 0,
      },
    });

    expect(summary.title).toBe("Full data refresh complete");
    expect(summary.items).toEqual(
      expect.arrayContaining([
        { label: "Terms processed", value: 4 },
        { label: "Schedules processed", value: 340 },
        { label: "Identity updates", value: 29 },
        { label: "Items to review", value: 0 },
      ]),
    );
    expect(summary.nextStep).toMatch(/Full data refresh finished/i);
  });

  it("formats full data refresh preview summary", () => {
    const summary = summarizeBaselinePreview({
      summary: {
        totalTermsProcessed: 4,
        totalSchedulesProcessed: 340,
        identityBackfillWouldUpdate: 29,
        roomsCreated: 3,
        schedulesSpaceRepaired: 12,
        scheduleDuplicatesWouldMerge: 5,
      },
    });

    expect(summary.title).toBe("Full data refresh preview ready");
    expect(summary.items).toEqual(
      expect.arrayContaining([
        { label: "Terms in scope", value: 4 },
        { label: "Schedules in scope", value: 340 },
        { label: "Identity updates planned", value: 29 },
        { label: "Rooms to create", value: 3 },
        { label: "Schedule links to update", value: 12 },
        { label: "Schedule merges planned", value: 5 },
      ]),
    );
  });

  it("formats term refresh summary", () => {
    const summary = summarizeTermRepairReport(
      {
        spaceLinkRepairs: { schedulesUpdated: 17, roomsUpdated: 8 },
        scheduleDuplicatesMerged: 3,
        blockers: [],
      },
      "202610",
    );

    expect(summary.title).toBe("Term refresh complete");
    expect(summary.items).toEqual(
      expect.arrayContaining([
        { label: "Term", value: "202610" },
        { label: "Schedules updated", value: 17 },
        { label: "Rooms updated", value: 8 },
        { label: "Duplicates merged", value: 3 },
      ]),
    );
  });

  it("formats term refresh preview summary", () => {
    const summary = summarizeTermRepairPreview(
      {
        termCodes: ["202610"],
        roomsCreated: 2,
        spaceLinkRepairs: { schedulesUpdated: 17, roomsUpdated: 8 },
        scheduleDuplicatesWouldMerge: 3,
        crossListAutoLink: { schedulesUpdated: 5 },
      },
      "202610",
    );

    expect(summary.title).toBe("Term refresh preview ready");
    expect(summary.items).toEqual(
      expect.arrayContaining([
        { label: "Term", value: "202610" },
        { label: "Rooms to create", value: 2 },
        { label: "Schedule links to update", value: 17 },
        { label: "Room entries to refresh", value: 8 },
        { label: "Schedule merges planned", value: 3 },
        { label: "Cross-list links to update", value: 5 },
      ]),
    );
  });

  it("formats location preview and apply summaries", () => {
    const previewSummary = summarizeLocationPreview({
      rooms: {
        missingSpaceKey: [{ id: "a" }, { id: "b" }],
        invalidSpaceKey: [{ id: "r1" }],
      },
      schedules: { missingSpaceIds: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] },
      people: { missingOfficeSpaceId: [{ id: "p1" }] },
    });

    expect(previewSummary.title).toBe("Room link preview ready");
    expect(previewSummary.items).toEqual(
      expect.arrayContaining([
        { label: "Rooms missing keys", value: 2 },
        { label: "Invalid room keys", value: 1 },
        { label: "Schedules missing room IDs", value: 3 },
        { label: "People missing office room IDs", value: 1 },
      ]),
    );

    const applySummary = summarizeLocationApplyReport({
      roomsUpdated: 11,
      roomsSeeded: 2,
      schedulesUpdated: 23,
      peopleUpdated: 4,
      errors: [],
    });

    expect(applySummary.title).toBe("Room link update complete");
    expect(applySummary.items).toEqual(
      expect.arrayContaining([
        { label: "Rooms updated", value: 11 },
        { label: "Rooms created", value: 2 },
        { label: "Schedules updated", value: 23 },
        { label: "People updated", value: 4 },
      ]),
    );
  });

  it("formats unused imported item scan and cleanup summaries", () => {
    const scanSummary = summarizeOrphanScan(
      {
        schedules: [{ id: "s1" }],
        people: [{ id: "p1" }, { id: "p2" }],
        rooms: [],
        total: 3,
      },
      "Spring 2026",
    );

    expect(scanSummary.title).toBe("Unused imported items check complete");
    expect(scanSummary.items).toEqual(
      expect.arrayContaining([
        { label: "Term", value: "Spring 2026" },
        { label: "Unused classes", value: 1 },
        { label: "Unused people", value: 2 },
        { label: "Unused rooms", value: 0 },
        { label: "Total items", value: 3 },
      ]),
    );

    const cleanupSummary = summarizeOrphanCleanup(
      { deleted: 3, errors: 0 },
      "Spring 2026",
    );

    expect(cleanupSummary.title).toBe("Unused imported items removed");
    expect(cleanupSummary.items).toEqual(
      expect.arrayContaining([
        { label: "Term", value: "Spring 2026" },
        { label: "Removed items", value: 3 },
        { label: "Errors", value: 0 },
      ]),
    );
  });
});
