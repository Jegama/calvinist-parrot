-- A reservation is only a temporary capacity hold. Credits become consumed
-- when their evaluation completes, and only for the scoring rounds that
-- actually completed. Terminal failures consume nothing.
BEGIN;

ALTER TABLE "sermonRunCreditReservation"
ADD COLUMN IF NOT EXISTS "consumedCredits" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "sermonRunCreditReservation"
DROP CONSTRAINT IF EXISTS "sermonRunCreditReservation_lifecycle_check";

-- Capture the legacy ledger contribution before reconciling terminal rows.
UPDATE "sermonRunCreditReservation"
SET "consumedCredits" = "requestedCredits"
WHERE "state" = 'CONSUMED';

-- The v1 worker consumed the full reservation when scoring began. Active work
-- must return to a settleable reservation so the v2 worker can charge only the
-- scoring rounds that eventually complete (or release everything on failure).
UPDATE "sermonRunCreditReservation" reservation
SET
  "state" = 'RESERVED',
  "consumedCredits" = 0,
  "consumedAt" = NULL,
  "releasedAt" = NULL,
  "releaseReason" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "sermonEvaluation" evaluation
WHERE reservation."evaluationId" = evaluation."id"
  AND reservation."state" = 'CONSUMED'
  AND evaluation."status" IN (
    'QUEUED', 'PREPARING_AUDIO', 'EXTRACTING', 'SCORING',
    'HARMONIZING', 'AGGREGATING', 'SUMMARIZING'
  );

UPDATE "sermonRunCreditReservation" reservation
SET
  "consumedCredits" = settlement."successfulCredits",
  "state" = CASE
    WHEN settlement."successfulCredits" > 0
      THEN 'CONSUMED'::"SermonRunCreditReservationState"
    ELSE 'RELEASED'::"SermonRunCreditReservationState"
  END,
  "consumedAt" = CASE
    WHEN settlement."successfulCredits" > 0
      THEN COALESCE(reservation."consumedAt", CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  "releasedAt" = CASE
    WHEN settlement."successfulCredits" < reservation."requestedCredits"
      THEN COALESCE(reservation."releasedAt", CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  "releaseReason" = CASE
    WHEN settlement."successfulCredits" = reservation."requestedCredits"
      THEN NULL
    WHEN settlement."completedSuccessfully"
      THEN 'UNUSED_SCORING_RUNS'
    ELSE 'TERMINAL_EVALUATION_NOT_CHARGED'
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT
    evaluation."id" AS "evaluationId",
    evaluation."status" IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS')
      AS "completedSuccessfully",
    CASE
      WHEN evaluation."status" IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS')
        THEN LEAST(
          credit."requestedCredits",
          GREATEST(evaluation."completedRuns", 0)
        )
      ELSE 0
    END AS "successfulCredits"
  FROM "sermonEvaluation" evaluation
  JOIN "sermonRunCreditReservation" credit
    ON credit."evaluationId" = evaluation."id"
  WHERE evaluation."status" IN (
    'COMPLETE', 'COMPLETE_WITH_WARNINGS', 'FAILED', 'TIMED_OUT', 'CANCELED'
  )
) settlement
WHERE reservation."evaluationId" = settlement."evaluationId";

-- Recompute counters from the normalized reservation ledger instead of
-- applying deltas. This also repairs any drift left by older failed attempts.
WITH reservation_totals AS (
  SELECT
    "fingerprintId",
    COALESCE(
      SUM("requestedCredits") FILTER (WHERE "state" = 'RESERVED'),
      0
    )::integer AS "reservedCredits",
    COALESCE(
      SUM("consumedCredits") FILTER (WHERE "state" = 'CONSUMED'),
      0
    )::integer AS "consumedCredits"
  FROM "sermonRunCreditReservation"
  GROUP BY "fingerprintId"
)
UPDATE "sermonAudioFingerprint" fingerprint
SET
  "runCreditsReserved" = reservation_totals."reservedCredits",
  "runCreditsConsumed" = reservation_totals."consumedCredits",
  "lastSeenAt" = CURRENT_TIMESTAMP
FROM reservation_totals
WHERE fingerprint."id" = reservation_totals."fingerprintId";

ALTER TABLE "sermonRunCreditReservation"
DROP CONSTRAINT IF EXISTS "sermonRunCreditReservation_consumed_credits_check";

ALTER TABLE "sermonRunCreditReservation"
ADD CONSTRAINT "sermonRunCreditReservation_consumed_credits_check"
CHECK (
  "consumedCredits" >= 0
  AND "consumedCredits" <= "requestedCredits"
),
ADD CONSTRAINT "sermonRunCreditReservation_lifecycle_check"
CHECK (
  (
    "state" = 'RESERVED'
    AND "consumedCredits" = 0
    AND "consumedAt" IS NULL
    AND "releasedAt" IS NULL
  )
  OR (
    "state" = 'CONSUMED'
    AND "consumedCredits" > 0
    AND "consumedAt" IS NOT NULL
    AND (
      ("consumedCredits" = "requestedCredits" AND "releasedAt" IS NULL)
      OR ("consumedCredits" < "requestedCredits" AND "releasedAt" IS NOT NULL)
    )
  )
  OR (
    "state" = 'RELEASED'
    AND "consumedCredits" = 0
    AND "releasedAt" IS NOT NULL
    AND "consumedAt" IS NULL
  )
);

COMMIT;
