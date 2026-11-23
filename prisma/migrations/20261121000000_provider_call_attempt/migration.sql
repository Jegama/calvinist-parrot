CREATE TABLE "ProviderCallAttempt" (
    "attemptId" UUID PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "environment" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    "returnedModel" TEXT,
    "serviceTier" TEXT,
    "outcome" TEXT NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "inputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "cacheWrite5mTokens" INTEGER,
    "cacheWrite1hTokens" INTEGER,
    "outputTokens" INTEGER,
    "thinkingTokens" INTEGER,
    "toolUsePromptTokens" INTEGER,
    "providerTotalTokens" INTEGER,
    "promptTokens" INTEGER,
    "candidateTokens" INTEGER
);

CREATE INDEX "ProviderCallAttempt_environment_feature_operationId_idx"
    ON "ProviderCallAttempt"("environment", "feature", "operationId");
CREATE INDEX "ProviderCallAttempt_startedAt_idx" ON "ProviderCallAttempt"("startedAt");
