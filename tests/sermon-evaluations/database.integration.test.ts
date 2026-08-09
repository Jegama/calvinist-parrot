import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import {
  afterAll,
  beforeEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { SermonRunSelection } from "@/lib/sermon-evaluation/types";

const handlerMocks = vi.hoisted(() => ({
  userId: "",
  deleteAudioFile: vi.fn(async () => undefined),
  invokeWorker: vi.fn(async () => ({ $id: "integration-execution" })),
}));

vi.mock("@/lib/sermon-evaluation/auth", () => ({
  getSermonEvaluationCapabilities: () => ({
    hasAccess: true,
    isAdmin: false,
    canChooseCustomRunCount: false,
    dailyQuotaExempt: false,
    allowedRunCount: { min: 1, max: 3 },
    dailyRunLimit: 6,
  }),
  isSermonEvaluationAdmin: () => false,
  requireSermonEvaluationAccess: async () => ({
    user: {
      $id: handlerMocks.userId,
      labels: ["sermon-evaluator-beta"],
    },
    userId: handlerMocks.userId,
    errorResponse: null,
  }),
}));

vi.mock("@/lib/sermon-evaluation/appwrite", () => ({
  createSermonPlaybackUrl: vi.fn(),
  createSermonUploadJwt: vi.fn(),
  deleteSermonAudioFile: handlerMocks.deleteAudioFile,
  getSermonAppwriteConfiguration: vi.fn(),
  getSermonAudioFile: vi.fn(),
  hasOwnerOnlyFilePermissions: vi.fn(),
  invokeSermonEvaluationWorker: handlerMocks.invokeWorker,
}));

const integrationEnabled =
  process.env.RUN_SERMON_DATABASE_INTEGRATION_TESTS === "1";
const databaseUrl = integrationEnabled
  ? process.env.SERMON_DATABASE_INTEGRATION_URL ??
    process.env.DATABASE_URL
  : undefined;

if (integrationEnabled && !databaseUrl) {
  throw new Error(
    "RUN_SERMON_DATABASE_INTEGRATION_TESTS=1 requires SERMON_DATABASE_INTEGRATION_URL or DATABASE_URL",
  );
}

const describeWithDatabase = integrationEnabled
  ? describe
  : describe.skip;

describeWithDatabase("sermon PostgreSQL invariants", () => {
  const testPrefix = `sermon-pg-${randomUUID()}`;
  let pool: Pool;
  let prisma: PrismaClient;
  let sharedPrisma: PrismaClient;
  let createReservedSermonEvaluation: typeof import("@/lib/sermon-evaluation/quotas").createReservedSermonEvaluation;
  let releaseQueuedCreditReservation: typeof import("@/lib/sermon-evaluation/quotas").releaseQueuedCreditReservation;
  let handleDeleteSermonAudio: typeof import("@/lib/sermon-evaluation/handlers").handleDeleteSermonAudio;
  let handleDeleteSermonEvaluation: typeof import("@/lib/sermon-evaluation/handlers").handleDeleteSermonEvaluation;
  let handleRetrySermonEvaluation: typeof import("@/lib/sermon-evaluation/handlers").handleRetrySermonEvaluation;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const quotaModule = await import(
      "@/lib/sermon-evaluation/quotas"
    );
    createReservedSermonEvaluation =
      quotaModule.createReservedSermonEvaluation;
    releaseQueuedCreditReservation =
      quotaModule.releaseQueuedCreditReservation;
    sharedPrisma = (await import("@/lib/prisma")).default;
    const handlers = await import(
      "@/lib/sermon-evaluation/handlers"
    );
    handleDeleteSermonAudio = handlers.handleDeleteSermonAudio;
    handleDeleteSermonEvaluation =
      handlers.handleDeleteSermonEvaluation;
    handleRetrySermonEvaluation =
      handlers.handleRetrySermonEvaluation;
  });

  beforeEach(() => {
    handlerMocks.userId = "";
    handlerMocks.deleteAudioFile.mockClear();
    handlerMocks.invokeWorker.mockClear();
  });

  afterAll(async () => {
    if (prisma) {
      const evaluations = await prisma.sermonEvaluation.findMany({
        where: { ownerId: { startsWith: testPrefix } },
        select: { id: true },
      });
      const evaluationIds = evaluations.map(
        (evaluation) => evaluation.id,
      );
      await prisma.sermonWorkerLease.updateMany({
        where: { evaluationId: { in: evaluationIds } },
        data: {
          leaseOwner: null,
          evaluationId: null,
          evaluationAttemptId: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
        },
      });
      await prisma.sermonAdminAuditEvent.deleteMany({
        where: {
          OR: [
            { ownerId: { startsWith: testPrefix } },
            { actorId: { startsWith: testPrefix } },
          ],
        },
      });
      await prisma.sermonRunCreditReservation.deleteMany({
        where: {
          fingerprint: {
            ownerId: { startsWith: testPrefix },
          },
        },
      });
      await prisma.sermonUploadReservation.deleteMany({
        where: { ownerId: { startsWith: testPrefix } },
      });
      await prisma.sermonEvaluation.deleteMany({
        where: { ownerId: { startsWith: testPrefix } },
      });
      await prisma.sermonAudioAsset.deleteMany({
        where: {
          fingerprint: {
            ownerId: { startsWith: testPrefix },
          },
        },
      });
      await prisma.sermonAudioFingerprint.deleteMany({
        where: { ownerId: { startsWith: testPrefix } },
      });
      await prisma.sermonPreacher.deleteMany({
        where: { ownerId: { startsWith: testPrefix } },
      });
    }
    await sharedPrisma?.$disconnect();
    await prisma?.$disconnect();
    await pool?.end();
  });

  async function createAudioFixture(
    ownerId: string,
    audioSuffix: string,
  ) {
    const fingerprint =
      await prisma.sermonAudioFingerprint.create({
        data: {
          ownerId,
          sha256: randomUUID()
            .replaceAll("-", "")
            .padEnd(64, "0"),
          verificationState: "VERIFIED",
          verifiedAt: new Date(),
        },
      });
    const audioAsset = await prisma.sermonAudioAsset.create({
        data: {
          fingerprintId: fingerprint.id,
          appwriteBucketId: "sermon-audio",
          appwriteFileId: `${testPrefix}-${audioSuffix}-file`,
        originalFilename: "sermon.mp3",
        mimeType: "audio/mpeg",
        byteSize: 1024,
        verificationState: "VERIFIED",
        verifiedAt: new Date(),
      },
    });
    const preacher = await prisma.sermonPreacher.upsert({
      where: {
        ownerId_normalizedName: {
          ownerId,
          normalizedName: "integration pastor",
        },
      },
      create: {
        ownerId,
        displayName: "Integration Pastor",
        normalizedName: "integration pastor",
      },
      update: { displayName: "Integration Pastor" },
    });
    return { ownerId, fingerprint, audioAsset, preacher };
  }

  function createFixture(ownerSuffix: string) {
    const ownerId = `${testPrefix}-${ownerSuffix}`;
    return createAudioFixture(ownerId, ownerSuffix);
  }

  function createEvaluation(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    title: string,
    status:
      | "QUEUED"
      | "FAILED"
      | "COMPLETE" = "QUEUED",
  ) {
    return prisma.sermonEvaluation.create({
      data: {
        ownerId: fixture.ownerId,
        preacherId: fixture.preacher.id,
        fingerprintId: fixture.fingerprint.id,
        audioAssetId: fixture.audioAsset.id,
        title,
        preachedOn: new Date("2026-07-27T00:00:00.000Z"),
        preset: "STANDARD",
        requestedRuns: 1,
        completedRuns: status === "COMPLETE" ? 1 : 0,
        status,
      },
    });
  }

  async function consumeReservedCredits(
    evaluationId: string,
    fingerprintId: string,
    requestedCredits: number,
  ) {
    await prisma.$transaction([
      prisma.sermonAudioFingerprint.update({
        where: { id: fingerprintId },
        data: {
          runCreditsReserved: { decrement: requestedCredits },
          runCreditsConsumed: { increment: requestedCredits },
        },
      }),
      prisma.sermonRunCreditReservation.update({
        where: { evaluationId },
        data: {
          state: "CONSUMED",
          consumedCredits: requestedCredits,
          consumedAt: new Date(),
        },
      }),
      prisma.sermonEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: "COMPLETE",
          completedRuns: requestedCredits,
          completedAt: new Date(),
        },
      }),
    ]);
  }

  it("enforces one active evaluation per owner while retaining terminal history", async () => {
    const fixture = await createFixture("active-owner");
    const active = await createEvaluation(
      fixture,
      "First active evaluation",
    );

    await expect(
      createEvaluation(fixture, "Conflicting active evaluation"),
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.sermonEvaluation.update({
      where: { id: active.id },
      data: {
        status: "COMPLETE",
        completedRuns: 1,
        completedAt: new Date(),
      },
    });
    await expect(
      createEvaluation(fixture, "Next active evaluation"),
    ).resolves.toMatchObject({ status: "QUEUED" });
  });

  it("enforces attempt uniqueness and lease-attempt referential integrity", async () => {
    const fixture = await createFixture("lease-attempt");
    const evaluation = await createEvaluation(
      fixture,
      "Lease integrity",
      "FAILED",
    );
    const attempt =
      await prisma.sermonEvaluationAttempt.create({
        data: {
          evaluationId: evaluation.id,
          attemptNumber: 1,
          startedAt: new Date(),
          deadlineAt: new Date(Date.now() + 60_000),
        },
      });

    await expect(
      prisma.sermonEvaluationAttempt.create({
        data: {
          evaluationId: evaluation.id,
          attemptNumber: 1,
          deadlineAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.sermonWorkerLease.update({
      where: { slotId: 1 },
      data: {
        leaseOwner: `${testPrefix}-worker`,
        evaluationId: evaluation.id,
        evaluationAttemptId: attempt.id,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        heartbeatAt: new Date(),
      },
    });
    await expect(
      prisma.sermonEvaluationAttempt.delete({
        where: { id: attempt.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.sermonWorkerLease.update({
        where: { slotId: 1 },
        data: {
          evaluationAttemptId: "missing-attempt",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("atomically enforces mixed spending against the nine-credit lifetime budget", async () => {
    const fixture = await createFixture("mixed-spend");
    const selections: SermonRunSelection[] = [
      { preset: "STANDARD", requestedRuns: 1 },
      { preset: "HIGH_CONFIDENCE", requestedRuns: 3 },
      { preset: "HIGH_CONFIDENCE", requestedRuns: 3 },
      { preset: "STANDARD", requestedRuns: 1 },
      { preset: "STANDARD", requestedRuns: 1 },
    ];

    for (const [index, selection] of selections.entries()) {
      const evaluation =
        await createReservedSermonEvaluation({
          ownerId: fixture.ownerId,
          actorId: fixture.ownerId,
          isAdmin: true,
          fingerprintId: fixture.fingerprint.id,
          audioAssetId: fixture.audioAsset.id,
          title: `Mixed spend ${index + 1}`,
          preacher: fixture.preacher.displayName,
          preachedOn: new Date("2026-07-27T00:00:00.000Z"),
          selection,
          durationAdjustmentEnabled: false,
        });
      await consumeReservedCredits(
        evaluation.id,
        fixture.fingerprint.id,
        selection.requestedRuns,
      );
    }

    await expect(
      createReservedSermonEvaluation({
        ownerId: fixture.ownerId,
        actorId: fixture.ownerId,
        isAdmin: true,
        fingerprintId: fixture.fingerprint.id,
        audioAssetId: fixture.audioAsset.id,
        title: "Budget overflow",
        preacher: fixture.preacher.displayName,
        preachedOn: new Date("2026-07-27T00:00:00.000Z"),
        selection: { preset: "STANDARD", requestedRuns: 1 },
        durationAdjustmentEnabled: false,
      }),
    ).rejects.toMatchObject({
      code: "RUN_CREDITS_EXHAUSTED",
    });

    const balance =
      await prisma.sermonAudioFingerprint.findUniqueOrThrow({
        where: { id: fixture.fingerprint.id },
      });
    expect(balance).toMatchObject({
      runCreditsLimit: 9,
      runCreditsReserved: 0,
      runCreditsConsumed: 9,
    });
    await expect(
      prisma.sermonAudioFingerprint.update({
        where: { id: fixture.fingerprint.id },
        data: { runCreditsConsumed: 10 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.sermonEvaluation.count({
        where: { ownerId: fixture.ownerId },
      }),
    ).resolves.toBe(5);
    await expect(
      prisma.sermonRunCreditReservation.count({
        where: { fingerprintId: fixture.fingerprint.id },
      }),
    ).resolves.toBe(5);
  });

  it("enforces the six-run daily quota and audits an administrator bypass", async () => {
    const first = await createFixture("daily-quota");
    const second = await createAudioFixture(
      first.ownerId,
      "daily-quota-second",
    );
    const overflow = await createAudioFixture(
      first.ownerId,
      "daily-quota-overflow",
    );
    const admin = await createAudioFixture(
      first.ownerId,
      "daily-quota-admin",
    );

    for (const [index, fixture] of [first, second].entries()) {
      const evaluation =
        await createReservedSermonEvaluation({
          ownerId: first.ownerId,
          actorId: first.ownerId,
          isAdmin: false,
          fingerprintId: fixture.fingerprint.id,
          audioAssetId: fixture.audioAsset.id,
          title: `Daily quota spend ${index + 1}`,
          preacher: fixture.preacher.displayName,
          preachedOn: new Date("2026-07-27T00:00:00.000Z"),
          selection: {
            preset: "HIGH_CONFIDENCE",
            requestedRuns: 3,
          },
          durationAdjustmentEnabled: false,
        });
      await consumeReservedCredits(
        evaluation.id,
        fixture.fingerprint.id,
        3,
      );
    }

    await expect(
      createReservedSermonEvaluation({
        ownerId: first.ownerId,
        actorId: first.ownerId,
        isAdmin: false,
        fingerprintId: overflow.fingerprint.id,
        audioAssetId: overflow.audioAsset.id,
        title: "Daily quota overflow",
        preacher: overflow.preacher.displayName,
        preachedOn: new Date("2026-07-27T00:00:00.000Z"),
        selection: { preset: "STANDARD", requestedRuns: 1 },
        durationAdjustmentEnabled: false,
      }),
    ).rejects.toMatchObject({
      code: "DAILY_LIMIT_EXCEEDED",
    });

    const adminEvaluation =
      await createReservedSermonEvaluation({
        ownerId: first.ownerId,
        actorId: first.ownerId,
        isAdmin: true,
        fingerprintId: admin.fingerprint.id,
        audioAssetId: admin.audioAsset.id,
        title: "Audited daily quota bypass",
        preacher: admin.preacher.displayName,
        preachedOn: new Date("2026-07-27T00:00:00.000Z"),
        selection: { preset: "STANDARD", requestedRuns: 1 },
        durationAdjustmentEnabled: false,
      });
    await consumeReservedCredits(
      adminEvaluation.id,
      admin.fingerprint.id,
      1,
    );

    await expect(
      prisma.sermonRunCreditReservation.aggregate({
        where: {
          actorId: first.ownerId,
          state: { in: ["RESERVED", "CONSUMED"] },
        },
        _sum: { requestedCredits: true },
      }),
    ).resolves.toMatchObject({
      _sum: { requestedCredits: 7 },
    });
    await expect(
      prisma.sermonAdminAuditEvent.findFirst({
        where: {
          evaluationId: adminEvaluation.id,
          action: "DAILY_QUOTA_EXEMPTION",
        },
      }),
    ).resolves.toMatchObject({
      actorId: first.ownerId,
      ownerId: first.ownerId,
      requestedRunCount: 1,
      reasonCode: "SERMON_ADMIN_DAILY_QUOTA_EXEMPT",
    });
  });

  it("retries the same evaluation by restoring its existing reservation without a new daily charge", async () => {
    const fixture = await createFixture("retry-reuse");
    handlerMocks.userId = fixture.ownerId;
    const evaluation =
      await createReservedSermonEvaluation({
        ownerId: fixture.ownerId,
        actorId: fixture.ownerId,
        isAdmin: false,
        fingerprintId: fixture.fingerprint.id,
        audioAssetId: fixture.audioAsset.id,
        title: "Retry reservation reuse",
        preacher: fixture.preacher.displayName,
        preachedOn: new Date("2026-07-27T00:00:00.000Z"),
        selection: {
          preset: "HIGH_CONFIDENCE",
          requestedRuns: 3,
        },
        durationAdjustmentEnabled: false,
      });
    const originalReservation =
      await prisma.sermonRunCreditReservation.findUniqueOrThrow({
        where: { evaluationId: evaluation.id },
      });
    await releaseQueuedCreditReservation(
      evaluation,
      fixture.ownerId,
      "INTEGRATION_RETRY_RELEASE",
    );
    await prisma.sermonEvaluation.update({
      where: { id: evaluation.id },
      data: {
        status: "FAILED",
        errorCode: "INTEGRATION_RETRY",
        errorMessage: "Retry this evaluation",
      },
    });

    const response = await handleRetrySermonEvaluation(
      evaluation.id,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      evaluationId: evaluation.id,
      status: "QUEUED",
    });
    const restoredReservation =
      await prisma.sermonRunCreditReservation.findUniqueOrThrow({
        where: { evaluationId: evaluation.id },
      });
    expect(restoredReservation).toMatchObject({
      id: originalReservation.id,
      state: "RESERVED",
      requestedCredits: 3,
      reservedAt: originalReservation.reservedAt,
      releasedAt: null,
      releaseReason: null,
    });
    await expect(
      prisma.sermonRunCreditReservation.count({
        where: { evaluationId: evaluation.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.sermonAudioFingerprint.findUniqueOrThrow({
        where: { id: fixture.fingerprint.id },
      }),
    ).resolves.toMatchObject({
      runCreditsReserved: 3,
      runCreditsConsumed: 0,
    });
    await expect(
      prisma.sermonRunCreditReservation.aggregate({
        where: {
          actorId: fixture.ownerId,
          state: { in: ["RESERVED", "CONSUMED"] },
        },
        _sum: { requestedCredits: true },
      }),
    ).resolves.toMatchObject({
      _sum: { requestedCredits: 3 },
    });
    expect(handlerMocks.invokeWorker).toHaveBeenCalledOnce();
  });

  it.each(["audio", "evaluation"] as const)(
    "keeps consumed credits nonrefundable after %s deletion",
    async (deletionKind) => {
      const fixture = await createFixture(
        `consumed-${deletionKind}-deletion`,
      );
      handlerMocks.userId = fixture.ownerId;
      const evaluation =
        await createReservedSermonEvaluation({
          ownerId: fixture.ownerId,
          actorId: fixture.ownerId,
          isAdmin: false,
          fingerprintId: fixture.fingerprint.id,
          audioAssetId: fixture.audioAsset.id,
          title: `Consumed ${deletionKind} deletion`,
          preacher: fixture.preacher.displayName,
          preachedOn: new Date("2026-07-27T00:00:00.000Z"),
          selection: { preset: "STANDARD", requestedRuns: 1 },
          durationAdjustmentEnabled: false,
        });
      await consumeReservedCredits(
        evaluation.id,
        fixture.fingerprint.id,
        1,
      );

      const response =
        deletionKind === "audio"
          ? await handleDeleteSermonAudio(evaluation.id)
          : await handleDeleteSermonEvaluation(evaluation.id);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        deleted: true,
        evaluationId: evaluation.id,
        creditsRestored: false,
      });
      await expect(
        prisma.sermonAudioFingerprint.findUniqueOrThrow({
          where: { id: fixture.fingerprint.id },
        }),
      ).resolves.toMatchObject({
        runCreditsReserved: 0,
        runCreditsConsumed: 1,
      });
      await expect(
        prisma.sermonRunCreditReservation.findUniqueOrThrow({
          where: { evaluationId: evaluation.id },
        }),
      ).resolves.toMatchObject({
        state: "CONSUMED",
        requestedCredits: 1,
      });
      const deletedEvaluation =
        await prisma.sermonEvaluation.findUniqueOrThrow({
          where: { id: evaluation.id },
        });
      expect(deletedEvaluation.audioAssetId).toBeNull();
      expect(Boolean(deletedEvaluation.deletedAt)).toBe(
        deletionKind === "evaluation",
      );
      expect(handlerMocks.deleteAudioFile).toHaveBeenCalledOnce();
    },
  );

  it("reclaims an expired lease slot while excluding a second live claimant", async () => {
    const expiredFixture = await createFixture(
      "lease-expired-owner",
    );
    const reclaimedFixture = await createFixture(
      "lease-reclaimed-owner",
    );
    const expiredEvaluation = await createEvaluation(
      expiredFixture,
      "Expired lease evaluation",
    );
    const reclaimedEvaluation = await createEvaluation(
      reclaimedFixture,
      "Reclaimed lease evaluation",
    );
    const expiredAttempt =
      await prisma.sermonEvaluationAttempt.create({
        data: {
          evaluationId: expiredEvaluation.id,
          attemptNumber: 1,
          startedAt: new Date(Date.now() - 120_000),
          deadlineAt: new Date(Date.now() + 60_000),
        },
      });
    const reclaimedAttempt =
      await prisma.sermonEvaluationAttempt.create({
        data: {
          evaluationId: reclaimedEvaluation.id,
          attemptNumber: 1,
          startedAt: new Date(),
          deadlineAt: new Date(Date.now() + 60_000),
        },
      });
    await prisma.sermonWorkerLease.update({
      where: { slotId: 1 },
      data: {
        leaseOwner: `${testPrefix}-expired-worker`,
        evaluationId: expiredEvaluation.id,
        evaluationAttemptId: expiredAttempt.id,
        leaseExpiresAt: new Date(Date.now() - 60_000),
        heartbeatAt: new Date(Date.now() - 120_000),
      },
    });

    const reclaimed =
      await prisma.sermonWorkerLease.updateMany({
        where: {
          slotId: 1,
          OR: [
            { leaseOwner: null },
            { leaseExpiresAt: { lt: new Date() } },
          ],
        },
        data: {
          leaseOwner: `${testPrefix}-reclaiming-worker`,
          evaluationId: reclaimedEvaluation.id,
          evaluationAttemptId: reclaimedAttempt.id,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          heartbeatAt: new Date(),
        },
      });
    expect(reclaimed.count).toBe(1);

    const duplicateClaim =
      await prisma.sermonWorkerLease.updateMany({
        where: {
          slotId: 1,
          OR: [
            { leaseOwner: null },
            { leaseExpiresAt: { lt: new Date() } },
          ],
        },
        data: {
          leaseOwner: `${testPrefix}-duplicate-worker`,
          evaluationId: expiredEvaluation.id,
          evaluationAttemptId: expiredAttempt.id,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          heartbeatAt: new Date(),
        },
      });
    expect(duplicateClaim.count).toBe(0);
    await expect(
      prisma.sermonWorkerLease.findUniqueOrThrow({
        where: { slotId: 1 },
      }),
    ).resolves.toMatchObject({
      leaseOwner: `${testPrefix}-reclaiming-worker`,
      evaluationId: reclaimedEvaluation.id,
      evaluationAttemptId: reclaimedAttempt.id,
    });
  });
});
