import React, { useMemo, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import CourseBrowser from "./CourseBrowser";
import CourseManagement from "./CourseManagement";

const TAB_DEFINITIONS = [
  {
    id: "browse",
    label: "Browse",
    accessId: "courses/browse",
    component: CourseBrowser,
  },
  {
    id: "manage",
    label: "Manage",
    accessId: "courses/manage",
    component: CourseManagement,
  },
];

const CANONICAL_PATH = "/courses/browse";

const CoursesHub = ({ initialTab }) => {
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

  // Determine initial tab from path
  const initialTabFromPath = useMemo(() => {
    if (location.pathname === "/courses/manage") return "manage";
    if (location.pathname === "/courses/browse") return "browse";
    return null;
  }, [location.pathname]);

  const fallbackTab = availableTabs[0]?.id || TAB_DEFINITIONS[0].id;
  // Priority: URL path > URL query param > initialTab prop > fallback
  const initialSelection = initialTabFromPath || tabFromUrl || initialTab || fallbackTab;

  const [activeTab, setActiveTab] = useState(initialSelection);

  useEffect(() => {
    // URL path takes priority, then query param
    const nextTab = initialTabFromPath || tabFromUrl || initialTab || fallbackTab;
    if (!availableTabs.some((tab) => tab.id === nextTab)) {
      setActiveTab(fallbackTab);
      return;
    }
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, availableTabs, fallbackTab, initialTab, initialTabFromPath, tabFromUrl]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const basePath = tabId === "manage" ? "/courses/manage" : "/courses/browse";
    navigate(basePath, { replace: true });
  };

  const activeTabConfig = availableTabs.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Courses</h1>
        <p className="text-gray-600">
          Browse and search course schedules across the department.
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
          You do not have access to any course views.
        </div>
      )}
    </div>
  );
};

export default CoursesHub;
