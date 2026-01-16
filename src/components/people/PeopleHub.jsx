import React, { useMemo, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import PeopleDirectory from "./PeopleDirectory";
import EmailLists from "./EmailLists";
import BaylorIDManager from "./BaylorIDManager";
import ProgramManagement from "../analytics/ProgramManagement";
import BuildingDirectory from "../resources/BuildingDirectory";

const TAB_DEFINITIONS = [
  {
    id: "directory",
    label: "Directory",
    path: "people/directory",
    accessId: "people/directory",
    component: PeopleDirectory,
  },
  {
    id: "email-lists",
    label: "Email Lists",
    path: "people/email-lists",
    accessId: "people/email-lists",
    component: EmailLists,
  },
  {
    id: "offices",
    label: "Offices",
    path: "people/offices",
    accessId: "people/offices",
    component: BuildingDirectory,
  },
  {
    id: "programs",
    label: "Programs & UPDs",
    path: "people/programs",
    accessId: "people/programs",
    component: ProgramManagement,
  },
  {
    id: "baylor-ids",
    label: "Baylor IDs",
    path: "people/baylor-ids",
    accessId: "people/baylor-ids",
    component: BaylorIDManager,
  },
];

const PeopleHub = ({ initialTab }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccess } = useAuth();

  const currentPath = useMemo(
    () => location.pathname.replace(/^\//, ""),
    [location.pathname],
  );

  const availableTabs = useMemo(
    () => TAB_DEFINITIONS.filter((tab) => canAccess(tab.accessId)),
    [canAccess],
  );

  // Read tab from URL query parameter
  const tabFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("tab");
  }, [location.search]);

  const tabFromPath = availableTabs.find((tab) => tab.path === currentPath);
  const fallbackTab = availableTabs[0]?.id || TAB_DEFINITIONS[0].id;
  // Priority: URL query param > path-based tab > initialTab prop > fallback
  const initialSelection = tabFromUrl || tabFromPath?.id || initialTab || fallbackTab;

  const [activeTab, setActiveTab] = useState(initialSelection);

  useEffect(() => {
    // URL query param takes priority
    const nextTab = tabFromUrl || tabFromPath?.id || initialTab || fallbackTab;
    if (!availableTabs.some((tab) => tab.id === nextTab)) {
      setActiveTab(fallbackTab);
      return;
    }
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, availableTabs, fallbackTab, initialTab, tabFromPath, tabFromUrl]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const tabConfig = TAB_DEFINITIONS.find((tab) => tab.id === tabId);
    if (tabConfig) {
      const query = tabId === "directory" ? location.search : "";
      navigate(`/${tabConfig.path}${query}`, { replace: true });
    }
  };

  const activeTabConfig = availableTabs.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">People</h1>
        <p className="text-gray-600">
          Directory, email lists, and people-focused administration.
        </p>
      </div>

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

      {ActiveComponent ? (
        <ActiveComponent embedded />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-600">
          You do not have access to any people views.
        </div>
      )}
    </div>
  );
};

export default PeopleHub;
