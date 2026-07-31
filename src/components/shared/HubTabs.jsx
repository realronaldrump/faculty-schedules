/**
 * HubTabs - the single, shared in-page tab bar for hub components.
 *
 * Renders one canonical pill-style tab row, replacing the per-hub copies that
 * had drifted into two different visual styles. Supports optional per-tab icons
 * and a `data-tutorial` prefix so the tutorial system keeps targeting tabs.
 *
 * Renders nothing when there are fewer than two tabs (a lone tab is noise).
 *
 * @param {Object} props
 * @param {Array} props.tabs - `[{ id, label, icon? }]`
 * @param {string} props.activeTab - id of the active tab
 * @param {(id: string) => void} props.onChange
 * @param {string} [props.dataTutorialPrefix] - prefix for `data-tutorial={prefix + id}`
 * @param {string} [props.className] - extra classes for the wrapper
 */
const HubTabs = ({ tabs, activeTab, onChange, dataTutorialPrefix, className = "" }) => {
  if (!tabs || tabs.length <= 1) return null;

  return (
    <nav
      className={`-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 ${className}`}
      aria-label="Page views"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            type="button"
            key={tab.id}
            aria-pressed={isActive}
            data-tutorial={
              dataTutorialPrefix ? `${dataTutorialPrefix}${tab.id}` : undefined
            }
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
              isActive
                ? "bg-baylor-green/10 text-baylor-green border-baylor-green/30"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {Icon && <Icon size={16} />}
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
};

export default HubTabs;
