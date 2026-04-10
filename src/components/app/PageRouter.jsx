import React, { Suspense, lazy } from "react";
import ProtectedContent from "../ProtectedContent.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";

const Dashboard = lazy(() => import("../Dashboard"));
const FacultyHub = lazy(() => import("../scheduling/FacultyHub.jsx"));
const RoomsHub = lazy(() => import("../scheduling/RoomsHub.jsx"));
const StudentWorkersHub = lazy(
  () => import("../scheduling/StudentWorkersHub.jsx"),
);
const PeopleHub = lazy(() => import("../people/PeopleHub.jsx"));
const PAFWorkflow = lazy(() => import("../people/PAFWorkflow.jsx"));
const DepartmentInsights = lazy(
  () => import("../analytics/DepartmentInsights.jsx"),
);
const StudentWorkerAnalytics = lazy(
  () => import("../analytics/StudentWorkerAnalytics.jsx"),
);
const CoursesHub = lazy(() =>
  import("../courses").then((module) => ({ default: module.CoursesHub })),
);
const ImportWizard = lazy(() => import("../administration/ImportWizard"));
const AppSettings = lazy(() => import("../administration/AppSettings"));
const DataCleanupRepairsPage = lazy(
  () => import("../administration/data-cleanup/DataCleanupRepairsPage"),
);
const BaylorSystems = lazy(() => import("../resources/BaylorSystems"));
const BaylorAcronyms = lazy(
  () => import("../administration/BaylorAcronyms"),
);
const CRNQualityTools = lazy(
  () => import("../administration/CRNQualityTools"),
);
const RecentChangesPage = lazy(
  () => import("../administration/RecentChangesPage"),
);
const AdminDataExportsPage = lazy(
  () => import("../administration/AdminDataExportsPage.jsx"),
);
const UserActivityPage = lazy(
  () => import("../administration/UserActivityPage.jsx"),
);
const LiveView = lazy(() => import("../LiveView"));
const FacilitiesHub = lazy(() => import("../facilities/FacilitiesHub"));
const OutlookRoomExport = lazy(() => import("../tools/OutlookRoomExport.jsx"));
const RoomGridGenerator = lazy(
  () => import("../administration/RoomGridGenerator.jsx"),
);
const AccessControl = lazy(() => import("../administration/AccessControl.jsx"));
const TutorialPage = lazy(() => import("../help/TutorialPage.jsx"));

const RouteLoadingState = () => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <div className="loading-shimmer w-16 h-16 rounded-full mx-auto mb-4" />
      <p className="text-gray-600">Loading page...</p>
    </div>
  </div>
);

const renderProtectedPage = (pageId, Component, componentProps = {}) => (
  <ProtectedContent pageId={pageId}>
    <Suspense fallback={<RouteLoadingState />}>
      <Component {...componentProps} />
    </Suspense>
  </ProtectedContent>
);

const PageRouter = ({ currentPage, loading }) => {
  const { isActivityOwner } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="loading-shimmer w-16 h-16 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading system data...</p>
        </div>
      </div>
    );
  }

  switch (currentPage) {
    case "dashboard":
      return renderProtectedPage("dashboard", Dashboard);
    case "live-view":
      return renderProtectedPage("live-view", LiveView);
    case "scheduling/faculty":
      return renderProtectedPage("scheduling/faculty", FacultyHub);
    case "scheduling/rooms":
      return renderProtectedPage("scheduling/rooms", RoomsHub);
    case "tools/outlook-export":
      return renderProtectedPage("tools/outlook-export", OutlookRoomExport);
    case "tools/room-grid-generator":
      return renderProtectedPage(
        "tools/room-grid-generator",
        RoomGridGenerator,
      );
    case "scheduling/student-workers":
      return renderProtectedPage(
        "scheduling/student-workers",
        StudentWorkersHub,
      );
    case "people/directory":
    case "people/email-lists":
    case "people/offices":
    case "people/programs":
    case "people/baylor-ids":
      return renderProtectedPage(currentPage, PeopleHub);
    case "workflows/paf":
      return renderProtectedPage("people/directory", PAFWorkflow);
    case "courses/browse":
    case "courses/manage":
      return renderProtectedPage(currentPage, CoursesHub);
    case "analytics/department-insights":
      return renderProtectedPage(
        "analytics/department-insights",
        DepartmentInsights,
      );
    case "analytics/student-worker-analytics":
      return renderProtectedPage(
        "analytics/student-worker-analytics",
        StudentWorkerAnalytics,
      );
    case "admin-tools/import-wizard":
      return renderProtectedPage("admin-tools/import-wizard", ImportWizard);
    case "admin-tools/crn-tools":
      return renderProtectedPage("admin-tools/crn-tools", CRNQualityTools);
    case "help/tutorials":
      return renderProtectedPage("help/tutorials", TutorialPage);
    case "help/baylor-systems":
      return renderProtectedPage("help/baylor-systems", BaylorSystems);
    case "help/acronyms":
      return renderProtectedPage("help/acronyms", BaylorAcronyms);
    case "admin/access-control":
      return renderProtectedPage("admin/access-control", AccessControl);
    case "admin/settings":
      return renderProtectedPage("admin/settings", AppSettings);
    case "admin/recent-changes":
      return renderProtectedPage("admin/recent-changes", RecentChangesPage);
    case "admin/user-activity":
      return (
        isActivityOwner ? (
          renderProtectedPage("admin/user-activity", UserActivityPage)
        ) : (
          renderProtectedPage("dashboard", Dashboard)
        )
      );
    case "admin/data-hygiene":
      return renderProtectedPage(
        "admin/data-hygiene",
        DataCleanupRepairsPage,
      );
    case "admin/data-exports":
      return renderProtectedPage("admin/data-exports", AdminDataExportsPage);
    case "facilities/spaces":
      return renderProtectedPage("facilities/spaces", FacilitiesHub, {
        initialTab: "spaces",
      });
    case "facilities/buildings":
      return renderProtectedPage("facilities/buildings", FacilitiesHub, {
        initialTab: "buildings",
      });
    case "facilities/temperature":
      return renderProtectedPage("facilities/temperature", FacilitiesHub, {
        initialTab: "temperature",
      });
    default:
      return renderProtectedPage("dashboard", Dashboard);
  }
};

export default PageRouter;
