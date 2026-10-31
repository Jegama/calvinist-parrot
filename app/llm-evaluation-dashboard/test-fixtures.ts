import { METRIC_DEFINITIONS, type EvaluationRun } from "./evaluation-metrics";
import { SCORING_EDITIONS } from "./scoring-editions";

export function fixtureRun(
  model: string,
  judge: string,
  mean: number,
  overrides: Partial<EvaluationRun> = {},
): EvaluationRun {
  return {
    runId: `${model}-${judge}`,
    answersLabel: `${model}-v1_4`,
    provider: "google",
    genModel: model,
    systemPromptLabel: "v1_4",
    judgeModel: judge,
    evalVersion: "v2",
    evaluatedAt: "2026-10-31T00:00:00Z",
    timestampSource: "fixture",
    questionCount: 500,
    errorCount: 0,
    sourceDataset: `${model}.jsonl`,
    sourceResults: `${model}-${judge}.jsonl`,
    scores: Object.fromEntries(
      METRIC_DEFINITIONS.map(({ key }) => [key, { mean, stdev: 0.4 }]),
    ) as EvaluationRun["scores"],
    ...overrides,
  };
}

export function panelRuns(
  model: string,
  means: [number, number, number],
  overrides: Partial<EvaluationRun> = {},
) {
  return SCORING_EDITIONS[0].judges.map((judge, index) =>
    fixtureRun(model, judge.model, means[index], overrides),
  );
}
