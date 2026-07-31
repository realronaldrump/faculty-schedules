import { MoveHorizontal } from "lucide-react";

/**
 * Gives wide data tables a keyboard-focusable scroll region and an explicit
 * small-screen affordance instead of letting additional columns appear cut off.
 */
const ResponsiveTableScroll = ({ children, className = "", label = "Data table" }) => (
  <div className="relative">
    <div className="mb-2 flex items-center gap-2 text-xs text-gray-500 sm:hidden">
      <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
      <span>Swipe horizontally to see all columns</span>
    </div>
    <div
      className={`baylor-scrollbar overflow-x-auto overscroll-x-contain ${className}`}
      tabIndex={0}
      role="region"
      aria-label={`${label}; horizontally scrollable on smaller screens`}
    >
      {children}
    </div>
  </div>
);

export default ResponsiveTableScroll;
