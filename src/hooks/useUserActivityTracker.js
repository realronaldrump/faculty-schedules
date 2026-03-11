import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import {
  buildActivityActor,
  getActivitySessionId,
  logUserActivityEvent,
} from "../utils/activityTracking";
import { getNavigationMeta } from "../utils/navigationMeta";

const DUPLICATE_EVENT_WINDOW_MS = 15 * 1000;

const defaultLastEvent = { pageId: "", timestampMs: 0 };

export const useUserActivityTracker = ({
  currentPage,
  isAuthenticated,
} = {}) => {
  const { user, userProfile, loading, canAccess } = useAuth();
  const sessionIdRef = useRef("");
  const lastEventRef = useRef(defaultLastEvent);

  const actor = useMemo(() => {
    return buildActivityActor({ user, userProfile });
  }, [
    user?.uid,
    user?.email,
    user?.displayName,
    userProfile?.email,
    userProfile?.displayName,
    userProfile?.roles,
  ]);

  useEffect(() => {
    if (!isAuthenticated || loading || !user?.uid) {
      sessionIdRef.current = "";
      lastEventRef.current = defaultLastEvent;
      return;
    }

    if (!sessionIdRef.current) {
      sessionIdRef.current = getActivitySessionId(user.uid);
    }
  }, [isAuthenticated, loading, user?.uid]);

  useEffect(() => {
    if (!isAuthenticated || loading || !actor || !currentPage) return;

    const pageMeta = getNavigationMeta(currentPage);
    const accessId = pageMeta?.accessId || pageMeta?.pageId || currentPage;
    if (typeof canAccess === "function" && !canAccess(accessId)) {
      return;
    }

    const nowMs = Date.now();
    const lastEvent = lastEventRef.current;
    if (
      lastEvent.pageId === currentPage &&
      nowMs - lastEvent.timestampMs < DUPLICATE_EVENT_WINDOW_MS
    ) {
      return;
    }
    lastEventRef.current = { pageId: currentPage, timestampMs: nowMs };

    sessionIdRef.current = sessionIdRef.current || getActivitySessionId(actor.uid);

    const writeActivity = async () => {
      try {
        await logUserActivityEvent({
          actor,
          currentPage,
          eventType: "page_enter",
          actionKey: "navigate",
          metadata: { source: "route-change" },
          includePresence: true,
        });
      } catch (error) {
        console.warn("User activity tracking write failed:", error);
      }
    };

    void writeActivity();
  }, [actor, canAccess, currentPage, isAuthenticated, loading]);
};

export default useUserActivityTracker;
