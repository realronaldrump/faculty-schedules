import { describe, expect, it } from "vitest";

import {
  createBlankStudioDocument,
  createStudioDocumentFromSchedule,
  createStudioEntry,
  createStudioHistory,
  createStudioCatalogEntry,
  getStudioEntryIdentity,
  layoutStudioEntriesForDay,
  normalizeMeetingDays,
  parseMeetingTimeRange,
  studioHistoryReducer,
} from "../scheduleGridStudio";

describe("scheduleGridStudio model", () => {
  it("normalizes imported meeting patterns and time ranges", () => {
    expect(normalizeMeetingDays("Monday Wednesday Friday")).toEqual([
      "M",
      "W",
      "F",
    ]);
    expect(normalizeMeetingDays("TTh")).toEqual(["T", "R"]);
    expect(parseMeetingTimeRange("9:05 am - 9:55 am")).toEqual({
      start: "09:05",
      end: "09:55",
    });
  });

  it("creates an editable studio document from dashboard schedule data", () => {
    const document = createStudioDocumentFromSchedule({
      building: "Mary Gibbs Jones",
      room: "207",
      semester: "Fall 2026",
      classes: [
        {
          class: "NUTR 2288",
          section: "01",
          professor: "Stanley Wilfong",
          days: "MWF",
          time: "8:00 am - 8:50 am",
        },
      ],
    });

    expect(document.name).toBe("Mary Gibbs Jones · 207 · Fall 2026");
    expect(document.source).toBe("schedule");
    expect(document.visibility.instructor).toBe(true);
    expect(document.visibility.classTime).toBe(false);
    expect(document.entries).toEqual([
      expect.objectContaining({
        course: "NUTR 2288",
        section: "01",
        instructor: "Stanley Wilfong",
        days: ["M", "W", "F"],
        start: "08:00",
        end: "08:50",
      }),
    ]);
  });

  it("supports reversible entry edits", () => {
    const entry = createStudioEntry({ id: "class-1", course: "CFS 1305" });
    let history = createStudioHistory(
      createBlankStudioDocument({ entries: [entry] }),
    );

    history = studioHistoryReducer(history, {
      type: "update_entry",
      id: "class-1",
      patch: { instructor: "Avery Johnson", hidden: true },
    });
    expect(history.present.entries[0]).toEqual(
      expect.objectContaining({
        instructor: "Avery Johnson",
        hidden: true,
      }),
    );

    history = studioHistoryReducer(history, { type: "undo" });
    expect(history.present.entries[0].instructor).toBe("");
    expect(history.present.entries[0].hidden).toBe(false);

    history = studioHistoryReducer(history, { type: "redo" });
    expect(history.present.entries[0].instructor).toBe("Avery Johnson");
  });

  it("bulk-adds catalog classes as one undoable edit with stable duplicate identities", () => {
    const first = createStudioCatalogEntry({
      building: "Mary Gibbs Jones",
      room: "207",
      class: "NUTR 2288",
      section: "01",
      professor: "Stanley Wilfong",
      days: "MWF",
      time: "8:00 am - 8:50 am",
    });
    const sameClassAnotherRoom = createStudioCatalogEntry({
      building: "Cashion",
      room: "101",
      class: "NUTR 2288",
      section: "01",
      professor: "Stanley Wilfong",
      days: "MWF",
      time: "8:00 am - 8:50 am",
    });
    expect(first.id).not.toBe(sameClassAnotherRoom.id);
    expect(getStudioEntryIdentity(first.entry)).toBe(
      getStudioEntryIdentity(sameClassAnotherRoom.entry),
    );

    let history = createStudioHistory(createBlankStudioDocument());
    history = studioHistoryReducer(history, {
      type: "add_entries",
      entries: [first.entry, sameClassAnotherRoom.entry],
    });
    expect(history.present.entries).toHaveLength(2);
    expect(history.past).toHaveLength(1);

    history = studioHistoryReducer(history, { type: "undo" });
    expect(history.present.entries).toHaveLength(0);
  });

  it("places overlapping classes into separate lanes but keeps back-to-back classes full width", () => {
    const entries = [
      createStudioEntry({
        id: "a",
        days: ["M"],
        start: "08:00",
        end: "09:00",
      }),
      createStudioEntry({
        id: "b",
        days: ["M"],
        start: "08:30",
        end: "09:30",
      }),
      createStudioEntry({
        id: "c",
        days: ["M"],
        start: "09:30",
        end: "10:20",
      }),
    ];

    const laidOut = layoutStudioEntriesForDay(entries, "M", {
      timeStart: "08:00",
      timeEnd: "17:00",
    });

    expect(laidOut.find((entry) => entry.id === "a")).toEqual(
      expect.objectContaining({ lane: 0, laneCount: 2 }),
    );
    expect(laidOut.find((entry) => entry.id === "b")).toEqual(
      expect.objectContaining({ lane: 1, laneCount: 2 }),
    );
    expect(laidOut.find((entry) => entry.id === "c")).toEqual(
      expect.objectContaining({ lane: 0, laneCount: 1 }),
    );
  });
});
