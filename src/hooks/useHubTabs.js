import { useMemo, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";

const EMPTY_REDIRECTS = {};

/**
 * useHubTabs - unified tab state machine for hub components.
 *
 * Replaces the per-hub copies of access filtering, URL parsing, and tab-sync
 * effects with one hook that supports both URL strategies the hubs use:
 *
 *  - 'query': tab lives in `?tab=<id>` on a single `canonicalPath`
 *    (Faculty, Rooms, Student Workers).
 *  - 'path':  each tab has its own route `path` (Courses, People, Facilities).
 *
 * @param {Object} opts
 * @param {Array}  opts.tabs - tab definitions: `{ id, accessId, path?, preserveQuery? }`
 * @param {string} [opts.initialTab] - tab from route props
 * @param {'query'|'path'} [opts.strategy='query']
 * @param {string} [opts.canonicalPath] - base path for the 'query' strategy
 * @param {Object} [opts.redirects] - 'query' strategy: map of legacy `?tab=` values
 *   to external paths to redirect to (e.g. `{ calendar: '/tools/outlook-export' }`)
 * @returns {{ availableTabs: Array, activeTab: string, handleTabChange: (id:string)=>void }}
 */
export function useHubTabs({
  tabs,
  initialTab,
  strategy = "query",
  canonicalPath,
  redirects = EMPTY_REDIRECTS,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccess } = useAuth();

  const availableTabs = useMemo(
    () => tabs.filter((tab) => canAccess(tab.accessId)),
    [tabs, canAccess],
  );

  const tabFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("tab");
  }, [location.search]);

  const currentPath = useMemo(
    () => location.pathname.replace(/^\//, ""),
    [location.pathname],
  );

  const tabFromPath = useMemo(
    () => tabs.find((tab) => tab.path && tab.path === currentPath)?.id || null,
    [tabs, currentPath],
  );

  const fallbackTab = availableTabs[0]?.id || tabs[0].id;

  const resolvedTab = useMemo(() => {
    const candidate =
      strategy === "path"
        ? tabFromPath || tabFromUrl || initialTab || fallbackTab
        : tabFromUrl || initialTab || fallbackTab;
    return availableTabs.some((tab) => tab.id === candidate)
      ? candidate
      : fallbackTab;
  }, [strategy, tabFromPath, tabFromUrl, initialTab, fallbackTab, availableTabs]);

  const [activeTab, setActiveTab] = useState(resolvedTab);

  // Keep local state in sync with whatever the URL resolves to.
  useEffect(() => {
    if (resolvedTab !== activeTab) setActiveTab(resolvedTab);
  }, [resolvedTab, activeTab]);

  // Redirect legacy `?tab=` values to their new standalone routes.
  useEffect(() => {
    if (tabFromUrl && redirects[tabFromUrl]) {
      navigate(redirects[tabFromUrl], { replace: true });
    }
  }, [navigate, redirects, tabFromUrl]);

  // Query strategy: normalize the URL to the canonical path when arriving via a
  // non-canonical route that carried an initialTab prop.
  useEffect(() => {
    if (
      strategy === "query" &&
      canonicalPath &&
      location.pathname !== canonicalPath &&
      initialTab
    ) {
      const params = new URLSearchParams();
      params.set("tab", initialTab || fallbackTab);
      navigate(`${canonicalPath}?${params.toString()}`, { replace: true });
    }
  }, [strategy, canonicalPath, initialTab, fallbackTab, location.pathname, navigate]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (strategy === "path") {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const query = tab.preserveQuery ? location.search : "";
      navigate(`/${tab.path}${query}`, { replace: true });
    } else {
      const params = new URLSearchParams();
      params.set("tab", tabId);
      navigate(`${canonicalPath}?${params.toString()}`, { replace: true });
    }
  };

  return { availableTabs, activeTab, handleTabChange };
}

export default useHubTabs;
