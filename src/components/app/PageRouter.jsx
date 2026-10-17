import { Component, Suspense, lazy } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { trackFailure } from "../../utils/activityTracking";

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
const EnrollmentCapacity = lazy(
  () => import("../analytics/EnrollmentCapacity.jsx"),
);
const TermComparison = lazy(() => import("../analytics/TermComparison.jsx"));
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
const AccountsPage = lazy(() => import("../administration/AccountsPage.jsx"));
const TutorialPage = lazy(() => import("../help/TutorialPage.jsx"));

const LoadingState = ({ label }) => (
  <div className="flex items-center justify-center h-64" role="status">
    <div className="flex flex-col items-center gap-3 text-gray-600">
      <Loader2
        className="h-8 w-8 animate-spin text-baylor-green"
        aria-hidden="true"
      />
      <p>{label}</p>
    </div>
  </div>
);

// A lazy page whose file no longer exists after a deploy fails to import; any
// other error is a problem inside the page itself.
const isStaleAssetError = (error) =>
  /dynamically imported module|importing a module script failed|ChunkLoadError/i.test(
    `${error?.name || ""} ${error?.message || ""}`,
  );

const RouteLoadErrorState = ({ staleAssets }) => (
  <div className="flex items-center justify-center h-64">
    <div className="max-w-md text-center">
      <h2 className="text-lg font-semibold text-gray-900">
        {staleAssets ? "Page update needed" : "Something went wrong"}
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        {staleAssets
          ? "This page could not load the latest app files. Reload to continue."
          : "This page ran into a problem. Reload to try again."}
      </p>
      <button
        type="button"
        className="btn-primary mt-4"
        onClick={() => window.location.reload()}
      >
        Reload page
      </button>
    </div>
  </div>
);

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error("Route failed to render:", error, errorInfo);
    trackFailure("page_load", error, this.props.pageId);
  }

  render() {
    if (this.state.error) {
      return (
        <RouteLoadErrorState
          staleAssets={isStaleAssetError(this.state.error)}
        />
      );
    }

    return this.props.children;
  }
}

const getRouteBoundaryKey = (pageId, componentProps) => {
  const initialTab = componentProps.initialTab
    ? `:${componentProps.initialTab}`
    : "";
  return `${pageId}${initialTab}`;
};

const renderPage = (pageId, PageComponent, componentProps = {}) => (
  <RouteErrorBoundary pageId={pageId} resetKey={getRouteBoundaryKey(pageId, componentProps)}>
    <Suspense fallback={<LoadingState label="Loading page…" />}>
      <PageComponent {...componentProps} />
    </Suspense>
  </RouteErrorBoundary>
);

const PageRouter = ({ currentPage, loading }) => {
  const { isOwner } = useAuth();

  if (loading) {
    return <LoadingState label="Loading schedules…" />;
  }

  switch (currentPage) {
    case "dashboard":
      return renderPage("dashboard", Dashboard);
    case "live-view":
      return renderPage("live-view", LiveView);
    case "scheduling/faculty":
      return renderPage("scheduling/faculty", FacultyHub);
    case "scheduling/rooms":
      return renderPage("scheduling/rooms", RoomsHub);
    case "tools/outlook-export":
      return renderPage("tools/outlook-export", OutlookRoomExport);
    case "tools/room-grid-generator":
      return renderPage(
        "tools/room-grid-generator",
        RoomGridGenerator,
      );
    case "scheduling/student-workers":
      return renderPage(
        "scheduling/student-workers",
        StudentWorkersHub,
      );
    case "people/directory":
    case "people/email-lists":
    case "people/offices":
    case "people/programs":
    case "people/baylor-ids":
      return renderPage(currentPage, PeopleHub);
    case "workflows/paf":
      return renderPage("workflows/paf", PAFWorkflow);
    case "courses/browse":
    case "courses/manage":
      return renderPage(currentPage, CoursesHub);
    case "analytics/department-insights":
      return renderPage(
        "analytics/department-insights",
        DepartmentInsights,
      );
    case "analytics/student-worker-analytics":
      return renderPage(
        "analytics/student-worker-analytics",
        StudentWorkerAnalytics,
      );
    case "analytics/enrollment-capacity":
      return renderPage(
        "analytics/enrollment-capacity",
        EnrollmentCapacity,
      );
    case "analytics/term-comparison":
      return renderPage("analytics/term-comparison", TermComparison);
    case "admin-tools/import-wizard":
      return renderPage("admin-tools/import-wizard", ImportWizard);
    case "admin-tools/crn-tools":
      return renderPage("admin-tools/crn-tools", CRNQualityTools);
    case "help/tutorials":
      return renderPage("help/tutorials", TutorialPage);
    case "help/baylor-systems":
      return renderPage("help/baylor-systems", BaylorSystems);
    case "help/acronyms":
      return renderPage("help/acronyms", BaylorAcronyms);
    case "admin/settings":
      return renderPage("admin/settings", AppSettings);
    case "admin/recent-changes":
      return renderPage("admin/recent-changes", RecentChangesPage);
    case "admin/user-activity":
      return isOwner ? (
        renderPage("admin/user-activity", UserActivityPage)
      ) : (
        <Navigate to="/dashboard" replace />
      );
    case "admin/accounts":
      return isOwner ? (
        renderPage("admin/accounts", AccountsPage)
      ) : (
        <Navigate to="/dashboard" replace />
      );
    case "admin/data-hygiene":
      return renderPage(
        "admin/data-hygiene",
        DataCleanupRepairsPage,
      );
    case "admin/data-exports":
      return renderPage("admin/data-exports", AdminDataExportsPage);
    case "facilities/spaces":
      return renderPage("facilities/spaces", FacilitiesHub, {
        initialTab: "spaces",
      });
    case "facilities/buildings":
      return renderPage("facilities/buildings", FacilitiesHub, {
        initialTab: "buildings",
      });
    case "facilities/temperature":
      return renderPage("facilities/temperature", FacilitiesHub, {
        initialTab: "temperature",
      });
    default:
      return <Navigate to="/dashboard" replace />;
  }
};

export default PageRouter;
