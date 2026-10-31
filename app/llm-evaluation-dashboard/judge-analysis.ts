import type { EvaluationRun, MetricKey } from "./evaluation-metrics";
import { haveMatchingAnswerMetadata } from "./scoring-editions";

export interface JudgePairPoint {
  answersLabel: string;
  provider: string;
  model: string;
  promptLabel: string;
  evalVersion: string;
  primaryMean: number;
  primaryStdev: number;
  comparisonMean: number;
  comparisonStdev: number;
  difference: number;
}

export type EvidenceStatus = "none" | "partial" | "complete";

export interface JudgePairAnalysis {
  primaryJudge: string;
  comparisonJudge: string;
  promptLabel: string;
  metricKey: MetricKey;
  points: JudgePairPoint[];
  primaryRunCount: number;
  comparisonRunCount: number;
  sharedRunCount: number;
  totalAnswerSetCount: number;
  meanDifference: number | null;
  meanAbsoluteDifference: number | null;
  pearson: number | null;
  spearman: number | null;
  comparisonLowerCount: number;
  comparisonHigherCount: number;
  tiedCount: number;
  primaryAverageStdev: number | null;
  comparisonAverageStdev: number | null;
  evidenceStatus: EvidenceStatus;
}

export interface JudgePairSelection {
  evalVersion: string;
  primaryJudge: string;
  comparisonJudge: string;
  promptLabel: string;
  metricKey: MetricKey;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function pearsonCorrelation(
  left: number[],
  right: number[],
): number | null {
  if (left.length !== right.length || left.length < 2) return null;

  const leftMean = mean(left);
  const rightMean = mean(right);
  if (leftMean === null || rightMean === null) return null;

  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquared += leftDelta * leftDelta;
    rightSquared += rightDelta * rightDelta;
  }

  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator === 0 ? null : numerator / denominator;
}

function ranks(values: number[]): number[] {
  return values.map((value) => {
    const sorted = [...values].sort((left, right) => left - right);
    const first = sorted.indexOf(value);
    const last = sorted.lastIndexOf(value);
    return (first + last) / 2 + 1;
  });
}

export function spearmanCorrelation(
  left: number[],
  right: number[],
): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  return pearsonCorrelation(ranks(left), ranks(right));
}

function getEvidenceStatus(
  sharedRunCount: number,
  total: number,
): EvidenceStatus {
  if (sharedRunCount === 0) return "none";
  return sharedRunCount === total ? "complete" : "partial";
}

export function buildJudgePairAnalysis(
  runs: EvaluationRun[],
  selection: JudgePairSelection,
): JudgePairAnalysis {
  const promptRuns = runs.filter(
    (run) =>
      run.systemPromptLabel === selection.promptLabel &&
      run.evalVersion === selection.evalVersion,
  );
  const primaryRuns = promptRuns.filter(
    (run) => run.judgeModel === selection.primaryJudge,
  );
  const comparisonRuns = promptRuns.filter(
    (run) => run.judgeModel === selection.comparisonJudge,
  );
  const totalAnswerSetCount = new Set(promptRuns.map((run) => run.answersLabel))
    .size;

  const points = comparisonRuns
    .flatMap<JudgePairPoint>((comparisonRun) => {
      const matches = primaryRuns.filter(
        (run) => run.answersLabel === comparisonRun.answersLabel,
      );
      const primaryRun = matches[0];
      if (
        matches.length !== 1 ||
        comparisonRuns.filter(
          (run) => run.answersLabel === comparisonRun.answersLabel,
        ).length !== 1 ||
        !haveMatchingAnswerMetadata(primaryRun, comparisonRun) ||
        primaryRun.questionCount !== comparisonRun.questionCount ||
        primaryRun.errorCount !== 0 ||
        comparisonRun.errorCount !== 0 ||
        selection.primaryJudge === selection.comparisonJudge
      )
        return [];

      const primaryScore = primaryRun.scores[selection.metricKey];
      const comparisonScore = comparisonRun.scores[selection.metricKey];
      return [
        {
          answersLabel: comparisonRun.answersLabel,
          provider: comparisonRun.provider,
          model: comparisonRun.genModel,
          promptLabel: comparisonRun.systemPromptLabel,
          evalVersion: comparisonRun.evalVersion,
          primaryMean: primaryScore.mean,
          primaryStdev: primaryScore.stdev,
          comparisonMean: comparisonScore.mean,
          comparisonStdev: comparisonScore.stdev,
          difference: comparisonScore.mean - primaryScore.mean,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.primaryMean - left.primaryMean ||
        left.answersLabel.localeCompare(right.answersLabel),
    );

  const differences = points.map((point) => point.difference);
  const primaryMeans = points.map((point) => point.primaryMean);
  const comparisonMeans = points.map((point) => point.comparisonMean);
  const sharedRunCount = points.length;

  return {
    primaryJudge: selection.primaryJudge,
    comparisonJudge: selection.comparisonJudge,
    promptLabel: selection.promptLabel,
    metricKey: selection.metricKey,
    points,
    primaryRunCount: primaryRuns.length,
    comparisonRunCount: comparisonRuns.length,
    sharedRunCount,
    totalAnswerSetCount,
    meanDifference: mean(differences),
    meanAbsoluteDifference: mean(differences.map(Math.abs)),
    pearson: pearsonCorrelation(primaryMeans, comparisonMeans),
    spearman: spearmanCorrelation(primaryMeans, comparisonMeans),
    comparisonLowerCount: differences.filter((difference) => difference < 0)
      .length,
    comparisonHigherCount: differences.filter((difference) => difference > 0)
      .length,
    tiedCount: differences.filter((difference) => difference === 0).length,
    primaryAverageStdev: mean(points.map((point) => point.primaryStdev)),
    comparisonAverageStdev: mean(points.map((point) => point.comparisonStdev)),
    evidenceStatus: getEvidenceStatus(sharedRunCount, totalAnswerSetCount),
  };
}
