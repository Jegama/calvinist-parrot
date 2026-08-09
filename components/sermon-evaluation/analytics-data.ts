import { SERMON_AGGREGATES } from "@/lib/sermon-evaluation/rubric.generated";
import { formatDate } from "./format";
import type { SermonAnalyticsPoint } from "./types";

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

export function buildSermonTrendRows(
  evaluations: SermonAnalyticsPoint[],
  metric: string,
  includedPreachers: readonly string[],
): Array<Record<string, unknown>> {
  const included = new Set(includedPreachers);
  return evaluations.flatMap((evaluation) => {
    if (!included.has(evaluation.preacher)) {
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
        [`score:${evaluation.preacher}`]: score,
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
