import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { doc, onSnapshot, runTransaction } from "firebase/firestore";
import { pad2, sanitizeForFile } from "../../utils/icsUtils";
import {
  buildRoomCalendarExport,
  getDetectedRoomReferences,
} from "../../utils/roomCalendarExport";
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

import SelectDropdown from "../SelectDropdown";
const EXCEPTIONS_STORAGE_KEY = "tools.outlook-export.term-exceptions";
const EXCEPTIONS_DOC_ID = "rooms";

const defaultTermConfig = { startDate: "", endDate: "", exceptions: [] };

const OutlookRoomExport = () => {
  const { rawScheduleData = [] } = useData();
  const {
    availableSemesters = [],
    termOptions: termMetaOptions = [],
    selectedSemester = "",
    setSelectedSemester,
  } = useSchedules();
  const { showNotification } = useUI();
  const { termConfig, termConfigVersion } = useAppConfig();
  const { canAccess } = useAuth();
  const [termExceptions, setTermExceptions] = useState({});
  const [exceptionsLoaded, setExceptionsLoaded] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [exceptionDraft, setExceptionDraft] = useState({ date: "", label: "" });
  const [exporting, setExporting] = useState(false);
  const selectedTerm = selectedSemester;

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
  }, [rawScheduleData, availableSemesters, termConfig, termConfigVersion]);

  useEffect(() => {
    if (!selectedTerm && termLabels.length > 0) {
      setSelectedSemester(termLabels[0]);
    }
  }, [selectedTerm, setSelectedSemester, termLabels]);

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
    const normalizedSelected = normalizeTermLabel(selectedTerm, termConfig);
    return rawScheduleData.filter((schedule) => {
      const normalizedSchedule = normalizeTermLabel(
        schedule?.term || schedule?.termCode || "",
        termConfig,
      );
      return normalizedSchedule === normalizedSelected;
    });
  }, [rawScheduleData, selectedTerm, termConfig, termConfigVersion]);

  const roomsForTerm = useMemo(() => {
    return getDetectedRoomReferences(schedulesForTerm, selectedTerm).map(
      (room) => room.label,
    );
  }, [schedulesForTerm, selectedTerm]);

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
    const optimisticNext = {
      ...termExceptions,
      [selectedTerm]: nextExceptions,
    };
    setTermExceptions(optimisticNext);
    try {
      const docRef = doc(
        db,
        COLLECTIONS.OUTLOOK_EXCEPTIONS,
        EXCEPTIONS_DOC_ID,
      );
      const committedExceptions = await runTransaction(
        db,
        async (transaction) => {
          const snapshot = await transaction.get(docRef);
          const remoteExceptions = snapshot.exists()
            ? snapshot.data()?.termExceptions || {}
            : {};
          const mergedExceptions = {
            ...remoteExceptions,
            [selectedTerm]: nextExceptions,
          };
          transaction.set(
            docRef,
            {
              termExceptions: mergedExceptions,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
          return mergedExceptions;
        },
      );
      setTermExceptions(committedExceptions);
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
    if (activeTermConfig.endDate < activeTermConfig.startDate) {
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

  const performDownload = async (mode) => {
    if (!validateBeforeExport()) return;
    setExporting(true);
    try {
      const timestamp = new Date();
      const dateTag = `${timestamp.getFullYear()}${pad2(timestamp.getMonth() + 1)}${pad2(timestamp.getDate())}`;
      const termTag = sanitizeForFile(selectedTerm);
      const result = buildRoomCalendarExport({
        schedules: schedulesForTerm,
        selectedTerm,
        termConfig: activeTermConfig,
        selectedRoomLabels: selectedRooms,
        generatedAt: timestamp,
      });

      if (result.calendars.length === 0) {
        showNotification?.(
          "warning",
          "Nothing to export",
          "No valid recurring class meetings were found for the selected rooms.",
        );
        return;
      }

      const skippedRoomMessage =
        result.emptyRooms.length > 0
          ? ` ${result.emptyRooms.length} selected room${result.emptyRooms.length === 1 ? "" : "s"} had no valid recurring meetings and were skipped.`
          : "";

      if (mode === "zip") {
        const zip = new JSZip();
        result.calendars.forEach((calendar) => {
          zip.file(`${calendar.filenameBase}.ics`, calendar.ics);
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
          `Created ${result.calendars.length} room calendar${result.calendars.length === 1 ? "" : "s"} with ${result.totalEventCount} recurring event${result.totalEventCount === 1 ? "" : "s"}.${skippedRoomMessage}`,
        );
      } else {
        result.calendars.forEach((calendar) => {
          const blob = new Blob([calendar.ics], {
            type: "text/calendar;charset=utf-8",
          });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${calendar.filenameBase}-${termTag}-${dateTag}.ics`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        });
        showNotification?.(
          "success",
          "Download complete",
          `Downloaded ${result.calendars.length} room calendar${result.calendars.length === 1 ? "" : "s"} with ${result.totalEventCount} recurring event${result.totalEventCount === 1 ? "" : "s"}.${skippedRoomMessage}`,
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
              className="inline-flex items-center gap-2 rounded-lg bg-baylor-green px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-baylor-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exporting ? "Preparing…" : "Download per-room ICS"}
            </button>
            <button
              type="button"
              onClick={() => performDownload("zip")}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600/90 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <label
                  htmlFor="room-calendar-semester"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Semester
                </label>
                <SelectDropdown
                  id="room-calendar-semester"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green"
                  value={selectedTerm}
                  onChange={(event) =>
                    setSelectedSemester(event.target.value)
                  }
                >
                  {termLabels.length === 0 && (
                    <option value="">No semesters available</option>
                  )}
                  {termLabels.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </SelectDropdown>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="room-calendar-start-date"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Semester start date
                  </label>
                  <input
                    id="room-calendar-start-date"
                    type="date"
                    value={activeTermConfig.startDate}
                    readOnly
                    disabled
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-baylor-green focus:outline-none focus:ring-1 focus:ring-baylor-green disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="room-calendar-end-date"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Semester end date
                  </label>
                  <input
                    id="room-calendar-end-date"
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
                  Semester dates come from{" "}
                  <Link
                    to="/admin/settings"
                    className="rounded-sm font-medium underline underline-offset-2 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50"
                  >
                    App Settings
                  </Link>{" "}
                  so they stay consistent across the app. Holiday exceptions
                  are shared with other users.
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
                <label htmlFor="room-calendar-room-search" className="sr-only">
                  Search rooms
                </label>
                <input
                  id="room-calendar-room-search"
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
                <label
                  htmlFor="room-calendar-exception-date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  No-class date
                </label>
                <input
                  id="room-calendar-exception-date"
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
                <label
                  htmlFor="room-calendar-exception-label"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Exception label (optional)
                </label>
                <div className="flex gap-3">
                  <input
                    id="room-calendar-exception-label"
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
                    className="inline-flex items-center gap-1 rounded-lg bg-baylor-green px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-baylor-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    Add date
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="university-table min-w-full">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="table-header-cell"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="table-header-cell"
                    >
                      Label
                    </th>
                    <th scope="col" className="table-header-cell" />
                  </tr>
                </thead>
                <tbody>
                  {(activeTermConfig.exceptions || []).length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="table-cell text-gray-500 text-center"
                      >
                        No exception dates added yet.
                      </td>
                    </tr>
                  )}
                  {(activeTermConfig.exceptions || []).map(
                    (exception, index) => (
                      <tr key={`${exception.date}-${exception.label}-${index}`}>
                        <td className="table-cell text-gray-800">
                          {exception.date
                            ? new Date(
                                `${exception.date}T00:00:00`,
                              ).toLocaleDateString()
                            : ""}
                        </td>
                        <td className="table-cell text-gray-700">
                          {exception.label || (
                            <span className="text-gray-400">(no label)</span>
                          )}
                        </td>
                        <td className="table-cell text-right">
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
