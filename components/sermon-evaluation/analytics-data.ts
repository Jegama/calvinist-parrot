import { formatDate } from "./format";
import type { SermonAnalyticsPoint } from "./types";

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
