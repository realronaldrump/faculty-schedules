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
    accessId: "facilities/spaces",
    component: SpaceManagement,
  },
  {
    id: "buildings",
    label: "Buildings",
    icon: Building2,
    path: "facilities/buildings",
    description: "Configure buildings and aliases",
    accessId: "facilities/buildings",
    component: BuildingManagement,
  },
  {
    id: "temperature",
    label: "Temperature",
    icon: Thermometer,
    path: "facilities/temperature",
    description: "Monitor room temperatures and manage sensors",
    accessId: "facilities/temperature",
    component: TemperatureMonitoring,
  },
];

const FacilitiesHub = ({ initialTab }) => {
  const { availableTabs, activeTab, handleTabChange } = useHubTabs({
    tabs: TAB_DEFINITIONS,
    initialTab,
    strategy: "path",
  });

  const activeTabConfig = availableTabs.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facilities"
        subtitle="Manage buildings, rooms, offices, and facility monitoring."
        className="mb-0"
      />

      <HubTabs
        tabs={availableTabs}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {activeTabConfig?.description && (
        <div className="text-sm text-gray-500">
          {activeTabConfig.description}
        </div>
      )}

      <div className="min-h-[400px]">
        {ActiveComponent ? (
          <ActiveComponent />
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Building2 size={48} className="mx-auto mb-4 opacity-50" />
            <p>Select a tab to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacilitiesHub;
