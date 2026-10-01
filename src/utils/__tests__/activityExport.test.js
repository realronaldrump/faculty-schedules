import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
vi.mock("../../firebase", () => ({ db: {} }));
import { buildActivityExport, createActivityExportArchive, serializeActivityRecord } from "../activityExport";
import { createActivityExportWriter, utf8Bytes } from "../activityExportFiles";
import { parseCSVRecords } from "../csvUtils";

const page = {
  pageId: "scheduling/room-grids", pageLabel: "Room Grids", sectionLabel: "Scheduling",
  pageEnterCount: 3, trackedPageEnterCount: 3, semanticEventCount: 2,
  totalMinutesApprox: 10, measuredMinutes: 10,
  topActions: [{ actionKey: "schedule_pdf_exported", count: 2 }],
  hourlyBuckets: [{ hour: 9, pageEnterCount: 3, semanticEventCount: 2, totalMinutesApprox: 10 }],
};
const row = {
  id: "2026-09-30_staff", uid: "staff", displayName: "Staff Person", email: "staff@example.test", role: "staff",
  dateKey: "2026-09-30", schemaVersion: 3, monitoringVersion: 1,
  pageEnterCount: 5, trackedPageEnterCount: 5, semanticEventCount: 2,
  totalMinutesApprox: 12, measuredMinutes: 12, sessionCount: 1, sessionIds: ["staff_session"],
  firstSeenAt: "2026-09-30T14:00:00Z", lastSeenAt: "2026-09-30T15:00:00Z",
  pageCounts: { room: page },
  topPagesDetailed: [page, { ...page, pageId: "dashboard", pageLabel: "Dashboard", pageEnterCount: 2, totalMinutesApprox: 2, semanticEventCount: 0 }],
  topActions: page.topActions, hourlyBuckets: page.hourlyBuckets,
  topTransitions: [{ fromPageId: "dashboard", toPageId: page.pageId, count: 3 }],
  failureCounts: { save: { pageId: page.pageId, workflow: "schedule_save", errorCode: "permission-denied", count: 2, lastSeenAt: "2026-09-30T14:02:00Z" } },
};
const event = { id: "evt-1", uid: "staff", email: row.email, displayName: row.displayName, role: "staff", sessionId: "staff_session",
  timestamp: "2026-09-30T14:00:00Z", eventType: "page_enter", pageId: page.pageId, previousPageId: "dashboard", metadata: { source: "route-change" } };
const coverage = { complete: true, stopReason: "exhausted", extraReadBudget: 2000, requestedDocumentLimit: 0,
  documentsFetched: 0, queriesAttempted: 0, emptyQueries: 0 };
const options = (patch = {}) => ({
  summaries: { userDailyRows: [row, { ...row, uid: "owner", displayName: "Excluded Owner", email: "owner@example.test" }] },
  history: { rows: [event, { ...event, id: "evt-owner", uid: "owner" }], coverage },
  presence: [{ uid: "staff", currentPageId: page.pageId, updatedAt: "2026-09-30T15:00:00Z" }, { uid: "owner", currentPageId: "dashboard" }],
  tutorials: [{ uid: "staff", tutorials: { intro: { status: "completed", currentStepIndex: 3, totalSteps: 4, completedAt: "2026-09-20T12:00:00Z" } } }, { uid: "owner", tutorials: {} }],
  scope: { startDateKey: "2026-09-29", endDateKey: "2026-09-30", ownerUid: "owner", excludeOwner: true, person: "", feature: "" },
  generatedAt: new Date("2026-09-30T16:00:00Z"),
  sourceUpdatedAt: { todaySummary: new Date("2026-09-30T15:59:00Z"), tutorials: new Date("2026-09-30T15:58:00Z") },
  ...patch,
});
const records = (built, name) => built.files.filter((file) => file.path.startsWith(`records/${name}.`))
  .flatMap((file) => file.content.trim() ? file.content.trim().split("\n").map(JSON.parse) : []);
const table = (built, name) => built.files.filter((file) => file.path.startsWith(`tables/${name}.`)).flatMap((file) => {
  const [columns, ...rows] = parseCSVRecords(file.content.trim());
  return rows.map((cells) => Object.fromEntries(columns.map((column, i) => [column, cells[i]])));
});

describe("detailed activity export", () => {
  it("preserves detailed data, identifiers and metadata while excluding the owner in every dataset", () => {
    const built = buildActivityExport(options());
    expect(built.summary).toMatchObject({ peopleWithSummaries: 1, userDayRows: 1, page_entries: 5, semantic_actions: 2, visible_minutes: 12, estimated_minutes: 0, eventsExported: 1 });
    expect(records(built, "user_daily")[0]).toMatchObject({ pageCounts: { room: page }, sessionIds: ["staff_session"] });
    expect(records(built, "events")[0]).toMatchObject({ id: "evt-1", previousPageId: "dashboard", hourCentral: 9, metadata: { source: "route-change" } });
    expect(built.files.map((file) => file.content).join("\n")).not.toContain("owner@example.test");
    expect(records(built, "presence")).toHaveLength(1);
    expect(table(built, "tutorials")[0].completed_at).toBe("2026-09-20T12:00:00.000Z");
    expect(built.manifest.consistency).toContain("current snapshots");
    expect(built.manifest.resourceLimits).toMatchObject({ databaseWritesByExport: 0, externalServiceCallsByExport: 0 });
  });
  it("scopes feature totals, actions, hours and raw events without leaking unrelated daily counts", () => {
    const base = options();
    const built = buildActivityExport({ ...base, scope: { ...base.scope, feature: page.pageId },
      history: { rows: [event, { ...event, id: "dashboard-event", pageId: "dashboard" }], coverage } });
    expect(built.summary).toMatchObject({ page_entries: 3, semantic_actions: 2, visible_minutes: 10, eventsExported: 1 });
    const dailyRow = records(built, "user_daily")[0];
    expect(dailyRow.topPagesDetailed).toEqual([page]);
    expect(dailyRow.pageCounts).toBeUndefined();
    expect(dailyRow.sessionCount).toBeNull();
    expect(dailyRow.lastSeenAt).toBeUndefined();
    expect(dailyRow.userDayLastSeenAt).toBe("2026-09-30T15:00:00Z");
    expect(table(built, "user_features_daily")).toHaveLength(1);
    expect(table(built, "hours")[0].visible_minutes).toBe("10");
    expect(table(built, "visits")[0].may_be_partial).toBe("true");
    expect(built.manifest.warnings.join(" ")).toContain("surrounding events");
  });
  it("keeps measured time, legacy estimates and unavailable schema-2 time separate", () => {
    const built = buildActivityExport(options({ summaries: { userDailyRows: [row,
      { ...row, uid: "legacy", schemaVersion: 1, totalMinutesApprox: 8 },
      { ...row, uid: "v2", schemaVersion: 2, totalMinutesApprox: 900 },
    ] } }));
    expect(built.summary).toMatchObject({ visible_minutes: 12, estimated_minutes: 8, unavailable_duration_rows: 1 });
    expect(table(built, "user_daily").find((item) => item.uid === "v2")).toMatchObject({ duration_kind: "unavailable", visible_minutes: "", estimated_minutes: "" });
    expect(table(built, "daily")[0]).toMatchObject({ summary_rows: "0", no_summary_rows: "true", is_current_day: "false" });
  });
  it("does not double-count failure events that also appear in summaries", () => {
    const failures = Array.from({ length: 3 }, (_, i) => ({ ...event, id: `error-${i}`, eventType: "error",
      timestamp: `2026-09-30T14:0${i}:00Z`, metadata: { workflow: "schedule_save", errorCode: "permission-denied" } }));
    const built = buildActivityExport(options({ history: { rows: [event, ...failures], coverage } }));
    expect(table(built, "failures_daily")[0]).toMatchObject({ summary_reports: "2", event_reports: "3", recorded_reports: "3" });
    expect(built.summary.recordedFailures).toBe(3);
  });
  it("makes partial history and stale sources explicit, while sanitizing private error messages", () => {
    const built = buildActivityExport(options({ history: { rows: [event], coverage: { ...coverage, complete: false, stopReason: "read-budget" } },
      errors: { summaries: "private error details" } }));
    expect(built.summary.eventHistoryComplete).toBe(false);
    expect(built.manifest.warnings.join(" ")).toContain("read-budget");
    expect(built.manifest.warnings.join(" ")).toContain("summaries did not refresh");
    expect(built.files.map((file) => file.content).join(" ")).not.toContain("private error details");
    expect(built.manifest.freshness.tutorials).toBe("2026-09-30T15:58:00.000Z");
  });
  it("normalizes nested timestamps and redacts secrets without losing arbitrary safe metadata", () => {
    const timestamp = { toDate: () => new Date("2026-09-30T14:00:00Z") };
    const redactions = { count: 0 };
    expect(serializeActivityRecord({ created: timestamp, metadata: { count: 12, token: "sensitive", nested: [{ at: timestamp, cookie: "sensitive", useful: true }] } }, redactions))
      .toEqual({ created: "2026-09-30T14:00:00.000Z", metadata: { count: 12, nested: [{ at: "2026-09-30T14:00:00.000Z", useful: true }] } });
    expect(redactions.count).toBe(2);
    const built = buildActivityExport(options({ history: { rows: [{ ...event, metadata: { useful: "retained", apiKey: "never-export-this" } }], coverage } }));
    expect(records(built, "events")[0].metadata).toEqual({ useful: "retained" });
    expect(built.manifest.privacy.sensitiveFieldsRedacted).toBe(1);
    expect(built.files.map((file) => file.content).join("\n")).not.toContain("never-export-this");
  });
  it("retains source event nanoseconds and orders submillisecond events correctly", () => {
    const seconds = Date.parse("2026-09-30T14:00:00Z") / 1000;
    const timestamp = (nanoseconds) => ({ seconds, nanoseconds,
      toDate: () => new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000)) });
    const built = buildActivityExport(options({ history: { rows: [
      { ...event, id: "a-later", timestamp: timestamp(200) },
      { ...event, id: "z-earlier", timestamp: timestamp(100) },
    ], coverage } }));
    expect(records(built, "events").map((item) => item.id)).toEqual(["z-earlier", "a-later"]);
    expect(table(built, "events")[0]).toMatchObject({ timestamp_seconds: String(seconds), timestamp_nanoseconds: "100" });
  });
  it("preserves text in JSONL and protects spreadsheet formulas in CSV", () => {
    const built = buildActivityExport(options({ history: { rows: [{ ...event, displayName: '=HYPERLINK("example")', metadata: { text: "comma, newline\n雪" } }], coverage } }));
    expect(records(built, "events")[0].displayName).toBe('=HYPERLINK("example")');
    expect(table(built, "events")[0].display_name).toBe('\'=HYPERLINK("example")');
    expect(JSON.parse(table(built, "events")[0].metadata_json)).toEqual({ text: "comma, newline\n雪" });
  });
  it("uses Central days around daylight saving and keeps since timestamps distinct from daily totals", () => {
    const base = options();
    const events = ["2026-11-01T06:30:00Z", "2026-11-01T07:30:00Z"].map((timestamp, i) => ({ ...event, id: `dst-${i}`, timestamp }));
    const built = buildActivityExport({ ...base, summaries: { userDailyRows: [{ ...row, dateKey: "2026-11-01" }] }, history: { rows: events, coverage },
      scope: { ...base.scope, startDateKey: "2026-11-01", endDateKey: "2026-11-01", sinceMs: Date.parse("2026-11-01T07:00:00Z") },
      generatedAt: new Date("2026-11-01T12:00:00Z") });
    expect(records(built, "events")).toMatchObject([{ id: "dst-1", dateKey: "2026-11-01", hourCentral: 1 }]);
    expect(built.summary.page_entries).toBe(5);
    expect(built.manifest.warnings.join(" ")).toContain("full first day");
  });
  it("deduplicates overlapping events and user-days and does not mutate the source", () => {
    const base = options();
    const before = JSON.stringify(base);
    const built = buildActivityExport({ ...base, summaries: { userDailyRows: [row, row] }, history: { rows: [event, event], coverage } });
    expect(built.summary).toMatchObject({ userDayRows: 1, eventsExported: 1, page_entries: 5 });
    expect(JSON.stringify(base)).toBe(before);
  });
  it("preserves summary-only users and flags missing legacy feature details", () => {
    const built = buildActivityExport(options({ summaries: { userDailyRows: [{ ...row, topPagesDetailed: [] }] },
      history: { rows: [], coverage } }));
    expect(table(built, "users")[0].uid).toBe("staff");
    expect(built.summary).toMatchObject({ missingFeatureDetailRows: 1, userDayRows: 1 });
    expect(built.manifest.warnings.join(" ")).toContain("lack feature details");
    expect(records(built, "events")).toEqual([]);
  });
  it("creates a readable ZIP whose datasets match the manifest", async () => {
    const result = await createActivityExportArchive(options(), { type: "uint8array" });
    const zip = await JSZip.loadAsync(result.blob);
    const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
    for (const file of manifest.files) {
      const content = await zip.file(file.path).async("string");
      expect(utf8Bytes(content)).toBe(file.bytes);
      if (file.format === "jsonl") expect(content.trim() ? content.trim().split("\n").length : 0).toBe(file.rowCount);
      if (file.format === "csv") expect(parseCSVRecords(content.trim()).length - 1).toBe(file.rowCount);
    }
    expect(result.filename).toMatch(/^user-activity_2026-09-29_2026-09-30_.*\.zip$/);
    expect(zip.file("review_prompt.txt")).toBeTruthy();
  });
});

describe("export file size limits", () => {
  it("chunks multibyte JSONL on record boundaries and repeats headers in every CSV part", () => {
    const writer = createActivityExportWriter({ partBytes: 95 });
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i, text: "雪☀️".repeat(3) }));
    writer.addDataset("unicode", rows);
    writer.addDataset("unicode", rows, ["id", "text"]);
    expect(writer.files.filter((file) => file.format === "jsonl").length).toBeGreaterThan(1);
    expect(writer.files.every((file) => file.bytes <= 95)).toBe(true);
    expect(writer.files.filter((file) => file.format === "jsonl").flatMap((file) => file.content.trim().split("\n").map(JSON.parse))).toEqual(rows);
    for (const file of writer.files.filter((item) => item.format === "csv"))
      expect(parseCSVRecords(file.content)[0]).toEqual(["id", "text"]);
  });
  it("fails oversized records or archives without silently truncating", () => {
    const writer = createActivityExportWriter({ partBytes: 40, maxBytes: 50 });
    expect(() => writer.addDataset("too-large", [{ text: "x".repeat(45) }])).toThrow(/record is too large/);
    writer.addFile("first.txt", "x".repeat(40));
    expect(() => writer.addFile("second.txt", "x".repeat(11))).toThrow(/export is too large/);
    expect(writer.files).toHaveLength(1);
  });
});
