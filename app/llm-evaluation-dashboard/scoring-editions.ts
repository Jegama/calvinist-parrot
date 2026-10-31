import {
  METRIC_DEFINITIONS,
  type EvaluationRun,
  type MetricKey,
} from "./evaluation-metrics";

export interface ScoringEdition {
  id: string;
  label: string;
  status: "provisional" | "historical";
  description: string;
  evalVersion: string;
  benchmark: string;
  expectedQuestionCount: number;
  judges: readonly { model: string; weight: number }[];
}

// An edition fixes the scoring method, not the roster of answer models. New
// complete answer sets can join it; changing judges/weights/rubric needs a new ID.
export const SCORING_EDITIONS: readonly ScoringEdition[] = [
  {
    id: "three-family-2026-10",
    label: "Three-family panel · October 2026",
    status: "provisional",
    description:
      "Equal weight for GPT-6 Luna, Gemini 3.8 Flash, and Claude Haiku 5.5. Human calibration is still needed.",
    evalVersion: "v2",
    benchmark: "English 500-question benchmark",
    expectedQuestionCount: 500,
    judges: [
      { model: "gpt-6-luna", weight: 1 },
      { model: "gemini-3.8-flash", weight: 1 },
      { model: "claude-haiku-5-5", weight: 1 },
    ],
  },
  {
    id: "four-judge-2026-10",
    label: "Four-judge panel · Earlier proposal",
    status: "historical",
    description:
      "The earlier provisional panel: two OpenAI judges and two Google judges, with equal weight. Retained for comparison, not human-validated.",
    evalVersion: "v2",
    benchmark: "English 500-question benchmark",
    expectedQuestionCount: 500,
    judges: [
      { model: "gpt-5.6-luna", weight: 1 },
      { model: "gpt-6-luna", weight: 1 },
      { model: "gemini-3.7-flash", weight: 1 },
      { model: "gemini-3.8-flash", weight: 1 },
    ],
  },
  {
    id: "gpt-5-mini-v2",
    label: "GPT-5 Mini · Historical scoring",
    status: "historical",
    description:
      "The original dashboard's single-judge scoring, including recorded partial runs and historical prompt comparisons.",
    evalVersion: "v2",
    benchmark: "English 500-question benchmark",
    expectedQuestionCount: 500,
    judges: [{ model: "gpt-5-mini", weight: 1 }],
  },
];

export const DEFAULT_EDITION_ID = SCORING_EDITIONS[0].id;
export const HISTORICAL_EDITION_ID = "gpt-5-mini-v2";

export function getScoringEdition(id: string): ScoringEdition {
  const edition = SCORING_EDITIONS.find((candidate) => candidate.id === id);
  if (!edition) throw new Error(`Unknown scoring edition: ${id}`);
  return edition;
}

export interface EditionScore {
  mean: number;
  min: number;
  max: number;
  // Population SD belongs to a single judge run. CSV summaries cannot provide
  // the covariance needed to calculate SD or uncertainty for a panel average.
  stdev: number | null;
}

export interface EditionAnswer {
  answersLabel: string;
  genModel: string;
  provider: string;
  systemPromptLabel: string;
  evalVersion: string;
  runs: EvaluationRun[];
  scores: Record<MetricKey, EditionScore>;
}

export interface CoverageEntry {
  answersLabel: string;
  genModel: string;
  provider: string;
  systemPromptLabel: string;
  missingJudges: string[];
  issues: string[];
  presentJudgeCount: number;
  complete: boolean;
}

export function haveMatchingAnswerMetadata(
  left: EvaluationRun,
  right: EvaluationRun,
): boolean {
  return (
    left.answersLabel === right.answersLabel &&
    left.evalVersion === right.evalVersion &&
    left.genModel === right.genModel &&
    left.provider === right.provider &&
    left.systemPromptLabel === right.systemPromptLabel &&
    left.sourceDataset === right.sourceDataset
  );
}

export function buildEditionScores(
  data: EvaluationRun[],
  edition: ScoringEdition,
) {
  if (
    edition.judges.length === 0 ||
    new Set(edition.judges.map((judge) => judge.model)).size !==
      edition.judges.length ||
    edition.judges.some(
      (judge) => !Number.isFinite(judge.weight) || judge.weight <= 0,
    )
  ) {
    throw new Error(
      "An edition requires distinct judges with positive finite weights.",
    );
  }
  const totalWeight = edition.judges.reduce(
    (sum, judge) => sum + judge.weight,
    0,
  );
  if (!Number.isFinite(totalWeight))
    throw new Error("Edition weights exceed the supported range.");
  const groups = new Map<string, EvaluationRun[]>();
  data
    .filter((run) => run.evalVersion === edition.evalVersion)
    .forEach((run) => {
      const group = groups.get(run.answersLabel) ?? [];
      group.push(run);
      groups.set(run.answersLabel, group);
    });
  const answers: EditionAnswer[] = [];
  const coverage: CoverageEntry[] = [];
  for (const [answersLabel, group] of groups) {
    const exemplar = group[0];
    const issues: string[] = [];
    const missingJudges: string[] = [];
    const selected: EvaluationRun[] = [];
    for (const judge of edition.judges) {
      const matches = group.filter((run) => run.judgeModel === judge.model);
      if (matches.length === 0) missingJudges.push(judge.model);
      else if (matches.length > 1)
        issues.push(`Duplicate judgments from ${judge.model}`);
      else selected.push(matches[0]);
    }
    if (selected.some((run) => !haveMatchingAnswerMetadata(exemplar, run))) {
      issues.push("Answer metadata does not match across judges");
    }
    if (
      edition.judges.length > 1 &&
      selected.some(
        (run) =>
          run.questionCount !== edition.expectedQuestionCount ||
          run.errorCount !== 0,
      )
    ) {
      issues.push(
        `Each panel judge must have ${edition.expectedQuestionCount} scored questions and no recorded errors`,
      );
    }
    const complete = missingJudges.length === 0 && issues.length === 0;
    coverage.push({
      answersLabel,
      genModel: exemplar.genModel,
      provider: exemplar.provider,
      systemPromptLabel: exemplar.systemPromptLabel,
      missingJudges,
      issues,
      presentJudgeCount: selected.length,
      complete,
    });
    if (!complete) continue;
    const scores = Object.fromEntries(
      METRIC_DEFINITIONS.map(({ key }) => {
        const values = selected.map((run) => run.scores[key].mean);
        const mean = edition.judges.reduce((sum, judge) => {
          const run = selected.find(
            (candidate) => candidate.judgeModel === judge.model,
          )!;
          return sum + run.scores[key].mean * (judge.weight / totalWeight);
        }, 0);
        return [
          key,
          {
            mean,
            min: Math.min(...values),
            max: Math.max(...values),
            stdev: selected.length === 1 ? selected[0].scores[key].stdev : null,
          },
        ];
      }),
    ) as Record<MetricKey, EditionScore>;
    answers.push({
      answersLabel,
      genModel: exemplar.genModel,
      provider: exemplar.provider,
      systemPromptLabel: exemplar.systemPromptLabel,
      evalVersion: edition.evalVersion,
      runs: selected,
      scores,
    });
  }
  return { answers, coverage };
}
