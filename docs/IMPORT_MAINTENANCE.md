# Import Maintenance Guide

This guide is the primary reference for import maintenance after handoff.

## Import Surface Areas

- Import UI and schema diagnostics: `src/components/administration/ImportWizard.jsx`
- CLSS profile config (single-file maintenance target): `src/config/import/clss/default-profile.json`
- CLSS contract parser: `src/utils/import/clss/parse-clss-file.js`
- Schedule row extraction: `src/utils/importScheduleRowUtils.js`
- Import identity/canonicalization rules: `src/utils/importHygieneUtils.js`
- Transaction engine (preview/commit/rollback): `src/utils/import/core.js`
- Transaction core implementation: `src/utils/import/core.js`
- Data hygiene pipeline (legacy cleanup): `src/utils/dataHygiene.js`

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

Directory import field extraction lives in the Import Wizard and transaction core;
identity/canonicalization lives in:

- `src/utils/importHygieneUtils.js`
- `src/utils/importPreprocessor.js`

If directory export headers change:

1. Update directory field mapping logic in the import preview/core path.
2. Re-run lint/build/tests.
3. Smoke test Import Wizard with a directory CSV.

Directory rows with the same strong person identity are merged within the import
batch. Name-only duplicate rows are flagged and kept separate.

## Legacy Cleanup and Canonical Model

- Scan/repair UI: `src/components/administration/data-cleanup/DataCleanupRepairsPage.jsx`
- Engine: `src/utils/dataHygiene.js`

Data Cleanup & Repairs reports `legacyModelIssues` and can auto-fix safe legacy mirrors.
Committed imports also run a lightweight entity cleanup preview:

- strong people duplicates are detected by Baylor ID, CLSS instructor ID, or email
- room duplicates are detected by `spaceKey` or identical room name
- duplicate merges are applied from Data Health Check, not from import commit, so
  import rollback remains bounded to the transaction's tracked changes
- schedule imports still run term-scoped schedule cleanup and cross-list linking

## Regression Test Targets

- `src/utils/__tests__/clssProfileContract.test.js`
- `src/utils/__tests__/dataImportUtils.test.js`
- `src/utils/__tests__/importPreprocessor.test.js`
- `src/utils/__tests__/importHygieneUtils.test.js`
- `src/utils/__tests__/importValidationUtils.test.js`
- `src/utils/__tests__/legacyModelCleanup.test.js`
