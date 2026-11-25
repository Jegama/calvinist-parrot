import prisma from "@/lib/prisma";
import { providerUsageEnvironment } from "@/lib/provider-usage";
import type { ChatChannel } from "@/lib/chat-analytics";
import { chicagoTimestamp, type FeatureWindow } from "./web-analytics";

const channels = ["combined", "web", "public_api", "mcp", "unknown"] as const;
type Channel = ChatChannel | "combined" | "unattributed";

interface Aggregate {
  channel: Channel;
  stage: string | null;
  model: string | null;
  attempts: number;
  measured: number;
  priced: number;
  retryAttempts: number;
  spend: number | null;
  retrySpend: number | null;
  submissions: number;
  firstSubmission: Date | null;
  recordedTurns: number;
  completions: number;
  recordedCompletions: number;
  inputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
}

// Date every linked receipt and reply to its genuine submission. A delayed job
// can update an earlier cohort. Only costs without a submission use attempt time.
function getAggregates({ start, end }: FeatureWindow, environment: string, cutoff: Date | "infinity") {
  return prisma.$queryRaw<Aggregate[]>`
    WITH submissions AS (
      SELECT s.channel, s."operationId", s."occurredAt" AT TIME ZONE 'UTC' AS submitted, r.kind IS NOT NULL AS completed
      FROM "ChatAnalyticsEvent" s
      LEFT JOIN "ChatAnalyticsEvent" r ON r."chatId" = s."chatId"
        AND r."operationId" = s."operationId" AND r.kind = 'reply'
        AND r."occurredAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
      WHERE s.kind = 'submission' AND s."occurredAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND s."occurredAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
    ), ledger AS (
      SELECT true AS linked, s.channel, s."operationId" AS turn, s.submitted, s.completed, a AS receipt
      FROM submissions s LEFT JOIN analytics_priced_provider_attempt a ON a."operationId" = s."operationId"
        AND a.environment = ${environment} AND a.feature = 'chat' AND a."startedAt" < ${cutoff}::timestamptz
      UNION ALL
      SELECT false, 'unattributed', NULL, NULL, false, a
      FROM analytics_priced_provider_attempt a
      WHERE a.environment = ${environment} AND a.feature = 'chat' AND a."startedAt" >= ${start} AND a."startedAt" < ${end}
        AND NOT EXISTS (SELECT 1 FROM "ChatAnalyticsEvent" s WHERE s.kind = 'submission' AND s."operationId" = a."operationId"
                        AND s."occurredAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC'))
    ), attempts AS (
      SELECT linked, channel, turn, submitted, completed, (receipt).*,
             coalesce((receipt)."returnedModel", (receipt)."requestedModel") AS model
      FROM ledger
    )
    SELECT CASE WHEN NOT linked THEN 'unattributed' WHEN grouping(channel) = 1 THEN 'combined' ELSE channel END AS channel,
      stage, model, count("attemptId")::int AS attempts,
      count(*) FILTER (WHERE "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL)::int AS measured,
      count(usd)::int AS priced, sum(usd)::float8 AS spend,
      count(*) FILTER (WHERE "isRetry")::int AS "retryAttempts", (sum(usd) FILTER (WHERE "isRetry"))::float8 AS "retrySpend",
      count(DISTINCT turn)::int AS submissions, min(submitted) AS "firstSubmission",
      count(DISTINCT turn) FILTER (WHERE "attemptId" IS NOT NULL)::int AS "recordedTurns",
      count(DISTINCT turn) FILTER (WHERE completed)::int AS completions,
      count(DISTINCT turn) FILTER (WHERE completed AND stage = 'agent' AND outcome = 'success')::int AS "recordedCompletions",
      sum("inputTokens")::float8 AS "inputTokens", sum("cacheReadTokens")::float8 AS "cacheReadTokens",
      sum("cacheWriteTokens")::float8 AS "cacheWriteTokens", sum("outputTokens")::float8 AS "outputTokens"
    FROM attempts
    GROUP BY GROUPING SETS ((linked), (linked, channel), (linked, stage, model))
    HAVING (linked OR grouping(channel) = 1) AND (grouping(stage) = 1 OR stage IS NOT NULL)
    ORDER BY channel, stage, model
  `;
}

export async function getChatSpend(window: FeatureWindow) {
  const environment = providerUsageEnvironment();
  // Fixed windows follow the submission even if work happens after the period.
  // All time is a point-in-time snapshot shared with the activity metrics.
  const cutoff = window.days === "all" ? window.end : "infinity";
  const [aggregates, [coverage]] = await Promise.all([
    getAggregates(window, environment, cutoff),
    prisma.$queryRaw<{ migrated: Date | null; first: Date | null }[]>`
      SELECT (SELECT min(finished_at) FROM "_prisma_migrations"
              WHERE migration_name = '20261125000000_chat_provider_usage' AND rolled_back_at IS NULL) AS migrated,
             (SELECT min("startedAt") FROM "ProviderCallAttempt" WHERE environment = ${environment} AND feature = 'chat'
              AND "startedAt" < ${cutoff}::timestamptz) AS first
    `,
  ]);
  const observed = (coverage.first && coverage.first < window.end) || aggregates.some(row => row.attempts > 0);
  const fullPeriod = Boolean(coverage.migrated && coverage.migrated <= window.start && observed);
  const coverageNote = coverage.first
    ? `First ${environment} chat attempt observed ${chicagoTimestamp(coverage.first)}.`
    : `No ${environment} chat attempts observed yet.`;

  function summary(channel: Channel) {
    const row = aggregates.find(item => item.channel === channel && item.stage === null);
    const completions = row?.completions ?? 0;
    const attempts = row?.attempts ?? 0;
    const priced = row?.priced ?? 0;
    const measured = row?.measured ?? 0;
    const recordedCompletions = row?.recordedCompletions ?? 0;
    const missingReceipts = (row?.submissions ?? 0) !== (row?.recordedTurns ?? 0) || recordedCompletions !== completions;
    const emptySpend = fullPeriod && !missingReceipts ? 0 : null;
    const estimatedSpendUsd = row && attempts ? row.spend : emptySpend;
    const collectionCoversTurns = fullPeriod || Boolean(coverage.migrated && row?.firstSubmission && coverage.migrated <= row.firstSubmission);
    const complete = collectionCoversTurns && !missingReceipts && measured === attempts && priced === attempts;
    return {
      channel, completions, measured, priced, attempts, estimatedSpendUsd, recordedCompletions,
      submissions: row?.submissions ?? 0, recordedTurns: row?.recordedTurns ?? 0,
      retrySpendUsd: row?.retryAttempts ? row.retrySpend : (attempts ? 0 : emptySpend),
      costPerCompletionUsd: complete && completions && estimatedSpendUsd !== null ? estimatedSpendUsd / completions : null,
      partial: !complete,
    };
  }
  const byChannel = channels.map(summary);
  const stages = aggregates.flatMap(row => row.stage && row.model ? [{
    unattributed: row.channel === "unattributed", stage: row.stage, model: row.model, attempts: row.attempts,
    priced: row.priced, inputTokens: row.inputTokens, cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens, outputTokens: row.outputTokens, estimatedSpendUsd: row.spend,
  }] : []);
  return { byChannel, unattributed: summary("unattributed"), stages, coverageNote };
}

export type ChatSpendReport = Awaited<ReturnType<typeof getChatSpend>>;
