-- Standard on-demand rates from #96, USD per million tokens. Unsupported
-- rates and token buckets deliberately leave the estimated cost NULL.
CREATE VIEW analytics_priced_provider_attempt AS
WITH rates(provider, model, effective_from, input_usd, output_usd) AS (
    VALUES ('anthropic', 'claude-haiku-5-5', DATE '2026-11-21', 0.10, 0.50),
           ('gemini', 'gemini-4-hydrogen', DATE '2026-11-21', 1.50, 7.50)
)
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
    ) rate ON TRUE;
