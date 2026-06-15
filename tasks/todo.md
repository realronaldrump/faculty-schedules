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
- [ ] **H1** firestore.rules: drop `userIsPending()` from `canReadAppData()` so
      pending (self-registered) users can no longer read app data or write the
      temperature collections via the SDK. Remove now-dead `userIsPending()` fn.
- [ ] **H2** firestore.rules: delete the unused `actions` subsystem
      (`userHasDirectAction`/`userHasOverrideAction`/`roleHasAction`/
      `userHasRoleAction`/`userHasAction`) — never referenced by any `allow`.
- [ ] **H3** firestore.rules: delete the dead `overrides.pages` schema
      (`userHasOverridePage`/`userHasOverridePageDeny`); client only writes the
      flat `permissions` map. Update `userHasPage` + `canManagePafWorkflow`.

## Low priority cleanups
- [ ] **L1** Remove dead custom-claim branches from `isAdmin()` in firestore.rules
      and storage.rules (no code sets custom claims; admin is Firestore-role only).
- [ ] **L3/L4** App.jsx: replace inline `normalizeRoles` with shared
      `normalizeRoleList` from authz.js.
- [ ] **L5** Cross-reference the hardcoded owner UID in activityOwner.js,
      firestore.rules, and functions/index.js with comments (can't share a module).
- [ ] **L2** (no-op) rules `get()` cost — negligible at this scale, intentionally
      not restructured.
- [ ] **L6** (re-evaluated, SKIP) `accessControl` false-padding is load-bearing for
      the "new pages need decisions" UX and doc size is trivial — not bloat.
- [ ] **L7** (no-op) free-tier/cost note only.

## Verification
- [ ] firestore.rules compiles (emulator)
- [ ] authz + permissions unit tests green
- [ ] lint clean · build succeeds · full test suite green
- [ ] Manual reasoning: admins keep full access; owner keeps activity pages;
      active staff/faculty unaffected; pending users lose data reads only.

## Review
_(to be filled in after implementation)_
