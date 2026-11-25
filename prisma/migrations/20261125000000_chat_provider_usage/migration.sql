BEGIN;

ALTER TABLE "ProviderCallAttempt" ADD COLUMN "isRetry" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "cacheWrite30mTokens" INTEGER, ADD COLUMN "cacheWrite12hTokens" INTEGER;
CREATE INDEX "ChatAnalyticsEvent_submission_operation_idx" ON "ChatAnalyticsEvent" ("operationId") WHERE kind = 'submission';

-- Standard text rates, USD per million tokens. Effective dates are the dates
-- these rates were verified for the dashboard.
-- https://platform.claude.com/docs/en/models/haiku-5-5/overview
-- https://aistudio.google.com/docs/pricing#gemini-4-hydrogen
-- https://developers.openai.com/api/docs/models/gpt-6-luna
-- https://developers.openai.com/api/docs/models/text-embedding-3-small
-- https://developers.openai.com/api/docs/guides/prompt-caching
CREATE OR REPLACE VIEW analytics_priced_provider_attempt AS
WITH rates(provider, model, effective_from, input_rate, read_rate, output_rate) AS (
    VALUES ('anthropic', 'claude-haiku-5-5', DATE '2026-11-21', 0.10, 0.01, 0.50),
           ('gemini', 'gemini-4-hydrogen', DATE '2026-11-21', 1.50, 0.075, 7.50),
           ('openai', 'gpt-6-luna', DATE '2026-11-25', 0.10, 0.01, 0.50),
           ('openai', 'text-embedding-3-small', DATE '2026-11-25', 0.02, 0, 0)
)
-- Retain the existing view column order. Append the retry flag after usd.
SELECT a."attemptId", a."operationId", a.feature, a.stage, a."startedAt", a."durationMs",
       a.environment, a.provider, a."requestedModel", a."returnedModel", a."serviceTier",
       a.outcome, a."completedAt", a."inputTokens", a."cacheReadTokens", a."cacheWriteTokens",
       a."cacheWrite5mTokens", a."cacheWrite1hTokens", a."outputTokens", a."thinkingTokens",
       a."toolUsePromptTokens", a."providerTotalTokens", a."promptTokens", a."candidateTokens",
       CASE WHEN a."inputTokens" >= 0 AND a."outputTokens" >= 0
                 AND (a."serviceTier" IS NULL
                      OR (a.provider = 'anthropic' AND a."serviceTier" = 'standard')
                      OR (a.provider = 'gemini' AND a."serviceTier" IN ('standard', 'ON_DEMAND'))
                      OR (a.provider = 'openai' AND a."serviceTier" = 'default'))
                 AND coalesce(a."toolUsePromptTokens", 0) = 0
                 -- Price cache creation only when its billing class is known.
                 AND coalesce(a."cacheWriteTokens", 0) = buckets.write_5m + buckets.write_1h + buckets.write_30m + buckets.write_12h
                 AND (a.provider = 'anthropic' OR buckets.write_5m + buckets.write_1h = 0)
                 AND (r.model = 'gpt-6-luna' OR buckets.write_30m + buckets.write_12h = 0)
                 AND (r.model <> 'text-embedding-3-small' OR (a."outputTokens" = 0 AND buckets.cache_read = 0))
            THEN ((a."inputTokens" * r.input_rate + buckets.cache_read * r.read_rate
                     + buckets.write_5m * 0.125 + buckets.write_1h * 0.20
                     + buckets.write_30m * 0.125 + buckets.write_12h * 0.25) * tier.input_multiplier
                  + a."outputTokens" * r.output_rate * tier.output_multiplier) / 1000000
       END AS usd, a."isRetry", a."cacheWrite30mTokens", a."cacheWrite12hTokens"
FROM "ProviderCallAttempt" a
LEFT JOIN LATERAL (
    SELECT rates.* FROM rates
    WHERE provider = a.provider AND effective_from <= (a."startedAt" AT TIME ZONE 'UTC')::date
      AND (coalesce(a."returnedModel", a."requestedModel") = model
           OR coalesce(a."returnedModel", a."requestedModel") ~ ('^' || model || '-([0-9]{8}|[0-9]{4}-[0-9]{2}-[0-9]{2})$'))
    ORDER BY effective_from DESC LIMIT 1
) r ON true
CROSS JOIN LATERAL (SELECT coalesce(a."cacheReadTokens", 0) AS cache_read,
                           coalesce(a."cacheWrite5mTokens", 0) AS write_5m,
                           coalesce(a."cacheWrite1hTokens", 0) AS write_1h,
                           -- The agent and memory clients use OpenAI's default 30m TTL.
                           -- Prefer the receipt's explicit split whenever supplied.
                           CASE WHEN a.provider = 'openai' AND a."cacheWrite30mTokens" IS NULL AND a."cacheWrite12hTokens" IS NULL
                                THEN coalesce(a."cacheWriteTokens", 0) ELSE coalesce(a."cacheWrite30mTokens", 0) END AS write_30m,
                           coalesce(a."cacheWrite12hTokens", 0) AS write_12h) buckets
CROSS JOIN LATERAL (SELECT a."inputTokens"::bigint + buckets.cache_read + coalesce(a."cacheWriteTokens", 0) AS input_length) prompt
CROSS JOIN LATERAL (
    SELECT CASE WHEN r.model = 'claude-haiku-5-5' AND input_length > 100000 THEN 5
                WHEN r.model = 'gpt-6-luna' AND input_length > 272000 THEN 2 ELSE 1 END AS input_multiplier,
           CASE WHEN r.model = 'claude-haiku-5-5' AND input_length > 100000 THEN 5
                WHEN r.model = 'gpt-6-luna' AND input_length > 272000 THEN 1.5 ELSE 1 END AS output_multiplier
) tier;
COMMIT;
