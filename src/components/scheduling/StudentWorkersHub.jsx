import { useHubTabs } from "../../hooks/useHubTabs";
import HubTabs from "../shared/HubTabs";
import PageHeader from "../shared/PageHeader";
import StudentSchedules from "./StudentSchedules";
import StudentWorkerAnalytics from "../analytics/StudentWorkerAnalytics.jsx";

const TAB_DEFINITIONS = [
  {
    id: "schedule",
    label: "Schedules",
    accessId: "scheduling/student-workers",
    component: StudentSchedules,
  },
  {
    id: "payroll",
    label: "Payroll",
    accessId: "scheduling/student-workers",
    component: StudentWorkerAnalytics,
  },
];

const CANONICAL_PATH = "/scheduling/student-workers";

const StudentWorkersHub = ({ initialTab }) => {
  const { availableTabs, activeTab, handleTabChange } = useHubTabs({
    tabs: TAB_DEFINITIONS,
    initialTab,
    strategy: "query",
    canonicalPath: CANONICAL_PATH,
  });

  const activeTabConfig = availableTabs.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Workers"
        subtitle="Review schedules and payroll insights for student worker assignments."
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
          You do not have access to any student worker views.
        </div>
      )}
    </div>
  );
};

export default StudentWorkersHub;
