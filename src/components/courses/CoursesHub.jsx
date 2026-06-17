import { useHubTabs } from "../../hooks/useHubTabs";
import HubTabs from "../shared/HubTabs";
import PageHeader from "../shared/PageHeader";
import CourseBrowser from "./CourseBrowser";
import CourseManagement from "./CourseManagement";

const TAB_DEFINITIONS = [
  {
    id: "browse",
    label: "Browse",
    path: "courses/browse",
    accessId: "courses/browse",
    component: CourseBrowser,
  },
  {
    id: "manage",
    label: "Manage",
    path: "courses/manage",
    accessId: "courses/manage",
    component: CourseManagement,
  },
];

const CoursesHub = ({ initialTab }) => {
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
        title="Courses"
        subtitle="Browse and search course schedules across the department."
        className="mb-0"
      />

      <HubTabs
        tabs={availableTabs}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

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
