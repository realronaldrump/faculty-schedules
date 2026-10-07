import { useHubTabs } from "../../hooks/useHubTabs";
import HubTabs from "../shared/HubTabs";
import PageHeader from "../shared/PageHeader";
import RoomSchedules from "./RoomSchedules";
import RoomReservations from "./RoomReservations";

const TAB_DEFINITIONS = [
  {
    id: "browse",
    label: "Browse",
    component: RoomSchedules,
  },
  {
    id: "reservations",
    label: "Reservations",
    component: RoomReservations,
  },
];

const CANONICAL_PATH = "/scheduling/rooms";

// Legacy `?tab=` values that now live on their own routes.
const REDIRECTS = {
  calendar: "/tools/outlook-export",
  grids: "/tools/room-grid-generator",
};

const RoomsHub = ({ initialTab }) => {
  const { activeTab, handleTabChange } = useHubTabs({
    tabs: TAB_DEFINITIONS,
    initialTab,
    strategy: "query",
    canonicalPath: CANONICAL_PATH,
    redirects: REDIRECTS,
  });

  const activeTabConfig = TAB_DEFINITIONS.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rooms"
        subtitle="Browse room schedules and availability."
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

export default RoomsHub;
