import { createHash } from "node:crypto";

import {
  Prisma,
  type SermonEvaluationStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createSermonEvaluationRequestSchema,
  finalizeSermonUploadRequestSchema,
  listSermonEvaluationsQuerySchema,
  prepareSermonUploadRequestSchema,
  reevaluateSermonRequestSchema,
  updateSermonDurationPolicyRequestSchema,
} from "@/lib/api/contracts";
import { parseJsonRequest } from "@/lib/api/handlers/http";
import prisma from "@/lib/prisma";

import {
  getSermonEvaluationCapabilities,
  isSermonEvaluationAdmin,
  requireSermonEvaluationAccess,
} from "./auth";
import {
  createSermonPlaybackUrl,
  createSermonUploadJwt,
  deleteSermonAudioFile,
  getSermonAppwriteConfiguration,
  getSermonAudioFile,
  hasOwnerOnlyFilePermissions,
  invokeSermonEvaluationWorker,
} from "./appwrite";
import {
  serializeFingerprintDecision,
  serializeSermonHistory,
  sermonFingerprintHistoryInclude,
} from "./fingerprints";
import {
  createReservedSermonEvaluation,
  resolveRunSelection,
  SermonQuotaError,
} from "./quotas";
import { renderSermonMarkdownPdf } from "./pdf-report";
import { isDurationReportRegenerationPending } from "./reports";
import { isLocalSermonRuntime } from "./runtime";
import {
  getCreditBalance,
  SERMON_ACTIVE_STATUSES,
  SERMON_COMPLETE_STATUSES,
  SERMON_DAILY_RUN_LIMIT,
  SERMON_RETRYABLE_STATUSES,
  SERMON_UPLOAD_RESERVATION_TTL_MS,
  startOfCurrentUtcDay,
  toApiPreset,
} from "./types";

class SermonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof SermonApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SermonQuotaError) {
    const status =
      error.code === "ADMIN_REQUIRED"
        ? 403
        : error.code === "DAILY_LIMIT_EXCEEDED" ||
            error.code === "RUN_CREDITS_EXHAUSTED"
          ? 429
          : error.code === "AUDIO_NOT_RETAINED"
          ? 409
          : 409;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return NextResponse.json(
      { error: "A conflicting sermon evaluation operation already completed" },
      { status: 409 },
    );
  }
  console.error("Sermon evaluation API request failed", error);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

function authenticatedError(authError: NextResponse | null) {
  return (
    authError ??
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function isAppwriteNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { code?: unknown };
  };
  return (
    candidate.code === 404 ||
    candidate.status === 404 ||
    candidate.response?.code === 404
  );
}

function audioMimeFamily(value: string) {
  switch (value.toLowerCase()) {
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave":
      return "wav";
    default:
      return null;
  }
}

async function cleanDeletedSermonAudioAsset(
  assetId: string,
  fileId: string,
) {
  try {
    await deleteSermonAudioFile(fileId);
  } catch (error) {
    if (!isAppwriteNotFound(error)) {
      console.error("Sermon audio cleanup remains pending", {
        assetId,
        error,
      });
      return false;
    }
  }
  await prisma.sermonAudioAsset.updateMany({
    where: {
      id: assetId,
      verificationState: "DELETED",
      appwriteFileId: fileId,
      deletedAt: { not: null },
    },
    data: {
      appwriteBucketId: null,
      appwriteFileId: null,
    },
  });
  return true;
}

function asJsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

type JsonRecord = Record<string, unknown>;

function jsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

async function resolveOwnedCanonicalEvaluation(
  ownerId: string,
  currentEvaluationId: string,
  result: Prisma.JsonValue | null,
) {
  const candidateId = jsonRecord(result)?.canonicalEvaluationId;
  if (
    typeof candidateId !== "string" ||
    !candidateId ||
    candidateId === currentEvaluationId
  ) {
    return null;
  }
  const canonical = await prisma.sermonEvaluation.findFirst({
    where: {
      id: candidateId,
      ownerId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return canonical
    ? {
        canonicalEvaluationId: canonical.id,
        canonicalDetailUrl: `/sermon-evaluation/${canonical.id}`,
      }
    : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function nestedNumber(
  source: JsonRecord | null,
  section: string,
  field: string,
) {
  return finiteNumber(jsonRecord(source?.[section])?.[field]);
}

function average(values: Array<number | null>) {
  const available = values.filter(
    (value): value is number => value !== null,
  );
  return available.length
    ? available.reduce((sum, value) => sum + value, 0) /
        available.length
    : null;
}

function rawRunOverallImpact(run: unknown) {
  const scoring = jsonRecord(run);
  const textualFidelity = average([
    nestedNumber(scoring, "Exegetical_Support", "Alignment_with_Text"),
    nestedNumber(scoring, "Exegetical_Support", "Handles_Difficulties"),
    nestedNumber(
      scoring,
      "Exegetical_Support",
      "Proof_Accuracy_and_Clarity",
    ),
    nestedNumber(
      scoring,
      "Exegetical_Support",
      "Context_and_Genre_Considered",
    ),
    nestedNumber(scoring, "Exegetical_Support", "Not_Belabored"),
    nestedNumber(
      scoring,
      "Exegetical_Support",
      "Aids_Rather_Than_Impresses",
    ),
    nestedNumber(scoring, "Main_Points", "Exposition_Quality"),
  ]);
  const propositionClarity = average([
    nestedNumber(
      scoring,
      "Proposition",
      "Principle_and_Application_Wed",
    ),
    nestedNumber(scoring, "Proposition", "Establishes_Main_Theme"),
    nestedNumber(scoring, "Proposition", "Summarizes_Introduction"),
  ]);
  const introduction = average([
    nestedNumber(scoring, "Introduction", "FCF_Introduced"),
    nestedNumber(scoring, "Introduction", "Arouses_Attention"),
  ]);
  const applicationEffectiveness = average([
    nestedNumber(scoring, "Application", "Clear_and_Practical"),
    nestedNumber(scoring, "Application", "Redemptive_Focus"),
    nestedNumber(
      scoring,
      "Application",
      "Mandate_vs_Idea_Distinction",
    ),
    nestedNumber(scoring, "Application", "Passage_Supported"),
    nestedNumber(scoring, "Main_Points", "Application_Quality"),
    nestedNumber(scoring, "Conclusion", "Compelling_Exhortation"),
    nestedNumber(scoring, "Conclusion", "Climax"),
  ]);
  const structureCohesion = average([
    nestedNumber(scoring, "Proposition", "Establishes_Main_Theme"),
    nestedNumber(
      scoring,
      "Main_Points",
      "Proportional_and_Coexistent",
    ),
    nestedNumber(scoring, "Main_Points", "Clarity"),
    nestedNumber(
      scoring,
      "Main_Points",
      "Hortatory_Universal_Truths",
    ),
    nestedNumber(scoring, "Conclusion", "Summary"),
    nestedNumber(scoring, "Conclusion", "Pointed_End"),
  ]);
  const illustrations = average([
    nestedNumber(scoring, "Main_Points", "Illustration_Quality"),
    nestedNumber(scoring, "Illustrations", "Lived_Body_Detail"),
    nestedNumber(scoring, "Illustrations", "Strengthens_Points"),
    nestedNumber(scoring, "Illustrations", "Proportion"),
  ]);
  if (
    textualFidelity === null ||
    applicationEffectiveness === null ||
    structureCohesion === null ||
    propositionClarity === null ||
    illustrations === null ||
    introduction === null
  ) {
    return null;
  }
  return Number(
    (
      textualFidelity * 0.24 +
      applicationEffectiveness * 0.24 +
      structureCohesion * 0.2 +
      propositionClarity * 0.12 +
      illustrations * 0.1 +
      introduction * 0.1
    ).toFixed(2),
  );
}

function extractAnalyticsResult(result: Prisma.JsonValue | null) {
  const root = jsonRecord(result);
  const scoring = jsonRecord(root?.scoring);
  const summary = jsonRecord(scoring?.Aggregated_Summary);
  const scoringRuns = jsonRecord(root?.scoringRuns);
  const runs = Array.isArray(scoringRuns?.runs)
    ? scoringRuns.runs
    : [];
  const runImpacts = runs
    .map(rawRunOverallImpact)
    .filter((value): value is number => value !== null);
  return {
    aggregateScores: {
      textualFidelity: finiteNumber(summary?.Textual_Fidelity),
      propositionClarity: finiteNumber(summary?.Proposition_Clarity),
      introduction: finiteNumber(summary?.Introduction),
      applicationEffectiveness: finiteNumber(
        summary?.Application_Effectiveness,
      ),
      structureCohesion: finiteNumber(summary?.Structure_Cohesion),
      illustrations: finiteNumber(summary?.Illustrations),
    },
    uncertaintyLow:
      runImpacts.length > 1 ? Math.min(...runImpacts) : null,
    uncertaintyHigh:
      runImpacts.length > 1 ? Math.max(...runImpacts) : null,
  };
}

function serializeEvaluationSummary(evaluation: {
  id: string;
  title: string;
  preacher: { id: string; displayName: string };
  preachedOn: Date;
  preset: "STANDARD" | "HIGH_CONFIDENCE" | "CUSTOM";
  requestedRuns: number;
  completedRuns: number;
  status: SermonEvaluationStatus;
  durationAdjustmentEnabled: boolean;
  overallImpactBase: number | null;
  overallImpactAdjusted: number | null;
  warningCodes: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: evaluation.id,
    title: evaluation.title,
    preacher: {
      id: evaluation.preacher.id,
      displayName: evaluation.preacher.displayName,
    },
    preachedOn: evaluation.preachedOn.toISOString().slice(0, 10),
    preset: toApiPreset(evaluation.preset),
    requestedRuns: evaluation.requestedRuns,
    completedRuns: evaluation.completedRuns,
    status: evaluation.status,
    durationAdjustmentEnabled: evaluation.durationAdjustmentEnabled,
    overallImpactBase: evaluation.overallImpactBase,
    overallImpactAdjusted: evaluation.overallImpactAdjusted,
    warningCodes: evaluation.warningCodes,
    createdAt: evaluation.createdAt.toISOString(),
    updatedAt: evaluation.updatedAt.toISOString(),
    completedAt: evaluation.completedAt?.toISOString() ?? null,
  };
}

function serializeProgress(evaluation: {
  id: string;
  status: SermonEvaluationStatus;
  requestedRuns: number;
  completedRuns: number;
  retryWave: number;
  cancelRequestedAt: Date | null;
  warningCodes: string[];
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  attemptDeadlineAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    stage: evaluation.status,
    requestedRuns: evaluation.requestedRuns,
    completedRuns: evaluation.completedRuns,
    retryWave: evaluation.retryWave,
    cancelRequested: Boolean(evaluation.cancelRequestedAt),
    warningCodes: evaluation.warningCodes,
    error: evaluation.errorCode
      ? {
          code: evaluation.errorCode,
          message:
            evaluation.errorMessage ?? "The evaluation could not be completed",
        }
      : null,
    queuedAt: evaluation.createdAt.toISOString(),
    startedAt: evaluation.startedAt?.toISOString() ?? null,
    attemptDeadlineAt:
      evaluation.attemptDeadlineAt?.toISOString() ?? null,
    completedAt: evaluation.completedAt?.toISOString() ?? null,
    updatedAt: evaluation.updatedAt.toISOString(),
  };
}

function serializeDuration(evaluation: {
  durationAdjustmentEnabled: boolean;
  overallImpactBase: number | null;
  calculatedDurationPenalty: number | null;
  overallImpactAdjusted: number | null;
}) {
  return {
    adjustmentEnabled: evaluation.durationAdjustmentEnabled,
    overallImpactBase: evaluation.overallImpactBase,
    calculatedPenalty: evaluation.calculatedDurationPenalty,
    overallImpactAdjusted: evaluation.overallImpactAdjusted,
    displayedOverallImpact: evaluation.durationAdjustmentEnabled
      ? evaluation.overallImpactAdjusted
      : evaluation.overallImpactBase,
  };
}

async function findOwnedFingerprint(
  ownerId: string,
  sha256: string,
) {
  const fingerprint = await prisma.sermonAudioFingerprint.findUnique({
    where: { ownerId_sha256: { ownerId, sha256 } },
    include: sermonFingerprintHistoryInclude,
  });
  return fingerprint?.verificationState === "VERIFIED"
    ? fingerprint
    : null;
}

async function preflightDailyQuota(
  ownerId: string,
  requestedRuns: number,
  exempt: boolean,
) {
  if (exempt) return;
  const aggregate = await prisma.sermonRunCreditReservation.aggregate({
    where: {
      actorId: ownerId,
      reservedAt: { gte: startOfCurrentUtcDay() },
      state: { in: ["RESERVED", "CONSUMED"] },
    },
    _sum: { requestedCredits: true },
  });
  if (
    (aggregate._sum.requestedCredits ?? 0) + requestedRuns >
    SERMON_DAILY_RUN_LIMIT
  ) {
    throw new SermonQuotaError(
      `The daily sermon evaluation limit is ${SERMON_DAILY_RUN_LIMIT} scoring runs`,
      "DAILY_LIMIT_EXCEEDED",
    );
  }
}

export async function handleGetSermonCapabilities() {
  const { user, userId, errorResponse: authError } =
    await requireSermonEvaluationAccess();
  if (authError || !userId || !user) return authenticatedError(authError);
  return NextResponse.json({
    capabilities: getSermonEvaluationCapabilities(user),
  });
}

export async function handlePrepareSermonUpload(request: Request) {
  try {
    const { user, userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId || !user) return authenticatedError(authError);
    const parsed = await parseJsonRequest(
      request,
      prepareSermonUploadRequestSchema,
    );
    if (!parsed.success) return parsed.response;

    const admin = isSermonEvaluationAdmin(user);
    const selection = resolveRunSelection(parsed.data, admin);
    const requestedReattach = parsed.data.reattachEvaluationId;
    const reattachTarget = requestedReattach
      ? await prisma.sermonEvaluation.findFirst({
          where: {
            id: requestedReattach,
            ownerId: userId,
            deletedAt: null,
          },
          include: {
            fingerprint: {
              include: sermonFingerprintHistoryInclude,
            },
          },
        })
      : null;
    if (requestedReattach) {
      const retainedAudio = Boolean(
        reattachTarget?.fingerprint.audioAsset?.appwriteFileId &&
          !reattachTarget.fingerprint.audioAsset.deletedAt,
      );
      if (
        !reattachTarget ||
        reattachTarget.fingerprint.verificationState !== "VERIFIED" ||
        retainedAudio ||
        reattachTarget.fingerprint.sha256 !== parsed.data.sha256
      ) {
        throw new SermonApiError(
          "The reattachment target and audio fingerprint do not match",
          409,
        );
      }
    }
    const existing =
      reattachTarget?.fingerprint ??
      (await findOwnedFingerprint(userId, parsed.data.sha256));
    const existingDecision = existing
      ? serializeFingerprintDecision(existing)
      : null;
    if (existingDecision && !requestedReattach) {
      return NextResponse.json(existingDecision);
    }

    if (
      existing &&
      getCreditBalance(existing).runCreditsRemaining <
        selection.requestedRuns
    ) {
      throw new SermonQuotaError(
        "The requested evaluation exceeds the remaining lifetime scoring-run credits",
        "RUN_CREDITS_EXHAUSTED",
      );
    }
    await preflightDailyQuota(
      userId,
      selection.requestedRuns,
      admin,
    );

    const config = getSermonAppwriteConfiguration();
    const fileId = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + SERMON_UPLOAD_RESERVATION_TTL_MS,
    );
    const reservation = await prisma.sermonUploadReservation.create({
      data: {
        ownerId: userId,
        claimedSha256: parsed.data.sha256,
        originalFilename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
        byteSize: parsed.data.byteSize,
        requestedPreset: selection.preset,
        requestedRuns: selection.requestedRuns,
        appwriteBucketId: config.bucketId,
        appwriteFileId: fileId,
        expiresAt,
        fingerprintId: existing?.id,
        reattachEvaluationId: reattachTarget?.id,
      },
    });
    const uploadJwt = await createSermonUploadJwt();
    return NextResponse.json({
      decision: "upload_required",
      reservationId: reservation.id,
      uploadMode: isLocalSermonRuntime() ? "local" : "appwrite",
      uploadUrl: isLocalSermonRuntime()
        ? `/api/sermon-evaluation-local/uploads/${encodeURIComponent(reservation.id)}`
        : null,
      uploadJwt,
      endpoint: config.endpoint,
      projectId: config.projectId,
      bucketId: config.bucketId,
      fileId,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleFinalizeSermonUpload(request: Request) {
  let redundantFileId: string | null = null;
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const parsed = await parseJsonRequest(
      request,
      finalizeSermonUploadRequestSchema,
    );
    if (!parsed.success) return parsed.response;

    const reservation = await prisma.sermonUploadReservation.findFirst({
      where: {
        id: parsed.data.reservationId,
        ownerId: userId,
        state: "PREPARED",
        expiresAt: { gt: new Date() },
      },
    });
    if (
      !reservation ||
      reservation.appwriteFileId !== parsed.data.fileId ||
      reservation.claimedSha256 !== parsed.data.sha256
    ) {
      throw new SermonApiError(
        "The upload reservation is invalid or expired",
        409,
      );
    }

    const file = await getSermonAudioFile(parsed.data.fileId);
    if (
      file.$id !== reservation.appwriteFileId ||
      file.bucketId !== reservation.appwriteBucketId ||
      file.name !== reservation.originalFilename ||
      file.sizeOriginal !== reservation.byteSize ||
      !audioMimeFamily(file.mimeType) ||
      audioMimeFamily(file.mimeType) !==
        audioMimeFamily(reservation.mimeType) ||
      file.chunksUploaded !== file.chunksTotal ||
      !hasOwnerOnlyFilePermissions(file.$permissions, userId)
    ) {
      throw new SermonApiError(
        "The uploaded file metadata or permissions do not match the reservation",
        409,
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`sermon-upload:${userId}:${reservation.claimedSha256}`}, 0))
        `;
        const currentReservation =
          await tx.sermonUploadReservation.findFirst({
            where: {
              id: reservation.id,
              ownerId: userId,
              state: "PREPARED",
              expiresAt: { gt: new Date() },
            },
          });
        if (!currentReservation) {
          throw new SermonApiError(
            "The upload reservation has already been used",
            409,
          );
        }

        let fingerprint =
          await tx.sermonAudioFingerprint.findUnique({
            where: {
              ownerId_sha256: {
                ownerId: userId,
                sha256: reservation.claimedSha256,
              },
            },
            include: sermonFingerprintHistoryInclude,
          });

        if (
          currentReservation.reattachEvaluationId &&
          (!currentReservation.fingerprintId ||
            currentReservation.fingerprintId !== fingerprint?.id)
        ) {
          throw new SermonApiError(
            "The reattachment reservation is no longer valid",
            409,
          );
        }

        if (!fingerprint) {
          fingerprint = await tx.sermonAudioFingerprint.create({
            data: {
              ownerId: userId,
              sha256: reservation.claimedSha256,
            },
            include: sermonFingerprintHistoryInclude,
          });
        }

        const existingAsset = fingerprint.audioAsset;
        const reusableProvisionalAsset = Boolean(
          fingerprint.verificationState !== "VERIFIED" &&
            existingAsset &&
            (existingAsset.verificationState === "REJECTED" ||
              (existingAsset.verificationState === "PENDING" &&
                fingerprint.evaluations.length > 0 &&
                fingerprint.evaluations.every((evaluation) =>
                  !SERMON_ACTIVE_STATUSES.includes(
                    evaluation.status,
                  ),
                ))),
        );
        if (
          reusableProvisionalAsset &&
          (existingAsset?.appwriteBucketId ||
            existingAsset?.appwriteFileId)
        ) {
          throw new SermonApiError(
            "The previously rejected audio is still awaiting storage cleanup; retry after cleanup completes",
            409,
          );
        }
        if (
          existingAsset?.appwriteFileId &&
          existingAsset.appwriteFileId !== reservation.appwriteFileId &&
          !reusableProvisionalAsset
        ) {
          redundantFileId = reservation.appwriteFileId;
          const decision = serializeFingerprintDecision(fingerprint);
          if (decision) {
            await tx.sermonUploadReservation.update({
              where: { id: reservation.id },
              data: {
                state: "CANCELED",
                fingerprintId: fingerprint.id,
              },
            });
            return decision;
          }
          const canonicalReservation =
            await tx.sermonUploadReservation.findFirst({
              where: {
                ownerId: userId,
                fingerprintId: fingerprint.id,
                appwriteFileId: existingAsset.appwriteFileId,
                state: "FINALIZED",
                requestedPreset: currentReservation.requestedPreset,
                requestedRuns: currentReservation.requestedRuns,
                expiresAt: { gt: new Date() },
              },
              orderBy: { finalizedAt: "desc" },
            });
          if (canonicalReservation) {
            await tx.sermonUploadReservation.update({
              where: { id: reservation.id },
              data: {
                state: "CANCELED",
                fingerprintId: fingerprint.id,
              },
            });
            return {
              decision: "audio_ready" as const,
              reservationId: canonicalReservation.id,
              audioAssetId: existingAsset.id,
              expiresAt:
                canonicalReservation.expiresAt.toISOString(),
            };
          }
          await tx.sermonUploadReservation.update({
            where: { id: reservation.id },
            data: {
              state: "FINALIZED",
              finalizedAt: new Date(),
              fingerprintId: fingerprint.id,
            },
          });
          return {
            decision: "audio_ready" as const,
            reservationId: reservation.id,
            audioAssetId: existingAsset.id,
            expiresAt: reservation.expiresAt.toISOString(),
          };
        }

        if (fingerprint.verificationState !== "VERIFIED") {
          fingerprint = await tx.sermonAudioFingerprint.update({
            where: { id: fingerprint.id },
            data: {
              verificationState: "PROVISIONAL",
              verifiedAt: null,
              lastSeenAt: new Date(),
            },
            include: sermonFingerprintHistoryInclude,
          });
        }
        const audioAsset = existingAsset
          ? await tx.sermonAudioAsset.update({
              where: { id: existingAsset.id },
              data: {
                appwriteBucketId: reservation.appwriteBucketId,
                appwriteFileId: reservation.appwriteFileId,
                originalFilename: reservation.originalFilename,
                mimeType: reservation.mimeType,
                byteSize: reservation.byteSize,
                verificationState: "PENDING",
                deletedAt: null,
                verifiedAt: null,
              },
            })
          : await tx.sermonAudioAsset.create({
              data: {
                fingerprintId: fingerprint.id,
                appwriteBucketId: reservation.appwriteBucketId,
                appwriteFileId: reservation.appwriteFileId,
                originalFilename: reservation.originalFilename,
                mimeType: reservation.mimeType,
                byteSize: reservation.byteSize,
              },
            });
        if (currentReservation.reattachEvaluationId) {
          const target = await tx.sermonEvaluation.findFirst({
            where: {
              id: currentReservation.reattachEvaluationId,
              ownerId: userId,
              fingerprintId: fingerprint.id,
              audioAssetId: null,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!target) {
            throw new SermonApiError(
              "The reattachment target is invalid",
              409,
            );
          }
          const reattached =
            await tx.sermonEvaluation.updateMany({
              where: {
                ownerId: userId,
                fingerprintId: fingerprint.id,
                audioAssetId: null,
                deletedAt: null,
              },
              data: { audioAssetId: audioAsset.id },
            });
          if (reattached.count < 1) {
            throw new SermonApiError(
              "The reattachment target is invalid",
              409,
            );
          }
          await tx.sermonAudioAsset.update({
            where: { id: audioAsset.id },
            data: {
              referenceCount: { increment: reattached.count },
            },
          });
        }
        await tx.sermonUploadReservation.update({
          where: { id: reservation.id },
          data: {
            state: "FINALIZED",
            finalizedAt: new Date(),
            fingerprintId: fingerprint.id,
          },
        });
        return {
          decision: "audio_ready" as const,
          reservationId: reservation.id,
          audioAssetId: audioAsset.id,
          expiresAt: reservation.expiresAt.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (redundantFileId) {
      await deleteSermonAudioFile(redundantFileId).catch((error) => {
        console.error("Failed to delete redundant sermon upload", error);
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCreateSermonEvaluation(request: Request) {
  try {
    const { user, userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId || !user) return authenticatedError(authError);
    const parsed = await parseJsonRequest(
      request,
      createSermonEvaluationRequestSchema,
    );
    if (!parsed.success) return parsed.response;

    const selection = resolveRunSelection(
      parsed.data,
      isSermonEvaluationAdmin(user),
    );
    const upload = await prisma.sermonUploadReservation.findFirst({
      where: {
        id: parsed.data.uploadReservationId,
        ownerId: userId,
        state: "FINALIZED",
        expiresAt: { gt: new Date() },
      },
      include: {
        fingerprint: { include: { audioAsset: true } },
      },
    });
    if (
      !upload?.fingerprint?.audioAsset ||
      upload.requestedPreset !== selection.preset ||
      upload.requestedRuns !== selection.requestedRuns
    ) {
      throw new SermonApiError(
        "A matching finalized upload reservation is required",
        409,
      );
    }

    const evaluation = await createReservedSermonEvaluation({
      ownerId: userId,
      actorId: userId,
      isAdmin: isSermonEvaluationAdmin(user),
      fingerprintId: upload.fingerprint.id,
      audioAssetId: upload.fingerprint.audioAsset.id,
      title: parsed.data.title,
      preacher: parsed.data.preacher,
      preachedOn: new Date(`${parsed.data.preachedOn}T00:00:00.000Z`),
      selection,
      durationAdjustmentEnabled:
        parsed.data.durationAdjustmentEnabled,
      uploadReservationId: upload.id,
    });
    await invokeSermonEvaluationWorker({
      action: "evaluate",
      evaluationId: evaluation.id,
    }).catch((error) => {
      console.error(
        "Sermon worker invocation failed; recovery will retry queued job",
        { evaluationId: evaluation.id, error },
      );
    });
    return NextResponse.json(
      {
        evaluation: serializeEvaluationSummary(evaluation),
        detailUrl: `/sermon-evaluation/${evaluation.id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleListSermonEvaluations(request: Request) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const url = new URL(request.url);
    const parsed = listSermonEvaluationsQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters" },
        { status: 400 },
      );
    }
    const { limit, cursor, ...filters } = parsed.data;
    const evaluations = await prisma.sermonEvaluation.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
        status: filters.status,
        preacherId: filters.preacherId,
        preachedOn:
          filters.preachedFrom || filters.preachedTo
            ? {
                gte: filters.preachedFrom
                  ? new Date(`${filters.preachedFrom}T00:00:00.000Z`)
                  : undefined,
                lte: filters.preachedTo
                  ? new Date(`${filters.preachedTo}T00:00:00.000Z`)
                  : undefined,
              }
            : undefined,
        durationAdjustmentEnabled:
          filters.durationAdjusted === undefined
            ? undefined
            : filters.durationAdjusted === "true",
      },
      include: { preacher: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
    });
    const hasMore = evaluations.length > limit;
    const page = evaluations.slice(0, limit);
    return NextResponse.json({
      evaluations: page.map(serializeEvaluationSummary),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function getOwnedEvaluationDetail(ownerId: string, id: string) {
  return prisma.sermonEvaluation.findFirst({
    where: { id, ownerId, deletedAt: null },
    include: {
      preacher: true,
      audioAsset: true,
      fingerprint: {
        include: {
          evaluations: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      reportArtifacts: {
        select: {
          format: true,
          reportVersion: true,
          createdAt: true,
        },
        orderBy: [
          { reportVersion: "desc" },
          { format: "asc" },
        ],
      },
    },
  });
}

export async function handleGetSermonEvaluation(id: string) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const evaluation = await getOwnedEvaluationDetail(userId, id);
    if (!evaluation) {
      throw new SermonApiError("Sermon evaluation not found", 404);
    }
    const canonical = await resolveOwnedCanonicalEvaluation(
      userId,
      evaluation.id,
      evaluation.result,
    );
    const audio = evaluation.audioAsset;
    const history = serializeSermonHistory(
      evaluation.fingerprint.evaluations,
    );
    const credits = getCreditBalance(evaluation.fingerprint);
    return NextResponse.json({
      evaluation: {
        ...serializeEvaluationSummary(evaluation),
        sourceEvaluationId: evaluation.sourceEvaluationId,
        canonicalEvaluationId:
          canonical?.canonicalEvaluationId ?? null,
        canonicalDetailUrl: canonical?.canonicalDetailUrl ?? null,
        audio: {
          retained: Boolean(audio?.appwriteFileId && !audio.deletedAt),
          filename: audio?.originalFilename ?? null,
          mimeType: audio?.mimeType ?? null,
          byteSize: audio?.byteSize ?? null,
          durationSeconds: audio?.durationSeconds ?? null,
          verified: audio?.verificationState === "VERIFIED",
        },
        progress: serializeProgress(evaluation),
        duration: serializeDuration(evaluation),
        result: asJsonObject(evaluation.result),
        provenance: asJsonObject(evaluation.provenance),
        history,
        credits,
        reportFormats: evaluation.reportArtifacts.map((artifact) =>
          artifact.format.toLowerCase(),
        ),
        reports: evaluation.reportArtifacts.map((artifact) => ({
          format: artifact.format.toLowerCase(),
          version: artifact.reportVersion,
          createdAt: artifact.createdAt.toISOString(),
        })),
        durationPolicyUpdatedAt:
          evaluation.durationPolicyUpdatedAt?.toISOString() ?? null,
        reportRegenerationPending:
          isDurationReportRegenerationPending(
            evaluation.durationPolicyUpdatedAt,
            evaluation.reportArtifacts,
          ),
      },
      history,
      credits,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleGetSermonEvaluationStatus(id: string) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const evaluation = await prisma.sermonEvaluation.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
      include: { fingerprint: true },
    });
    if (!evaluation) {
      throw new SermonApiError("Sermon evaluation not found", 404);
    }
    const canonical = await resolveOwnedCanonicalEvaluation(
      userId,
      evaluation.id,
      evaluation.result,
    );
    return NextResponse.json({
      evaluationId: evaluation.id,
      progress: serializeProgress(evaluation),
      credits: getCreditBalance(evaluation.fingerprint),
      canonicalEvaluationId:
        canonical?.canonicalEvaluationId ?? null,
      canonicalDetailUrl: canonical?.canonicalDetailUrl ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleGetSermonAnalytics() {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const evaluations = await prisma.sermonEvaluation.findMany({
      where: { ownerId: userId, deletedAt: null },
      include: {
        preacher: true,
        audioAsset: true,
        fingerprint: true,
      },
      orderBy: { preachedOn: "asc" },
    });
    const complete = evaluations.filter((evaluation) =>
      SERMON_COMPLETE_STATUSES.includes(evaluation.status),
    ).length;
    const active = evaluations.filter((evaluation) =>
      SERMON_ACTIVE_STATUSES.includes(evaluation.status),
    ).length;
    return NextResponse.json({
      totals: {
        evaluations: evaluations.length,
        complete,
        active,
        preachers: new Set(
          evaluations.map((evaluation) => evaluation.preacherId),
        ).size,
      },
      series: evaluations.map((evaluation) => {
        const analytics = extractAnalyticsResult(evaluation.result);
        return {
          evaluationId: evaluation.id,
          preacherId: evaluation.preacher.id,
          preacher: evaluation.preacher.displayName,
          title: evaluation.title,
          preachedOn: evaluation.preachedOn.toISOString().slice(0, 10),
          preset: toApiPreset(evaluation.preset),
          requestedRuns: evaluation.requestedRuns,
          completedRuns: evaluation.completedRuns,
          createdAt: evaluation.createdAt.toISOString(),
          updatedAt: evaluation.updatedAt.toISOString(),
          durationSeconds:
            evaluation.audioAsset?.durationSeconds ?? null,
          hasRetainedAudio: Boolean(
            evaluation.audioAsset?.appwriteFileId &&
              !evaluation.audioAsset.deletedAt,
          ),
          credits: getCreditBalance(evaluation.fingerprint),
          overallImpactBase: evaluation.overallImpactBase,
          overallImpactAdjusted: evaluation.overallImpactAdjusted,
          aggregateScores: analytics.aggregateScores,
          uncertaintyLow: analytics.uncertaintyLow,
          uncertaintyHigh: analytics.uncertaintyHigh,
          durationAdjustmentEnabled:
            evaluation.durationAdjustmentEnabled,
          status: evaluation.status,
        };
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCancelSermonEvaluation(id: string) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const evaluation = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`sermon-owner:${userId}`}, 0))
        `;
        const current = await tx.sermonEvaluation.findFirst({
          where: { id, ownerId: userId, deletedAt: null },
          include: { creditReservation: true },
        });
        if (!current) {
          throw new SermonApiError("Sermon evaluation not found", 404);
        }
        if (!SERMON_ACTIVE_STATUSES.includes(current.status)) {
          throw new SermonApiError(
            "Only an active sermon evaluation can be canceled",
            409,
          );
        }
        if (current.status === "QUEUED") {
          const canceledAt = new Date();
          if (current.creditReservation?.state === "RESERVED") {
            await tx.sermonAudioFingerprint.update({
              where: { id: current.fingerprintId },
              data: {
                runCreditsReserved: {
                  decrement:
                    current.creditReservation.requestedCredits,
                },
              },
            });
            await tx.sermonRunCreditReservation.update({
              where: { evaluationId: current.id },
              data: {
                state: "RELEASED",
                releasedAt: canceledAt,
                releaseReason: "CANCELED_BEFORE_SCORING",
              },
            });
          }
          return tx.sermonEvaluation.update({
            where: { id: current.id },
            data: {
              status: "CANCELED",
              cancelRequestedAt: canceledAt,
              canceledAt,
              version: { increment: 1 },
            },
          });
        }
        return tx.sermonEvaluation.update({
          where: { id: current.id },
          data: {
            cancelRequestedAt: new Date(),
            version: { increment: 1 },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({
      evaluationId: evaluation.id,
      status: evaluation.status,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleRetrySermonEvaluation(id: string) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const evaluation = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`sermon-owner:${userId}`}, 0))
        `;
        const current = await tx.sermonEvaluation.findFirst({
          where: {
            id,
            ownerId: userId,
            deletedAt: null,
            status: { in: SERMON_RETRYABLE_STATUSES },
          },
          include: {
            audioAsset: true,
            fingerprint: true,
            creditReservation: true,
          },
        });
        if (!current) {
          const exists = await tx.sermonEvaluation.findFirst({
            where: { id, ownerId: userId, deletedAt: null },
            select: { id: true },
          });
          throw new SermonApiError(
            "Only a failed or timed-out evaluation can be retried",
            exists ? 409 : 404,
          );
        }
        const audio = current.audioAsset;
        if (
          !audio?.appwriteFileId ||
          audio.deletedAt ||
          audio.verificationState === "DELETED" ||
          audio.verificationState === "REJECTED" ||
          current.fingerprint.verificationState === "REJECTED"
        ) {
          throw new SermonApiError(
            "This evaluation cannot be retried because its retained audio is missing or failed verification",
            409,
          );
        }
        const reservation = current.creditReservation;
        if (!reservation) {
          throw new SermonApiError(
            "This evaluation has no recoverable scoring-run credit reservation",
            409,
          );
        }
        if (reservation.state === "RELEASED") {
          const restored = await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE "sermonAudioFingerprint"
            SET
              "runCreditsReserved" = "runCreditsReserved" + ${reservation.requestedCredits},
              "lastSeenAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${current.fingerprintId}
              AND "runCreditsConsumed" + "runCreditsReserved" + ${reservation.requestedCredits}
                <= "runCreditsLimit"
            RETURNING "id"
          `;
          if (restored.length !== 1) {
            throw new SermonApiError(
              "The scoring-run credits released by this attempt are no longer available",
              409,
            );
          }
          const reservationRestored =
            await tx.sermonRunCreditReservation.updateMany({
              where: {
                id: reservation.id,
                state: "RELEASED",
              },
              data: {
                state: "RESERVED",
                releasedAt: null,
                releaseReason: null,
              },
            });
          if (reservationRestored.count !== 1) {
            throw new SermonApiError(
              "The scoring-run credit reservation changed during retry",
              409,
            );
          }
        }
        const transitioned = await tx.sermonEvaluation.updateMany({
          where: {
            id: current.id,
            ownerId: userId,
            deletedAt: null,
            status: { in: SERMON_RETRYABLE_STATUSES },
          },
          data: {
            status: "QUEUED",
            cancelRequestedAt: null,
            canceledAt: null,
            attemptDeadlineAt: null,
            errorCode: null,
            errorMessage: null,
            version: { increment: 1 },
          },
        });
        if (transitioned.count !== 1) {
          throw new SermonApiError(
            "Only a failed or timed-out evaluation can be retried",
            409,
          );
        }
        const updated = await tx.sermonEvaluation.findUnique({
          where: { id: current.id },
        });
        if (!updated) {
          throw new SermonApiError("Sermon evaluation not found", 404);
        }
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await invokeSermonEvaluationWorker({
      action: "evaluate",
      evaluationId: evaluation.id,
    }).catch((error) => {
      console.error(
        "Sermon retry invocation failed; recovery will retry queued job",
        { evaluationId: evaluation.id, error },
      );
    });
    return NextResponse.json({
      evaluationId: evaluation.id,
      status: evaluation.status,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleReevaluateSermon(
  request: Request,
  id: string,
) {
  try {
    const { user, userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId || !user) return authenticatedError(authError);
    const parsed = await parseJsonRequest(
      request,
      reevaluateSermonRequestSchema,
    );
    if (!parsed.success) return parsed.response;
    const source = await prisma.sermonEvaluation.findFirst({
      where: {
        id,
        ownerId: userId,
        deletedAt: null,
        status: { in: SERMON_COMPLETE_STATUSES },
      },
      include: { preacher: true, audioAsset: true },
    });
    if (!source) {
      throw new SermonApiError(
        "A completed sermon evaluation is required",
        404,
      );
    }
    if (!source.audioAsset?.appwriteFileId) {
      throw new SermonApiError(
        "Reattach the original audio before re-evaluating",
        409,
      );
    }
    const selection = resolveRunSelection(
      parsed.data,
      isSermonEvaluationAdmin(user),
    );
    const evaluation = await createReservedSermonEvaluation({
      ownerId: userId,
      actorId: userId,
      isAdmin: isSermonEvaluationAdmin(user),
      fingerprintId: source.fingerprintId,
      audioAssetId: source.audioAsset.id,
      title: source.title,
      preacher: source.preacher.displayName,
      preachedOn: source.preachedOn,
      selection,
      durationAdjustmentEnabled:
        source.durationAdjustmentEnabled,
      sourceEvaluationId: source.id,
    });
    await invokeSermonEvaluationWorker({
      action: "evaluate",
      evaluationId: evaluation.id,
    }).catch((error) => {
      console.error(
        "Sermon reevaluation invocation failed; recovery will retry queued job",
        { evaluationId: evaluation.id, error },
      );
    });
    return NextResponse.json(
      {
        evaluation: serializeEvaluationSummary(evaluation),
        detailUrl: `/sermon-evaluation/${evaluation.id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleUpdateSermonDurationPolicy(
  request: Request,
  id: string,
) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const parsed = await parseJsonRequest(
      request,
      updateSermonDurationPolicyRequestSchema,
    );
    if (!parsed.success) return parsed.response;
    const current = await prisma.sermonEvaluation.findFirst({
      where: {
        id,
        ownerId: userId,
        deletedAt: null,
        status: { in: SERMON_COMPLETE_STATUSES },
      },
    });
    if (!current) {
      throw new SermonApiError(
        "Duration policy can be changed only for a completed evaluation",
        404,
      );
    }
    const evaluation = await prisma.$transaction(async (tx) => {
      const updated = await tx.sermonEvaluation.update({
        where: { id: current.id },
        data: {
          durationAdjustmentEnabled: parsed.data.enabled,
          durationPolicyUpdatedAt: new Date(),
          durationPolicyUpdatedBy: userId,
          version: { increment: 1 },
        },
      });
      await tx.sermonAdminAuditEvent.create({
        data: {
          actorId: userId,
          ownerId: userId,
          evaluationId: current.id,
          action: "DURATION_POLICY_UPDATED",
          reasonCode: parsed.data.enabled
            ? "DURATION_ADJUSTMENT_ENABLED"
            : "DURATION_ADJUSTMENT_DISABLED",
        },
      });
      return updated;
    });
    await invokeSermonEvaluationWorker({
      action: "regenerate_reports",
      evaluationId: evaluation.id,
    }).catch((error) => {
      console.error("Sermon report regeneration invocation failed", {
        evaluationId: evaluation.id,
        error,
      });
    });
    return NextResponse.json({
      evaluationId: evaluation.id,
      duration: serializeDuration(evaluation),
      reportRegenerationPending: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCreateSermonPlaybackToken(id: string) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const evaluation = await prisma.sermonEvaluation.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
      include: { audioAsset: true },
    });
    const fileId = evaluation?.audioAsset?.appwriteFileId;
    if (!evaluation || !fileId || evaluation.audioAsset?.deletedAt) {
      throw new SermonApiError("Retained sermon audio not found", 404);
    }
    const playback = await createSermonPlaybackUrl(fileId);
    return NextResponse.json({
      url: playback.url,
      expiresAt: playback.expiresAt.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleDeleteSermonAudio(id: string) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const deletion = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`sermon-owner:${userId}`}, 0))
        `;
        const current = await tx.sermonEvaluation.findFirst({
          where: { id, ownerId: userId, deletedAt: null },
          include: { audioAsset: true },
        });
        const asset = current?.audioAsset;
        if (!current || !asset?.appwriteFileId) {
          throw new SermonApiError(
            "Retained sermon audio not found",
            404,
          );
        }
        const activeReference =
          await tx.sermonEvaluation.findFirst({
            where: {
              ownerId: userId,
              audioAssetId: asset.id,
              deletedAt: null,
              status: { in: SERMON_ACTIVE_STATUSES },
            },
            select: { id: true },
          });
        if (activeReference) {
          throw new SermonApiError(
            "Cancel active evaluations before deleting their audio",
            409,
          );
        }
        await tx.sermonEvaluation.updateMany({
          where: { ownerId: userId, audioAssetId: asset.id },
          data: { audioAssetId: null },
        });
        await tx.sermonAudioAsset.update({
          where: { id: asset.id },
          data: {
            verificationState: "DELETED",
            deletedAt: new Date(),
            referenceCount: 0,
          },
        });
        return {
          evaluationId: current.id,
          assetId: asset.id,
          fileId: asset.appwriteFileId,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
    const audioDeleted = await cleanDeletedSermonAudioAsset(
      deletion.assetId,
      deletion.fileId,
    );
    return NextResponse.json({
      deleted: true,
      evaluationId: deletion.evaluationId,
      audioDeleted,
      cleanupPending: !audioDeleted,
      creditsRestored: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleDeleteSermonEvaluation(id: string) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`sermon-owner:${userId}`}, 0))
        `;
        const evaluation = await tx.sermonEvaluation.findFirst({
          where: { id, ownerId: userId, deletedAt: null },
          include: { audioAsset: true },
        });
        if (!evaluation) {
          throw new SermonApiError(
            "Sermon evaluation not found",
            404,
          );
        }
        if (SERMON_ACTIVE_STATUSES.includes(evaluation.status)) {
          throw new SermonApiError(
            "Cancel the active evaluation before deleting it",
            409,
          );
        }
        const shouldDeleteAudio =
          evaluation.audioAsset?.referenceCount === 1 &&
          Boolean(evaluation.audioAsset.appwriteFileId);
        await tx.sermonEvaluation.update({
          where: { id: evaluation.id },
          data: { deletedAt: new Date(), audioAssetId: null },
        });
        if (evaluation.audioAsset) {
          await tx.sermonAudioAsset.update({
            where: { id: evaluation.audioAsset.id },
            data: shouldDeleteAudio
              ? {
                  verificationState: "DELETED",
                  deletedAt: new Date(),
                  referenceCount: 0,
                }
              : { referenceCount: { decrement: 1 } },
          });
        }
        return {
          evaluation,
          shouldDeleteAudio,
          assetId: shouldDeleteAudio
            ? evaluation.audioAsset?.id ?? null
            : null,
          fileId: shouldDeleteAudio
            ? evaluation.audioAsset?.appwriteFileId ?? null
            : null,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
    const audioDeleted =
      result.assetId && result.fileId
        ? await cleanDeletedSermonAudioAsset(
            result.assetId,
            result.fileId,
          )
        : false;
    return NextResponse.json({
      deleted: true,
      evaluationId: result.evaluation.id,
      audioDeleted,
      cleanupPending: result.shouldDeleteAudio && !audioDeleted,
      creditsRestored: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const exportFormatSchema = z.enum(["markdown", "pdf", "json", "csv"]);

export async function handleGetSermonExport(
  request: Request,
  id: string,
  requestedFormat: string,
) {
  try {
    const { userId, errorResponse: authError } =
      await requireSermonEvaluationAccess();
    if (authError || !userId) return authenticatedError(authError);
    const format = exportFormatSchema.safeParse(requestedFormat);
    if (!format.success) {
      throw new SermonApiError("Unsupported sermon export format", 400);
    }
    const evaluation = await prisma.sermonEvaluation.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
    });
    if (!evaluation) {
      throw new SermonApiError("Sermon evaluation not found", 404);
    }
    const requestedVersion = new URL(request.url).searchParams.get(
      "version",
    );
    const reportVersion =
      requestedVersion === null
        ? undefined
        : z.coerce.number().int().min(1).safeParse(requestedVersion);
    if (reportVersion && !reportVersion.success) {
      throw new SermonApiError("Invalid report version", 400);
    }
    const artifact = await prisma.sermonReportArtifact.findFirst({
      where: {
        evaluationId: evaluation.id,
        format: (format.data === "pdf"
          ? "MARKDOWN"
          : format.data.toUpperCase()) as
          | "MARKDOWN"
          | "JSON"
          | "CSV",
        reportVersion:
          reportVersion?.success === true
            ? reportVersion.data
            : undefined,
      },
      orderBy: { reportVersion: "desc" },
    });
    if (!artifact) {
      throw new SermonApiError("Sermon report is not available", 404);
    }
    const mediaTypes = {
      markdown: "text/markdown; charset=utf-8",
      pdf: "application/pdf",
      json: "application/json; charset=utf-8",
      csv: "text/csv; charset=utf-8",
    } as const;
    const extensions = {
      markdown: "md",
      pdf: "pdf",
      json: "json",
      csv: "csv",
    };
    const safeTitle =
      evaluation.title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "sermon-evaluation";
    const content =
      format.data === "pdf"
        ? Buffer.from(
            await renderSermonMarkdownPdf(
              Buffer.from(artifact.content).toString("utf8"),
              {
                title: evaluation.title,
              },
            ),
          )
        : artifact.content;
    const checksum =
      format.data === "pdf"
        ? createHash("sha256").update(content).digest("hex")
        : artifact.checksum;
    return new Response(content, {
      headers: {
        "Content-Type": mediaTypes[format.data],
        "Content-Disposition": `attachment; filename="${safeTitle}.${extensions[format.data]}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ETag: `"${checksum}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
