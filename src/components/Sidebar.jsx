import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  User,
  Star,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";

const normalizeNavigationPath = (path = "") =>
  String(path || "").replace(/^\//, "");

const getPathnamePart = (path = "") =>
  normalizeNavigationPath(path).split("?")[0];

const getSidebarChildren = (item) =>
  Array.isArray(item?.sidebarChildren) ? item.sidebarChildren : [];

const pathMatchesCurrent = (path, currentPage, currentTarget) => {
  const normalized = normalizeNavigationPath(path);
  if (!normalized) return false;
  if (normalized.includes("?")) {
    return normalized === currentTarget;
  }
  return getPathnamePart(normalized) === currentPage;
};

const NAV_ITEM_CLASS = {
  active: "nav-item-active",
  current: "nav-item-current",
  inactive: "nav-item-inactive",
};

const pathIsActive = (path, currentPage) => {
  const basePath = getPathnamePart(path);
  if (!basePath) return false;
  if (basePath === "dashboard") {
    return currentPage === "dashboard";
  }
  return currentPage === basePath || currentPage.startsWith(basePath);
};

const Sidebar = ({
  navigationItems,
  currentPage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  onClose,
  selectedSemester,
  pinnedPages,
  togglePinPage,
}) => {
  const [expandedSections, setExpandedSections] = useState([]); // Default expanded sections
  const [collapsedTip, setCollapsedTip] = useState(null);
  const { isOwner } = useAuth();
  const location = useLocation();
  const currentTarget = `${currentPage}${location.search || ""}`;

  const toggleSection = (sectionId) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId],
    );
  };

  useEffect(() => {
    if (!collapsed) setCollapsedTip(null);
  }, [collapsed]);

  useEffect(() => {
    if (!currentPage || collapsed) return;
    const activeSection = navigationItems.find((item) => {
      if (item.path && pathIsActive(item.path, currentPage)) return true;
      if (item.children) {
        return item.children.some(
          (child) =>
            (child.path && pathIsActive(child.path, currentPage)) ||
            getSidebarChildren(child).some((sidebarChild) =>
              pathMatchesCurrent(
                sidebarChild.path,
                currentPage,
                currentTarget,
              ),
            ),
        );
      }
      return false;
    });
    if (!activeSection) return;
    const activeChildIds = (activeSection.children || [])
      .filter(
        (child) =>
          (child.path && pathIsActive(child.path, currentPage)) ||
          getSidebarChildren(child).some((sidebarChild) =>
            pathMatchesCurrent(sidebarChild.path, currentPage, currentTarget),
          ),
      )
      .map((child) => child.id);
    setExpandedSections((prev) =>
      Array.from(new Set([...prev, activeSection.id, ...activeChildIds])),
    );
  }, [collapsed, currentPage, currentTarget, navigationItems]);

  const findNavItem = (id) => {
    for (const section of navigationItems) {
      if (section.id === id) return section;
      if (section.children) {
        const child = section.children.find((c) => c.id === id);
        if (child) return child;
      }
    }
    return null;
  };

  const isHidden = (item) => item?.hidden || (item?.ownerOnly && !isOwner);

  const isActive = (path) => pathIsActive(path, currentPage);

  const isCurrentPage = (path) =>
    pathMatchesCurrent(path, currentPage, currentTarget);

  const isDefaultCurrentPage = (path) =>
    getPathnamePart(path) === currentPage && !location.search;

  const isSidebarChildCurrent = (child, parentPath) =>
    isCurrentPage(child.path) ||
    (child.defaultForParent && isDefaultCurrentPage(parentPath));

  // Collapsed icons get a label beside them; fixed positioning keeps it clear of
  // the scrolling nav, which would otherwise clip it.
  const showCollapsedTip = (event, label) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setCollapsedTip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const hideCollapsedTip = () => setCollapsedTip(null);

  const toggleLabel = onClose
    ? "Close menu"
    : collapsed
      ? "Expand sidebar"
      : "Collapse sidebar";
  const ToggleIcon = onClose ? X : collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div
      className={`sidebar transition-all duration-300 ${collapsed ? "w-16" : "w-72"} flex flex-col min-h-screen h-screen sticky top-0`}
    >
      {/* Professional University Header */}
      <div className={`sidebar-header ${collapsed ? "px-3 py-4" : "p-6"}`}>
        <div
          className={`flex items-center ${collapsed ? "justify-center" : "justify-between"}`}
        >
          {!collapsed && (
            <div className="sidebar-brand">
              <div className="sidebar-logo">
                <span className="text-white font-bold text-sm">
                  HSD
                </span>
              </div>
              <div>
                <div className="sidebar-title text-lg font-bold text-white">
                  HSD Dashboard
                </div>
                <div className="sidebar-subtitle text-sm text-baylor-gold/80 mt-1">
                  {selectedSemester || "Select Semester"}
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onClose || onToggleCollapse}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white"
            title={toggleLabel}
            aria-label={toggleLabel}
          >
            <ToggleIcon size={20} />
          </button>
        </div>
      </div>

      {/* Professional Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 baylor-scrollbar">
        <div className="space-y-1 px-4">
          {/* Pinned Items */}
          {!collapsed && pinnedPages.length > 0 && (
            <div className="space-y-1 mb-4">
              <div className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Pinned
              </div>
              {pinnedPages.map((pageId) => {
                const item = findNavItem(pageId);
                if (!item) return null;
                if (isHidden(item)) return null;
                const Icon = item.icon || User;
                return (
                  <button
                    key={`pinned-${item.id}`}
                    onClick={() => {
                      onNavigate(item.path);
                    }}
                    className={`nav-sub-item w-full ${isCurrentPage(item.path) ? "nav-sub-item-active" : "nav-sub-item-inactive"}`}
                  >
                    <Icon size={16} className="mr-2" />
                    <span className="text-sm">
                      {item.label}
                    </span>
                  </button>
                );
              })}
              <div className="pt-2 border-b border-gray-200 mx-2"></div>
            </div>
          )}

          {navigationItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedSections.includes(item.id);
            const visibleChildren = hasChildren
              ? item.children.filter((child) => !isHidden(child))
              : [];
            const sectionAllowed = hasChildren
              ? visibleChildren.length > 0
              : !isHidden(item);

            if (!sectionAllowed) {
              return null;
            }

            const sectionIsCurrent = hasChildren
              ? visibleChildren.some((child) => isActive(child.path))
              : isActive(item.path || item.id);
            // An open section only tints itself; its current page carries the
            // strong highlight. Collapsed, the section icon is all that shows.
            const navItemState = !sectionIsCurrent
              ? "inactive"
              : hasChildren && !collapsed
                ? "current"
                : "active";

            return (
              <div key={item.id} className="space-y-1">
                {/* Main Navigation Item */}
                <button
                  onClick={() => {
                    if (!hasChildren) {
                      onNavigate(item.path || item.id);
                    } else if (collapsed) {
                      setExpandedSections((prev) =>
                        prev.includes(item.id) ? prev : [...prev, item.id],
                      );
                      onToggleCollapse();
                    } else {
                      toggleSection(item.id);
                    }
                  }}
                  className={`nav-item group w-full ${NAV_ITEM_CLASS[navItemState]}`}
                  aria-label={collapsed ? item.label : undefined}
                  aria-expanded={hasChildren && !collapsed ? isExpanded : undefined}
                  aria-current={!hasChildren && sectionIsCurrent ? "page" : undefined}
                  onMouseEnter={collapsed ? (event) => showCollapsedTip(event, item.label) : undefined}
                  onMouseLeave={collapsed ? hideCollapsedTip : undefined}
                  onFocus={collapsed ? (event) => showCollapsedTip(event, item.label) : undefined}
                  onBlur={collapsed ? hideCollapsedTip : undefined}
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <Icon
                      size={20}
                      className={`flex-shrink-0 ${navItemState === "active"
                        ? "text-white"
                        : navItemState === "current"
                          ? "text-baylor-green"
                          : "text-gray-500 group-hover:text-baylor-green"
                        }`}
                    />
                    {!collapsed && (
                      <span className="font-medium text-sm">
                        {item.label}
                      </span>
                    )}
                  </div>
                  {!collapsed && hasChildren && (
                    <div
                      className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <ChevronRight
                        size={16}
                        className={
                          navItemState === "current"
                            ? "text-baylor-green/60"
                            : "text-gray-400"
                        }
                      />
                    </div>
                  )}
                </button>

                {/* Sub-navigation Items */}
                {!collapsed && hasChildren && isExpanded && (
                  <div className="space-y-1 pl-2">
                    {visibleChildren.map((child) => {
                      const isPinned = pinnedPages.includes(child.id);
                      const visibleSidebarChildren = getSidebarChildren(
                        child,
                      ).filter((sidebarChild) => !isHidden(sidebarChild));
                      const hasSidebarChildren =
                        visibleSidebarChildren.length > 0;
                      const sidebarChildExpanded = expandedSections.includes(
                        child.id,
                      );
                      const childIsActive =
                        isCurrentPage(child.path) ||
                        visibleSidebarChildren.some((sidebarChild) =>
                          isSidebarChildCurrent(sidebarChild, child.path),
                        );
                      const childClassName =
                        hasSidebarChildren && childIsActive
                          ? "bg-baylor-green/5 text-baylor-green font-medium"
                          : isCurrentPage(child.path)
                            ? "nav-sub-item-active"
                            : "nav-sub-item-inactive";

                      return (
                        <div key={child.id} className="space-y-1">
                          <div className="group flex items-center">
                            <button
                              onClick={() => {
                                onNavigate(child.path);
                              }}
                              className={`nav-sub-item flex-1 min-w-0 text-left ${childClassName}`}
                              aria-current={
                                !hasSidebarChildren && isCurrentPage(child.path)
                                  ? "page"
                                  : undefined
                              }
                            >
                              <span className="text-sm truncate">
                                {child.label}
                              </span>
                            </button>
                            {hasSidebarChildren && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSection(child.id);
                                }}
                                className="p-1 rounded-md text-gray-400 hover:bg-baylor-green/10 hover:text-baylor-green"
                                title={
                                  sidebarChildExpanded
                                    ? `Collapse ${child.label}`
                                    : `Expand ${child.label}`
                                }
                                aria-label={
                                  sidebarChildExpanded
                                    ? `Collapse ${child.label}`
                                    : `Expand ${child.label}`
                                }
                                aria-expanded={sidebarChildExpanded}
                              >
                                <ChevronRight
                                  size={14}
                                  className={`transition-transform duration-200 ${sidebarChildExpanded ? "rotate-90" : ""}`}
                                />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePinPage(child.id);
                              }}
                              className={`p-1 rounded-md transition-opacity hover:bg-baylor-green/20 focus-visible:opacity-100 ${isPinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                              title={isPinned ? "Unpin page" : "Pin page"}
                              aria-label={
                                isPinned
                                  ? `Unpin ${child.label}`
                                  : `Pin ${child.label}`
                              }
                              aria-pressed={isPinned}
                            >
                              <Star
                                size={14}
                                className={`${isPinned ? "text-baylor-gold fill-current" : "text-gray-400"}`}
                              />
                            </button>
                          </div>
                          {hasSidebarChildren && sidebarChildExpanded && (
                            <div className="space-y-1 pl-4">
                              {visibleSidebarChildren.map((sidebarChild) => {
                                const sidebarChildIsCurrent =
                                  isSidebarChildCurrent(
                                    sidebarChild,
                                    child.path,
                                  );

                                return (
                                  <button
                                    key={sidebarChild.id}
                                    onClick={() => {
                                      onNavigate(sidebarChild.path);
                                    }}
                                    className={`nav-sub-item w-full text-left ${sidebarChildIsCurrent ? "nav-sub-item-active" : "nav-sub-item-inactive"}`}
                                    aria-current={
                                      sidebarChildIsCurrent ? "page" : undefined
                                    }
                                  >
                                    <span className="text-sm">
                                      {sidebarChild.label}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Professional Footer */}
      <div className="border-t border-gray-200 p-4 mt-auto">
        {!collapsed ? (
          <div className="text-center space-y-1">
            <div className="text-xs font-medium text-baylor-green">
              Baylor University
            </div>
            <div className="text-xs text-gray-500">
              Human Sciences & Design
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Davis&apos;s Big Beautiful Dashboard
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-8 h-8 bg-baylor-green/10 rounded-lg flex items-center justify-center">
              <span className="text-xs font-bold text-baylor-green">
                BU
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Portaled: the sticky sidebar is its own stacking context, so the
          label would otherwise sit under the page content. */}
      {collapsed &&
        collapsedTip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[1000] -translate-y-1/2 whitespace-nowrap rounded-lg bg-baylor-green px-3 py-2 text-xs font-medium text-white shadow-lg"
            style={{ top: collapsedTip.top, left: collapsedTip.left }}
          >
            <span
              aria-hidden="true"
              className="absolute -left-1.5 top-1/2 -translate-y-1/2 border-y-[6px] border-r-[6px] border-y-transparent border-r-baylor-green"
            />
            {collapsedTip.label}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default Sidebar;
