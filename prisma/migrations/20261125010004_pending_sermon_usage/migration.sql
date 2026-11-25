-- Keep the date and stage of a dispatch until its first receipt is committed.
CREATE TABLE "sermonPendingUsageAttempt" (
    "attemptId" UUID PRIMARY KEY,
    "evaluationId" TEXT NOT NULL REFERENCES "sermonEvaluation"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    stage TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    modality TEXT NOT NULL
);
CREATE INDEX "sermonPendingUsageAttempt_evaluationId_idx" ON "sermonPendingUsageAttempt" ("evaluationId");

CREATE VIEW analytics_evaluation_attempt AS
SELECT "attemptId", "operationId", "startedAt", environment, feature, channel, stage, preset, provider,
       "requestedModel", "returnedModel", modality, outcome, "billingUnit", quantity, "inputTokens", "outputTokens", usd
FROM analytics_priced_provider_attempt WHERE feature IN ('church', 'sermon')
UNION ALL
SELECT p."attemptId", e.id, p."startedAt", e."usageEnvironment", 'sermon', e.channel, p.stage, e.preset::text, 'gemini',
       p."requestedModel", NULL, p.modality, 'started', NULL, NULL, NULL, NULL, NULL
FROM "sermonPendingUsageAttempt" p JOIN "sermonEvaluation" e ON e.id = p."evaluationId";
