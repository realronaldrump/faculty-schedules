# HSD Dashboard — What's New
### A guide for departmental administrators
**Changes from February 12 – June 2026**

---

## How to use this document

This is a plain-language summary of **everything that changed in the app** since
February 12, 2026 that you, as an administrator, are likely to see or use. It is
organized to mirror the left-hand menu in the app, so you can use it as a guided
walkthrough during training.

- **Start with the [Top Highlights](#top-highlights)** — the handful of changes
  you'll notice immediately.
- **Then go section by section** — each section matches a menu in the sidebar.
- Items marked **NEW** are brand-new features. Items marked **Improved** existed
  before but work differently now.

> A quick note on vocabulary: throughout the app, the word **"Term" is now
> "Semester."** You'll see this everywhere (menus, buttons, reports). It's the
> same thing — just clearer wording.

---

## Top Highlights

1. **The app has a name: "HSD Dashboard."** You'll see it on the browser tab, the
   sign-in screen, the loading screen, and at the top of the sidebar.
2. **Reserve rooms yourself — NEW.** A new *Reservations* tab lets you book
   department rooms in the gaps around the class schedule, with automatic conflict
   checking. (Scheduling → Rooms → Reservations)
3. **Enrollment & Capacity — NEW.** A new report that flags sections that are
   over/under capacity or assigned to the wrong-size room. (Analytics)
4. **Semester Comparison — NEW.** Compare any two semesters and see exactly what
   was added, dropped, or changed. (Analytics)
5. **A safer Import Wizard.** Imports now keep a **history**, can be **undone**,
   warn you about **missing columns**, and **block edits to locked/archived
   semesters.** (Administration → Import Wizard)
6. **Data Health Check, redesigned.** The old "Maintenance Center" is now a
   step-by-step cleanup workflow that separates automatic fixes from changes that
   need your decision. (Administration → Data Health Check)
7. **Data Exports — NEW.** One place to export clean Excel workbooks of your
   operational data. (Administration → Data Exports)
8. **Tutorials that remember where you left off.** The in-app walkthroughs were
   rebuilt; your progress now saves to your account so you can resume any time.
   (Help & Resources → Tutorials)

---

## Across the whole app

These changes affect every page.

- **New name — "HSD Dashboard."** Appears on the browser tab, sign-in page,
  loading screen, the sidebar header, and the installable app icon.
- **"Term" → "Semester."** All wording was updated for consistency: menus,
  filters, report titles, import screens, and tutorials.
- **A more consistent look and feel.** Buttons, pop-up dialogs, status pills/tags,
  page titles, and dropdown menus were standardized across the app, so the same
  control looks and behaves the same way everywhere. Drop-down selectors in
  particular are cleaner and resize properly on smaller screens.
- **Faster, smoother loading.** Pages now load on demand, so the app starts up
  faster, and the loading screens were polished.
- **More reliable sign-in.** Sign-in was hardened so that brief network hiccups
  right after you log in no longer kick you out or hide pages you should see —
  your account and permissions load reliably.

---

## Home

- **Dashboard** remains your search-first launchpad: a global search box, your
  pinned shortcuts, an "Explore" area that mirrors the sidebar, and a button to
  open the tutorials.
- **Today** ("Today" view) is unchanged in purpose — a live, at-a-glance look at
  what's happening right now — and now has its own guided tutorial.

---

## People

- **One unified Directory — Improved.** The separate Faculty, Adjunct, and Staff
  directories (and the old "Faculty Finder") were **merged into a single
  Directory.** Instead of jumping between lists, you search and filter everyone in
  one place. (People → Directory)
- **The People menu is now a single hub** with tabs for **Directory, Email Lists,
  Offices, Programs, Baylor IDs,** and the **PAF Workflow** — so related people
  tools live together.
- **Person/Contact cards are richer — Improved.** When you open someone's contact
  card, it now shows:
  - their **office location**, resolved and displayed clearly;
  - their **teaching/course schedule** with meeting details (only when they
    actually have courses, so it's not cluttered);
  - for **student workers**, the names of their **supervisors**;
  - a cleaner, centered layout that opens as its own pop-up when clicked from a
    student schedule.
- **Programs — Improved.** Program records now properly handle a **program code**
  when you create or update a program.

---

## Courses

- The course-management screens were tidied up internally for consistency. Day-to-day
  use (browsing and managing courses) is unchanged, but the screens now match the
  app's standardized look.

---

## Scheduling

### Faculty
- The Faculty area is organized into tabs — **Faculty schedules, Compare
  Schedules, Availability,** and **Group Meetings** — and now has a guided
  tutorial walking through each.

### Rooms

- **Reservations — NEW.** A new **Reservations** tab under Rooms lets you:
  - **Book a department room** for a meeting, event, or search lunch in the open
    time around the official class schedule;
  - get **automatic conflict checking** — the app warns you if your time overlaps
    a scheduled class or an existing reservation;
  - see a **day timeline** of what's already booked;
  - **export any reservation to your calendar** (Outlook/Apple/Google) as a
    calendar invite;
  - **view vs. manage:** everyone can *see* reservations; creating or canceling
    them requires room-scheduling access. (If you can only view, the app tells you.)

- **Browse** rooms remains available as its own tab.
- **Room Calendar Export** and **Room Grids** are still here; the calendar-export
  feature was reworked under the hood to share the same reliable calendar-file
  logic now used by Reservations.

---

## Analytics

- **Department Insights — Improved.** The **hourly room-usage** view is more
  accurate and now includes a **day-of-week filter** and a **clickable popup** that
  shows the details behind a given hour (which rooms/courses are driving the usage).

- **Enrollment & Capacity — NEW.** A new report that turns the official schedule
  into an action list. It flags:
  - **Over / near capacity** — sections at or above a fill threshold, or with a
    waitlist (candidates for a bigger room or a second section);
  - **Under-enrolled** — low- or zero-enrollment sections to review for
    cancellation or consolidation;
  - **Room capacity mismatch** — sections whose enrollment doesn't fit the
    assigned room (too small, or far too large).
  - Thresholds are **adjustable**, and clicking a flag takes you to the details.

- **Semester Comparison — NEW.** Pick **two semesters** and instantly see what's
  different: sections **added, dropped,** or **changed** (instructor, room, time,
  or capacity), shown as a clear before → after.

- **Student Worker Analytics** remains available.

> All three analytics tools are **read-only** — they analyze the schedule data you
> already have. They don't change anything in CLSS or your records.

---

## Facilities

- **Temperature Monitoring — Improved.** The import process was overhauled:
  - it now **skips readings you've already imported** instead of creating
    duplicates;
  - it **tracks and reports conflicts** when incoming data disagrees with existing
    data;
  - it shows **room import statistics** after an import so you can see what was
    added vs. skipped;
  - you can **remove room data** when needed.
  - The screen was reorganized into clear panels (Import, Snapshots, Settings,
    Quick Stats, and view tabs) for easier navigation.
- **Spaces** and **Buildings** management remain, with improved behind-the-scenes
  handling of building codes/names so locations resolve more reliably.

---

## Administration

### Import Wizard — Improved (major)
The schedule import tool got the biggest reliability upgrade:
- **Import History.** Every import is now recorded. You can open **Import History**
  to see past imports and their status.
- **Undo / rollback.** Imports are tracked as a single unit so a bad import can be
  rolled back instead of leaving partial changes.
- **Locked / archived semesters are protected.** If you try to import into a
  semester that's been locked or archived, the app stops you with a clear
  **"Semester Locked — import is disabled"** message.
- **Missing-column detection.** If your CLSS file is missing required columns, the
  import is **blocked with a message naming exactly which columns are missing.**
- **Clearer status messages** throughout the import and a smoother hand-off between
  the preview and the history view.

### Data Health Check — Improved (redesign)
The old **"Maintenance Center" / data-cleanup** tools were rebuilt into one
guided **Data Health Check** workflow:
- **Scan** your data for issues;
- **Safe Fixes** — apply the corrections that are unambiguous, automatically, with
  a summary of what was fixed;
- **Decision Review** — for issues that need a human choice (e.g., duplicate or
  conflicting records, older-format records), review them and choose what to do;
- **Rare Repair Tools** — advanced, less-common repairs kept separate so you don't
  trip over them;
- An optional **technical details** panel you can expand if you want to see the
  specifics, plus clear summaries and loading states at each step.

### Data Exports — NEW
A new **Data Exports** page lets you **export operational data to clean,
formatted Excel workbooks** for departmental use — both individual exports and a
bulk export. (The bulk export now centers on **programs** rather than raw course
lists.) Large exports show a confirmation warning before running.

### Recent Changes — Improved
The change log that powers **Recent Changes** now records **who made each change,**
not just what changed — so edits are attributed to the person who made them.

### Other Administration items
- **CRN Quality Tools** — unchanged in function; updated to the "Semester" wording.
- **Access Control** and **App Settings** — still here; access control got a
  behind-the-scenes security and reliability tightening (see note below).
- **User Activity** — this analytics console exists but is **visible only to the
  app owner (the developer).** As administrators, you won't see this page, and you
  don't need to — it's listed here only so it's not a surprise if it comes up.

---

## Help & Resources

- **Tutorials — Improved (major).** The in-app walkthrough system was rebuilt:
  - There are now **12 guided tutorials**, including new "getting started" tours
    (Getting Started, Today, Faculty Schedules, the Import Wizard) and walkthroughs
    for the new tools (Room Reservations, Enrollment & Capacity, Semester
    Comparison).
  - **Your progress is saved to your account.** If you stop partway, the tutorial
    shows **"Resume · Step X of N"** and picks up where you left off — even on a
    different device.
  - The Tutorials page shows your **overall completion** with a progress ring/
    percentage, organizes tutorials by category, and has a settings menu for
    tooltip preferences.
  - If a tutorial points at something that has moved, it now shows a gentle
    **recovery notice** instead of getting stuck.
- **Baylor Systems** and **Acronyms** reference pages remain available from the
  Help menu.

---

## Things that did *not* change for you

- **User Activity console** is owner-only (the developer) — not part of your
  workflow.
- The underlying **CLSS connection stays read-only.** None of the new tools write
  back to CLSS or any university system; they work with the data already in the
  dashboard.

---

## Quick reference — where to find the new tools

| I want to… | Go to |
|---|---|
| Book a department room | Scheduling → Rooms → **Reservations** |
| See which sections are over/under capacity | Analytics → **Enrollment & Capacity** |
| Compare two semesters | Analytics → **Semester Comparison** |
| Import a CLSS schedule (and see past imports) | Administration → **Import Wizard** |
| Clean up data issues | Administration → **Data Health Check** |
| Export data to Excel | Administration → **Data Exports** |
| Learn any of the above | Help & Resources → **Tutorials** |

---

*Prepared for the departmental administrator training/review session covering all
changes from February 12, 2026 through June 2026.*
