# User Activity Overhaul — July 2026

(Previous plan archived at tasks/archive-2026-06-codebase-cleanup.md)

## Initial Diagnosis
- Rollups only update via a manual "Rebuild rollups" button; opening the console shows stale data.
- `UserActivityPage.jsx` (1,793 lines) mixes Firestore rollup plumbing with UI, and uses an
  off-brand design language (slate/stone/emerald, `rounded-[2rem]`, `font-black`, tracking-heavy
  eyebrows) instead of the app design system (baylor-green, university-card/table, Badge, .btn-*).
- Only `tutorial_completed` is instrumented, so "Top Actions" panels are empty.
- Dead Cloud Functions rollup code existed in `functions/index.js` (Spark plan can't run scheduled
  functions; the browser rollup is the intentional path).

## Plan

### A. Automatic pipeline (no manual intervention, Spark-safe)
- [x] `src/utils/activitySync.js`: auto-sync engine
  - watermark meta doc `userActivityMeta/rollupState` (`coveredThroughDateKey`, `schemaVersion`)
  - on console open: roll up only uncovered past days (usually 0-1 days) automatically
  - schema version bump => automatic full rebuild of the 90-day window (delete + rewrite)
  - today's numbers computed in-memory from today's raw events (always fresh, zero writes)
  - retention: prune raw events older than 180 days in capped batches
- [x] `activityTracking.js`: `setActivityContext` + fire-and-forget `trackAction(actionKey, meta)`
- [x] Instrument semantic actions: import applied, reservation created, PDF export, person
  saved/deleted, dashboard search used (tutorial_completed already exists)
- [x] Firestore rules: `userActivityMeta` owner-only block present; deploy rules before production use
- [x] Remove dead rollup Cloud Functions + `functions/activityAnalytics.js` (keep `deleteUser`)

### B. Better data / insight
- [x] Period-over-period deltas (current range vs prior equal window)
- [x] Weekday x hour heatmap grid + busiest day/hour
- [x] Pages table model (opens, minutes, peak daily users, last used) + per-page drilldown
- [x] New-in-window flag for users; last-seen column

### C. Professional UI matching the app
- [x] Rebuild page with `university-header` hero, HubTabs (Overview / Users / Pages / Live /
  Tutorials), university-card sections, Badge statuses, .btn-* buttons, SortableHeader tables
- [x] Split into `src/components/administration/user-activity/` subcomponents
- [x] Filters: user search + role filter; page search + section filter; timeline event-type filter
- [x] Drilldowns via shared Modal; CSV export for users and pages

### D. Verification
- [x] Unit tests: sync planning, analytics model additions, page render/tab tests
- [x] `npm test` green; production build passes

## Review
- Activity rollup utilities moved from the Cloud Functions package into `src/utils`, with the browser
  owner console now responsible for Spark-safe incremental rollups and retention pruning.
- The User Activity page is split into focused Overview, Users, Pages, Live, and Tutorials tabs with
  app-native styling, drilldowns, filters, and CSV export.
- Semantic action tracking is wired through the activity context and data-change logging so Top
  Actions is no longer dependent only on tutorial completions.
- Verified on July 2, 2026 with `npm test -- --run`, `npm run lint`, and `npm run build`.
