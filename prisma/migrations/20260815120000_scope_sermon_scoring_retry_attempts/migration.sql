-- Preserve scoring-attempt history while giving each durable evaluation attempt
-- its own three-attempt budget.
ALTER TABLE "sermonScoringAttempt"
ADD COLUMN "evaluationAttemptId" TEXT;

UPDATE "sermonScoringAttempt" scoring_attempt
SET "evaluationAttemptId" = (
  SELECT attempt."id"
  FROM "sermonEvaluationAttempt" attempt
  WHERE attempt."evaluationId" = scoring_attempt."evaluationId"
    AND COALESCE(attempt."startedAt", attempt."createdAt")
      <= scoring_attempt."createdAt"
  ORDER BY attempt."attemptNumber" DESC
  LIMIT 1
);

-- The durable worker always creates an evaluation attempt before it records a
-- scoring attempt. Fail deployment instead of silently losing that invariant.
ALTER TABLE "sermonScoringAttempt"
ALTER COLUMN "evaluationAttemptId" SET NOT NULL;

DROP INDEX "sermonScoringAttempt_scoringRunId_attemptNumber_key";

CREATE UNIQUE INDEX "sermonScoringAttempt_scoringRunId_evaluationAttemptId_attemptNumber_key"
ON "sermonScoringAttempt"("scoringRunId", "evaluationAttemptId", "attemptNumber");

CREATE INDEX "sermonScoringAttempt_evaluationAttemptId_idx"
ON "sermonScoringAttempt"("evaluationAttemptId");

ALTER TABLE "sermonScoringAttempt"
ADD CONSTRAINT "sermonScoringAttempt_evaluationAttemptId_fkey"
FOREIGN KEY ("evaluationAttemptId") REFERENCES "sermonEvaluationAttempt"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
