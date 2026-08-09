import {
  Prisma,
  type sermonEvaluation,
} from "@prisma/client";

import prisma from "@/lib/prisma";

import {
  SERMON_DAILY_RUN_LIMIT,
  startOfCurrentUtcDay,
  type SermonRunSelection,
} from "./types";

export class SermonQuotaError extends Error {
  constructor(
    message: string,
    readonly code:
      | "ADMIN_REQUIRED"
      | "DAILY_LIMIT_EXCEEDED"
      | "RUN_CREDITS_EXHAUSTED"
      | "AUDIO_NOT_RETAINED"
      | "UPLOAD_RESERVATION_INVALID"
      | "ACTIVE_EVALUATION_EXISTS",
  ) {
    super(message);
  }
}

type ApiRunSelection =
  | { preset: "standard" }
  | { preset: "high_confidence" }
  | { preset: "custom"; requestedRuns: number };

export function resolveRunSelection(
  selection: ApiRunSelection,
  isAdmin: boolean,
): SermonRunSelection {
  if (selection.preset === "standard") {
    return { preset: "STANDARD", requestedRuns: 1 };
  }
  if (selection.preset === "high_confidence") {
    return { preset: "HIGH_CONFIDENCE", requestedRuns: 3 };
  }
  if (!isAdmin) {
    throw new SermonQuotaError(
      "Custom scoring-run counts require sermon administrator access",
      "ADMIN_REQUIRED",
    );
  }
  return { preset: "CUSTOM", requestedRuns: selection.requestedRuns };
}

async function lockOwner(
  tx: Prisma.TransactionClient,
  ownerId: string,
) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`sermon-owner:${ownerId}`}, 0))
  `;
}

async function reserveFingerprintCredits(
  tx: Prisma.TransactionClient,
  fingerprintId: string,
  requestedRuns: number,
) {
  const updated = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "sermonAudioFingerprint"
    SET
      "runCreditsReserved" = "runCreditsReserved" + ${requestedRuns},
      "lastSeenAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${fingerprintId}
      AND "runCreditsConsumed" + "runCreditsReserved" + ${requestedRuns}
        <= "runCreditsLimit"
    RETURNING "id"
  `;
  if (updated.length !== 1) {
    throw new SermonQuotaError(
      "The nine lifetime scoring-run credits for this audio are exhausted",
      "RUN_CREDITS_EXHAUSTED",
    );
  }
}

async function enforceDailyQuota(
  tx: Prisma.TransactionClient,
  actorId: string,
  requestedRuns: number,
  exempt: boolean,
) {
  if (exempt) {
    return;
  }
  const reservations = await tx.sermonRunCreditReservation.findMany({
    where: {
      actorId,
      reservedAt: { gte: startOfCurrentUtcDay() },
      state: { in: ["RESERVED", "CONSUMED"] },
    },
    select: {
      state: true,
      requestedCredits: true,
      consumedCredits: true,
    },
  });
  const used = reservations.reduce(
    (total, reservation) =>
      total +
      (reservation.state === "RESERVED"
        ? reservation.requestedCredits
        : reservation.consumedCredits),
    0,
  );
  if (used + requestedRuns > SERMON_DAILY_RUN_LIMIT) {
    throw new SermonQuotaError(
      `The daily sermon evaluation limit is ${SERMON_DAILY_RUN_LIMIT} scoring runs`,
      "DAILY_LIMIT_EXCEEDED",
    );
  }
}

type CreateReservedEvaluationInput = {
  ownerId: string;
  actorId: string;
  isAdmin: boolean;
  fingerprintId: string;
  audioAssetId: string;
  title: string;
  preacher: string;
  preachedOn: Date;
  selection: SermonRunSelection;
  durationAdjustmentEnabled: boolean;
  uploadReservationId?: string;
  sourceEvaluationId?: string;
};

export async function createReservedSermonEvaluation(
  input: CreateReservedEvaluationInput,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockOwner(tx, input.ownerId);

        const audio = await tx.sermonAudioAsset.findFirst({
          where: {
            id: input.audioAssetId,
            fingerprintId: input.fingerprintId,
            appwriteFileId: { not: null },
            deletedAt: null,
          },
        });
        if (!audio) {
          throw new SermonQuotaError(
            "Retained audio is required to evaluate this sermon",
            "AUDIO_NOT_RETAINED",
          );
        }

        if (input.uploadReservationId) {
          const reservation = await tx.sermonUploadReservation.findFirst({
            where: {
              id: input.uploadReservationId,
              ownerId: input.ownerId,
              fingerprintId: input.fingerprintId,
              state: "FINALIZED",
              expiresAt: { gt: new Date() },
            },
          });
          if (!reservation) {
            throw new SermonQuotaError(
              "The finalized upload reservation is invalid or expired",
              "UPLOAD_RESERVATION_INVALID",
            );
          }
        }

        await enforceDailyQuota(
          tx,
          input.actorId,
          input.selection.requestedRuns,
          input.isAdmin,
        );
        await reserveFingerprintCredits(
          tx,
          input.fingerprintId,
          input.selection.requestedRuns,
        );

        const normalizedName = input.preacher
          .trim()
          .toLocaleLowerCase("en-US")
          .replace(/\s+/g, " ");
        const preacher = await tx.sermonPreacher.upsert({
          where: {
            ownerId_normalizedName: {
              ownerId: input.ownerId,
              normalizedName,
            },
          },
          create: {
            ownerId: input.ownerId,
            displayName: input.preacher.trim(),
            normalizedName,
          },
          update: { displayName: input.preacher.trim() },
        });

        const evaluation = await tx.sermonEvaluation.create({
          data: {
            ownerId: input.ownerId,
            preacherId: preacher.id,
            fingerprintId: input.fingerprintId,
            audioAssetId: input.audioAssetId,
            sourceEvaluationId: input.sourceEvaluationId,
            title: input.title.trim(),
            preachedOn: input.preachedOn,
            preset: input.selection.preset,
            requestedRuns: input.selection.requestedRuns,
            durationAdjustmentEnabled: input.durationAdjustmentEnabled,
          },
          include: { preacher: true },
        });

        await tx.sermonRunCreditReservation.create({
          data: {
            fingerprintId: input.fingerprintId,
            evaluationId: evaluation.id,
            requestedCredits: input.selection.requestedRuns,
            preset: input.selection.preset,
            actorId: input.actorId,
          },
        });

        await tx.sermonAudioAsset.update({
          where: { id: input.audioAssetId },
          data: { referenceCount: { increment: 1 } },
        });

        if (input.uploadReservationId) {
          await tx.sermonUploadReservation.update({
            where: { id: input.uploadReservationId },
            data: { state: "CONSUMED", consumedAt: new Date() },
          });
        }

        const auditEvents: Prisma.sermonAdminAuditEventCreateManyInput[] = [];
        if (input.selection.preset === "CUSTOM") {
          auditEvents.push({
            actorId: input.actorId,
            ownerId: input.ownerId,
            evaluationId: evaluation.id,
            action: "CUSTOM_RUN_SELECTION",
            requestedRunCount: input.selection.requestedRuns,
            reasonCode: "SERMON_ADMIN_CUSTOM_RUN_COUNT",
          });
        }
        if (input.isAdmin) {
          auditEvents.push({
            actorId: input.actorId,
            ownerId: input.ownerId,
            evaluationId: evaluation.id,
            action: "DAILY_QUOTA_EXEMPTION",
            requestedRunCount: input.selection.requestedRuns,
            reasonCode: "SERMON_ADMIN_DAILY_QUOTA_EXEMPT",
          });
        }
        if (auditEvents.length) {
          await tx.sermonAdminAuditEvent.createMany({ data: auditEvents });
        }

        return evaluation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SermonQuotaError(
        "Only one sermon evaluation may be active at a time",
        "ACTIVE_EVALUATION_EXISTS",
      );
    }
    throw error;
  }
}

export async function releaseQueuedCreditReservation(
  evaluation: Pick<
    sermonEvaluation,
    "id" | "fingerprintId" | "status" | "ownerId"
  >,
  actorId: string,
  releaseReason: string,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockOwner(tx, evaluation.ownerId);
      const reservation = await tx.sermonRunCreditReservation.findUnique({
        where: { evaluationId: evaluation.id },
      });
      if (!reservation || reservation.state !== "RESERVED") {
        return false;
      }
      await tx.sermonAudioFingerprint.update({
        where: { id: evaluation.fingerprintId },
        data: {
          runCreditsReserved: {
            decrement:
              reservation.requestedCredits - reservation.consumedCredits,
          },
        },
      });
      await tx.sermonRunCreditReservation.update({
        where: { evaluationId: evaluation.id },
        data: {
          state: "RELEASED",
          releasedAt: new Date(),
          releaseReason,
        },
      });
      await tx.sermonAdminAuditEvent.create({
        data: {
          actorId,
          ownerId: evaluation.ownerId,
          evaluationId: evaluation.id,
          action: "CREDIT_RESERVATION_RELEASED",
          requestedRunCount: reservation.requestedCredits,
          reasonCode: releaseReason,
        },
      });
      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
