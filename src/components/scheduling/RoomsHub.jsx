import React, { useMemo, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import RoomSchedules from "./RoomSchedules";

const TAB_DEFINITIONS = [
  {
    id: "browse",
    label: "Browse",
    accessId: "scheduling/rooms",
    component: RoomSchedules,
  },
];

const CANONICAL_PATH = "/scheduling/rooms";

const RoomsHub = ({ initialTab }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccess } = useAuth();

  const availableTabs = useMemo(
    () => TAB_DEFINITIONS.filter((tab) => canAccess(tab.accessId)),
    [canAccess],
  );

  // Read tab from URL query parameter
  const tabFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("tab");
  }, [location.search]);

  useEffect(() => {
    if (tabFromUrl === "calendar") {
      navigate("/tools/outlook-export", { replace: true });
    }
    if (tabFromUrl === "grids") {
      navigate("/tools/room-grid-generator", { replace: true });
    }
  }, [navigate, tabFromUrl]);

  const fallbackTab = availableTabs[0]?.id || TAB_DEFINITIONS[0].id;
  // Priority: URL query param > initialTab prop > fallback
  const initialSelection = tabFromUrl || initialTab || fallbackTab;

  const [activeTab, setActiveTab] = useState(initialSelection);

  useEffect(() => {
    // URL query param takes priority
    const nextTab = tabFromUrl || initialTab || fallbackTab;
    if (!availableTabs.some((tab) => tab.id === nextTab)) {
      setActiveTab(fallbackTab);
      return;
    }
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, availableTabs, fallbackTab, initialTab, tabFromUrl]);

  useEffect(() => {
    if (location.pathname !== CANONICAL_PATH && initialTab) {
      const params = new URLSearchParams();
      params.set("tab", initialTab || fallbackTab);
      navigate(`${CANONICAL_PATH}?${params.toString()}`, { replace: true });
    }
  }, [fallbackTab, initialTab, location.pathname, navigate]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const params = new URLSearchParams();
    params.set("tab", tabId);
    navigate(`${CANONICAL_PATH}?${params.toString()}`, { replace: true });
  };

  const activeTabConfig = availableTabs.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;
  const showTabs = availableTabs.length > 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Rooms</h1>
        <p className="text-gray-600">
          Browse room schedules and availability.
        </p>
      </div>

      {showTabs && (
        <div className="flex flex-wrap gap-2">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${activeTab === tab.id
                ? "bg-baylor-green/10 text-baylor-green border-baylor-green/30"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {ActiveComponent ? (
        <ActiveComponent embedded />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-600">
          You do not have access to any room scheduling views.
        </div>
      )}
    </div>
  );
};

export default RoomsHub;
