/**
 * Reservation utilities
 *
 * Self-serve room reservations that sit on top of the authoritative CLSS class
 * schedule. The official schedule is the ground-truth occupancy layer; staff
 * reserve department rooms in the gaps. Reservations are stored in the app's own
 * Firestore (collection: reservations) — no university systems are touched.
 *
 * The conflict-detection functions are pure (no Firestore) so they can be unit
 * tested and reused by the UI's live preview.
 */

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../firebase";
import { parseTime } from "./timeUtils";
import { splitMultiRoom } from "./locationService";
import { dayMetadata } from "./icsUtils";

/** Two [start,end) minute ranges overlap. */
export const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  if (
    !Number.isFinite(aStart) ||
    !Number.isFinite(aEnd) ||
    !Number.isFinite(bStart) ||
    !Number.isFinite(bEnd)
  ) {
    return false;
  }
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
};

/** Local JS weekday (0=Sun..6=Sat) for a "YYYY-MM-DD" date string. */
export const weekdayFromDateStr = (dateStr) => {
  if (!dateStr) return null;
  const parsed = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getDay();
};

/** Map a schedule row's Day token (M/T/W/R/F/Mon/Monday/...) to a JS weekday. */
export const weekdayFromDayToken = (token) => {
  if (!token) return null;
  const meta = dayMetadata[token.toString().trim().toUpperCase()];
  return meta ? meta.js : null;
};

/** Whether a schedule row is held in the given room display label. */
export const roomMatchesLabel = (row, roomLabel) => {
  if (!row || !roomLabel) return false;
  const target = roomLabel.toString().trim().toLowerCase();
  return splitMultiRoom(row.Room || "").some(
    (r) => r.toString().trim().toLowerCase() === target,
  );
};

const isWithinTerm = (dateStr, termStart, termEnd) => {
  if (!termStart || !termEnd) return true; // no window provided → assume in session
  const d = new Date(`${dateStr}T00:00:00`).getTime();
  const start = new Date(`${termStart}T00:00:00`).getTime();
  const end = new Date(`${termEnd}T23:59:59`).getTime();
  if (Number.isNaN(d) || Number.isNaN(start) || Number.isNaN(end)) return true;
  return d >= start && d <= end;
};

/**
 * Class sections that conflict with a proposed reservation.
 * @returns {Array} matching schedule rows (one per meeting)
 */
export const findClassConflicts = ({
  scheduleData = [],
  roomLabel,
  dateStr,
  startMinutes,
  endMinutes,
  termStart,
  termEnd,
}) => {
  if (!roomLabel || !dateStr) return [];
  if (!isWithinTerm(dateStr, termStart, termEnd)) return [];
  const weekday = weekdayFromDateStr(dateStr);
  if (weekday == null) return [];

  return scheduleData.filter((row) => {
    if (weekdayFromDayToken(row.Day) !== weekday) return false;
    if (!roomMatchesLabel(row, roomLabel)) return false;
    const rowStart = parseTime(row["Start Time"]);
    const rowEnd = parseTime(row["End Time"]);
    return rangesOverlap(startMinutes, endMinutes, rowStart, rowEnd);
  });
};

/**
 * Existing reservations that conflict with a proposed reservation.
 */
export const findReservationConflicts = ({
  reservations = [],
  spaceKey,
  dateStr,
  startMinutes,
  endMinutes,
  ignoreId = null,
}) => {
  if (!dateStr || !spaceKey) return [];
  return reservations.filter((res) => {
    if (!res || res.id === ignoreId) return false;
    if (res.status === "cancelled") return false;
    if (res.date !== dateStr) return false;
    if (res.spaceKey !== spaceKey) return false;
    return rangesOverlap(
      startMinutes,
      endMinutes,
      res.startMinutes,
      res.endMinutes,
    );
  });
};

/**
 * Combined conflict check for the booking form.
 * @returns {{ classConflicts, reservationConflicts, outOfTerm, hasConflict }}
 */
export const checkConflicts = ({
  scheduleData = [],
  reservations = [],
  roomLabel,
  spaceKey,
  dateStr,
  startMinutes,
  endMinutes,
  termStart,
  termEnd,
  ignoreId = null,
}) => {
  const outOfTerm = !isWithinTerm(dateStr, termStart, termEnd);
  const classConflicts = findClassConflicts({
    scheduleData,
    roomLabel,
    dateStr,
    startMinutes,
    endMinutes,
    termStart,
    termEnd,
  });
  const reservationConflicts = findReservationConflicts({
    reservations,
    spaceKey,
    dateStr,
    startMinutes,
    endMinutes,
    ignoreId,
  });
  return {
    classConflicts,
    reservationConflicts,
    outOfTerm,
    hasConflict:
      classConflicts.length > 0 || reservationConflicts.length > 0,
  };
};

// ============================================================================
// Firestore
// ============================================================================

export const subscribeReservations = (callback, onError) => {
  const q = query(
    collection(db, COLLECTIONS.RESERVATIONS),
    orderBy("date", "asc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(rows);
    },
    (error) => {
      console.warn("Failed to load reservations", error);
      onError?.(error);
    },
  );
};

export const createReservation = async (data) => {
  const payload = {
    ...data,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, COLLECTIONS.RESERVATIONS), payload);
  return ref.id;
};

export const deleteReservation = async (id) => {
  if (!id) return;
  await deleteDoc(doc(db, COLLECTIONS.RESERVATIONS, id));
};
