# Comprehensive Codebase Review & Cleanup — June 2026

Goal: remove dead code/bloat, fix bugs, improve data architecture and maintainability across the app.

## Phase 1 — Baseline & Discovery
- [x] Run test suite, lint, and build to establish baseline (1 failing test, 1 lint error found)
- [x] Map architecture: contexts, data flow, routing
- [x] Run dead-code analysis (knip + custom classifier; 203 unused exports found)
- [x] Identify duplicated/conflicting utilities

## Phase 2 — Dead Code & Bloat Removal
- [x] data-hygiene/core.js folded into utils/dataHygiene.js (shim removed)
- [x] importTransactionUtils.js barrel removed; consumers import from import/core directly
- [x] dataImportUtils.js: removed dead import processors (−1391 lines)
- [x] dataAdapter.js: removed dead fetchers/analytics/resolvers (−391 lines)
- [x] canonicalSchema.js: removed dead schemas/validators/mergers (−559 lines)
- [x] firebase.js: removed dead firestoreUtils/errorHandler/validation/perf utils + dev window block
- [x] ~37 more files: unused exports deleted or de-exported (batch codemod)
- [x] knip.json added (functions entry, tests as entries) for future hygiene
- [ ] Second knip pass for cascade orphans
- [ ] TEST_ONLY production-dead code decision (parseCLSSCSV, createScheduleModel, …)
- [ ] Remove unused npm dependencies

## Phase 3 — Bug Fixes & Correctness
- [x] Fixed: empty import-scope cleanup bug in dataHygiene (hasScopedRecordIds([]) treated as unscoped → could merge across entire DB)
- [x] Fixed: failing legacyModelCleanup test (now passes)
- [x] Fixed: unused eslint-disable directive (lint clean)
- [ ] Continue bug hunt in contexts/hooks

## Phase 4 — Data Architecture & State Management
- [x] AuthContext: memoized value + canAccess/getAllPageIds/signIn/signUp/signOut (was re-rendering every consumer on every auth render)
- [x] usePermissions: returns memoized object (was new object per call → invalidated DataContext value every render)
- [x] PeopleContext: removed dead CRUD trio + dead derived facultyData/staffData/studentData (computed with empty schedules, never consumed)
- [x] DataContext: removed dead loadData/refreshData orchestrator + localLoading; stabilized loader callback identities (no more churn on data state)
- [x] Verified remaining contexts (UI/AppConfig/Tutorial/Schedule) already memoized
- [x] Audited timers/listeners/subscriptions — no leaks found
- [x] Checked Firestore loops — chunked `in` queries are correct batching, no N+1
- [x] TEST_ONLY dead code removed with tests updated (legacy parseCLSSCSV path, validators, formatters)
- [x] Dependencies: knip reports none unused

## Phase 5 — Verification
- [x] Full test suite green (29 files, 178 tests)
- [x] Lint clean (max-warnings 0)
- [x] Production build succeeds
- [x] knip clean (0 unused files/exports/deps)

## Review

### Bugs fixed
1. **Import-scoped cleanup could touch the whole DB**: `hasScopedRecordIds([])` in `src/utils/dataHygiene.js` treated an empty scope as "unscoped", so post-import entity cleanup for an import that touched zero people/rooms would preview/merge duplicates across the entire database. Empty scope now means "no candidates". (This was also the cause of the one failing test.)
2. **App-wide re-render storm**: AuthContext provided a fresh value object + fresh `canAccess` every render; `usePermissions()` returned a fresh object per call and is spread into DataContext's value — so any AuthProvider render invalidated every `useAuth`/`useData` consumer. Whole chain memoized.
3. Unused eslint-disable directive failing `--max-warnings 0` lint.

### Dead code removed (~3,900 lines)
- `src/utils/data-hygiene/core.js` folded into `src/utils/dataHygiene.js` (shim + 1-file directory eliminated)
- `src/utils/importTransactionUtils.js` barrel deleted; consumers import `utils/import/core` directly
- `dataImportUtils.js` 2058→~600 lines (legacy processDirectory/ScheduleImport pipeline, parseCLSSCSV wrapper, etc.)
- `dataAdapter.js` −391, `canonicalSchema.js` −559 (unused schemas/validators/mergers), `firebase.js` dead util objects + dev window globals
- PeopleContext dead CRUD + dead derived data; DataContext dead orchestrator
- ~40 more files: unused exports deleted or de-exported; unused default exports removed
- Test theater deleted (skipped placeholders, tautological asserts in importLifecycleUtils.test)
- Stale doc references updated (README, IMPORT_MAINTENANCE, CANONICAL_DATA_MODEL, HANDOFF_RUNBOOK)

### Tooling
- `knip.json` added — `npx knip@5` now runs clean; `functions/index.js` is an entry; tests count as entries; `activityRollup.cjs` ignored (CJS default-import false positive; intentional share-by-copy with functions/activityAnalytics.js)

### Noted, intentionally not changed
- `src/utils/activityRollup.cjs` is a byte-identical copy of `functions/activityAnalytics.js` (deployment isolation for Cloud Functions); keep in sync when editing either
- `usePeopleOperations` (1200 lines) is the single person/program CRUD path — further decomposition possible but working and tested
- `eslint no-unused-vars` is off; enabling it would guard against future dead code accumulation

---

# Tier-1 Tutorials — June 2026

Goal: add the 4 essential tutorials (Getting Started, Today/Live View, Faculty Schedules, Import Wizard) using the existing tutorial engine. Interactive hands-on where safe; Import is walkthrough-only (data-mutating). Plan: `~/.claude/plans/glimmering-chasing-garden.md`.

## A — data-tutorial anchors
- [x] Dashboard.jsx (help-button, global-search, search-results, explore-sections, shortcuts, first SectionCard: section-card + pin-button via isFirst prop)
- [x] LiveView.jsx (asof-control, faculty-finder, explore-button, today-schedule) — dropped asof-popover anchor (popover closes on Next; explanation folded into asof-control step)
- [x] FacultyHub.jsx (faculty-tab-{compare,availability,meetings} via dynamic template)
- [x] FacultySchedules.jsx (faculty-search, day-toggles, compare-grid)
- [x] IndividualAvailability.jsx (availability-search) — dropped availability-results anchor (conditional render risk)
- [x] GroupMeetings.jsx (meeting-professors, meeting-duration, meeting-results)
- [x] ImportWizard.jsx (import-stepper, upload-dropzone, import-history)

## B — tutorial configs (TutorialContext.jsx)
- [x] getting-started (9 steps, Getting Started)
- [x] today-live-view (7 steps, Getting Started)
- [x] faculty-schedules (11 steps across 3 tabs, Scheduling)
- [x] import-clss-data (8 steps, Administration, walkthrough only — zero required actions)

## C — TutorialPage.jsx
- [x] Add "Getting Started" → Lightbulb in categoryIcons
- [x] Update Coming Soon chips (drop fulfilled Faculty Schedules + Data Import)

## Verification
- [x] npm run lint clean
- [x] npm run build succeeds
- [x] npm test green (30 files, 181 tests)
- [x] Static reconciliation: every referenced target has a matching anchor
- [ ] Manual click-through (needs authenticated session + Firestore data — left for user)

## Review

### What shipped
- 4 new tutorials (5 → 9 total). Getting Started + Today are new "Getting Started" category; Faculty Schedules + Import fulfil 2 of 3 "Coming Soon" promises.
- ~20 `data-tutorial` anchors added across 7 components; no changes to the overlay engine, routing, or nav.
- Format per user: tutorials 1–3 use required `click`/`input` steps on real controls (safe hands-on); Import is a pure read-only walkthrough (data-mutating).

### Engine quirks discovered (drove the design)
- `requiresViewMode`/`requiresExpanded` config keys are **inert** — nothing reads them. `step.position` is also inert (overlay auto-positions). Multi-view flows work only because (a) a required `click` targets the tab/control and (b) the next step's target exists only after the view renders; 500ms polling re-acquires it.
- `ClickBlockerFrame` leaves **only the spotlighted element** clickable, so "switch tab" steps must target the tab button.
- LiveView as-of popover and the faculty/availability pickers close on outside `mousedown` → a follow-up step can't target their contents (closes when the user clicks "Next"). Folded those explanations into the trigger step instead.
- `<details>` keeps collapsed children in the DOM with a 0-size rect → Getting Started expands the first section (required click) before targeting the pin star inside it.

### Known limitation (consistent with existing tutorials)
- Tutorial cards aren't permission-gated. A non-admin who starts "Importing CLSS Data" lands on the route-protected Import Wizard (blocked message) with the overlay floating over it. Matches the pre-existing un-gated pattern; gating would be a new feature beyond scope.

---

# Tutorial Audit & Fixes — June 2026

Reviewed all 9 tutorials for broken/outdated steps.

### Bug fixed
- **Temperature Monitoring**: `daily-table`, `import-section`, `settings-section` steps relied on the inert `requiresViewMode` key with no click to switch views (default view is `floorplan`), so they spotlighted nothing; the "data-views" step said "click *a* view" (could land anywhere). Fixed by adding dynamic per-tab anchors in `monitoring/ViewTabs.jsx` (`view-tab-${id}`, `action-tab-${id}`) and inserting required-click navigation steps (open Daily → table; open Import → panel; open Settings → panel). 11 → 15 steps, now fully walks the page.

### Cleanup
- Removed the inert `requiresViewMode` (×3) and `requiresExpanded` (×1, email-lists) keys — they never gated anything and were misleading.

### Reviewed, left as-is (not defects)
- People Directory: two steps both spotlight `directory-content` (progressive overview → row-click); acceptable.
- JobCard `building-selector` anchor is unused by any tutorial (harmless).
- `step.position` / `validationTarget` keys are inert but a harmless documented convention; left in place.

### Verification
- [x] All 69 targets across 9 tutorials resolve to real anchors (incl. conditional-spread + dynamic templates)
- [x] lint clean · build succeeds · 181 tests green

---

# Auth / Access Control Hardening & Cleanup — June 2026

Goal: close the pending-user data-exposure hole and strip dormant auth machinery
left over from the abandoned department-wide rollout. Scope chosen by owner:
H1–H3 + low-priority cleanups. Role model stays as-is (Option B / conservative —
staff/faculty retained for a possible future viewer).

## High priority
- [x] **H1** firestore.rules: dropped `userIsPending()` from `canReadAppData()` so
      pending (self-registered) users can no longer read app data or write the
      temperature collections via the SDK. Removed now-dead `userIsPending()` fn.
- [x] **H2** firestore.rules: deleted the unused `actions` subsystem
      (`userHasDirectAction`/`userHasOverrideAction`/`roleHasAction`/
      `userHasRoleAction`/`userHasAction`) — never referenced by any `allow`.
- [x] **H3** firestore.rules: deleted the dead `overrides.pages` schema
      (`userHasOverridePage`/`userHasOverridePageDeny`); updated `userHasPage` +
      `canManagePafWorkflow`. Client only ever wrote the flat `permissions` map.

## Low priority cleanups
- [x] **L1** Removed dead custom-claim branches from `isAdmin()` in firestore.rules
      and storage.rules (no code sets custom claims; admin is Firestore-role only).
- [x] **L3/L4** App.jsx: replaced inline `normalizeRoles` with shared
      `normalizeRoleList` from authz.js.
- [x] **L5** Cross-referenced the hardcoded owner UID in activityOwner.js,
      firestore.rules, and functions/index.js with comments.
- [x] **L2** (no-op) rules `get()` cost — negligible at this scale, intentionally
      not restructured.
- [x] **L6** (re-evaluated, SKIP) `accessControl` false-padding is load-bearing for
      the "new pages need decisions" UX and doc size is trivial — not bloat.
- [x] **L7** (no-op) free-tier/cost note only.

## Verification
- [x] firestore.rules compiles (emulator started + ran script → rules compiled)
- [x] authz + permissions unit tests green
- [x] lint clean · build succeeds · full test suite green (30 files, 181 tests)
- [x] Manual reasoning: admins keep full access; owner keeps activity pages;
      active staff/faculty unaffected; pending users lose data reads only.

## Review

### What changed
- **H1 (security):** `canReadAppData()` is now `isAdmin() || userIsActive()`. Pending,
  self-registered accounts can no longer read any app collection or write the
  `temperature*` collections via the SDK — they retain access only to their own
  `users/{uid}` doc. Dead `userIsPending()` helper removed.
- **H2/H3 (dead code):** removed the entire `actions` authorization subsystem (~50
  lines) and the `overrides.pages` schema — neither was reachable (no `allow` rule
  referenced actions; the client only writes the flat `permissions` map).
- **L1:** `isAdmin()` in both rules files is now just `isSignedIn() && userHasAdminRole()`;
  the `request.auth.token.admin` custom-claim branches were dead (no code ever calls
  `setCustomUserClaims`).
- **L3/L4/L5:** App.jsx uses the shared `normalizeRoleList`; owner UID is now
  comment-cross-referenced in its three locations.

net: firestore.rules ~95 lines smaller, no behavior change for admins/active users.

### Risk / behavior
- Admins: unchanged (full access). Owner: unchanged (activity pages). Active
  staff/faculty: unchanged. Disabled: unchanged (no access). Pending: lose data
  reads (intended). AuthContext's `settings/accessControl` listener handles the
  resulting permission-denied gracefully (error callback sets defaults).

### NOT YET LIVE — deploy required
Rules changes only take effect after deploy. The H1 fix is a real hole until then:
- `npm run deploy:firestore`  (firestore rules + indexes)
- `firebase deploy --only storage`  (storage rules)
Owner to run/authorize. No Cloud Functions changes needed (only a comment edit).

---

# Tutorial Progress Persistence + Admin Visibility — June 2026

Goal: make tutorial progress reliable/persistent/account-scoped, give the activity owner visibility into completion, stay on Firebase free tier.

## Problem (verified)
- Completion was stored ONLY in localStorage (`completedTutorials`), browser-scoped not user-scoped → leaked across users on a shared browser, no cross-device sync, lost on a different device.
- In-progress step was in-memory React state only → a hard refresh dropped it; no "started/partial" record ever existed.
- Admin visibility was impossible (no server-side record at all).

## Plan
- [x] Add `tutorialProgress/{uid}` Firestore data layer (`src/utils/tutorialProgress.js`): subscribe + start/step/complete/reset + admin fetch.
- [x] Migrate `TutorialContext` to Firestore as source of truth: subscribe on login, derive `completedTutorials`, persist start/step(debounced)/complete, emit `tutorial_completed` activity event, reset clears server doc. Drop localStorage completion store (kept showTooltips/dismissedHints as device prefs).
- [x] `TutorialPage`: resume support — "In progress" badge, step progress bar, "Resume · Step X of N" button; start at saved step.
- [x] `UserActivityPage`: owner-only "Tutorial completion" section — user × tutorial matrix (✓ / step x/N / –) + summary metrics, fed by a single `tutorialProgress` collection read.
- [x] Firestore rules: `tutorialProgress/{userId}` readable by self or activity owner, writable by self only.
- [x] Update `UserActivityPage.test.jsx` read-count expectation (6 → 7).

## Review / Results
- All 181 tests pass; lint clean on changed files; `vite build` succeeds.
- Fixes every loss scenario except offline-then-hard-refresh (Firestore SDK queues writes in-memory; IndexedDB persistence intentionally left off to keep the change scoped — noted as optional follow-up).
- Cost: tiny per-user keyed writes (start/complete + debounced step) and one small collection read for the admin grid → comfortably within Spark free tier.
- ACTION REQUIRED by owner: deploy rules before the feature goes live — `npm run deploy:firestore` (or `firebase deploy --only firestore:rules`). Until deployed, progress writes are denied and the admin section stays empty.

## Known/au follow-ups (not in scope)
- Overlay traps the screen if the user navigates off the target page mid-tutorial (pre-existing). Consider a grace-period guard before full-screen blocking.
- Optional: enable Firestore IndexedDB persistence to survive offline + refresh.

---

# User Activity — comprehensive review & improvements — June 2026

Scope: owner User Activity console + the tracking core. Free-tier (Spark)
Firestore is the binding constraint, so every change minimizes reads/writes.
Deliberately NOT doing broad cross-app semantic-action instrumentation
(minimal-impact; would touch many feature files for marginal gain).

## Bugs / dead code
- [x] Rewrite `formatActivityRebuildError` — drop the `functions/not-found` and
      `functions/permission-denied` branches (rebuild is browser-side now; those
      can never fire). Map real failures: `permission-denied`, quota
      (`resource-exhausted`).
- [x] Fix inaccurate hero copy ("computed directly from raw activity events").
- [x] Remove dead `firebase/functions` / `httpsCallable` mocks from the page test.

## Reliability (free-tier safe)
- [x] Pause the 60s live auto-refresh while the tab is hidden; refresh on return.
- [x] Add a visibility-gated presence heartbeat (presence-only write, ~90s) so
      "Active now" reflects users who linger on a page, not just navigators.

## Power / UX
- [x] Data-freshness chip: "Rollups updated <relative>" from latest `generatedAt`.
- [x] CSV export of the per-user table (client-side, no Firestore cost).
- [x] Empty-state nudge pointing the owner at "Rebuild rollups".

## Verify
- [x] `vitest run` full suite green (34 files, 206 tests — +1 new page test).
- [x] lint clean on changed files (`--max-warnings 0`).
- [x] `npm run build` clean.

## Review

### What changed
- **activityTracking.js** — extracted `buildPresenceBase` and added `touchPresence`
  (presence-only upsert, no event row). `logUserActivityEvent` now reuses the base.
- **useUserActivityTracker.js** — added a visibility-gated presence heartbeat
  (~90s) so "Active now" reflects users who linger, not just navigators. Pauses
  when the tab is hidden; fires once on return. Same `canAccess` gate as events.
- **UserActivityPage.jsx**
  - `formatActivityRebuildError`: dropped the dead `functions/*` branches (rebuild
    is 100% browser-side on the free tier) → maps `permission-denied` + quota
    (`resource-exhausted`) to actionable copy.
  - Live auto-refresh is now visibility-gated (no idle read burn).
  - Accurate hero copy (on-demand rollups, not "computed directly from events").
  - "Rollups updated <relative>" freshness line from the newest `generatedAt`.
  - Client-side CSV export of the per-user table (zero Firestore cost).
  - Empty-state nudges the owner to "Rebuild rollups".
- **UserActivityPage.test.jsx** — removed dead `firebase/functions`/`httpsCallable`
  mocks; added a test for the freshness + disabled-export empty state.

### Free-tier cost impact
- Reads: net **down** — the live console no longer polls while hidden.
- Writes: heartbeat adds ≤1 presence upsert / 90s / *visible* authenticated tab
  (no event rows, no storage growth in `userActivityEvents`). Negligible vs. the
  20k/day Spark write quota for this user base.

### Deliberately not done (minimal-impact)
- Broad semantic-action instrumentation across feature files (import/save/search/
  export). The "Top Actions" panels stay sparse (only `tutorial_completed` is
  emitted today). Wiring more would touch many unrelated components for marginal
  gain — left as a scoped follow-up if desired.
- Switching rebuild back to the Cloud Function: intentionally browser-side to
  avoid relying on scheduled/callable functions on the free tier.
