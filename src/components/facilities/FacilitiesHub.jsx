/**
 * FacilitiesHub - Central hub for managing physical spaces, buildings, and facilities
 *
 * Provides a unified interface for:
 * - Space Management (rooms, offices, labs, studios, conference rooms)
 * - Building Management (building definitions, aliases, configuration)
 * - Temperature Monitoring (sensor mapping, readings, floorplans)
 *
 * This is the primary destination for all facility-related administration.
 */

import { Building2, DoorOpen, Thermometer } from "lucide-react";
import { useHubTabs } from "../../hooks/useHubTabs";
import HubTabs from "../shared/HubTabs";
import PageHeader from "../shared/PageHeader";
import SpaceManagement from "../administration/SpaceManagement";
import BuildingManagement from "../administration/BuildingManagement";
import TemperatureMonitoring from "../temperature/TemperatureMonitoring";

const TAB_DEFINITIONS = [
  {
    id: "spaces",
    label: "Spaces",
    icon: DoorOpen,
    path: "facilities/spaces",
    description: "Manage rooms, offices, labs, and other spaces",
    component: SpaceManagement,
  },
  {
    id: "buildings",
    label: "Buildings",
    icon: Building2,
    path: "facilities/buildings",
    description: "Configure buildings and aliases",
    component: BuildingManagement,
  },
  {
    id: "temperature",
    label: "Temperature",
    icon: Thermometer,
    path: "facilities/temperature",
    description: "Monitor room temperatures and manage sensors",
    component: TemperatureMonitoring,
  },
];

const FacilitiesHub = ({ initialTab }) => {
  const { activeTab, handleTabChange } = useHubTabs({
    tabs: TAB_DEFINITIONS,
    initialTab,
    strategy: "path",
  });

  const activeTabConfig = TAB_DEFINITIONS.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facilities"
        subtitle="Manage buildings, rooms, offices, and facility monitoring."
        className="mb-0"
      />

      <HubTabs
        tabs={TAB_DEFINITIONS}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTabConfig?.description && (
        <div className="text-sm text-gray-500">
          {activeTabConfig.description}
        </div>
      )}

      <div className="min-h-[400px]">
        <ActiveComponent />
      </div>
    </div>
  );
};

export default FacilitiesHub;
