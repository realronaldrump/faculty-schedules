import Dashboard from "../Dashboard";
import ProtectedContent from "../ProtectedContent.jsx";
import FacultyHub from "../scheduling/FacultyHub.jsx";
import RoomsHub from "../scheduling/RoomsHub.jsx";
import StudentWorkersHub from "../scheduling/StudentWorkersHub.jsx";
import PeopleHub from "../people/PeopleHub.jsx";
import PAFWorkflow from "../people/PAFWorkflow.jsx";
import DepartmentInsights from "../analytics/DepartmentInsights.jsx";
import StudentWorkerAnalytics from "../analytics/StudentWorkerAnalytics.jsx";
import { CoursesHub } from "../courses";
import ImportWizard from "../administration/ImportWizard";
import AppSettings from "../administration/AppSettings";
import DataCleanupRepairsPage from "../administration/data-cleanup/DataCleanupRepairsPage";
import BaylorSystems from "../resources/BaylorSystems";
import BaylorAcronyms from "../administration/BaylorAcronyms";
import CRNQualityTools from "../administration/CRNQualityTools";
import RecentChangesPage from "../administration/RecentChangesPage";
import AdminDataExportsPage from "../administration/AdminDataExportsPage.jsx";
import LiveView from "../LiveView";
import FacilitiesHub from "../facilities/FacilitiesHub";
import OutlookRoomExport from "../tools/OutlookRoomExport.jsx";
import RoomGridGenerator from "../administration/RoomGridGenerator.jsx";
import AccessControl from "../administration/AccessControl.jsx";
import { TutorialPage } from "../help";

const PageRouter = ({ currentPage, loading }) => {
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
      return (
        <ProtectedContent pageId="dashboard">
          <Dashboard />
        </ProtectedContent>
      );
    case "live-view":
      return (
        <ProtectedContent pageId="live-view">
          <LiveView />
        </ProtectedContent>
      );
    case "scheduling/faculty":
      return (
        <ProtectedContent pageId="scheduling/faculty">
          <FacultyHub />
        </ProtectedContent>
      );
    case "scheduling/rooms":
      return (
        <ProtectedContent pageId="scheduling/rooms">
          <RoomsHub />
        </ProtectedContent>
      );
    case "tools/outlook-export":
      return (
        <ProtectedContent pageId="tools/outlook-export">
          <OutlookRoomExport />
        </ProtectedContent>
      );
    case "tools/room-grid-generator":
      return (
        <ProtectedContent pageId="tools/room-grid-generator">
          <RoomGridGenerator />
        </ProtectedContent>
      );
    case "scheduling/student-workers":
      return (
        <ProtectedContent pageId="scheduling/student-workers">
          <StudentWorkersHub />
        </ProtectedContent>
      );
    case "people/directory":
    case "people/email-lists":
    case "people/offices":
    case "people/programs":
    case "people/baylor-ids":
      return (
        <ProtectedContent pageId={currentPage}>
          <PeopleHub />
        </ProtectedContent>
      );
    case "workflows/paf":
      return (
        <ProtectedContent pageId="people/directory">
          <PAFWorkflow />
        </ProtectedContent>
      );
    case "courses/browse":
    case "courses/manage":
      return (
        <ProtectedContent pageId={currentPage}>
          <CoursesHub />
        </ProtectedContent>
      );
    case "analytics/department-insights":
      return (
        <ProtectedContent pageId="analytics/department-insights">
          <DepartmentInsights />
        </ProtectedContent>
      );
    case "analytics/student-worker-analytics":
      return (
        <ProtectedContent pageId="analytics/student-worker-analytics">
          <StudentWorkerAnalytics />
        </ProtectedContent>
      );
    case "admin-tools/import-wizard":
      return (
        <ProtectedContent pageId="admin-tools/import-wizard">
          <ImportWizard />
        </ProtectedContent>
      );
    case "admin-tools/crn-tools":
      return (
        <ProtectedContent pageId="admin-tools/crn-tools">
          <CRNQualityTools />
        </ProtectedContent>
      );
    case "help/tutorials":
      return (
        <ProtectedContent pageId="help/tutorials">
          <TutorialPage />
        </ProtectedContent>
      );
    case "help/baylor-systems":
      return (
        <ProtectedContent pageId="help/baylor-systems">
          <BaylorSystems />
        </ProtectedContent>
      );
    case "help/acronyms":
      return (
        <ProtectedContent pageId="help/acronyms">
          <BaylorAcronyms />
        </ProtectedContent>
      );
    case "admin/access-control":
      return (
        <ProtectedContent pageId="admin/access-control">
          <AccessControl />
        </ProtectedContent>
      );
    case "admin/settings":
      return (
        <ProtectedContent pageId="admin/settings">
          <AppSettings />
        </ProtectedContent>
      );
    case "admin/recent-changes":
      return (
        <ProtectedContent pageId="admin/recent-changes">
          <RecentChangesPage />
        </ProtectedContent>
      );
    case "admin/data-hygiene":
      return (
        <ProtectedContent pageId="admin/data-hygiene">
          <DataCleanupRepairsPage />
        </ProtectedContent>
      );
    case "admin/data-exports":
      return (
        <ProtectedContent pageId="admin/data-exports">
          <AdminDataExportsPage />
        </ProtectedContent>
      );
    case "facilities/spaces":
      return (
        <ProtectedContent pageId="facilities/spaces">
          <FacilitiesHub initialTab="spaces" />
        </ProtectedContent>
      );
    case "facilities/buildings":
      return (
        <ProtectedContent pageId="facilities/buildings">
          <FacilitiesHub initialTab="buildings" />
        </ProtectedContent>
      );
    case "facilities/temperature":
      return (
        <ProtectedContent pageId="facilities/temperature">
          <FacilitiesHub initialTab="temperature" />
        </ProtectedContent>
      );
    default:
      return (
        <ProtectedContent pageId="dashboard">
          <Dashboard />
        </ProtectedContent>
      );
  }
};

export default PageRouter;
