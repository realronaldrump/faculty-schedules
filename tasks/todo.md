# User Activity Overhaul — July 2026

(Previous plan archived at tasks/archive-2026-06-codebase-cleanup.md)

## Diagnosis
- Rollups only update via a manual "Rebuild rollups" button; opening the console shows stale data.
- `UserActivityPage.jsx` (1,793 lines) mixes Firestore rollup plumbing with UI, and uses an
  off-brand design language (slate/stone/emerald, `rounded-[2rem]`, `font-black`, tracking-heavy
  eyebrows) instead of the app design system (baylor-green, university-card/table, Badge, .btn-*).
- Only `tutorial_completed` is instrumented, so "Top Actions" panels are empty.
- Dead Cloud Functions rollup code exists in `functions/index.js` (Spark plan can't run scheduled
  functions; the browser rollup is the intentional path).

## Plan

### A. Automatic pipeline (no manual intervention, Spark-safe)
- [ ] `src/utils/activitySync.js`: auto-sync engine
  - watermark meta doc `userActivityMeta/rollupState` (`coveredThroughDateKey`, `schemaVersion`)
  - on console open: roll up only uncovered past days (usually 0-1 days) automatically
  - schema version bump => automatic full rebuild of the 90-day window (delete + rewrite)
  - today's numbers computed in-memory from today's raw events (always fresh, zero writes)
  - retention: prune raw events older than 180 days in capped batches
- [ ] `activityTracking.js`: `setActivityContext` + fire-and-forget `trackAction(actionKey, meta)`
- [ ] Instrument semantic actions: import applied, reservation created, PDF export, person
  saved/deleted, dashboard search used (tutorial_completed already exists)
- [ ] Firestore rules: `userActivityMeta` owner-only block (needs deploy)
- [ ] Remove dead rollup Cloud Functions + `functions/activityAnalytics.js` (keep `deleteUser`)

### B. Better data / insight
- [ ] Period-over-period deltas (current range vs prior equal window)
- [ ] Weekday x hour heatmap grid + busiest day/hour
- [ ] Pages table model (opens, minutes, peak daily users, last used) + per-page drilldown
- [ ] New-in-window flag for users; last-seen column

### C. Professional UI matching the app
- [ ] Rebuild page with `university-header` hero, HubTabs (Overview / Users / Pages / Live /
  Tutorials), university-card sections, Badge statuses, .btn-* buttons, SortableHeader tables
- [ ] Split into `src/components/administration/user-activity/` subcomponents
- [ ] Filters: user search + role filter; page search + section filter; timeline event-type filter
- [ ] Drilldowns via shared Modal; CSV export for users and pages

### D. Verification
- [ ] Unit tests: sync planning, analytics model additions, page render/tab tests
- [ ] `npm test` green; production build passes

## Review
(to fill in when complete)
