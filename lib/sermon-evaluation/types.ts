import type {
  SermonEvaluationPreset,
  SermonEvaluationStatus,
  sermonAudioFingerprint,
} from "@prisma/client";

export const SERMON_AUDIO_MAX_MIB = 100;
export const SERMON_AUDIO_MAX_BYTES = SERMON_AUDIO_MAX_MIB * 1024 * 1024;
export const SERMON_AUDIO_MAX_DURATION_SECONDS = 10_800;
export const SERMON_RUN_CREDITS_LIMIT = 9;
export const SERMON_DAILY_RUN_LIMIT = 6;
export const SERMON_UPLOAD_RESERVATION_TTL_MS = 15 * 60 * 1000;
export const SERMON_UPLOAD_PREPARE_RATE_LIMIT = 10;
export const SERMON_MAX_ACTIVE_UPLOAD_RESERVATIONS = 3;
export const SERMON_PLAYBACK_TOKEN_TTL_MS = 5 * 60 * 1000;

export const SERMON_ACTIVE_STATUSES: SermonEvaluationStatus[] = [
  "QUEUED",
  "PREPARING_AUDIO",
  "EXTRACTING",
  "SCORING",
  "HARMONIZING",
  "AGGREGATING",
  "SUMMARIZING",
];

export const SERMON_COMPLETE_STATUSES: SermonEvaluationStatus[] = [
  "COMPLETE",
  "COMPLETE_WITH_WARNINGS",
];

export const SERMON_RETRYABLE_STATUSES: SermonEvaluationStatus[] = [
  "FAILED",
  "TIMED_OUT",
];

export type SermonRunSelection = {
  preset: SermonEvaluationPreset;
  requestedRuns: number;
};

export function toApiPreset(preset: SermonEvaluationPreset) {
  switch (preset) {
    case "STANDARD":
      return "standard" as const;
    case "HIGH_CONFIDENCE":
      return "high_confidence" as const;
    case "CUSTOM":
      return "custom" as const;
  }
}

export function getCreditBalance(
  fingerprint: Pick<
    sermonAudioFingerprint,
    "runCreditsLimit" | "runCreditsConsumed" | "runCreditsReserved"
  >,
) {
  return {
    runCreditsLimit: fingerprint.runCreditsLimit,
    runCreditsConsumed: fingerprint.runCreditsConsumed,
    runCreditsReserved: fingerprint.runCreditsReserved,
    runCreditsRemaining: Math.max(
      0,
      fingerprint.runCreditsLimit -
        fingerprint.runCreditsConsumed -
        fingerprint.runCreditsReserved,
    ),
  };
}

export function startOfCurrentUtcDay(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
