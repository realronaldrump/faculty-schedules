# Faculty Schedules Dashboard

Operational dashboard for Baylor Human Sciences & Design scheduling, people directory operations, imports, access control, and facilities monitoring.

## Status

- Repository visibility: **Private** (verified via GitHub CLI on 2026-02-12).
- Hosting target: Vercel (existing deployment).
- Data backend: Firebase (Firestore + Storage + Auth).

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Provide required environment values in `.env.local`.
3. Start local app:
   ```bash
   npm run dev
   ```

## Quality Checks

Run before any handoff change or deployment:

```bash
npm run lint
npm run build
npm test -- --run
```

## Critical Module Map (Post-Refactor)

### App routing

- `src/App.jsx`
  - App shell: auth gate, sidebar, header, semester controls, notification, tutorial overlay.
- `src/components/app/PageRouter.jsx`
  - Route/page switch logic and redirects.

### Import transaction pipeline

- Public facade (imports remain stable): `src/utils/importTransactionUtils.js`
- Core implementation: `src/utils/import/core.js`

### CLSS contract layer

- Profile config (maintainer edit point): `src/config/import/clss/default-profile.json`
- Profile schema validation: `src/utils/import/clss/profile-schema.js`
- Header matching: `src/utils/import/clss/header-matcher.js`
- Canonical row normalization: `src/utils/import/clss/normalize-row.js`
- File parser + diagnostics: `src/utils/import/clss/parse-clss-file.js`

### Data hygiene pipeline

- Public facade (imports remain stable): `src/utils/dataHygiene.js`
- Core implementation: `src/utils/data-hygiene/core.js`

### Permission layer

- `src/utils/permissions.js`
  - Mapping-driven permission factory preserving existing `can*` API shape.

### Person directory configs

- Directory container/tabs: `src/components/people/PeopleDirectory.jsx`
- Directory renderer: `src/components/people/PersonDirectory.jsx`
- Core implementation: `src/components/person-directory-configs/configs-core.jsx`

### Temperature monitoring

- Container/orchestrator: `src/components/temperature/TemperatureMonitoring.jsx`
- Extracted modules:
  - `src/components/temperature/monitoring/constants.js`
  - `src/components/temperature/monitoring/helpers.js`
  - `src/components/temperature/monitoring/Toolbar.jsx`
  - `src/components/temperature/monitoring/ViewTabs.jsx`
  - `src/components/temperature/monitoring/QuickStats.jsx`
  - `src/components/temperature/monitoring/ImportPanel.jsx`
  - `src/components/temperature/monitoring/SnapshotPanel.jsx`
  - `src/components/temperature/monitoring/SettingsPanel.jsx`

## Handoff Docs

- `docs/HANDOFF_RUNBOOK.md`
- `docs/IMPORT_MAINTENANCE.md`
- `docs/ACCESS_TRANSFER_CHECKLIST.md`
- `docs/CLSS_PROFILE_EDIT_GUIDE.md`
- `docs/CANONICAL_DATA_MODEL.md`
- `docs/import-idempotency.md`
- `docs/space-model.md`

## Sample Data Policy

Sensitive CSV samples were removed from source control. Only sanitized sample data should remain in `data-samples/`.
