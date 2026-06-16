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

import React, { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import PageRouter from "./components/app/PageRouter.jsx";
import Login from "./components/Login";
import MaintenancePage from "./components/MaintenancePage";
import Notification from "./components/Notification";
import SelectDropdown from "./components/SelectDropdown";
import TutorialOverlay from "./components/help/TutorialOverlay";

import { useAuth } from "./contexts/AuthContext.jsx";
import { useUI } from "./contexts/UIContext.jsx";
import { useSchedules } from "./contexts/ScheduleContext.jsx";
import useUserActivityTracker from "./hooks/useUserActivityTracker";
import { registerNavigationPages } from "./utils/pageRegistry";
import { navigationItems } from "./utils/navigationConfig";
import { normalizeRoleList } from "./utils/authz";

import { Calendar, GraduationCap, Menu, LogOut } from "lucide-react";

// ==================== MAINTENANCE MODE CONFIG ====================

const MAINTENANCE_MODE = false;
const MAINTENANCE_MESSAGE =
  "I accidentally broke my dashboard, but it will be fixed soon (hopefully!!)";
const MAINTENANCE_UNTIL = "2025-07-03T08:00:00";

// ==================== MAIN APP COMPONENT ====================

function App() {
  // Context hooks
  const {
    user,
    signOut,
    isAdmin,
    canAccess,
    isActivityOwner,
    userProfile,
    loading: authLoading,
  } = useAuth();
  const {
    selectedSemester,
    setSelectedSemester,
    availableSemesters,
    termOptions,
    includeArchived,
    setIncludeArchived,
    selectedTermMeta,
    isSelectedTermLocked,
    loading: scheduleLoading,
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

  // Current page from URL
  const currentPage = useMemo(() => {
    const path = (location.pathname || "/").replace(/^\//, "");
    return path === "" ? "dashboard" : path;
  }, [location.pathname]);

  const userRoles = useMemo(
    () => normalizeRoleList(userProfile?.roles),
    [userProfile?.roles],
  );

  const shouldHideNavItem = useCallback(
    (item) => {
      if (!item) return true;
      if (item.adminOnly && !isAdmin) return true;
      if (item.ownerOnly && !isActivityOwner) return true;
      if (item.hidden) return true;
      const hiddenRoles = item.permissions?.hideFromRoles;
      if (!Array.isArray(hiddenRoles) || hiddenRoles.length === 0) return false;
      if (userRoles.length === 0) return false;
      return userRoles.some((role) => hiddenRoles.includes(role));
    },
    [isActivityOwner, isAdmin, userRoles],
  );

  const activeSection = useMemo(() => {
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
  }, [currentPage]);

  const visibleActiveSectionChildren = useMemo(() => {
    if (!activeSection?.children) return [];
    return activeSection.children.filter((child) => {
      if (shouldHideNavItem(child)) return false;
      const accessId = child.accessId || child.path || child.id;
      return accessId ? canAccess(accessId) : true;
    });
  }, [activeSection?.children, canAccess, shouldHideNavItem]);

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
    const currentTarget = `${location.pathname}${location.search || ""}`;
    if (normalized !== currentTarget) {
      navigate(normalized);
    }
  };

  // Register navigation pages for access control
  useEffect(() => {
    registerNavigationPages(navigationItems);
  }, []);

  useUserActivityTracker({
    currentPage,
    isAuthenticated: Boolean(user),
  });

  // Logout handlers
  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = async () => {
    await signOut();
    setShowLogoutConfirm(false);
    navigate("/dashboard");
  };

  // Breadcrumb generation
  const getCurrentBreadcrumb = () => {
    const crumbs = [];
    const homeCrumb = { label: "Home", path: "dashboard" };
    crumbs.push(homeCrumb);

    if (!activeSection || currentPage === "dashboard") return crumbs;

    const sectionCrumb = {
      label: activeSection.label,
      path:
        activeSection.children && activeSection.children.length > 0
          ? activeSection.children[0].path
          : activeSection.path || null,
    };
    crumbs.push(sectionCrumb);

    const subsection = activeSection.children?.find(
      (child) => child.path === currentPage,
    );
    if (subsection && subsection.label !== activeSection.label) {
      crumbs.push({ label: subsection.label, path: null });
    }

    return crumbs;
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-shimmer w-16 h-16 rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading account...</p>
        </div>
      </div>
    );
  }

  // Authentication check
  if (!user) {
    return <Login />;
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
              <SelectDropdown
                value={selectedSemester}
                onChange={(event) => setSelectedSemester(event.target.value)}
                placeholder="Select Semester"
                leadingIcon={<Calendar className="h-4 w-4 text-gray-500" />}
                selectedAdornment={
                  selectedTermMeta && isSelectedTermLocked ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {selectedTermMeta.status === "archived"
                        ? "Archived"
                        : "Locked"}
                    </span>
                  ) : null
                }
                beforeOptions={
                  isAdmin &&
                  termOptions?.some((term) => term.status === "archived") ? (
                    <div className="app-dropdown-section">
                      <label className="flex items-center space-x-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={includeArchived}
                          onChange={(event) =>
                            setIncludeArchived(event.target.checked)
                          }
                        />
                        <span>Show archived semesters</span>
                      </label>
                    </div>
                  ) : null
                }
                emptyMessage="No semesters available"
                menuMinWidth={192}
                renderOption={(option) => {
                  const termMeta = termMetaByLabel.get(option.value);
                  const isArchived = termMeta?.status === "archived";
                  const isLocked = termMeta?.locked === true || isArchived;

                  return (
                    <span className="flex items-center justify-between gap-3">
                      <span>{option.label}</span>
                      {(isArchived || isLocked) && (
                        <span className="text-xs text-amber-700">
                          {isArchived ? "Archived" : "Locked"}
                        </span>
                      )}
                    </span>
                  );
                }}
              >
                {availableSemesters.map((semester) => (
                  <option key={semester} value={semester}>
                    {semester}
                  </option>
                ))}
              </SelectDropdown>

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
          {visibleActiveSectionChildren.length > 0 && (
              <div className="px-4 md:px-6 pb-2">
                <div className="flex flex-wrap gap-2">
                  {visibleActiveSectionChildren.map((child) => (
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
            <PageRouter
              currentPage={currentPage}
              loading={scheduleLoading}
            />
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
