# Import Readiness Report — CLSS Spring 2026

## Data model summary
- Collections used by schedule imports:
  - `people`: faculty/staff records with `baylorId`, `externalIds.clssInstructorId`, `roles`, `programId`, `office`.
  - `schedules`: term offerings with `courseCode`, `section`, `crn`, `term`, `termCode`, `meetingPatterns`, `instructorId(s)`, `roomIds`, `roomNames`, `spaceIds`, `locationType`, `isOnline`.
  - `rooms`: physical spaces with `spaceKey`, `buildingCode`, `spaceNumber`, `displayName`, `type`.
  - `courses`: deterministic `courseCode` entries used for catalog/title/credit rollups.
  - `terms`: `term` + `termCode`, `status`, `locked`, `season`, `year`.
  - `programs`, `departments`, `importTransactions`, `settings`, `users` (supporting lookups and access).
- Reference strategy:
  - `schedules → people`: `instructorId`, `instructorIds`, `instructorAssignments`.
  - `schedules → rooms`: `roomIds` (legacy) and `spaceIds` (canonical).
  - `schedules → terms`: `termCode` + `term`.
  - `schedules → courses`: `courseCode` and `courseId` (deterministic).
- Canonical IDs:
  - Schedule doc IDs are currently `termCode_crn` in the import transaction pipeline; canonical schema defines `termCode_courseCode_section` (`generateSectionId`).
  - Person identity uses CLSS ID > Baylor ID > email > exact name match.
  - Rooms/spaces prefer `spaceKey` (`BUILDING:NUMBER`) with legacy `roomKey` still supported.

## Import pipeline trace
- Entry point: `src/components/administration/ImportWizard.jsx` (file upload, parse, preview, commit).
- CSV parsing: `src/utils/dataImportUtils.js#parseCLSSCSV`.
- Preview + commit:
  - `src/utils/importTransactionUtils.js#previewImportChanges` → `previewScheduleChanges`.
  - `src/utils/importTransactionUtils.js#commitTransaction` writes batch updates.
- Normalization/hygiene:
  - `src/utils/hygieneCore.js` (standardize, duplicate detection).
  - `src/utils/dataHygiene.js` (migration/dedupe helpers).
- Location handling: `src/utils/locationService.js` (splitMultiRoom, parseMultiRoom, spaceKey).
- Term handling: `src/utils/termUtils.js`, `src/utils/termDataUtils.js`.
- Read paths:
  - `src/contexts/ScheduleContext.jsx` → `fetchSchedulesByTerm`.
  - `src/utils/dataImportUtils.js#fetchSchedulesByTerm` (relational enrichment).
  - `src/contexts/DataContext.jsx` (flattened `scheduleData` for UI views).

## CSV mapping (Spring 2026)
- `Instructor` → instructor assignments + display name (CLSS IDs parsed from `(ID)` when present).
- `Course`, `Catalog Number`, `Course Title`, `Section #`, `CRN` → schedule identity + course metadata.
- `Term`, `Term Code` → `terms` docs + schedule `term`/`termCode`.
- `Meeting Pattern` / `Meetings` → `meetingPatterns`.
- `Room` → `roomNames`, `roomIds`, `spaceIds`, `spaceDisplayNames`.
- `Inst. Method`, `Schedule Type`, `Status`, `Part of Term`, `Credit Hrs` → schedule metadata.
- `Cross-listings` / `Also` → `crossListCrns`.

## CSV edge cases observed
- Multi-room labels with semicolons (9 rows).
- Online and “No Room Needed” labels (24 online / 20 no-room).
- Cross-listed rows with “Also … (CRN)” (7 rows).
- Missing instructor IDs (3 rows).
- Mixed instruction methods (Face-to-Face, Hybrid, Online, Synchronous Online).
- Mixed schedule types (Studio, Independent Study/Dir Reading, Internship/Practicum, Co-Requisite Lab).

## Findings and changes
- Instructor parsing now supports `;`, `and`, `&`, newline, and slash delimiters; staff rows are treated as unassigned instead of creating match issues. (`src/utils/dataImportUtils.js`, `src/utils/importTransactionUtils.js`)
- Location parsing now uses locationService in preview imports, supports slash-delimited room numbers, and writes `spaceIds`/`spaceDisplayNames`; online rows display `Online`. (`src/utils/locationService.js`, `src/utils/importTransactionUtils.js`, `src/utils/dataImportUtils.js`)
- Cross-listed CRNs are captured in the preview pipeline. (`src/utils/importTransactionUtils.js`)
- Schedule preview now supports updates (diff + field selection) and shows row-level validation errors + summary counts. (`src/utils/importTransactionUtils.js`, `src/components/administration/ImportPreviewModal.jsx`)
- Batch writes are chunked at 450 ops to respect Firestore limits; partial commits are tracked for cleanup. (`src/utils/importTransactionUtils.js`)
- Schedule duplicate detection now de-duplicates by pair to avoid double-reporting. (`src/utils/hygieneCore.js`)
- Tests added for CLSS parsing, instructor/room edge cases, and term mapping; minor lint fix in export tool. (`src/utils/__tests__`, `firestore-export/export-firestore.js`, `src/firebase.js`)

## Emulator validation procedure
Commands (2 terminals):
```bash
firebase emulators:start --only firestore,auth
```
```bash
VITE_USE_EMULATORS=true npm run dev
```

Steps:
1. Open the dev server in a browser.
2. In Emulator UI, create an Auth user; create `users/{uid}` in Firestore with `roles: ['admin']`.
3. (Optional) Seed `settings/termConfig` so `202610` maps to Spring.
4. In Import Wizard, upload `data-samples/CLSSspring2026import.csv`.
5. Confirm preview summary (~119 rows processed) and review warnings.
6. Resolve any instructor match issues, then commit.
7. Validate UI:
   - Faculty schedules (term filtering)
   - Room schedules
   - Course detail modal
   - Building/room directory
8. Re-import the same CSV; preview should show zero new schedule changes.
9. Verify Firestore emulator data:
   - `schedules` have `termCode`, `roomIds`, `roomNames`, `spaceIds`.
   - `terms/202610` exists and is active.
   - `rooms` created with `spaceKey` when parsed.

## Pre-production checklist
- Backup production Firestore.
- Verify `settings/termConfig` mapping for Baylor term codes (Spring 2026 → `202610`).
- Ensure `terms/202610` is unlocked.
- Run emulator import on the exact CSV and resolve preview warnings.
- Confirm no new composite indexes are required (`firestore.indexes.json` unchanged).
- Run `npm test -- --run` and `npm run lint`.
- Import during a maintenance window; re-run the same CSV to confirm idempotency.
