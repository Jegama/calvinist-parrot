import prisma from "@/lib/prisma";
import { getEvaluationStages, getEvaluationUsage, type EvaluationStage, type EvaluationUsage } from "./evaluation-spend";
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
interface EvaluationChannel extends Pick<FeatureRow, "estimatedSpendUsd" | "costPerCompletionUsd" | "spendCoverage"> {
  channel: EvaluationUsage["channel"];
  feature: EvaluationUsage["feature"];
  completions: number;
  modelSpend: number | null;
  externalFees: number | null;
}
export interface FeatureReport {
  evaluationChannels: EvaluationChannel[] | null;
  evaluationStages: EvaluationStage[] | null;
  rows: FeatureRow[];
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

function spendFields(key: Feature, usage: UsageTotals | undefined, window: FeatureWindow, collectionStart?: Date | null) {
  const fields = {
    estimatedSpendUsd: null as number | null,
    costPerCompletionUsd: null as number | null,
    spendCoverage: "No AI calls.",
  };
  if (!["personal_journal", "heritage_journal", "daily_devotional", "church", "sermon"].includes(key)) {
    if (key === "chat") fields.spendCoverage = "Awaiting AI usage instrumentation.";
    return fields;
  }
  if (!usage) return { ...fields, spendCoverage: "Provider usage unavailable." };
  const completionsCovered = `${usage.coveredCompletions}/${usage.completions} completions fully priced.`;
  const coverageStart = collectionStart ?? usage.firstAttempt;
  if (!coverageStart) return { ...fields, spendCoverage: `No production attempts recorded yet. ${completionsCovered}` };
  const first = `${collectionStart ? "Collection started" : "First observed attempt"} ${chicagoTimestamp(coverageStart)}.`;
  if (coverageStart >= window.end) return { ...fields, spendCoverage: `Before observed coverage. ${first} ${completionsCovered}` };

  const partial = window.start < coverageStart || usage.priced !== usage.attempts || usage.coveredCompletions !== usage.completions;
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
  const productionEvaluations = { OR: [{ usageEnvironment: "production" }, { usageEnvironment: null }] };
  const dateRange = { gte: window.start, lt: window.end };
  const [views, usage, saves, since, publications, prayerFamilies, churches, sermons, evaluationUsage, evaluationStages] = await Promise.all([
    getPageviews(window).catch(() => null),
    getUsageTotals(window).catch(() => null),
    getSavedActions(window).catch(() => null),
    getCollectionStarts().catch(() => null),
    prisma.parrotDevotionals.count({ where: { createdAt: dateRange } }).catch(() => null),
    prisma.prayerFamily.count({ where: { createdAt: dateRange } }).catch(() => null),
    prisma.churchEvaluation.count({ where: { ...productionEvaluations, createdAt: dateRange } }).catch(() => null),
    prisma.sermonEvaluation.count({ where: { ...productionEvaluations, completedAt: dateRange, status: { in: ["COMPLETE", "COMPLETE_WITH_WARNINGS"] } } }).catch(() => null),
    getEvaluationUsage(window).catch(() => null),
    getEvaluationStages(window).catch(() => null),
  ]);
  const reflectionStart = since?.[0]?.reflections;
  const savedCount = (key: Feature) => saves ? (saves.find((row) => row.kind === key)?.total ?? 0) : null;
  const evaluationChannels = evaluationUsage?.map((row): EvaluationChannel => {
    const totals = spendFields(row.feature, row, window, row.collectionStart);
    const zero = row.attempts === 0 && totals.estimatedSpendUsd === 0 ? 0 : null;
    return {
      feature: row.feature, channel: row.channel, completions: row.completions,
      modelSpend: row.modelSpend ?? zero, externalFees: row.externalFees ?? zero, ...totals,
    };
  }) ?? null;
  const rows = (Object.keys(featureNames) as Feature[]).map((key): FeatureRow => {
    const evaluation = evaluationUsage?.find(row => row.channel === "combined" && row.feature === key);
    const recorded = evaluation ?? usage?.find(row => row.feature === key);
    const actions: Action[] = [];
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
      case "church": actions.push({ label: "Evaluations saved", count: evaluation?.completions ?? churches }); break;
      case "sermon":
        actions.push({ label: "Evaluations submitted", count: savedCount(key) }, { label: "Evaluations completed", count: evaluation?.completions ?? sermons });
        break;
    }
    return {
      key, name: featureNames[key], actions,
      pageviews: views ? (views.counts.get(key) ?? 0) : null,
      ...spendFields(key, recorded, window, evaluation?.collectionStart),
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
    rows, evaluationChannels, evaluationStages,
    pageviewCoverage: views?.coverage ?? "Production Web Analytics unavailable.",
    actionCoverage: `Database snapshot queried ${chicagoTimestamp(new Date())}. ${durableCoverage} Publication, prayer, church and sermon completion counts use retained records. ${reflectionCoverage} Cost per completion includes all recorded attempts for the operations that completed in the period.${unavailableActions}`,
  };
}
