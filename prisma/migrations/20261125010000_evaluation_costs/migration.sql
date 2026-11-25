ALTER TABLE "churchEvaluation"
    ADD COLUMN channel TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN "expectedUsageAttempts" INTEGER,
    ADD COLUMN "usageEnvironment" TEXT;
ALTER TABLE "sermonEvaluation"
    ADD COLUMN channel TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN "usageEnvironment" TEXT;

ALTER TABLE "ProviderCallAttempt"
    ALTER COLUMN "requestedModel" DROP NOT NULL,
    ADD COLUMN channel TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN preset TEXT,
    ADD COLUMN modality TEXT,
    ADD COLUMN "audioInputTokens" INTEGER,
    ADD COLUMN "billingUnit" TEXT,
    ADD COLUMN quantity DOUBLE PRECISION;

-- Keep the original column order (including usd) for existing view consumers.
-- Verified 2026-11-25: Hydrogen lists a single standard input rate for its
-- full context window and a separate implicit cache-read rate.
-- https://aistudio.google.com/docs/pricing#gemini-4-hydrogen
-- Tavily credits use the public PAYG estimate. Geoapify credits are metered,
-- but the USD conversion depends on the operator's plan.
-- https://docs.tavily.com/documentation/api-credits
-- https://www.geoapify.com/pricing/
CREATE OR REPLACE VIEW analytics_priced_provider_attempt AS
WITH rates(provider, model, effective_from, input_usd, output_usd, cache_read_usd, max_input) AS (
    VALUES ('anthropic', 'claude-haiku-5-5', DATE '2026-11-21', 0.10, 0.50, NULL::numeric, 100000),
           ('gemini', 'gemini-4-hydrogen', DATE '2026-11-21', 1.50, 7.50, NULL, 100000),
           ('gemini', 'gemini-4-hydrogen', DATE '2026-11-25', 1.50, 7.50, 0.075, 1048576)
)
SELECT a."attemptId", a."operationId", a.feature, a.stage, a."startedAt", a."durationMs",
       a.environment, a.provider, a."requestedModel", a."returnedModel", a."serviceTier",
       a.outcome, a."completedAt", a."inputTokens", a."cacheReadTokens", a."cacheWriteTokens",
       a."cacheWrite5mTokens", a."cacheWrite1hTokens", a."outputTokens", a."thinkingTokens",
       a."toolUsePromptTokens", a."providerTotalTokens", a."promptTokens", a."candidateTokens",
       CASE WHEN a."billingUnit" IS NOT NULL THEN
                CASE WHEN a.quantity = 0 THEN 0
                     WHEN a.provider = 'tavily' AND a."billingUnit" = 'credit' AND a.quantity > 0
                          AND (a."startedAt" AT TIME ZONE 'UTC')::date >= DATE '2026-11-25'
                     THEN a.quantity::numeric * 0.008 END
            WHEN a."inputTokens" >= 0 AND a."outputTokens" >= 0
                 AND a."inputTokens"::bigint + coalesce(a."cacheReadTokens", 0) <= rate.max_input
                 AND (a."serviceTier" IS NULL
                      OR (a.provider = 'anthropic' AND a."serviceTier" = 'standard')
                      OR (a.provider = 'gemini' AND a."serviceTier" IN ('standard', 'ON_DEMAND')))
                 AND (coalesce(a."cacheReadTokens", 0) = 0 OR rate.cache_read_usd IS NOT NULL)
                 AND coalesce(a."cacheWriteTokens", 0) = 0 AND coalesce(a."cacheWrite5mTokens", 0) = 0
                 AND coalesce(a."cacheWrite1hTokens", 0) = 0 AND coalesce(a."toolUsePromptTokens", 0) = 0
            THEN (a."inputTokens" * rate.input_usd + a."outputTokens" * rate.output_usd
                  + coalesce(a."cacheReadTokens" * rate.cache_read_usd, 0)) / 1000000
       END AS usd,
       a.channel, a.preset, a.modality, a."audioInputTokens", a."billingUnit", a.quantity
FROM "ProviderCallAttempt" a
LEFT JOIN LATERAL (
    SELECT r.* FROM rates r
    WHERE r.provider = a.provider AND r.model = a."requestedModel"
      AND (a."returnedModel" IS NULL OR a."returnedModel" = r.model
           OR a."returnedModel" ~ ('^' || r.model || '-[0-9]{8}$'))
      AND r.effective_from <= (a."startedAt" AT TIME ZONE 'UTC')::date
    ORDER BY r.effective_from DESC LIMIT 1
) rate ON TRUE;
