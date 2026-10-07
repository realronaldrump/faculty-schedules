import { useHubTabs } from "../../hooks/useHubTabs";
import HubTabs from "../shared/HubTabs";
import PageHeader from "../shared/PageHeader";
import FacultySchedules from "./FacultySchedules";
import IndividualAvailability from "./IndividualAvailability";
import GroupMeetings from "./GroupMeetings";

const TAB_DEFINITIONS = [
  {
    id: "compare",
    label: "Compare Schedules",
    component: FacultySchedules,
  },
  {
    id: "availability",
    label: "Availability",
    component: IndividualAvailability,
  },
  {
    id: "meetings",
    label: "Group Meetings",
    component: GroupMeetings,
  },
];

const CANONICAL_PATH = "/scheduling/faculty";

const FacultyHub = ({ initialTab }) => {
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
        title="Faculty"
        subtitle="Compare schedules, find availability, and plan meetings."
        className="mb-0"
      />

      <HubTabs
        tabs={TAB_DEFINITIONS}
        activeTab={activeTab}
        onChange={handleTabChange}
        dataTutorialPrefix="faculty-tab-"
      />

      <ActiveComponent embedded />
    </div>
  );
};

export default FacultyHub;
