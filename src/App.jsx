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
import FacultyHub from "./components/scheduling/FacultyHub.jsx";
import RoomsHub from "./components/scheduling/RoomsHub.jsx";
import StudentWorkersHub from "./components/scheduling/StudentWorkersHub.jsx";
import PeopleHub from "./components/people/PeopleHub.jsx";
import DepartmentInsights from "./components/analytics/DepartmentInsights.jsx";
import StudentWorkerAnalytics from "./components/analytics/StudentWorkerAnalytics.jsx";
import CourseManagement from "./components/analytics/CourseManagement";
import ImportWizard from "./components/administration/ImportWizard";
import AppSettings from "./components/administration/AppSettings";
import DataHygieneManager from "./components/administration/DataHygieneManager";
import BaylorSystems from "./components/resources/BaylorSystems";
import BaylorAcronyms from "./components/administration/BaylorAcronyms";
import CRNQualityTools from "./components/administration/CRNQualityTools";
import RecentChangesPage from "./components/administration/RecentChangesPage";
import LiveView from "./components/LiveView";
import TemperatureMonitoring from "./components/temperature/TemperatureMonitoring";
import FacilitiesHub from "./components/facilities/FacilitiesHub";
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
  GraduationCap,
  Menu,
  LogOut,
  ChevronDown,
  X,
  Database,
  Radio,
  BookOpen,
  Shield,
  BarChart3,
  Building,
} from "lucide-react";

// ==================== NAVIGATION CONFIGURATION ====================

const navigationItems = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    children: [
      {
        id: "dashboard",
        label: "Dashboard",
        path: "dashboard",
        canonicalId: "dashboard",
      },
      {
        id: "live-view",
        label: "Today",
        path: "live-view",
        canonicalId: "live-view",
      },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: Users,
    children: [
      {
        id: "people-directory",
        label: "Directory",
        path: "people/directory",
        canonicalId: "people/directory",
      },
      {
        id: "email-lists",
        label: "Email Lists",
        path: "people/email-lists",
        canonicalId: "people/email-lists",
      },
      {
        id: "office-directory",
        label: "Offices",
        path: "people/offices",
        canonicalId: "people/offices",
      },
      {
        id: "programs",
        label: "Programs",
        path: "people/programs",
        canonicalId: "people/programs",
      },
      {
        id: "baylor-ids",
        label: "Baylor IDs",
        path: "people/baylor-ids",
        canonicalId: "people/baylor-ids",
        permissions: {
          // Inherit from parent or specify if needed. 
          // BaylorIDManager checks permissions internally ("people/baylor-id-manager")
        },
      },
    ],
  },
  {
    id: "scheduling",
    label: "Scheduling",
    icon: Calendar,
    children: [
      {
        id: "faculty-schedules",
        label: "Faculty",
        path: "scheduling/faculty",
        canonicalId: "scheduling/faculty",
      },
      {
        id: "room-schedules",
        label: "Rooms",
        path: "scheduling/rooms",
        canonicalId: "scheduling/rooms",
      },
      {
        id: "student-schedules",
        label: "Student Workers",
        path: "scheduling/student-workers",
        canonicalId: "scheduling/student-workers",
        permissions: {
          hideFromRoles: ["faculty"],
        },
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
        canonicalId: "analytics/department-insights",
        permissions: {
          hideFromRoles: ["faculty"],
        },
      },
      {
        id: "student-worker-analytics",
        label: "Student Worker Analytics",
        path: "analytics/student-worker-analytics",
        canonicalId: "analytics/student-worker-analytics",
        permissions: {
          hideFromRoles: ["faculty"],
        },
      },
    ],
  },
  {
    id: "data-tools",
    label: "Data Tools",
    icon: Database,
    children: [
      {
        id: "smart-import",
        label: "Import Wizard",
        path: "data/import-wizard",
        canonicalId: "data/import-wizard",
        permissions: {
          hideFromRoles: ["faculty"],
        },
      },
      {
        id: "course-management",
        label: "Schedule Data",
        path: "data/schedule-data",
        canonicalId: "data/schedule-data",
        permissions: {
          hideFromRoles: ["faculty"],
        },
      },
      {
        id: "crn-tools",
        label: "CRN Quality Tools",
        path: "data/crn-tools",
        canonicalId: "data/crn-tools",
        permissions: {
          hideFromRoles: ["faculty"],
        },
      },
    ],
  },
  {
    id: "help",
    label: "Help & Resources",
    icon: BookOpen,
    children: [
      {
        id: "help",
        label: "Tutorials",
        path: "help/tutorials",
        canonicalId: "help/tutorials",
      },
      {
        id: "baylor-systems",
        label: "Baylor Systems",
        path: "help/baylor-systems",
        canonicalId: "help/baylor-systems",
      },
      {
        id: "baylor-acronyms",
        label: "Acronyms",
        path: "help/acronyms",
        canonicalId: "help/acronyms",
      },
    ],
  },
  {
    id: "facilities",
    label: "Facilities",
    icon: Building,
    children: [
      {
        id: "space-management",
        label: "Spaces",
        path: "facilities/spaces",
        canonicalId: "facilities/spaces",
      },
      {
        id: "building-management",
        label: "Buildings",
        path: "facilities/buildings",
        canonicalId: "facilities/buildings",
      },
      {
        id: "temperature-monitoring",
        label: "Temperature",
        path: "facilities/temperature",
        canonicalId: "facilities/temperature",
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: Shield,
    adminOnly: true,
    children: [
      {
        id: "access-control",
        label: "Access Control",
        path: "admin/access-control",
        canonicalId: "admin/access-control",
      },
      {
        id: "app-settings",
        label: "App Settings",
        path: "admin/settings",
        canonicalId: "admin/settings",
      },
      {
        id: "recent-changes",
        label: "Recent Changes",
        path: "admin/recent-changes",
        canonicalId: "admin/recent-changes",
      },
      {
        id: "data-hygiene",
        label: "Data Hygiene",
        path: "admin/data-hygiene",
        canonicalId: "admin/data-hygiene",
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

  useEffect(() => {
    const canonicalId = getCanonicalPageId();
    if (canonicalId) {
      try {
        window?.posthog?.register({ canonical_page: canonicalId });
      } catch (error) {
        // Ignore analytics failures
      }
    }
  }, [currentPage]);

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
    const crumbs = [];
    const homeCrumb = { label: "Home", path: "dashboard" };
    crumbs.push(homeCrumb);

    const section = getActiveSection();
    if (!section || currentPage === "dashboard") return crumbs;

    const sectionCrumb = {
      label: section.label,
      path:
        section.children && section.children.length > 0
          ? section.children[0].path
          : section.path || null,
    };
    crumbs.push(sectionCrumb);

    const subsection = section.children?.find(
      (child) => child.path === currentPage,
    );
    if (subsection && subsection.label !== section.label) {
      crumbs.push({ label: subsection.label, path: null });
    }

    return crumbs;
  };

  // Get active section for sub-navigation
  const getActiveSection = () => {
    if (!currentPage) return null;
    return (
      navigationItems.find((item) => {
        if (item.path && item.path === currentPage) return true;
        if (item.children) {
          return item.children.some((child) => child.path === currentPage);
        }
        return false;
      }) || null
    );
  };

  const getCanonicalPageId = () => {
    if (!currentPage) return currentPage;
    for (const item of navigationItems) {
      if (item.path && item.path === currentPage) {
        return item.canonicalId || item.path;
      }
      if (item.children) {
        const child = item.children.find((c) => c.path === currentPage);
        if (child) return child.canonicalId || child.path;
      }
    }
    return currentPage;
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
      // Scheduling Hubs
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
      case "scheduling/student-workers":
        return (
          <ProtectedContent pageId="scheduling/student-workers">
            <StudentWorkersHub />
          </ProtectedContent>
        );
      // People Hub
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
      // Analytics
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
      // Data Tools
      case "data/schedule-data":
        return (
          <ProtectedContent pageId="data/schedule-data">
            <CourseManagement />
          </ProtectedContent>
        );
      case "data/import-wizard":
        return (
          <ProtectedContent pageId="data/import-wizard">
            <ImportWizard />
          </ProtectedContent>
        );
      case "data/crn-tools":
        return (
          <ProtectedContent pageId="data/crn-tools">
            <CRNQualityTools />
          </ProtectedContent>
        );
      // Help & Resources
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
      // Administration
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
            <DataHygieneManager />
          </ProtectedContent>
        );
      // Facilities Hub
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
            <Sidebar
              navigationItems={navigationItems}
              currentPage={currentPage}
              onNavigate={(path) => {
                setMobileSidebarOpen(false);
                handleNavigate(path);
              }}
              collapsed={false}
              onToggleCollapse={() => { }}
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
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${semester === selectedSemester
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
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${currentPage === child.path
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
