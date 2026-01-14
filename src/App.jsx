/**
 * App.jsx - Main Application Layout Component
 *
 * REFACTORED: This component now focuses solely on layout and routing.
 * All data management is handled by DataContext and UIContext.
 * All CRUD operations are handled by custom hooks.
 *
 * Previous size: ~2200 lines
 * Current size: ~600 lines (focused on layout, routing, and navigation)
 */

import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import GroupMeetings from "./components/scheduling/GroupMeetings.jsx";
import IndividualAvailability from "./components/scheduling/IndividualAvailability";
import RoomSchedules from "./components/scheduling/RoomSchedules";
import StudentSchedules from "./components/scheduling/StudentSchedules.jsx";
import FacultySchedules from "./components/scheduling/FacultySchedules";
import PeopleDirectory from "./components/people/PeopleDirectory";
import ProgramManagement from "./components/analytics/ProgramManagement";
import DepartmentInsights from "./components/analytics/DepartmentInsights.jsx";
import StudentWorkerAnalytics from "./components/analytics/StudentWorkerAnalytics.jsx";
import CourseManagement from "./components/analytics/CourseManagement";
import ImportWizard from "./components/administration/ImportWizard";
import AppSettings from "./components/administration/AppSettings";
import DataHygieneManager from "./components/administration/DataHygieneManager";
import BaylorSystems from "./components/resources/BaylorSystems";
import BaylorAcronyms from "./components/administration/BaylorAcronyms";
import CRNQualityTools from "./components/administration/CRNQualityTools";
import OutlookRoomExport from "./components/tools/OutlookRoomExport.jsx";
import RecentChangesPage from "./components/administration/RecentChangesPage";
import RoomGridGenerator from "./components/administration/RoomGridGenerator";
import UserActivityDashboard from "./components/administration/UserActivityDashboard";
import BaylorIDManager from "./components/people/BaylorIDManager";
import LiveView from "./components/LiveView";
import EmailLists from "./components/people/EmailLists";
import BuildingDirectory from "./components/resources/BuildingDirectory";
import TemperatureMonitoring from "./components/temperature/TemperatureMonitoring";
import Login from "./components/Login";
import ProtectedContent from "./components/ProtectedContent.jsx";
import AccessControl from "./components/administration/AccessControl.jsx";
import MaintenancePage from "./components/MaintenancePage";
import Notification from "./components/Notification";
import { TutorialPage, TutorialOverlay } from "./components/help";

import { useAuth } from "./contexts/AuthContext.jsx";
import { useUI } from "./contexts/UIContext.jsx";
import { useSchedules } from "./contexts/ScheduleContext.jsx";
import { registerNavigationPages } from "./utils/pageRegistry";

import {
  Home,
  Calendar,
  Users,
  BarChart3,
  Settings,
  GraduationCap,
  Menu,
  LogOut,
  ChevronDown,
  X,
  Database,
  Radio,
  BookOpen,
} from "lucide-react";

// ==================== NAVIGATION CONFIGURATION ====================

const navigationItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: Home,
    path: "dashboard",
  },
  {
    id: "live-view",
    label: "Live View",
    icon: Radio,
    path: "live-view",
  },
  {
    id: "scheduling",
    label: "Scheduling",
    icon: Calendar,
    children: [
      {
        id: "faculty-schedules",
        label: "Faculty Schedules",
        path: "scheduling/faculty-schedules",
      },
      {
        id: "individual-availability",
        label: "Individual Availability",
        path: "scheduling/individual-availability",
      },
      {
        id: "room-schedules",
        label: "Room Schedules",
        path: "scheduling/room-schedules",
      },
      {
        id: "student-schedules",
        label: "Student Worker Schedules",
        path: "scheduling/student-schedules",
      },
      {
        id: "group-meeting-scheduler",
        label: "Group Meetings",
        path: "scheduling/group-meeting-scheduler",
      },
    ],
  },
  {
    id: "directory",
    label: "Directory",
    icon: Users,
    children: [
      {
        id: "people-directory",
        label: "People Directory",
        path: "people/people-directory",
      },
      {
        id: "email-lists",
        label: "Email Lists",
        path: "people/email-lists",
      },
      {
        id: "baylor-id-manager",
        label: "Baylor ID Manager",
        path: "people/baylor-id-manager",
      },
      {
        id: "building-directory",
        label: "Building Directory",
        path: "resources/building-directory",
      },
      {
        id: "baylor-acronyms",
        label: "Baylor Acronyms",
        path: "resources/baylor-acronyms",
      },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    children: [
      {
        id: "department-insights",
        label: "Department Insights",
        path: "analytics/department-insights",
      },
      {
        id: "student-worker-analytics",
        label: "Student Worker Analytics",
        path: "analytics/student-worker-analytics",
      },
      {
        id: "course-management",
        label: "Course Management",
        path: "analytics/course-management",
      },
      {
        id: "program-management",
        label: "Program Management",
        path: "analytics/program-management",
      },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    icon: Database,
    children: [
      {
        id: "smart-import",
        label: "Import Wizard",
        path: "tools/import-wizard",
      },
      {
        id: "data-hygiene",
        label: "Data Hygiene",
        path: "tools/data-hygiene",
      },
      {
        id: "crn-tools",
        label: "CRN Quality Tools",
        path: "tools/crn-tools",
      },
      {
        id: "outlook-export",
        label: "Outlook Room Export",
        path: "tools/outlook-export",
      },
      {
        id: "room-grid-generator",
        label: "Room Grid Generator",
        path: "tools/room-grid-generator",
      },
      {
        id: "temperature-monitoring",
        label: "Temperature Monitoring",
        path: "tools/temperature-monitoring",
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: Settings,
    children: [
      {
        id: "app-settings",
        label: "App Settings",
        path: "administration/app-settings",
      },
      {
        id: "access-control",
        label: "Access Control",
        path: "administration/access-control",
      },
      {
        id: "user-activity",
        label: "User Activity",
        path: "administration/user-activity",
      },
      {
        id: "recent-changes",
        label: "Recent Changes",
        path: "administration/recent-changes",
      },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    icon: BookOpen,
    children: [
      {
        id: "baylor-systems",
        label: "Baylor Systems",
        path: "resources/baylor-systems",
      },
      {
        id: "help",
        label: "Help & Tutorials",
        path: "help/tutorials",
      },
    ],
  },
];

// ==================== MAINTENANCE MODE CONFIG ====================

const MAINTENANCE_MODE = false;
const MAINTENANCE_MESSAGE =
  "I accidentally broke my dashboard, but it will be fixed soon (hopefully!!)";
const MAINTENANCE_UNTIL = "2025-07-03T08:00:00";

// ==================== MAIN APP COMPONENT ====================

function App() {
  // Context hooks
  const { signOut, isAdmin } = useAuth();
  const {
    selectedSemester,
    setSelectedSemester,
    availableSemesters,
    termOptions,
    includeArchived,
    setIncludeArchived,
    selectedTermMeta,
    isSelectedTermLocked,
    loading,
  } = useSchedules();

  const {
    notification,
    hideNotification,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    pinnedPages,
    togglePinPage,
    showLogoutConfirm,
    setShowLogoutConfirm,
  } = useUI();

  // Router hooks
  const location = useLocation();
  const navigate = useNavigate();

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [showSemesterDropdown, setShowSemesterDropdown] = React.useState(false);

  // Current page from URL
  const currentPage = useMemo(() => {
    const path = (location.pathname || "/").replace(/^\//, "");
    return path === "" ? "dashboard" : path;
  }, [location.pathname]);

  const termMetaByLabel = useMemo(() => {
    const map = new Map();
    (termOptions || []).forEach((term) => {
      if (term?.term) {
        map.set(term.term, term);
      }
      if (term?.termCode) {
        map.set(term.termCode, term);
      }
    });
    return map;
  }, [termOptions]);

  // Navigation handler
  const handleNavigate = (path) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    if (normalized !== location.pathname) {
      navigate(normalized);
    }
  };

  // Register navigation pages for access control
  useEffect(() => {
    registerNavigationPages(navigationItems);
  }, []);

  // Check authentication on mount
  useEffect(() => {
    const authStatus = localStorage.getItem("isAuthenticated");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  // Click outside handler for semester dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".semester-dropdown")) {
        setShowSemesterDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Login handler
  const handleLogin = (status) => {
    setIsAuthenticated(status);
  };

  // Logout handlers
  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = async () => {
    await signOut();
    setIsAuthenticated(false);
    localStorage.removeItem("isAuthenticated");
    setShowLogoutConfirm(false);
    navigate("/dashboard");
  };

  // Breadcrumb generation
  const getCurrentBreadcrumb = () => {
    const pathParts = currentPage.split("/");
    const crumbs = [];
    const dashboardCrumb = { label: "Dashboard", path: "dashboard" };
    crumbs.push(dashboardCrumb);

    const section = navigationItems.find((item) => item.id === pathParts[0]);
    if (!section || currentPage === "dashboard") return crumbs;

    const sectionCrumb = {
      label: section.label,
      path:
        section.children && section.children.length > 0
          ? section.children[0].path
          : null,
    };
    crumbs.push(sectionCrumb);

    if (pathParts.length > 1) {
      const subsection = section.children?.find(
        (child) => child.path === currentPage,
      );
      if (subsection) crumbs.push({ label: subsection.label, path: null });
    }

    return crumbs;
  };

  // Get active section for sub-navigation
  const getActiveSection = () => {
    const pathParts = currentPage.split("/");
    return navigationItems.find((item) => item.id === pathParts[0]) || null;
  };

  // Page content renderer
  const renderPageContent = () => {
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
      case "scheduling/faculty-schedules":
        return (
          <ProtectedContent pageId="scheduling/faculty-schedules">
            <FacultySchedules />
          </ProtectedContent>
        );
      case "scheduling/group-meeting-scheduler":
        return (
          <ProtectedContent pageId="scheduling/group-meeting-scheduler">
            <GroupMeetings />
          </ProtectedContent>
        );
      case "scheduling/individual-availability":
        return (
          <ProtectedContent pageId="scheduling/individual-availability">
            <IndividualAvailability />
          </ProtectedContent>
        );
      case "scheduling/room-schedules":
        return (
          <ProtectedContent pageId="scheduling/room-schedules">
            <RoomSchedules />
          </ProtectedContent>
        );
      case "scheduling/student-schedules":
        return (
          <ProtectedContent pageId="scheduling/student-schedules">
            <StudentSchedules />
          </ProtectedContent>
        );
      case "people/people-directory":
        return (
          <ProtectedContent pageId="people/people-directory">
            <PeopleDirectory />
          </ProtectedContent>
        );
      case "people/baylor-id-manager":
        return (
          <ProtectedContent pageId="people/baylor-id-manager">
            <BaylorIDManager />
          </ProtectedContent>
        );
      case "analytics/program-management":
        return (
          <ProtectedContent pageId="analytics/program-management">
            <ProgramManagement />
          </ProtectedContent>
        );
      case "people/email-lists":
        return (
          <ProtectedContent pageId="people/email-lists">
            <EmailLists />
          </ProtectedContent>
        );
      case "resources/building-directory":
        return (
          <ProtectedContent pageId="resources/building-directory">
            <BuildingDirectory />
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
      case "analytics/course-management":
        return (
          <ProtectedContent pageId="analytics/course-management">
            <CourseManagement />
          </ProtectedContent>
        );
      case "administration/recent-changes":
        return (
          <ProtectedContent pageId="administration/recent-changes">
            <RecentChangesPage />
          </ProtectedContent>
        );
      case "tools/import-wizard":
        return (
          <ProtectedContent pageId="tools/import-wizard">
            <ImportWizard />
          </ProtectedContent>
        );
      case "tools/data-hygiene":
        return (
          <ProtectedContent pageId="tools/data-hygiene">
            <DataHygieneManager />
          </ProtectedContent>
        );
      case "tools/crn-tools":
        return (
          <ProtectedContent pageId="tools/crn-tools">
            <CRNQualityTools />
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
      case "tools/temperature-monitoring":
        return (
          <ProtectedContent pageId="tools/temperature-monitoring">
            <TemperatureMonitoring />
          </ProtectedContent>
        );
      case "resources/baylor-acronyms":
        return (
          <ProtectedContent pageId="resources/baylor-acronyms">
            <BaylorAcronyms />
          </ProtectedContent>
        );
      case "resources/baylor-systems":
        return (
          <ProtectedContent pageId="resources/baylor-systems">
            <BaylorSystems />
          </ProtectedContent>
        );
      case "administration/app-settings":
        return (
          <ProtectedContent pageId="administration/app-settings">
            <AppSettings />
          </ProtectedContent>
        );
      case "administration/access-control":
        return (
          <ProtectedContent pageId="administration/access-control">
            <AccessControl />
          </ProtectedContent>
        );
      case "administration/user-activity":
        return (
          <ProtectedContent pageId="administration/user-activity">
            <UserActivityDashboard />
          </ProtectedContent>
        );
      case "help/tutorials":
        return (
          <ProtectedContent pageId="help/tutorials">
            <TutorialPage />
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

  // ==================== RENDER ====================

  // Maintenance mode
  if (MAINTENANCE_MODE) {
    return (
      <MaintenancePage
        message={MAINTENANCE_MESSAGE}
        until={MAINTENANCE_UNTIL}
      />
    );
  }

  // Authentication check
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          navigationItems={navigationItems}
          currentPage={currentPage}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          selectedSemester={selectedSemester}
          pinnedPages={pinnedPages}
          togglePinPage={togglePinPage}
        />
      </div>

      {/* Mobile Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          ></div>
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold text-baylor-green">
                Navigation
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-2 rounded-md hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <Sidebar
              navigationItems={navigationItems}
              currentPage={currentPage}
              onNavigate={(path) => {
                setMobileSidebarOpen(false);
                handleNavigate(path);
              }}
              collapsed={false}
              onToggleCollapse={() => {}}
              selectedSemester={selectedSemester}
              pinnedPages={pinnedPages}
              togglePinPage={togglePinPage}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
            {/* Left: Mobile menu + Breadcrumb */}
            <div className="flex items-center space-x-3">
              <button
                className="md:hidden p-2 rounded-md hover:bg-gray-100"
                aria-label="Open menu"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="w-5 h-5 text-gray-700" />
              </button>
              <div className="flex items-center space-x-2">
                <GraduationCap className="w-5 h-5 text-baylor-green" />
                <nav className="flex items-center space-x-2 text-sm">
                  {getCurrentBreadcrumb().map((crumb, index, arr) => (
                    <React.Fragment key={index}>
                      {index > 0 && <span className="text-gray-400">/</span>}
                      {crumb.path ? (
                        <button
                          className="text-gray-600 hover:text-baylor-green"
                          onClick={() => handleNavigate(crumb.path)}
                        >
                          {crumb.label}
                        </button>
                      ) : (
                        <span
                          className={
                            index === arr.length - 1
                              ? "text-baylor-green font-medium"
                              : "text-gray-600"
                          }
                        >
                          {crumb.label}
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Semester Selector */}
              <div className="relative semester-dropdown">
                <button
                  onClick={() => setShowSemesterDropdown(!showSemesterDropdown)}
                  className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-gray-900">
                    {selectedSemester || "Select Semester"}
                  </span>
                  {selectedTermMeta && isSelectedTermLocked && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">
                      {selectedTermMeta.status === "archived"
                        ? "Archived"
                        : "Locked"}
                    </span>
                  )}
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                {showSemesterDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    {isAdmin &&
                      termOptions?.some(
                        (term) => term.status === "archived",
                      ) && (
                        <div className="px-4 py-2 border-b border-gray-100">
                          <label className="flex items-center text-xs text-gray-600 space-x-2">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              checked={includeArchived}
                              onChange={(e) =>
                                setIncludeArchived(e.target.checked)
                              }
                            />
                            <span>Show archived semesters</span>
                          </label>
                        </div>
                      )}
                    <div className="py-2">
                      {availableSemesters.length === 0 && (
                        <div className="px-4 py-2 text-sm text-gray-500">
                          No semesters available
                        </div>
                      )}
                      {availableSemesters.map((semester) => {
                        const termMeta = termMetaByLabel.get(semester);
                        const isArchived = termMeta?.status === "archived";
                        const isLocked =
                          termMeta?.locked === true || isArchived;
                        return (
                          <button
                            key={semester}
                            onClick={() => {
                              setSelectedSemester(semester);
                              setShowSemesterDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                              semester === selectedSemester
                                ? "bg-baylor-green/5 text-baylor-green font-medium"
                                : "text-gray-900"
                            }`}
                          >
                            <span className="flex items-center justify-between">
                              <span>{semester}</span>
                              {(isArchived || isLocked) && (
                                <span className="ml-2 text-xs text-amber-700">
                                  {isArchived ? "Archived" : "Locked"}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="btn-ghost"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="ml-2 hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>

          {/* Section Sub-navigation */}
          {getActiveSection()?.children &&
            getActiveSection().children.length > 0 && (
              <div className="px-4 md:px-6 pb-2">
                <div className="flex flex-wrap gap-2">
                  {getActiveSection().children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => handleNavigate(child.path)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        currentPage === child.path
                          ? "bg-baylor-green/10 text-baylor-green border-baylor-green/30"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
        </header>

        {selectedTermMeta && isSelectedTermLocked && (
          <div className="px-4 md:px-6 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
            <span className="font-medium">{selectedTermMeta.term}</span>{" "}
            {selectedTermMeta.status === "archived"
              ? "is archived and read-only. Schedule edits and imports are disabled."
              : "is locked and read-only. Schedule edits and imports are disabled."}
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
            {renderPageContent()}
          </div>
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="modal-title">Confirm Logout</h3>
            </div>
            <div className="modal-body">
              <p className="text-gray-600">
                Are you sure you want to logout? Any unsaved changes will be
                lost.
              </p>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button onClick={confirmLogout} className="btn-danger">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      <Notification
        show={notification.show}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={hideNotification}
      />

      {/* Tutorial Overlay - renders on top of everything when a tutorial is active */}
      <TutorialOverlay />
    </div>
  );
}

export default App;
