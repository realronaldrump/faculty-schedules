// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

import { ROLLUP_SCHEMA_VERSION, planRollupSync } from "../activitySync";

describe("planRollupSync", () => {
  const todayDateKey = "2026-03-11";

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
