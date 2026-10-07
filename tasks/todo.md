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
- [ ] Deploy rules + push client
- [ ] Post-deploy: delete users.roles/permissions, settings/accessControl, terms.locked

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
