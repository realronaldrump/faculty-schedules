import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Printer } from "lucide-react";
import Modal from "../shared/Modal";
import MultiSelectDropdown from "../MultiSelectDropdown";
import StudentScheduleSign from "./StudentScheduleSign";
import { printSheets } from "../../utils/printSheets";
import { trackAction, trackFailure } from "../../utils/activityTracking";
import {
  EMPTY_FILTERS,
  buildWeekDays,
  filterScheduledStudents,
} from "../../utils/studentScheduleFilters";
import {
  MAX_NOTE_LENGTH,
  MIN_COMFORTABLE_PT,
  PAPER_SIZES,
  PX_PER_IN,
  SIGN_LAYOUTS,
  defaultSignSubtitle,
  defaultSignTitle,
  getSavedSignSettings,
  getSheetSize,
  printedNamePoints,
  saveSignSettings,
} from "../../utils/studentScheduleSign";

const ORIENTATIONS = [
  { id: "landscape", label: "Landscape" },
  { id: "portrait", label: "Portrait" },
];

const Segmented = ({ label, options, value, onChange }) => (
  <div>
    <div className="form-label" id={`sign-${label}`}>
      {label}
    </div>
    <div
      role="group"
      aria-labelledby={`sign-${label}`}
      className="inline-flex gap-1 rounded-lg bg-gray-100 p-1 text-sm"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-3 py-1 font-medium transition-colors ${value === option.id ? "bg-baylor-green text-white shadow-sm" : "text-gray-600 hover:bg-gray-200"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

// Shows the full-size sheet scaled down to fit the preview area.
const SignPreview = ({ widthIn, heightIn, children }) => {
  const frameRef = useRef(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setFrameWidth(entry.contentRect.width),
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const widthPx = widthIn * PX_PER_IN;
  const heightPx = heightIn * PX_PER_IN;
  const maxHeight = Math.max(320, window.innerHeight * 0.68);
  const zoom = frameWidth
    ? Math.min(1, frameWidth / widthPx, maxHeight / heightPx)
    : 0.5;

  return (
    <div
      ref={frameRef}
      className="flex min-w-0 justify-center"
      aria-label="Sign preview"
    >
      <div
        className="shrink-0 overflow-hidden bg-white shadow-md ring-1 ring-gray-300"
        style={{ width: widthPx * zoom, height: heightPx * zoom }}
      >
        <div
          style={{
            width: widthPx,
            height: heightPx,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// Ways to get bigger text that aren't already chosen.
const biggerTextOptions = ({ layout, paper, orientation }) => {
  const options = [];
  if (orientation === "landscape") options.push("Portrait");
  if (paper !== "tabloid") options.push("Tabloid paper");
  if (layout !== "day") options.push("the By day layout");
  options.push("filtering to fewer students");
  return options.length > 1
    ? `${options.slice(0, -1).join(", ")}, or ${options.at(-1)}`
    : options[0];
};

const FILTER_KEYS = ["buildings", "jobTitles", "studentIds"];

const sameFilters = (a, b) =>
  FILTER_KEYS.every(
    (key) =>
      a[key].length === b[key].length && a[key].every((v) => b[key].includes(v)),
  );

const FilterSelect = ({ label, ...props }) => (
  <div>
    <div className="mb-1 text-sm text-gray-700">{label}</div>
    <MultiSelectDropdown {...props} showSelectedLabels menuPortal />
  </div>
);

const FitReadout = ({ fit, settings }) => {
  if (!fit) return null;
  const points = printedNamePoints(settings.layout, fit.scale);
  if (fit.overflow) {
    return (
      <p className="flex gap-2 text-sm text-red-700" role="status">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        Too many shifts to fit on one page. Try {biggerTextOptions(settings)}.
      </p>
    );
  }
  if (points < MIN_COMFORTABLE_PT) {
    return (
      <p className="flex gap-2 text-sm text-amber-800" role="status">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        Fits on one page, but names print small (about {points} pt). For
        bigger text, try {biggerTextOptions(settings)}.
      </p>
    );
  }
  return (
    <p className="flex gap-2 text-sm text-gray-700" role="status">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-baylor-green" />
      Fits on one page. Names print at about {points} pt.
    </p>
  );
};

/**
 * StudentScheduleSignDialog - set up and print the one-page schedule sign.
 *
 * The sign starts with the page's filters and has its own Buildings, Jobs,
 * and Students filters, so one sign per office takes no trips back to the
 * page. Title and subtitle follow the filters until the user edits them.
 * Layout, paper, orientation, and note are remembered in this browser.
 */
const StudentScheduleSignDialog = ({
  isOpen,
  onClose,
  scheduledStudents,
  jobColors,
  filterOptions,
  pageFilters,
  semesterLabel,
}) => {
  const [settings, setSettings] = useState(getSavedSignSettings);
  const [filters, setFilters] = useState(pageFilters);
  // null follows the filters; a string is what the user typed.
  const [customTitle, setCustomTitle] = useState(null);
  const [customSubtitle, setCustomSubtitle] = useState(null);
  const [fit, setFit] = useState(null);
  const [printError, setPrintError] = useState("");
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setFilters(pageFilters);
    setCustomTitle(null);
    setCustomSubtitle(null);
    setPrintError("");
  }, [isOpen]);

  const days = useMemo(
    () => buildWeekDays(filterScheduledStudents(scheduledStudents, filters)),
    [scheduledStudents, filters],
  );
  const title = customTitle ?? defaultSignTitle(filters);
  const subtitle =
    customSubtitle ?? defaultSignSubtitle({ semesterLabel, ...filters });
  const setFilter = (key) => (values) =>
    setFilters((previous) => ({ ...previous, [key]: values }));
  const hasFilters = FILTER_KEYS.some((key) => filters[key].length > 0);

  const updateSettings = (patch) =>
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      saveSignSettings(next);
      return next;
    });

  const hasShifts = days.some((day) => day.events.length > 0);
  const { widthIn, heightIn } = getSheetSize(
    settings.paper,
    settings.orientation,
  );

  const handlePrint = async () => {
    setPrintError("");
    try {
      await printSheets([sheetRef.current], title || "Student Worker Schedule");
      trackAction("student_schedule_sign_printed", {
        layout: settings.layout,
        paper: settings.paper,
        orientation: settings.orientation,
        filtered: hasFilters,
      });
    } catch (error) {
      console.error("Sign print failed:", error);
      trackFailure("pdf_export", error);
      setPrintError("The print dialog didn't open. Please try again.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title="Print a one-page schedule"
      subtitle="Make a sign for an office door or front desk. It always prints on a single page."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePrint}
            disabled={!hasShifts}
          >
            <Printer size={16} />
            Print or save as PDF
          </button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-5">
          <section aria-labelledby="sign-filters-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 id="sign-filters-heading" className="form-label mb-0">
                Show on the sign
              </h3>
              <div className="flex gap-3 text-sm">
                {!sameFilters(filters, pageFilters) && (
                  <button
                    type="button"
                    className="text-baylor-green underline underline-offset-2"
                    onClick={() => setFilters(pageFilters)}
                  >
                    Use page filters
                  </button>
                )}
                {hasFilters && (
                  <button
                    type="button"
                    className="text-baylor-green underline underline-offset-2"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                  >
                    Show everyone
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Starts with the filters on the page. Changes here only affect
              the sign.
            </p>
            <FilterSelect
              label="Buildings"
              options={filterOptions.buildings}
              selected={filters.buildings}
              onChange={setFilter("buildings")}
              placeholder="All buildings"
            />
            <FilterSelect
              label="Jobs"
              options={filterOptions.jobTitles}
              selected={filters.jobTitles}
              onChange={setFilter("jobTitles")}
              placeholder="All jobs"
            />
            <FilterSelect
              label="Students"
              options={filterOptions.studentIds}
              selected={filters.studentIds}
              onChange={setFilter("studentIds")}
              placeholder="All students"
              displayMap={filterOptions.studentNames}
              enableSearch
              searchPlaceholder="Search students…"
            />
          </section>

          <fieldset>
            <legend className="form-label">Layout</legend>
            <div className="space-y-2">
              {SIGN_LAYOUTS.map((option) => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${settings.layout === option.id ? "border-baylor-green bg-baylor-green/5" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <input
                    type="radio"
                    name="sign-layout"
                    value={option.id}
                    checked={settings.layout === option.id}
                    onChange={() => updateSettings({ layout: option.id })}
                    className="mt-1 text-baylor-green focus:ring-baylor-green"
                  />
                  <span>
                    <span className="block font-semibold text-gray-900">
                      {option.label}
                    </span>
                    <span className="block text-sm text-gray-600">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <Segmented
              label="Paper"
              options={PAPER_SIZES}
              value={settings.paper}
              onChange={(paper) => updateSettings({ paper })}
            />
            <Segmented
              label="Orientation"
              options={ORIENTATIONS}
              value={settings.orientation}
              onChange={(orientation) => updateSettings({ orientation })}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="sign-title">
              Title
            </label>
            <input
              id="sign-title"
              type="text"
              className="form-input py-2"
              value={title}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="sign-subtitle">
              Subtitle
            </label>
            <input
              id="sign-subtitle"
              type="text"
              className="form-input py-2"
              value={subtitle}
              onChange={(e) => setCustomSubtitle(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="sign-note">
              Note at the bottom
            </label>
            <input
              id="sign-note"
              type="text"
              className="form-input py-2"
              maxLength={MAX_NOTE_LENGTH}
              placeholder="e.g. Questions? Call the front desk at 254-710-3626"
              value={settings.note}
              onChange={(e) => updateSettings({ note: e.target.value })}
            />
          </div>

          {hasShifts ? (
            <FitReadout fit={fit} settings={settings} />
          ) : (
            <p className="text-sm text-gray-600" role="status">
              No shifts match these filters.
            </p>
          )}
          {printError && (
            <p className="text-sm text-red-700" role="alert">
              {printError}
            </p>
          )}
        </div>

        <SignPreview widthIn={widthIn} heightIn={heightIn}>
          <StudentScheduleSign
            ref={sheetRef}
            settings={settings}
            title={title}
            subtitle={subtitle}
            days={days}
            jobColors={jobColors}
            onFit={setFit}
          />
        </SignPreview>
      </div>
    </Modal>
  );
};

export default StudentScheduleSignDialog;
