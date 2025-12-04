# CCEL Retrieval Performance Notes

> Context: CCEL embeddings live in the Neon `data_ccel_vector_store` table (`vector(1536)`), queried through LangChain's `PGVectorStore`. These tips capture the tuning ideas we surfaced while adding the CCEL Agentic RAG tool.

## 1. Keep `k` Modest Unless Needed
- `similaritySearch(query, k)` directly controls how many rows PGVector must score and return. Each additional row adds another 1,536‑dim dot-product plus metadata fetch.
- Default to `k = 5` for fast responses; only bump to 10+ when the conversation truly needs more breadth (e.g., wide historical surveys).
- Expose `topK` as a tool parameter if we want runtime overrides without redeploying.

## 2. Reuse Connections and Vector Store Handles
- LangChain lets us memoize the `PGVectorStore` instance—keep the `vectorStorePromise` cache in `ccelRetrievalTool.ts` so we do not reinitialize embeddings or new TLS sessions per request.
- When running outside the Next.js environment (scripts, tests), ensure any new entry point shares a pooled Postgres client instead of opening one-off SSL connections.

## 3. Index the `embedding` Column
- Without an approximate index, PGVector performs a sequential scan and cosine distance for every document.
- Recommended index:
  ```sql
  CREATE INDEX IF NOT EXISTS data_ccel_vector_store_ivfflat
    ON data_ccel_vector_store USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 200);
  ANALYZE data_ccel_vector_store;
  ```
- Tweak `lists` upward for larger corpora; Neon’s compute tiers handle IVFFlat well once the index is built.

## 4. Confirm Column & SSL Settings
- Column should be declared `embedding vector(1536)` to match `text-embedding-3-small`.
- Use Neon’s recommended SSL mode (`?sslmode=require` or `prefer`) so each connection negotiates quickly. Connection pooling (e.g., pg-pool) helps when multiple chats trigger the tool concurrently.

## 5. Consider Staged Retrieval
- Pattern: fetch the top 5 first, let the model respond, and only issue a second query for additional sources if it signals insufficient coverage.
- This preserves latency for most questions while still allowing deeper dives when explicitly requested.

## 6. General Monitoring Checklist
- Track latency per tool invocation (LangGraph writer already emits progress). If steady-state latency climbs, inspect Neon metrics for CPU saturation or throttling.
- After bulk ingest/update, rerun `ANALYZE` so planner stats stay current.
- Keep embeddings model consistent; mixing dimensions will raise errors and stall retrieval.
