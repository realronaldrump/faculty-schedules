# Import Idempotency and Identity Keys

## Identity keys

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

## Merge and backfill rules

Import updates follow deterministic, field-level rules:

- Non-empty CSV values update existing fields by default.
- Empty CSV fields do not overwrite existing values.
- `courseTitle` preserves the longer existing value if the incoming value is
  shorter (avoid downgrading high-confidence titles).
- `identityKey` never downgrades from a stronger key to a weaker one
  (CLSS > CRN > Section > Composite). `identityKeys` are always merged.
- Room fields can be cleared when the row explicitly indicates a no-room class.

## Import run tracking

Each committed run records:

- `importRuns/{runId}`: file hash, row hashes, timestamps, and stats.
- `importRowLineage/{runId}_{rowHash}`: per-row lineage (identity, match, action).

These are used to make repeated imports idempotent while preserving auditability.

## Migration

Backfill identity keys for existing schedules (run once with admin creds):

```bash
node scripts/backfill-schedule-identity.mjs
```

## Tests

Run the import idempotency tests:

```bash
npm test -- importIdentityUtils
npm test -- importMergeRules
```

Run the full suite:

```bash
npm test
```
