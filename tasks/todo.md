# UI polish pass — Oct 14–16 2026 (implemented Oct 16; not committed)

Review method: shell/global CSS read by hand; five read-only Haiku audits (design system,
feedback states, copy, tables/search, calendars) with every claim below re-checked in code;
live walkthrough on the emulator with synthetic data (24 sections, 12 faculty, 9 rooms,
8 students, 3 staff) at 1280px and 375px. (B) = seen in the browser, (C) = confirmed in code.

## 1. Navigation and shell (felt on every page)
- [x] Scroll to top on page change; the window keeps its old scroll position (B) — `App.jsx`
- [x] Per-page tab titles ("Rooms · HSD Dashboard"); every tab says the same thing (C)
- [x] Active sidebar item sits ~24px left of its siblings: `.nav-sub-item-active`
      `-ml-6 pl-6` vs `.nav-sub-item` `ml-4 px-4` (B) — `index.css:422-427`
- [x] One section-highlight rule: People/Scheduling/Courses parents turn solid green on child
      pages, Home/Administration don't (depends on id matching the URL); up to 3 stacked
      highlights (B) — `Sidebar.jsx` `isActive(item.path || item.id)`
- [x] Sidebar icons stay gray on hover (`group-hover:` with no `group`) (C) — `Sidebar.jsx:229`
- [x] Pin star: show filled when pinned, reveal on keyboard focus (C) — `Sidebar.jsx:314`
- [x] Collapsed sidebar: hover labels appear mid-screen in a fallback font (no
      `position:relative`, `'DM Sans'` not loaded); expand button clipped; section icons do
      nothing; X icon for "collapse" (B) — `Sidebar.jsx:140-153, 213, 380-420`
- [x] Phone menu: × is a no-op (`onToggleCollapse={() => {}}`), Esc doesn't close (B) — `App.jsx:203`
- [x] Phone breadcrumb shows a dangling "/ Directory" (B) — `App.jsx:239`
- [x] Toasts sit on top of the header's semester picker / What's New / Logout (B) — `.notification`
- [x] Unknown URLs (and owner pages for non-owners) show Dashboard but keep the bad URL (C) — `PageRouter.jsx:234`
- [x] Route error screen says "Page update needed" for every crash, not just stale files (C) — `PageRouter.jsx:69-72`

## 2. Loading
- [x] Schedule refreshes swap the whole page for "Loading system data…", which unmounts it:
      after a schedule import the wizard resets to step 1 and "4. Results" never shows (B)
      — `PageRouter.jsx` `loading`, `ScheduleContext.jsx:140`, `ImportWizard.jsx:437`
- [x] One loader on first load: green splash (blank until it fades in, +500ms delay) → gray
      "Loading account..." → "Loading system data..." (B) — `index.html:153`, `main.jsx:66`, `PageRouter.jsx:60,138`
- [x] Preconnect to Adobe Fonts instead of Google Fonts (C) — `index.html:19-20`
- [x] One inline spinner (4 styles today: Loader2, 3 border recipes, rotating RotateCcw) (C)

## 3. Notifications and feedback
- [x] A toast that replaces a visible one disappears early (timer not restarted) (C) — `Notification.jsx:7-12`
- [x] Errors stay ~8s and hover pauses; `role="status"`; label the ×; keep its focus ring;
      `whitespace-pre-line` so multi-reason validation keeps its line breaks (C)
- [x] Email Lists' private bottom-right toast (3s, no close, What's New corner) → shared toast (C) — `EmailLists.jsx:639,1930`
- [x] "Copy" Baylor ID gives no feedback (C) — `FacultyContactCard.jsx:672`
- [x] Friendly error copy instead of raw `error.message` (can read "undefined") (C) — `EmailLists.jsx:800`, `usePeopleOperations.js`, `CourseManagement.jsx:155`

## 4. Forms and dialogs
- [x] Form dialogs (Add/Edit Student, preset name) close on a stray backdrop click and lose
      input; no modal sets `closeOnOverlayClick={false}` (C) — `Modal.jsx:15`
- [x] Sign-out: use ConfirmDialog (Esc/backdrop/focus) and one verb: "Sign out" (login says
      "Sign In", account screen "Sign out", header "Logout") (C) — `App.jsx:363`
- [x] Doubled icon gaps (`mr-2`/`ml-2` inside `.btn-*` which has `gap-2`): 26 spots, 7 files (C)
- [x] Autofocus: Faculty picker search (typing does nothing) and the new-person name field (B)
      — `FacultySchedules.jsx:524`, `PersonDirectory.jsx`
- [x] Inline add/edit row: email input 58px, phone 29px at 1280px (B) — `PersonDirectory.jsx:165-245`
- [x] Enter submits the Baylor ID field and preset-name dialog (C)
- [x] Login: "© 2025" hard-coded; ⚠️ emoji error icon; lone shield icon on the Email label (B) — `Login.jsx:186,238,279`

## 5. Tables, search and lists
- [x] Row Edit/Delete/Save/Cancel icon buttons have no tooltip or label (B) — `PersonDirectory.jsx:767-815` (+3 files)
- [x] Course table sort icon never shows direction (same ⇕ both ways) (C) — `CourseBrowser.jsx:474`
- [x] Search: type="search" (clear ×) + aria-label; one placeholder style ("Filter directory...",
      "Search professors..." vs "Search faculty...") (C) — `DirectoryFilters.jsx:19-31`
- [x] "Clear filters" button in filtered-empty states; one empty-state style (C)
- [x] Course Browser search squeezed to ~90px at 1280px (B) — `CourseBrowser.jsx:507`
- [x] Directory card title wraps "(12 / members)" beside the toolbar (B)
- [x] mailto/tel links in directory tables; phone "(254) 710-1001" not "710 - 1001";
      drop the duplicate formatter (C) — `directoryUtils.js:22`, `FacultyContactCard.jsx:30`
- [x] Course count: "Showing 24 of 24 courses" + duplicate footer; "1 of 1 courses" (C)

## 6. Schedules and calendars
- [x] Evening classes run off the Rooms timeline (8 AM–6 PM window; 6–8:45 PM blocks render
      176px past the edge) (B) — `RoomSchedules.jsx:439-440,520-526`
- [x] Rooms "now" line + gold highlight show on any picked date (C) — `RoomSchedules.jsx:504,538`
- [x] Evenings, the Today/Rooms date pickers show tomorrow (`toISOString()` UTC date) (C)
      — `LiveView.jsx:598`, `RoomSchedules.jsx:424,752`
- [x] Rooms filters: Sort By overlaps the Density "Compact" button at 1280px; its icon is
      hidden under the dropdown; "Manage Spaces" underlined by the global link style (B)
- [x] Pluralize: "1 sessions" (B) + ~24 messages like "with 1 contacts" (C) — tiny shared helper
- [x] One time style: axes "9AM" vs "9 AM"; ranges " - " / "-" / " – "; "0h 50m" vs "12.5h" (C)
- [x] Today: "teaching" and "in office" dots are both green (blue-500 is remapped);
      "Students On Duty" vs "Rooms in Use" / "Student Workers On Duty" (C) — `FacultyExplorer.jsx:47,56`, `LiveView.jsx:904-1048`
- [x] Dashboard Explore cards: chevron never rotates (`group-open:` vs `group/card`); opening
      one stretches its neighbor (B) — `Dashboard.jsx:42,385`

## 7. Import Wizard
- [x] Validate step leads with developer diagnostics (profile id, parser confidence, header
      mapping) → plain summary, details collapsed (B) — `ImportWizard.jsx:596`
- [x] Preview: zeros colored gold/red; same warning ×9; "automatic integrity finalization";
      preview table wraps times onto 4–8 lines (B) — `ImportPreviewModal.jsx:1110`
- [x] Optional: "Create all new people" when every match is "No match found" (12 clicks today)

## 8. Copy and visual consistency
- [x] Page titles match sidebar labels: "Room Calendar Export"/"Export to Outlook (.ics)",
      "Student Worker Analytics"/"Student Worker Payroll", "Room Grids"/"Room Grid Generator" (C)
- [x] One ellipsis (147 "..." vs 31 "…"); Title Case buttons ("Clear all" vs "Clear All") (C)
- [x] No emoji in UI copy (🎉 "Nothing flagged.", ⚠️ import delete warning) (C)
- [x] Hover lift only on clickable cards (`.university-card:hover` lifts every card) (C) — `index.css:168`
- [x] `.btn-secondary-sm` matches `.btn-secondary` (gray vs green outline); gaps on -sm variants (C)
- [x] GPD director badge is sky blue (off-brand) → Baylor blue tint (C) — `DirectorRoleBadge.jsx:17`
- [x] Keyboard: clickable rows/blocks are divs/trs (course rows, Today list, schedule blocks) (C)

## Considered and left alone
- Lining/tabular figures: the Adobe kit has no OpenType figures (tested; `tabular-nums` is a
  no-op). It loads only 400/700, so `font-medium` renders regular and `font-semibold` bold.
- Sticky header, modal-based directory editing, Import modal redesign: too noticeable.
- Temperature colors (rose/sky = hot/cold) are semantic; dormant MaintenancePage copy.

## Found while verifying (also done)
- [x] Term refresh after an import recreated `loadSchedules`, so the semester effect ran a
      page-replacing load and the wizard still reset; only a real semester switch shows the
      full-page loader now (`ScheduleContext.jsx`)
- [x] The Results step (now actually visible) led with internal reports; they moved into the
      collapsed "Technical details", with a plain "N schedules added · N people added" line
- [x] Collapsed-sidebar label sat under page content (sticky sidebar = own stacking context);
      rendered in a portal
- [x] Email Lists search was squeezed like Course Browser's; it keeps 18rem and controls wrap
- [x] Sort headers in Course Management and Email Lists use the shared `SortableHeader`
- [x] Base style underlines only plain text links (`a:not([class])`), so button-styled and
      hover-underline links render as designed
- [x] Export file names use the local date too (10 sites); `toLocalISODate` replaced the
      student-only `toStudentWorkerDateString`

## Review
- New shared helpers: `utils/pluralize.js`, `utils/errorMessages.js`
  (`getUserFacingErrorMessage` passes app-written reasons through, swaps Firebase/runtime
  text), `utils/keyboard.js` (`onActivateKey`), `timeUtils` `formatTimeRange` /
  `formatDuration` / `toLocalISODate`, `directoryUtils.getPhoneHref`. 11 unit tests.
- Verified in the emulator (24 sections, 12 faculty, 9 rooms, 8 students, 3 staff) at
  1280px and 375px: splash shows its logo immediately and fades; tab titles per page; scroll
  resets on navigation; sidebar alignment, section tint, icon hover, pin stars, collapsed
  labels/expand/section click; phone menu ×/Esc and breadcrumb; unknown URL → /dashboard;
  sign-out ConfirmDialog (Esc closes); toast below the header (role=alert for errors);
  import: plain validation summary, grouped warning "— 9 rooms", neutral zeros, "Create 12 New
  People", plain footer, Results step shown after apply; Rooms: no filter overlap, visible
  sort icon, 6–8:45 PM classes inside an 8 AM–9 PM grid, now-line only on today, "1 session";
  Course Browser full-width search, sort arrows flip, single count; directory one-line title,
  labeled row buttons, Add Faculty focus + 208/120px email/phone fields, empty search →
  "Clear Search and Filters"; Today labels and blue "in office" dot; picker search focused.
- vitest 525 pass (12 new), lint clean, build clean; knip's 24 unused exports all predate this.
- What's New release 15: one line ("Polish throughout"); releases may now have no highlights.
- Screenshots of the hidden browser pane can be a stale frame (showed a faded splash); a
  second screenshot or DOM check is reliable.

# Sign export: filters — Oct 13 2026

The sign already used the page's filtered shifts, but the dialog had no filter controls and
didn't say filters applied.

- [x] `utils/studentScheduleFilters.js`: page and sign share filter options, semester scope,
      building/job/student filtering, and Mon–Fri shifts (moved out of StudentSchedules)
- [x] Dialog: "Show on the sign" Buildings / Jobs / Students, starting from the page's filters;
      "Use page filters" and "Show everyone"; changes never touch the page
- [x] Title/subtitle follow the sign's filters until edited (single building or single job
      names the title)
- [x] MultiSelectDropdown: portaled menus sized to their trigger instead of the full viewport
      (also fixes the existing office-space pickers)
- [x] Verified: unit + component tests (513 pass), lint, build, knip; emulator with 20
      students: page filter carries in, dialog job filter, reset links, page unchanged

# One-page printable schedule sign — Oct 13 2026

Goal: Export on Student Worker Schedules makes a sign that prints on exactly one page and
can be laminated and hung in an office: Baylor-branded, large legible type, no app chrome.

Problems with the old export: printed the on-screen card (tabs/stats chrome, Classic
truncation), fixed 11in width on an 0.35in-margin page (could spill to page 2), no title,
no brand mark, no paper choice, no preview, tiny type, browser header/footer URLs.

## Code
- [x] `utils/printSheets.js`: iframe print extracted from ExportModal (ExportModal uses it)
- [x] `hooks/useFontEpoch.js`: re-measure once Calluna loads (timeline + sign)
- [x] Timeline: split into `JobLegend` + `TimelineGrid` (explicit layout width, static or
      clickable bars, outlined bars for print) + screen wrapper
- [x] `utils/studentScheduleSign.js`: paper sizes, saved settings, default title/subtitle,
      by-day and by-student grouping, printed text size
- [x] `StudentScheduleSign.jsx`: page-sized sheet (@page size, margin 0, 0.5in safe margin,
      brand mark, gold rule, legend, note, updated date) + fit-to-one-page scaling;
      layouts Timeline / By day / By student
- [x] `StudentScheduleSignDialog.jsx`: settings + live preview + fit readout + Print
- [x] StudentSchedules: Export opens the sign dialog; remove old print-only header/CSS
- [x] Official HSD horizontal brand mark (green) as SVG in `public/brand/`
- [x] What's New release 15; activity label for sign prints

## Verification
- [x] unit tests (sign utils, print util), component test (dialog, layouts, print call)
- [x] vitest, lint, build, knip
- [x] browser (emulator): every layout × paper × orientation fits one page; 10 and 20 students

## Review
- Export now opens "Print a one-page schedule": live preview, three layouts (By day default,
  Timeline, By student), Letter/Legal/Tabloid × landscape/portrait, editable title and
  subtitle (prefilled from term + filters), optional note, and a readout of printed name size
  with specific suggestions when it drops below 8 pt.
- Verified in the emulator: all 18 layout × paper × orientation combinations fit one page with
  10 and with 20 students; print frame holds exactly one page-sized sheet with its @page rule,
  the brand mark loaded, no app chrome, and is removed afterwards.
- Brand: official HSD horizontal green brand mark (from the brand kit PDF, cropped, digital
  Baylor Green #154734), Baylor Green title, University Gold rule, Calluna, 0.5in margins.
- Removed: printing the on-screen card (print-only header, 11in print CSS, ExportModal here).
  ExportModal now shares `printSheets` with the sign.
- vitest 504 pass (17 new), lint, build clean; knip unchanged.

# Student worker Timeline view (opt-in) — Oct 13 2026

Goal: a second calendar mode for Student Worker Schedules that never truncates. Time runs
across, each day is a band, each shift is a bar with the full name + hours. Classic stays the
default; a first-visit popup invites users to try Timeline and says they can switch back.

## Code
- [x] `utils/timeUtils.js`: `formatMinutesCompact` ("9a", "12:30p"); StudentSchedules uses it
- [x] `utils/studentScheduleTimeline.js`: brand job palette + stable job→color map,
      timeline window, day layout (label-aware lane packing, same-student lane reuse),
      view/invite localStorage helpers
- [x] `scheduling/StudentScheduleTimeline.jsx`: ruler, day bands, bars (buttons → contact card),
      legend; % positions so print/export scales; layout capped at print width; min width + x-scroll on phones
- [x] `scheduling/TimelineInviteModal.jsx`: shared Modal, mini preview, Keep Classic / Try Timeline
- [x] StudentSchedules: Classic | Timeline toggle (calendar tab, no-print), persisted per browser;
      invite on first visit; trackAction on change
- [x] What's New release 14 (+ test)

## Verification
- [x] unit tests: layout (no collisions, label sides, lane reuse), colors, storage helpers
- [x] component test: Classic default, invite once, Try Timeline persists, toggle back
- [x] vitest, lint, build, knip vs HEAD
- [x] browser pane against emulator with synthetic students: both modes, invite, 375px, print export

## Review
- Timeline is opt-in: Classic is the default; the first visit shows a one-time invite
  (any close = keep Classic). The View toggle and invite answer persist per browser.
- Verified in the emulator with the 10 students from the screenshot: 30 bars, no
  overflowing or overlapping labels live, at the 11in export width, or at 1800px; the
  page doesn't scroll sideways at 375px (the timeline scrolls inside its frame).
- vitest 487 pass (15 new: layout, preferences, view toggle + invite), lint, build clean; knip
  reports no new unused exports.
- Job colors: Baylor Green and University Gold first, then Baylor Blue and the PMS
  colors already in the app; silver last so a job never looks disabled.

# Scott's blocked saves + stuck tutorial; remove account-level permissions — Oct 2026

(Previous plan archived at tasks/archive-2026-07-comprehensive-refactor.md)

Root causes (confirmed against prod data):
- Student saves: rules `hasNoLegacyDirectorFlag()` rejected any update to a people doc
  still carrying `isUPD` (16/95 docs, incl. Acascia Mata) — for admins too. 66a9868 only
  surfaced the error.
- Tutorial: "Resume · Step 10 of 17" starts at a step whose target only exists inside
  the (closed) Add Student wizard; the paused card offered only Exit.

## Prod data (one-time script, scratchpad)
- [x] Read-only scan: 16 isUPD (all false), no legacy program director fields
- [x] Pre-deploy: strip isUPD, disable 6 staff accounts, set owner status active
- [x] Deploy rules + push client (a2f0970; Vercel success)
- [x] Post-deploy: delete users.roles/permissions, settings/accessControl, terms.locked (verified)

## Code
- [x] firestore.rules → approval + owner only (drop roles/pages/validators/term locks)
- [x] AuthContext isApproved; approval screen in main.jsx before providers
- [x] Delete ProtectedContent, authz, permissions, pageRegistry, AccessControl, functions/
- [x] Strip permission plumbing (nav, sidebar, dashboard, hubs, ops hooks, components)
- [x] Owner-only Accounts page
- [x] Remove semester locking
- [x] Remove telemetry role dimension
- [x] Student modal fixes (totals exclude ended jobs, shared hours math, today default, rate 0, message)
- [x] Directory hours column counts only semester-active jobs
- [x] Tutorial paused card → "Back to step K"; fix people-directory targetPage
- [x] RoomReservations userProfile prefill
- [~] Legacy director migration tooling — kept: it also canonicalizes current
      `programs.directors` lists in the health scan, not only the retired fields
- [x] Docs, What's New, lessons, memory

## Verification
- [x] vitest (468), lint, build; knip unchanged from HEAD (23 pre-existing unused exports)
- [x] rules emulator tests (incl. Scott regression: approved user updates a doc carrying isUPD)
- [x] emulator E2E in browser pane: pending screen, owner approve/disable/re-enable,
      non-owner nav + redirect, Scott's exact edit persists, Resume step 10 → Back to step 3 →
      complete 17/17 with cleanup, Accounts page at 375px

## Review
- The save bug was data + rules, not permissions: Scott was already `admin`. Stripping
  `isUPD` in prod unblocked him immediately; the rules rewrite removes the class of bug.
- Account permissions removed end to end (~2,300 lines deleted). Owner keeps User Activity
  and gains Accounts (approve/disable sign-ups). Six staff-role accounts disabled per owner.
- Not done (deliberately): student update still writes the record's `id` field — reads map
  the Firestore doc id over it, so it is harmless and corrects stale values.

# Tutorial audit + owner progress tracking — Oct 8 2026

- [x] Static audit of all 12 tutorials (two research passes) against component code
- [x] Overlay: lift open dropdown menus above the dim layer during tutorials; treat 0×0
      targets as missing; ignore Escape/arrows while typing or with a dialog open
- [x] Getting Started: Dashboard SectionCard hoisted out of render + controlled open state
      (pinning collapsed every section — where Scott and Davis both stalled)
- [x] Step text/targets fixed across email-lists, room-schedules, people-directory,
      temperature, add-student-worker, today-live-view, faculty-schedules, import,
      room-reservations (blocker), enrollment-capacity, term-comparison
- [x] Deleted never-rendered HELP_HINTS + dismissed-hints state
- [x] Owner view: current step counts + completed/last-opened dates; exit flushes the
      pending step write
- [x] Verified: in-browser runner against an emulator copy of prod data — all 12 tutorials
      complete end to end; owner panel shows the test user's progress exactly; quick-exit
      step persisted. 470 tests, lint, build green.
