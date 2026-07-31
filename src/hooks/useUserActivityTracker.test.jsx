// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackingMocks = vi.hoisted(() => ({
  getActivitySessionId: vi.fn(() => "session-1"),
  logUserActivityEvent: vi.fn(() => Promise.resolve("session-1")),
  recordActivityDuration: vi.fn(() => Promise.resolve()),
  setActivityContext: vi.fn(),
  touchPresence: vi.fn(() => Promise.resolve()),
}));

let authState;

vi.mock("../contexts/AuthContext.jsx", () => ({
  useAuth: () => authState,
}));

vi.mock("../utils/activityTracking", () => ({
  buildActivityActor: ({ user, userProfile }) => ({
    uid: user.uid,
    email: userProfile.email,
    displayName: userProfile.displayName,
    role: userProfile.roles[0],
  }),
  ...trackingMocks,
}));

import useUserActivityTracker from "./useUserActivityTracker";

const buildAuthState = () => ({
  user: {
    uid: "owner",
    email: "owner@example.com",
    displayName: "Owner",
  },
  userProfile: {
    email: "owner@example.com",
    displayName: "Owner",
    roles: ["admin"],
  },
  loading: false,
  canAccess: vi.fn(() => true),
});

describe("useUserActivityTracker", () => {
  beforeEach(() => {
    authState = buildAuthState();
    Object.values(trackingMocks).forEach((mock) => mock.mockClear());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not log another page entry when the profile heartbeat refreshes without navigation", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(0);
    const { rerender } = renderHook(() =>
      useUserActivityTracker({
        currentPage: "dashboard",
        isAuthenticated: true,
      }),
    );

    await waitFor(() => {
      expect(trackingMocks.logUserActivityEvent).toHaveBeenCalledTimes(1);
    });

    nowSpy.mockReturnValue(60_000);
    authState = buildAuthState();
    await act(async () => {
      rerender();
    });

    expect(trackingMocks.logUserActivityEvent).toHaveBeenCalledTimes(1);
  });

  it("records the prior page when the route really changes", async () => {
    let currentPage = "dashboard";
    const { rerender } = renderHook(() =>
      useUserActivityTracker({ currentPage, isAuthenticated: true }),
    );

    await waitFor(() => {
      expect(trackingMocks.logUserActivityEvent).toHaveBeenCalledTimes(1);
    });

    currentPage = "people/directory";
    await act(async () => {
      rerender();
    });

    expect(trackingMocks.logUserActivityEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentPage: "people/directory",
        previousPage: "dashboard",
      }),
    );
  });

  it("records elapsed time separately while the page stays visible", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T16:00:00Z"));
    renderHook(() =>
      useUserActivityTracker({
        currentPage: "dashboard",
        isAuthenticated: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(trackingMocks.recordActivityDuration).toHaveBeenCalledTimes(1);
    expect(trackingMocks.recordActivityDuration).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPage: "dashboard",
        durationMinutes: 1,
      }),
    );
    vi.useRealTimers();
  });
});
