# Comprehensive Refactor & Cleanup — July 2026

(Previous plan archived at tasks/archive-2026-07-director-canonicalization.md)

Goal: leaner, faster, easier-to-understand codebase. Remove dead/legacy code,
consolidate duplication, and preserve intended behavior while correcting defects
found by the newly tracked regression suite. No intentional appearance changes.

Baseline (verified before changes): 296 tests green (47 files), lint clean
(max-warnings 0), build passes, knip: 24 unused exports + 1 duplicate export.

## Phase 1 — Baseline & Discovery
- [x] Run tests/lint/build baseline (all green)
- [x] knip sweep: 24 unused exports, 1 duplicate export, 1 config hint, 0 unused files/deps
- [x] Verify July director work is complete (remnants only in intentional migration tooling)
- [x] Deep-dive analysis: audited every newly tracked test and its production path

## Phase 2 — Repo hygiene (quick wins)
- [x] Fix .gitignore hiding 25 utils test files from git (stale `src/utils/__tests__/*` rule); tracked tests + sanitized fixtures (verified Jane-Doe data)
- [x] Remove tracked `firestore-debug.log`; ignore it
- [x] Remove empty dirs `api/`, `src/utils/import/legacy/`
- [x] Move stray `src/utils/buildingDirectoryUtils.test.js` into `__tests__/`
- [x] knip.json: remove redundant `src/main.jsx` entry pattern (verified knip still resolves entries)
- [x] package.json: remove placeholder keywords/repository/bugs/homepage metadata
- [x] Fix broken PWA manifest: move it to `public/`, set start_url to "/", and ship correctly encoded 192px/512px PNG icons (verified in dist/)
- [x] Remove dead Firebase Storage artifacts and references: `storage.rules`, `cors.json`, config/build/docs, and dead `deploy:hosting` script
- [x] firestore.rules: add missing `maintenanceReports` rule (historical-baseline apply writes it; write was permission-denied in prod = tool errored at final step)
- [x] README: Storage removed from stack line; fixed duplicated module-map lines
- [x] CLAUDE.md: remove dead `docs/agents/*` references (files never existed; empty dir removed); dedupe `.claude/CLAUDE.md` (was full copy of root; now just unique login info)

## Phase 3 — Dead code removal
- [x] Resolve all 24 knip unused exports (delete or de-export; delete transitively-dead code)
- [x] Fix useHubTabs duplicate export (named + default)
- [x] Remove cascade orphans, including the unused normalized schema module
- [x] Re-run knip until clean

## Phase 4 — Defects exposed by the audit
- [x] Authorization/directors: canonical deny precedence, merged/adjunct migration safety, dangling-assignment removal, manual-review preservation
- [x] Imports: overlapping/contradictory identity handling, ambiguous existing matches, modified-record validation, teaching-conflict wiring, accurate reports
- [x] Legacy cleanup: preserve partial student job and semester-job data before removing mirrors
- [x] CLSS/data contracts: exact-first header matching, Staff surname parsing, canonical default term codes
- [x] Scheduling/data edges: weekend comparisons, mixed physical/virtual rooms, ambiguous PAF name fallback, strict worker dates, corrupted seen-state
- [x] Strengthen misleading regression tests for capacity, director consistency, combined reservation conflicts, and permission mappings

## Phase 5 — Verification
- [x] Full test suite green (335 tests, 48 files)
- [x] Lint clean (max-warnings 0)
- [x] Production build succeeds
- [x] Knip clean
- [x] Firestore rules parse successfully in the emulator
- [x] Final diff/whitespace/debug-marker/orphan sweep clean

## Review
- Audited staged, unstaged, and untracked work, including all 25 newly tracked utility test files and both sanitized fixtures.
- Fixed authorization, migration, import identity, validation, reporting, legacy cleanup, scheduling, location, and PWA issues found by the audit.
- Removed dead Storage/client initialization artifacts, 24 unused exports, one duplicate export, and cascade-dead code; knip is clean.
- Final verification results are recorded in Phase 5 above.
