"use client";

import type {
  PrepareUploadDecision,
  FinalizeUploadDecision,
  RunCredits,
  SermonAnalytics,
  SermonAnalyticsPoint,
  SermonCapabilities,
  SermonEvaluationDetail,
  SermonEvaluationListItem,
  SermonExportFormat,
  SermonHistoryItem,
  SermonPlaybackAuthorization,
  SermonPreset,
  SermonStatus,
  UploadAuthorization,
} from "./types";
import { isSermonStatus } from "./types";
import { normalizeSermonResult } from "./normalize";

const API_ROOT = "/api/v1/sermon-evaluations";

type JsonRecord = Record<string, unknown>;

class SermonApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SermonApiError";
    this.status = status;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function firstRecord(source: JsonRecord, ...keys: string[]): JsonRecord {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value as JsonRecord;
    }
  }
  return source;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asPreset(value: unknown): SermonPreset {
  const normalized = asString(value).toUpperCase().replaceAll("-", "_");
  if (normalized === "HIGH_CONFIDENCE" || normalized === "CUSTOM") {
    return normalized;
  }
  return "STANDARD";
}

function asStatus(value: unknown): SermonStatus {
  const normalized = asString(value).toUpperCase();
  return isSermonStatus(normalized) ? normalized : "QUEUED";
}

function readCredits(source: JsonRecord): RunCredits {
  const nested = firstRecord(source, "runCredits", "credits");
  const limit = asNumber(nested.limit ?? nested.runCreditsLimit ?? source.runCreditsLimit, 9);
  const consumed = asNumber(nested.consumed ?? nested.runCreditsConsumed ?? source.runCreditsConsumed);
  const reserved = asNumber(nested.reserved ?? nested.runCreditsReserved ?? source.runCreditsReserved);
  const remaining = asNumber(
    nested.remaining ?? nested.runCreditsRemaining ?? source.runCreditsRemaining,
    Math.max(0, limit - consumed - reserved),
  );
  return { limit, consumed, reserved, remaining };
}

function readListItem(value: unknown): SermonEvaluationListItem {
  const source = firstRecord(asRecord(value), "evaluation");
  const progressSource = firstRecord(source, "progress");
  const durationSource = firstRecord(source, "duration");
  const audioSource = firstRecord(source, "audio");
  const scoreSource = firstRecord(source, "scores", "aggregate", "result");
  const preacherSource = firstRecord(source, "preacher", "preacherRecord");
  const runCredits = readCredits(source);
  return {
    id: asString(source.id ?? source.evaluationId),
    fingerprintId: asString(
      source.fingerprintId,
      asString(source.id ?? source.evaluationId),
    ),
    title: asString(source.title, "Untitled sermon"),
    preacher: asString(
      typeof source.preacher === "string" ? source.preacher : preacherSource.displayName,
      "Unknown preacher",
    ),
    preachedOn: asString(source.preachedOn ?? source.preachedDate ?? source.createdAt),
    createdAt: asString(source.createdAt),
    updatedAt: asString(source.updatedAt ?? source.createdAt),
    status: asStatus(source.status ?? progressSource.stage),
    preset: asPreset(source.preset),
    requestedRuns: asNumber(source.requestedRuns ?? progressSource.requestedRuns, 1),
    completedRuns: asNumber(source.completedRuns ?? progressSource.completedRuns),
    overallImpactBase: asNullableNumber(
      source.overallImpactBase ?? durationSource.overallImpactBase ?? scoreSource.overallImpactBase,
    ),
    overallImpactAdjusted: asNullableNumber(
      source.overallImpactAdjusted ?? durationSource.overallImpactAdjusted ?? scoreSource.overallImpactAdjusted,
    ),
    durationAdjustmentEnabled: asBoolean(
      source.durationAdjustmentEnabled ?? durationSource.adjustmentEnabled,
    ),
    durationSeconds: asNullableNumber(source.durationSeconds ?? audioSource.durationSeconds),
    uncertaintyLow: asNullableNumber(source.uncertaintyLow ?? source.overallImpactLow),
    uncertaintyHigh: asNullableNumber(source.uncertaintyHigh ?? source.overallImpactHigh),
    hasRetainedAudio: asBoolean(
      source.hasRetainedAudio ?? source.audioRetained ?? source.audioAvailable ?? audioSource.retained,
      true,
    ),
    runCredits,
  };
}

function readStringArray(value: unknown): string[] {
  return asArray(value).map((item) => asString(item)).filter(Boolean);
}

function readAggregateScores(source: JsonRecord): Record<string, number> {
  const candidate = firstRecord(source, "aggregateScores", "aggregates", "scores");
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(candidate)) {
    const score = asNullableNumber(value);
    if (score !== null) {
      result[key] = score;
    }
  }
  return result;
}

function readHistory(value: unknown): SermonHistoryItem[] {
  return asArray(value).map((item) => {
    const source = asRecord(item);
    return {
      id: asString(source.id),
      status: asStatus(source.status),
      preset: asPreset(source.preset),
      requestedRuns: asNumber(source.requestedRuns, 1),
      completedRuns: asNumber(source.completedRuns),
      overallImpactBase: asNullableNumber(source.overallImpactBase),
      overallImpactAdjusted: asNullableNumber(source.overallImpactAdjusted),
      durationAdjustmentEnabled: asBoolean(source.durationAdjustmentEnabled),
      createdAt: asString(source.createdAt),
    };
  });
}

export function normalizeSermonEvaluationDetail(
  value: unknown,
): SermonEvaluationDetail {
  const wrapper = asRecord(value);
  const evaluation = firstRecord(wrapper, "evaluation", "detail");
  const source: JsonRecord = {
    ...evaluation,
    history: wrapper.history ?? evaluation.history,
    credits: wrapper.credits ?? evaluation.credits,
  };
  const progressSource = firstRecord(source, "progress");
  const durationSource = firstRecord(source, "duration");
  const audioSource = firstRecord(source, "audio");
  const resultSource = asRecord(source.result);
  const normalizedResult = normalizeSermonResult(resultSource);
  const base = readListItem(source);
  const provenanceSource = asRecord(source.provenance);
  const provenance: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(provenanceSource)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      provenance[key] = entry;
    }
  }

  return {
    ...base,
    audio: {
      filename: asNullableString(audioSource.filename),
      mimeType: asNullableString(audioSource.mimeType),
      byteSize: asNullableNumber(audioSource.byteSize),
      verified: asBoolean(audioSource.verified),
    },
    calculatedDurationPenalty: asNullableNumber(
      source.calculatedDurationPenalty ?? durationSource.calculatedPenalty,
    ),
    ...normalizedResult,
    warnings: asArray(source.warnings ?? source.warningCodes ?? progressSource.warningCodes).map((warning) => {
      if (typeof warning === "string") {
        return { message: warning };
      }
      const record = asRecord(warning);
      return { code: asNullableString(record.code) ?? undefined, message: asString(record.message, "Evaluation warning") };
    }),
    errorCode: asNullableString(source.errorCode ?? firstRecord(progressSource, "error").code),
    errorMessage: asNullableString(source.errorMessage ?? firstRecord(progressSource, "error").message),
    canonicalEvaluationId: asNullableString(source.canonicalEvaluationId),
    canonicalDetailUrl: asNullableString(source.canonicalDetailUrl),
    cancelRequestedAt: asBoolean(progressSource.cancelRequested)
      ? asString(progressSource.updatedAt, new Date(0).toISOString())
      : asNullableString(source.cancelRequestedAt),
    retryWave: asNullableNumber(source.retryWave ?? progressSource.retryWave),
    attemptNumber: asNullableNumber(source.attemptNumber),
    stageStartedAt: asNullableString(source.stageStartedAt ?? progressSource.startedAt),
    history: readHistory(source.history ?? source.evaluationHistory ?? source.fingerprintHistory),
    provenance,
    reports: asArray(source.reports ?? source.reportArtifacts ?? source.reportFormats).map((item) => {
      if (typeof item === "string") {
        const rawFormat = item.toLowerCase();
        const format: SermonExportFormat =
          rawFormat === "pdf" ||
          rawFormat === "json" ||
          rawFormat === "csv"
            ? rawFormat
            : "markdown";
        return { format, version: "latest" };
      }
      const record = asRecord(item);
      const rawFormat = asString(record.format).toLowerCase();
      const format: SermonExportFormat =
        rawFormat === "pdf" ||
        rawFormat === "json" ||
        rawFormat === "csv"
          ? rawFormat
          : "markdown";
      const rawVersion = record.version ?? record.reportVersion;
      const version =
        typeof rawVersion === "string" && rawVersion.length > 0
          ? rawVersion
          : typeof rawVersion === "number" && Number.isInteger(rawVersion)
            ? String(rawVersion)
            : "latest";
      return {
        format,
        version,
        createdAt: asNullableString(record.createdAt),
      };
    }),
    durationPolicyUpdatedAt: asNullableString(source.durationPolicyUpdatedAt),
    reportRegenerationPending: asBoolean(source.reportRegenerationPending),
  };
}

async function readResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    const record = asRecord(body);
    const message = asString(record.message ?? record.error, `Request failed (${response.status})`);
    throw new SermonApiError(message, response.status);
  }
  return body;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_ROOT}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  return readResponse(response);
}

export async function fetchSermonCapabilities(): Promise<SermonCapabilities> {
  let rawPayload: unknown;
  try {
    rawPayload = await request("/capabilities");
  } catch (error) {
    if (error instanceof SermonApiError && error.status === 403) {
      return {
        hasAccess: false,
        isAdmin: false,
        canChooseCustomRunCount: false,
        dailyQuotaExempt: false,
        allowedRunCountMin: 1,
        allowedRunCountMax: 3,
      };
    }
    throw error;
  }
  const payload = asRecord(rawPayload);
  const source = firstRecord(payload, "capabilities");
  const range = firstRecord(source, "allowedRunCount", "allowedRunCountRange", "allowedRunCounts");
  return {
    hasAccess: asBoolean(source.hasAccess),
    isAdmin: asBoolean(source.isAdmin),
    canChooseCustomRunCount: asBoolean(source.canChooseCustomRunCount),
    dailyQuotaExempt: asBoolean(source.dailyQuotaExempt),
    allowedRunCountMin: asNumber(source.allowedRunCountMin ?? range.min, 1),
    allowedRunCountMax: asNumber(source.allowedRunCountMax ?? range.max, 9),
  };
}

export async function fetchSermonEvaluations(): Promise<SermonEvaluationListItem[]> {
  const payload = await request("");
  const source = asRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : asArray(source.evaluations ?? source.items ?? firstRecord(source, "data").evaluations);
  return items.map(readListItem).filter((item) => item.id);
}

export async function fetchSermonAnalytics(): Promise<SermonAnalytics> {
  const payload = await request("/analytics");
  const source = asRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : asArray(
        source.evaluations ??
          source.series ??
          source.points ??
          source.timeSeries ??
          firstRecord(source, "analytics", "data").evaluations,
      );
  const evaluations: SermonAnalyticsPoint[] = items.map((item) => {
    const record = asRecord(item);
    return { ...readListItem(record), aggregateScores: readAggregateScores(record) };
  });
  return { evaluations: evaluations.filter((item) => item.id) };
}

export async function fetchSermonEvaluation(id: string): Promise<SermonEvaluationDetail> {
  return normalizeSermonEvaluationDetail(
    await request(`/${encodeURIComponent(id)}`),
  );
}

export async function fetchSermonStatus(id: string): Promise<SermonEvaluationDetail> {
  return normalizeSermonEvaluationDetail(
    await request(`/${encodeURIComponent(id)}/status`),
  );
}

function readUploadAuthorization(value: unknown): UploadAuthorization {
  const source = firstRecord(asRecord(value), "upload", "authorization");
  return {
    reservationId: asString(source.reservationId),
    mode: asString(source.uploadMode) === "local" ? "local" : "appwrite",
    uploadUrl: asNullableString(source.uploadUrl) ?? undefined,
    jwt: asString(source.jwt ?? source.uploadJwt),
    bucketId: asString(source.bucketId),
    fileId: asString(source.fileId),
    endpoint: asNullableString(source.endpoint) ?? undefined,
    projectId: asNullableString(source.projectId) ?? undefined,
    expiresAt: asNullableString(source.expiresAt) ?? undefined,
    permissions: readStringArray(source.permissions),
  };
}

export async function prepareSermonUpload(input: {
  sha256: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  preset: SermonPreset;
  requestedRuns?: number;
  reattachEvaluationId?: string;
}): Promise<PrepareUploadDecision> {
  const preset =
    input.preset === "HIGH_CONFIDENCE"
      ? "high_confidence"
      : input.preset === "CUSTOM"
        ? "custom"
        : "standard";
  const payload = asRecord(
    await request("/uploads/prepare", {
      method: "POST",
      body: JSON.stringify({ ...input, preset }),
    }),
  );
  const source = firstRecord(payload, "decision", "result");
  const rawDecision = asString(source.decision ?? source.type ?? source.status).toLowerCase();
  if (rawDecision === "existing_evaluation") {
    const evaluationId = asString(source.evaluationId ?? firstRecord(source, "evaluation").id);
    const credits = firstRecord(source, "credits");
    return {
      decision: "existing_evaluation",
      evaluationId,
      detailUrl: asString(source.detailUrl, `/sermon-evaluation/${evaluationId}`),
      runCreditsRemaining: asNumber(
        source.runCreditsRemaining ?? credits.runCreditsRemaining ?? credits.remaining,
      ),
    };
  }
  if (rawDecision === "reattach_required") {
    const evaluationId = asString(source.evaluationId ?? firstRecord(source, "evaluation").id);
    const uploadCandidate = firstRecord(source, "upload", "authorization");
    const credits = firstRecord(source, "credits");
    return {
      decision: "reattach_required",
      evaluationId,
      detailUrl: asString(source.detailUrl, `/sermon-evaluation/${evaluationId}`),
      runCreditsRemaining: asNumber(
        source.runCreditsRemaining ?? credits.runCreditsRemaining ?? credits.remaining,
      ),
      upload: uploadCandidate.reservationId ? readUploadAuthorization(source) : undefined,
    };
  }
  return { decision: "upload_required", upload: readUploadAuthorization(source) };
}

export async function finalizeSermonUpload(input: {
  reservationId: string;
  fileId: string;
  sha256: string;
}): Promise<FinalizeUploadDecision> {
  const payload = asRecord(
    await request("/uploads/finalize", { method: "POST", body: JSON.stringify(input) }),
  );
  const source = firstRecord(payload, "decision", "result");
  const decision = asString(source.decision ?? source.type).toLowerCase();
  if (decision === "existing_evaluation") {
    const evaluationId = asString(
      source.evaluationId ?? firstRecord(source, "evaluation").id,
    );
    if (!evaluationId) {
      throw new Error(
        "The duplicate evaluation was found, but its identifier was missing.",
      );
    }
    return {
      decision: "existing_evaluation",
      evaluationId,
      detailUrl: asString(
        source.detailUrl,
        `/sermon-evaluation/${evaluationId}`,
      ),
    };
  }
  if (decision === "audio_ready") {
    const reservationId = asString(source.reservationId);
    const audioAssetId = asString(source.audioAssetId);
    if (!reservationId || !audioAssetId) {
      throw new Error(
        "The finalized upload response did not include the canonical audio reservation.",
      );
    }
    return {
      decision: "audio_ready",
      reservationId,
      audioAssetId,
      expiresAt: asNullableString(source.expiresAt) ?? undefined,
    };
  }
  throw new Error("The server returned an unknown upload finalization decision.");
}

export async function createSermonEvaluation(input: {
  reservationId: string;
  title: string;
  preacher: string;
  preachedOn: string;
  preset: SermonPreset;
  requestedRuns?: number;
  durationAdjustmentEnabled: boolean;
}): Promise<{ evaluationId: string; detailUrl: string }> {
  const preset =
    input.preset === "HIGH_CONFIDENCE"
      ? "high_confidence"
      : input.preset === "CUSTOM"
        ? "custom"
        : "standard";
  const payload = asRecord(
    await request("", {
      method: "POST",
      body: JSON.stringify({
        uploadReservationId: input.reservationId,
        title: input.title,
        preacher: input.preacher,
        preachedOn: input.preachedOn,
        preset,
        ...(input.requestedRuns === undefined ? {} : { requestedRuns: input.requestedRuns }),
        durationAdjustmentEnabled: input.durationAdjustmentEnabled,
      }),
    }),
  );
  const source = firstRecord(payload, "evaluation");
  const evaluationId = asString(source.id ?? source.evaluationId);
  return {
    evaluationId,
    detailUrl: asString(payload.detailUrl ?? source.detailUrl, `/sermon-evaluation/${evaluationId}`),
  };
}

export async function cancelSermonEvaluation(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export async function retrySermonEvaluation(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

export async function reevaluateSermon(input: {
  id: string;
  preset: SermonPreset;
  requestedRuns?: number;
}): Promise<{ evaluationId: string; detailUrl: string }> {
  const preset =
    input.preset === "HIGH_CONFIDENCE"
      ? "high_confidence"
      : input.preset === "CUSTOM"
        ? "custom"
        : "standard";
  const payload = asRecord(
    await request(`/${encodeURIComponent(input.id)}/reevaluate`, {
      method: "POST",
      body: JSON.stringify({
        preset,
        ...(input.requestedRuns === undefined ? {} : { requestedRuns: input.requestedRuns }),
      }),
    }),
  );
  const source = firstRecord(payload, "evaluation");
  const evaluationId = asString(source.id ?? source.evaluationId);
  return {
    evaluationId,
    detailUrl: asString(payload.detailUrl ?? source.detailUrl, `/sermon-evaluation/${evaluationId}`),
  };
}

export async function updateSermonDurationPolicy(id: string, enabled: boolean): Promise<void> {
  await request(`/${encodeURIComponent(id)}/duration-policy`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function fetchSermonPlaybackAuthorization(
  id: string,
): Promise<SermonPlaybackAuthorization> {
  const payload = asRecord(
    await request(`/${encodeURIComponent(id)}/audio/playback-token`, { method: "POST" }),
  );
  const source = firstRecord(payload, "playback", "audio");
  return {
    url: asString(source.url ?? source.playbackUrl ?? source.tokenizedUrl),
    expiresAt: asString(source.expiresAt),
  };
}

export async function deleteSermonAudio(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}/audio`, { method: "DELETE" });
}

export async function deleteSermonEvaluation(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function sermonExportUrl(id: string, format: SermonExportFormat, version?: string): string {
  const params = version ? `?version=${encodeURIComponent(version)}` : "";
  return `${API_ROOT}/${encodeURIComponent(id)}/exports/${format}${params}`;
}
