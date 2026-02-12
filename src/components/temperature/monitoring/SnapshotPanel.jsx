import TemperatureTrends from "../TemperatureTrends";

const SnapshotPanel = ({
  viewMode,
  snapshotLoading,
  isSnapshotView,
  renderFloorplan,
  renderDailyTable,
  renderHistorical,
  selectedBuilding,
  buildingSettings,
  roomsForBuilding,
  spacesByKey,
  deviceDocs,
}) => {
  if (snapshotLoading && isSnapshotView) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-gray-600">
        Loading snapshot data...
      </div>
    );
  }

  if (snapshotLoading) return null;

  if (viewMode === "floorplan") return renderFloorplan();
  if (viewMode === "daily") return renderDailyTable();
  if (viewMode === "historical") return renderHistorical();
  if (viewMode === "trends") {
    return (
      <TemperatureTrends
        selectedBuilding={selectedBuilding}
        buildingSettings={buildingSettings}
        roomsForBuilding={roomsForBuilding}
        spacesByKey={spacesByKey}
        deviceDocs={deviceDocs}
      />
    );
  }

  return null;
};

export default SnapshotPanel;
