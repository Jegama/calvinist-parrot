BEGIN;

-- PostgreSQL only allows CREATE OR REPLACE VIEW to append columns. Keep the
-- existing pricing calculation and its dependents when publishing the new order.
ALTER VIEW analytics_priced_provider_attempt RENAME TO analytics_provider_attempt_pricing;

CREATE VIEW analytics_priced_provider_attempt AS
SELECT "attemptId", "operationId", feature, stage, "startedAt", "durationMs",
       environment, provider, "requestedModel", "returnedModel", "serviceTier",
       outcome, "completedAt", "inputTokens", "cacheReadTokens", "cacheWriteTokens",
       "cacheWrite5mTokens", "cacheWrite1hTokens", "outputTokens", "thinkingTokens",
       "toolUsePromptTokens", "providerTotalTokens", "promptTokens", "candidateTokens",
       usd, "isRetry", "cacheWrite30mTokens", "cacheWrite12hTokens",
       channel, preset, modality, "audioInputTokens", "billingUnit", quantity
FROM analytics_provider_attempt_pricing;

COMMIT;
