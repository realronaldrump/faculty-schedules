import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Download,
  MapPin,
  Plus,
  Trash2,
  AlertCircle,
  FileArchive,
  CheckCircle2,
} from "lucide-react";
import JSZip from "jszip";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { parseMeetingPatterns } from "../../utils/meetingPatternUtils";
import { useData } from "../../contexts/DataContext";
import { useSchedules } from "../../contexts/ScheduleContext";
import { useUI } from "../../contexts/UIContext";
import { useAppConfig } from "../../contexts/AppConfigContext";
import {
  normalizeTermDateValue,
  normalizeTermLabel,
  sortTerms,
} from "../../utils/termUtils";
import { useAuth } from "../../contexts/AuthContext";
import { db, COLLECTIONS } from "../../firebase";

const EXCEPTIONS_STORAGE_KEY = "tools.outlook-export.term-exceptions";
const EXCEPTIONS_DOC_ID = "rooms";

const dayMetadata = {
  SU: { js: 0, ics: "SU" },
  SUN: { js: 0, ics: "SU" },
  SUNDAY: { js: 0, ics: "SU" },
  U: { js: 0, ics: "SU" },
  M: { js: 1, ics: "MO" },
  MO: { js: 1, ics: "MO" },
  MON: { js: 1, ics: "MO" },
  MONDAY: { js: 1, ics: "MO" },
  T: { js: 2, ics: "TU" },
  TU: { js: 2, ics: "TU" },
  TUE: { js: 2, ics: "TU" },
  TUES: { js: 2, ics: "TU" },
  TUESDAY: { js: 2, ics: "TU" },
  W: { js: 3, ics: "WE" },
  WE: { js: 3, ics: "WE" },
  WED: { js: 3, ics: "WE" },
  WEDNESDAY: { js: 3, ics: "WE" },
  R: { js: 4, ics: "TH" },
  TH: { js: 4, ics: "TH" },
  THU: { js: 4, ics: "TH" },
  THUR: { js: 4, ics: "TH" },
  THURS: { js: 4, ics: "TH" },
  THURSDAY: { js: 4, ics: "TH" },
  F: { js: 5, ics: "FR" },
  FR: { js: 5, ics: "FR" },
  FRI: { js: 5, ics: "FR" },
  FRIDAY: { js: 5, ics: "FR" },
  S: { js: 6, ics: "SA" },
  SA: { js: 6, ics: "SA" },
  SAT: { js: 6, ics: "SA" },
  SATURDAY: { js: 6, ics: "SA" },
};

const defaultTermConfig = { startDate: "", endDate: "", exceptions: [] };

const sanitizeForFile = (value) => {
  if (!value) return "untitled";
  return (
    value
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 80) || "untitled"
  );
};

const pad2 = (num) => String(num).padStart(2, "0");

const formatLocalDate = (date) =>
  `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;

const formatLocalDateTime = (date) =>
  `${formatLocalDate(date)}T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

const formatUtcDateTime = (date) =>
  `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;

const escapeICS = (text) =>
  (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const foldICSLines = (lines) => {
  const maxLen = 75;
  const folded = [];
  lines.forEach((line) => {
    const stringLine = typeof line === "string" ? line : String(line || "");
    if (stringLine.length <= maxLen) {
      folded.push(stringLine);
      return;
    }
    folded.push(stringLine.slice(0, maxLen));
    let pos = maxLen;
    const continuationMax = maxLen - 1;
    while (pos < stringLine.length) {
      folded.push(` ${stringLine.slice(pos, pos + continuationMax)}`);
      pos += continuationMax;
    }
  });
  return folded;
};

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const cleaned = timeStr.toString().trim().toLowerCase();
  if (!cleaned) return null;

  let match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || "0", 10);
    const period = match[3].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return hour * 60 + minutes;
  }

  match = cleaned.match(/^(\d{1,2})(am|pm)$/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const period = match[2].toLowerCase();
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return hour * 60;
  }

  match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hour * 60 + minutes;
  }

  match = cleaned.match(/^(\d{1,2})(\d{2})$/);
  if (match) {
    const hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hour * 60 + minutes;
  }

  return null;
};

const ensureDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getMeetingPatterns = (schedule) => {
  if (
    Array.isArray(schedule?.meetingPatterns) &&
    schedule.meetingPatterns.length > 0
  ) {
    return schedule.meetingPatterns;
  }
  if (Array.isArray(schedule?.meetings) && schedule.meetings.length > 0) {
    return schedule.meetings;
  }
  if (schedule?.["Meeting Pattern"] || schedule?.Meetings) {
    return parseMeetingPatterns(
      schedule["Meeting Pattern"] || "",
      schedule.Meetings || "",
    );
  }
  if (schedule?.Day && (schedule["Start Time"] || schedule.startTime)) {
    return [
      {
        day: schedule.Day,
        startTime: schedule["Start Time"] || schedule.startTime,
        endTime: schedule["End Time"] || schedule.endTime,
      },
    ];
  }
  return [];
};

const splitRoomString = (value) => {
  if (!value || typeof value !== "string") return [];
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
};

const extractRoomNames = (schedule) => {
  const rooms = new Set();
  const addRoom = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      splitRoomString(value).forEach((room) => rooms.add(room));
      return;
    }
    const display = value?.displayName;
    if (display) {
      splitRoomString(display).forEach((room) => rooms.add(room));
    }
  };

  if (Array.isArray(schedule?.spaceDisplayNames)) {
    schedule.spaceDisplayNames.forEach(addRoom);
  }
  if (Array.isArray(schedule?.rooms)) {
    schedule.rooms.forEach(addRoom);
  }
  if (schedule?.room) {
    addRoom(schedule.room);
  }
  if (schedule?.Room) {
    splitRoomString(schedule.Room).forEach((room) => rooms.add(room));
  }
  return Array.from(rooms);
};

const buildVTimezone = () => [
  "BEGIN:VTIMEZONE",
  "TZID:America/Chicago",
  "X-LIC-LOCATION:America/Chicago",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0600",
  "TZOFFSETTO:-0500",
  "TZNAME:CDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0600",
  "TZNAME:CST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const OutlookRoomExport = () => {
  const { rawScheduleData = [] } = useData();
  const { availableSemesters = [], termOptions: termMetaOptions = [] } =
    useSchedules();
  const { showNotification } = useUI();
  const { termConfig, termConfigVersion } = useAppConfig();
  const { canAccess } = useAuth();
  const [termExceptions, setTermExceptions] = useState({});
  const [exceptionsLoaded, setExceptionsLoaded] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [exceptionDraft, setExceptionDraft] = useState({ date: "", label: "" });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const docRef = doc(db, COLLECTIONS.OUTLOOK_EXCEPTIONS, EXCEPTIONS_DOC_ID);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setExceptionsLoaded(true);
          return;
        }
        const data = snapshot.data() || {};
        const next = data?.termExceptions || {};
        setTermExceptions(next);
        setExceptionsLoaded(true);
      },
      (error) => {
        console.warn("Failed to load Outlook exceptions", error);
        setExceptionsLoaded(true);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (exceptionsLoaded) return;
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(EXCEPTIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          setTermExceptions(parsed);
          setExceptionsLoaded(true);
          return;
        }
      }
    } catch (error) {
      console.warn(error);
    }
    setExceptionsLoaded(true);
  }, [exceptionsLoaded]);

  const termLabels = useMemo(() => {
    const termsFromData = rawScheduleData
      .map((s) => normalizeTermLabel(s?.term || "", termConfig))
      .filter(Boolean);
    const combined = new Set(
      [...(availableSemesters || []), ...termsFromData]
        .map((term) => normalizeTermLabel(term || "", termConfig))
        .filter(Boolean),
    );
    return sortTerms(Array.from(combined).filter(Boolean), termConfig);
  }, [rawScheduleData, availableSemesters, termConfigVersion]);

  useEffect(() => {
    if (!selectedTerm && termLabels.length > 0) {
      setSelectedTerm(termLabels[0]);
    }
  }, [selectedTerm, termLabels]);

  const termMetaByLabel = useMemo(() => {
    const map = new Map();
    (termMetaOptions || []).forEach((term) => {
      if (term?.term) map.set(term.term, term);
      if (term?.termCode) map.set(term.termCode, term);
    });
    return map;
  }, [termMetaOptions]);

  const activeTermMeta = selectedTerm
    ? termMetaByLabel.get(selectedTerm)
    : null;
  const activeTermConfig = selectedTerm
    ? {
        startDate: normalizeTermDateValue(activeTermMeta?.startDate),
        endDate: normalizeTermDateValue(activeTermMeta?.endDate),
        exceptions: termExceptions[selectedTerm] || [],
      }
    : defaultTermConfig;

  const schedulesForTerm = useMemo(() => {
    if (!selectedTerm) return [];
    return rawScheduleData.filter(
      (schedule) => schedule?.term === selectedTerm,
    );
  }, [rawScheduleData, selectedTerm]);

  const roomsForTerm = useMemo(() => {
    const rooms = new Set();
    schedulesForTerm.forEach((schedule) => {
      extractRoomNames(schedule).forEach((room) => {
        if (!room) return;
        const normalized = room.trim();
        if (!normalized) return;
        const lower = normalized.toLowerCase();
        if (
          lower === "online" ||
          lower.includes("no room") ||
          lower.includes("general assignment")
        )
          return;
        rooms.add(normalized);
      });
    });
    return Array.from(rooms).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [schedulesForTerm]);

  useEffect(() => {
    setSelectedRooms(roomsForTerm);
  }, [roomsForTerm, selectedTerm]);

  const filteredRooms = useMemo(() => {
    const query = roomSearch.trim().toLowerCase();
    if (!query) return roomsForTerm;
    return roomsForTerm.filter((room) => room.toLowerCase().includes(query));
  }, [roomsForTerm, roomSearch]);

  const toggleRoom = (room) => {
    setSelectedRooms((prev) =>
      prev.includes(room) ? prev.filter((r) => r !== room) : [...prev, room],
    );
  };

  const setAllRooms = () => setSelectedRooms(roomsForTerm);
  const clearAllRooms = () => setSelectedRooms([]);

  const updateExceptions = async (nextExceptions) => {
    if (!selectedTerm) return;
    if (!canAccess("scheduling/rooms")) {
      showNotification?.(
        "warning",
        "Permission Denied",
        "You do not have permission to update shared exceptions.",
      );
      return;
    }
    const previousExceptions = termExceptions[selectedTerm] || [];
    const next = {
      ...termExceptions,
      [selectedTerm]: nextExceptions,
    };
    setTermExceptions(next);
    try {
      await setDoc(
        doc(db, COLLECTIONS.OUTLOOK_EXCEPTIONS, EXCEPTIONS_DOC_ID),
        {
          termExceptions: next,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (error) {
      console.warn("Failed to save Outlook exceptions", error);
      showNotification?.(
        "warning",
        "Save failed",
        "Unable to save exceptions. Please try again.",
      );
      setTermExceptions((prev) => ({
        ...prev,
        [selectedTerm]: previousExceptions,
      }));
    }
  };

  const removeException = (index) => {
    const next = (activeTermConfig.exceptions || []).filter(
      (_, i) => i !== index,
    );
    updateExceptions(next);
  };

  const addException = async () => {
    const trimmedLabel = exceptionDraft.label.trim();
    if (!exceptionDraft.date) {
      return;
    }
    const newException = { date: exceptionDraft.date, label: trimmedLabel };
    const uniqueKey = `${exceptionDraft.date}|${trimmedLabel.toLowerCase()}`;
    const existingKeys = new Set(
      (activeTermConfig.exceptions || []).map(
        (ex) => `${ex.date}|${(ex.label || "").toLowerCase()}`,
      ),
    );
    if (existingKeys.has(uniqueKey)) {
      setExceptionDraft({ date: "", label: "" });
      return;
    }
    await updateExceptions([
      ...(activeTermConfig.exceptions || []),
      newException,
    ]);
    setExceptionDraft({ date: "", label: "" });
  };

  const validateBeforeExport = () => {
    if (!selectedTerm) {
      showNotification?.(
        "warning",
        "Select a semester",
        "Choose a semester to export calendars for.",
      );
      return false;
    }
    if (!activeTermConfig.startDate || !activeTermConfig.endDate) {
      showNotification?.(
        "warning",
        "Provide semester dates",
        "Set the start and end dates for this semester in App Settings before exporting.",
      );
      return false;
    }
    const start = ensureDate(activeTermConfig.startDate);
    const end = ensureDate(activeTermConfig.endDate);
    if (!start || !end || end < start) {
      showNotification?.(
        "warning",
        "Invalid semester dates",
        "Ensure the semester start and end dates are valid and in chronological order.",
      );
      return false;
    }
    if (!selectedRooms || selectedRooms.length === 0) {
      showNotification?.(
        "warning",
        "Choose rooms",
        "Select at least one room to export.",
      );
      return false;
    }
    return true;
  };

  const computeFirstOccurrence = (startDate, jsDay) => {
    const first = new Date(startDate.getTime());
    while (first.getDay() !== jsDay) {
      first.setDate(first.getDate() + 1);
    }
    return first;
  };

  const computeFirstOccurrenceForDays = (startDate, jsDays) => {
    const allowed = new Set(jsDays);
    const first = new Date(startDate.getTime());
    for (let i = 0; i < 14; i++) {
      if (allowed.has(first.getDay())) return first;
      first.setDate(first.getDate() + 1);
    }
    return first;
  };

  const groupPatternsByTime = (patterns, schedule, config) => {
    const termStart = ensureDate(config.startDate);
    const termEnd = ensureDate(config.endDate);
    if (!termStart || !termEnd || termEnd < termStart) return [];

    const groups = new Map();
    patterns.forEach((p) => {
      const startMinutes = parseTimeToMinutes(p?.startTime);
      const endMinutes = parseTimeToMinutes(p?.endTime);
      const dayKey = (p?.day || "").toString().trim().toUpperCase();
      const meta = dayMetadata[dayKey];
      if (
        !meta ||
        startMinutes == null ||
        endMinutes == null ||
        endMinutes <= startMinutes
      )
        return;

      const key = `${startMinutes}-${endMinutes}`;
      const patternStart =
        ensureDate(p?.startDate) ||
        ensureDate(schedule?.startDate) ||
        termStart;
      const patternEnd =
        ensureDate(p?.endDate) || ensureDate(schedule?.endDate) || termEnd;

      const existing = groups.get(key) || {
        startMinutes,
        endMinutes,
        jsDays: new Set(),
        icsDays: new Set(),
        effectiveStart: termStart,
        effectiveEnd: termEnd,
      };

      existing.jsDays.add(meta.js);
      existing.icsDays.add(meta.ics);
      // Intersect date ranges across patterns in this group
      existing.effectiveStart =
        patternStart > existing.effectiveStart
          ? patternStart
          : existing.effectiveStart;
      existing.effectiveEnd =
        patternEnd < existing.effectiveEnd ? patternEnd : existing.effectiveEnd;

      groups.set(key, existing);
    });

    return Array.from(groups.values()).filter(
      (g) => g.effectiveEnd >= g.effectiveStart,
    );
  };

  const generateCombinedEventLines = (
    room,
    schedule,
    group,
    config,
    exceptions,
  ) => {
    if (!group || !group.jsDays || group.jsDays.size === 0)
      return { lines: [], count: 0 };

    const termStart = ensureDate(config.startDate);
    const termEnd = ensureDate(config.endDate);
    if (!termStart || !termEnd || termEnd < termStart)
      return { lines: [], count: 0 };

    const effectiveStart =
      group.effectiveStart > termStart ? group.effectiveStart : termStart;
    const effectiveEnd =
      group.effectiveEnd < termEnd ? group.effectiveEnd : termEnd;
    if (effectiveEnd < effectiveStart) return { lines: [], count: 0 };

    const firstOccurrence = computeFirstOccurrenceForDays(
      effectiveStart,
      Array.from(group.jsDays),
    );
    if (firstOccurrence > effectiveEnd) return { lines: [], count: 0 };

    const startDateTime = new Date(
      firstOccurrence.getFullYear(),
      firstOccurrence.getMonth(),
      firstOccurrence.getDate(),
      Math.floor(group.startMinutes / 60),
      group.startMinutes % 60,
      0,
    );
    const endDateTime = new Date(
      firstOccurrence.getFullYear(),
      firstOccurrence.getMonth(),
      firstOccurrence.getDate(),
      Math.floor(group.endMinutes / 60),
      group.endMinutes % 60,
      0,
    );

    const untilDate = new Date(
      effectiveEnd.getFullYear(),
      effectiveEnd.getMonth(),
      effectiveEnd.getDate(),
      23,
      59,
      59,
      0,
    );

    const exceptionLines = (exceptions || [])
      .map((ex) => ensureDate(ex.date))
      .filter(
        (date) =>
          date &&
          date >= effectiveStart &&
          date <= effectiveEnd &&
          group.jsDays.has(date.getDay()),
      )
      .map((date) => {
        const exDateTime = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          Math.floor(group.startMinutes / 60),
          group.startMinutes % 60,
          0,
        );
        return `EXDATE;TZID=America/Chicago:${formatLocalDateTime(exDateTime)}`;
      });

    const baseName =
      schedule?.courseCode || schedule?.Course || schedule?.title || "Class";
    const summary = [
      baseName,
      schedule?.section ? String(schedule.section) : null,
    ]
      .filter(Boolean)
      .join(" - ");

    const descriptionLines = [];
    if (schedule?.courseTitle || schedule?.["Course Title"])
      descriptionLines.push(
        `Title: ${schedule.courseTitle || schedule["Course Title"]}`,
      );
    if (schedule?.instructorName || schedule?.Instructor)
      descriptionLines.push(
        `Instructor: ${schedule.instructorName || schedule.Instructor}`,
      );
    if (schedule?.crn || schedule?.CRN)
      descriptionLines.push(`CRN: ${schedule.crn || schedule.CRN}`);
    if (schedule?.term) descriptionLines.push(`Semester: ${schedule.term}`);
    if (schedule?.notes) descriptionLines.push(schedule.notes);

    const icsDaysSorted = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].filter(
      (d) => group.icsDays.has(d),
    );
    const byday = icsDaysSorted.join(",");

    const uid = `${sanitizeForFile(room)}-${schedule?.id || schedule?._originalId || "schedule"}-${byday}-${formatLocalDate(startDateTime)}-${pad2(startDateTime.getHours())}${pad2(startDateTime.getMinutes())}`;

    const lines = [
      "BEGIN:VEVENT",
      `UID:${escapeICS(uid)}@faculty-schedules`,
      `DTSTAMP:${formatUtcDateTime(new Date())}`,
      `SUMMARY:${escapeICS(summary)}`,
      `LOCATION:${escapeICS(room)}`,
      `DTSTART;TZID=America/Chicago:${formatLocalDateTime(startDateTime)}`,
      `DTEND;TZID=America/Chicago:${formatLocalDateTime(endDateTime)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${formatUtcDateTime(untilDate)}`,
    ];

    if (descriptionLines.length > 0) {
      lines.splice(
        4,
        0,
        `DESCRIPTION:${escapeICS(descriptionLines.join("\n"))}`,
      );
    }

    if (exceptionLines.length > 0) {
      lines.push(...exceptionLines);
    }

    lines.push("END:VEVENT");

    return { lines, count: 1 };
  };

  const generateCalendarForRoom = (room) => {
    const config = activeTermConfig;
    const header = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//faculty-schedules//OutlookRoomExport//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-TIMEZONE:America/Chicago",
      `X-WR-CALNAME:${escapeICS(`${room} - ${selectedTerm}`)}`,
    ];

    const exceptions = config.exceptions || [];
    const lines = [...header, ...buildVTimezone()];
    let eventCount = 0;

    schedulesForTerm.forEach((schedule) => {
      const spaceLabels = extractRoomNames(schedule).map((name) => name.trim());
      if (!spaceLabels.includes(room)) {
        return;
      }
      const patterns = getMeetingPatterns(schedule);
      const groups = groupPatternsByTime(patterns, schedule, config);
      groups.forEach((group) => {
        const { lines: eventLines, count } = generateCombinedEventLines(
          room,
          schedule,
          group,
          config,
          exceptions,
        );
        if (count > 0) {
          lines.push(...eventLines);
          eventCount += count;
        }
      });
    });

    lines.push("END:VCALENDAR");
    const folded = foldICSLines(lines);
    return { ics: `${folded.join("\r\n")}\r\n`, count: eventCount };
  };

  const performDownload = async (mode) => {
    if (!validateBeforeExport()) return;
    setExporting(true);
    try {
      const timestamp = new Date();
      const dateTag = `${timestamp.getFullYear()}${pad2(timestamp.getMonth() + 1)}${pad2(timestamp.getDate())}`;
      const termTag = sanitizeForFile(selectedTerm);

      if (mode === "zip") {
        const zip = new JSZip();
        let totalEvents = 0;
        selectedRooms.forEach((room) => {
          const { ics, count } = generateCalendarForRoom(room);
          if (count > 0) {
            const roomTag = sanitizeForFile(room);
            zip.file(`${roomTag}.ics`, ics);
            totalEvents += count;
          }
        });
        const blob = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `rooms-${termTag}-${dateTag}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showNotification?.(
          "success",
          "ZIP ready",
          "Multi-room Outlook calendar export created successfully.",
        );
      } else {
        let totalEvents = 0;
        selectedRooms.forEach((room) => {
          const { ics, count } = generateCalendarForRoom(room);
          if (count === 0) return;
          totalEvents += count;
          const roomTag = sanitizeForFile(room);
          const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${roomTag}-${termTag}-${dateTag}.ics`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        });
        showNotification?.(
          "success",
          "Download complete",
          "Outlook calendar files generated for the selected rooms.",
        );
      }
    } catch (error) {
      console.error("Failed to generate ICS export", error);
      showNotification?.(
        "error",
        "Export failed",
        "Something went wrong while generating the calendar files.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-5 border-b border-gray-200 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-baylor-green/10 text-baylor-green flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Export to Outlook (.ics)
              </h1>
              <p className="text-sm text-gray-600">
                Create room-based calendar files with America/Chicago timezone
                and holiday exceptions.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => performDownload("ics")}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-baylor-green px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-baylor-green/90 disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              {exporting ? "Preparing…" : "Download per-room ICS"}
            </button>
            <button
              type="button"
              onClick={() => performDownload("zip")}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600/90 disabled:opacity-60"
            >
              <FileArchive className="w-4 h-4" />
              {exporting ? "Packaging…" : "Download multi-room ZIP"}
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Semester
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
                  value={selectedTerm}
                  onChange={(event) => setSelectedTerm(event.target.value)}
                >
                  {termLabels.length === 0 && (
                    <option value="">No semesters available</option>
                  )}
                  {termLabels.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Semester start date
                  </label>
                  <input
                    type="date"
                    value={activeTermConfig.startDate}
                    readOnly
                    disabled
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Semester end date
                  </label>
                  <input
                    type="date"
                    value={activeTermConfig.endDate}
                    readOnly
                    disabled
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>
                  Semester dates come from App Settings so they stay consistent
                  across the app. Holiday exceptions are shared with other
                  users.
                </p>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-baylor-green" /> Rooms for{" "}
                      {selectedTerm || "semester"}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {roomsForTerm.length} rooms detected —{" "}
                      {selectedRooms.length} selected for export.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={setAllRooms}
                      className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-white"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearAllRooms}
                      className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-white"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <input
                  type="search"
                  value={roomSearch}
                  onChange={(event) => setRoomSearch(event.target.value)}
                  placeholder="Search rooms…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
                />
                <div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-white bg-white p-3 sm:grid-cols-2">
                  {filteredRooms.length === 0 && (
                    <div className="col-span-full text-sm text-gray-500">
                      No rooms match the current filters.
                    </div>
                  )}
                  {filteredRooms.map((room) => {
                    const checked = selectedRooms.includes(room);
                    return (
                      <label
                        key={room}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${checked ? "border-baylor-green bg-baylor-green/5 text-baylor-green" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRoom(room)}
                          className="h-4 w-4 text-baylor-green focus:ring-baylor-green"
                        />
                        <span className="truncate">{room}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white/60 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Holiday & no-class exceptions
                </h2>
                <p className="text-sm text-gray-600">
                  Dates listed here will become EXDATE entries in the exported
                  calendars.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={exceptionDraft.date}
                  onChange={(event) =>
                    setExceptionDraft((prev) => ({
                      ...prev,
                      date: event.target.value,
                    }))
                  }
                  disabled={!canAccess("scheduling/rooms")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label (optional)
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={exceptionDraft.label}
                    onChange={(event) =>
                      setExceptionDraft((prev) => ({
                        ...prev,
                        label: event.target.value,
                      }))
                    }
                    placeholder="e.g., Labor Day"
                    disabled={!canAccess("scheduling/rooms")}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={addException}
                    disabled={
                      !exceptionDraft.date || !canAccess("scheduling/rooms")
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-baylor-green px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-baylor-green/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="w-4 h-4" />
                    Add date
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
                    >
                      Label
                    </th>
                    <th scope="col" className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(activeTermConfig.exceptions || []).length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-4 text-sm text-gray-500 text-center"
                      >
                        No exception dates added yet.
                      </td>
                    </tr>
                  )}
                  {(activeTermConfig.exceptions || []).map(
                    (exception, index) => (
                      <tr key={`${exception.date}-${exception.label}-${index}`}>
                        <td className="px-4 py-2 text-sm text-gray-800">
                          {exception.date
                            ? new Date(
                                `${exception.date}T00:00:00`,
                              ).toLocaleDateString()
                            : ""}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {exception.label || (
                            <span className="text-gray-400">(no label)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeException(index)}
                            className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                            disabled={!canAccess("scheduling/rooms")}
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white/60 p-5">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Export
              summary
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase text-gray-500">
                  Selected semester
                </div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {selectedTerm || "—"}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase text-gray-500">
                  Rooms to export
                </div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {selectedRooms.length}
                </div>
                <div className="text-xs text-gray-500">
                  of {roomsForTerm.length} detected
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase text-gray-500">
                  Exception dates
                </div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {(activeTermConfig.exceptions || []).length}
                </div>
                <div className="text-xs text-gray-500">
                  Applied to matching weekdays
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default OutlookRoomExport;
