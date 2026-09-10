// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(() => Promise.resolve({ id: "event-1" })),
  setDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../firebase", () => ({ db: { name: "test-db" } }));

vi.mock("firebase/firestore", () => ({
  addDoc: (...args) => firestoreMocks.addDoc(...args),
  arrayUnion: (...values) => ({ operation: "arrayUnion", values }),
  collection: (_db, name) => ({ kind: "collection", name }),
  doc: (_db, name, id) => ({ kind: "doc", name, id }),
  increment: (value) => ({ operation: "increment", value }),
  serverTimestamp: () => ({ operation: "serverTimestamp" }),
  setDoc: (...args) => firestoreMocks.setDoc(...args),
}));

import {
  logUserActivityEvent,
  recordActivityDuration,
  setActivityContext,
  trackFailure,
} from "../activityTracking";

const actor = {
  uid: "owner",
  email: "owner@example.com",
  displayName: "Owner",
  role: "admin",
};

const getDailySummaryWrite = () =>
  firestoreMocks.setDoc.mock.calls.find(
    ([ref]) => ref.name === "userActivityDaily",
  );

describe("activityTracking writes", () => {
  beforeEach(() => {
    firestoreMocks.addDoc.mockClear();
    firestoreMocks.setDoc.mockClear();
    window.sessionStorage.clear();
    setActivityContext();
  });

  it("records navigation as a page view and transition without inventing time", async () => {
    await logUserActivityEvent({
      actor,
      currentPage: "people/directory",
      previousPage: "dashboard",
      eventType: "page_enter",
      actionKey: "navigate",
      includePresence: true,
    });

    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      { kind: "collection", name: "userActivityEvents" },
      expect.objectContaining({
        eventType: "page_enter",
        pageId: "people/directory",
        previousPageId: "dashboard",
      }),
    );

    const [, summary] = getDailySummaryWrite();
    expect(summary.schemaVersion).toBe(3);
    expect(summary.pageEnterCount).toEqual({
      operation: "increment",
      value: 1,
    });
    expect(summary.trackedPageEnterCount).toEqual({
      operation: "increment",
      value: 1,
    });
    expect(summary.totalMinutesApprox).toEqual({
      operation: "increment",
      value: 0,
    });
    expect(Object.values(summary.transitionCounts)).toEqual([
      expect.objectContaining({
        fromPageId: "dashboard",
        toPageId: "people/directory",
        count: { operation: "increment", value: 1 },
      }),
    ]);
  });

  it("adds measured duration without adding page views or raw timeline events", async () => {
    await recordActivityDuration({
      actor,
      currentPage: "people/directory",
      durationMinutes: 1.5,
    });

    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    const [, summary] = getDailySummaryWrite();
    expect(summary.schemaVersion).toBe(3);
    expect(summary.pageEnterCount).toEqual({
      operation: "increment",
      value: 0,
    });
    expect(summary.semanticEventCount).toEqual({
      operation: "increment",
      value: 0,
    });
    expect(summary.totalMinutesApprox).toEqual({
      operation: "increment",
      value: 1.5,
    });
    expect(summary.measuredMinutes).toEqual({
      operation: "increment",
      value: 1.5,
    });
    expect(Object.values(summary.pageCounts)[0].measuredMinutes).toEqual({
      operation: "increment",
      value: 1.5,
    });
  });

  it("records a failure without counting it as a successful action or storing sensitive error text", async () => {
    setActivityContext({ actor, currentPage: "scheduling/room-grids" });
    await trackFailure(
      "pdf_export",
      Object.assign(new Error("Sensitive record and filename"), {
        code: "permission-denied",
      }),
    );
    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "error",
        metadata: { workflow: "pdf_export", errorCode: "permission-denied" },
      }),
    );
    const [, summary] = getDailySummaryWrite();
    expect(summary.semanticEventCount).toEqual({
      operation: "increment",
      value: 0,
    });
    expect(summary.pageEnterCount).toEqual({
      operation: "increment",
      value: 0,
    });
    expect(summary.monitoringVersion).toBe(1);
    expect(Object.values(summary.failureCounts)[0]).toMatchObject({
      workflow: "pdf_export",
      count: { operation: "increment", value: 1 },
    });
    expect(JSON.stringify(firestoreMocks.addDoc.mock.calls)).not.toContain(
      "Sensitive",
    );
  });

  it("uses the actual failed route instead of the previous page in the tracker context", async () => {
    setActivityContext({ actor, currentPage: "dashboard" });
    await trackFailure(
      "page_load",
      { code: "unexpected input here" },
      "people/directory",
    );
    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pageId: "people/directory",
        metadata: { workflow: "page_load", errorCode: "unexpected" },
      }),
    );
  });

  it("does not write failure telemetry after sign-out", async () => {
    setActivityContext();
    await trackFailure("pdf_export", new Error("failure"));
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
  });
});
