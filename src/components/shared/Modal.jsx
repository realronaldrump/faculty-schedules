import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Modal - the single, shared dialog primitive for the whole app.
 *
 * Replaces the ~18 hand-rolled `fixed inset-0` overlays (each with its own
 * backdrop, sizing, close button, and inconsistent escape/scroll handling)
 * with one portal-rendered component that handles overlay, sizing, ESC,
 * click-outside, body scroll-lock, and focus/a11y in one place.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Called on close (X, ESC, or overlay click)
 * @param {React.ReactNode} props.title - Header title. A string is rendered as
 *   the standard `.modal-title`; a node is rendered as-is for custom headers.
 * @param {React.ReactNode} props.subtitle - Optional line under the title
 * @param {React.ReactNode} props.footer - Optional footer content (action buttons)
 * @param {'sm'|'md'|'lg'|'xl'|'full'} props.size - Panel width (default: 'md')
 * @param {boolean} props.showClose - Show the header close button (default: true)
 * @param {boolean} props.closeOnOverlayClick - Close when clicking the backdrop (default: true)
 * @param {boolean} props.closeOnEsc - Close on Escape key (default: true)
 * @param {string} props.className - Extra classes for the panel
 * @param {string} props.bodyClassName - Classes for the scrollable body (default: '.modal-body')
 * @param {React.ReactNode} props.children - Body content
 */
const SIZES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
  full: "max-w-7xl",
};

const Modal = ({
  isOpen,
  onClose,
  title,
  subtitle,
  footer,
  size = "md",
  showClose = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  className = "",
  bodyClassName = "modal-body",
  children,
}) => {
  const panelRef = useRef(null);

  // Escape-to-close
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, closeOnEsc, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  // Focus the panel on open; restore focus to the trigger on close
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = SIZES[size] || SIZES.md;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={() => closeOnOverlayClick && onClose?.()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`bg-white rounded-xl shadow-xl w-full ${sizeClass} max-h-[90vh] overflow-hidden flex flex-col animate-scale-in focus:outline-none ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title != null || showClose) && (
          <div className="modal-header flex items-start justify-between gap-4">
            <div className="min-w-0">
              {typeof title === "string" ? (
                <h2 className="modal-title">{title}</h2>
              ) : (
                title
              )}
              {subtitle && (
                <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>
              )}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                className="btn-icon-secondary -mr-2 -mt-1 shrink-0"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
