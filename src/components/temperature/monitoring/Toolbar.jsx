import { Calendar, Eye, EyeOff, Map as MapIcon, Thermometer } from "lucide-react";
import { formatMinutesToLabel } from "../../../utils/timeUtils";

import SelectDropdown from "../../SelectDropdown";
const Toolbar = ({
  selectedBuilding,
  buildingOptions,
  hiddenBuildingCodes,
  showHidden,
  onToggleShowHidden,
  onBuildingChange,
  showSnapshotControls,
  selectedDate,
  onDateChange,
  selectedSnapshotId,
  onSnapshotChange,
  snapshotTimes,
}) => (
  <div className="p-4 border-b border-gray-100">
    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
      <div className="flex-1 min-w-0" data-tutorial="building-selector">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Building
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <MapIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10 pointer-events-none" />
            <SelectDropdown
              className="form-select pl-9 w-full font-medium"
              value={selectedBuilding}
              onChange={(e) => onBuildingChange(e.target.value)}
            >
              <option value="">Select building...</option>
              {buildingOptions.map((building) => (
                <option key={building.code} value={building.code}>
                  {building.name}
                  {hiddenBuildingCodes.has(building.code) ? " (hidden)" : ""}
                </option>
              ))}
            </SelectDropdown>
          </div>
          {hiddenBuildingCodes.size > 0 && (
            <button
              onClick={onToggleShowHidden}
              className="p-2 rounded-lg text-sm font-medium flex items-center gap-1 transition bg-gray-100 text-gray-700 hover:bg-gray-200"
              title={showHidden ? "Hide hidden buildings" : "Show hidden buildings"}
            >
              {showHidden ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {showSnapshotControls && (
        <>
          <div className="hidden lg:block w-px h-10 bg-gray-200" />

          <div data-tutorial="date-selector">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Date
            </label>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                className="form-input"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
              />
            </div>
          </div>

          <div data-tutorial="snapshot-time-selector">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Snapshot Time
            </label>
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-gray-400" />
              <SelectDropdown
                className="form-select"
                value={selectedSnapshotId}
                onChange={(e) => onSnapshotChange(e.target.value)}
              >
                {snapshotTimes.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label || formatMinutesToLabel(slot.minutes)}
                  </option>
                ))}
              </SelectDropdown>
            </div>
          </div>
        </>
      )}
    </div>
  </div>
);

export default Toolbar;
