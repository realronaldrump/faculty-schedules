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
    accessId: "scheduling/faculty",
    component: FacultySchedules,
  },
  {
    id: "availability",
    label: "Availability",
    accessId: "scheduling/faculty",
    component: IndividualAvailability,
  },
  {
    id: "meetings",
    label: "Group Meetings",
    accessId: "scheduling/faculty",
    component: GroupMeetings,
  },
];

const CANONICAL_PATH = "/scheduling/faculty";

const FacultyHub = ({ initialTab }) => {
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
        title="Faculty"
        subtitle="Compare schedules, find availability, and plan meetings."
        className="mb-0"
      />

      <HubTabs
        tabs={availableTabs}
        activeTab={activeTab}
        onChange={handleTabChange}
        dataTutorialPrefix="faculty-tab-"
      />

      {ActiveComponent ? (
        <ActiveComponent embedded />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-600">
          You do not have access to any faculty scheduling views.
        </div>
      )}
    </div>
  );
};

export default FacultyHub;
