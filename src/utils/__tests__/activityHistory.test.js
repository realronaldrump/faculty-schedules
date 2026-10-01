import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDocs: vi.fn() }));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_, name) => name,
  getDocs: (...args) => mocks.getDocs(...args),
  query: (...args) => args,
  where: (...args) => ({ where: args }),
  orderBy: (...args) => ({ orderBy: args }),
  startAfter: (cursor) => ({ startAfter: cursor }),
  limit: (count) => ({ limit: count }),
}));
import {
  ACTIVITY_HISTORY_PAGE_SIZE,
  loadActivityHistoryPage,
} from "../activityHistory";
describe("activity history pagination", () => {
  beforeEach(() => mocks.getDocs.mockReset());
  it("uses a document cursor so equal timestamps do not skip events", async () => {
    const cursor = { id: "last-loaded" };
    const docs = Array.from(
      { length: ACTIVITY_HISTORY_PAGE_SIZE },
      (_, index) => ({ id: String(index), data: () => ({ uid: "staff" }) }),
    );
    mocks.getDocs.mockResolvedValue({ docs });
    const result = await loadActivityHistoryPage({
      startDateKey: "2026-09-01",
      endDateKey: "2026-09-10",
      cursor,
    });
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe(docs.at(-1));
    expect(mocks.getDocs.mock.calls[0][0]).toContainEqual({
      startAfter: cursor,
    });
    const constraints = mocks.getDocs.mock.calls[0][0].filter(
      (item) => item.where,
    );
    expect(constraints[0].where).toEqual([
      "timestamp",
      ">=",
      new Date("2026-09-01T05:00:00Z"),
    ]);
    expect(constraints[1].where).toEqual([
      "timestamp",
      "<",
      new Date("2026-09-11T05:00:00Z"),
    ]);
  });
  it("marks the requested history exhausted only after a short page", async () => {
    mocks.getDocs.mockResolvedValue({ docs: [] });
    expect(
      await loadActivityHistoryPage({
        startDateKey: "2026-09-01",
        endDateKey: "2026-09-10",
      }),
    ).toMatchObject({ rows: [], hasMore: false, cursor: null });
  });
  it("honors the remaining export budget instead of requesting a full page", async () => {
    mocks.getDocs.mockResolvedValue({ docs: [{ id: "last", data: () => ({ uid: "staff" }) }] });
    const result = await loadActivityHistoryPage({ startDateKey: "2026-09-01", endDateKey: "2026-09-10", pageSize: 1 });
    expect(mocks.getDocs.mock.calls[0][0]).toContainEqual({ limit: 1 });
    expect(result.hasMore).toBe(true);
  });
  it("rejects invalid page limits before performing reads", async () => {
    for (const pageSize of [0, -1, 201, 1.5, NaN])
      await expect(loadActivityHistoryPage({ startDateKey: "2026-09-01", endDateKey: "2026-09-10", pageSize })).rejects.toThrow(/page size/);
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });
});
