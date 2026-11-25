import { Prisma } from "@prisma/client";
import type { FeatureWindow } from "./web-analytics";

type ChatEngagement = {
  allStarted: number;
  started: number;
  visible: number;
  followup: number;
  public_api: number;
  mcp: number;
  unknown: number;
};

export async function getChatEngagement(
  window: FeatureWindow,
  database?: Pick<Prisma.TransactionClient, "$queryRaw">,
  websiteStart: Date = window.start,
): Promise<ChatEngagement> {
  const db = database ?? (await import("@/lib/prisma")).default;
  // Chat receipts use UTC wall time, while browser receipts store timestamptz.
  const start = Prisma.sql`(${window.start.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const eligibleStart = Prisma.sql`(${websiteStart.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const end = Prisma.sql`(${window.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const [counts] = await db.$queryRaw<ChatEngagement[]>`
    WITH starts AS (
      SELECT s."chatId", s."operationId", s."occurredAt" FROM "ChatAnalyticsEvent" s
      WHERE s.channel = 'web' AND s.kind = 'submission' AND s."occurredAt" >= ${start} AND s."occurredAt" < ${end}
        AND NOT EXISTS (
          SELECT 1 FROM "ChatAnalyticsEvent" prior
          WHERE prior."chatId" = s."chatId" AND prior.kind = 'submission'
            AND (prior."occurredAt", prior."operationId") < (s."occurredAt", s."operationId")
        )
    ), website AS (
      SELECT count(*)::int AS "allStarted", count(*) FILTER (WHERE s."occurredAt" >= ${eligibleStart})::int AS started, count(v."flowId")::int AS visible,
        count(*) FILTER (WHERE v."flowId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "ChatAnalyticsEvent" f WHERE f."chatId" = s."chatId"
            AND f.kind = 'submission' AND f.channel = 'web' AND f."operationId" <> s."operationId"
            AND f."occurredAt" >= (v."occurredAt" AT TIME ZONE 'UTC') AND f."occurredAt" < ${end}
        ))::int AS followup
      FROM starts s LEFT JOIN "AnalyticsEngagementEvent" v
        ON s."occurredAt" >= ${eligibleStart} AND v.feature = 'chat' AND v.step = 'reply_visible' AND v.channel = 'web' AND v."flowId" = s."operationId"
        AND v."occurredAt" >= (s."occurredAt" AT TIME ZONE 'UTC') AND v."occurredAt" < ${window.end.toISOString()}::timestamptz
    ), external AS (
      SELECT count(*) FILTER (WHERE channel = 'public_api')::int AS public_api,
        count(*) FILTER (WHERE channel = 'mcp')::int AS mcp,
        count(*) FILTER (WHERE channel = 'unknown')::int AS unknown
      FROM "ChatAnalyticsEvent" WHERE kind = 'reply' AND "occurredAt" >= ${start} AND "occurredAt" < ${end}
    )
    SELECT website.*, external.* FROM website CROSS JOIN external`;
  return counts;
}
