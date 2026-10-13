// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JOB_COLORS,
  LABEL_OFFSET,
  assignJobColors,
  getSavedCalendarView,
  getTimelineWindow,
  hasSeenTimelineInvite,
  layoutTimelineDay,
  markTimelineInviteSeen,
  saveCalendarView,
} from "../studentScheduleTimeline";

const at = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const shift = (id, start, end) => ({
  student: { id, name: id },
  startMinutes: at(start),
  endMinutes: at(end),
});
const WINDOW = { startMinutes: 8 * 60, endMinutes: 17 * 60 };
const LABEL = 140;
const measureLabel = () => LABEL;

// Tuesday from the Student Workers screenshot: 8 shifts, 7 students.
const TUESDAY = [
  shift("Mo", "10:00", "15:00"),
  shift("Allie", "11:00", "14:00"),
  shift("Kinsey", "11:00", "14:00"),
  shift("Acascia", "12:30", "15:15"),
  shift("Kenzie", "14:00", "17:00"),
  shift("Camilla", "14:00", "16:30"),
  shift("Gretchen", "14:00", "16:00"),
  shift("Kinsey", "15:30", "17:00"),
];

// Each item's footprint (bar + outside label) in px at a given track width.
const footprint = (item, width) => {
  const left = item.left * width;
  const right = left + item.width * width;
  if (item.labelSide === "right") return [left, right + LABEL_OFFSET + LABEL];
  if (item.labelSide === "left") return [left - LABEL_OFFSET - LABEL, right];
  return [left, right];
};

const expectNoCollisions = (items, width) => {
  const byLane = new Map();
  items.forEach((item) => {
    byLane.set(item.lane, [...(byLane.get(item.lane) || []), item]);
  });
  byLane.forEach((laneItems) => {
    const spans = laneItems
      .map((item) => footprint(item, width))
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
    }
  });
  items
    .filter((item) => item.labelSide === "inside")
    .forEach((item) => expect(item.width * width).toBeGreaterThanOrEqual(LABEL));
};

describe("layoutTimelineDay", () => {
  it("never lets bars or labels collide, at the layout width or wider", () => {
    const { items, laneCount } = layoutTimelineDay(TUESDAY, {
      ...WINDOW,
      trackWidth: 760,
      measureLabel,
    });
    expect(items).toHaveLength(TUESDAY.length);
    expect(laneCount).toBeGreaterThanOrEqual(5); // five people on at 2–3 PM
    expectNoCollisions(items, 760);
    expectNoCollisions(items, 1400);
  });

  it("puts labels inside bars that fit them", () => {
    const { items } = layoutTimelineDay([shift("Mo", "10:00", "15:00")], {
      ...WINDOW,
      trackWidth: 760,
      measureLabel,
    });
    expect(items[0].labelSide).toBe("inside");
  });

  it("puts a short shift's label beside it, and on the left near the end of the day", () => {
    const { items } = layoutTimelineDay(
      [shift("Mid", "13:20", "14:30"), shift("Late", "16:00", "17:00")],
      { ...WINDOW, trackWidth: 760, measureLabel },
    );
    const side = (id) => items.find((i) => i.event.student.id === id).labelSide;
    expect(side("Mid")).toBe("right");
    expect(side("Late")).toBe("left");
  });

  it("keeps a student's second shift in their lane when it is free", () => {
    const { items } = layoutTimelineDay(
      [
        shift("A", "9:00", "10:00"),
        shift("B", "9:00", "12:00"),
        shift("A", "14:00", "17:00"),
      ],
      { ...WINDOW, trackWidth: 900, measureLabel },
    );
    const lanes = items
      .filter((item) => item.event.student.id === "A")
      .map((item) => item.lane);
    expect(new Set(lanes).size).toBe(1);
  });

  it("returns no lanes for an empty day", () => {
    expect(
      layoutTimelineDay([], { ...WINDOW, trackWidth: 760, measureLabel }),
    ).toEqual({ items: [], laneCount: 0 });
  });
});

describe("getTimelineWindow", () => {
  it("defaults to the 8 AM–5 PM student schedule window", () => {
    expect(getTimelineWindow([shift("A", "9:00", "12:00")])).toEqual(WINDOW);
  });

  it("widens to whole hours for shifts outside it", () => {
    expect(getTimelineWindow([shift("A", "7:30", "17:15")])).toEqual({
      startMinutes: 7 * 60,
      endMinutes: 18 * 60,
    });
  });
});

describe("assignJobColors", () => {
  it("leads with Baylor Green and University Gold, sorted by title", () => {
    const colors = assignJobColors(["Nutrition Lab", "Admin", "Nutrition Lab"]);
    expect(colors.size).toBe(2);
    expect(colors.get("Admin").swatch).toBe("#154734");
    expect(colors.get("Nutrition Lab").swatch).toBe("#FFB81C");
  });

  it("gives distinct colors until the palette runs out", () => {
    const titles = JOB_COLORS.map((_, i) => `Job ${i}`);
    const colors = assignJobColors(titles);
    expect(new Set(colors.values()).size).toBe(JOB_COLORS.length);
  });
});

describe("calendar view preferences", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("defaults to Classic and an unseen invite", () => {
    expect(getSavedCalendarView()).toBe("classic");
    expect(hasSeenTimelineInvite()).toBe(false);
  });

  it("remembers Timeline and the answered invite", () => {
    saveCalendarView("timeline");
    markTimelineInviteSeen();
    expect(getSavedCalendarView()).toBe("timeline");
    expect(hasSeenTimelineInvite()).toBe(true);
  });

  it("falls back to Classic with no invite when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getSavedCalendarView()).toBe("classic");
    expect(hasSeenTimelineInvite()).toBe(true);
  });
});
