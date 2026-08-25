import { describe, expect, it } from "vitest";

import { buildRoomCalendarExport } from "../roomCalendarExport";

const TERM_CONFIG = {
  startDate: "2026-08-24",
  endDate: "2026-12-09",
  exceptions: [],
};

const baseSchedule = (overrides = {}) => ({
  id: "schedule-1",
  term: "Fall 2026",
  courseCode: "TEST 1000",
  section: "01",
  courseTitle: "Calendar Export Test",
  instructorName: "Test Instructor",
  crn: "12345",
  status: "Active",
  spaceIds: ["GOEBEL:101"],
  spaceDisplayNames: ["Goebel Building 101"],
  meetingPatterns: [
    {
      day: "M",
      startTime: "9:00 AM",
      endTime: "10:00 AM",
      startDate: null,
      endDate: null,
      raw: "M 9am-10am",
    },
  ],
  ...overrides,
});

const unfold = (ics) => ics.replace(/\r\n[ \t]/g, "");

const eventPropertyValues = (ics, property) =>
  unfold(ics)
    .split("\r\n")
    .filter((line) => line.startsWith(`${property}:`))
    .map((line) => line.slice(property.length + 1));

describe("buildRoomCalendarExport", () => {
  it("pairs ordered multi-room source segments instead of applying every pattern to every room", () => {
    const schedule = baseSchedule({
      id: "sched_clss_202630_3913",
      spaceIds: ["GOEBEL:109", "GOEBEL:113"],
      spaceDisplayNames: ["Goebel Building 109", "Goebel Building 113"],
      meetingPatterns: [
        { day: "M", startTime: "11:15 AM", endTime: "2:00 PM", raw: "MW 11:15am-2pm" },
        { day: "W", startTime: "11:15 AM", endTime: "2:00 PM", raw: "MW 11:15am-2pm" },
        { day: "M", startTime: "11:15 AM", endTime: "2:15 PM", raw: "MW 11:15am-2:15pm" },
        { day: "W", startTime: "11:15 AM", endTime: "2:15 PM", raw: "MW 11:15am-2:15pm" },
      ],
    });

    const result = buildRoomCalendarExport({
      schedules: [schedule],
      selectedTerm: "Fall 2026",
      termConfig: TERM_CONFIG,
      generatedAt: new Date("2026-08-25T16:00:00Z"),
    });

    expect(result.calendars).toHaveLength(2);
    const room109 = result.calendars.find(
      (calendar) => calendar.room.label === "Goebel Building 109",
    );
    const room113 = result.calendars.find(
      (calendar) => calendar.room.label === "Goebel Building 113",
    );

    expect(room109.eventCount).toBe(1);
    expect(room109.ics).toContain(
      "DTEND;TZID=America/Chicago:20260824T140000",
    );
    expect(room109.ics).not.toContain("T141500");
    expect(room113.eventCount).toBe(1);
    expect(room113.ics).toContain(
      "DTEND;TZID=America/Chicago:20260824T141500",
    );
    expect(room113.ics).not.toContain("T140000");

    for (const calendar of result.calendars) {
      const uids = eventPropertyValues(calendar.ics, "UID");
      expect(new Set(uids).size).toBe(uids.length);
    }
  });

  it("omits cancelled physical schedules", () => {
    const result = buildRoomCalendarExport({
      schedules: [baseSchedule({ status: "Cancelled" })],
      selectedTerm: "Fall 2026",
      termConfig: TERM_CONFIG,
      generatedAt: new Date("2026-08-25T16:00:00Z"),
    });

    expect(result.calendars).toEqual([]);
    expect(result.totalEventCount).toBe(0);
    expect(result.cancelledScheduleCount).toBe(1);
  });

  it("reports detected rooms whose meetings cannot produce events", () => {
    const result = buildRoomCalendarExport({
      schedules: [
        baseSchedule({
          meetingPatterns: [{ day: null, startTime: "", endTime: "" }],
        }),
      ],
      selectedTerm: "Fall 2026",
      termConfig: TERM_CONFIG,
      generatedAt: new Date("2026-08-25T16:00:00Z"),
    });

    expect(result.detectedRooms).toHaveLength(1);
    expect(result.calendars).toEqual([]);
    expect(result.emptyRooms).toEqual([
      expect.objectContaining({ label: "Goebel Building 101" }),
    ]);
  });

  it("keeps different active date ranges as separate recurrences", () => {
    const result = buildRoomCalendarExport({
      schedules: [
        baseSchedule({
          meetingPatterns: [
            {
              day: "M",
              startTime: "9:00 AM",
              endTime: "10:00 AM",
              startDate: "2026-08-24",
              endDate: "2026-12-01",
            },
            {
              day: "W",
              startTime: "9:00 AM",
              endTime: "10:00 AM",
              startDate: "2026-09-09",
              endDate: "2026-12-09",
            },
          ],
        }),
      ],
      selectedTerm: "Fall 2026",
      termConfig: TERM_CONFIG,
      generatedAt: new Date("2026-08-25T16:00:00Z"),
    });

    const ics = result.calendars[0].ics;
    expect(result.calendars[0].eventCount).toBe(2);
    expect(ics).toContain("DTSTART;TZID=America/Chicago:20260824T090000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;");
    expect(ics).toContain("DTSTART;TZID=America/Chicago:20260909T090000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=WE;");
    expect(ics).not.toContain("BYDAY=MO,WE");
  });

  it("writes matching no-class dates as EXDATE values", () => {
    const result = buildRoomCalendarExport({
      schedules: [baseSchedule()],
      selectedTerm: "Fall 2026",
      termConfig: {
        ...TERM_CONFIG,
        exceptions: [{ date: "2026-09-07", label: "Labor Day" }],
      },
      generatedAt: new Date("2026-08-25T16:00:00Z"),
    });

    expect(result.calendars[0].ics).toContain(
      "EXDATE;TZID=America/Chicago:20260907T090000",
    );
  });
});
