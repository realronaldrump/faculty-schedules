/**
 * PageHeader - the single, shared page/hub title block for the whole app.
 *
 * Standardizes the title + subtitle + optional actions pattern that was
 * previously copy-pasted inline across ~36 pages. Titles render in Baylor
 * green to match every other title surface (cards, modals, tables, metrics).
 *
 * @param {Object} props
 * @param {React.ReactNode} props.title - Page title (required)
 * @param {React.ReactNode} props.subtitle - Optional supporting line under the title
 * @param {React.ReactNode} props.actions - Optional right-aligned actions (buttons, etc.)
 * @param {React.ReactNode} props.children - Optional extra content under the subtitle
 * @param {string} props.className - Extra classes for the wrapper
 */
const PageHeader = ({ title, subtitle, actions, children, className = "" }) => (
  <div className={`flex flex-wrap items-start justify-between gap-4 mb-6 ${className}`}>
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-baylor-green mb-1">{title}</h1>
      {subtitle && <p className="text-gray-600">{subtitle}</p>}
      {children}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export default PageHeader;
