import { Calendar, CheckCircle2, Map as MapIcon, Thermometer } from "lucide-react";

const QuickStats = ({
  selectedBuilding,
  snapshotLoading,
  viewMode,
  roomCount,
  roomsWithData,
  coveragePercent,
  timezoneLabel,
}) => {
  const show =
    selectedBuilding &&
    !snapshotLoading &&
    (viewMode === "floorplan" || viewMode === "daily" || viewMode === "historical");

  if (!show) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-tutorial="quick-stats">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-baylor-green/10 flex items-center justify-center">
            <MapIcon className="w-5 h-5 text-baylor-green" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{roomCount}</div>
            <div className="text-xs text-gray-500">Total Rooms</div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-baylor-green/10 flex items-center justify-center">
            <Thermometer className="w-5 h-5 text-baylor-green" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{roomsWithData}</div>
            <div className="text-xs text-gray-500">With Data</div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${coveragePercent >= 80 ? "bg-green-100" : coveragePercent >= 50 ? "bg-yellow-100" : "bg-red-100"}`}
          >
            <CheckCircle2
              className={`w-5 h-5 ${coveragePercent >= 80 ? "text-green-600" : coveragePercent >= 50 ? "text-yellow-600" : "text-red-600"}`}
            />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{coveragePercent}%</div>
            <div className="text-xs text-gray-500">Coverage</div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{timezoneLabel}</div>
            <div className="text-xs text-gray-500">Timezone</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickStats;
