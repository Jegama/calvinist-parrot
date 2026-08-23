import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260728022129_sermon_evaluation/migration.sql",
  ),
  "utf8",
);
const rubricV2Migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260808120000_sermon_evaluation_rubric_v2/migration.sql",
  ),
  "utf8",
);
const successfulCreditSettlementMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260808221500_successful_sermon_run_credit_settlement/migration.sql",
  ),
  "utf8",
);
const rejectedAudioCleanupMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260808223000_align_rejected_audio_cleanup_constraint/migration.sql",
  ),
  "utf8",
);
const raisedAudioLimitMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260809120000_raise_sermon_audio_limit/migration.sql",
  ),
  "utf8",
);
const scopedScoringRetriesMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260815120000_scope_sermon_scoring_retry_attempts/migration.sql",
  ),
  "utf8",
);
describe("sermon evaluation migration invariants", () => {
  it("enforces one active evaluation per owner with a partial index", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "sermonEvaluation_one_active_per_owner_key"',
    );
    expect(migration).toContain('"status" IN (');
    expect(migration).not.toMatch(
      /"sermonEvaluation_one_active_per_owner_key"[\s\S]*?'COMPLETE'/,
    );
  });

  it("enforces the fixed lifetime budget and exact hash identity", () => {
    expect(migration).toContain(
      'CHECK ("runCreditsLimit" = 9)',
    );
    expect(migration).toContain(
      '"runCreditsReserved" + "runCreditsConsumed" <= "runCreditsLimit"',
    );
    expect(migration).toContain(
      `CHECK ("sha256" ~ '^[0-9a-f]{64}$')`,
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "sermonAudioFingerprint_ownerId_sha256_key"',
    );
  });

  it("seeds exactly two global worker lease slots", () => {
    expect(migration).toContain(
      'CHECK ("slotId" IN (1, 2))',
    );
    expect(migration).toContain(
      'VALUES (1, CURRENT_TIMESTAMP), (2, CURRENT_TIMESTAMP)',
    );
    expect(migration).toContain(
      '"sermonWorkerLease_evaluationAttemptId_fkey"',
    );
    expect(migration).toContain(
      '"sermonWorkerLease_evaluationAttemptId_idx"',
    );
  });

  it("keeps the preserved impact scale capable of representing 5.0", () => {
    expect(migration).toContain(
      '"overallImpactBase" BETWEEN 0 AND 5',
    );
    expect(migration).toContain(
      '"overallImpactAdjusted" BETWEEN 0 AND 5',
    );
  });

  it("retains a recoverable Appwrite pointer while audio cleanup is pending", () => {
    expect(migration).toContain(
      `"verificationState" = 'DELETED'`,
    );
    expect(migration).toContain(
      '"appwriteBucketId" IS NOT NULL AND "appwriteFileId" IS NOT NULL',
    );
    expect(migration).toContain(
      '"appwriteBucketId" IS NULL AND "appwriteFileId" IS NULL',
    );
  });

  it("indexes the durable duration-policy timestamp for stale-report recovery", () => {
    expect(migration).toContain(
      '"sermonEvaluation_status_durationPolicyUpdatedAt_idx"',
    );
    expect(migration).toContain(
      '("status", "durationPolicyUpdatedAt")',
    );
  });

  it("charges only completed scoring rounds and releases terminal failures", () => {
    expect(successfulCreditSettlementMigration).toContain(
      'ADD COLUMN IF NOT EXISTS "consumedCredits" INTEGER NOT NULL DEFAULT 0',
    );
    expect(successfulCreditSettlementMigration).toContain(
      "THEN LEAST(",
    );
    expect(successfulCreditSettlementMigration).toContain(
      "ELSE 'TERMINAL_EVALUATION_NOT_CHARGED'",
    );
    expect(successfulCreditSettlementMigration).toContain(
      '"consumedCredits" <= "requestedCredits"',
    );
    expect(successfulCreditSettlementMigration).toContain(
      'reservation."state" = \'CONSUMED\'',
    );
    expect(successfulCreditSettlementMigration).toContain(
      '"state" = \'RESERVED\'',
    );
    expect(successfulCreditSettlementMigration).toContain(
      "'HARMONIZING', 'AGGREGATING', 'SUMMARIZING'",
    );
  });

  it("fences and re-extracts active v1 evaluations before v2 replay", () => {
    expect(rubricV2Migration).toContain(
      'ALTER TYPE "SermonEvaluationStatus" RENAME VALUE \'CALIBRATING\' TO \'AGGREGATING\'',
    );
    expect(rubricV2Migration).toContain(
      'UPDATE "sermonWorkerLease" lease',
    );
    expect(rubricV2Migration).toContain(
      'DELETE FROM "sermonScoringRun" run',
    );
    expect(rubricV2Migration).toContain(
      '"status" = \'QUEUED\'',
    );
    expect(rubricV2Migration).toContain(
      '"resumeReason" = \'rubric-v2-requeued\'',
    );
    expect(rubricV2Migration).toContain(
      '"attemptDeadlineAt" = NULL',
    );
    expect(rubricV2Migration).toContain("- 'extraction'");
    expect(rubricV2Migration).toContain("- 'scoringRuns'");
    expect(rubricV2Migration).toContain(
      '"version" = "version" + 1',
    );
  });

  it("converges existing databases on rejected-audio pointer cleanup", () => {
    expect(rejectedAudioCleanupMigration).toContain(
      'DROP CONSTRAINT IF EXISTS "sermonAudioAsset_storage_pointer_check"',
    );
    expect(rejectedAudioCleanupMigration).toContain(
      '"verificationState" = \'REJECTED\'',
    );
    expect(rejectedAudioCleanupMigration).toContain(
      '"appwriteBucketId" IS NULL AND "appwriteFileId" IS NULL',
    );
  });

  it("raises both durable sermon audio byte limits to 100 MiB", () => {
    expect(raisedAudioLimitMigration).toContain(
      'DROP CONSTRAINT IF EXISTS "sermonUploadReservation_byte_size_check"',
    );
    expect(raisedAudioLimitMigration).toContain(
      'DROP CONSTRAINT IF EXISTS "sermonAudioAsset_byte_size_check"',
    );
    expect(raisedAudioLimitMigration.match(/104857600/g)).toHaveLength(2);
  });

  it("scopes each three-attempt scoring budget to a durable evaluation attempt", () => {
    expect(scopedScoringRetriesMigration).toContain(
      'ADD COLUMN "evaluationAttemptId" TEXT',
    );
    expect(scopedScoringRetriesMigration).toContain(
      'ALTER COLUMN "evaluationAttemptId" SET NOT NULL',
    );
    expect(scopedScoringRetriesMigration).toContain(
      'ON "sermonScoringAttempt"("scoringRunId", "evaluationAttemptId", "attemptNumber")',
    );
    expect(scopedScoringRetriesMigration).toContain(
      'ADD CONSTRAINT "sermonScoringAttempt_evaluationAttemptId_fkey"',
    );
  });
});
