---
applyTo: "app/api/journal/**"
---
# Journal API Guidance
- Use [lib/auth.ts](../../lib/auth.ts) (`requireAuthenticatedUser`) and verify ownership by `authorProfileId`.
- Stream NDJSON in [entries/route.ts](../../app/api/journal/entries/route.ts) with these event types: `entry_created`, `progress`, `call1a_complete`, `call1b_complete`, `call1c_complete`, `call2_complete`, `done`, `error`.
- Use [utils/journal/llm.ts](../../utils/journal/llm.ts) for AI calls; persist outputs via `storeJournalAIOutput` with retry/backoff and tag merging.
- Maintain profile counters: increment on create, decrement on delete.
- Keep pagination sane: limit ≤ 50; return `total`, `page`, `limit`, `totalPages` with entries.
