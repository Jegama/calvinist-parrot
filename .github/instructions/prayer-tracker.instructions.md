---
applyTo: "app/prayer-tracker/**"
---
# Prayer Tracker Guidance

## Authentication & Data Access
- Use auth helpers in `lib/auth.ts` for server/API code.
- Unified Request System: `UnifiedRequest` with `familyId` (null = household, set = family-specific).

## State & Caching
- Follow `app/prayer-tracker/api.ts` for optimistic updates, `handleApiError`, and `Result<T, E>` pattern.
- Reuse TanStack Query cache keys/helpers for invalidation and optimistic updates.
- Query keys follow pattern: `["prayer-tracker", "<endpoint>", userId]`.

## Data Persistence
- Rotation confirmation must persist to `prayerRotation`, `prayerLog`, and update request statuses.
- Categories for families use `categoryTag` field; archived families use `ARCHIVED_CATEGORY` constant.

## UI Patterns
- Components in `components/` folder: `FamilySection`, `RequestsSection`, etc.
- Follow standard pagination pattern with per-filter page tracking (see copilot-instructions.md).
- Client-side filtering for family categories and request status to avoid extra network calls.
- Use `PAGE_SIZE = 10` for pagination consistency.
