import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../firebase", () => ({ db: {} }));
import { collectActivityExportHistory } from "../activityExportHistory";

describe("bounded activity export pagination", () => {
  let loadPage;
  const options = () => ({ history: { rows: [{ id: "newest" }], loaded: true, hasMore: true, cursor: { id: "cursor" } },
    startDateKey: "2026-09-01", endDateKey: "2026-09-30", loadPage });
  beforeEach(() => { loadPage = vi.fn(); });
  it("uses loaded records without any read when history is exhausted", async () => {
    const result = await collectActivityExportHistory({ ...options(), history: { rows: [{ id: "a" }], loaded: true, hasMore: false } });
    expect(loadPage).not.toHaveBeenCalled();
    expect(result.coverage).toMatchObject({ complete: true, documentsFetched: 0, requestedDocumentLimit: 0 });
  });
  it("never requests more than the budget, even on a final partial-size query", async () => {
    loadPage.mockImplementation(async ({ pageSize, cursor }) => ({
      rows: Array.from({ length: pageSize }, (_, i) => ({ id: `${cursor.id}-${i}` })), cursor: { id: `${cursor.id}-next` }, hasMore: true,
    }));
    const result = await collectActivityExportHistory({ ...options(), readBudget: 250 });
    expect(loadPage.mock.calls.map(([call]) => call.pageSize)).toEqual([200, 50]);
    expect(result.coverage).toMatchObject({ complete: false, stopReason: "read-budget", requestedDocumentLimit: 250, documentsFetched: 250 });
    expect(result.rows).toHaveLength(251);
  });
  it("requires an exhausted page before claiming full coverage and deduplicates overlap", async () => {
    loadPage.mockResolvedValue({ rows: [{ id: "newest" }, { id: "older" }], cursor: null, hasMore: false });
    const result = await collectActivityExportHistory(options());
    expect(result.rows).toHaveLength(2);
    expect(result.coverage.complete).toBe(true);
  });
  it("accounts for an empty query and keeps failures explicit without private messages", async () => {
    loadPage.mockResolvedValueOnce({ rows: [], hasMore: false, cursor: null });
    expect((await collectActivityExportHistory(options())).coverage).toMatchObject({ emptyQueries: 1, queriesAttempted: 1 });
    loadPage.mockRejectedValueOnce({ code: "resource-exhausted", message: "private details" });
    const result = await collectActivityExportHistory(options());
    expect(result.coverage).toMatchObject({ complete: false, stopReason: "read-error", errorCode: "resource-exhausted", queriesAttempted: 1 });
    expect(JSON.stringify(result)).not.toContain("private details");
  });
  it("retains successful pages when a later request fails", async () => {
    const onPage = vi.fn();
    loadPage.mockResolvedValueOnce({ rows: [{ id: "older" }], cursor: { id: "older" }, hasMore: true })
      .mockRejectedValueOnce({ code: "permission-denied" });
    const result = await collectActivityExportHistory({ ...options(), onPage });
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(result.rows.map((row) => row.id)).toEqual(["newest", "older"]);
    expect(result.coverage.complete).toBe(false);
  });
  it("stops a stalled cursor instead of looping or claiming complete history", async () => {
    loadPage.mockResolvedValue({ rows: [{ id: "newest" }], cursor: { id: "cursor" }, hasMore: true });
    const result = await collectActivityExportHistory(options());
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(result.coverage.errorCode).toBe("pagination-stalled");
  });
  it("cancels after an in-flight read and does not expose stale data to a new period", async () => {
    let cancelled = false;
    const onPage = vi.fn();
    loadPage.mockImplementation(async () => { cancelled = true; return { rows: [], hasMore: false }; });
    await expect(collectActivityExportHistory({ ...options(), onPage, isCancelled: () => cancelled })).rejects.toMatchObject({ name: "AbortError" });
    expect(onPage).not.toHaveBeenCalled();
  });
  it("can export just the loaded data and rejects excessive budgets", async () => {
    const result = await collectActivityExportHistory({ ...options(), readBudget: 0 });
    expect(result.coverage).toMatchObject({ complete: false, stopReason: "read-budget" });
    expect(loadPage).not.toHaveBeenCalled();
    await expect(collectActivityExportHistory({ ...options(), readBudget: 2001 })).rejects.toThrow(/budget/);
  });
});
