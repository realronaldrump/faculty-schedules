import { describe, expect, it } from "vitest";
import {
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
  it("formats baseline summary", () => {
    const summary = summarizeBaselineReport({
      summary: {
        totalTermsProcessed: 4,
        totalSchedulesProcessed: 340,
        identityBackfillUpdated: 29,
        blockerCount: 0,
      },
    });

    expect(summary.title).toBe("Baseline repair complete");
    expect(summary.items).toEqual(
      expect.arrayContaining([
        { label: "Terms processed", value: 4 },
        { label: "Schedules processed", value: 340 },
        { label: "Identity repairs", value: 29 },
        { label: "Blockers", value: 0 },
      ]),
    );
    expect(summary.nextStep).toMatch(/Baseline is clean/i);
  });

  it("formats baseline preview summary", () => {
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

    expect(summary.title).toBe("Baseline preview ready");
    expect(summary.items).toEqual(
      expect.arrayContaining([
        { label: "Terms in scope", value: 4 },
        { label: "Schedules in scope", value: 340 },
        { label: "Identity updates planned", value: 29 },
        { label: "Rooms to create", value: 3 },
        { label: "Schedule links to repair", value: 12 },
        { label: "Schedule merges planned", value: 5 },
      ]),
    );
  });

  it("formats term repair summary", () => {
    const summary = summarizeTermRepairReport(
      {
        spaceLinkRepairs: { schedulesUpdated: 17, roomsUpdated: 8 },
        scheduleDuplicatesMerged: 3,
        blockers: [],
      },
      "202610",
    );

    expect(summary.title).toBe("Term repair complete");
    expect(summary.items).toEqual(
      expect.arrayContaining([
        { label: "Term", value: "202610" },
        { label: "Schedules updated", value: 17 },
        { label: "Rooms updated", value: 8 },
        { label: "Duplicates merged", value: 3 },
      ]),
    );
  });

  it("formats term repair preview summary", () => {
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

    expect(summary.title).toBe("Term repair preview ready");
    expect(summary.items).toEqual(
      expect.arrayContaining([
        { label: "Term", value: "202610" },
        { label: "Rooms to create", value: 2 },
        { label: "Schedule links to repair", value: 17 },
        { label: "Room records to normalize", value: 8 },
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

    expect(previewSummary.title).toBe("Location preview ready");
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

    expect(applySummary.title).toBe("Location migration complete");
    expect(applySummary.items).toEqual(
      expect.arrayContaining([
        { label: "Rooms updated", value: 11 },
        { label: "Rooms created", value: 2 },
        { label: "Schedules updated", value: 23 },
        { label: "People updated", value: 4 },
      ]),
    );
  });

  it("formats orphan scan and cleanup summaries", () => {
    const scanSummary = summarizeOrphanScan(
      {
        schedules: [{ id: "s1" }],
        people: [{ id: "p1" }, { id: "p2" }],
        rooms: [],
        total: 3,
      },
      "Spring 2026",
    );

    expect(scanSummary.title).toBe("Orphan scan complete");
    expect(scanSummary.items).toEqual(
      expect.arrayContaining([
        { label: "Term", value: "Spring 2026" },
        { label: "Orphaned schedules", value: 1 },
        { label: "Orphaned people", value: 2 },
        { label: "Orphaned rooms", value: 0 },
        { label: "Total records", value: 3 },
      ]),
    );

    const cleanupSummary = summarizeOrphanCleanup(
      { deleted: 3, errors: 0 },
      "Spring 2026",
    );

    expect(cleanupSummary.title).toBe("Orphan cleanup complete");
    expect(cleanupSummary.items).toEqual(
      expect.arrayContaining([
        { label: "Term", value: "Spring 2026" },
        { label: "Deleted records", value: 3 },
        { label: "Errors", value: 0 },
      ]),
    );
  });
});
