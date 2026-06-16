import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Download,
  Trash2,
  Users,
  Info,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useSchedules } from "../../contexts/ScheduleContext";
import { useUI } from "../../contexts/UIContext";
import { useAuth } from "../../contexts/AuthContext";
import { parseTermDate } from "../../utils/termUtils";
import { formatMinutesToTime, formatMinutesToLabel } from "../../utils/timeUtils";
import { buildSingleEventICS, downloadICS, sanitizeForFile } from "../../utils/icsUtils";
import {
  checkConflicts,
  createReservation,
  deleteReservation,
  subscribeReservations,
  findClassConflicts,
} from "../../utils/reservationUtils";

import SelectDropdown from "../SelectDropdown";
const TIMELINE_START = 7 * 60; // 7:00 AM
const TIMELINE_END = 21 * 60; // 9:00 PM
const TIMELINE_SPAN = TIMELINE_END - TIMELINE_START;

const VIRTUAL_TYPES = new Set(["online", "virtual", "remote"]);

const timeStrToMinutes = (value) => {
  if (!value || typeof value !== "string" || !value.includes(":")) return null;
  const [h, m] = value.split(":").map((part) => parseInt(part, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const toDateInputValue = (dateLike) => {
  if (!dateLike) return "";
  const d = dateLike instanceof Date ? dateLike : parseTermDate(dateLike);
  if (!d || Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayStr = () => toDateInputValue(new Date());

const RoomReservations = () => {
  const { scheduleData = [], spacesList = [], selectedSemester } = useData();
  const { selectedTermMeta } = useSchedules();
  const { showNotification } = useUI();
  const { canAccess, user, profile } = useAuth();

  const canManage = canAccess("scheduling/rooms");
  const currentEmail = user?.email || profile?.email || "";

  const [reservations, setReservations] = useState([]);
  const [form, setForm] = useState({
    spaceKey: "",
    date: todayStr(),
    start: "12:00",
    end: "13:00",
    title: "",
    requesterName: profile?.displayName || profile?.name || "",
    requesterEmail: currentEmail,
    purpose: "",
    headcount: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeReservations(setReservations);
    return () => unsubscribe?.();
  }, []);

  // Department-bookable rooms = the department's own physical spaces.
  const bookableRooms = useMemo(() => {
    return spacesList
      .filter((space) => {
        const type = (space.spaceType || space.type || "").toString().toLowerCase();
        if (VIRTUAL_TYPES.has(type)) return false;
        return Boolean(space.spaceKey && space.displayName);
      })
      .sort((a, b) =>
        (a.displayName || "").localeCompare(b.displayName || "", undefined, {
          numeric: true,
        }),
      );
  }, [spacesList]);

  const selectedSpace = useMemo(
    () => bookableRooms.find((s) => s.spaceKey === form.spaceKey) || null,
    [bookableRooms, form.spaceKey],
  );

  const termStart = toDateInputValue(selectedTermMeta?.startDate);
  const termEnd = toDateInputValue(selectedTermMeta?.endDate);

  const scheduleForTerm = useMemo(
    () => scheduleData.filter((row) => !selectedSemester || row.Term === selectedSemester),
    [scheduleData, selectedSemester],
  );

  const startMinutes = timeStrToMinutes(form.start);
  const endMinutes = timeStrToMinutes(form.end);
  const validTimes =
    startMinutes != null && endMinutes != null && endMinutes > startMinutes;

  const roomLabel = selectedSpace?.displayName || "";

  // Occupancy for the selected room + date (class blocks + reservations).
  const dayClassBlocks = useMemo(() => {
    if (!roomLabel || !form.date) return [];
    return findClassConflicts({
      scheduleData: scheduleForTerm,
      roomLabel,
      dateStr: form.date,
      startMinutes: TIMELINE_START,
      endMinutes: TIMELINE_END,
      termStart,
      termEnd,
    }).map((row) => ({
      kind: "class",
      label: `${row.Course || "Class"}${row.Section ? ` · ${row.Section}` : ""}`,
      sub: row.Instructor || "",
      start: timeStrToMinutesFromDisplay(row["Start Time"]),
      end: timeStrToMinutesFromDisplay(row["End Time"]),
    }))
      .filter((b) => b.start != null && b.end != null);
  }, [roomLabel, form.date, scheduleForTerm, termStart, termEnd]);

  const dayReservationBlocks = useMemo(() => {
    if (!form.spaceKey || !form.date) return [];
    return reservations
      .filter(
        (r) =>
          r.spaceKey === form.spaceKey &&
          r.date === form.date &&
          r.status !== "cancelled",
      )
      .map((r) => ({
        kind: "reservation",
        label: r.title || "Reservation",
        sub: r.requesterName || "",
        start: r.startMinutes,
        end: r.endMinutes,
      }));
  }, [reservations, form.spaceKey, form.date]);

  const occupancyBlocks = useMemo(
    () => [...dayClassBlocks, ...dayReservationBlocks].sort((a, b) => a.start - b.start),
    [dayClassBlocks, dayReservationBlocks],
  );

  const conflict = useMemo(() => {
    if (!roomLabel || !form.date || !validTimes) return null;
    return checkConflicts({
      scheduleData: scheduleForTerm,
      reservations,
      roomLabel,
      spaceKey: form.spaceKey,
      dateStr: form.date,
      startMinutes,
      endMinutes,
      termStart,
      termEnd,
    });
  }, [
    roomLabel,
    form.date,
    form.spaceKey,
    validTimes,
    scheduleForTerm,
    reservations,
    startMinutes,
    endMinutes,
    termStart,
    termEnd,
  ]);

  const restricted = useMemo(() => {
    const type = (selectedSpace?.spaceType || selectedSpace?.type || "")
      .toString()
      .toLowerCase();
    return type.includes("lab") || type.includes("studio");
  }, [selectedSpace]);

  const canSubmit =
    canManage &&
    selectedSpace &&
    form.date &&
    validTimes &&
    form.title.trim() &&
    conflict &&
    !conflict.hasConflict &&
    !saving;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await createReservation({
        spaceKey: selectedSpace.spaceKey,
        roomDisplay: selectedSpace.displayName,
        buildingCode: selectedSpace.buildingCode || "",
        buildingDisplayName: selectedSpace.buildingDisplayName || "",
        date: form.date,
        startMinutes,
        endMinutes,
        startTime: formatMinutesToTime(startMinutes),
        endTime: formatMinutesToTime(endMinutes),
        title: form.title.trim(),
        requesterName: form.requesterName.trim(),
        requesterEmail: form.requesterEmail.trim(),
        purpose: form.purpose.trim(),
        headcount: form.headcount ? Number(form.headcount) : null,
        createdBy: currentEmail,
      });
      showNotification?.(
        "success",
        "Room booked",
        `${selectedSpace.displayName} reserved for ${form.date}.`,
      );
      setForm((prev) => ({ ...prev, title: "", purpose: "", headcount: "" }));
    } catch (error) {
      console.error("Failed to create reservation", error);
      showNotification?.(
        "error",
        "Booking failed",
        "Could not save the reservation. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (reservation) => {
    if (!canManage) return;
    try {
      await deleteReservation(reservation.id);
      showNotification?.("success", "Reservation cancelled", "");
    } catch (error) {
      console.error("Failed to cancel reservation", error);
      showNotification?.("error", "Cancel failed", "Please try again.");
    }
  };

  const handleExport = (reservation) => {
    const ics = buildSingleEventICS({
      summary: reservation.title,
      location: reservation.roomDisplay,
      description: [
        reservation.purpose,
        reservation.requesterName ? `Requested by: ${reservation.requesterName}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      date: reservation.date,
      startMinutes: reservation.startMinutes,
      endMinutes: reservation.endMinutes,
      uid: `reservation-${reservation.id}`,
    });
    downloadICS(
      `${sanitizeForFile(reservation.roomDisplay)}-${reservation.date}`,
      ics,
    );
  };

  const upcoming = useMemo(() => {
    const today = todayStr();
    return reservations
      .filter((r) => r.status !== "cancelled" && r.date >= today)
      .sort((a, b) =>
        a.date === b.date
          ? (a.startMinutes || 0) - (b.startMinutes || 0)
          : a.date.localeCompare(b.date),
      );
  }, [reservations]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-serif font-semibold text-baylor-green flex items-center gap-2">
          <CalendarPlus className="w-5 h-5" /> Room reservations
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Reserve department rooms in the gaps around the official class schedule.
          Conflicts with classes and other reservations are checked automatically.
        </p>
      </div>

      {!canManage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex gap-2">
          <Info className="w-5 h-5 flex-shrink-0" />
          You can view reservations but need room-scheduling access to create them.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking form */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
              <SelectDropdown
                data-tutorial="reservation-room"
                value={form.spaceKey}
                onChange={(e) => setField("spaceKey", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
              >
                <option value="">Select a room…</option>
                {bookableRooms.map((space) => (
                  <option key={space.spaceKey} value={space.spaceKey}>
                    {space.displayName}
                    {space.capacity ? ` (cap ${space.capacity})` : ""}
                  </option>
                ))}
              </SelectDropdown>
              {restricted && (
                <p className="mt-1 text-xs text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Lab/studio — confirm swipe access before scheduling.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                data-tutorial="reservation-date"
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
              />
            </div>
            <div className="grid grid-cols-2 gap-2" data-tutorial="reservation-times">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <input
                  type="time"
                  value={form.start}
                  onChange={(e) => setField("start", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                <input
                  type="time"
                  value={form.end}
                  onChange={(e) => setField("end", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Event title
              </label>
              <input
                data-tutorial="reservation-title"
                type="text"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="e.g., CFS Retreat, faculty search lunch"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Requested by
              </label>
              <input
                type="text"
                value={form.requesterName}
                onChange={(e) => setField("requesterName", e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Headcount
              </label>
              <input
                type="number"
                min="0"
                value={form.headcount}
                onChange={(e) => setField("headcount", e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={form.purpose}
                onChange={(e) => setField("purpose", e.target.value)}
                placeholder="Optional details"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
              />
            </div>
          </div>

          {/* Conflict / capacity feedback */}
          {selectedSpace && validTimes && conflict && (
            <ConflictBanner
              conflict={conflict}
              capacity={selectedSpace.capacity}
              headcount={form.headcount}
            />
          )}
          {selectedSpace && !validTimes && (
            <p className="text-sm text-red-600">End time must be after start time.</p>
          )}

          <button
            type="button"
            data-tutorial="reservation-book"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-baylor-green px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-baylor-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            {saving ? "Booking…" : "Book room"}
          </button>
        </div>

        {/* Day timeline */}
        <div
          className="bg-white border border-gray-200 rounded-xl p-5"
          data-tutorial="reservation-timeline"
        >
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-baylor-green" />
            {selectedSpace ? selectedSpace.displayName : "Select a room"} ·{" "}
            {form.date || "—"}
          </h3>
          {!selectedSpace ? (
            <p className="text-sm text-gray-500">
              Choose a room and date to see what's already scheduled.
            </p>
          ) : (
            <DayTimeline
              blocks={occupancyBlocks}
              proposed={
                validTimes
                  ? { start: startMinutes, end: endMinutes, ok: conflict && !conflict.hasConflict }
                  : null
              }
            />
          )}
        </div>
      </div>

      {/* Upcoming reservations */}
      <div
        className="bg-white border border-gray-200 rounded-xl p-5"
        data-tutorial="reservation-list"
      >
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          Upcoming reservations ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500">No upcoming reservations.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="university-table min-w-full">
              <thead>
                <tr>
                  <th className="table-header-cell">Date</th>
                  <th className="table-header-cell">Time</th>
                  <th className="table-header-cell">Room</th>
                  <th className="table-header-cell">Event</th>
                  <th className="table-header-cell">Requested by</th>
                  <th className="table-header-cell" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((r) => (
                  <tr key={r.id}>
                    <td className="table-cell text-gray-800">{r.date}</td>
                    <td className="table-cell text-gray-700">
                      {r.startTime} – {r.endTime}
                    </td>
                    <td className="table-cell text-gray-700 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      {r.roomDisplay}
                    </td>
                    <td className="table-cell text-gray-800">
                      {r.title}
                      {r.headcount ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500">
                          <Users className="w-3 h-3" />
                          {r.headcount}
                        </span>
                      ) : null}
                    </td>
                    <td className="table-cell text-gray-600">{r.requesterName || "—"}</td>
                    <td className="table-cell text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleExport(r)}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Outlook
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleCancel(r)}
                          className="ml-2 inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// Display-time strings (e.g., "9:30 AM") → minutes. Reuses the schedule's own format.
function timeStrToMinutesFromDisplay(value) {
  if (!value) return null;
  const cleaned = value.toString().trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || "0", 10);
  const period = match[3];
  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

const ConflictBanner = ({ conflict, capacity, headcount }) => {
  const overCapacity =
    capacity && headcount && Number(headcount) > Number(capacity);
  if (conflict.hasConflict) {
    const items = [
      ...conflict.classConflicts.map(
        (c) => `${c.Course || "Class"} (${c["Start Time"]}–${c["End Time"]})`,
      ),
      ...conflict.reservationConflicts.map(
        (r) => `${r.title} (${r.startTime}–${r.endTime})`,
      ),
    ];
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4" />
          Time conflict — choose another slot
        </div>
        <ul className="mt-1 ml-6 list-disc">
          {items.map((label, i) => (
            <li key={i}>{label}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4" />
      Room is free at this time.
      {conflict.outOfTerm && (
        <span className="text-emerald-700">
          (No classes meet this date in the selected term.)
        </span>
      )}
      {overCapacity && (
        <span className="ml-1 text-amber-700">
          Note: headcount exceeds room capacity ({capacity}).
        </span>
      )}
    </div>
  );
};

const blockStyle = (start, end) => {
  const top = ((Math.max(start, TIMELINE_START) - TIMELINE_START) / TIMELINE_SPAN) * 100;
  const height =
    ((Math.min(end, TIMELINE_END) - Math.max(start, TIMELINE_START)) / TIMELINE_SPAN) * 100;
  return { top: `${top}%`, height: `${Math.max(height, 2)}%` };
};

const DayTimeline = ({ blocks, proposed }) => {
  const hourMarks = [];
  for (let m = TIMELINE_START; m <= TIMELINE_END; m += 120) {
    hourMarks.push(m);
  }
  return (
    <div className="relative" style={{ height: 420 }}>
      <div className="absolute inset-0 ml-14">
        {hourMarks.map((m) => (
          <div
            key={m}
            className="absolute left-0 right-0 border-t border-gray-100"
            style={{ top: `${((m - TIMELINE_START) / TIMELINE_SPAN) * 100}%` }}
          >
            <span className="absolute -left-14 -top-2 text-xs text-gray-400">
              {formatMinutesToLabel(m)}
            </span>
          </div>
        ))}
        {blocks.map((b, i) => (
          <div
            key={i}
            className={`absolute left-0 right-1 rounded-md px-2 py-0.5 text-xs overflow-hidden ${
              b.kind === "class"
                ? "bg-baylor-green/15 border border-baylor-green/30 text-baylor-green"
                : "bg-blue-100 border border-blue-300 text-blue-800"
            }`}
            style={blockStyle(b.start, b.end)}
            title={`${b.label} ${formatMinutesToTime(b.start)}–${formatMinutesToTime(b.end)}`}
          >
            <div className="font-medium truncate">{b.label}</div>
            <div className="truncate opacity-80">
              {formatMinutesToTime(b.start)}–{formatMinutesToTime(b.end)}
            </div>
          </div>
        ))}
        {proposed && (
          <div
            className={`absolute left-0 right-1 rounded-md border-2 border-dashed ${
              proposed.ok ? "border-emerald-500 bg-emerald-50/40" : "border-red-500 bg-red-50/40"
            }`}
            style={blockStyle(proposed.start, proposed.end)}
          />
        )}
      </div>
    </div>
  );
};

export default RoomReservations;
