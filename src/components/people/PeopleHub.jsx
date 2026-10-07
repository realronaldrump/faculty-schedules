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
    preserveQuery: true,
    component: PeopleDirectory,
  },
  {
    id: "email-lists",
    label: "Email Lists",
    path: "people/email-lists",
    component: EmailLists,
  },
  {
    id: "offices",
    label: "Offices",
    path: "people/offices",
    component: BuildingDirectory,
  },
  {
    id: "programs",
    label: "Programs & Directors",
    path: "people/programs",
    component: ProgramManagement,
  },
  {
    id: "baylor-ids",
    label: "Baylor IDs",
    path: "people/baylor-ids",
    component: BaylorIDManager,
  },
];

const PeopleHub = ({ initialTab }) => {
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
        title="People"
        subtitle="Directory, email lists, and people-focused administration."
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

export default PeopleHub;
