# CLSS Profile Edit Guide

Use this guide when Baylor changes CLSS CSV export headers.

## Single Edit Point

- `/Users/davis/my-apps/faculty-schedules/src/config/import/clss/default-profile.json`

Do not start by editing parser code. The parser is profile-driven by design.

## Required Field IDs (Do Not Remove)

- `clss_id`
- `course_code`
- `section`
- `crn`
- `instructor`
- `term`

If these required fields are not mapped, import preview and commit are blocked.

## How to Update Aliases

1. Open `/Users/davis/my-apps/faculty-schedules/src/config/import/clss/default-profile.json`.
2. Find the `fields.<fieldId>.aliases` array.
3. Add the new CLSS header text exactly as exported by Baylor.
4. Keep previous aliases unless you are sure they are retired.

Example:

```json
"instructor": {
  "aliases": ["Instructor", "Faculty", "Primary Instructor"]
}
```

## Validate Changes

Run:

```bash
npm run lint
npm run build
npm test -- --run
```

Then in the app:

1. Open Import Wizard.
2. Upload CLSS CSV.
3. Confirm diagnostics:
   - `missingRequired` is empty
   - `headerMap` includes all required field IDs
   - `unknownColumns` only contains expected extras
4. Generate preview and inspect sample rows.

## Troubleshooting

- Error: `Missing required CLSS columns`
  - Add aliases for the missing field IDs in profile JSON.
- Error: `File does not match CLSS profile expectations`
  - Verify headers and delimiter in source CSV.
  - Expand alias coverage in profile JSON.
