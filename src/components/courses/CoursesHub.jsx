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
    component: CourseBrowser,
  },
  {
    id: "manage",
    label: "Manage",
    path: "courses/manage",
    component: CourseManagement,
  },
];

const CoursesHub = ({ initialTab }) => {
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
        title="Courses"
        subtitle="Browse and search course schedules across the department."
        className="mb-0"
      />

      <HubTabs
        tabs={TAB_DEFINITIONS}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      <ActiveComponent embedded />
    </div>
  );
};

export default CoursesHub;
