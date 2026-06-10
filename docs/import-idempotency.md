# Import Idempotency and Entity Identity

## Schedule identity keys

Schedule imports derive deterministic identity keys to prevent duplicates and
keep matches stable across data hygiene:

- Primary identity order:
  1. `clss:{termCode}:{clssId}` when `CLSS ID` is present
  2. `crn:{termCode}:{crn}` when `CRN` is present
  3. `section:{termCode}_{courseCode}_{sectionNumber}`
  4. `composite:{courseCode}:{term}:{meetingKey}:{roomKey}` as a last resort
- Stored on schedule docs as:
  - `identityKey` (primary key)
  - `identityKeys` (all derived keys, merged across imports)
  - `identitySource` (prefix of `identityKey`)

## Person identity keys

Person imports now use the same central import hygiene module as schedules:

- Strong identity order:
  1. `baylor:{baylorId}` for 9-digit Baylor IDs
  2. `clss-instructor:{hexEncodedClssInstructorId}` for CLSS instructor IDs
  3. `email:{hexEncodedNormalizedEmail}` for primary/additional emails
- Name keys (`name:{last}:{first}`) are retained for review and matching context,
  but name-only duplicates are not auto-created or auto-merged during import.
- Email and external-ID keys are exact encodings, not punctuation-stripped
  slugs, so distinct values such as `jane.doe@...` and `jane-doe@...` do
  not collide.
- New person records use deterministic Firestore document IDs when a strong
  identity is available, for example `person_email_jane_doe_baylor_edu`.
- Commit re-checks pending person creates against the current database. If a
  matching person exists, the create becomes a merge/update of the canonical
  record instead of creating a duplicate.

## Course and room identity

- Course records are upserted from schedule imports with deterministic IDs based
  on canonical `courseCode`, for example `ADM_1300`.
- Room records are upserted by canonical `spaceKey`; schedule references are
  repaired during post-import cleanup.

## Merge and backfill rules

Import updates follow deterministic, field-level rules:

- Non-empty CSV values update existing fields by default.
- Empty CSV fields do not overwrite existing values.
- People merge rules preserve existing names/titles unless they are empty, union
  roles and external IDs, and update contact/location fields from import data.
- `courseTitle` preserves the longer existing value if the incoming value is
  shorter (avoid downgrading high-confidence titles).
- `identityKey` never downgrades from a stronger key to a weaker one
  (CLSS > CRN > Section > Composite). `identityKeys` are always merged.
- Room fields can be cleared when the row explicitly indicates a no-room class.

## Post-import cleanup preview

Every committed import runs a lightweight entity cleanup preview:

- Strong person duplicates (`baylorId`, `clssInstructorId`, `email`) are detected.
- Room duplicates by `spaceKey` or identical room name are detected.
- Name-only person duplicates are flagged for review instead of auto-merged.
- The transaction stores `entityResolutionReport` and `entityCleanupReport` so
  matched, candidate, flagged, and deterministic-created records are explainable.
- Duplicate merges are applied from Data Health Check rather than import commit,
  which keeps import rollback limited to tracked transaction changes.

## Import run tracking

Each committed run records:

- `importRuns/{runId}`: file hash, row hashes, timestamps, and stats.
- `importRowLineage/{runId}_{rowHash}`: per-row lineage (identity, match, action).

These are used to make repeated imports idempotent while preserving auditability.

## Backfill (in-app)

If existing data was imported before identity keys existed, use the
**Data Cleanup & Repairs** workflow to backfill identity fields and merge
duplicates. In practice, run **Fix safe issues** for broad cleanup, or use
**Rare repair tools** for a previewed term/system repair pass.

## Linked sections (manual)

Some sections are intentionally duplicated across different identifiers but
represent the same meeting. When this happens, link the sections in the app:

- Schedules may carry a `linkGroupId` field.
- Sections that share the same `linkGroupId` are treated as linked and will
  not be flagged as duplicates or teaching conflicts in Data Cleanup & Repairs.
- Linking is manual and per-term. Use Data Cleanup & Repairs or Course Management to
  link/unlink sections.

## Tests

Run the import idempotency tests:

```bash
npm test -- importIdentityUtils
npm test -- importHygieneUtils
npm test -- importPreprocessor
```

Run the full suite:

```bash
npm test
```
