import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Star, ChevronRight, HelpCircle } from "lucide-react";
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
        className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden group/card transition-all duration-200 hover:shadow-md hover:border-baylor-green/20"
        open={defaultOpen}
      >
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-baylor-green/10 p-2.5 group-hover/card:bg-baylor-gold/15 transition-all">
                <SectionIcon className="h-5 w-5 text-baylor-green transition-colors" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  {section.label}
                </h3>
                <p className="mt-0.5 text-xs text-gray-400">
                  {section.description}
                </p>
              </div>
            </div>
            <ChevronRight className="mt-1.5 h-4 w-4 text-gray-300 transition-all duration-200 group-open:rotate-90 group-hover/card:text-baylor-green/40" />
          </div>
        </summary>
        <div className="border-t border-gray-50 divide-y divide-gray-50">
          {section.items.map((item) => {
            const ItemIcon = item.icon || section.icon;
            const pinned = isPinned(item.id);

            return (
              <div key={item.id} className="flex items-stretch group/item">
                <button
                  onClick={() => handleNavigate(item.path)}
                  className="flex flex-1 items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50/80 transition-colors"
                >
                  <div className="mt-0.5 rounded-lg bg-gray-100/50 p-2 group-hover/item:bg-baylor-gold/10 transition-colors">
                    <ItemIcon className="h-4 w-4 text-gray-500 group-hover/item:text-baylor-gold transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-gray-700">
                        {item.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-400 truncate">
                      {item.description}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 text-gray-200 group-hover/item:text-baylor-gold/60 transition-colors" />
                </button>
                <button
                  onClick={(event) => handlePinToggle(event, item.id)}
                  className="flex items-center px-4 text-gray-300 hover:text-baylor-gold transition-colors"
                  aria-pressed={pinned}
                  title={pinned ? "Unpin" : "Pin for quick access"}
                >
                  <Star
                    className={`h-4 w-4 ${pinned ? "text-baylor-gold fill-current" : ""}`}
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
    <div className="space-y-6">
      <header className="relative -mx-4 md:-mx-6 -mt-6 px-6 md:px-8 pt-8 pb-6 bg-gradient-to-br from-baylor-green to-baylor-green/90 rounded-b-2xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-baylor-gold" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-baylor-gold/90">
              Welcome back{firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="text-2xl font-semibold text-white mt-1">
              What are you looking for?
            </h1>
            <p className="max-w-xl text-sm text-white/60 leading-relaxed mt-1">
              Search below or explore the sections to get where you need to go.
            </p>
          </div>
          <button
            onClick={() => handleNavigate("/help/tutorials")}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white/90 bg-white/10 hover:bg-white/20 rounded-md transition-all"
            title="View tutorials and help"
          >
            <HelpCircle className="h-5 w-5" />
            <span>Tutorials</span>
          </button>
        </div>
      </header>

      <section aria-label="Search" className="space-y-3">
        <div className="relative">
          <label htmlFor="dashboard-search" className="sr-only">
            Search destinations
          </label>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            id="dashboard-search"
            type="text"
            placeholder="Search for people, rooms, courses, or tools..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full rounded-xl border border-gray-200 bg-white py-3.5 pl-12 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-baylor-green focus:outline-none focus:ring-2 focus:ring-baylor-green/20 shadow-sm transition-all"
          />
        </div>

        {searchQuery.trim().length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 text-xs font-medium text-gray-400 border-b border-gray-50 bg-gray-50/30">
              Search results
            </div>
            <div className="divide-y divide-gray-50">
              {searchResults.length === 0 ? (
                <div className="px-5 py-8 text-sm text-gray-400 text-center">
                  No matches found. Try a different keyword or browse below.
                </div>
              ) : (
                searchResults.map((item) => {
                  const ItemIcon = item.icon;
                  const pinned = isPinned(item.id);
                  return (
                    <div key={item.id} className="flex items-stretch group">
                      <button
                        onClick={() => handleNavigate(item.path)}
                        className="flex flex-1 items-start gap-3 px-5 py-4 text-left hover:bg-gray-50/80 transition-colors"
                      >
                        <div className="mt-0.5 rounded-lg bg-baylor-green/5 p-2 group-hover:bg-baylor-gold/10 transition-colors">
                          <ItemIcon className="h-4 w-4 text-baylor-green group-hover:text-baylor-gold transition-colors" />
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800">
                              {item.label}
                            </span>
                            <span className="text-xs text-gray-300">
                              {item.sectionLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-400">
                            {item.description}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 text-gray-200 group-hover:text-baylor-gold transition-colors" />
                      </button>
                      <button
                        onClick={(event) => handlePinToggle(event, item.id)}
                        className="flex items-center px-4 text-gray-300 hover:text-baylor-gold transition-colors"
                        aria-pressed={pinned}
                        title={pinned ? "Unpin" : "Pin"}
                      >
                        <Star
                          className={`h-4 w-4 ${pinned ? "text-baylor-gold fill-current" : ""}`}
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

      {pinnedItems.length > 0 && (
        <section aria-label="Pinned destinations" className="space-y-2">
          <div className="flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-baylor-gold fill-current" />
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Your shortcuts
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {pinnedItems.map((item) => {
              const ItemIcon = item.icon;
              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 bg-white rounded-lg border border-gray-200 shadow-sm hover:border-baylor-gold/50 hover:shadow-md transition-all"
                >
                  <button
                    onClick={() => handleNavigate(item.path)}
                    className="flex items-center gap-2 pl-3 py-2 pr-1 text-sm transition-colors"
                  >
                    <ItemIcon className="h-4 w-4 text-baylor-green/70 group-hover:text-baylor-gold transition-colors" />
                    <span className="font-medium text-gray-700 group-hover:text-gray-900">
                      {item.label}
                    </span>
                  </button>
                  <button
                    onClick={(event) => handlePinToggle(event, item.id)}
                    className="pr-2.5 py-2 text-baylor-gold/40 hover:text-baylor-gold transition-colors"
                    aria-pressed
                    title="Unpin"
                  >
                    <Star className="h-3 w-3 fill-current" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-label="Browse by section" className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200"></div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">
            Explore
          </h2>
          <div className="h-px flex-1 bg-gray-200"></div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {navigationSections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              defaultOpen={false}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
