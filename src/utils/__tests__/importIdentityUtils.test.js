import { describe, expect, it } from "vitest";
import {
  buildScheduleDocId,
  buildScheduleIdentityIndex,
  deriveScheduleIdentity,
  deriveScheduleIdentityFromSchedule,
  resolveScheduleIdentityMatch,
} from "../importIdentityUtils";
import { parseMeetingPatterns } from "../meetingPatternUtils";
import { standardizeSchedule } from "../hygieneCore";

describe("importIdentityUtils", () => {
  it("derives a CLSS-first identity key", () => {
    const meetingPatterns = parseMeetingPatterns({
      "Meeting Pattern": "TR 2pm-3:15pm",
    });
    const identity = deriveScheduleIdentity({
      courseCode: "ADM1300",
      section: "01 (39316)",
      term: "Spring 2026",
      termCode: "202610",
      clssId: "2962",
      crn: "39316",
      meetingPatterns,
      spaceDisplayNames: ["Mary Gibbs Jones (FCS) 213"],
    });

    expect(identity.primaryKey).toBe("clss:202610:2962");
    expect(identity.keys).toContain("crn:202610:39316");
    expect(identity.keys).toContain("section:202610_ADM_1300_01");
  });

  it("keeps identity stable across hygiene normalization", () => {
    const meetingPatterns = parseMeetingPatterns({
      "Meeting Pattern": "TR 2pm-3:15pm",
    });
    const baseIdentity = deriveScheduleIdentity({
      courseCode: "adm1300",
      section: "01 (39316)",
      term: "spring 2026",
      termCode: "202610",
      clssId: "2962",
      crn: "39316",
      meetingPatterns,
      spaceDisplayNames: ["Mary Gibbs Jones (FCS) 213"],
    });

    const standardized = standardizeSchedule({
      courseCode: "adm1300",
      section: "01 (39316)",
      term: "spring 2026",
      termCode: "202610",
      clssId: "2962",
      crn: "39316",
      meetingPatterns,
      spaceDisplayNames: ["Mary Gibbs Jones (FCS) 213"],
    });

    const normalizedIdentity = deriveScheduleIdentityFromSchedule(standardized);
    expect(normalizedIdentity.primaryKey).toBe(baseIdentity.primaryKey);
  });

  it("matches existing schedules by identity (idempotent imports)", () => {
    const existingSchedules = [
      {
        id: "sched_clss_202610_2962",
        courseCode: "ADM 1300",
        section: "01",
        term: "Spring 2026",
        termCode: "202610",
        clssId: "2962",
        crn: "39316",
      },
    ];

    const { index } = buildScheduleIdentityIndex(existingSchedules);
    const identity = deriveScheduleIdentity({
      courseCode: "ADM 1300",
      section: "01",
      term: "Spring 2026",
      termCode: "202610",
      clssId: "2962",
      crn: "39316",
    });

    const match = resolveScheduleIdentityMatch(identity.keys, index);
    expect(match.schedule?.id).toBe("sched_clss_202610_2962");
  });

  it("prefers canonical schedules when duplicate identity keys exist", () => {
    const existingSchedules = [
      {
        id: "202610_33802",
        courseCode: "ADM 1321",
        section: "01",
        term: "Spring 2026",
        termCode: "202610",
        crn: "33802",
      },
      {
        id: "sched_clss_202610_2056",
        courseCode: "ADM 1321",
        section: "01",
        term: "Spring 2026",
        termCode: "202610",
        clssId: "2056",
        crn: "33802",
        identityKey: "clss:202610:2056",
        identityKeys: ["clss:202610:2056", "crn:202610:33802"],
      },
    ];

    const { index } = buildScheduleIdentityIndex(existingSchedules);
    const identity = deriveScheduleIdentity({
      courseCode: "ADM 1321",
      section: "01",
      term: "Spring 2026",
      termCode: "202610",
      crn: "33802",
    });

    const match = resolveScheduleIdentityMatch(identity.keys, index);
    expect(match.schedule?.id).toBe("sched_clss_202610_2056");
  });

  it("keeps identity stable for minor CSV edits", () => {
    const base = deriveScheduleIdentity({
      courseCode: "ADM 1300",
      section: "01 (39316)",
      term: "Spring 2026",
      termCode: "202610",
      clssId: "2962",
      crn: "39316",
      spaceDisplayNames: ["Mary Gibbs Jones (FCS) 213"],
    });
    const edited = deriveScheduleIdentity({
      courseCode: "adm 1300",
      section: "01",
      term: "SPRING 2026",
      termCode: "202610",
      clssId: "2962",
      crn: "39316",
      spaceDisplayNames: ["MARY GIBBS JONES (FCS) 213"],
    });

    expect(edited.primaryKey).toBe(base.primaryKey);
  });

  it("generates deterministic schedule document ids", () => {
    const identity = deriveScheduleIdentity({
      courseCode: "ADM 1300",
      section: "01",
      term: "Spring 2026",
      termCode: "202610",
      clssId: "2962",
      crn: "39316",
    });

    const docId = buildScheduleDocId({ primaryKey: identity.primaryKey });
    expect(docId).toBe("sched_clss_202610_2962");
  });

  it("flags identity keys that resolve to different schedules as ambiguous", () => {
    const schedules = [
      {
        id: "schedule-a",
        courseCode: "ADM 1300",
        section: "01",
        termCode: "202610",
        clssId: "2962",
        crn: "11111",
      },
      {
        id: "schedule-b",
        courseCode: "ADM 1321",
        section: "02",
        termCode: "202610",
        clssId: "9999",
        crn: "39316",
      },
    ];
    const { index } = buildScheduleIdentityIndex(schedules);
    const incoming = deriveScheduleIdentity({
      courseCode: "ADM 1300",
      section: "01",
      termCode: "202610",
      clssId: "2962",
      crn: "39316",
    });

    const match = resolveScheduleIdentityMatch(incoming.keys, index);

    expect(match.ambiguous).toBe(true);
    expect(match.schedule).toBeNull();
    expect(match.candidates.map((schedule) => schedule.id).sort()).toEqual([
      "schedule-a",
      "schedule-b",
    ]);
  });

  it("does not let a weak composite collision override a stable section match", () => {
    const sharedMeeting = [
      { day: "M", startTime: "09:00 AM", endTime: "09:50 AM" },
    ];
    const existingSchedules = [
      {
        id: "schedule-a",
        courseCode: "TEST 1000",
        section: "01",
        termCode: "202610",
        crn: "11111",
        meetingPatterns: sharedMeeting,
        spaceDisplayNames: ["Goebel 101"],
      },
      {
        id: "schedule-b",
        courseCode: "TEST 1000",
        section: "02",
        termCode: "202610",
        crn: "22222",
        meetingPatterns: sharedMeeting,
        spaceDisplayNames: ["Goebel 101"],
      },
    ];
    const { index } = buildScheduleIdentityIndex(existingSchedules);
    const incoming = deriveScheduleIdentity(existingSchedules[1]);

    const match = resolveScheduleIdentityMatch(incoming.keys, index);

    expect(match.ambiguous).toBe(false);
    expect(match.schedule?.id).toBe("schedule-b");
    expect(match.matchedKey).toBe("crn:202610:22222");
  });
});
