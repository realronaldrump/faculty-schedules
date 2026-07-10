import { beforeEach, describe, expect, it } from "vitest";

import { isSpaceReservable, normalizeSpaceRecord } from "../spaceUtils";
import { applyBuildingConfig, normalizeBuildingConfig } from "../locationService";

beforeEach(() => {
  const config = normalizeBuildingConfig({
    version: 1,
    buildings: [
      {
        code: "MGBJ",
        displayName: "Mary Gibbs Jones",
        aliases: ["Mary Gibbs Jones Hall"],
      },
    ],
  });
  applyBuildingConfig(config);
});

describe("normalizeSpaceRecord", () => {
  it("normalizes canonical room identity fields from spaceKey", () => {
    const normalized = normalizeSpaceRecord(
      { spaceKey: "MGBJ:110" },
      "MGBJ:110",
    );

    expect(normalized.id).toBe("MGBJ:110");
    expect(normalized.spaceKey).toBe("MGBJ:110");
    expect(normalized.buildingCode).toBe("MGBJ");
    expect(normalized.spaceNumber).toBe("110");
    expect(normalized.buildingDisplayName).toBe("Mary Gibbs Jones");
    expect(normalized.displayName).toBe("Mary Gibbs Jones 110");
  });

  it("builds a canonical spaceKey from buildingCode + spaceNumber when missing", () => {
    const normalized = normalizeSpaceRecord(
      { buildingCode: "MGBJ", spaceNumber: "110" },
      "MGBJ:110",
    );

    expect(normalized.spaceKey).toBe("MGBJ:110");
    expect(normalized.buildingCode).toBe("MGBJ");
    expect(normalized.spaceNumber).toBe("110");
    expect(normalized.buildingDisplayName).toBe("Mary Gibbs Jones");
    expect(normalized.displayName).toBe("Mary Gibbs Jones 110");
  });

  it("normalizes combined display names to canonical single-room labels", () => {
    const normalized = normalizeSpaceRecord(
      {
        spaceKey: "MGBJ:110",
        buildingCode: "MGBJ",
        spaceNumber: "110",
        displayName: "Mary Gibbs Jones 110; Mary Gibbs Jones 112",
      },
      "MGBJ:110",
    );

    expect(normalized.spaceKey).toBe("MGBJ:110");
    expect(normalized.displayName).toBe("Mary Gibbs Jones 110");
  });

  it("defaults missing reservation eligibility to false", () => {
    const normalized = normalizeSpaceRecord(
      { spaceKey: "MGBJ:110" },
      "MGBJ:110",
    );

    expect(normalized.isReservable).toBe(false);
    expect(isSpaceReservable(normalized)).toBe(false);
  });

  it("preserves explicit reservation eligibility", () => {
    const normalized = normalizeSpaceRecord(
      { spaceKey: "MGBJ:110", isReservable: true },
      "MGBJ:110",
    );

    expect(normalized.isReservable).toBe(true);
    expect(isSpaceReservable(normalized)).toBe(true);
  });
});
