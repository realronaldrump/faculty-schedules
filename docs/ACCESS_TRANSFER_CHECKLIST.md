# Access Transfer Checklist

Use this checklist during handoff.

## Repository and Source Control

- [ ] Confirm repository visibility is **Private**.
- [ ] Add new maintainers with appropriate GitHub permissions.
- [ ] Confirm branch protection expectations for `main`.
- [ ] Confirm who is responsible for approvals/deploy decisions.

## Vercel

- [ ] Add maintainers to Vercel project team.
- [ ] Verify production project is connected to the correct GitHub repo.
- [ ] Verify environment variables exist for Production and Preview.
- [ ] Verify deploy permissions (who can promote/redeploy).

## Firebase / Google Cloud

- [ ] Grant Firebase roles to maintainers.
- [ ] Verify Firestore, Storage, and Auth access.
- [ ] Confirm ability to view logs and usage.
- [ ] Confirm who can deploy rules and indexes.

## Secrets and Local Configuration

- [ ] Share required `.env.local` variable names and meanings.
- [ ] Rotate credentials if ownership/policy requires it.
- [ ] Remove any personal-only credentials from team workflows.

## Operational Ownership

- [ ] Identify primary maintainer.
- [ ] Identify backup maintainer.
- [ ] Confirm bug intake channel and escalation path.

## Validation at Transfer Time

- [ ] New maintainer can run `npm install` + `npm run dev` locally.
- [ ] New maintainer can run `npm run lint`, `npm run build`, and `npm test -- --run`.
- [ ] New maintainer can deploy via Vercel.
- [ ] New maintainer can access Firebase console and logs.

## Documentation Handoff

- [ ] Review `README.md` module map.
- [ ] Review `docs/HANDOFF_RUNBOOK.md`.
- [ ] Review `docs/IMPORT_MAINTENANCE.md`.
- [ ] Review `docs/CLSS_PROFILE_EDIT_GUIDE.md`.
- [ ] Review `docs/CANONICAL_DATA_MODEL.md`.
