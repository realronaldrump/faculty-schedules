import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  Library,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import ExportModal from "../ExportModal";
import Badge from "../../shared/Badge";
import ConfirmDialog from "../../shared/ConfirmDialog";
import {
  DEFAULT_STUDIO_VISIBILITY,
  STUDIO_DAYS,
  STUDIO_PAGE_PRESETS,
  createStudioClientId,
  createStudioEntry,
  createStudioHistory,
  formatStudioTime,
  getStudioTimeRange,
  parseClockMinutes,
  studioDocumentSignature,
  studioHistoryReducer,
} from "../../../utils/scheduleGridStudio";
import ScheduleGridLibraryModal from "./ScheduleGridLibraryModal";
import ScheduleGridStudioPreview from "./ScheduleGridStudioPreview";

const EDITOR_TABS = [
  { id: "details", label: "Details", icon: Settings2 },
  { id: "layout", label: "Layout", icon: SlidersHorizontal },
  { id: "fields", label: "Fields", icon: Eye },
];

const VISIBILITY_OPTIONS = [
  {
    key: "building",
    label: "Building",
    description: "Show the building in the header.",
  },
  {
    key: "room",
    label: "Room",
    description: "Show the room number in the header.",
  },
  {
    key: "semester",
    label: "Semester",
    description: "Show the term in the header.",
  },
  {
    key: "headerNote",
    label: "Header note",
    description: "Show the custom subtitle below the room.",
  },
  {
    key: "dayHeaders",
    label: "Day headings",
    description: "Show Monday through Friday labels.",
  },
  {
    key: "timeLabels",
    label: "Time labels",
    description: "Show the time scale along the left edge.",
  },
  {
    key: "gridLines",
    label: "Grid lines",
    description: "Show horizontal time guides.",
  },
  {
    key: "course",
    label: "Course code",
    description: "Show the course inside each class block.",
  },
  {
    key: "section",
    label: "Section",
    description: "Append the section to the course code.",
  },
  {
    key: "instructor",
    label: "Instructor",
    description: "Show instructor names, including short periods.",
  },
  {
    key: "classTime",
    label: "Time inside blocks",
    description: "Repeat exact times inside each class block.",
  },
  {
    key: "footer",
    label: "Footer",
    description: "Show the two footer labels.",
  },
  {
    key: "emptyDays",
    label: "Empty-day labels",
    description: "Show “No classes” on unused days.",
  },
];

const SectionHeading = ({ title, description }) => (
  <div className="mb-4">
    <h3 className="!mb-0 !text-base !font-semibold !text-gray-900">{title}</h3>
    {description ? (
      <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
    ) : null}
  </div>
);

const FieldLabel = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-semibold text-gray-700">
      {label}
    </span>
    {children}
    {hint ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
  </label>
);

const RangeField = ({ label, value, min, max, step, suffix, onChange }) => (
  <label className="block">
    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-gray-700">
      <span>{label}</span>
      <output className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
        {value}
        {suffix}
      </output>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-baylor-green"
    />
  </label>
);

const MetadataPanel = ({ document, onPatch }) => (
  <div className="space-y-5">
    <SectionHeading
      title="Template details"
      description="Name and file the design so coworkers can find it again inside the dashboard."
    />
    <FieldLabel label="Template name">
      <input
        type="text"
        value={document.name}
        onChange={(event) => onPatch({ name: event.target.value })}
        className="form-input w-full"
        placeholder="e.g., Fall 2026 door sign"
      />
    </FieldLabel>
    <div className="grid grid-cols-2 gap-3">
      <FieldLabel label="Folder">
        <input
          type="text"
          value={document.folder}
          onChange={(event) => onPatch({ folder: event.target.value })}
          className="form-input w-full"
          placeholder="Fall 2026"
        />
      </FieldLabel>
      <FieldLabel label="Tags">
        <input
          key={document.tags.join("|")}
          type="text"
          defaultValue={document.tags.join(", ")}
          onBlur={(event) =>
            onPatch({
              tags: event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
          className="form-input w-full"
          placeholder="door, labs"
        />
      </FieldLabel>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <FieldLabel label="Building">
        <input
          type="text"
          value={document.building}
          onChange={(event) => onPatch({ building: event.target.value })}
          className="form-input w-full"
        />
      </FieldLabel>
      <FieldLabel label="Room">
        <input
          type="text"
          value={document.room}
          onChange={(event) => onPatch({ room: event.target.value })}
          className="form-input w-full"
        />
      </FieldLabel>
    </div>
    <FieldLabel label="Semester">
      <input
        type="text"
        value={document.semester}
        onChange={(event) => onPatch({ semester: event.target.value })}
        className="form-input w-full"
      />
    </FieldLabel>
    <FieldLabel label="Header note">
      <input
        type="text"
        value={document.headerNote}
        onChange={(event) => onPatch({ headerNote: event.target.value })}
        className="form-input w-full"
        placeholder="Room Schedule"
      />
    </FieldLabel>
    <div className="grid grid-cols-2 gap-3">
      <FieldLabel label="Footer left">
        <input
          type="text"
          value={document.footerLeft}
          onChange={(event) => onPatch({ footerLeft: event.target.value })}
          className="form-input w-full"
        />
      </FieldLabel>
      <FieldLabel label="Footer right">
        <input
          type="text"
          value={document.footerRight}
          onChange={(event) => onPatch({ footerRight: event.target.value })}
          className="form-input w-full"
        />
      </FieldLabel>
    </div>
  </div>
);

const LayoutPanel = ({ document, onPatch }) => {
  const { layout } = document;

  const applyPreset = (presetId) => {
    const preset = STUDIO_PAGE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    onPatch(
      presetId === "custom"
        ? { preset: "custom" }
        : {
            preset: preset.id,
            widthIn: preset.widthIn,
            heightIn: preset.heightIn,
          },
    );
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Page and layout"
        description="Set the physical output first, then tune the density for the room schedule."
      />
      <FieldLabel label="Page size">
        <select
          value={layout.preset}
          onChange={(event) => applyPreset(event.target.value)}
          className="form-select w-full"
        >
          {STUDIO_PAGE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Width" hint="Inches">
          <input
            type="number"
            min="3"
            max="17"
            step="0.25"
            value={layout.widthIn}
            onChange={(event) =>
              onPatch({
                preset: "custom",
                widthIn: Number(event.target.value),
              })
            }
            className="form-input w-full"
          />
        </FieldLabel>
        <FieldLabel label="Height" hint="Inches">
          <input
            type="number"
            min="3"
            max="17"
            step="0.25"
            value={layout.heightIn}
            onChange={(event) =>
              onPatch({
                preset: "custom",
                heightIn: Number(event.target.value),
              })
            }
            className="form-input w-full"
          />
        </FieldLabel>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Day starts">
          <input
            type="time"
            value={layout.timeStart}
            onChange={(event) => onPatch({ timeStart: event.target.value })}
            className="form-input w-full"
          />
        </FieldLabel>
        <FieldLabel label="Day ends">
          <input
            type="time"
            value={layout.timeEnd}
            onChange={(event) => onPatch({ timeEnd: event.target.value })}
            className="form-input w-full"
          />
        </FieldLabel>
      </div>
      <FieldLabel label="Time guides">
        <select
          value={layout.timeStep}
          onChange={(event) =>
            onPatch({ timeStep: Number(event.target.value) })
          }
          className="form-select w-full"
        >
          <option value="30">Every 30 minutes</option>
          <option value="60">Every hour</option>
          <option value="120">Every 2 hours</option>
        </select>
      </FieldLabel>
      <RangeField
        label="Class text size"
        value={layout.textScale}
        min={0.7}
        max={1.5}
        step={0.05}
        suffix="×"
        onChange={(value) => onPatch({ textScale: value })}
      />
      <RangeField
        label="Header size"
        value={layout.headerScale}
        min={0.75}
        max={1.5}
        step={0.05}
        suffix="×"
        onChange={(value) => onPatch({ headerScale: value })}
      />
      <RangeField
        label="Column spacing"
        value={layout.blockGap}
        min={0}
        max={12}
        step={1}
        suffix="px"
        onChange={(value) => onPatch({ blockGap: value })}
      />
      <RangeField
        label="Block corners"
        value={layout.blockRadius}
        min={0}
        max={16}
        step={1}
        suffix="px"
        onChange={(value) => onPatch({ blockRadius: value })}
      />
      <RangeField
        label="Grid contrast"
        value={Math.round(layout.gridOpacity * 100)}
        min={15}
        max={100}
        step={5}
        suffix="%"
        onChange={(value) => onPatch({ gridOpacity: value / 100 })}
      />
      <FieldLabel label="Instructor names">
        <select
          value={layout.instructorFormat}
          onChange={(event) =>
            onPatch({ instructorFormat: event.target.value })
          }
          className="form-select w-full"
        >
          <option value="full">Full name</option>
          <option value="last">Last name only</option>
        </select>
      </FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["accentColor", "Header"],
          ["highlightColor", "Accent"],
          ["blockColor", "Class blocks"],
          ["pageColor", "Page"],
        ].map(([key, label]) => (
          <label
            key={key}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-2.5"
          >
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <input
              type="color"
              value={layout[key]}
              onChange={(event) => onPatch({ [key]: event.target.value })}
              className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
              aria-label={`${label} color`}
            />
          </label>
        ))}
      </div>
    </div>
  );
};

const VisibilityPanel = ({ visibility, onPatch }) => (
  <div className="space-y-4">
    <SectionHeading
      title="Visible content"
      description="Choose exactly what the printed grid communicates. Instructor names remain available even in short periods."
    />
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onPatch({ ...DEFAULT_STUDIO_VISIBILITY })}
        className="btn-secondary px-3 py-1.5 text-xs"
      >
        Recommended
      </button>
      <button
        type="button"
        onClick={() =>
          onPatch(
            Object.fromEntries(
              Object.keys(DEFAULT_STUDIO_VISIBILITY).map((key) => [key, true]),
            ),
          )
        }
        className="btn-ghost px-3 py-1.5 text-xs"
      >
        Show everything
      </button>
    </div>
    <div className="space-y-2">
      {VISIBILITY_OPTIONS.map((option) => (
        <label
          key={option.key}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
            visibility[option.key]
              ? "border-baylor-green/30 bg-baylor-green/5"
              : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <input
            type="checkbox"
            checked={Boolean(visibility[option.key])}
            onChange={(event) =>
              onPatch({ [option.key]: event.target.checked })
            }
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-800">
              {option.label}
            </span>
            <span className="mt-0.5 block text-xs leading-4 text-gray-500">
              {option.description}
            </span>
          </span>
        </label>
      ))}
    </div>
  </div>
);

const EntrySummary = ({
  entry,
  isSelected,
  onSelect,
  onToggleHidden,
  onMove,
}) => (
  <div
    className={`rounded-lg border transition ${
      isSelected
        ? "border-baylor-green bg-baylor-green/5 shadow-sm"
        : "border-gray-200 bg-white hover:border-gray-300"
    } ${entry.hidden ? "opacity-60" : ""}`}
  >
    <div className="flex items-start gap-2 p-2.5">
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
        aria-pressed={isSelected}
      >
        <span className="block truncate text-sm font-semibold text-gray-900">
          {[entry.course, entry.section ? `.${entry.section}` : ""].join("") ||
            "Untitled class"}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          {entry.days.join("") || "No days"} · {formatStudioTime(entry.start)}–
          {formatStudioTime(entry.end)}
        </span>
        {entry.instructor ? (
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {entry.instructor}
          </span>
        ) : null}
      </button>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onToggleHidden}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-baylor-green"
          aria-label={entry.hidden ? "Show class" : "Hide class"}
        >
          {entry.hidden ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
        <div className="flex">
          <button
            type="button"
            onClick={() => onMove(-1)}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100"
            aria-label="Move class up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100"
            aria-label="Move class down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
);

const EntryEditor = ({
  entry,
  onPatch,
  onDuplicate,
  onDelete,
}) => {
  if (!entry) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
        <Sparkles className="mx-auto mb-2 h-7 w-7 text-gray-400" />
        <p className="text-sm font-semibold text-gray-700">Select a class</p>
        <p className="mt-1 text-xs text-gray-500">
          Pick a class from the list or directly from the preview.
        </p>
      </div>
    );
  }

  const toggleDay = (dayCode) => {
    const requested = new Set(entry.days);
    if (requested.has(dayCode)) requested.delete(dayCode);
    else requested.add(dayCode);
    onPatch({
      days: STUDIO_DAYS.map((day) => day.code).filter((day) =>
        requested.has(day),
      ),
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-baylor-green/20 bg-baylor-green/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="!mb-0 !text-base !font-semibold !text-gray-900">
            Edit selected class
          </h3>
          <p className="text-xs text-gray-500">Changes appear immediately.</p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-baylor-green"
            aria-label="Duplicate selected class"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
            aria-label="Delete selected class"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3">
        <FieldLabel label="Course">
          <input
            type="text"
            value={entry.course}
            onChange={(event) => onPatch({ course: event.target.value })}
            className="form-input w-full"
            placeholder="CFS 1305"
          />
        </FieldLabel>
        <FieldLabel label="Section">
          <input
            type="text"
            value={entry.section}
            onChange={(event) => onPatch({ section: event.target.value })}
            className="form-input w-full"
            placeholder="01"
          />
        </FieldLabel>
      </div>
      <FieldLabel label="Instructor">
        <input
          type="text"
          value={entry.instructor}
          onChange={(event) => onPatch({ instructor: event.target.value })}
          className="form-input w-full"
          placeholder="Instructor name"
        />
      </FieldLabel>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-gray-700">Days</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {STUDIO_DAYS.map((day) => {
            const selected = entry.days.includes(day.code);
            return (
              <button
                key={day.code}
                type="button"
                onClick={() => toggleDay(day.code)}
                className={`rounded-lg border px-1.5 py-2 text-xs font-semibold transition ${
                  selected
                    ? "border-baylor-green bg-baylor-green text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-baylor-green/40"
                }`}
                aria-pressed={selected}
              >
                {day.short}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Starts">
          <input
            type="time"
            value={entry.start}
            onChange={(event) => onPatch({ start: event.target.value })}
            className="form-input w-full"
          />
        </FieldLabel>
        <FieldLabel label="Ends">
          <input
            type="time"
            value={entry.end}
            onChange={(event) => onPatch({ end: event.target.value })}
            className="form-input w-full"
          />
        </FieldLabel>
      </div>
      <FieldLabel
        label="Block detail"
        hint="Detailed mode can wrap longer names when there is room."
      >
        <select
          value={entry.detailLevel}
          onChange={(event) => onPatch({ detailLevel: event.target.value })}
          className="form-select w-full"
        >
          <option value="auto">Automatic</option>
          <option value="compact">Compact</option>
          <option value="detailed">Detailed / wrap text</option>
        </select>
      </FieldLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_54px] gap-3">
        <FieldLabel label="Note">
          <input
            type="text"
            value={entry.note}
            onChange={(event) => onPatch({ note: event.target.value })}
            className="form-input w-full"
            placeholder="Optional note"
          />
        </FieldLabel>
        <FieldLabel label="Color">
          <input
            type="color"
            value={entry.blockColor || "#dcefe2"}
            onChange={(event) => onPatch({ blockColor: event.target.value })}
            className="h-10 w-full cursor-pointer rounded border border-gray-300 bg-white p-1"
          />
        </FieldLabel>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <span>
          <span className="block text-sm font-semibold text-gray-800">
            Hide this class
          </span>
          <span className="block text-xs text-gray-500">
            Keep it in the template without printing it.
          </span>
        </span>
        <input
          type="checkbox"
          checked={entry.hidden}
          onChange={(event) => onPatch({ hidden: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
        />
      </label>
    </div>
  );
};

const ScheduleGridStudio = ({
  initialDocument,
  initialTemplateId = "",
  templates = [],
  isLoadingTemplates = false,
  canSave = false,
  onBack,
  onSaveTemplate,
  onRefreshTemplates,
  onDeleteTemplate,
  onDuplicateTemplate,
  onToggleFavoriteTemplate,
}) => {
  const [history, dispatch] = useReducer(
    studioHistoryReducer,
    initialDocument,
    createStudioHistory,
  );
  const document = history.present;
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [lastSavedSignature, setLastSavedSignature] = useState(() =>
    studioDocumentSignature(initialDocument),
  );
  const [activeTab, setActiveTab] = useState("details");
  const [selectedEntryId, setSelectedEntryId] = useState(
    initialDocument.entries?.[0]?.id || "",
  );
  const [zoom, setZoom] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? 0.48 : 0.7,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [pendingExit, setPendingExit] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [notice, setNotice] = useState(null);
  const sheetRef = useRef(null);

  const signature = useMemo(
    () => studioDocumentSignature(document),
    [document],
  );
  const isDirty = signature !== lastSavedSignature;
  const selectedEntry = document.entries.find(
    (entry) => entry.id === selectedEntryId,
  );
  const hiddenCount = document.entries.filter((entry) => entry.hidden).length;
  const timeRange = useMemo(() => getStudioTimeRange(document.layout), [document.layout]);
  const outOfRangeCount = useMemo(
    () =>
      document.entries.filter((entry) => {
        const start = parseClockMinutes(entry.start);
        const end = parseClockMinutes(entry.end);
        return start < timeRange.start || end > timeRange.end;
      }).length,
    [document.entries, timeRange],
  );

  useEffect(() => {
    if (!isDirty) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  const updateMetadata = (patch) => dispatch({ type: "set_metadata", patch });
  const updateLayout = (patch) => dispatch({ type: "update_layout", patch });
  const updateVisibility = (patch) =>
    dispatch({ type: "update_visibility", patch });
  const updateEntry = (id, patch) =>
    dispatch({ type: "update_entry", id, patch });

  const addEntry = () => {
    const start = document.layout.timeStart;
    const startMinutes = parseClockMinutes(start) ?? 8 * 60;
    const entry = createStudioEntry({
      id: createStudioClientId("class"),
      course: "New course",
      days: ["M"],
      start,
      end: `${String(Math.floor((startMinutes + 50) / 60)).padStart(2, "0")}:${String((startMinutes + 50) % 60).padStart(2, "0")}`,
    });
    dispatch({ type: "add_entry", entry });
    setSelectedEntryId(entry.id);
  };

  const duplicateEntry = (id) => {
    const newId = createStudioClientId("class");
    dispatch({ type: "duplicate_entry", id, newId });
    setSelectedEntryId(newId);
  };

  const deleteEntry = (id) => {
    const currentIndex = document.entries.findIndex((entry) => entry.id === id);
    const nextSelection =
      document.entries[currentIndex + 1]?.id ||
      document.entries[currentIndex - 1]?.id ||
      "";
    dispatch({ type: "delete_entry", id });
    setSelectedEntryId(nextSelection);
  };

  const moveEntry = (id, direction) => {
    const index = document.entries.findIndex((entry) => entry.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= document.entries.length) return;
    const entries = [...document.entries];
    const [moved] = entries.splice(index, 1);
    entries.splice(nextIndex, 0, moved);
    dispatch({ type: "replace_entries", entries });
  };

  const saveTemplate = async (asCopy = false) => {
    if (!canSave || !onSaveTemplate) return;
    if (!document.name.trim()) {
      setNotice({ type: "error", text: "Give this template a name before saving." });
      setActiveTab("details");
      return;
    }
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await onSaveTemplate(document, {
        templateId,
        asCopy,
      });
      setTemplateId(result?.id || templateId);
      if (result?.studio) {
        dispatch({ type: "replace_document", document: result.studio });
        setSelectedEntryId(result.studio.entries?.[0]?.id || selectedEntryId);
        setLastSavedSignature(studioDocumentSignature(result.studio));
      } else {
        setLastSavedSignature(signature);
      }
      setNotice({
        type: "success",
        text: asCopy ? "Saved as a new template." : "Template saved.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error?.message || "The template could not be saved.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openTemplate = (template) => {
    if (!template?.studio) return;
    dispatch({ type: "replace_document", document: template.studio });
    setTemplateId(template.id);
    setLastSavedSignature(studioDocumentSignature(template.studio));
    setSelectedEntryId(template.studio.entries?.[0]?.id || "");
    setNotice({ type: "success", text: `Opened “${template.studio.name}”.` });
    setPendingTemplate(null);
    setIsLibraryOpen(false);
  };

  const requestOpenTemplate = (template) => {
    if (isDirty) {
      setPendingTemplate(template);
      setIsLibraryOpen(false);
      return;
    }
    openTemplate(template);
  };

  const handleDuplicateTemplate = async (template) => {
    try {
      await onDuplicateTemplate?.(template);
      setNotice({ type: "success", text: "Template duplicated in the library." });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "Could not duplicate template." });
    }
  };

  const handleDeleteTemplate = async (template) => {
    await onDeleteTemplate?.(template);
    if (template.id === templateId) {
      setTemplateId("");
      setLastSavedSignature("");
      setNotice({
        type: "info",
        text: "The saved copy was deleted. Your open design is still available to save again.",
      });
    }
  };

  const handleToggleFavorite = async (template) => {
    try {
      const wasDirty = isDirty;
      const result = await onToggleFavoriteTemplate?.(template);
      if (template.id === templateId) {
        const nextDocument = {
          ...document,
          favorite: result?.studio?.favorite ?? !template.studio?.favorite,
        };
        updateMetadata({ favorite: nextDocument.favorite });
        if (!wasDirty) {
          setLastSavedSignature(studioDocumentSignature(nextDocument));
        }
      }
    } catch (error) {
      setNotice({
        type: "error",
        text: error?.message || "Could not update the favorite.",
      });
    }
  };

  const requestBack = () => {
    if (isDirty) setPendingExit(true);
    else onBack?.();
  };

  return (
    <div className="space-y-5">
      <div className="university-card overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-baylor-green to-emerald-900 px-5 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                onClick={requestBack}
                className="mt-0.5 rounded-lg border border-white/20 bg-white/10 p-2 text-white transition hover:bg-white/20"
                aria-label="Back to Room Grid Generator"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="!mb-0 !text-xl !font-bold !text-white sm:!text-2xl">
                    Schedule Grid Studio
                  </h1>
                  <Badge
                    size="sm"
                    tone={document.source === "schedule" ? "info" : "neutral"}
                    bordered
                    className="!border-white/20 !bg-white/15 !text-white"
                  >
                    {document.source === "schedule" ? "From schedule data" : "Built from scratch"}
                  </Badge>
                  <Badge
                    size="sm"
                    tone={isDirty ? "warning" : templateId ? "success" : "muted"}
                    showDot
                    className={
                      isDirty
                        ? "!bg-baylor-gold !text-baylor-green"
                        : "!bg-white/15 !text-white"
                    }
                  >
                    {isDirty ? "Unsaved changes" : templateId ? "Saved" : "Not saved"}
                  </Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-white/75">
                  Design, edit, organize, save, and export door schedules without leaving the dashboard.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsLibraryOpen(true)}
                className="inline-flex items-center rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                <Library className="mr-2 h-4 w-4" />
                Library
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "undo" })}
                disabled={history.past.length === 0}
                className="inline-flex items-center rounded-lg border border-white/25 bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Undo"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "redo" })}
                disabled={history.future.length === 0}
                className="inline-flex items-center rounded-lg border border-white/25 bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Redo"
              >
                <Redo2 className="h-4 w-4" />
              </button>
              {canSave ? (
                <>
                  <button
                    type="button"
                    onClick={() => saveTemplate(true)}
                    disabled={isSaving}
                    className="inline-flex items-center rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Save copy
                  </button>
                  <button
                    type="button"
                    onClick={() => saveTemplate(false)}
                    disabled={isSaving || (Boolean(templateId) && !isDirty)}
                    className="inline-flex items-center rounded-lg bg-baylor-gold px-3 py-2 text-sm font-bold text-baylor-green shadow-sm transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? (
                      <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setIsExportOpen(true)}
                className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-bold text-baylor-green shadow-sm transition hover:bg-gray-100"
              >
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {notice ? (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 border-b px-5 py-3 text-sm ${
              notice.type === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : notice.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            <span className="flex items-center gap-2">
              {notice.type === "success" ? <Check className="h-4 w-4" /> : null}
              {notice.text}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="font-semibold underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[310px_minmax(0,1fr)_350px]">
        <aside className="university-card order-2 min-w-0 self-start xl:order-1 xl:sticky xl:top-4">
          <div className="border-b border-gray-200 p-2">
            <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Template controls">
              {EDITOR_TABS.map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                      selected
                        ? "bg-baylor-green text-white"
                        : "text-gray-500 hover:bg-gray-100 hover:text-baylor-green"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="max-h-[calc(100vh-15rem)] overflow-y-auto p-4">
            {activeTab === "details" ? (
              <MetadataPanel document={document} onPatch={updateMetadata} />
            ) : activeTab === "layout" ? (
              <LayoutPanel document={document} onPatch={updateLayout} />
            ) : (
              <VisibilityPanel
                visibility={document.visibility}
                onPatch={updateVisibility}
              />
            )}
          </div>
        </aside>

        <main className="university-card order-1 min-w-0 overflow-hidden xl:order-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h2 className="!mb-0 !text-lg !font-semibold !text-gray-900">
                Live preview
              </h2>
              <p className="text-xs text-gray-500">
                Select any class block to edit it. PDF export uses the physical size shown in Layout.
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-12 text-center text-xs font-semibold text-gray-600">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>

          {(hiddenCount > 0 || outOfRangeCount > 0) && (
            <div className="flex flex-wrap gap-2 border-b border-gray-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {hiddenCount > 0 ? (
                <span>
                  {hiddenCount} hidden class{hiddenCount === 1 ? "" : "es"} will not print.
                </span>
              ) : null}
              {outOfRangeCount > 0 ? (
                <span>
                  {outOfRangeCount} class{outOfRangeCount === 1 ? " is" : "es are"} outside the visible time range.
                </span>
              ) : null}
            </div>
          )}

          <div className="min-h-[640px] overflow-auto bg-slate-100 p-6">
            <div className="flex min-w-max justify-center">
              <ScheduleGridStudioPreview
                ref={sheetRef}
                document={document}
                zoom={zoom}
                selectedEntryId={selectedEntryId}
                onSelectEntry={(id) => setSelectedEntryId(id)}
              />
            </div>
          </div>
        </main>

        <aside className="university-card order-3 min-w-0 self-start xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div>
              <h2 className="!mb-0 !text-lg !font-semibold !text-gray-900">
                Schedule items
              </h2>
              <p className="text-xs text-gray-500">
                {document.entries.length} class{document.entries.length === 1 ? "" : "es"}
              </p>
            </div>
            <button type="button" onClick={addEntry} className="btn-primary px-3 py-2 text-xs">
              <Plus className="mr-1.5 h-4 w-4" />
              Add class
            </button>
          </div>

          <div className="max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto p-4">
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {document.entries.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-5 text-center">
                  <p className="text-sm font-semibold text-gray-700">No classes yet</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Add the first class to begin building this schedule.
                  </p>
                </div>
              ) : (
                document.entries.map((entry) => (
                  <EntrySummary
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === selectedEntryId}
                    onSelect={() => setSelectedEntryId(entry.id)}
                    onToggleHidden={() =>
                      updateEntry(entry.id, { hidden: !entry.hidden })
                    }
                    onMove={(direction) => moveEntry(entry.id, direction)}
                  />
                ))
              )}
            </div>

            <EntryEditor
              entry={selectedEntry}
              onPatch={(patch) => updateEntry(selectedEntry.id, patch)}
              onDuplicate={() => duplicateEntry(selectedEntry.id)}
              onDelete={() => deleteEntry(selectedEntry.id)}
            />
          </div>
        </aside>
      </div>

      <ScheduleGridLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        templates={templates}
        isLoading={isLoadingTemplates}
        onRefresh={onRefreshTemplates}
        onOpen={requestOpenTemplate}
        onDuplicate={handleDuplicateTemplate}
        onToggleFavorite={handleToggleFavorite}
        onDelete={handleDeleteTemplate}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        scheduleTableRef={sheetRef}
        title={document.name || "Schedule Grid"}
      />

      <ConfirmDialog
        isOpen={pendingExit}
        title="Leave Schedule Grid Studio?"
        message="You have unsaved changes. Leave the Studio and discard them?"
        variant="warning"
        confirmText="Discard and leave"
        onConfirm={onBack}
        onCancel={() => setPendingExit(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingTemplate)}
        title="Open another template?"
        message="Your current unsaved changes will be discarded."
        variant="warning"
        confirmText="Discard and open"
        onConfirm={() => openTemplate(pendingTemplate)}
        onCancel={() => {
          setPendingTemplate(null);
          setIsLibraryOpen(true);
        }}
      />
    </div>
  );
};

export default ScheduleGridStudio;
