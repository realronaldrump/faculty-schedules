import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Check, Layers3, Loader2, Plus, Search } from "lucide-react";

import Badge from "../../shared/Badge";
import Modal from "../../shared/Modal";
import SelectDropdown from "../../SelectDropdown";
import {
  createStudioCatalogEntry,
  formatStudioTime,
  getStudioEntryIdentity,
} from "../../../utils/scheduleGridStudio";

const EMPTY_LIST = Object.freeze([]);

const ScheduleClassPickerModal = ({
  isOpen,
  onClose,
  classes = EMPTY_LIST,
  existingEntries = EMPTY_LIST,
  currentBuilding = "",
  currentRoom = "",
  availableSemesters = EMPTY_LIST,
  catalogSemester = "",
  preferredSemester = "",
  isLoading = false,
  onLoadSemester,
  onAdd,
}) => {
  const defaultSemester =
    catalogSemester || preferredSemester || availableSemesters[0] || "";
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [scope, setScope] = useState(
    currentBuilding && currentRoom ? "room" : "all",
  );
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [targetSemester, setTargetSemester] = useState(defaultSemester);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setScope(currentBuilding && currentRoom ? "room" : "all");
    setBuildingFilter("all");
    setTargetSemester(defaultSemester);
    setSelectedIds(new Set());
    setLoadError("");
  }, [currentBuilding, currentRoom, defaultSemester, isOpen]);

  const catalog = useMemo(() => {
    const seen = new Set();
    return classes
      .map(createStudioCatalogEntry)
      .filter((option) => {
        if (seen.has(option.id)) return false;
        seen.add(option.id);
        return true;
      });
  }, [classes]);

  const existingIdentities = useMemo(
    () => new Set(existingEntries.map(getStudioEntryIdentity)),
    [existingEntries],
  );

  const buildings = useMemo(
    () =>
      Array.from(
        new Set(catalog.map((option) => option.building).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [catalog],
  );

  const visibleOptions = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return catalog
      .filter((option) => {
        if (
          scope === "room" &&
          (option.building !== currentBuilding || option.room !== currentRoom)
        ) {
          return false;
        }
        if (
          scope === "all" &&
          buildingFilter !== "all" &&
          option.building !== buildingFilter
        ) {
          return false;
        }
        if (!normalizedQuery) return true;
        const entry = option.entry;
        return [
          entry.course,
          entry.section,
          entry.instructor,
          entry.days.join(""),
          entry.start,
          entry.end,
          option.building,
          option.room,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedQuery),
          );
      })
      .sort((a, b) => {
        const locationCompare = `${a.building}|${a.room}`.localeCompare(
          `${b.building}|${b.room}`,
          undefined,
          { numeric: true },
        );
        if (locationCompare !== 0) return locationCompare;
        return `${a.entry.course}|${a.entry.section}|${a.entry.start}`.localeCompare(
          `${b.entry.course}|${b.entry.section}|${b.entry.start}`,
          undefined,
          { numeric: true },
        );
      });
  }, [
    buildingFilter,
    catalog,
    currentBuilding,
    currentRoom,
    deferredQuery,
    scope,
  ]);

  const selectableVisibleOptions = useMemo(
    () =>
      visibleOptions.filter(
        (option) => !existingIdentities.has(option.identity),
      ),
    [existingIdentities, visibleOptions],
  );

  const selectedOptions = useMemo(
    () =>
      catalog.filter(
        (option) =>
          selectedIds.has(option.id) &&
          !existingIdentities.has(option.identity),
      ),
    [catalog, existingIdentities, selectedIds],
  );

  const toggleSelection = (optionId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      selectableVisibleOptions.forEach((option) => next.add(option.id));
      return next;
    });
  };

  const loadSemester = async () => {
    if (!targetSemester || !onLoadSemester) return;
    setLoadError("");
    setSelectedIds(new Set());
    try {
      await onLoadSemester(targetSemester);
    } catch (error) {
      setLoadError(error?.message || "Could not load schedule classes.");
    }
  };

  const addSelected = () => {
    if (selectedOptions.length === 0) return;
    onAdd?.(selectedOptions.map((option) => option.entry));
    onClose?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Add classes from schedule"
      subtitle="Search existing schedule data, select one or more classes, and add them without retyping."
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-gray-500">
            {selectedOptions.length} selected
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={addSelected}
              disabled={selectedOptions.length === 0}
              className="btn-primary"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add {selectedOptions.length || "selected"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 border-b border-gray-200 bg-gray-50 px-6 py-4">
        {availableSemesters.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <span
                id="class-picker-semester-label"
                className="mb-1.5 block text-sm font-semibold text-gray-700"
              >
                Dashboard semester
              </span>
              <SelectDropdown
                id="class-picker-semester"
                aria-labelledby="class-picker-semester-label"
                value={targetSemester}
                onChange={(event) => setTargetSemester(event.target.value)}
                className="w-full"
                placeholder="Choose semester…"
              >
                <option value="" disabled>
                  Choose semester…
                </option>
                {availableSemesters.map((semester) => (
                  <option key={semester} value={semester}>
                    {semester}
                  </option>
                ))}
              </SelectDropdown>
            </div>
            <button
              type="button"
              onClick={loadSemester}
              disabled={!targetSemester || isLoading}
              className="btn-secondary shrink-0"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Layers3 className="mr-2 h-4 w-4" />
              )}
              {isLoading ? "Loading…" : "Load semester"}
            </button>
            {catalogSemester && catalog.length > 0 ? (
              <Badge tone="success" size="sm" bordered>
                {catalogSemester} · {catalog.length} available
              </Badge>
            ) : null}
          </div>
        ) : null}

        {loadError ? (
          <div className="alert alert-error" role="alert">
            {loadError}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_250px_180px]">
          <label className="relative">
            <span className="sr-only">Search existing classes</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="form-input w-full pl-9"
              placeholder="Search course, instructor, room, day, or time"
            />
          </label>
          <div>
            <span id="class-picker-scope-label" className="sr-only">
              Class scope
            </span>
            <SelectDropdown
              id="class-picker-scope"
              aria-labelledby="class-picker-scope-label"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="w-full"
            >
              {currentBuilding && currentRoom ? (
                <option value="room">
                  This room ({currentBuilding} {currentRoom})
                </option>
              ) : null}
              <option value="all">All rooms</option>
            </SelectDropdown>
          </div>
          <div>
            <span id="class-picker-building-label" className="sr-only">
              Building filter
            </span>
            <SelectDropdown
              id="class-picker-building"
              aria-labelledby="class-picker-building-label"
              value={buildingFilter}
              onChange={(event) => setBuildingFilter(event.target.value)}
              disabled={scope === "room"}
              className="w-full"
            >
              <option value="all">All buildings</option>
              {buildings.map((building) => (
                <option key={building} value={building}>
                  {building}
                </option>
              ))}
            </SelectDropdown>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-gray-500">
            {visibleOptions.length} matching class
            {visibleOptions.length === 1 ? "" : "es"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={selectableVisibleOptions.length === 0}
              className="btn-ghost px-2 py-1 text-xs"
            >
              Select visible
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
              className="btn-ghost px-2 py-1 text-xs"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && catalog.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center text-gray-500">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
            Loading schedule classes…
          </div>
        ) : visibleOptions.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            <Layers3 className="mb-3 h-10 w-10 text-gray-400" />
            <h3 className="!mb-0 !text-base !font-semibold !text-gray-800">
              {catalog.length === 0
                ? "Load a semester to browse existing classes"
                : "No classes match these filters"}
            </h3>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              {catalog.length === 0
                ? "Choose a dashboard semester above. The classes will stay inside the Studio for selection."
                : "Try a broader search, room scope, or building."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visibleOptions.map((option) => {
              const entry = option.entry;
              const alreadyAdded = existingIdentities.has(option.identity);
              const selected = selectedIds.has(option.id) && !alreadyAdded;
              const courseLabel = [
                entry.course,
                entry.section ? `.${entry.section}` : "",
              ].join("");
              return (
                <label
                  key={option.id}
                  className={`flex items-start gap-3 rounded-xl border p-4 transition ${
                    alreadyAdded
                      ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-65"
                      : selected
                        ? "cursor-pointer border-baylor-green bg-baylor-green/5 shadow-sm"
                        : "cursor-pointer border-gray-200 bg-white hover:border-baylor-green/40 hover:bg-green-50/40"
                  }`}
                  style={{ contentVisibility: "auto" }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={alreadyAdded}
                    onChange={() => toggleSelection(option.id)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                    aria-label={`Select ${courseLabel || "untitled class"} in ${option.building} ${option.room}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900">
                        {courseLabel || "Untitled class"}
                      </span>
                      {alreadyAdded ? (
                        <Badge tone="muted" size="sm" icon={Check}>
                          Already in grid
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm text-gray-600">
                      {entry.instructor || "Instructor not assigned"}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>{entry.days.join("") || "No days"}</span>
                      <span>
                        {formatStudioTime(entry.start)}–
                        {formatStudioTime(entry.end)}
                      </span>
                      <span>
                        {[option.building, option.room]
                          .filter(Boolean)
                          .join(" ") || "No room"}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ScheduleClassPickerModal;
