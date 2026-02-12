# Handoff Runbook

This runbook is for maintainers taking ownership of the Faculty Schedules dashboard.

## 1) Access You Need

- GitHub repo admin on `realronaldrump/faculty-schedules`
- Vercel project admin for production deployment
- Firebase project editor/admin (Firestore, Storage, Auth)
- Access to production environment variables

Use `docs/ACCESS_TRANSFER_CHECKLIST.md` to verify transfer completion.

## 2) Local Development

1. Clone and install:
   ```bash
   git clone https://github.com/realronaldrump/faculty-schedules.git
   cd faculty-schedules
   npm install
   ```
2. Add `.env.local` values.
3. Start app:
   ```bash
   npm run dev
   ```

## 3) Required Validation Before Deploy

```bash
npm run lint
npm run build
npm test -- --run
```

If any command fails, fix before deploy.

## 4) Most Common Maintenance Tasks

### A) CLSS import format changes

- Edit profile aliases only:
  - `src/config/import/clss/default-profile.json`
- CLSS parser and diagnostics:
  - `src/utils/import/clss/parse-clss-file.js`
  - `src/components/administration/ImportWizard.jsx`
- Transaction core (preview/commit/rollback):
  - `src/utils/import/core.js`
- Reference guide:
  - `docs/CLSS_PROFILE_EDIT_GUIDE.md`

### B) Data health / merge behavior

- Public facade:
  - `src/utils/dataHygiene.js`
- Core implementation:
  - `src/utils/data-hygiene/core.js`
- UI:
  - `src/components/administration/data-cleanup/DataCleanupRepairsPage.jsx`
  - One unified page now covers routine data checks, safe fixes, and rare repair tools.
  - “Fix safe issues” runs full canonicalization (legacy cleanup + standardization + linking + location repair).

### C) Access/permission behavior

- Permission factory: `src/utils/permissions.js`
- Access UI: `src/components/administration/AccessControl.jsx`

### D) Temperature monitoring issues

- Hub entrypoint: `src/components/facilities/FacilitiesHub.jsx`
- Temperature orchestrator: `src/components/temperature/TemperatureMonitoring.jsx`
- Supporting modules: `src/components/temperature/monitoring/`

## 5) Deployment

### Vercel

- Preferred path: merge to main branch and let Vercel auto-deploy.
- Confirm environment variables in Vercel project settings.

### Firebase (if rules/indexes changed)

```bash
npm run deploy:firestore
npm run deploy:indexes
```

## 6) Smoke Test Checklist (Post-Deploy)

- Login works.
- Dashboard loads.
- Import Wizard loads and preview works for CLSS + directory test files.
- CLSS diagnostics panel shows no missing required fields for known-good CLSS sample.
- Data health scan runs and safe fix action succeeds.
- Data Cleanup & Repairs page loads and Rare repair tools stay locked until explicitly unlocked.
- Access Control page loads.
- Facilities > Temperature loads and tab switching works.

## 7) CLSS Format Change Runbook (Quick)

1. Edit aliases in `src/config/import/clss/default-profile.json`.
2. Run:
   ```bash
   npm run lint
   npm run build
   npm test -- --run
   ```
3. Upload a sample CLSS file in Import Wizard and verify:
   - profile id/version display
   - required field check passes
   - header mapping looks right
4. Generate preview and verify row projections.
5. Deploy.

## 8) Rollback Approach

- Rollback deployment from Vercel dashboard to last known good build.
- If data mutation issue occurred, review Firestore write paths for recent imports and data hygiene jobs.
- Re-run smoke tests immediately after rollback.
