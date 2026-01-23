---
applyTo: "app/prayer-tracker/**"
---
# Prayer Tracker Guidance
- Use auth helpers in [lib/auth.ts](../../lib/auth.ts) for server/API code.
- Unified Request System: `UnifiedRequest` with `familyId` (null = household, set = family-specific).
- Rotation confirmation must persist to `prayerRotation`, `prayerLog`, and update request statuses.
- Follow [app/prayer-tracker/api.ts](../../app/prayer-tracker/api.ts) for optimistic updates, `handleApiError`, and `Result<T, E>`.
- Reuse TanStack Query cache keys/helpers for invalidation and optimistic updates.
