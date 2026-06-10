# Canonical Data Model

This app now targets canonical storage shapes across imports and UI reads.

## Design Rules

1. Write canonical fields only.
2. Treat legacy mirrored fields as migration targets, not source of truth.
3. Use Data Cleanup & Repairs for legacy cleanup.
4. Run every import through `src/utils/importHygieneUtils.js` before write
   preview or commit. This is the import-time source of truth for
   person/course/schedule/room canonicalization.

## Canonical Schedule Fields (Key Examples)

- `courseCode`
- `section`
- `crn`
- `term`
- `termCode`
- `courseTitle`
- `instructorId`
- `instructorIds`
- `instructorAssignments`
- `spaceIds`
- `spaceDisplayNames`

Legacy examples that should be removed by hygiene:

- `Course`
- `Section #`
- `CRN`
- `Term`
- `Course Title`
- `Instructor`
- `Room`

## Canonical Person Fields (Key Examples)

- `firstName`
- `lastName`
- `roles` (array)
- `externalIds` (object for IDs like `baylorId`, `clssInstructorId`)
- `identityKey`, `identityKeys`, `identitySource` (import identity metadata)
- `jobs` (for student worker role details)
- `primaryBuildings`
- `weeklySchedule`

Legacy examples that should be migrated/removed:

- top-level `clssInstructorId`
- top-level `baylorId` without `externalIds`
- top-level mirrored student fields when `jobs` exists:
  - `jobTitle`, `supervisor`, `supervisorId`, `hourlyRate`

## CLSS Canonical Import Contract

CLSS CSV parsing normalizes rows to a canonical contract in:

- `src/utils/import/clss/normalize-row.js`

And profile-driven parsing in:

- `src/utils/import/clss/parse-clss-file.js`

Profile source:

- `src/config/import/clss/default-profile.json`

## Import Identity Contract

- Schedules/sections are matched by `clss`, `crn`, `section`, then composite
  meeting/room identity.
- People are matched by Baylor ID, CLSS instructor ID, then email. Name-only
  matches are review context, not automatic create/merge authority.
- Courses are upserted by deterministic canonical `courseCode` document ID.
- Rooms are upserted by canonical `spaceKey` document ID.
- Re-importing the same semester should update canonical records or no-op; it
  should not create new records for entities already represented by an identity
  key.

## Migration/Cleanup Path

Run Data Cleanup & Repairs:

- `src/components/administration/data-cleanup/DataCleanupRepairsPage.jsx`

“Fix safe issues” now runs full canonicalization (not just duplicates):

- legacy mirror cleanup
- standardization pass
- instructor ID backfill
- duplicate merge and location repair

It reports `legacyModelIssues` and can auto-fix canonical migrations through:

- `src/utils/dataHygiene.js`
