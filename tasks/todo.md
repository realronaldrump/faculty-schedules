# Program Director Canonicalization + GPD Support — July 2026

(Previous plan archived at tasks/archive-2026-07-user-activity-overhaul.md)

## Root cause (audit findings)
UPD assignments live in THREE disconnected places, written non-atomically:
1. `people/{id}.isUPD` boolean (directory badges/filters read ONLY this)
2. `programs/{id}.updIds` array (+ legacy singular `updId`)
3. Implicit `person.programId === program.id` coupling — the Programs page only
   shows a UPD when ALL THREE agree.

Divergence sources: two-doc non-atomic writes in `ProgramManagement.jsx`
(`handleSetUPD`/`handleRemoveUPD`); `deletePersonSafely` never cleans `updIds`;
`mergePeople` never remaps `updIds`; drag-moving faculty to another program
silently breaks the program-page display condition while the directory badge
stays; admin export "unions" both sources as a workaround; `isUPD` used as a
faculty-proxy in `dataAdapter` + `supervisorUtils`; hard 2-UPD cap in UI.

## Canonical model
`programs/{id}.directors = [{ personId, role }]`, role ∈ `'upd' | 'gpd'`
(typed constants in `utils/directorAssignments.js`). Single source of truth;
every consumer derives via `buildDirectorIndex(programs)`. All mutations are
single-program-doc updates → inherently atomic. Duplicate (personId, role)
prevented by the single write path + normalization on read. No person-side
flags. No count caps (multi-UPD/GPD supported); adjunct-ineligibility kept;
same person may hold UPD+GPD for one program; cross-program directing allowed.

## Migration reconciliation (deterministic)
For each program P, UPD candidates = P.updIds ∪ [P.updId] ∪
{people with isUPD===true and programId===P.id}.
- id in updIds & person exists (follow `mergedInto`) → migrate (report source)
- isUPD-only + valid programId → migrate ("directory flag + membership")
- isUPD-only, no resolvable program → manual-review list (reported, not silently
  dropped)
- updIds id with no person doc → orphaned (reported, dropped)
Cleanup in same apply: delete `updIds`/`updId` from all programs, `isUPD` from
all people, chunked batched writes. Preview (dry-run) before apply, in Data
Cleanup → Rare Repair Tools.

## Tasks
- [x] Audit all read/write/display sites (complete — list above)
- [ ] `utils/directorAssignments.js` — model: roles, normalize, add/remove,
      index, filter/label helpers
- [ ] `utils/directorMigration.js` — pure plan builder + preview/apply
- [ ] `hygieneCore.js` — drop isUPD from DEFAULT_PERSON_SCHEMA; standardizePerson
      strips legacy `isUPD`
- [ ] `dataAdapter.js` — inject `directorAssignments` (faculty+staff), drop isUPD
- [ ] `DataContext.jsx` — expose `directorIndex`
- [ ] `usePeopleOperations.js` — `handleDirectorToggle` (assign/remove w/
      validation); program create seeds `directors: []`
- [ ] `ProgramManagement.jsx` — "Programs & Directors": grouped UPD/GPD display,
      one manage UI with role toggles, cross-program assign, empty states
- [ ] `configs-core.jsx` — director filter (all/upd/gpd/any/none), badges,
      "Directors first" pin, faculty CSV directors column
- [ ] `EmailLists.jsx` + `email-lists/export-utils.js` — filter/badges/sort/CSV
- [ ] `FacultyContactCard.jsx`, `BuildingDirectory.jsx` — canonical badges
- [ ] `supervisorUtils.js` + callers — director-aware candidate check
- [ ] `adminExportData.js`/`adminExportSchemas.js` — directors columns (people +
      programs sheets)
- [ ] `dataHygiene.js` — deletePersonSafely/mergePeople director cleanup;
      legacy isUPD/updIds detection in scan
- [ ] `useDataCleanupActions.js` + `RareRepairToolsSection.jsx` — migration
      preview/apply UI
- [ ] `permissions.js`, `navigationConfig.js`, `PeopleHub.jsx` — naming
- [ ] `firestore.rules` — directors list validation + reject legacy fields
      (deploy AFTER running migration)
- [ ] Tests: model, migration, cross-view consistency regression, legacy guard,
      export schema updates
- [ ] Run vitest, eslint, build; fix all failures
- [ ] Post-implementation grep for legacy remnants (isUPD/updIds/UPD-singular)

## Review
(to fill in when done)

---

# What's New changelog (in-app release notes) — July 2026

Non-obtrusive "What's New" feature: a small dismissible card appears bottom-right
on the first visit after a release; a header Sparkles button (with unseen dot)
reopens the full release-notes modal anytime. Content ships with the app as a
static versioned data module (no Firestore reads/rules — release notes describe
deploys, so they belong in the deploy). Seen-state = localStorage
`whatsNewLastSeenVersion` (same pattern as pinned pages).

## Tasks
- [x] `src/utils/whatsNew.js` — versioned releases data (v1 = director overhaul
      + Baylor ID cleanup, timestamped), seen-state helpers, local-time formatter
- [x] `src/hooks/useWhatsNew.js` (+ barrel export) — unseen detection, delayed
      toast visibility, open/dismiss/mark-seen state machine
- [x] `src/components/WhatsNew.jsx` — `WhatsNewToast` (bottom-right card,
      brand accent, slide-up) + `WhatsNewModal` (shared Modal, release timeline)
- [x] `src/App.jsx` — wire hook; header Sparkles button with unseen dot; mount
      toast + modal; `trackAction("whats_new_opened")`
- [x] `src/utils/__tests__/whatsNew.test.js` — data invariants + seen-state logic
- [x] Run vitest (7/7 pass), eslint (clean), build (passes)
- [ ] Verify in browser — BLOCKED on Firebase auth limits (couldn't sign in).
      Manual walkthrough: sign in → toast slides in bottom-right after 1.5s →
      "See what's new" opens modal → header Sparkles dot clears → reload shows
      no toast; clear `whatsNewLastSeenVersion` in localStorage to replay.

## Review
Static versioned data module (release notes describe deploys, so they ship in
code — no Firestore reads/rules). Seen-state in localStorage. To publish v2:
prepend an object in `src/utils/whatsNew.js` RELEASES. Toast delayed 1.5s,
bottom-right (Notification owns top-right), dismiss/open both acknowledge.
Modal reachable forever via header Sparkles button; opening logs a
`whats_new_opened` activity event. Added `dev-alt` (port 5273, strictPort)
launch config for parallel-session previews.
