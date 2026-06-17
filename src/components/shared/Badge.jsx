/**
 * Badge - the single, shared status/label pill for the whole app.
 *
 * Replaces the previously divergent badge implementations (student StatusBadge,
 * FacultyStatusBadge) with one consistent size + tone API that stays on-brand.
 *
 * @param {Object} props
 * @param {'success'|'warning'|'error'|'info'|'neutral'|'muted'} props.tone - Semantic color (default: 'neutral')
 * @param {'sm'|'md'|'lg'} props.size - Pill size (default: 'md')
 * @param {React.ComponentType} props.icon - Optional lucide-react icon component
 * @param {boolean} props.showDot - Render a leading status dot (default: false)
 * @param {boolean} props.bordered - Add a tone-colored border (default: false)
 * @param {string} props.className - Extra classes
 * @param {React.ReactNode} props.children - Label content
 */
const TONES = {
  success: { bg: "bg-baylor-green/10", text: "text-baylor-green", dot: "bg-baylor-green", border: "border-baylor-green/20" },
  warning: { bg: "bg-baylor-gold/10", text: "text-baylor-green", dot: "bg-baylor-gold", border: "border-baylor-gold/30" },
  error: { bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500", border: "border-red-200" },
  info: { bg: "bg-baylor-blue/10", text: "text-baylor-blue", dot: "bg-baylor-blue", border: "border-baylor-blue/20" },
  neutral: { bg: "bg-gray-100", text: "text-gray-800", dot: "bg-gray-500", border: "border-gray-200" },
  muted: { bg: "bg-gray-50", text: "text-gray-400", dot: "bg-gray-300", border: "border-gray-100" },
};

const SIZES = {
  sm: { pad: "px-2 py-0.5 text-xs gap-1", dot: "w-1.5 h-1.5", icon: "w-3 h-3" },
  md: { pad: "px-2.5 py-1 text-sm gap-1.5", dot: "w-2 h-2", icon: "w-4 h-4" },
  lg: { pad: "px-3 py-1.5 text-base gap-1.5", dot: "w-2.5 h-2.5", icon: "w-4 h-4" },
};

const Badge = ({
  tone = "neutral",
  size = "md",
  icon: Icon,
  showDot = false,
  bordered = false,
  className = "",
  children,
}) => {
  const t = TONES[tone] || TONES.neutral;
  const s = SIZES[size] || SIZES.md;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${s.pad} ${t.bg} ${t.text} ${bordered ? `border ${t.border}` : ""} ${className}`}
    >
      {showDot && <span className={`rounded-full ${t.dot} ${s.dot}`} />}
      {Icon && <Icon className={s.icon} />}
      {children}
    </span>
  );
};

export default Badge;
