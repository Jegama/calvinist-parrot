import { z } from "zod";

import { isoDateTimeSchema, resourceIdSchema } from "./common";

export const sermonEvaluationStatusSchema = z.enum([
  "QUEUED",
  "PREPARING_AUDIO",
  "EXTRACTING",
  "SCORING",
  "HARMONIZING",
  "AGGREGATING",
  "SUMMARIZING",
  "COMPLETE",
  "COMPLETE_WITH_WARNINGS",
  "FAILED",
  "TIMED_OUT",
  "CANCELED",
]);

export const sermonEvaluationPresetSchema = z.enum([
  "standard",
  "high_confidence",
  "custom",
]);

export const sermonRunSelectionSchema = z.discriminatedUnion("preset", [
  z.strictObject({ preset: z.literal("standard") }),
  z.strictObject({ preset: z.literal("high_confidence") }),
  z.strictObject({
    preset: z.literal("custom"),
    requestedRuns: z.number().int().min(1).max(9),
  }),
]);

export const sermonCapabilitiesSchema = z.strictObject({
  hasAccess: z.boolean(),
  isAdmin: z.boolean(),
  canChooseCustomRunCount: z.boolean(),
  dailyQuotaExempt: z.boolean(),
  allowedRunCount: z.strictObject({
    min: z.number().int().min(1).max(1),
    max: z.number().int().min(3).max(9),
  }),
  dailyRunLimit: z.number().int().min(1),
});

export const sermonCapabilitiesResponseSchema = z.strictObject({
  capabilities: sermonCapabilitiesSchema,
});

const sermonHistoryItemSchema = z.strictObject({
  id: resourceIdSchema,
  title: z.string(),
  preachedOn: z.string(),
  preset: sermonEvaluationPresetSchema,
  requestedRuns: z.number().int().min(1).max(9),
  completedRuns: z.number().int().min(0).max(9),
  status: sermonEvaluationStatusSchema,
  overallImpactBase: z.number().nullable(),
  overallImpactAdjusted: z.number().nullable(),
  durationAdjustmentEnabled: z.boolean(),
  createdAt: isoDateTimeSchema,
});

const sermonCreditBalanceSchema = z.strictObject({
  runCreditsLimit: z.number().int().min(9).max(9),
  runCreditsConsumed: z.number().int().min(0).max(9),
  runCreditsReserved: z.number().int().min(0).max(9),
  runCreditsRemaining: z.number().int().min(0).max(9),
});

const sha256Schema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase());

const sermonUploadMetadataSchema = z.strictObject({
  sha256: sha256Schema,
  byteSize: z.number().int().min(1).max(62_914_560),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
  ]),
  reattachEvaluationId: resourceIdSchema.optional(),
});

export const prepareSermonUploadRequestSchema = z.discriminatedUnion("preset", [
  sermonUploadMetadataSchema.extend({ preset: z.literal("standard") }),
  sermonUploadMetadataSchema.extend({ preset: z.literal("high_confidence") }),
  sermonUploadMetadataSchema.extend({
    preset: z.literal("custom"),
    requestedRuns: z.number().int().min(1).max(9),
  }),
]);

const existingSermonEvaluationDecisionSchema = z.strictObject({
  decision: z.literal("existing_evaluation"),
  evaluationId: resourceIdSchema,
  detailUrl: z.string().startsWith("/sermon-evaluation/"),
  retainedAudio: z.boolean(),
  history: z.array(sermonHistoryItemSchema),
  credits: sermonCreditBalanceSchema,
});

const reattachRequiredDecisionSchema = z.strictObject({
  decision: z.literal("reattach_required"),
  evaluationId: resourceIdSchema,
  detailUrl: z.string().startsWith("/sermon-evaluation/"),
  history: z.array(sermonHistoryItemSchema),
  credits: sermonCreditBalanceSchema,
});

const uploadRequiredDecisionSchema = z.strictObject({
  decision: z.literal("upload_required"),
  reservationId: resourceIdSchema,
  uploadMode: z.enum(["appwrite", "local"]),
  uploadUrl: z.string().startsWith("/").nullable(),
  uploadJwt: z.string().min(1),
  endpoint: z.string().url(),
  projectId: z.string().min(1),
  bucketId: z.string().min(1),
  fileId: z.string().min(1).max(36),
  expiresAt: isoDateTimeSchema,
});

export const prepareSermonUploadResponseSchema = z.discriminatedUnion(
  "decision",
  [
    existingSermonEvaluationDecisionSchema,
    reattachRequiredDecisionSchema,
    uploadRequiredDecisionSchema,
  ],
);

export const finalizeSermonUploadRequestSchema = z.strictObject({
  reservationId: resourceIdSchema,
  fileId: z.string().min(1).max(36),
  sha256: sha256Schema,
});

export const finalizeSermonUploadResponseSchema = z.discriminatedUnion(
  "decision",
  [
    z.strictObject({
      decision: z.literal("audio_ready"),
      reservationId: resourceIdSchema,
      audioAssetId: resourceIdSchema,
      expiresAt: isoDateTimeSchema,
    }),
    existingSermonEvaluationDecisionSchema,
  ],
);

function isExactCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const preachedOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isExactCalendarDate, {
    message: "Invalid calendar date",
  });

const createSermonEvaluationBaseSchema = z.strictObject({
  uploadReservationId: resourceIdSchema,
  title: z.string().trim().min(1).max(200),
  preacher: z.string().trim().min(1).max(120),
  preachedOn: preachedOnSchema,
  durationAdjustmentEnabled: z.boolean().default(false),
});

export const createSermonEvaluationRequestSchema = z.discriminatedUnion(
  "preset",
  [
    createSermonEvaluationBaseSchema.extend({
      preset: z.literal("standard"),
    }),
    createSermonEvaluationBaseSchema.extend({
      preset: z.literal("high_confidence"),
    }),
    createSermonEvaluationBaseSchema.extend({
      preset: z.literal("custom"),
      requestedRuns: z.number().int().min(1).max(9),
    }),
  ],
);

const sermonEvaluationSummarySchema = z.strictObject({
  id: resourceIdSchema,
  title: z.string(),
  preacher: z.strictObject({
    id: resourceIdSchema,
    displayName: z.string(),
  }),
  preachedOn: z.string(),
  preset: sermonEvaluationPresetSchema,
  requestedRuns: z.number().int().min(1).max(9),
  completedRuns: z.number().int().min(0).max(9),
  status: sermonEvaluationStatusSchema,
  durationAdjustmentEnabled: z.boolean(),
  overallImpactBase: z.number().nullable(),
  overallImpactAdjusted: z.number().nullable(),
  warningCodes: z.array(z.string()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});

export const createSermonEvaluationResponseSchema = z.strictObject({
  evaluation: sermonEvaluationSummarySchema,
  detailUrl: z.string().startsWith("/sermon-evaluation/"),
});

export const listSermonEvaluationsQuerySchema = z.strictObject({
  status: sermonEvaluationStatusSchema.optional(),
  preacherId: resourceIdSchema.optional(),
  preachedFrom: preachedOnSchema.optional(),
  preachedTo: preachedOnSchema.optional(),
  durationAdjusted: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: resourceIdSchema.optional(),
});

export const listSermonEvaluationsResponseSchema = z.strictObject({
  evaluations: z.array(sermonEvaluationSummarySchema),
  nextCursor: resourceIdSchema.nullable(),
});

const sermonEvaluationProgressSchema = z.strictObject({
  stage: sermonEvaluationStatusSchema,
  requestedRuns: z.number().int().min(1).max(9),
  completedRuns: z.number().int().min(0).max(9),
  retryWave: z.number().int().min(0).max(3),
  cancelRequested: z.boolean(),
  warningCodes: z.array(z.string()),
  error: z
    .strictObject({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
  queuedAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  attemptDeadlineAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

export const sermonEvaluationStatusResponseSchema = z.strictObject({
  evaluationId: resourceIdSchema,
  progress: sermonEvaluationProgressSchema,
  credits: sermonCreditBalanceSchema,
  canonicalEvaluationId: resourceIdSchema.nullable(),
  canonicalDetailUrl: z
    .string()
    .startsWith("/sermon-evaluation/")
    .nullable(),
});

export const getSermonEvaluationResponseSchema = z.strictObject({
  evaluation: sermonEvaluationSummarySchema.extend({
    sourceEvaluationId: resourceIdSchema.nullable(),
    canonicalEvaluationId: resourceIdSchema.nullable(),
    canonicalDetailUrl: z
      .string()
      .startsWith("/sermon-evaluation/")
      .nullable(),
    audio: z.strictObject({
      retained: z.boolean(),
      filename: z.string().nullable(),
      mimeType: z.string().nullable(),
      byteSize: z.number().int().nullable(),
      durationSeconds: z.number().nullable(),
      verified: z.boolean(),
    }),
    progress: sermonEvaluationProgressSchema,
    duration: z.strictObject({
      adjustmentEnabled: z.boolean(),
      overallImpactBase: z.number().nullable(),
      calculatedPenalty: z.number().nullable(),
      overallImpactAdjusted: z.number().nullable(),
      displayedOverallImpact: z.number().nullable(),
    }),
    result: z.record(z.string(), z.unknown()).nullable(),
    provenance: z.record(z.string(), z.unknown()).nullable(),
    history: z.array(sermonHistoryItemSchema),
    credits: sermonCreditBalanceSchema,
    reportFormats: z.array(z.enum(["markdown", "json", "csv"])),
    reports: z.array(
      z.strictObject({
        format: z.enum(["markdown", "json", "csv"]),
        version: z.number().int().min(1),
        createdAt: isoDateTimeSchema,
      }),
    ),
    durationPolicyUpdatedAt: isoDateTimeSchema.nullable(),
    reportRegenerationPending: z.boolean(),
  }),
  history: z.array(sermonHistoryItemSchema),
  credits: sermonCreditBalanceSchema,
});

export const sermonAnalyticsResponseSchema = z.strictObject({
  totals: z.strictObject({
    evaluations: z.number().int().min(0),
    complete: z.number().int().min(0),
    active: z.number().int().min(0),
    preachers: z.number().int().min(0),
  }),
  series: z.array(
    z.strictObject({
      evaluationId: resourceIdSchema,
      preacherId: resourceIdSchema,
      preacher: z.string(),
      title: z.string(),
      preachedOn: z.string(),
      preset: sermonEvaluationPresetSchema,
      requestedRuns: z.number().int().min(1).max(9),
      completedRuns: z.number().int().min(0).max(9),
      createdAt: isoDateTimeSchema,
      updatedAt: isoDateTimeSchema,
      durationSeconds: z.number().nullable(),
      hasRetainedAudio: z.boolean(),
      credits: sermonCreditBalanceSchema,
      overallImpactBase: z.number().nullable(),
      overallImpactAdjusted: z.number().nullable(),
      aggregateScores: z.strictObject({
        textualFidelity: z.number().nullable(),
        propositionClarity: z.number().nullable(),
        introduction: z.number().nullable(),
        applicationEffectiveness: z.number().nullable(),
        structureCohesion: z.number().nullable(),
        illustrations: z.number().nullable(),
        pastoralPosture: z.number().nullable(),
      }),
      uncertaintyLow: z.number().nullable(),
      uncertaintyHigh: z.number().nullable(),
      durationAdjustmentEnabled: z.boolean(),
      status: sermonEvaluationStatusSchema,
    }),
  ),
});

export const sermonMutationResponseSchema = z.strictObject({
  evaluationId: resourceIdSchema,
  status: sermonEvaluationStatusSchema,
});

export const reevaluateSermonRequestSchema = z.discriminatedUnion("preset", [
  z.strictObject({ preset: z.literal("standard") }),
  z.strictObject({ preset: z.literal("high_confidence") }),
  z.strictObject({
    preset: z.literal("custom"),
    requestedRuns: z.number().int().min(1).max(9),
  }),
]);

export const updateSermonDurationPolicyRequestSchema = z.strictObject({
  enabled: z.boolean(),
});

export const updateSermonDurationPolicyResponseSchema = z.strictObject({
  evaluationId: resourceIdSchema,
  duration: z.strictObject({
    adjustmentEnabled: z.boolean(),
    overallImpactBase: z.number().nullable(),
    calculatedPenalty: z.number().nullable(),
    overallImpactAdjusted: z.number().nullable(),
    displayedOverallImpact: z.number().nullable(),
  }),
  reportRegenerationPending: z.literal(true),
});

export const sermonPlaybackTokenResponseSchema = z.strictObject({
  url: z.string().url(),
  expiresAt: isoDateTimeSchema,
});

export const sermonDeleteResponseSchema = z.strictObject({
  deleted: z.literal(true),
  evaluationId: resourceIdSchema,
  audioDeleted: z.boolean(),
  cleanupPending: z.boolean(),
  creditsRestored: z.literal(false),
});

export type CreateSermonEvaluationRequest = z.infer<
  typeof createSermonEvaluationRequestSchema
>;
export type PrepareSermonUploadRequest = z.infer<
  typeof prepareSermonUploadRequestSchema
>;
export type ReevaluateSermonRequest = z.infer<
  typeof reevaluateSermonRequestSchema
>;
