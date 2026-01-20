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

import React, { useMemo, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2, DoorOpen, Thermometer } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import SpaceManagement from "../administration/SpaceManagement";
import BuildingManagement from "../administration/BuildingManagement";
import TemperatureMonitoring from "../temperature/TemperatureMonitoring";

const TAB_DEFINITIONS = [
  {
    id: "spaces",
    label: "Spaces",
    icon: DoorOpen,
    description: "Manage rooms, offices, labs, and other spaces",
    accessId: "facilities/spaces",
    component: SpaceManagement,
  },
  {
    id: "buildings",
    label: "Buildings",
    icon: Building2,
    description: "Configure buildings and aliases",
    accessId: "facilities/buildings",
    component: BuildingManagement,
  },
  {
    id: "temperature",
    label: "Temperature",
    icon: Thermometer,
    description: "Monitor room temperatures and manage sensors",
    accessId: "facilities/temperature",
    component: TemperatureMonitoring,
  },
];

const CANONICAL_PATH = "/facilities";

const FacilitiesHub = ({ initialTab }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccess } = useAuth();

  const availableTabs = useMemo(
    () => TAB_DEFINITIONS.filter((tab) => canAccess(tab.accessId)),
    [canAccess]
  );

  // Use initialTab from props as the source of truth
  const activeTab = initialTab || availableTabs[0]?.id || TAB_DEFINITIONS[0].id;

  const handleTabChange = (tabId) => {
    // Navigate to the correct path based on the tab's accessId
    // accessId is like "facilities/spaces", so we just prepend "/"
    const tab = availableTabs.find(t => t.id === tabId);
    if (tab) {
      navigate(`/${tab.accessId}`);
    }
  };

  const activeTabConfig = availableTabs.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Facilities</h1>
        <p className="text-gray-600">
          Manage buildings, rooms, offices, and facility monitoring.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
        {availableTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                  ? "bg-baylor-green text-white shadow-sm"
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                }`}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Description */}
      {activeTabConfig && (
        <div className="text-sm text-gray-500">
          {activeTabConfig.description}
        </div>
      )}

      {/* Tab Content */}
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
