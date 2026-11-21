-- Standard paid USD per million tokens, for uncached requests up to 100k input
-- tokens on the two production aliases. Source and scope: GitHub issue #96.
-- Add a dated row for a rate change. Each attempt uses its rate on the call date.
--
-- Run with a read-only database connection:
--   psql "$DATABASE_URL" -f scripts/provider-usage-report.sql
--
-- Usage coverage is the share of recorded attempts with known base input and
-- billable output. Token sums include available counters from all attempts.
-- A NULL sum means no counter was reported. Thinking is already in output.
-- Price coverage additionally requires a matching rate. The example omits
-- cache, tool-use and long-context prices until verified rates are supplied.
-- Optional cache counters omitted on otherwise measured calls count as zero.
-- Requests with no reported service tier assume standard paid on-demand rates.
-- Estimated cost averages all attempts of each durably completed operation,
-- including unsuccessful attempts before recovery. It is NULL if any of those
-- attempts cannot be priced. Known spend on incomplete operations is separate.
-- Coverage is relative to the recorded attempts, so unlogged calls and stages
-- completed before instrumentation are outside the observation window.
WITH rates(provider, model, effective_from, input_usd, output_usd) AS (
    VALUES ('anthropic', 'claude-haiku-5-5', DATE '2026-11-21', 0.10, 0.50),
           ('gemini', 'gemini-4-hydrogen', DATE '2026-11-21', 1.50, 7.50)
), priced AS (
    SELECT a.*,
           CASE WHEN "inputTokens" BETWEEN 0 AND 100000
                     AND "outputTokens" IS NOT NULL
                     AND ("serviceTier" IS NULL
                          OR (provider = 'anthropic' AND "serviceTier" = 'standard')
                          OR (provider = 'gemini' AND "serviceTier" IN ('standard', 'ON_DEMAND')))
                     AND COALESCE("cacheReadTokens", 0) = 0
                     AND COALESCE("cacheWriteTokens", 0) = 0
                     AND COALESCE("cacheWrite5mTokens", 0) = 0
                     AND COALESCE("cacheWrite1hTokens", 0) = 0
                     AND COALESCE("toolUsePromptTokens", 0) = 0
                THEN ("inputTokens" * rate.input_usd + "outputTokens" * rate.output_usd) / 1000000
           END AS usd
    FROM "ProviderCallAttempt" a
    LEFT JOIN LATERAL (
        SELECT r.input_usd, r.output_usd
        FROM rates r
        WHERE r.provider = a.provider AND r.model = a."requestedModel"
          AND (a."returnedModel" IS NULL OR a."returnedModel" = r.model
               OR a."returnedModel" ~ ('^' || r.model || '-[0-9]{8}$'))
          AND r.effective_from <= (a."startedAt" AT TIME ZONE 'UTC')::date
        ORDER BY r.effective_from DESC
        LIMIT 1
    ) rate ON TRUE
), operations AS (
    SELECT environment, feature, "operationId",
           bool_or("completedAt" IS NOT NULL) AS completed,
           count(*) AS attempts,
           count(*) - count(DISTINCT stage) AS repeated_stage_calls,
           count(*) FILTER (WHERE "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL) AS measured,
           count(usd) AS priced_attempts,
           sum("inputTokens") AS uncached_input, sum("cacheReadTokens") AS cache_reads,
           sum("cacheWriteTokens") AS cache_writes, sum("outputTokens") AS billable_output,
           sum("thinkingTokens") AS thinking_detail, sum("toolUsePromptTokens") AS tool_input,
           sum(usd) AS known_usd
    FROM priced
    GROUP BY environment, feature, "operationId"
)
SELECT environment, feature, sum(attempts) AS attempts,
       sum(repeated_stage_calls) AS repeated_stage_calls,
       sum(uncached_input) AS uncached_input_tokens, sum(cache_reads) AS cache_read_tokens,
       sum(cache_writes) AS cache_write_tokens, sum(billable_output) AS billable_output_tokens,
       sum(thinking_detail) AS thinking_tokens_in_output, sum(tool_input) AS tool_prompt_tokens,
       round(100.0 * sum(measured) / sum(attempts), 2) AS usage_coverage_pct,
       round(100.0 * sum(priced_attempts) / sum(attempts), 2) AS price_coverage_pct,
       count(*) FILTER (WHERE completed) AS completed_operations,
       count(*) FILTER (WHERE completed AND priced_attempts = attempts) AS fully_priced_completions,
       CASE WHEN bool_and(priced_attempts = attempts) FILTER (WHERE completed)
            THEN round(avg(known_usd) FILTER (WHERE completed), 8)
       END AS estimated_usd_per_completed_operation,
       round(sum(known_usd) FILTER (WHERE NOT completed), 8) AS known_usd_on_incomplete_operations
FROM operations
GROUP BY environment, feature
ORDER BY environment, feature;
