# User activity export

The configured activity owner can use **Export** on `/admin/user-activity` to download a ZIP containing detailed activity and analysis context. The period, selected person, selected feature, and owner exclusion apply. Search text, activity-type filters, selected failure, and the open detail panel do not reduce the export.

The ZIP includes:

- Detailed JSONL records for events, normalized user-day summaries, current presence, and current tutorial progress.
- CSV tables for daily totals, people, user-days, user-feature-days, local hours, actions, transitions, failures, observed visits, events, tutorial state, and feature labels.
- A manifest with file byte sizes and row counts, export scope, source freshness, coverage, retention policy, and resource limits.
- A compact summary, field dictionary, reading guide, and review prompt for analyzing and plotting the files.

Every dataset is split on complete record boundaries into parts of at most 1 MiB UTF-8. Each CSV part has its own header. The uncompressed export has a 25 MiB ceiling; oversized exports fail with instructions to narrow the period or scope rather than dropping records. CSVs use the shared formula-neutralizing serializer; JSONL preserves original text. Secret-like keys are recursively omitted. Existing names and email addresses are retained; the owner decides where to share the download.

## Database usage

The export reuses the console's loaded summaries, presence, tutorial progress, and event pages. It reserves at most 2,000 additional event document limits per click, requests at most 200 per page, and stores successfully fetched pages in the console for repeat downloads. A short or empty final page establishes exhausted history. A full page at the budget boundary is explicitly partial, even if it might happen to be the last page. Read errors produce a usable partial export with the error category and a visible notice.

The export makes no database writes, does not invoke rollup synchronization or pruning, and does not send data to an external analysis service. The normal console's loading, refresh, sync, and tracking behavior still applies. The reserved document limits are a conservative query budget, not an exact bill or a measurement of the project's remaining daily quota. Empty queries and access-rule reads can also consume quota. See [Firestore quotas](https://firebase.google.com/docs/firestore/quotas) and [billing](https://firebase.google.com/docs/firestore/pricing).

The console currently loads 90 days of summaries, up to 120 latest presence documents, and the latest tutorial-progress documents. Raw event pruning uses a configured 365-day retention window. A requested export includes only the selected console period, and available telemetry may cover less. The manifest records these limitations; no download claims complete observation of user behavior.

## Measurement and repeated review

Schema 3 visible-tab duration is measured independently from raw events. Legacy estimates are separate from measured minutes, and schema 2 duration is unavailable. Visible-tab time does not establish attention, interaction, task completion, or productivity, and multiple tabs can overlap. Legacy summary lists may include only the top features, actions, or transitions. Event and daily-summary counts overlap and must not be added together. The tracker's `firstSeenAt` currently changes with every summary write and cannot reliably establish a first entry. Event exports retain original Firestore seconds and nanoseconds alongside UTC ISO timestamps to preserve source ordering.

Observed visits are derived from event sequences separated by a gap of more than 30 minutes, browser session change, or Central calendar-day boundary. Their elapsed spans are not active time. Feature filters remove surrounding events; event sequence coverage can be partial even with full daily summaries. Presence and tutorials are current loaded snapshots, not historical attendance or completion timelines. The exact since-last-visit timestamp applies to events, while daily counters cover the full first day.

For repeated downloads, deduplicate raw events by document ID and replace daily summaries by `(dateKey, uid)` using the newer snapshot. Do not add overlapping exports. Check scope and coverage before comparing periods. A ZIP is a static snapshot; ongoing access or scheduled monitoring is a separate feature.

Use code to read all file parts and verify their row counts rather than relying on a preview or loading every record into conversation context. Start with the manifest and summary, then analyze the relevant tables and timelines. Tool and account upload limits vary. [Responses API file-input documentation](https://developers.openai.com/api/docs/guides/file-inputs) describes its spreadsheet augmentation, which can process only the first 1,000 rows per sheet; this is API-specific and does not establish ChatGPT account limits.

## Implementation and checks

- `src/utils/activityExportHistory.js`: bounded pagination, error coverage, cancellation, and cache handoff.
- `src/utils/activityExport.js`: scope, normalization, dataset creation, dictionary, and ZIP packaging.
- `src/utils/activityExportFiles.js`: UTF-8 sizing, part boundaries, CSV encoding, and archive limits.
- `src/hooks/useActivityExplorerData.js`: source freshness and reuse of export-loaded history.
- `src/components/administration/UserActivityPage.jsx`: owner-only button and download status.

Regression tests cover query budgets and cursors, repeat-export caching, error coverage, filtering and owner exclusion, separate duration semantics, failure deduplication, DST and since boundaries, nested timestamps, redaction, CSV safety, Unicode chunking, archive ceilings, and ZIP/manifest consistency.
