# User Activity maintenance notes

The owner-only `/admin/user-activity` page supports occasional remote support and exploration of real usage. Overview, Usage, and Activity share person, feature, and date filters. Selection lives in the URL; opening a person or feature uses a keyboard-accessible side panel.

## Sources and definitions

- `userActivityDaily` is the source for daily usage totals. All filtered aggregates are rebuilt from per-person summaries, including owner exclusion. Distinct people, features, and dates are deduplicated across the whole selected period.
- `userActivityEvents` provides visit sequences, actions, and failure details. History is queried by timestamp in pages of 200 using document-snapshot cursors. Filtering is explicitly limited to loaded history until all pages are loaded. The UI retains loaded pages during refresh, or resets to the new first page if a burst of new activity creates a gap.
- A visit groups a person's events with the same browser-session ID until a 30-minute event gap or Central calendar-day boundary. These inferred visits do not measure time worked. Daily session counters are deliberately not presented as visit counts.
- Visible-tab minutes remain supporting information, not an engagement or productivity score. A page view counts an opening; a feature count is distinct pages.
- Calendar dates, event times, and daily patterns use `America/Chicago`. Today is partial. There are 90 days of loaded daily summaries; raw event retention remains 180 days. The UI offers 7-, 30-, and 90-day ranges, plus since the previous visit (bounded by the available summaries). In the since view, events use the exact timestamp while daily totals include the starting day.
- Presence is separate current information, restricted to the last ten minutes. A visible tab is not proof of active work.
- Tutorial progress is all-time and lives inside person details.

## Failure reporting

`trackFailure(workflow, error, pageId?)` reports known failures at existing page-render, import, PDF preparation, room calendar, reservation, directory-save, and schedule-save boundaries. It stores a fixed workflow name and an allowlisted error category, not raw error messages, stack traces, form values, or filenames. Telemetry failures never block the user's task.

Reports create an `error` event and update a `failureCounts` map on the existing per-person daily document. Errors do not increment meaningful-action counts. `monitoringVersion: 1` identifies daily documents written by clients with this reporting. No new collection, permission, or index is required.

The attention model reconciles timeline and daily counts per person/day/issue, taking the larger count so independent writes can recover missing evidence without double-counting. Daily counters make older problems visible even when their raw events have not yet been paginated into the Activity view.

This is application failure reporting, not an uptime monitor. Failures before sign-in, offline reporting failures, uninstrumented workflows, and older clients may not appear. No recorded errors must not be described as proof the whole app is healthy. Existing PDF events mean the print dialog opened; they do not confirm a file was saved. Room-calendar events mean files were generated.

## Local preferences

`activity-console:v1:<owner uid>` stores owner exclusion, the last successful check-in time, and reviewed issue timestamps in this browser. A newer failure makes an issue unreviewed again. Reviewed is not resolved. Storage failure is visible and never blocks exploration. There are no scheduled notifications or automatic outreach.

## Verification

Run `npm run lint`, `npm run build`, and `npm test -- --run`. Tests cover filtered totals, calendar gaps, visit grouping, pagination, stale-response handling, error reporting, failure reconciliation, navigation, focus restoration, and owner-only reads. Check the browser with example data before inspecting production. Never generate intentional failures or write test events to the production database.
