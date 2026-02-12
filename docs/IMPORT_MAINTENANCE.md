# Import Maintenance Guide

This guide is the primary reference for import maintenance after handoff.

## Import Surface Areas

- Import UI and schema diagnostics: `src/components/administration/ImportWizard.jsx`
- CLSS profile config (single-file maintenance target): `src/config/import/clss/default-profile.json`
- CLSS contract parser: `src/utils/import/clss/parse-clss-file.js`
- Schedule row extraction: `src/utils/importScheduleRowUtils.js`
- Transaction API facade (stable): `src/utils/importTransactionUtils.js`
- Transaction core implementation: `src/utils/import/core.js`
- Data hygiene pipeline (legacy cleanup): `src/utils/data-hygiene/core.js`

## CLSS Change Procedure (Config-First)

When Baylor CLSS export headers change, maintainers should only need to edit one file:

1. Edit aliases in `src/config/import/clss/default-profile.json`.
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

- `src/utils/dataImportUtils.js`

If directory export headers change:

1. Update directory field mapping logic there.
2. Re-run lint/build/tests.
3. Smoke test Import Wizard with a directory CSV.

## Legacy Cleanup and Canonical Model

- Scan/repair UI: `src/components/administration/data-cleanup/DataCleanupRepairsPage.jsx`
- Engine: `src/utils/data-hygiene/core.js`

Data Cleanup & Repairs reports `legacyModelIssues` and can auto-fix safe legacy mirrors.

## Regression Test Targets

- `src/utils/__tests__/clssProfileContract.test.js`
- `src/utils/__tests__/dataImportUtils.test.js`
- `src/utils/__tests__/importPreprocessor.test.js`
- `src/utils/__tests__/importValidationUtils.test.js`
- `src/utils/__tests__/legacyModelCleanup.test.js`
