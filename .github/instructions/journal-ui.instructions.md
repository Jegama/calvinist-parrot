---
applyTo: "app/journal/**"
---
# Journal UI Guidance

## Component Structure
- Treat pages with hooks/effects as client components (`"use client"`); avoid SSR-only APIs.
- Components in `components/` folder: `JournalEntryCard`, `ReflectionCard`, `SuggestedRequestsPanel`.
- Use `SectionErrorBoundary` for graceful error handling around sections.

## Streaming & Events
- Consume NDJSON stream from `app/api/journal/entries/route.ts`.
- Handle event types: `entry_created`, `progress`, `call1a_complete`, `call1b_complete`, `call1c_complete`, `call2_complete`, `done`, `error`.
- Call1 runs in parallel (a/b/c) for better latency; display partial results as they arrive.

## Types & State
- Use types from `types/journal.ts` to render AI outputs (`Call1Output`, `Call2Output`, `Call1aOutput`, etc.).
- Reuse shared UI primitives (`components/ui/**`) and keep state minimal.
- Prefer TanStack Query patterns for fetching lists and invalidation.
- Query keys follow pattern: `["journal", "entries", userId]`.
