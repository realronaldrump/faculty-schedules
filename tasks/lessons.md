# Lessons

## Oct 2026 — "fixed" student saves that stayed broken for an admin

- **Never deploy rules ahead of the data migration they assume.** `hasNoLegacyDirectorFlag()`
  was deployed while 16 people docs still carried `isUPD`; every edit to those records was
  denied for everyone, including admins. If a rule depends on cleaned data, run (and verify)
  the cleanup in production first.
- **Rules that validate the whole document block unrelated edits.** On update,
  `request.resource.data` is the full post-write document, so a stale field the user never
  touched fails the write. Keep rules to access control; validate in the app's write path.
- **A permission-denied error is not proof the user lacks permission.** Check the user's
  profile *and* the target document before assuming roles are the cause.
- **Tests that mock `updateDoc` never exercise the rules.** A save fix needs a rules-emulator
  test (`npm run test:rules`) or an emulator E2E against a copy of the failing record.
- **Surfacing an error is not fixing it.** Commit 66a9868 replaced a silent failure with a
  visible one; reproduce the user's exact record before declaring a save bug fixed.
- **Resumable tutorials must handle closed UI.** Saved progress can point at a step whose
  target only exists inside a window that is no longer open; recovery must offer a way back.
