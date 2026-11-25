import prisma from "@/lib/prisma";
import { getChatSpend, type ChatSpendReport } from "./chat-spend";
import { getUsageTotals, type UsageTotals } from "./feature-spend";
import { chicagoTimestamp, featureNames, getPageviews, type Feature, type FeatureWindow } from "./web-analytics";

interface Action { label: string; count: number | null }
export interface FeatureRow {
  key: Feature;
  name: string;
  pageviews: number | null;
  actions: Action[];
  estimatedSpendUsd: number | null;
  costPerCompletionUsd: number | null;
  spendCoverage: string;
}
export interface FeatureReport {
  rows: FeatureRow[];
  chatSpend: ChatSpendReport | null;
  pageviewCoverage: string;
  actionCoverage: string;
}

function getSavedActions({ start, end }: FeatureWindow) {
  return prisma.$queryRaw<{ kind: Feature; total: number }[]>`
    SELECT kind, count(*)::int AS total FROM "AnalyticsAccountAction"
    WHERE "occurredAt" >= (${start}::timestamptz AT TIME ZONE 'UTC')
      AND "occurredAt" < (${end}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY kind
  `;
}

function getCollectionStarts() {
  return prisma.$queryRaw<{ saves: Date | null; reflections: Date | null }[]>`
    SELECT min(finished_at) FILTER (WHERE migration_name = '20261124020000_analytics_account_actions') AS saves,
           min(finished_at) FILTER (WHERE migration_name = '20261124030000_analytics_journal_completions') AS reflections
    FROM "_prisma_migrations" WHERE rolled_back_at IS NULL
  `;
}

function spendFields(key: Feature, usage: UsageTotals | undefined, window: FeatureWindow) {
  const fields = {
    estimatedSpendUsd: null as number | null,
    costPerCompletionUsd: null as number | null,
    spendCoverage: "No AI calls.",
  };
  if (key !== "personal_journal" && key !== "heritage_journal" && key !== "daily_devotional") {
    if (["sermon", "church"].includes(key)) fields.spendCoverage = "Awaiting AI usage instrumentation.";
    return fields;
  }
  if (!usage) return { ...fields, spendCoverage: "Provider usage unavailable." };
  const completionsCovered = `${usage.coveredCompletions}/${usage.completions} completions fully priced.`;
  if (!usage.firstAttempt) return { ...fields, spendCoverage: `No production attempts recorded yet. ${completionsCovered}` };
  const first = `First observed attempt ${chicagoTimestamp(usage.firstAttempt)}.`;
  if (usage.firstAttempt >= window.end) return { ...fields, spendCoverage: `Before observed coverage. ${first} ${completionsCovered}` };

  const partial = window.start < usage.firstAttempt || usage.priced !== usage.attempts || usage.coveredCompletions !== usage.completions;
  const notes = [
    first,
    `${usage.measured}/${usage.attempts} attempts measured, ${usage.priced}/${usage.attempts} priced.`,
    completionsCovered,
  ];
  return {
    // Known portion only when pricing is partial. A period with no observed
    // calls after collection started has zero recorded spend.
    estimatedSpendUsd: usage.attempts || usage.coveredCompletions !== usage.completions ? usage.knownSpend : 0,
    costPerCompletionUsd: usage.costPerCompletion,
    spendCoverage: (partial ? "Partial coverage. " : "") + notes.join(" "),
  };
}

export async function getFeatureReport(window: FeatureWindow): Promise<FeatureReport> {
  const dateRange = { gte: window.start, lt: window.end };
  const [views, usage, chatSpend, saves, since, publications, prayerFamilies, churches, sermons] = await Promise.all([
    getPageviews(window).catch(() => null),
    getUsageTotals(window).catch(() => null),
    getChatSpend(window).catch(() => null),
    getSavedActions(window).catch(() => null),
    getCollectionStarts().catch(() => null),
    prisma.parrotDevotionals.count({ where: { createdAt: dateRange } }).catch(() => null),
    prisma.prayerFamily.count({ where: { createdAt: dateRange } }).catch(() => null),
    prisma.churchEvaluation.count({ where: { createdAt: dateRange } }).catch(() => null),
    prisma.sermonEvaluation.count({ where: { completedAt: dateRange } }).catch(() => null),
  ]);
  const reflectionStart = since?.[0]?.reflections;
  const savedCount = (key: Feature) => saves ? (saves.find((row) => row.kind === key)?.total ?? 0) : null;
  const rows = (Object.keys(featureNames) as Feature[]).map((key): FeatureRow => {
    const recorded = usage?.find((row) => row.feature === key);
    const actions: Action[] = [];
    if (key === "chat") {
      const combined = chatSpend?.byChannel[0];
      return {
        key, name: featureNames[key], pageviews: views ? (views.counts.get(key) ?? 0) : null,
        actions: [{ label: "Completed turns", count: combined?.completions ?? null }],
        estimatedSpendUsd: combined?.estimatedSpendUsd ?? null,
        costPerCompletionUsd: combined?.costPerCompletionUsd ?? null,
        spendCoverage: chatSpend && combined
          ? `${combined.partial ? "Partial coverage. " : ""}${combined.measured}/${combined.attempts} attempts measured, ${combined.priced}/${combined.attempts} priced. ${combined.recordedCompletions}/${combined.completions} completed turns with a successful model receipt. ${chatSpend.coverageNote}`
          : "Chat accounting unavailable.",
      };
    }
    switch (key) {
      case "personal_journal":
      case "heritage_journal":
        actions.push({ label: "Entries saved", count: savedCount(key) }, {
          label: key === "heritage_journal" ? "AI reflections completed (including revisions)" : "AI reflections completed",
          count: recorded && (recorded.completions > 0 || (reflectionStart && reflectionStart < window.end) ||
            (recorded.firstAttempt && recorded.firstAttempt < window.end)) ? recorded.completions : null,
        });
        break;
      case "daily_devotional": actions.push({ label: "Devotionals published", count: publications }); break;
      case "prayer": actions.push({ label: "Prayer families added", count: prayerFamilies }); break;
      case "church": actions.push({ label: "Evaluations saved", count: churches }); break;
      case "sermon":
        actions.push({ label: "Evaluations submitted", count: savedCount(key) }, { label: "Evaluations completed", count: sermons });
        break;
    }
    return {
      key, name: featureNames[key], actions,
      pageviews: views ? (views.counts.get(key) ?? 0) : null,
      ...spendFields(key, recorded, window),
    };
  });
  const reflectionCoverage = reflectionStart
    ? `AI reflections have independent completion receipts since ${chicagoTimestamp(reflectionStart)}. Earlier reflection counts are partial and require a provider completion marker.`
    : "Historical AI reflection counts are partial. The start of independent completion coverage is unavailable.";
  const durableStart = since?.[0]?.saves;
  const durableCoverage = durableStart
    ? `Journal saves and sermon submissions have durable receipts since ${chicagoTimestamp(durableStart)}. Earlier counts include retained records with known accounts.`
    : "The start of durable journal and sermon action coverage is unavailable.";
  const unavailableActions = [saves, publications, prayerFamilies, churches, sermons].some(result => result === null)
    ? " Some action counts are unavailable because their source could not be read."
    : "";
  return {
    rows, chatSpend,
    pageviewCoverage: views?.coverage ?? "Production Web Analytics unavailable.",
    actionCoverage: `Database snapshot queried ${chicagoTimestamp(new Date())}. ${durableCoverage} Publication, prayer, church and sermon completion counts use retained records. ${reflectionCoverage} Journal and devotional cost per completion includes all recorded attempts for the operations that completed in the period.${unavailableActions}`,
  };
}
