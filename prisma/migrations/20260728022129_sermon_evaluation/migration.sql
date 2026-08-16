-- CreateEnum
CREATE TYPE "SermonFingerprintState" AS ENUM ('PROVISIONAL', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SermonUploadReservationState" AS ENUM ('PREPARED', 'FINALIZED', 'CONSUMED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SermonAudioAssetState" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "SermonEvaluationPreset" AS ENUM ('STANDARD', 'HIGH_CONFIDENCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SermonEvaluationStatus" AS ENUM ('QUEUED', 'PREPARING_AUDIO', 'EXTRACTING', 'SCORING', 'HARMONIZING', 'CALIBRATING', 'SUMMARIZING', 'COMPLETE', 'COMPLETE_WITH_WARNINGS', 'FAILED', 'TIMED_OUT', 'CANCELED');

-- CreateEnum
CREATE TYPE "SermonScoringRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SermonScoringAttemptStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELED');

-- CreateEnum
CREATE TYPE "SermonEvaluationAttemptOutcome" AS ENUM ('COMPLETE', 'COMPLETE_WITH_WARNINGS', 'FAILED', 'TIMED_OUT', 'CANCELED');

-- CreateEnum
CREATE TYPE "SermonRunCreditReservationState" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "SermonReportFormat" AS ENUM ('MARKDOWN', 'JSON', 'CSV');

-- CreateTable
CREATE TABLE "sermonPreacher" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonPreacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonAudioFingerprint" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "verificationState" "SermonFingerprintState" NOT NULL DEFAULT 'PROVISIONAL',
    "runCreditsLimit" INTEGER NOT NULL DEFAULT 9,
    "runCreditsReserved" INTEGER NOT NULL DEFAULT 0,
    "runCreditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "sermonAudioFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonUploadReservation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "claimedSha256" CHAR(64) NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "requestedPreset" "SermonEvaluationPreset" NOT NULL,
    "requestedRuns" INTEGER NOT NULL,
    "appwriteBucketId" TEXT NOT NULL,
    "appwriteFileId" TEXT NOT NULL,
    "state" "SermonUploadReservationState" NOT NULL DEFAULT 'PREPARED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fingerprintId" TEXT,
    "reattachEvaluationId" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonUploadReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonAudioAsset" (
    "id" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "appwriteBucketId" TEXT,
    "appwriteFileId" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "referenceCount" INTEGER NOT NULL DEFAULT 0,
    "verificationState" "SermonAudioAssetState" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonAudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonEvaluation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "preacherId" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "audioAssetId" TEXT,
    "sourceEvaluationId" TEXT,
    "title" TEXT NOT NULL,
    "preachedOn" DATE NOT NULL,
    "preset" "SermonEvaluationPreset" NOT NULL,
    "requestedRuns" INTEGER NOT NULL,
    "completedRuns" INTEGER NOT NULL DEFAULT 0,
    "retryWave" INTEGER NOT NULL DEFAULT 0,
    "status" "SermonEvaluationStatus" NOT NULL DEFAULT 'QUEUED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "attemptDeadlineAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "durationAdjustmentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "durationPolicyUpdatedAt" TIMESTAMP(3),
    "durationPolicyUpdatedBy" TEXT,
    "overallImpactBase" DOUBLE PRECISION,
    "calculatedDurationPenalty" DOUBLE PRECISION,
    "overallImpactAdjusted" DOUBLE PRECISION,
    "result" JSONB,
    "provenance" JSONB,
    "warningCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonScoringRun" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "status" "SermonScoringRunStatus" NOT NULL DEFAULT 'PENDING',
    "finalSeed" INTEGER,
    "rawScore" JSONB,
    "confidence" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonScoringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonScoringAttempt" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "scoringRunId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "status" "SermonScoringAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "providerResponseId" TEXT,
    "providerModelVersion" TEXT,
    "structuredResult" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonScoringAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonEvaluationAttempt" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "appwriteExecutionId" TEXT,
    "resumeReason" TEXT,
    "terminalOutcome" "SermonEvaluationAttemptOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonEvaluationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonRunCreditReservation" (
    "id" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "requestedCredits" INTEGER NOT NULL,
    "preset" "SermonEvaluationPreset" NOT NULL,
    "state" "SermonRunCreditReservationState" NOT NULL DEFAULT 'RESERVED',
    "actorId" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonRunCreditReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonAdminAuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "ownerId" TEXT,
    "action" TEXT NOT NULL,
    "requestedRunCount" INTEGER,
    "reasonCode" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sermonAdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermonWorkerLease" (
    "slotId" INTEGER NOT NULL,
    "leaseOwner" TEXT,
    "evaluationId" TEXT,
    "evaluationAttemptId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sermonWorkerLease_pkey" PRIMARY KEY ("slotId")
);

-- CreateTable
CREATE TABLE "sermonReportArtifact" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "format" "SermonReportFormat" NOT NULL,
    "content" BYTEA NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "reportVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sermonReportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sermonPreacher_ownerId_idx" ON "sermonPreacher"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "sermonPreacher_ownerId_normalizedName_key" ON "sermonPreacher"("ownerId", "normalizedName");

-- CreateIndex
CREATE INDEX "sermonAudioFingerprint_ownerId_verificationState_idx" ON "sermonAudioFingerprint"("ownerId", "verificationState");

-- CreateIndex
CREATE UNIQUE INDEX "sermonAudioFingerprint_ownerId_sha256_key" ON "sermonAudioFingerprint"("ownerId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "sermonUploadReservation_appwriteFileId_key" ON "sermonUploadReservation"("appwriteFileId");

-- CreateIndex
CREATE INDEX "sermonUploadReservation_ownerId_claimedSha256_idx" ON "sermonUploadReservation"("ownerId", "claimedSha256");

-- CreateIndex
CREATE INDEX "sermonUploadReservation_state_expiresAt_idx" ON "sermonUploadReservation"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "sermonUploadReservation_fingerprintId_idx" ON "sermonUploadReservation"("fingerprintId");

-- CreateIndex
CREATE UNIQUE INDEX "sermonAudioAsset_fingerprintId_key" ON "sermonAudioAsset"("fingerprintId");

-- CreateIndex
CREATE UNIQUE INDEX "sermonAudioAsset_appwriteFileId_key" ON "sermonAudioAsset"("appwriteFileId");

-- CreateIndex
CREATE INDEX "sermonAudioAsset_verificationState_idx" ON "sermonAudioAsset"("verificationState");

-- CreateIndex
CREATE INDEX "sermonAudioAsset_deletedAt_idx" ON "sermonAudioAsset"("deletedAt");

-- CreateIndex
CREATE INDEX "sermonEvaluation_ownerId_status_idx" ON "sermonEvaluation"("ownerId", "status");

-- CreateIndex
CREATE INDEX "sermonEvaluation_ownerId_preachedOn_idx" ON "sermonEvaluation"("ownerId", "preachedOn");

-- CreateIndex
CREATE INDEX "sermonEvaluation_ownerId_fingerprintId_idx" ON "sermonEvaluation"("ownerId", "fingerprintId");

-- CreateIndex
CREATE INDEX "sermonEvaluation_fingerprintId_createdAt_idx" ON "sermonEvaluation"("fingerprintId", "createdAt");

-- CreateIndex
CREATE INDEX "sermonEvaluation_preacherId_preachedOn_idx" ON "sermonEvaluation"("preacherId", "preachedOn");

-- CreateIndex
CREATE INDEX "sermonEvaluation_status_createdAt_idx" ON "sermonEvaluation"("status", "createdAt");

-- Recovery scans completed evaluations with duration policy updates to find
-- report sets whose newest artifact predates the durable policy timestamp.
CREATE INDEX "sermonEvaluation_status_durationPolicyUpdatedAt_idx" ON "sermonEvaluation"("status", "durationPolicyUpdatedAt");

-- CreateIndex
CREATE INDEX "sermonEvaluation_ownerId_durationAdjustmentEnabled_preached_idx" ON "sermonEvaluation"("ownerId", "durationAdjustmentEnabled", "preachedOn");

-- CreateIndex
CREATE INDEX "sermonScoringRun_evaluationId_status_idx" ON "sermonScoringRun"("evaluationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sermonScoringRun_evaluationId_ordinal_key" ON "sermonScoringRun"("evaluationId", "ordinal");

-- CreateIndex
CREATE INDEX "sermonScoringAttempt_evaluationId_status_idx" ON "sermonScoringAttempt"("evaluationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sermonScoringAttempt_scoringRunId_attemptNumber_key" ON "sermonScoringAttempt"("scoringRunId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sermonScoringAttempt_evaluationId_seed_key" ON "sermonScoringAttempt"("evaluationId", "seed");

-- CreateIndex
CREATE INDEX "sermonEvaluationAttempt_evaluationId_deadlineAt_idx" ON "sermonEvaluationAttempt"("evaluationId", "deadlineAt");

-- CreateIndex
CREATE INDEX "sermonEvaluationAttempt_appwriteExecutionId_idx" ON "sermonEvaluationAttempt"("appwriteExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "sermonEvaluationAttempt_evaluationId_attemptNumber_key" ON "sermonEvaluationAttempt"("evaluationId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sermonRunCreditReservation_evaluationId_key" ON "sermonRunCreditReservation"("evaluationId");

-- CreateIndex
CREATE INDEX "sermonRunCreditReservation_actorId_reservedAt_idx" ON "sermonRunCreditReservation"("actorId", "reservedAt");

-- CreateIndex
CREATE INDEX "sermonRunCreditReservation_fingerprintId_state_idx" ON "sermonRunCreditReservation"("fingerprintId", "state");

-- CreateIndex
CREATE INDEX "sermonAdminAuditEvent_actorId_action_createdAt_idx" ON "sermonAdminAuditEvent"("actorId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "sermonAdminAuditEvent_evaluationId_createdAt_idx" ON "sermonAdminAuditEvent"("evaluationId", "createdAt");

-- CreateIndex
CREATE INDEX "sermonWorkerLease_leaseExpiresAt_idx" ON "sermonWorkerLease"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "sermonWorkerLease_evaluationId_idx" ON "sermonWorkerLease"("evaluationId");

-- CreateIndex
CREATE INDEX "sermonWorkerLease_evaluationAttemptId_idx" ON "sermonWorkerLease"("evaluationAttemptId");

-- CreateIndex
CREATE INDEX "sermonReportArtifact_evaluationId_createdAt_idx" ON "sermonReportArtifact"("evaluationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sermonReportArtifact_evaluationId_format_reportVersion_key" ON "sermonReportArtifact"("evaluationId", "format", "reportVersion");

-- Prisma cannot express partial indexes. Only one nonterminal evaluation may
-- exist for an owner, while terminal history remains unlimited.
CREATE UNIQUE INDEX "sermonEvaluation_one_active_per_owner_key"
ON "sermonEvaluation" ("ownerId")
WHERE "deletedAt" IS NULL
  AND "status" IN (
    'QUEUED',
    'PREPARING_AUDIO',
    'EXTRACTING',
    'SCORING',
    'HARMONIZING',
    'CALIBRATING',
    'SUMMARIZING'
  );

-- Database constraints are shared by Prisma and the least-privileged Python
-- worker, so invariants cannot be bypassed by either runtime.
ALTER TABLE "sermonAudioFingerprint"
ADD CONSTRAINT "sermonAudioFingerprint_sha256_check"
  CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "sermonAudioFingerprint_credit_limit_check"
  CHECK ("runCreditsLimit" = 9),
ADD CONSTRAINT "sermonAudioFingerprint_credit_balance_check"
  CHECK (
    "runCreditsReserved" >= 0
    AND "runCreditsConsumed" >= 0
    AND "runCreditsReserved" + "runCreditsConsumed" <= "runCreditsLimit"
  );

ALTER TABLE "sermonUploadReservation"
ADD CONSTRAINT "sermonUploadReservation_sha256_check"
  CHECK ("claimedSha256" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "sermonUploadReservation_byte_size_check"
  CHECK ("byteSize" BETWEEN 1 AND 62914560),
ADD CONSTRAINT "sermonUploadReservation_run_count_check"
  CHECK ("requestedRuns" BETWEEN 1 AND 9),
ADD CONSTRAINT "sermonUploadReservation_preset_run_count_check"
  CHECK (
    ("requestedPreset" = 'STANDARD' AND "requestedRuns" = 1)
    OR ("requestedPreset" = 'HIGH_CONFIDENCE' AND "requestedRuns" = 3)
    OR ("requestedPreset" = 'CUSTOM' AND "requestedRuns" BETWEEN 1 AND 9)
  ),
ADD CONSTRAINT "sermonUploadReservation_mime_type_check"
  CHECK ("mimeType" IN ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave'));

ALTER TABLE "sermonAudioAsset"
ADD CONSTRAINT "sermonAudioAsset_byte_size_check"
  CHECK ("byteSize" BETWEEN 1 AND 62914560),
ADD CONSTRAINT "sermonAudioAsset_duration_check"
  CHECK ("durationSeconds" IS NULL OR "durationSeconds" BETWEEN 0 AND 10800),
ADD CONSTRAINT "sermonAudioAsset_reference_count_check"
  CHECK ("referenceCount" >= 0),
ADD CONSTRAINT "sermonAudioAsset_storage_pointer_check"
  CHECK (
    (
      "verificationState" = 'DELETED'
      AND "deletedAt" IS NOT NULL
      AND (
        ("appwriteBucketId" IS NULL AND "appwriteFileId" IS NULL)
        OR ("appwriteBucketId" IS NOT NULL AND "appwriteFileId" IS NOT NULL)
      )
    )
    OR (
      "verificationState" = 'REJECTED'
      AND "deletedAt" IS NULL
      AND (
        ("appwriteBucketId" IS NULL AND "appwriteFileId" IS NULL)
        OR ("appwriteBucketId" IS NOT NULL AND "appwriteFileId" IS NOT NULL)
      )
    )
    OR (
      "verificationState" NOT IN ('DELETED', 'REJECTED')
      AND "appwriteBucketId" IS NOT NULL
      AND "appwriteFileId" IS NOT NULL
      AND "deletedAt" IS NULL
    )
  );

ALTER TABLE "sermonEvaluation"
ADD CONSTRAINT "sermonEvaluation_run_count_check"
  CHECK ("requestedRuns" BETWEEN 1 AND 9 AND "completedRuns" BETWEEN 0 AND "requestedRuns"),
ADD CONSTRAINT "sermonEvaluation_preset_run_count_check"
  CHECK (
    ("preset" = 'STANDARD' AND "requestedRuns" = 1)
    OR ("preset" = 'HIGH_CONFIDENCE' AND "requestedRuns" = 3)
    OR ("preset" = 'CUSTOM' AND "requestedRuns" BETWEEN 1 AND 9)
  ),
ADD CONSTRAINT "sermonEvaluation_version_check"
  CHECK ("version" >= 0 AND "retryWave" BETWEEN 0 AND 3),
ADD CONSTRAINT "sermonEvaluation_duration_score_check"
  CHECK (
    ("overallImpactBase" IS NULL OR "overallImpactBase" BETWEEN 0 AND 5)
    AND ("calculatedDurationPenalty" IS NULL OR "calculatedDurationPenalty" >= 0)
    AND ("overallImpactAdjusted" IS NULL OR "overallImpactAdjusted" BETWEEN 0 AND 5)
  );

ALTER TABLE "sermonScoringRun"
ADD CONSTRAINT "sermonScoringRun_ordinal_check"
  CHECK ("ordinal" BETWEEN 1 AND 9),
ADD CONSTRAINT "sermonScoringRun_confidence_check"
  CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1);

ALTER TABLE "sermonScoringAttempt"
ADD CONSTRAINT "sermonScoringAttempt_number_check"
  CHECK ("attemptNumber" BETWEEN 1 AND 3),
ADD CONSTRAINT "sermonScoringAttempt_seed_check"
  CHECK ("seed" BETWEEN 0 AND 2147483647);

ALTER TABLE "sermonEvaluationAttempt"
ADD CONSTRAINT "sermonEvaluationAttempt_number_check"
  CHECK ("attemptNumber" >= 1),
ADD CONSTRAINT "sermonEvaluationAttempt_deadline_check"
  CHECK ("endedAt" IS NULL OR "startedAt" IS NULL OR "endedAt" >= "startedAt");

ALTER TABLE "sermonRunCreditReservation"
ADD CONSTRAINT "sermonRunCreditReservation_credit_check"
  CHECK ("requestedCredits" BETWEEN 1 AND 9),
ADD CONSTRAINT "sermonRunCreditReservation_preset_credit_check"
  CHECK (
    ("preset" = 'STANDARD' AND "requestedCredits" = 1)
    OR ("preset" = 'HIGH_CONFIDENCE' AND "requestedCredits" = 3)
    OR ("preset" = 'CUSTOM' AND "requestedCredits" BETWEEN 1 AND 9)
  ),
ADD CONSTRAINT "sermonRunCreditReservation_lifecycle_check"
  CHECK (
    ("state" = 'RESERVED' AND "consumedAt" IS NULL AND "releasedAt" IS NULL)
    OR ("state" = 'CONSUMED' AND "consumedAt" IS NOT NULL AND "releasedAt" IS NULL)
    OR ("state" = 'RELEASED' AND "releasedAt" IS NOT NULL AND "consumedAt" IS NULL)
  );

ALTER TABLE "sermonWorkerLease"
ADD CONSTRAINT "sermonWorkerLease_slot_check"
  CHECK ("slotId" IN (1, 2)),
ADD CONSTRAINT "sermonWorkerLease_claim_check"
  CHECK (
    ("leaseOwner" IS NULL AND "evaluationId" IS NULL AND "evaluationAttemptId" IS NULL AND "leaseExpiresAt" IS NULL)
    OR ("leaseOwner" IS NOT NULL AND "evaluationId" IS NOT NULL AND "evaluationAttemptId" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
  );

ALTER TABLE "sermonReportArtifact"
ADD CONSTRAINT "sermonReportArtifact_checksum_check"
  CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "sermonReportArtifact_version_check"
  CHECK ("reportVersion" >= 1);

INSERT INTO "sermonWorkerLease" ("slotId", "updatedAt")
VALUES (1, CURRENT_TIMESTAMP), (2, CURRENT_TIMESTAMP);

-- AddForeignKey
ALTER TABLE "sermonUploadReservation" ADD CONSTRAINT "sermonUploadReservation_fingerprintId_fkey" FOREIGN KEY ("fingerprintId") REFERENCES "sermonAudioFingerprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonUploadReservation" ADD CONSTRAINT "sermonUploadReservation_reattachEvaluationId_fkey" FOREIGN KEY ("reattachEvaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonAudioAsset" ADD CONSTRAINT "sermonAudioAsset_fingerprintId_fkey" FOREIGN KEY ("fingerprintId") REFERENCES "sermonAudioFingerprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonEvaluation" ADD CONSTRAINT "sermonEvaluation_preacherId_fkey" FOREIGN KEY ("preacherId") REFERENCES "sermonPreacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonEvaluation" ADD CONSTRAINT "sermonEvaluation_fingerprintId_fkey" FOREIGN KEY ("fingerprintId") REFERENCES "sermonAudioFingerprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonEvaluation" ADD CONSTRAINT "sermonEvaluation_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "sermonAudioAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonEvaluation" ADD CONSTRAINT "sermonEvaluation_sourceEvaluationId_fkey" FOREIGN KEY ("sourceEvaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonScoringRun" ADD CONSTRAINT "sermonScoringRun_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonScoringAttempt" ADD CONSTRAINT "sermonScoringAttempt_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonScoringAttempt" ADD CONSTRAINT "sermonScoringAttempt_scoringRunId_fkey" FOREIGN KEY ("scoringRunId") REFERENCES "sermonScoringRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonEvaluationAttempt" ADD CONSTRAINT "sermonEvaluationAttempt_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonRunCreditReservation" ADD CONSTRAINT "sermonRunCreditReservation_fingerprintId_fkey" FOREIGN KEY ("fingerprintId") REFERENCES "sermonAudioFingerprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonRunCreditReservation" ADD CONSTRAINT "sermonRunCreditReservation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonAdminAuditEvent" ADD CONSTRAINT "sermonAdminAuditEvent_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonWorkerLease" ADD CONSTRAINT "sermonWorkerLease_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonWorkerLease" ADD CONSTRAINT "sermonWorkerLease_evaluationAttemptId_fkey" FOREIGN KEY ("evaluationAttemptId") REFERENCES "sermonEvaluationAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sermonReportArtifact" ADD CONSTRAINT "sermonReportArtifact_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "sermonEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
