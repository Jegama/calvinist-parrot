-- Token tariffs, cache tiers and the returned model come from the shared model
-- pricing view. Service credits use their own dated rate. Keep the evaluation
-- view's column order and append the chat fields so existing queries still work.
CREATE OR REPLACE VIEW analytics_priced_provider_attempt AS
SELECT m."attemptId", m."operationId", m.feature, m.stage, m."startedAt", m."durationMs",
       m.environment, m.provider, m."requestedModel", m."returnedModel", m."serviceTier",
       m.outcome, m."completedAt", m."inputTokens", m."cacheReadTokens", m."cacheWriteTokens",
       m."cacheWrite5mTokens", m."cacheWrite1hTokens", m."outputTokens", m."thinkingTokens",
       m."toolUsePromptTokens", m."providerTotalTokens", m."promptTokens", m."candidateTokens",
       CASE WHEN a."billingUnit" IS NULL THEN m.usd
            WHEN a.quantity = 0 THEN 0
            WHEN a.provider = 'tavily' AND a."billingUnit" = 'credit' AND a.quantity > 0
                 AND (a."startedAt" AT TIME ZONE 'UTC')::date >= DATE '2026-11-25'
            THEN a.quantity::numeric * 0.008
       END AS usd,
       a.channel, a.preset, a.modality, a."audioInputTokens", a."billingUnit", a.quantity,
       m."isRetry", m."cacheWrite30mTokens", m."cacheWrite12hTokens"
FROM analytics_priced_model_attempt m
JOIN "ProviderCallAttempt" a USING ("attemptId");
