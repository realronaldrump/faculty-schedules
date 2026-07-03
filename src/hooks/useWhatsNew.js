import { useEffect, useState } from "react";
import {
  LATEST_RELEASE,
  RELEASES,
  hasUnseenRelease,
  setLastSeenVersion,
} from "../utils/whatsNew";
import { trackAction } from "../utils/activityTracking";

// Let the first render settle before the toast slides in, so release notes
// never compete with the page the user actually came for.
const TOAST_DELAY_MS = 1500;

/**
 * useWhatsNew - state machine for the in-app release notes.
 *
 * Owns unseen detection (localStorage-backed), the delayed one-time toast,
 * and the modal. Opening the modal or dismissing the toast acknowledges the
 * latest release; the modal itself stays reachable from the header forever.
 */
const useWhatsNew = () => {
  const [hasUnseen, setHasUnseen] = useState(hasUnseenRelease);
  const [toastReady, setToastReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!hasUnseen) return undefined;
    const timer = setTimeout(() => setToastReady(true), TOAST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasUnseen]);

  const markSeen = () => {
    setLastSeenVersion(LATEST_RELEASE.version);
    setHasUnseen(false);
  };

  const openWhatsNew = () => {
    setIsModalOpen(true);
    markSeen();
    trackAction("whats_new_opened", { version: LATEST_RELEASE.version });
  };

  return {
    releases: RELEASES,
    latestRelease: LATEST_RELEASE,
    hasUnseen,
    showToast: hasUnseen && toastReady && !isModalOpen,
    isModalOpen,
    openWhatsNew,
    closeWhatsNew: () => setIsModalOpen(false),
    dismissToast: markSeen,
  };
};

export default useWhatsNew;
