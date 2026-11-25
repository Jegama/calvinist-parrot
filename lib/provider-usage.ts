import { randomUUID } from "node:crypto";
import type { ChatChannel } from "./chat-analytics";
import type { ModelSpec } from "./parrot-ai";

export interface UsageContext {
  feature: "chat" | "personal_journal" | "heritage_journal" | "daily_devotional" | "church" | "sermon";
  channel?: ChatChannel;
  stage: string;
  operationId: string;
  isRetry?: boolean;
}

type Outcome = "started" | "received" | "success" | "invalid_output" | "provider_error";

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function tokens(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function normalizeUsage(provider: ModelSpec["provider"], usage: unknown) {
  const raw = object(usage);
  if (provider === "gemini") {
    const promptTokens = tokens(raw.promptTokenCount);
    const cacheReadTokens = tokens(raw.cachedContentTokenCount);
    const candidateTokens = tokens(raw.candidatesTokenCount);
    const thinkingTokens = tokens(raw.thoughtsTokenCount);
    const toolUsePromptTokens = tokens(raw.toolUsePromptTokenCount);
    const providerTotalTokens = tokens(raw.totalTokenCount);
    const generated = candidateTokens === null ? null : candidateTokens + (thinkingTokens ?? 0);
    // A discrepancy can indicate an unreported billable component. Preserve
    // the raw buckets but withhold the estimate when they do not reconcile.
    const mismatch = generated !== null && promptTokens !== null && providerTotalTokens !== null &&
      promptTokens + (toolUsePromptTokens ?? 0) + generated !== providerTotalTokens;
    return {
      promptTokens, candidateTokens, cacheReadTokens, thinkingTokens,
      inputTokens: promptTokens !== null && promptTokens >= (cacheReadTokens ?? 0)
        ? promptTokens - (cacheReadTokens ?? 0) : null,
      outputTokens: mismatch ? null : generated,
      toolUsePromptTokens, providerTotalTokens,
      serviceTier: typeof raw.serviceTier === "string" ? raw.serviceTier
        : typeof raw.trafficType === "string" ? raw.trafficType : null,
    };
  }
  if (provider === "anthropic") {
    const cache = object(raw.cache_creation);
    return {
      inputTokens: tokens(raw.input_tokens),
      // Claude includes thinking tokens in output_tokens.
      outputTokens: tokens(raw.output_tokens),
      thinkingTokens: tokens(object(raw.output_tokens_details).thinking_tokens),
      cacheReadTokens: tokens(raw.cache_read_input_tokens),
      cacheWriteTokens: tokens(raw.cache_creation_input_tokens),
      cacheWrite5mTokens: tokens(cache.ephemeral_5m_input_tokens),
      cacheWrite1hTokens: tokens(cache.ephemeral_1h_input_tokens),
      serviceTier: typeof raw.service_tier === "string" ? raw.service_tier : null,
    };
  }
  const promptTokens = tokens(raw.input_tokens ?? raw.prompt_tokens);
  const inputDetails = object(raw.input_tokens_details ?? raw.prompt_tokens_details);
  const cacheWrites = object(inputDetails.cache_write_tokens_details);
  const cacheReadTokens = tokens(inputDetails.cached_tokens);
  const cacheWriteTokens = tokens(inputDetails.cache_write_tokens);
  const cached = (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0);
  return {
    promptTokens, cacheReadTokens, cacheWriteTokens,
    cacheWrite30mTokens: tokens(cacheWrites.ttl_30m_tokens),
    cacheWrite12hTokens: tokens(cacheWrites.ttl_12h_tokens),
    inputTokens: promptTokens !== null && promptTokens >= cached ? promptTokens - cached : null,
    outputTokens: tokens(raw.output_tokens ?? raw.completion_tokens),
    thinkingTokens: tokens(object(raw.output_tokens_details ?? raw.completion_tokens_details).reasoning_tokens),
    providerTotalTokens: tokens(raw.total_tokens),
    serviceTier: typeof raw.service_tier === "string" ? raw.service_tier : null,
  };
}

export function providerUsageEnvironment() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function startAttempt({ feature, stage, operationId, channel, isRetry }: UsageContext) {
  return {
    attemptId: randomUUID(), feature, stage, operationId, channel: channel ?? "unknown", isRetry: isRetry ?? false,
    startedAt: new Date(), environment: providerUsageEnvironment(),
  };
}

export function startUsageAttempt(context: UsageContext, spec: ModelSpec) {
  return {
    ...startAttempt(context), provider: spec.provider, requestedModel: spec.model,
    modality: "text",
  };
}

export function startExternalUsageAttempt(context: UsageContext, provider: "tavily" | "geoapify", billingUnit: "credit") {
  return { ...startAttempt(context), provider, billingUnit };
}

export function recordExternalUsageAttempt(
  attempt: ReturnType<typeof startExternalUsageAttempt>,
  outcome: Outcome,
  durationMs: number,
  quantity: number | null,
) {
  return persistAttempt(attempt, {
    outcome, durationMs,
    quantity: quantity !== null && Number.isFinite(quantity) && quantity >= 0 ? quantity : null,
  });
}

export type UsageAttempt = ReturnType<typeof startUsageAttempt>;

export async function recordUsageAttempt(
  attempt: UsageAttempt,
  outcome: Outcome,
  durationMs: number,
  returnedModel?: string,
  usage?: unknown,
) {
  // Whitelist billing counters, never persist a provider response or error object.
  await persistAttempt(attempt, {
    outcome, durationMs, returnedModel,
    ...normalizeUsage(attempt.provider, usage),
  });
}

async function persistAttempt<T extends { outcome: Outcome; durationMs: number }>(
  attempt: UsageAttempt | ReturnType<typeof startExternalUsageAttempt>,
  receipt: T,
) {
  try {
    const { default: prisma } = await import("./prisma");
    const where = { attemptId: attempt.attemptId };
    const create = { ...attempt, ...receipt };
    // A replayed initial receipt must never replace already-settled usage.
    // Church and chat calls write a marker before dispatch, so a killed process leaves
    // an observable attempt even when the provider never returns counters.
    if ((attempt.feature === "church" || attempt.feature === "chat") && receipt.outcome === "received") {
      await prisma.$transaction([
        prisma.providerCallAttempt.createMany({ data: [create], skipDuplicates: true }),
        prisma.providerCallAttempt.updateMany({ where: { ...where, outcome: "started" }, data: receipt }),
      ]);
      return;
    }
    await prisma.providerCallAttempt.upsert({
      where, create,
      update: receipt.outcome === "received" || receipt.outcome === "started" ? {} : receipt,
    });
  } catch {
    console.warn("Provider usage write failed", attempt.attemptId, receipt.outcome);
    if (attempt.feature === "church" && receipt.outcome === "started") {
      throw new Error("Could not record Church Finder request before dispatch.");
    }
  }
}

export async function markUsageOperationComplete(feature: UsageContext["feature"], operationId: string) {
  try {
    const { default: prisma } = await import("./prisma");
    await prisma.providerCallAttempt.updateMany({
      where: { feature, operationId, environment: providerUsageEnvironment(), completedAt: null },
      data: { completedAt: new Date() },
    });
  } catch {
    console.warn("Provider usage completion write failed", feature, operationId);
  }
}
