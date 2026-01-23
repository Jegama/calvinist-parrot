---
applyTo: "app/journal/**"
---
# Journal UI Guidance
- Treat pages with hooks/effects as client components; avoid SSR-only APIs.
- Consume NDJSON stream from [app/api/journal/entries/route.ts](../../app/api/journal/entries/route.ts) and handle event types: `entry_created`, `progress`, `call1a_complete`, `call1b_complete`, `call1c_complete`, `call2_complete`, `done`, `error`.
- Use types from [types/journal.ts](../../types/journal.ts) to render AI outputs.
- Reuse shared UI primitives (`components/ui/**`) and keep state minimal; prefer TanStack Query patterns for fetching lists and invalidation.
