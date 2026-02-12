# Import Maintenance Guide

This guide is the primary reference for import maintenance after handoff.

## Import Surface Areas

- Import UI and schema diagnostics: `/Users/davis/my-apps/faculty-schedules/src/components/administration/ImportWizard.jsx`
- CLSS profile config (single-file maintenance target): `/Users/davis/my-apps/faculty-schedules/src/config/import/clss/default-profile.json`
- CLSS contract parser: `/Users/davis/my-apps/faculty-schedules/src/utils/import/clss/parse-clss-file.js`
- Schedule row extraction: `/Users/davis/my-apps/faculty-schedules/src/utils/importScheduleRowUtils.js`
- Transaction API facade (stable): `/Users/davis/my-apps/faculty-schedules/src/utils/importTransactionUtils.js`
- Transaction core implementation: `/Users/davis/my-apps/faculty-schedules/src/utils/import/core.js`
- Data hygiene pipeline (legacy cleanup): `/Users/davis/my-apps/faculty-schedules/src/utils/data-hygiene/core.js`

## CLSS Change Procedure (Config-First)

When Baylor CLSS export headers change, maintainers should only need to edit one file:

1. Edit aliases in `/Users/davis/my-apps/faculty-schedules/src/config/import/clss/default-profile.json`.
2. Keep required fields intact:
   - `clss_id`, `course_code`, `section`, `crn`, `instructor`, `term`
3. Run checks:
   ```bash
   npm run lint
   npm run build
   npm test -- --run
   ```
4. In the Import Wizard, upload a CLSS CSV and confirm diagnostics:
   - `missingRequired` is empty
   - `headerMap` looks correct
   - `unknownColumns` is expected
5. Generate preview and commit.

Fail-fast behavior is intentional: if required CLSS columns are missing, preview and commit are blocked.

## Directory CSV Changes

Directory parsing still lives in:

- `/Users/davis/my-apps/faculty-schedules/src/utils/dataImportUtils.js`

If directory export headers change:

1. Update directory field mapping logic there.
2. Re-run lint/build/tests.
3. Smoke test Import Wizard with a directory CSV.

## Legacy Cleanup and Canonical Model

- Scan/repair UI: `/Users/davis/my-apps/faculty-schedules/src/components/administration/data-cleanup/DataCleanupRepairsPage.jsx`
- Engine: `/Users/davis/my-apps/faculty-schedules/src/utils/data-hygiene/core.js`

Data Cleanup & Repairs reports `legacyModelIssues` and can auto-fix safe legacy mirrors.

## Regression Test Targets

- `/Users/davis/my-apps/faculty-schedules/src/utils/__tests__/clssProfileContract.test.js`
- `/Users/davis/my-apps/faculty-schedules/src/utils/__tests__/dataImportUtils.test.js`
- `/Users/davis/my-apps/faculty-schedules/src/utils/__tests__/importPreprocessor.test.js`
- `/Users/davis/my-apps/faculty-schedules/src/utils/__tests__/importValidationUtils.test.js`
- `/Users/davis/my-apps/faculty-schedules/src/utils/__tests__/legacyModelCleanup.test.js`
