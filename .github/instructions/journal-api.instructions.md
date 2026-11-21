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
  - `call1b_error`, `call1c_error`, `call2_error`: A parallel stage failed
  - `done`: Final merged output, with `partial` and `failedStages` when a stage failed
  - `error`: Error occurred

## AI Pipeline
- Route the four stages through the journal-scoped model in `utils/journal/llm.ts`. After the overview (1a), run heart reflection (1b), biblical guidance (1c) and suggestions (2) in parallel.
- Persist outputs via `storeJournalAIOutput` with retry/backoff and tag merging.
- Persist each successful stage’s returned model and failed stage names in `modelInfo`. Retry missing or failed stages and preserve the stored output and attribution of successful stages.

## Data Management
- Maintain profile counters: increment on create, decrement on delete.
- Keep pagination sane: limit ≤ 50; return `total`, `page`, `limit`, `totalPages` with entries.
