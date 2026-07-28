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
});
