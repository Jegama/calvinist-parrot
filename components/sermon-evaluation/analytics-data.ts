import { SERMON_AGGREGATES } from "@/lib/sermon-evaluation/rubric.generated";
import { formatDate } from "./format";
import type { SermonAnalyticsPoint } from "./types";

const COMPLETED_STATUSES = new Set(["COMPLETE", "COMPLETE_WITH_WARNINGS"]);

const CANONICAL_AGGREGATE_METRICS = SERMON_AGGREGATES.map(
  (aggregate) => aggregate.clientKey,
);

function aggregateMetricKeys(
  evaluations: readonly SermonAnalyticsPoint[],
): string[] {
  const discovered = new Set(
    evaluations.flatMap((evaluation) =>
      Object.keys(evaluation.aggregateScores),
    ),
  );
  const canonical = CANONICAL_AGGREGATE_METRICS.filter((metric) =>
    discovered.delete(metric),
  );
  return [...canonical, ...[...discovered].sort()];
}

export function listAvailableSermonMetrics(
  evaluations: readonly SermonAnalyticsPoint[],
): string[] {
  const metrics = ["overallImpactBase"];
  if (
    evaluations.some(
      (evaluation) => evaluation.overallImpactAdjusted !== null,
    )
  ) {
    metrics.push("overallImpactAdjusted");
  }
  return [...metrics, ...aggregateMetricKeys(evaluations)];
}

export function scoreForSermonMetric(
  point: SermonAnalyticsPoint,
  metric: string,
): number | null {
  if (metric === "overallImpactAdjusted") {
    return point.overallImpactAdjusted;
  }
  if (metric === "overallImpactBase") {
    return point.overallImpactBase;
  }
  return point.aggregateScores[metric] ?? null;
}

export function latestEvaluationPerSermon(
  evaluations: readonly SermonAnalyticsPoint[],
): SermonAnalyticsPoint[] {
  const latestByFingerprint = new Map<string, SermonAnalyticsPoint>();

  for (const evaluation of evaluations) {
    const current = latestByFingerprint.get(evaluation.fingerprintId);
    const parsedEvaluationCreatedAt = Date.parse(evaluation.createdAt);
    const parsedCurrentCreatedAt = current
      ? Date.parse(current.createdAt)
      : Number.NEGATIVE_INFINITY;
    const evaluationCreatedAt = Number.isNaN(parsedEvaluationCreatedAt)
      ? Number.NEGATIVE_INFINITY
      : parsedEvaluationCreatedAt;
    const currentCreatedAt = Number.isNaN(parsedCurrentCreatedAt)
      ? Number.NEGATIVE_INFINITY
      : parsedCurrentCreatedAt;
    if (
      !current ||
      evaluationCreatedAt > currentCreatedAt ||
      (evaluationCreatedAt === currentCreatedAt &&
        evaluation.id > current.id)
    ) {
      latestByFingerprint.set(evaluation.fingerprintId, evaluation);
    }
  }

  return [...latestByFingerprint.values()];
}

export function latestCompletedEvaluationPerSermon(
  evaluations: readonly SermonAnalyticsPoint[],
): SermonAnalyticsPoint[] {
  return latestEvaluationPerSermon(
    evaluations.filter((evaluation) =>
      COMPLETED_STATUSES.has(evaluation.status),
    ),
  );
}

export function buildSermonTrendRows(
  evaluations: SermonAnalyticsPoint[],
  metric: string,
  includedPreachers: readonly string[],
): Array<Record<string, unknown>> {
  const included = new Set(includedPreachers);
  return evaluations.flatMap((evaluation) => {
    if (!included.has(evaluation.preacherId)) {
      return [];
    }
    const score = scoreForSermonMetric(evaluation, metric);
    if (score === null) {
      return [];
    }
    return [
      {
        evaluationId: evaluation.id,
        date: evaluation.preachedOn.slice(0, 10),
        label: formatDate(evaluation.preachedOn),
        title: evaluation.title,
        preacher: evaluation.preacher,
        preacherId: evaluation.preacherId,
        [`score:${evaluation.preacherId}`]: score,
      },
    ];
  });
}

export function buildSermonMetricAverageRows(
  evaluations: readonly SermonAnalyticsPoint[],
): Array<{
  metric: string;
  average: number;
  sermons: number;
}> {
  return aggregateMetricKeys(evaluations)
    .flatMap((metric) => {
      const scores = evaluations.flatMap((evaluation) => {
        const score = evaluation.aggregateScores[metric];
        return score === undefined ? [] : [score];
      });
      if (scores.length === 0) {
        return [];
      }
      return [
        {
          metric,
          average:
            scores.reduce((total, score) => total + score, 0) / scores.length,
          sermons: scores.length,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.average - left.average ||
        left.metric.localeCompare(right.metric),
    );
}
