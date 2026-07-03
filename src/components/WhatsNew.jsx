import { Sparkles } from "lucide-react";
import Modal from "./shared/Modal";
import Badge from "./shared/Badge";
import { formatReleaseTimestamp } from "../utils/whatsNew";

/**
 * WhatsNew - in-app release notes UI.
 *
 * WhatsNewToast: small dismissible card shown once per release, bottom-right
 * (the opposite corner from Notification so the two never collide).
 * WhatsNewModal: full release history in the shared Modal, reachable anytime
 * from the header Sparkles button.
 */

export const WhatsNewToast = ({ release, onOpen, onDismiss }) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm animate-slide-up"
  >
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white university-shadow-lg">
      <div className="h-1 bg-gradient-to-r from-baylor-green to-baylor-gold" />
      <div className="flex gap-3 p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-baylor-green/10">
          <Sparkles className="h-4 w-4 text-baylor-green" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-900">What's new</h4>
            <Badge tone="warning" size="sm" bordered>
              Version {release.version}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatReleaseTimestamp(release.date)}
          </p>
          <p className="mt-1.5 text-sm text-gray-600">{release.summary}</p>
          <div className="mt-3 flex items-center gap-1">
            <button type="button" onClick={onOpen} className="btn-primary-sm">
              See what's new
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const WhatsNewModal = ({ isOpen, releases, onClose }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    size="md"
    title={
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-baylor-gold" />
        <h2 className="modal-title">What's New</h2>
      </div>
    }
    subtitle="A quick look at what changed in recent updates."
    footer={
      <button type="button" onClick={onClose} className="btn-primary">
        Got it
      </button>
    }
  >
    <div className="space-y-8">
      {releases.map((release, index) => (
        <article
          key={release.version}
          className={index > 0 ? "border-t border-gray-100 pt-8" : ""}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning" size="sm" bordered>
              Version {release.version}
            </Badge>
            {index === 0 && (
              <Badge tone="success" size="sm" showDot>
                Latest
              </Badge>
            )}
            <time dateTime={release.date} className="text-xs text-gray-500">
              {formatReleaseTimestamp(release.date)}
            </time>
          </div>
          <h3 className="mt-2.5 text-lg font-semibold text-baylor-green">
            {release.title}
          </h3>
          <p className="mt-1 text-sm text-gray-600">{release.summary}</p>
          <ul className="mt-4 space-y-4">
            {release.highlights.map((highlight) => (
              <li key={highlight.title} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-baylor-green/10">
                  <highlight.icon className="h-4 w-4 text-baylor-green" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {highlight.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-gray-600">
                    {highlight.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  </Modal>
);
