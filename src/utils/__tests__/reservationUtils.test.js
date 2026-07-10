import { describe, expect, it } from "vitest";

import {
  rangesOverlap,
  weekdayFromDateStr,
  findClassConflicts,
  findReservationConflicts,
  checkConflicts,
} from "../reservationUtils";

// 2026-03-18 is a Wednesday.
const WED = "2026-03-18";
const SAT = "2026-03-21";

const scheduleRows = [
  {
    _originalId: "s1",
    Course: "NUTR 1102",
    Section: "01",
    Day: "W",
    "Start Time": "9:00 AM",
    "End Time": "9:50 AM",
    Room: "Goebel 101",
    Term: "Spring 2026",
  },
  {
    _originalId: "s2",
    Course: "ID 2350",
    Section: "02",
    Day: "W",
    "Start Time": "2:00 PM",
    "End Time": "3:15 PM",
    Room: "Mary Gibbs Jones 114",
    Term: "Spring 2026",
  },
];

describe("rangesOverlap", () => {
  it("detects overlap and adjacency", () => {
    expect(rangesOverlap(540, 600, 570, 630)).toBe(true);
    expect(rangesOverlap(540, 600, 600, 660)).toBe(false); // touching, not overlapping
    expect(rangesOverlap(540, 600, 700, 760)).toBe(false);
  });
});

describe("weekdayFromDateStr", () => {
  it("returns local JS weekday", () => {
    expect(weekdayFromDateStr(WED)).toBe(3);
    expect(weekdayFromDateStr(SAT)).toBe(6);
  });
});

describe("findClassConflicts", () => {
  const base = {
    scheduleData: scheduleRows,
    termStart: "2026-01-12",
    termEnd: "2026-05-01",
  };

  it("flags an overlapping class in the same room on the same weekday", () => {
    const hits = findClassConflicts({
      ...base,
      roomLabel: "Goebel 101",
      dateStr: WED,
      startMinutes: 9 * 60 + 30, // 9:30
      endMinutes: 10 * 60,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].Course).toBe("NUTR 1102");
  });

  it("does not flag a free time in the same room", () => {
    const hits = findClassConflicts({
      ...base,
      roomLabel: "Goebel 101",
      dateStr: WED,
      startMinutes: 11 * 60,
      endMinutes: 12 * 60,
    });
    expect(hits).toHaveLength(0);
  });

  it("does not flag a different room", () => {
    const hits = findClassConflicts({
      ...base,
      roomLabel: "Mary Gibbs Jones 114",
      dateStr: WED,
      startMinutes: 9 * 60 + 30,
      endMinutes: 10 * 60,
    });
    expect(hits).toHaveLength(0);
  });

  it("ignores classes when the date is outside the term", () => {
    const hits = findClassConflicts({
      ...base,
      roomLabel: "Goebel 101",
      dateStr: "2026-07-01", // summer, outside term
      startMinutes: 9 * 60 + 30,
      endMinutes: 10 * 60,
    });
    expect(hits).toHaveLength(0);
  });
});

describe("findReservationConflicts", () => {
  const reservations = [
    {
      id: "r1",
      spaceKey: "GOEBEL:101",
      date: WED,
      startMinutes: 600,
      endMinutes: 660,
      status: "confirmed",
    },
  ];

  it("flags an overlapping reservation in the same room", () => {
    const hits = findReservationConflicts({
      reservations,
      spaceKey: "GOEBEL:101",
      dateStr: WED,
      startMinutes: 630,
      endMinutes: 690,
    });
    expect(hits).toHaveLength(1);
  });

  it("ignores a different room and the record being edited", () => {
    expect(
      findReservationConflicts({
        reservations,
        spaceKey: "MGBJ:114",
        dateStr: WED,
        startMinutes: 630,
        endMinutes: 690,
      }),
    ).toHaveLength(0);
    expect(
      findReservationConflicts({
        reservations,
        spaceKey: "GOEBEL:101",
        dateStr: WED,
        startMinutes: 630,
        endMinutes: 690,
        ignoreId: "r1",
      }),
    ).toHaveLength(0);
  });
});

describe("checkConflicts", () => {
  it("combines class + reservation conflicts and reports a clean slot", () => {
    const clean = checkConflicts({
      scheduleData: scheduleRows,
      reservations: [],
      roomLabel: "Goebel 101",
      spaceKey: "GOEBEL:101",
      dateStr: WED,
      startMinutes: 11 * 60,
      endMinutes: 12 * 60,
      termStart: "2026-01-12",
      termEnd: "2026-05-01",
    });
    expect(clean.hasConflict).toBe(false);

    const blocked = checkConflicts({
      scheduleData: scheduleRows,
      reservations: [
        {
          id: "r1",
          spaceKey: "GOEBEL:101",
          date: WED,
          startMinutes: 9 * 60 + 15,
          endMinutes: 9 * 60 + 45,
          status: "confirmed",
        },
      ],
      roomLabel: "Goebel 101",
      spaceKey: "GOEBEL:101",
      dateStr: WED,
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      termStart: "2026-01-12",
      termEnd: "2026-05-01",
    });
    expect(blocked.hasConflict).toBe(true);
    expect(blocked.classConflicts).toHaveLength(1);
    expect(blocked.reservationConflicts).toHaveLength(1);
  });
});
