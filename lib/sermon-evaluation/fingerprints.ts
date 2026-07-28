import type { Prisma } from "@prisma/client";

import { getCreditBalance, toApiPreset } from "./types";

export const sermonFingerprintHistoryInclude = {
  audioAsset: true,
  evaluations: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { preacher: true },
  },
} satisfies Prisma.sermonAudioFingerprintInclude;

export function serializeSermonHistory(
  evaluations: Array<{
    id: string;
    title: string;
    preachedOn: Date;
    preset: "STANDARD" | "HIGH_CONFIDENCE" | "CUSTOM";
    requestedRuns: number;
    completedRuns: number;
    overallImpactBase: number | null;
    overallImpactAdjusted: number | null;
    durationAdjustmentEnabled: boolean;
    status:
      | "QUEUED"
      | "PREPARING_AUDIO"
      | "EXTRACTING"
      | "SCORING"
      | "HARMONIZING"
      | "CALIBRATING"
      | "SUMMARIZING"
      | "COMPLETE"
      | "COMPLETE_WITH_WARNINGS"
      | "FAILED"
      | "TIMED_OUT"
      | "CANCELED";
    createdAt: Date;
  }>,
) {
  return evaluations.map((evaluation) => ({
    id: evaluation.id,
    title: evaluation.title,
    preachedOn: evaluation.preachedOn.toISOString().slice(0, 10),
    preset: toApiPreset(evaluation.preset),
    requestedRuns: evaluation.requestedRuns,
    completedRuns: evaluation.completedRuns,
    status: evaluation.status,
    overallImpactBase: evaluation.overallImpactBase,
    overallImpactAdjusted: evaluation.overallImpactAdjusted,
    durationAdjustmentEnabled:
      evaluation.durationAdjustmentEnabled,
    createdAt: evaluation.createdAt.toISOString(),
  }));
}

export function serializeFingerprintDecision(
  fingerprint: Prisma.sermonAudioFingerprintGetPayload<{
    include: typeof sermonFingerprintHistoryInclude;
  }>,
) {
  if (fingerprint.verificationState !== "VERIFIED") {
    return null;
  }
  const latestEvaluation = fingerprint.evaluations[0];
  if (!latestEvaluation) {
    return null;
  }
  const history = serializeSermonHistory(fingerprint.evaluations);
  const credits = getCreditBalance(fingerprint);
  const detailUrl = `/sermon-evaluation/${latestEvaluation.id}`;
  const retainedAudio = Boolean(
    fingerprint.audioAsset?.appwriteFileId &&
      !fingerprint.audioAsset.deletedAt,
  );
  if (!retainedAudio) {
    return {
      decision: "reattach_required" as const,
      evaluationId: latestEvaluation.id,
      detailUrl,
      history,
      credits,
    };
  }
  return {
    decision: "existing_evaluation" as const,
    evaluationId: latestEvaluation.id,
    detailUrl,
    retainedAudio: true,
    history,
    credits,
  };
}
