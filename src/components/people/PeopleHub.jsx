import { useHubTabs } from "../../hooks/useHubTabs";
import HubTabs from "../shared/HubTabs";
import PageHeader from "../shared/PageHeader";
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
    preserveQuery: true,
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
        title="People"
        subtitle="Directory, email lists, and people-focused administration."
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
          You do not have access to any people views.
        </div>
      )}
    </div>
  );
};

export default PeopleHub;
