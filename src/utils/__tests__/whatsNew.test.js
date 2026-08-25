// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  LATEST_RELEASE,
  RELEASES,
  WHATS_NEW_STORAGE_KEY,
  formatReleaseTimestamp,
  getLastSeenVersion,
  hasUnseenRelease,
  setLastSeenVersion,
} from "../whatsNew";

describe("whatsNew releases", () => {
  it("keeps releases newest-first with unique positive integer versions", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    const versions = RELEASES.map((release) => release.version);
    versions.forEach((version) => {
      expect(Number.isInteger(version)).toBe(true);
      expect(version).toBeGreaterThan(0);
    });
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => b - a)).toEqual(versions);
    expect(LATEST_RELEASE).toBe(RELEASES[0]);
  });

  it("gives every release a valid timestamp and complete highlights", () => {
    RELEASES.forEach((release) => {
      expect(Number.isNaN(new Date(release.date).getTime())).toBe(false);
      expect(release.title).toBeTruthy();
      expect(release.summary).toBeTruthy();
      expect(release.highlights.length).toBeGreaterThan(0);
      release.highlights.forEach((highlight) => {
        expect(highlight.icon).toBeTruthy();
        expect(highlight.title).toBeTruthy();
        expect(highlight.description).toBeTruthy();
      });
    });
  });

  it("formats release timestamps for the viewer's locale", () => {
    expect(formatReleaseTimestamp(LATEST_RELEASE.date)).toContain("2026");
  });

  it("announces Schedule Grid Studio", () => {
    expect(LATEST_RELEASE.version).toBe(12);
    expect(LATEST_RELEASE.title).toBe("Design room grids your way");
    expect(LATEST_RELEASE.highlights.map(({ title }) => title)).toEqual([
      "Schedule Grid Studio",
      "Reusable in-app templates",
    ]);
  });
});

describe("whatsNew seen-state", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("treats a first visit as unseen", () => {
    expect(getLastSeenVersion()).toBe(0);
    expect(hasUnseenRelease()).toBe(true);
  });

  it("clears the unseen flag once the latest version is acknowledged", () => {
    setLastSeenVersion(LATEST_RELEASE.version);
    expect(window.localStorage.getItem(WHATS_NEW_STORAGE_KEY)).toBe(
      String(LATEST_RELEASE.version),
    );
    expect(hasUnseenRelease()).toBe(false);
  });

  it("re-flags when a newer release ships", () => {
    setLastSeenVersion(LATEST_RELEASE.version - 1);
    expect(hasUnseenRelease()).toBe(true);
  });

  it("ignores corrupted stored values", () => {
    window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, "not-a-number");
    expect(getLastSeenVersion()).toBe(0);
    expect(hasUnseenRelease()).toBe(true);

    window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, "999junk");
    expect(getLastSeenVersion()).toBe(0);
    expect(hasUnseenRelease()).toBe(true);
  });
});
