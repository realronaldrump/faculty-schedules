# Canonical Data Model

This app now targets canonical storage shapes across imports and UI reads.

## Design Rules

1. Write canonical fields only.
2. Treat legacy mirrored fields as migration targets, not source of truth.
3. Use Data Cleanup & Repairs for legacy cleanup.

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

## Migration/Cleanup Path

Run Data Cleanup & Repairs:

- `src/components/administration/data-cleanup/DataCleanupRepairsPage.jsx`

“Fix safe issues” now runs full canonicalization (not just duplicates):

- legacy mirror cleanup
- standardization pass
- instructor ID backfill
- duplicate merge and location repair

It reports `legacyModelIssues` and can auto-fix canonical migrations through:

- `src/utils/data-hygiene/core.js`
