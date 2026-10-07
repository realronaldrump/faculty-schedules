import { useHubTabs } from "../../hooks/useHubTabs";
import HubTabs from "../shared/HubTabs";
import PageHeader from "../shared/PageHeader";
import StudentSchedules from "./StudentSchedules";
import StudentWorkerAnalytics from "../analytics/StudentWorkerAnalytics.jsx";

const TAB_DEFINITIONS = [
  {
    id: "schedule",
    label: "Schedules",
    component: StudentSchedules,
  },
  {
    id: "payroll",
    label: "Payroll",
    component: StudentWorkerAnalytics,
  },
];

const CANONICAL_PATH = "/scheduling/student-workers";

const StudentWorkersHub = ({ initialTab }) => {
  const { activeTab, handleTabChange } = useHubTabs({
    tabs: TAB_DEFINITIONS,
    initialTab,
    strategy: "query",
    canonicalPath: CANONICAL_PATH,
  });

  const activeTabConfig = TAB_DEFINITIONS.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Workers"
        subtitle="Review schedules and payroll insights for student worker assignments."
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

export default StudentWorkersHub;
