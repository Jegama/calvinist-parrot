import prisma from "@/lib/prisma";
import type { UsageContext } from "@/lib/provider-usage";
import type { FeatureWindow } from "./web-analytics";

export interface UsageTotals {
  feature: UsageContext["feature"];
  firstAttempt: Date | null;
  attempts: number;
  measured: number;
  priced: number;
  knownSpend: number | null;
  completions: number;
  coveredCompletions: number;
  costPerCompletion: number | null;
}

// Spend uses attempt time. The completion cohort includes the entire recorded
// cost of each operation completed in the window, even retries on earlier days.
export function getUsageTotals({ start, end }: FeatureWindow) {
  return prisma.$queryRaw<UsageTotals[]>`
    WITH features(feature, stages) AS (
      VALUES ('personal_journal', ARRAY['call1a', 'call1b', 'call1c', 'call2']),
             ('heritage_journal', ARRAY['call1', 'call2']),
             ('daily_devotional', ARRAY['generation'])
    ), period AS (
      SELECT feature, count(*)::int AS attempts, count(usd)::int AS priced,
             count(*) FILTER (WHERE "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL)::int AS measured,
             sum(usd)::float8 AS spend
      FROM analytics_priced_provider_attempt
      WHERE environment = 'production' AND "startedAt" >= ${start} AND "startedAt" < ${end}
      GROUP BY feature
    ), journal_candidates AS (
      SELECT feature, "operationId" FROM "AnalyticsJournalCompletion"
      WHERE "completedAt" >= ${start} AND "completedAt" < ${end}
      UNION
      -- Historical completions from #96, deduplicated with durable receipts.
      SELECT feature, "operationId" FROM "ProviderCallAttempt"
      WHERE environment = 'production' AND feature IN ('personal_journal', 'heritage_journal')
        AND "completedAt" >= ${start} AND "completedAt" < ${end}
    ), completed AS (
      -- New receipts and delayed provider markers can straddle a period
      -- boundary. Count the operation only in its earliest completion period.
      SELECT c.feature, c."operationId" FROM journal_candidates c
      WHERE NOT EXISTS (
        SELECT 1 FROM "AnalyticsJournalCompletion" earlier
        WHERE earlier.feature = c.feature AND earlier."operationId" = c."operationId" AND earlier."completedAt" < ${start}
      ) AND NOT EXISTS (
        SELECT 1 FROM "ProviderCallAttempt" earlier
        WHERE earlier.environment = 'production' AND earlier.feature = c.feature
          AND earlier."operationId" = c."operationId" AND earlier."completedAt" < ${start}
      )
      UNION ALL
      -- Publications exist independently of receipts, including cache hits
      -- and publications for which logging failed.
      SELECT 'daily_devotional', encode(sha256(convert_to(devotional_id, 'UTF8')), 'hex')
      FROM "parrotDevotionals"
      WHERE "createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
        AND "createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
    ), operation_cost AS (
      SELECT c.feature, c."operationId",
             CASE WHEN count(a.usd) = count(a."attemptId")
                    AND array_agg(a.stage) FILTER (WHERE a.outcome = 'success') @> f.stages
                  THEN sum(a.usd) END AS cost
      FROM completed c JOIN features f ON f.feature = c.feature
      LEFT JOIN analytics_priced_provider_attempt a ON a.feature = c.feature
        AND a."operationId" = c."operationId" AND a.environment = 'production' AND a."startedAt" < ${end}
      GROUP BY c.feature, c."operationId", f.stages
    ), cohort AS (
      SELECT feature, count(*)::int AS completions, count(cost)::int AS covered,
             CASE WHEN count(cost) = count(*) THEN avg(cost)::float8 END AS average
      FROM operation_cost GROUP BY feature
    )
    SELECT f.feature, first_receipt."startedAt" AS "firstAttempt",
           coalesce(p.attempts, 0) AS attempts, coalesce(p.measured, 0) AS measured,
           coalesce(p.priced, 0) AS priced, p.spend AS "knownSpend",
           coalesce(c.completions, 0) AS completions, coalesce(c.covered, 0) AS "coveredCompletions",
           c.average AS "costPerCompletion"
    FROM features f LEFT JOIN period p USING (feature) LEFT JOIN cohort c USING (feature)
    LEFT JOIN LATERAL (
      SELECT min("startedAt") AS "startedAt" FROM "ProviderCallAttempt"
      WHERE environment = 'production' AND feature = f.feature
    ) first_receipt ON true
  `;
}
