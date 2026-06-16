/**
 * Capacity / enrollment analysis
 *
 * Turns the CLSS schedule (read-only) into actionable buckets: sections that are
 * over/near capacity, under-enrolled, or sitting in a mis-sized room. Pure
 * functions so they can be unit tested and reused.
 */

import {
  getEnrollment,
  getMaxEnrollment,
  getWaitlist,
  getReservedSeats,
} from "./enrollmentUtils";
import { splitMultiRoom } from "./locationService";

export const DEFAULT_THRESHOLDS = {
  nearCapPct: 0.9, // >= this fraction of max → near/over capacity
  underPct: 0.34, // <= this fraction of max → under-enrolled
  minEnroll: 6, // below this headcount → under-enrolled
  oversizedFactor: 2.5, // room cap >= max * this → oversized room
};

/** displayName(lowercased) → capacity number, from the spaces inventory. */
export const buildCapacityMap = (spacesList = []) => {
  const map = new Map();
  spacesList.forEach((space) => {
    const cap = Number(space?.capacity);
    const name = (space?.displayName || "").toString().trim().toLowerCase();
    if (name && Number.isFinite(cap) && cap > 0) {
      map.set(name, cap);
    }
  });
  return map;
};

const roomCapacityFor = (roomLabel, capacityByLabel) => {
  if (!roomLabel || !capacityByLabel) return null;
  const rooms = splitMultiRoom(roomLabel);
  let total = 0;
  let found = false;
  rooms.forEach((r) => {
    const cap = capacityByLabel.get(r.toString().trim().toLowerCase());
    if (Number.isFinite(cap)) {
      total += cap;
      found = true;
    }
  });
  return found ? total : null;
};

/** Collapse per-meeting schedule rows into one record per section. */
export const buildSections = (scheduleRows = [], term = null) => {
  const byId = new Map();
  scheduleRows.forEach((row) => {
    if (term && row.Term !== term) return;
    const key = row._originalId || row.id;
    if (!key || byId.has(key)) return;
    byId.set(key, row);
  });
  return Array.from(byId.values());
};

/**
 * Analyze sections into actionable buckets.
 * @returns {{ overCapacity, underEnrolled, roomMismatch, sections, summary }}
 */
export const analyzeCapacity = ({
  scheduleRows = [],
  term = null,
  capacityByLabel = new Map(),
  thresholds = DEFAULT_THRESHOLDS,
} = {}) => {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const sections = buildSections(scheduleRows, term).map((row) => {
    const enrollment = getEnrollment(row) ?? 0;
    const max = getMaxEnrollment(row);
    const waitlist = getWaitlist(row) ?? 0;
    const reserved = getReservedSeats(row);
    const roomCapacity = roomCapacityFor(row.Room, capacityByLabel);
    const fillPct = max && max > 0 ? enrollment / max : null;
    const roomFillPct =
      roomCapacity && roomCapacity > 0 ? enrollment / roomCapacity : null;

    const flags = [];
    const hints = [];

    // Over / near capacity
    if (waitlist > 0) {
      flags.push("waitlist");
      hints.push(
        `Waitlist of ${waitlist} — consider a larger room or an additional section.`,
      );
    }
    if (fillPct != null && fillPct >= t.nearCapPct) {
      flags.push("near-cap");
      if (waitlist === 0) hints.push("Near full — monitor or move to a larger room.");
    }

    // Under-enrolled
    const isZero = enrollment === 0;
    const isLow =
      (fillPct != null && fillPct <= t.underPct) || enrollment < t.minEnroll;
    if (isZero) {
      flags.push("zero-enroll");
      hints.push("No enrollment — cancellation candidate.");
    } else if (isLow) {
      flags.push("under-enroll");
      hints.push("Low enrollment — review for cancellation or consolidation.");
    }

    // Room mismatch
    if (roomCapacity != null) {
      if (enrollment > roomCapacity) {
        flags.push("over-room");
        hints.push(
          `Enrollment (${enrollment}) exceeds room capacity (${roomCapacity}) — move to a larger room.`,
        );
      } else if (max != null && max > roomCapacity) {
        flags.push("overbooked-room");
        hints.push(
          `Cap (${max}) exceeds room capacity (${roomCapacity}).`,
        );
      } else if (
        max != null &&
        max > 0 &&
        roomCapacity >= max * t.oversizedFactor
      ) {
        flags.push("oversized-room");
        hints.push(
          `Room (${roomCapacity}) is much larger than the cap (${max}) — could be freed for events.`,
        );
      }
    }

    return {
      row,
      key: row._originalId || row.id,
      course: row.Course || "",
      section: row.Section || "",
      crn: row.CRN || row.crn || "",
      instructor: row.Instructor || "",
      program: row.Program || "",
      room: row.Room || "",
      enrollment,
      max,
      waitlist,
      reserved,
      roomCapacity,
      fillPct,
      roomFillPct,
      flags,
      hints,
    };
  });

  const has = (s, ...names) => names.some((n) => s.flags.includes(n));

  const overCapacity = sections.filter((s) => has(s, "waitlist", "near-cap"));
  const underEnrolled = sections.filter((s) => has(s, "zero-enroll", "under-enroll"));
  const roomMismatch = sections.filter((s) =>
    has(s, "over-room", "overbooked-room", "oversized-room"),
  );

  return {
    sections,
    overCapacity,
    underEnrolled,
    roomMismatch,
    summary: {
      total: sections.length,
      overCapacity: overCapacity.length,
      underEnrolled: underEnrolled.length,
      roomMismatch: roomMismatch.length,
    },
  };
};
