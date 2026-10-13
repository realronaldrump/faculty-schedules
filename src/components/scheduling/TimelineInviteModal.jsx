import Modal from "../shared/Modal";
import { JOB_COLORS } from "../../utils/studentScheduleTimeline";

// A sketch of the Timeline layout: days down the side, shifts as bars across.
const PREVIEW_ROWS = [
  { day: "Mon", bars: [[10, 42, 0], [24, 60, 1]] },
  { day: "Tue", bars: [[24, 80, 2], [6, 38, 1], [52, 92, 0]] },
  { day: "Wed", bars: [[10, 42, 0], [30, 68, 3]] },
];

const TimelinePreview = () => (
  <div
    aria-hidden="true"
    className="mb-5 overflow-hidden rounded-lg border border-gray-200"
  >
    {PREVIEW_ROWS.map(({ day, bars }) => (
      <div
        key={day}
        className="flex border-b border-gray-200 last:border-b-0 even:bg-gray-50"
      >
        <div className="w-12 shrink-0 border-r border-gray-200 px-2 py-1.5 text-xs font-bold text-baylor-green">
          {day}
        </div>
        <div className="relative flex-1 py-1.5">
          {bars.map(([start, end, color], index) => (
            <div
              key={index}
              className="relative mb-1 h-2.5 rounded-sm last:mb-0"
              style={{
                left: `${start}%`,
                width: `${end - start}%`,
                backgroundColor: JOB_COLORS[color].swatch,
                opacity: 0.85,
              }}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
);

/**
 * TimelineInviteModal - shown once per browser on the first visit to Student
 * Worker Schedules. Closing it any way other than "Try Timeline" keeps Classic.
 */
const TimelineInviteModal = ({ isOpen, onTryTimeline, onKeepClassic }) => (
  <Modal
    isOpen={isOpen}
    onClose={onKeepClassic}
    size="sm"
    title="Try the new Timeline view"
    footer={
      <>
        <button type="button" className="btn-secondary" onClick={onKeepClassic}>
          Keep Classic
        </button>
        <button type="button" className="btn-primary" onClick={onTryTimeline}>
          Try Timeline
        </button>
      </>
    }
  >
    <TimelinePreview />
    <p className="text-sm text-gray-700">
      Timeline turns the weekly calendar on its side, so every student&apos;s
      full name and shift times show at a glance, even on busy days.
    </p>
    <p className="mt-3 text-sm text-gray-700">
      Classic stays exactly as it is. Switch between{" "}
      <strong className="text-baylor-green">Classic</strong> and{" "}
      <strong className="text-baylor-green">Timeline</strong> anytime with the{" "}
      <strong className="text-baylor-green">View</strong> toggle above the
      calendar.
    </p>
  </Modal>
);

export default TimelineInviteModal;
