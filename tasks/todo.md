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
