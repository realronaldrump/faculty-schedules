# Space Model

## Canonical Entities

- Building (settings/buildings)
  - Source of truth for building metadata and aliases.
  - Fields: `id` (slug), `code`, `displayName`, `aliases`, `isActive`, `campus`, `address`.
  - `code` is stable and used in every space key; it is not editable once created.

- Space (rooms collection)
  - Unified model for classrooms, offices, labs, etc.
  - Document ID for new writes: `spaceKey` in format `BUILDING_CODE:SPACE_NUMBER`.
  - Required fields: `spaceKey`, `buildingCode`, `buildingDisplayName`, `spaceNumber`.
  - Legacy fields retained for compatibility: `building`, `roomNumber`, `name`, `displayName`.
  - Soft delete via `isActive=false`.

- Schedule (schedules collection)
  - Canonical location references: `spaceIds` (array of spaceKey) and `spaceDisplayNames`.
  - Legacy fields (`roomIds`, `roomNames`, `roomId`, `roomName`) remain for backward compatibility.

- Person (people collection)
  - Canonical office reference: `officeSpaceId` (spaceKey).
  - Legacy field `officeRoomId` retained for compatibility.

- Temperature monitoring
  - Building queries use `buildingCode`.
  - Device mappings and snapshots reference `spaceKey`.

## Relationships and Invariants

- `spaceKey` format: `BUILDING_CODE:SPACE_NUMBER` (uppercase building codes, normalized space numbers).
- `buildingCode` is the stable identifier; avoid relying on building names for identity.
- Spaces are soft deleted (`isActive=false`) to avoid orphaned references.
- Schedules and people should reference spaces via `spaceKey` in all new writes.

## Data Flow Overview

1) Settings (BuildingManagement/SpaceManagement)
   - Writes `settings/buildings` and `rooms` (spaces).
   - Building renames update space display names; prior names are stored as aliases.

2) AppConfigContext
   - Subscribes to `settings/buildings`.
   - Applies building config to locationService, enabling consistent parsing and display.

3) DataContext
   - Subscribes to `rooms` with `onSnapshot`.
   - Normalizes space records and builds `spacesByKey` for global lookup.

4) Feature surfaces
   - Schedules, directories, and people use `spaceIds`/`officeSpaceId` with `spacesByKey`.
   - Temperature monitoring queries by `buildingCode` and maps devices/snapshots by `spaceKey`.
   - UI updates automatically through Firestore subscriptions.

## Migration Strategy

- Use Admin → Data Hygiene → Location Migration:
  - Split combined room strings into individual spaces.
  - Backfill missing `spaceKey`, `buildingCode`, and `spaceNumber`.
  - Seed missing spaces from schedules and people.
  - Backfill `spaceIds` on schedules and `officeSpaceId` on people.

- Office Room Backfill (optional):
  - Creates office spaces and backfills `officeSpaceId` when needed.

- Forward-only migrations:
  - Take a Firestore export before running.
  - Rollback is done by restoring the backup (no reverse migration).

## Integrity Enforcement

- Firestore rules require `spaceKey`, `buildingCode`, and `spaceNumber` on new space writes.
- Legacy records can only be soft-deactivated without full canonical fields.

## Tests

- Unit tests: `npm test`
- Optional UI runner: `npm run test:ui`
