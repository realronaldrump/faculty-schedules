import { describe, expect, it, vi } from "vitest";
import { pluralize } from "../pluralize";
import { formatDuration, formatTimeRange, toLocalISODate } from "../timeUtils";
import { getUserFacingErrorMessage } from "../errorMessages";
import { formatPhoneNumber, getPhoneHref } from "../directoryUtils";
import { onActivateKey } from "../keyboard";

describe("pluralize", () => {
  it("uses the singular only for exactly one", () => {
    expect(pluralize(1, "contact")).toBe("1 contact");
    expect(pluralize(0, "contact")).toBe("0 contacts");
    expect(pluralize(2, "person", "people")).toBe("2 people");
  });

  it("formats large counts and tolerates missing values", () => {
    expect(pluralize(1204, "change")).toBe("1,204 changes");
    expect(pluralize(undefined, "room")).toBe("0 rooms");
  });
});

describe("time formatting", () => {
  it("joins a range with an en dash", () => {
    expect(formatTimeRange(545, 595)).toBe("9:05 AM – 9:55 AM");
  });

  it("drops zero hours and zero minutes from durations", () => {
    expect(formatDuration(50)).toBe("50m");
    expect(formatDuration(75)).toBe("1h 15m");
    expect(formatDuration(120)).toBe("2h");
  });

  it("uses the local calendar date, not the UTC one", () => {
    expect(toLocalISODate(new Date(2026, 9, 14, 23, 30))).toBe("2026-10-14");
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("getUserFacingErrorMessage", () => {
  it("passes through messages the app writes itself", () => {
    expect(
      getUserFacingErrorMessage(new Error("Another person already has that Baylor ID."), "Fallback"),
    ).toBe("Another person already has that Baylor ID.");
  });

  it("replaces Firebase and runtime errors with the fallback", () => {
    const firebaseError = Object.assign(new Error("Missing or insufficient permissions."), {
      code: "permission-denied",
    });
    expect(getUserFacingErrorMessage(firebaseError, "Fallback")).toBe("Fallback");
    expect(getUserFacingErrorMessage(new TypeError("Cannot read properties of undefined"), "Fallback")).toBe("Fallback");
    expect(getUserFacingErrorMessage(undefined, "Fallback")).toBe("Fallback");
  });
});

describe("phone helpers", () => {
  it("formats ten digits without spaces around the dash", () => {
    expect(formatPhoneNumber("2547101001")).toBe("(254) 710-1001");
  });

  it("builds a dialable link", () => {
    expect(getPhoneHref("(254) 710-1001")).toBe("tel:+12547101001");
    expect(getPhoneHref("")).toBe("");
  });
});

describe("onActivateKey", () => {
  const keyEvent = (key, sameTarget = true) => {
    const target = {};
    return {
      key,
      target,
      currentTarget: sameTarget ? target : {},
      preventDefault: vi.fn(),
    };
  };

  it("runs on Enter and Space pressed on the element itself", () => {
    const handler = vi.fn();
    onActivateKey(handler)(keyEvent("Enter"));
    onActivateKey(handler)(keyEvent(" "));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("ignores other keys and keys from controls inside the element", () => {
    const handler = vi.fn();
    onActivateKey(handler)(keyEvent("a"));
    onActivateKey(handler)(keyEvent("Enter", false));
    expect(handler).not.toHaveBeenCalled();
  });
});
