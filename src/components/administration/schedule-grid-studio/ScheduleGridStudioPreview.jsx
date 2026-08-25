import { forwardRef, memo, useMemo } from "react";

import {
  STUDIO_DAYS,
  formatInstructorForStudio,
  formatStudioTime,
  getStudioTimeRange,
  layoutStudioEntriesForDay,
} from "../../../utils/scheduleGridStudio";

const SCREEN_DPI = 96;

const getEntryLabel = (entry) =>
  [
    entry.course,
    entry.section,
    entry.instructor,
    `${formatStudioTime(entry.start)}–${formatStudioTime(entry.end)}`,
  ]
    .filter(Boolean)
    .join(" · ");

const ScheduleGridStudioPreview = memo(
  forwardRef(function ScheduleGridStudioPreview(
    {
      document,
      zoom = 1,
      selectedEntryId = "",
      onSelectEntry,
      interactive = true,
    },
    ref,
  ) {
    const { layout, visibility, entries } = document;
    const timeRange = useMemo(() => getStudioTimeRange(layout), [layout]);
    const hourLabels = useMemo(() => {
      const labels = [];
      const step = [30, 60, 120].includes(Number(layout.timeStep))
        ? Number(layout.timeStep)
        : 60;
      for (
        let minutes = timeRange.start;
        minutes <= timeRange.end;
        minutes += step
      ) {
        labels.push(minutes);
      }
      if (labels.at(-1) !== timeRange.end) labels.push(timeRange.end);
      return labels;
    }, [layout.timeStep, timeRange]);

    const entriesByDay = useMemo(
      () =>
        Object.fromEntries(
          STUDIO_DAYS.map((day) => [
            day.code,
            layoutStudioEntriesForDay(entries, day.code, layout),
          ]),
        ),
      [entries, layout],
    );

    const headingParts = [
      visibility.building ? document.building : "",
      visibility.room ? document.room : "",
    ].filter(Boolean);
    const heading = headingParts.join(" ") || document.name;
    const widthPx = layout.widthIn * SCREEN_DPI;
    const heightPx = layout.heightIn * SCREEN_DPI;
    const safeZoom = Math.min(1.25, Math.max(0.35, Number(zoom) || 1));
    const baseTextSize = 10 * layout.textScale;

    return (
      <div
        className="relative shrink-0"
        style={{
          width: `${widthPx * safeZoom}px`,
          height: `${heightPx * safeZoom}px`,
        }}
      >
        <div
          style={{
            width: `${widthPx}px`,
            height: `${heightPx}px`,
            transform: `scale(${safeZoom})`,
            transformOrigin: "top left",
          }}
        >
          <div
            ref={ref}
            className="exportable-room-schedule schedule-grid-studio-sheet"
            data-export-name={document.name}
            style={{
              width: `${layout.widthIn}in`,
              height: `${layout.heightIn}in`,
              backgroundColor: layout.pageColor,
              color: "#111827",
              display: "flex",
              flexDirection: "column",
              boxSizing: "border-box",
              overflow: "hidden",
              fontFamily: '"calluna", Georgia, "Times New Roman", serif',
            }}
          >
            <style>{`
              @page { size: ${layout.widthIn}in ${layout.heightIn}in; margin: 0; }
              @media print {
                .schedule-grid-studio-sheet {
                  width: ${layout.widthIn}in !important;
                  height: ${layout.heightIn}in !important;
                  print-color-adjust: exact;
                  -webkit-print-color-adjust: exact;
                }
                .studio-entry-selected { outline: none !important; box-shadow: none !important; }
              }
            `}</style>

            <header
              style={{
                backgroundColor: layout.accentColor,
                color: "#ffffff",
                borderBottom: `4px solid ${layout.highlightColor}`,
                padding: `${8 * layout.headerScale}px ${16 * layout.headerScale}px`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                minHeight: `${48 * layout.headerScale}px`,
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: `${18 * layout.headerScale}px`,
                    fontWeight: 800,
                    lineHeight: 1.05,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {heading}
                </div>
                {visibility.headerNote && document.headerNote ? (
                  <div
                    style={{
                      fontSize: `${9 * layout.headerScale}px`,
                      lineHeight: 1.1,
                      marginTop: "3px",
                      opacity: 0.9,
                    }}
                  >
                    {document.headerNote}
                  </div>
                ) : null}
              </div>
              {visibility.semester && document.semester ? (
                <div
                  style={{
                    fontSize: `${11 * layout.headerScale}px`,
                    fontWeight: 700,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {document.semester}
                </div>
              ) : null}
            </header>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                padding: "8px 8px 6px",
              }}
            >
              <div
                style={{
                  width: visibility.timeLabels ? "44px" : "8px",
                  flexShrink: 0,
                  paddingTop: visibility.dayHeaders ? "25px" : 0,
                  position: "relative",
                  transition: "width 160ms ease",
                }}
              >
                {visibility.timeLabels
                  ? hourLabels.map((minutes) => {
                      const top =
                        ((minutes - timeRange.start) / timeRange.total) * 100;
                      return (
                        <div
                          key={minutes}
                          style={{
                            position: "absolute",
                            top: `${top}%`,
                            right: "5px",
                            transform: "translateY(-50%)",
                            color: layout.accentColor,
                            fontSize: `${8.5 * layout.textScale}px`,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatStudioTime(minutes)}
                        </div>
                      );
                    })
                  : null}
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: `${layout.blockGap}px`,
                }}
              >
                {STUDIO_DAYS.map((day) => (
                  <section
                    key={day.code}
                    aria-label={day.label}
                    style={{
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {visibility.dayHeaders ? (
                      <div
                        style={{
                          height: "25px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: layout.accentColor,
                          color: "#ffffff",
                          borderRadius: `${Math.min(layout.blockRadius, 8)}px ${Math.min(layout.blockRadius, 8)}px 0 0`,
                          fontSize: `${10 * layout.textScale}px`,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {day.short}
                      </div>
                    ) : null}

                    <div
                      style={{
                        position: "relative",
                        flex: 1,
                        minHeight: 0,
                        backgroundColor: "#f8faf9",
                        border: `1px solid color-mix(in srgb, ${layout.accentColor} ${Math.round(layout.gridOpacity * 35)}%, transparent)`,
                        borderTop: visibility.dayHeaders ? 0 : undefined,
                        borderRadius: visibility.dayHeaders
                          ? `0 0 ${Math.min(layout.blockRadius, 8)}px ${Math.min(layout.blockRadius, 8)}px`
                          : `${Math.min(layout.blockRadius, 8)}px`,
                        overflow: "hidden",
                      }}
                    >
                      {visibility.gridLines
                        ? hourLabels.slice(1).map((minutes) => {
                            const top =
                              ((minutes - timeRange.start) / timeRange.total) *
                              100;
                            return (
                              <div
                                key={`line-${minutes}`}
                                aria-hidden="true"
                                style={{
                                  position: "absolute",
                                  top: `${top}%`,
                                  left: 0,
                                  right: 0,
                                  borderTop: `1px dashed color-mix(in srgb, ${layout.accentColor} ${Math.round(layout.gridOpacity * 40)}%, transparent)`,
                                }}
                              />
                            );
                          })
                        : null}

                      {entriesByDay[day.code].map((entry) => {
                        const top =
                          ((entry.startMinutes - timeRange.start) /
                            timeRange.total) *
                          100;
                        const height =
                          ((entry.endMinutes - entry.startMinutes) /
                            timeRange.total) *
                          100;
                        const laneWidth = 100 / entry.laneCount;
                        const left = laneWidth * entry.lane;
                        const duration = entry.endMinutes - entry.startMinutes;
                        const isTight = duration < 55;
                        const isCompact = entry.detailLevel === "compact";
                        const isDetailed = entry.detailLevel === "detailed";
                        const courseLabel = [
                          visibility.course ? entry.course : "",
                          visibility.section && entry.section
                            ? `.${entry.section}`
                            : "",
                        ].join("");
                        const instructor = visibility.instructor
                          ? formatInstructorForStudio(
                              entry.instructor,
                              layout.instructorFormat,
                            )
                          : "";
                        const classTime = visibility.classTime
                          ? `${formatStudioTime(entry.start)}–${formatStudioTime(entry.end)}`
                          : "";
                        const content = (
                          <>
                            {courseLabel ? (
                              <div
                                style={{
                                  color: layout.accentColor,
                                  fontSize: `${baseTextSize * (isTight ? 0.88 : 1)}px`,
                                  fontWeight: 800,
                                  lineHeight: 1.02,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: isDetailed ? "normal" : "nowrap",
                                  width: "100%",
                                }}
                              >
                                {courseLabel}
                              </div>
                            ) : null}
                            {instructor ? (
                              <div
                                style={{
                                  color: "#263b33",
                                  fontSize: `${baseTextSize * (isTight ? 0.78 : 0.86)}px`,
                                  fontWeight: 650,
                                  lineHeight: 1.02,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: isCompact ? "nowrap" : "normal",
                                  overflowWrap: "anywhere",
                                  width: "100%",
                                }}
                              >
                                {instructor}
                              </div>
                            ) : null}
                            {classTime && !isCompact ? (
                              <div
                                style={{
                                  color: "#4b5563",
                                  fontSize: `${baseTextSize * 0.68}px`,
                                  lineHeight: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  width: "100%",
                                }}
                              >
                                {classTime}
                              </div>
                            ) : null}
                            {entry.note && isDetailed ? (
                              <div
                                style={{
                                  color: "#4b5563",
                                  fontSize: `${baseTextSize * 0.66}px`,
                                  lineHeight: 1,
                                  overflow: "hidden",
                                  width: "100%",
                                }}
                              >
                                {entry.note}
                              </div>
                            ) : null}
                          </>
                        );

                        return (
                          <button
                            key={`${day.code}-${entry.id}`}
                            type="button"
                            title={getEntryLabel(entry)}
                            aria-label={`Edit ${getEntryLabel(entry)}`}
                            onClick={
                              interactive && onSelectEntry
                                ? () => onSelectEntry(entry.id)
                                : undefined
                            }
                            className={
                              selectedEntryId === entry.id
                                ? "studio-entry-selected"
                                : ""
                            }
                            tabIndex={interactive ? 0 : -1}
                            style={{
                              position: "absolute",
                              top: `${top}%`,
                              height: `${height}%`,
                              left: `calc(${left}% + 1px)`,
                              width: `calc(${laneWidth}% - 2px)`,
                              appearance: "none",
                              border: `1px solid ${layout.accentColor}`,
                              borderLeft: `3px solid ${layout.accentColor}`,
                              borderRadius: `${layout.blockRadius}px`,
                              backgroundColor:
                                entry.blockColor || layout.blockColor,
                              padding: isTight ? "1px 2px" : "2px 4px",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              textAlign: "center",
                              cursor: interactive ? "pointer" : "default",
                              overflow: "hidden",
                              boxSizing: "border-box",
                              outline:
                                selectedEntryId === entry.id
                                  ? `2px solid ${layout.highlightColor}`
                                  : "none",
                              outlineOffset: "-2px",
                              boxShadow:
                                selectedEntryId === entry.id
                                  ? `0 0 0 2px ${layout.highlightColor}55`
                                  : "none",
                            }}
                          >
                            {content}
                          </button>
                        );
                      })}

                      {visibility.emptyDays &&
                      entriesByDay[day.code].length === 0 ? (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "grid",
                            placeItems: "center",
                            color: "#9ca3af",
                            fontSize: `${9 * layout.textScale}px`,
                            fontStyle: "italic",
                          }}
                        >
                          No classes
                        </div>
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            {visibility.footer ? (
              <footer
                style={{
                  minHeight: "22px",
                  backgroundColor: "#f3f4f6",
                  borderTop: "1px solid #e5e7eb",
                  padding: "4px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  color: "#6b7280",
                  fontSize: `${8 * layout.textScale}px`,
                  flexShrink: 0,
                }}
              >
                <span>{document.footerLeft}</span>
                <span>{document.footerRight}</span>
              </footer>
            ) : null}
          </div>
        </div>
      </div>
    );
  }),
);

ScheduleGridStudioPreview.displayName = "ScheduleGridStudioPreview";

export default ScheduleGridStudioPreview;
