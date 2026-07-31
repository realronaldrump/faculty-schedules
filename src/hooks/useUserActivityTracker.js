import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import {
  buildActivityActor,
  getActivitySessionId,
  logUserActivityEvent,
  recordActivityDuration,
  setActivityContext,
  touchPresence,
} from "../utils/activityTracking";
import { getNavigationMeta } from "../utils/navigationMeta";

// Keep "Active now" honest for users who read one page for a while. Presence-only
// write, gated to a visible tab, so it stays cheap on the free tier.
const PRESENCE_HEARTBEAT_MS = 90 * 1000;
const DURATION_FLUSH_MS = 60 * 1000;
const MIN_DURATION_FLUSH_MS = 1000;

const defaultLastEvent = { pageId: "", timestampMs: 0 };

const useUserActivityTracker = ({
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
  const actorRef = useRef(actor);
  actorRef.current = actor;

  const hasPageAccess = useMemo(() => {
    if (!currentPage) return false;
    const pageMeta = getNavigationMeta(currentPage);
    const accessId = pageMeta?.accessId || pageMeta?.pageId || currentPage;
    return typeof canAccess !== "function" || canAccess(accessId);
  }, [canAccess, currentPage]);

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

  // Keep the module-level context current so feature code can call
  // trackAction(actionKey) from anywhere without actor/page plumbing.
  useEffect(() => {
    setActivityContext(
      isAuthenticated && !loading && actor
        ? { actor, currentPage }
        : { actor: null, currentPage: "" },
    );
  }, [actor, currentPage, isAuthenticated, loading]);

  useEffect(() => () => setActivityContext(), []);

  useEffect(() => {
    const currentActor = actorRef.current;
    if (
      !isAuthenticated ||
      loading ||
      !currentActor ||
      !currentPage ||
      !hasPageAccess
    ) return;

    const lastEvent = lastEventRef.current;
    if (lastEvent.pageId === currentPage) return;
    const previousPage = lastEvent.pageId || "";
    lastEventRef.current = { pageId: currentPage, timestampMs: Date.now() };

    sessionIdRef.current =
      sessionIdRef.current || getActivitySessionId(currentActor.uid);

    const writeActivity = async () => {
      try {
        await logUserActivityEvent({
          actor: currentActor,
          currentPage,
          previousPage,
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
  }, [currentPage, hasPageAccess, isAuthenticated, loading, user?.uid]);

  // Measure visible-tab dwell independently from page entries. Flush once per
  // minute, on route changes/unmount, and when the tab becomes hidden.
  useEffect(() => {
    if (
      !isAuthenticated ||
      loading ||
      !actorRef.current ||
      !currentPage ||
      !hasPageAccess ||
      typeof document === "undefined"
    ) return undefined;

    let visibleSinceMs =
      document.visibilityState === "visible" ? Date.now() : null;

    const flush = ({ keepRunning = true } = {}) => {
      if (visibleSinceMs === null) return;
      const nowMs = Date.now();
      const elapsedMs = Math.max(0, nowMs - visibleSinceMs);
      visibleSinceMs =
        keepRunning && document.visibilityState === "visible" ? nowMs : null;
      if (elapsedMs < MIN_DURATION_FLUSH_MS) return;

      const currentActor = actorRef.current;
      if (!currentActor) return;
      void recordActivityDuration({
        actor: currentActor,
        currentPage,
        durationMinutes: elapsedMs / (60 * 1000),
      }).catch((error) => {
        console.warn("Activity duration write failed:", error);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (visibleSinceMs === null) visibleSinceMs = Date.now();
        return;
      }
      flush({ keepRunning: false });
    };

    const intervalId = setInterval(flush, DURATION_FLUSH_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush({ keepRunning: false });
    };
  }, [currentPage, hasPageAccess, isAuthenticated, loading, user?.uid]);

  // Presence heartbeat: while the current page is open AND the tab is visible,
  // refresh the presence doc so the owner's "Active now" reflects real presence,
  // not just the last navigation. Pauses entirely when the tab is hidden.
  useEffect(() => {
    if (
      !isAuthenticated ||
      loading ||
      !actorRef.current ||
      !currentPage ||
      !hasPageAccess
    ) return;
    if (typeof document === "undefined") return;

    const beat = () => {
      if (document.visibilityState !== "visible") return;
      const currentActor = actorRef.current;
      if (!currentActor) return;
      void touchPresence({ actor: currentActor, currentPage }).catch((error) => {
        console.warn("Presence heartbeat failed:", error);
      });
    };

    const intervalId = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    // Refresh immediately when the user returns to the tab.
    document.addEventListener("visibilitychange", beat);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [currentPage, hasPageAccess, isAuthenticated, loading, user?.uid]);
};

export default useUserActivityTracker;
