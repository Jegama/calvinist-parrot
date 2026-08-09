-- Remove the retired deterministic-calibration stage.
ALTER TYPE "SermonEvaluationStatus" RENAME VALUE 'CALIBRATING' TO 'AGGREGATING';

-- Fence workers that were started with the v1 rubric before replacing any
-- durable stage output. A fenced worker will fail its next lease-scoped write,
-- while the replacement worker can start a fresh evaluation attempt.
UPDATE "sermonWorkerLease" lease
SET
  "leaseOwner" = NULL,
  "evaluationId" = NULL,
  "evaluationAttemptId" = NULL,
  "leaseExpiresAt" = NULL,
  "heartbeatAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE lease."evaluationId" IN (
  SELECT evaluation."id"
  FROM "sermonEvaluation" evaluation
  WHERE evaluation."status" IN (
    'PREPARING_AUDIO', 'EXTRACTING', 'SCORING', 'HARMONIZING',
    'AGGREGATING', 'SUMMARIZING'
  )
);

-- End the fenced attempt without a terminal evaluation outcome. Requeuing below
-- lets scheduled recovery create a new 15-minute attempt instead of trying to
-- repeat extraction inside whatever little time remained on the v1 deadline.
UPDATE "sermonEvaluationAttempt" attempt
SET
  "endedAt" = CURRENT_TIMESTAMP,
  "resumeReason" = 'rubric-v2-requeued',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "sermonEvaluation" evaluation
WHERE attempt."evaluationId" = evaluation."id"
  AND attempt."endedAt" IS NULL
  AND evaluation."status" IN (
    'EXTRACTING', 'SCORING', 'HARMONIZING', 'AGGREGATING', 'SUMMARIZING'
  );

-- Persisted v1 extraction and scoring payloads do not contain the v2 evidence,
-- rubric sections, or illustration-ethics score. Restart every evaluation that
-- reached extraction from its durable audio reference and discard only the
-- incompatible downstream outputs. Deleting scoring runs also cascades to
-- their attempt rows.
DELETE FROM "sermonScoringRun" run
WHERE run."evaluationId" IN (
  SELECT evaluation."id"
  FROM "sermonEvaluation" evaluation
  WHERE evaluation."status" IN (
    'EXTRACTING', 'SCORING', 'HARMONIZING', 'AGGREGATING', 'SUMMARIZING'
  )
);

UPDATE "sermonEvaluation"
SET
  "status" = 'QUEUED',
  "completedRuns" = 0,
  "retryWave" = 0,
  "attemptDeadlineAt" = NULL,
  "startedAt" = NULL,
  "result" = COALESCE("result", '{}'::jsonb)
    - 'extraction'
    - 'scoringRuns'
    - 'harmonized'
    - 'scoring'
    - 'warningCodes'
    - 'provenance',
  "provenance" = NULL,
  "warningCodes" = ARRAY[]::text[],
  "overallImpactBase" = NULL,
  "calculatedDurationPenalty" = NULL,
  "overallImpactAdjusted" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP,
  "version" = "version" + 1
WHERE "status" IN (
  'EXTRACTING', 'SCORING', 'HARMONIZING', 'AGGREGATING', 'SUMMARIZING'
);
