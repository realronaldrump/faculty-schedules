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
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  Download,
  FolderOpen,
  GraduationCap,
  History,
  IdCard,
  LayoutDashboard,
  ListFilter,
  PanelTop,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";

export const WHATS_NEW_STORAGE_KEY = "whatsNewLastSeenVersion";

export const RELEASES = [
  {
    version: 12,
    date: "2026-08-25T11:13:04-05:00",
    title: "Design room grids your way",
    summary:
      "Schedule Grid Studio keeps custom door schedules editable, reusable, organized, and exportable inside the dashboard.",
    highlights: [
      {
        icon: LayoutDashboard,
        title: "Schedule Grid Studio",
        description:
          "Start with dashboard schedule data or a blank grid, then edit classes, sizing, colors, time ranges, and visible fields in a live preview.",
      },
      {
        icon: FolderOpen,
        title: "Reusable in-app templates",
        description:
          "Save, update, duplicate, favorite, tag, search, and organize schedule templates before exporting a correctly sized PDF.",
      },
      {
        icon: CalendarCheck,
        title: "More reliable room calendars",
        description:
          "Room Calendar Export now loads the selected semester, keeps multi-room meeting times with the right rooms, honors shared no-class dates, and avoids empty or conflicting calendar files.",
      },
      {
        icon: Download,
        title: "Complete, safer exports",
        description:
          "Data exports now include current scheduling and operational records, preserve semester-specific student jobs, and produce safer Excel-ready files.",
      },
    ],
  },
  {
    version: 11,
    date: "2026-07-30T12:00:00-06:00",
    title: "Better on every screen",
    summary:
      "Navigation, tables, and common controls now adapt more smoothly to phones and smaller screens.",
    highlights: [
      {
        icon: PanelTop,
        title: "Cleaner mobile layouts",
        description:
          "Headers, breadcrumbs, tabs, and directories now fit smaller screens with less crowding and duplication.",
      },
      {
        icon: Sparkles,
        title: "Easier controls and tables",
        description:
          "Larger touch targets and clearer horizontal scrolling make actions and wide tables easier to use.",
      },
    ],
  },
  {
    version: 10,
    date: "2026-07-10T12:00:00-06:00",
    title: "Safer imports and cleaner data",
    summary:
      "Imports now preserve stable identifiers, block contradictory rows, and handle schedules, cleanup reviews, and legacy data more safely.",
    highlights: [
      {
        icon: ShieldCheck,
        title: "Safer import previews",
        description:
          "The Import Wizard now blocks contradictory identities, preserves CLSS and CRN matches while merging duplicate rows, and validates both new and updated records.",
      },
      {
        icon: CalendarCheck,
        title: "More accurate schedule checks",
        description:
          "Conflict checks now include updated classes, weekend meeting comparisons are consistent, and hybrid online and in-person classes keep their physical room assignments.",
      },
      {
        icon: Wrench,
        title: "Safer cleanup reviews",
        description:
          "Data Cleanup surfaces uncertain director migrations for manual review, keeps them out of routine fixes, and preserves partial student job details while modernizing older records.",
      },
      {
        icon: UserCheck,
        title: "Better status and matching accuracy",
        description:
          "Student worker dates are validated more strictly, ambiguous instructor names are left unmatched, and legacy default semester codes upgrade to the correct seasons.",
      },
      {
        icon: Sparkles,
        title: "Installable app polish",
        description:
          "The installed HSD Dashboard now launches from the correct location and includes crisp, correctly sized app icons.",
      },
    ],
  },
  {
    version: 9,
    date: "2026-07-03T10:55:00-06:00",
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
          'Baylor IDs read "Not assigned" instead of "Missing", editing gives clearer guidance, and IDs stay consistent across contact cards, the PAF workflow, and the Baylor IDs page.',
      },
      {
        icon: Sparkles,
        title: "What's New",
        description:
          "The header now has a What's New button and a one-time update card so you can quickly see what changed after a new release.",
      },
    ],
  },
  {
    version: 8,
    date: "2026-06-17T16:00:00-05:00",
    title: "A more consistent dashboard",
    summary:
      "Pages, tabs, dialogs, dropdowns, and tutorials were polished so the dashboard feels more consistent from one section to the next.",
    highlights: [
      {
        icon: PanelTop,
        title: "Cleaner page layouts",
        description:
          "More screens now share the same page headers, tab styles, dialog patterns, and action buttons.",
      },
      {
        icon: ListFilter,
        title: "Better dropdowns",
        description:
          "Selectors across the app are easier to scan, resize more gracefully, and behave more consistently on smaller screens.",
      },
      {
        icon: UserCheck,
        title: "Richer student worker details",
        description:
          "Student worker cards can show supervisor names, and job edits feel smoother when updating student worker information.",
      },
      {
        icon: BookOpen,
        title: "Tutorial fixes",
        description:
          "Tutorial buttons, target recovery, and step handling were tightened up across the dashboard.",
      },
    ],
  },
  {
    version: 7,
    date: "2026-06-16T15:05:00-05:00",
    title: "Reservations and new analytics",
    summary:
      "Scheduling and analytics expanded with room reservations, enrollment capacity review, semester comparison, calendar exports, and clearer Semester wording.",
    highlights: [
      {
        icon: CalendarCheck,
        title: "Room reservations",
        description:
          "Rooms now have a Reservations tab for booking open time around the class schedule, checking conflicts, and exporting reservations to a calendar.",
      },
      {
        icon: BarChart3,
        title: "Enrollment & Capacity",
        description:
          "A new analytics view helps spot overfilled sections, low enrollment, waitlists, and room capacity mismatches.",
      },
      {
        icon: ChartNoAxesCombined,
        title: "Semester Comparison",
        description:
          "Compare two semesters to see what was added, dropped, or changed in the schedule.",
      },
      {
        icon: CalendarDays,
        title: "Calendar exports",
        description:
          "Room schedule and reservation exports now share the same more reliable calendar-file handling.",
      },
      {
        icon: Search,
        title: "Term is now Semester",
        description:
          "The app now uses Semester wording across menus, filters, reports, import screens, and tutorials.",
      },
    ],
  },
  {
    version: 6,
    date: "2026-06-15T23:25:00-05:00",
    title: "Tutorials that remember progress",
    summary:
      "The tutorial system was rebuilt with better guided tours, saved progress, clearer organization, and recovery messages when a step moves.",
    highlights: [
      {
        icon: BookOpen,
        title: "More guided tours",
        description:
          "New and refreshed walkthroughs cover getting started, Today, faculty schedules, the Import Wizard, room reservations, capacity review, and more.",
      },
      {
        icon: ChartNoAxesCombined,
        title: "Progress you can see",
        description:
          "The Tutorials page now shows completion progress and organizes walkthroughs by category.",
      },
      {
        icon: RefreshCw,
        title: "Resume later",
        description:
          "Tutorial progress saves to your account so you can pick up where you left off.",
      },
      {
        icon: ShieldCheck,
        title: "More reliable access",
        description:
          "Profile and permission loading is more tolerant of brief sign-in delays, so pages you can access are less likely to disappear after login.",
      },
    ],
  },
  {
    version: 5,
    date: "2026-06-09T18:20:00-06:00",
    title: "Cleaner navigation and data health",
    summary:
      "Navigation labels, data cleanup, imports, exports, and admin screens were tightened up so routine maintenance work is easier to follow.",
    highlights: [
      {
        icon: LayoutDashboard,
        title: "Clearer navigation",
        description:
          "Sidebar sections, page names, and access labels were cleaned up so related tools are easier to find.",
      },
      {
        icon: Wrench,
        title: "Data Health Check previews",
        description:
          "Routine cleanup now gives clearer previews and summaries before applying safe fixes.",
      },
      {
        icon: ClipboardCheck,
        title: "Safer standardization",
        description:
          "Data cleanup is better at recognizing old formats, avoiding false changes, and explaining what will be updated.",
      },
      {
        icon: Download,
        title: "Export polish",
        description:
          "Admin exports, room schedule exports, and workbook output received small usability and consistency improvements.",
      },
    ],
  },
  {
    version: 4,
    date: "2026-04-24T10:20:00-06:00",
    title: "Smoother sign-in and safer imports",
    summary:
      "Sign-in, loading, and import handling were hardened so the app recovers better from temporary hiccups and reports import problems more clearly.",
    highlights: [
      {
        icon: ShieldCheck,
        title: "More reliable sign-in",
        description:
          "Login and permission checks were made more dependable, especially during the first moments after signing in.",
      },
      {
        icon: RefreshCw,
        title: "Smoother loading",
        description:
          "The app now handles loading transitions more gracefully while schedules, profiles, and app settings are being prepared.",
      },
      {
        icon: ClipboardCheck,
        title: "Import reliability",
        description:
          "The Import Wizard received behind-the-scenes fixes that make previewing, applying, and reviewing imports more consistent.",
      },
      {
        icon: History,
        title: "Better change history",
        description:
          "Recent Changes and related logs are better at showing useful context for updates made inside the dashboard.",
      },
    ],
  },
  {
    version: 3,
    date: "2026-03-16T16:30:00-05:00",
    title: "The HSD Dashboard name",
    summary:
      "The app received its HSD Dashboard identity across the browser tab, loading screen, login screen, sidebar, installable app, and exports.",
    highlights: [
      {
        icon: LayoutDashboard,
        title: "App identity",
        description:
          "The dashboard name and acronym were cleaned up across the places users see when opening the app.",
      },
      {
        icon: PanelTop,
        title: "Sidebar polish",
        description:
          "The sidebar header and loading experience now present a clearer dashboard identity.",
      },
      {
        icon: Download,
        title: "Export naming",
        description:
          "Generated workbooks and app metadata were updated to match the dashboard branding.",
      },
    ],
  },
  {
    version: 2,
    date: "2026-02-13T16:40:00-06:00",
    title: "Cleaner contact cards",
    summary:
      "Person details got a small polish pass, especially when opening people from student schedules.",
    highlights: [
      {
        icon: UserCheck,
        title: "Centered contact details",
        description:
          "Faculty and staff contact cards now present names, roles, and core details in a cleaner centered layout.",
      },
      {
        icon: Users,
        title: "Student schedule popups",
        description:
          "Opening a person from a student schedule now shows the contact card as a self-contained popup instead of feeling like an inline page jump.",
      },
      {
        icon: History,
        title: "Named updates",
        description:
          "Change history started capturing more user context so updates in the dashboard are easier to attribute.",
      },
    ],
  },
  {
    version: 1,
    date: "2026-02-12T17:15:00-06:00",
    title: "Original working dashboard",
    summary:
      "This is the working dashboard foundation that was in place before the February update cycle: search, schedules, people tools, room tools, imports, and admin utilities in one app.",
    highlights: [
      {
        icon: LayoutDashboard,
        title: "Search-first home",
        description:
          "The dashboard home page brought global search, pinned shortcuts, and app sections together as the main launch point.",
      },
      {
        icon: Users,
        title: "People and schedules",
        description:
          "Faculty, staff, adjuncts, student workers, contact cards, and schedule views were already available for day-to-day lookup.",
      },
      {
        icon: Building2,
        title: "Rooms and facilities",
        description:
          "Room schedules, room grids, building information, spaces, and temperature monitoring formed the facilities side of the app.",
      },
      {
        icon: ClipboardCheck,
        title: "Import and admin tools",
        description:
          "The dashboard already included schedule imports, recent changes, access control, app settings, and cleanup tools for maintaining the data.",
      },
    ],
  },
];

export const LATEST_RELEASE = RELEASES[0];

// ---- Seen-state (localStorage, same pattern as pinned pages) ----

export const getLastSeenVersion = () => {
  try {
    const raw = window.localStorage.getItem(WHATS_NEW_STORAGE_KEY);
    const normalized = (raw ?? "").trim();
    if (!/^\d+$/.test(normalized)) return 0;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : 0;
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
