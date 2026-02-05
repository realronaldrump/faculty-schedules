import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Star, ChevronRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useUI } from "../contexts/UIContext";
import { navigationItems } from "../utils/navigationConfig";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, userProfile, canAccess, isAdmin } = useAuth();
  const { pinnedPages, togglePinPage, isPinned } = useUI();
  const [searchQuery, setSearchQuery] = useState("");

  const displayName =
    userProfile?.displayName ||
    user?.displayName ||
    (user?.email ? user.email.split("@")[0] : "");
  const firstName = displayName ? displayName.split(" ")[0] : "";

  const normalizeRoles = (roles) => {
    if (Array.isArray(roles)) return roles.filter(Boolean);
    if (roles && typeof roles === "object") {
      return Object.keys(roles).filter((key) => roles[key]);
    }
    if (typeof roles === "string" && roles.trim()) return [roles.trim()];
    return [];
  };

  const userRoles = useMemo(
    () => normalizeRoles(userProfile?.roles),
    [userProfile?.roles],
  );

  const shouldHideForRole = useCallback(
    (item) => {
      if (!item) return true;
      if (item?.adminOnly && !isAdmin) return true;
      if (item?.hidden) return true;
      const hiddenRoles = item?.permissions?.hideFromRoles;
      if (!hiddenRoles || hiddenRoles.length === 0) return false;
      if (userRoles.length === 0) return false;
      return userRoles.some((role) => hiddenRoles.includes(role));
    },
    [isAdmin, userRoles],
  );

  const hasAccess = useCallback(
    (pageId) => {
      if (!pageId) return true;
      if (typeof canAccess !== "function") return true;
      return canAccess(pageId);
    },
    [canAccess],
  );

  const isItemVisible = useCallback(
    (item) => {
      if (!item) return false;
      if (shouldHideForRole(item)) return false;
      const accessId = item.accessId || item.path;
      if (!accessId) return false;
      return hasAccess(accessId);
    },
    [hasAccess, shouldHideForRole],
  );

  const handleNavigate = useCallback(
    (path) => {
      if (!path) return;
      const normalized = path.startsWith("/") ? path : `/${path}`;
      navigate(normalized);
    },
    [navigate],
  );

  const navigationSections = useMemo(() => {
    return navigationItems
      .map((section) => {
        const items = (section.children || [])
          .filter((child) => isItemVisible(child))
          .map((child) => ({
            ...child,
            icon: child.icon || section.icon,
            sectionLabel: section.label,
            sectionDescription: section.description,
          }));

        return {
          ...section,
          items,
        };
      })
      .filter((section) => section.items.length > 0);
  }, [isItemVisible]);

  const navigationLookup = useMemo(() => {
    const map = new Map();
    navigationItems.forEach((section) => {
      (section.children || []).forEach((child) => {
        map.set(child.id, {
          ...child,
          icon: child.icon || section.icon,
          sectionLabel: section.label,
          sectionDescription: section.description,
        });
      });
    });
    return map;
  }, []);

  const pinnedItems = useMemo(() => {
    const items = pinnedPages
      .map((pageId) => navigationLookup.get(pageId))
      .filter(Boolean)
      .filter((item) => isItemVisible(item));

    return items.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  }, [isItemVisible, navigationLookup, pinnedPages]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const allItems = navigationSections.flatMap((section) =>
      section.items.map((item) => ({
        ...item,
        sectionLabel: section.label,
      })),
    );

    return allItems
      .filter((item) => {
        const label = item.label?.toLowerCase() || "";
        const description = item.description?.toLowerCase() || "";
        const section = item.sectionLabel?.toLowerCase() || "";
        return (
          label.includes(query) ||
          description.includes(query) ||
          section.includes(query)
        );
      })
      .slice(0, 8);
  }, [navigationSections, searchQuery]);

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        setSearchQuery("");
      }
      if (event.key === "Enter" && searchResults.length > 0) {
        handleNavigate(searchResults[0].path);
        setSearchQuery("");
      }
    },
    [handleNavigate, searchResults],
  );

  const handlePinToggle = useCallback(
    (event, pageId) => {
      event.stopPropagation();
      togglePinPage(pageId);
    },
    [togglePinPage],
  );

  const SectionCard = ({ section, defaultOpen }) => {
    const SectionIcon = section.icon;

    return (
      <details
        className="university-card group"
        open={defaultOpen}
      >
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4 p-6">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-lg bg-baylor-green/10 p-2">
                <SectionIcon className="h-5 w-5 text-baylor-green" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {section.label}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {section.description}
                </p>
              </div>
            </div>
            <ChevronRight className="mt-1 h-5 w-5 text-gray-400 transition-transform duration-200 group-open:rotate-90" />
          </div>
        </summary>
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {section.items.map((item) => {
            const ItemIcon = item.icon || section.icon;
            const pinned = isPinned(item.id);

            return (
              <div key={item.id} className="flex items-stretch">
                <button
                  onClick={() => handleNavigate(item.path)}
                  className="flex flex-1 items-start gap-3 px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="mt-0.5 rounded-lg bg-gray-50 p-2">
                    <ItemIcon className="h-4 w-4 text-baylor-green" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {item.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {item.description}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 text-gray-300" />
                </button>
                <button
                  onClick={(event) => handlePinToggle(event, item.id)}
                  className="flex items-center px-4 text-gray-400 hover:text-baylor-gold"
                  aria-pressed={pinned}
                  title={pinned ? "Unpin" : "Pin"}
                >
                  <Star
                    className={`h-4 w-4 ${pinned ? "text-baylor-gold fill-current" : "text-gray-300"}`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </details>
    );
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-baylor-green">
          Home
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">
          Find what you need{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="max-w-2xl text-sm text-gray-600">
          This is the launchpad for Baylor systems and HSD department tools.
          Search or browse by section to open the right place quickly.
        </p>
      </header>

      <section aria-label="Search" className="space-y-3">
        <div className="university-card">
          <div className="university-card-content space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                Search destinations
              </h2>
              <p className="text-xs text-gray-500">
                Filter by name, description, or section.
              </p>
            </div>
            <div className="relative">
              <label htmlFor="dashboard-search" className="sr-only">
                Search destinations
              </label>
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="dashboard-search"
                type="text"
                placeholder="Search for people, rooms, courses, or tools"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-baylor-green focus:outline-none focus:ring-2 focus:ring-baylor-green/20"
              />
            </div>
          </div>
        </div>

        {searchQuery.trim().length > 0 && (
          <div className="university-card">
            <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">
              Search results
            </div>
            <div className="divide-y divide-gray-100">
              {searchResults.length === 0 ? (
                <div className="px-6 py-6 text-sm text-gray-500">
                  No matches found. Try a different keyword or browse the
                  sections below.
                </div>
              ) : (
                searchResults.map((item) => {
                  const ItemIcon = item.icon;
                  const pinned = isPinned(item.id);
                  return (
                    <div key={item.id} className="flex items-stretch">
                      <button
                        onClick={() => handleNavigate(item.path)}
                        className="flex flex-1 items-start gap-3 px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="mt-0.5 rounded-lg bg-gray-50 p-2">
                          <ItemIcon className="h-4 w-4 text-baylor-green" />
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {item.label}
                            </span>
                            <span className="text-xs text-gray-400">
                              {item.sectionLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-500">
                            {item.description}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 text-gray-300" />
                      </button>
                      <button
                        onClick={(event) => handlePinToggle(event, item.id)}
                        className="flex items-center px-4 text-gray-400 hover:text-baylor-gold"
                        aria-pressed={pinned}
                        title={pinned ? "Unpin" : "Pin"}
                      >
                        <Star
                          className={`h-4 w-4 ${pinned ? "text-baylor-gold fill-current" : "text-gray-300"}`}
                        />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-label="Pinned destinations">
        <div className="university-card">
          <div className="university-card-header">
            <h2 className="university-card-title">Pinned</h2>
            <p className="university-card-subtitle">
              Keep your most-used destinations one click away.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {pinnedItems.length === 0 ? (
              <div className="px-6 py-6 text-sm text-gray-500">
                No pins yet. Use the star next to any destination to keep it
                here.
              </div>
            ) : (
              pinnedItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div key={item.id} className="flex items-stretch">
                    <button
                      onClick={() => handleNavigate(item.path)}
                      className="flex flex-1 items-start gap-3 px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="mt-0.5 rounded-lg bg-gray-50 p-2">
                        <ItemIcon className="h-4 w-4 text-baylor-green" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {item.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {item.sectionLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          {item.description}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 text-gray-300" />
                    </button>
                    <button
                      onClick={(event) => handlePinToggle(event, item.id)}
                      className="flex items-center px-4 text-gray-400 hover:text-baylor-gold"
                      aria-pressed
                      title="Unpin"
                    >
                      <Star className="h-4 w-4 text-baylor-gold fill-current" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section aria-label="Browse by section" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Browse</h2>
          <p className="text-sm text-gray-500">
            Expand a section to see every destination you can access.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {navigationSections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              defaultOpen={index < 2}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
