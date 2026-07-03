/**
 * whatsNew.js - In-app release notes ("What's New")
 *
 * Release notes are a static, versioned module that ships with each deploy.
 * They describe the deploy itself, so they live in code rather than Firestore:
 * no reads, no rules, version-controlled alongside the changes they announce.
 *
 * HOW TO PUBLISH A RELEASE
 * 1. Prepend a new object to RELEASES (newest first) with the next integer
 *    `version`, an ISO `date` including a timezone offset (always rendered in
 *    each viewer's local time), and 2-5 plain-English highlights.
 * 2. Ship it. Users get the one-time toast on their next visit, and the
 *    header Sparkles button shows an unseen dot until they open or dismiss.
 */
import { BadgeCheck, GraduationCap, IdCard, ListFilter } from "lucide-react";

export const WHATS_NEW_STORAGE_KEY = "whatsNewLastSeenVersion";

export const RELEASES = [
  {
    version: 1,
    date: "2026-07-02T21:45:00-06:00",
    title: "Program directors, upgraded",
    summary:
      "Program director roles get a big upgrade: UPD & GPD badges across the app, new filters, and a redesigned Programs & Directors page.",
    highlights: [
      {
        icon: GraduationCap,
        title: "Programs & Directors",
        description:
          "The Programs page is now Programs & Directors. Assign Undergraduate and Graduate Program Directors (UPD & GPD) in one place; programs can have multiple directors, and the graduate role is brand new.",
      },
      {
        icon: BadgeCheck,
        title: "Director badges everywhere",
        description:
          "Faculty who direct a program now wear UPD or GPD badges on contact cards and in the faculty, building, and email directories. Hover a badge to see the full role and program.",
      },
      {
        icon: ListFilter,
        title: "Filter, sort, and export by role",
        description:
          "Email lists and the faculty directory can filter by director role and put directors first, and CSV exports now include director roles.",
      },
      {
        icon: IdCard,
        title: "Cleaner Baylor IDs",
        description:
          "Baylor IDs read “Not assigned” instead of “Missing”, editing gives clearer guidance, and IDs stay consistent across contact cards, the PAF workflow, and the Baylor IDs page.",
      },
    ],
  },
];

export const LATEST_RELEASE = RELEASES[0];

// ---- Seen-state (localStorage, same pattern as pinned pages) ----

export const getLastSeenVersion = () => {
  try {
    const raw = window.localStorage.getItem(WHATS_NEW_STORAGE_KEY);
    const parsed = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (error) {
    console.error("Failed to read What's New seen-state", error);
    // Fail closed: if storage is unavailable a dismissal can't persist either,
    // so treat everything as seen rather than nag on every visit.
    return LATEST_RELEASE.version;
  }
};

export const setLastSeenVersion = (version) => {
  try {
    window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, String(version));
  } catch (error) {
    console.error("Failed to save What's New seen-state", error);
  }
};

export const hasUnseenRelease = () =>
  getLastSeenVersion() < LATEST_RELEASE.version;

// Release timestamps render in the viewer's own timezone and locale.
export const formatReleaseTimestamp = (isoDate) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(isoDate));
