---
applyTo: "app/api/journal/**"
---
# Journal API Guidance

## Authentication
- Use `lib/auth.ts` (`requireAuthenticatedUser`) and verify ownership by `authorProfileId`.

## Streaming
- Stream NDJSON in `app/api/journal/entries/route.ts` with these event types:
  - `entry_created`: Initial entry saved to DB
  - `progress`: Stage updates ("call1a", "parallel")
  - `call1a_complete`, `call1b_complete`, `call1c_complete`: Parallel Call 1 results
  - `call2_complete`: Call 2 (tags/suggestions) result
  - `done`: Final merged output
  - `error`: Error occurred

## AI Pipeline
- Use `utils/journal/llm.ts` for AI calls; Call 1 runs in parallel (a/b/c) for better latency.
- Persist outputs via `storeJournalAIOutput` with retry/backoff and tag merging.

## Data Management
- Maintain profile counters: increment on create, decrement on delete.
- Keep pagination sane: limit ≤ 50; return `total`, `page`, `limit`, `totalPages` with entries.
