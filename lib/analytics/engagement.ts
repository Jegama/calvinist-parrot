import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { configuredCoverage } from "./metrics";
import { getChatEngagement } from "./engagement-chat";
import { chicagoTimestamp, type Feature, type FeatureWindow } from "./web-analytics";

export interface FeatureEngagement {
  steps: { label: string; count: number | null; denominator?: number | null; denominatorLabel?: string }[];
  coverage: string;
  external?: { label: string; count: number | null }[];
}

type Step = { key: string; label: string; after?: string };
const journalSteps: Step[] = [
  { key: "saved", label: "Entry saved" },
  { key: "reflection_ready", label: "Reflection ready", after: "saved" },
  { key: "prayer_saved", label: "Suggested prayer saved", after: "reflection_ready" },
];

const stepsByFeature = {
  personal_journal: [...journalSteps, { key: "continued_chat", label: "Continued in chat", after: "reflection_ready" }],
  heritage_journal: journalSteps,
  sermon: [
    { key: "submitted", label: "Sermon submitted" },
    { key: "report_ready", label: "Report ready", after: "submitted" },
    { key: "report_opened", label: "Report opened", after: "report_ready" },
  ],
  prayer: [
    { key: "rotation_shown", label: "Rotation shown" },
    { key: "rotation_confirmed", label: "Rotation confirmed", after: "rotation_shown" },
    { key: "request_answered", label: "Requests marked answered" },
  ],
  daily_devotional: [
    { key: "reading_opened", label: "Reading opened" },
    { key: "reading_engaged", label: "Engaged reading (estimate)", after: "reading_opened" },
  ],
  church: [
    { key: "results_viewed", label: "Results viewed" },
    { key: "detail_opened", label: "Church detail opened", after: "results_viewed" },
  ],
} satisfies Partial<Record<Feature, Step[]>>;

type ReceiptFeature = keyof typeof stepsByFeature;
type Database = Pick<Prisma.TransactionClient, "$queryRaw">;
type Count = { feature: ReceiptFeature; step: string; channel: string; total: number };
const entries = Object.entries(stepsByFeature) as [ReceiptFeature, Step[]][];
const rules = entries.flatMap(([feature, steps]) => steps.map(({ key, after }) => ({
  feature, step: key, parent: after, root: steps.find(s => s.key === after)?.after,
})));

async function receiptCounts(db: Database, window: FeatureWindow) {
  // A child needs its entire ordered chain in the same window, on the same
  // website flow. Sibling outcomes (e.g. journal prayer/chat) are independent.
  return db.$queryRaw<Count[]>`
    WITH observations AS (
      SELECT feature, step, channel, "flowId", "occurredAt" FROM "AnalyticsEngagementEvent"
      WHERE "occurredAt" >= ${window.start} AND "occurredAt" < ${window.end}
    ), rules AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(rules)}::jsonb)
        AS r(feature text, step text, parent text, root text)
    )
    SELECT e.feature, e.step, e.channel, count(*)::int AS total
    FROM observations e JOIN rules USING (feature, step)
    LEFT JOIN observations parent
      ON (parent.feature, parent.step, parent.channel, parent."flowId") = (e.feature, rules.parent, e.channel, e."flowId")
      AND parent."occurredAt" <= e."occurredAt"
    LEFT JOIN observations root
      ON (root.feature, root.step, root.channel, root."flowId") = (e.feature, rules.root, e.channel, e."flowId")
      AND root."occurredAt" <= parent."occurredAt"
    WHERE e.channel = 'web' AND (rules.parent IS NULL OR parent.step IS NOT NULL)
      AND (rules.root IS NULL OR root.step IS NOT NULL)
    GROUP BY e.feature, e.step, e.channel
    UNION ALL
    SELECT feature, step, channel, count(*)::int FROM observations
    WHERE (feature = 'church' AND step = 'record_retrieved' AND channel IN ('public_api','mcp'))
       OR (feature = 'sermon' AND step = 'report_ready' AND channel = 'public_api')
    GROUP BY feature, step, channel
  `;
}

const savedFeatures = new Set<ReceiptFeature>(["personal_journal", "heritage_journal", "sermon"]);

function coverageNote(window: FeatureWindow, start?: Date | null) {
  if (!start) return "Collection start unavailable.";
  const since = `Website flow collection since ${chicagoTimestamp(start)}.`;
  if (window.end <= start) return `Before coverage. ${since}`;
  if (window.start < start) return `Partial observation window. ${since}`;
  return since;
}

export async function getEngagementReport(window: FeatureWindow, db: Database = prisma) {
  const [starts, counts] = await Promise.all([
    db.$queryRaw<{ views: Date | null; saved: Date | null }[]>`
      SELECT min(finished_at) FILTER (WHERE migration_name = '20261125000000_analytics_engagement_events') AS views,
             min(finished_at) FILTER (WHERE migration_name = '20261125010000_engagement_completions') AS saved
      FROM "_prisma_migrations" WHERE rolled_back_at IS NULL
    `.catch(() => null),
    receiptCounts(db, window).catch(() => null),
  ]);
  const viewStart = starts?.[0]?.views;
  const channelStart = configuredCoverage(process.env.ANALYTICS_CHAT_COVERAGE_FROM);
  const chatStart = viewStart && channelStart && channelStart > viewStart ? channelStart : viewStart;
  const eligibleStart = chatStart && chatStart > window.start ? chatStart : window.start;
  const chat = await getChatEngagement(window, db, eligibleStart).catch(() => null);
  const report: Partial<Record<Feature, FeatureEngagement>> = {};
  for (const [feature, steps] of entries) {
    const start = savedFeatures.has(feature) ? starts?.[0]?.saved : viewStart;
    const covered = start && start < window.end;
    function count(step: string, channel = "web") {
      if (!counts || !covered) return null;
      return counts.find(row => row.feature === feature && row.step === step && row.channel === channel)?.total ?? 0;
    }
    const engagement: FeatureEngagement = {
      steps: steps.map(({ key, label, after }) => ({
        label, count: count(key),
        ...(after && { denominator: count(after), denominatorLabel: steps.find(s => s.key === after)?.label }),
      })),
      coverage: coverageNote(window, start),
    };
    if (!counts) engagement.coverage += " Engagement data unavailable.";
    if (feature === "daily_devotional") engagement.coverage += " Engaged reading estimates at least 30 seconds with the devotional visible in the foreground.";
    if (feature === "church") {
      engagement.coverage += " Website detail opens require a selection from results. Each successful versioned API retrieval counts once per operation and church. The legacy shared route has unknown origin. MCP coverage is unconfirmed until its client ships.";
      engagement.external = [
        { label: "Direct API · records retrieved", count: count("record_retrieved", "public_api") },
        { label: "MCP · records retrieved", count: count("record_retrieved", "mcp") || null },
      ];
    }
    if (feature === "sermon") engagement.external = [{ label: "Direct API · reports ready", count: count("report_ready", "public_api") }];
    report[feature] = engagement;
  }

  const observed = chatStart && chatStart < window.end ? chat : null;
  const hasChannelCoverage = Boolean(channelStart && channelStart < window.end);
  const firstMessages = chat && (chat.allStarted > 0 || hasChannelCoverage || observed) ? chat.allStarted : null;
  function answers(channel: "public_api" | "mcp" | "unknown") {
    const total = chat?.[channel];
    if (total === undefined) return null;
    if (total > 0 || (channel !== "mcp" && hasChannelCoverage)) return total;
    return null;
  }
  report.chat = {
    steps: [
      { label: "First genuine message sent", count: firstMessages },
      { label: "Visible reply received", count: observed?.visible ?? null, denominator: observed?.started ?? null, denominatorLabel: "First messages during visibility coverage" },
      { label: "Follow-up sent", count: observed?.followup ?? null, denominator: observed?.visible ?? null, denominatorLabel: "Visible reply received" },
    ],
    coverage: `${coverageNote(window, chatStart)} First messages span the selected period. Reply rates include only conversations started during visibility coverage. Server answers use the original channel. MCP coverage is unconfirmed until its client ships. ${channelStart ? `Chat attribution since ${chicagoTimestamp(channelStart)}.` : "Historical channel coverage is partial."}${chat ? "" : " Chat engagement data unavailable."}`,
    external: [
      { label: "Direct API · answers returned", count: answers("public_api") },
      { label: "MCP · answers returned", count: answers("mcp") },
      { label: "Unknown origin · answers recorded", count: answers("unknown") },
    ],
  };
  return report;
}
