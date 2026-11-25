import { Prisma } from "@prisma/client";
import type { ChatChannel } from "@/lib/chat-analytics";
import prisma from "@/lib/prisma";
import type { UsageTotals } from "./feature-spend";
import type { FeatureWindow } from "./web-analytics";

export type EvaluationFeature = "church" | "sermon";

export interface EvaluationUsage extends UsageTotals {
  feature: EvaluationFeature;
  channel: ChatChannel | "combined";
  collectionStart: Date | null;
  modelSpend: number | null;
  externalFees: number | null;
}

export interface EvaluationStage {
  feature: EvaluationFeature;
  stage: string;
  preset: string | null;
  provider: string;
  service: string;
  modality: string | null;
  billingUnit: string | null;
  quantity: number | null;
  attempts: number;
  measured: number;
  priced: number;
  spend: number | null;
}

const measuredAttempt = Prisma.sql`CASE WHEN "billingUnit" IS NOT NULL THEN quantity IS NOT NULL
  ELSE "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL END`;

export function getEvaluationStages({ start, end }: FeatureWindow, environment: string) {
  return prisma.$queryRaw<EvaluationStage[]>`
    SELECT feature, stage, preset, provider, coalesce("returnedModel", "requestedModel", provider) AS service,
      modality, "billingUnit", sum(quantity)::float8 AS quantity, count(*)::int AS attempts,
      count(*) FILTER (WHERE ${measuredAttempt})::int AS measured, count(usd)::int AS priced,
      sum(usd)::float8 AS spend
    FROM analytics_evaluation_attempt
    WHERE environment = ${environment}
      AND "startedAt" >= ${start} AND "startedAt" < ${end}
    GROUP BY feature, stage, preset, provider, service, modality, "billingUnit"
    ORDER BY feature, preset, stage, provider, service, modality, "billingUnit"
  `;
}

export function getEvaluationUsage({ start, end, days }: FeatureWindow, environment: string) {
  const cutoff = days === "all" ? end : "infinity";
  return prisma.$queryRaw<EvaluationUsage[]>`
    WITH features(feature) AS (VALUES ('church'), ('sermon')),
    channels(channel) AS (VALUES ('combined'), ('web'), ('public_api'), ('mcp'), ('unknown')),
    period AS (
      -- Every receipt in the window contributes, including work that never finished.
      SELECT feature, CASE WHEN grouping(channel) = 1 THEN 'combined' ELSE coalesce(channel, 'unknown') END AS channel, count(*)::int AS attempts,
        count(*) FILTER (WHERE ${measuredAttempt})::int AS measured, count(usd)::int AS priced,
        sum(usd)::float8 AS spend,
        count(*) FILTER (WHERE "billingUnit" IS NULL) AS model_attempts,
        sum(usd) FILTER (WHERE "billingUnit" IS NULL)::float8 AS models,
        count(*) FILTER (WHERE "billingUnit" IS NOT NULL) AS fee_attempts,
        sum(usd) FILTER (WHERE "billingUnit" IS NOT NULL)::float8 AS fees
      FROM analytics_evaluation_attempt
      WHERE environment = ${environment}
        AND "startedAt" >= ${start} AND "startedAt" < ${end}
      GROUP BY GROUPING SETS ((feature, channel), (feature))
    ), completed AS (
      SELECT 'church' AS feature, id, channel, "expectedUsageAttempts", 0 AS runs FROM "churchEvaluation"
      WHERE ("usageEnvironment" = ${environment} OR ("usageEnvironment" IS NULL AND ${environment}::text = 'production'))
        AND "createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC') AND "createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
      UNION ALL
      SELECT 'sermon', id, channel, "expectedUsageAttempts", "completedRuns" FROM "sermonEvaluation"
      WHERE ("usageEnvironment" = ${environment} OR ("usageEnvironment" IS NULL AND ${environment}::text = 'production'))
        AND status IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS')
        AND "completedAt" >= (${start}::timestamptz AT TIME ZONE 'UTC') AND "completedAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
    ), operation_cost AS (
      -- The completion denominator is independent of receipts. Reused worker checkpoints
      -- keep their original operation ID. Include all recorded work for each completion,
      -- including scheduled church geocoding that ran after the reporting window.
      SELECT c.feature, c.channel, c.id, CASE WHEN c."expectedUsageAttempts" > 0
        AND count(a."attemptId") = c."expectedUsageAttempts" AND count(a.usd) = c."expectedUsageAttempts"
        AND (c.feature = 'church' OR (c.runs > 0
          AND array_agg(a.stage) FILTER (WHERE a.outcome = 'success') @> ARRAY['extraction', 'summary']
          AND count(*) FILTER (WHERE a.stage = 'scoring' AND a.outcome = 'success') >= c.runs
          AND (c.runs = 1 OR bool_or(a.stage = 'harmonization'))))
        THEN sum(a.usd) END AS cost
      FROM completed c LEFT JOIN analytics_evaluation_attempt a ON a.feature = c.feature
        AND a."operationId" = c.id AND a.environment = ${environment} AND a."startedAt" < ${cutoff}::timestamptz
      GROUP BY c.feature, c.channel, c.id, c.runs, c."expectedUsageAttempts"
    ), cohort AS (
      SELECT feature, CASE WHEN grouping(channel) = 1 THEN 'combined' ELSE coalesce(channel, 'unknown') END AS channel, count(*)::int AS completions,
        count(cost)::int AS covered, CASE WHEN count(cost) = count(*) THEN avg(cost)::float8 END AS average
      FROM operation_cost GROUP BY GROUPING SETS ((feature, channel), (feature))
    )
    SELECT f.feature, ch.channel, rollout."collectionStart", first_receipt."firstAttempt",
      coalesce(p.attempts, 0) AS attempts, coalesce(p.measured, 0) AS measured, coalesce(p.priced, 0) AS priced,
      p.spend AS "knownSpend",
      CASE WHEN p.model_attempts = 0 AND coalesce(c.covered, 0) = coalesce(c.completions, 0) THEN 0 ELSE p.models END AS "modelSpend",
      CASE WHEN p.fee_attempts = 0 AND coalesce(c.covered, 0) = coalesce(c.completions, 0) THEN 0 ELSE p.fees END AS "externalFees",
      coalesce(c.completions, 0) AS completions, coalesce(c.covered, 0) AS "coveredCompletions", c.average AS "costPerCompletion"
    FROM features f CROSS JOIN channels ch
    LEFT JOIN period p ON p.feature = f.feature AND p.channel = ch.channel
    LEFT JOIN cohort c ON c.feature = f.feature AND c.channel = ch.channel
    CROSS JOIN (
      SELECT min(finished_at) AS "collectionStart" FROM "_prisma_migrations"
      WHERE migration_name = '20261125010000_evaluation_costs' AND rolled_back_at IS NULL
    ) rollout
    LEFT JOIN LATERAL (
      SELECT min("startedAt") AS "firstAttempt" FROM analytics_evaluation_attempt WHERE feature = f.feature AND environment = ${environment} AND "startedAt" < ${cutoff}::timestamptz
    ) first_receipt ON true
    ORDER BY f.feature, CASE ch.channel WHEN 'combined' THEN 0 WHEN 'web' THEN 1 WHEN 'public_api' THEN 2 WHEN 'mcp' THEN 3 ELSE 4 END
  `;
}
