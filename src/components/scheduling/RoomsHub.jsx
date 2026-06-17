import { useHubTabs } from "../../hooks/useHubTabs";
import HubTabs from "../shared/HubTabs";
import PageHeader from "../shared/PageHeader";
import RoomSchedules from "./RoomSchedules";
import RoomReservations from "./RoomReservations";

const TAB_DEFINITIONS = [
  {
    id: "browse",
    label: "Browse",
    accessId: "scheduling/rooms",
    component: RoomSchedules,
  },
  {
    id: "reservations",
    label: "Reservations",
    accessId: "scheduling/rooms",
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
  const { availableTabs, activeTab, handleTabChange } = useHubTabs({
    tabs: TAB_DEFINITIONS,
    initialTab,
    strategy: "query",
    canonicalPath: CANONICAL_PATH,
    redirects: REDIRECTS,
  });

  const activeTabConfig = availableTabs.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rooms"
        subtitle="Browse room schedules and availability."
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
          You do not have access to any room scheduling views.
        </div>
      )}
    </div>
  );
};

export default RoomsHub;
