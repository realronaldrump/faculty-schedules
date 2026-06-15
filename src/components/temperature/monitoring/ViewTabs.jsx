import {
  Download,
  FileUp,
  History,
  LayoutGrid,
  LineChart,
  Map as MapIcon,
  Thermometer,
} from "lucide-react";

const TAB_ICONS = {
  floorplan: MapIcon,
  daily: LayoutGrid,
  historical: History,
  trends: LineChart,
  import: FileUp,
  export: Download,
  settings: Thermometer,
};

const ViewTabs = ({
  dataViewTabs,
  actionTabs,
  viewMode,
  onViewModeChange,
}) => (
  <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div
      className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg"
      data-tutorial="data-view-tabs"
    >
      {dataViewTabs.map((tab) => {
        const Icon = TAB_ICONS[tab.id];
        const isActive = viewMode === tab.id;
        return (
          <button
            key={tab.id}
            data-tutorial={`view-tab-${tab.id}`}
            onClick={() => onViewModeChange(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${isActive
              ? "bg-white text-baylor-green shadow-sm"
              : "text-gray-600 hover:text-gray-900"
              }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>

    <div className="flex items-center gap-2" data-tutorial="action-tabs">
      {actionTabs.map((tab) => {
        const Icon = TAB_ICONS[tab.id];
        const isActive = viewMode === tab.id;
        return (
          <button
            key={tab.id}
            data-tutorial={`action-tab-${tab.id}`}
            onClick={() => onViewModeChange(tab.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition border ${isActive
              ? "bg-baylor-green text-white border-baylor-green"
              : "bg-white text-gray-700 border-gray-200 hover:border-baylor-green/50 hover:text-baylor-green"
              }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export default ViewTabs;
