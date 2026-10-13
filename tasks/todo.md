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
