import { useMemo } from "react";
import {
  formatJudgeLabel,
  formatModelLabel,
  getJudgeRole,
  getProviderColor,
  getProviderLabel,
  inferProviderFromModel,
} from "../constants";
import {
  METRIC_DEFINITIONS,
  type EvaluationRun,
  type MetricKey,
} from "../evaluation-metrics";
import {
  buildEditionScores,
  DEFAULT_EDITION_ID,
  getScoringEdition,
  type EditionAnswer,
} from "../scoring-editions";

export function buildJudgeInfo(model: string) {
  const role = getJudgeRole(model);
  return {
    model,
    key: `${model.replace(/[^a-zA-Z0-9]/g, "")}Judge`,
    name: formatJudgeLabel(model),
    color: getProviderColor(inferProviderFromModel(model) ?? model),
    role: role.role,
    roleLabel: role.label,
    roleDescription: role.description,
  };
}
export type JudgeInfo = ReturnType<typeof buildJudgeInfo>;

export interface PromptDeltaRecord {
  model: string;
  provider: string;
  displayLabel: string;
  scores: Record<string, number>;
  currentLabel: string;
  baselineLabel: string;
  deltaPoints: number;
  deltaPct: number;
}

function isBaseline(label: string) {
  return /^(baseline|vanilla)$/i.test(label);
}
function comparePrompts(left: string, right: string) {
  if (isBaseline(left)) return isBaseline(right) ? 0 : -1;
  if (isBaseline(right)) return 1;
  return left.localeCompare(right, undefined, { numeric: true });
}

export function buildDashboardMetrics(
  data: EvaluationRun[],
  editionId = DEFAULT_EDITION_ID,
  requestedPrompt?: string,
) {
  const edition = getScoringEdition(editionId);
  const { answers, coverage } = buildEditionScores(data, edition);
  const contextRuns = data.filter(
    (run) => run.evalVersion === edition.evalVersion,
  );
  const promptOptions = Array.from(
    new Set(contextRuns.map((run) => run.systemPromptLabel)),
  ).sort(comparePrompts);
  const activePromptLabel =
    requestedPrompt && promptOptions.includes(requestedPrompt)
      ? requestedPrompt
      : (promptOptions.at(-1) ?? null);
  const baselinePromptLabel = promptOptions.find(isBaseline) ?? null;
  const activeAnswers = answers
    .filter((answer) => answer.systemPromptLabel === activePromptLabel)
    .sort(
      (left, right) =>
        right.scores.finalOverall.mean - left.scores.finalOverall.mean ||
        left.genModel.localeCompare(right.genModel),
    );
  const activeCoverage = coverage
    .filter((entry) => entry.systemPromptLabel === activePromptLabel)
    .sort((left, right) => left.genModel.localeCompare(right.genModel));
  const best = new Map<string, EditionAnswer>();
  activeAnswers.forEach((answer) => {
    if (!best.has(answer.provider)) best.set(answer.provider, answer);
  });
  const bestPerProvider = [...best.values()].map((answer) => ({
    provider: answer.provider,
    model: answer.genModel,
    promptLabel: answer.systemPromptLabel,
    score: answer.scores.finalOverall.mean,
    stdev: answer.scores.finalOverall.stdev,
    judgeMin: answer.scores.finalOverall.min,
    judgeMax: answer.scores.finalOverall.max,
    fill: getProviderColor(answer.provider),
  }));

  // A missing or ambiguous prompt run stays absent instead of becoming a zero
  // bar. Baseline and current scores must always belong to the same edition.
  const progressionPromptLabels = promptOptions.filter(
    (prompt) =>
      !activePromptLabel || comparePrompts(prompt, activePromptLabel) <= 0,
  );
  const promptDelta: PromptDeltaRecord[] = activeAnswers.flatMap((answer) => {
    if (!baselinePromptLabel || activePromptLabel === baselinePromptLabel)
      return [];
    const modelRuns = answers.filter(
      (candidate) =>
        candidate.genModel === answer.genModel &&
        candidate.provider === answer.provider,
    );
    const baselines = modelRuns.filter(
      (candidate) => candidate.systemPromptLabel === baselinePromptLabel,
    );
    if (
      baselines.length !== 1 ||
      modelRuns.filter(
        (candidate) => candidate.systemPromptLabel === activePromptLabel,
      ).length !== 1
    )
      return [];
    const scores: Record<string, number> = {};
    for (const prompt of progressionPromptLabels) {
      const matches = modelRuns.filter(
        (candidate) => candidate.systemPromptLabel === prompt,
      );
      if (matches.length === 1)
        scores[prompt] = matches[0].scores.finalOverall.mean;
    }
    const baseline = baselines[0].scores.finalOverall.mean;
    const current = answer.scores.finalOverall.mean;
    return [
      {
        model: answer.genModel,
        provider: answer.provider,
        displayLabel: formatModelLabel(answer.genModel),
        scores,
        currentLabel: activePromptLabel!,
        baselineLabel: baselinePromptLabel,
        deltaPoints: current - baseline,
        deltaPct: ((current - baseline) / baseline) * 100,
      },
    ];
  });
  const bestImprovement =
    [...promptDelta].sort((a, b) => b.deltaPoints - a.deltaPoints)[0] ?? null;
  const categoryScoresByModel = activeAnswers.map((answer) => ({
    model: answer.genModel,
    provider: answer.provider,
    label: formatModelLabel(answer.genModel),
    providerLabel: getProviderLabel(answer.provider),
    fill: getProviderColor(answer.provider),
    adherence: answer.scores.adherenceOverall.mean,
    kindness: answer.scores.kindnessOverall.mean,
    interfaith: answer.scores.interfaithOverall.mean,
  }));

  const nonBaseline = answers.filter(
    (answer) =>
      !isBaseline(answer.systemPromptLabel) &&
      (!activePromptLabel ||
        comparePrompts(answer.systemPromptLabel, activePromptLabel) <= 0),
  );
  const providerSpread = [
    ...new Set(nonBaseline.map((answer) => answer.provider)),
  ].map((provider) => {
    const runs = nonBaseline
      .filter((answer) => answer.provider === provider)
      .map((answer) => ({
        provider,
        model: answer.genModel,
        promptLabel: answer.systemPromptLabel,
        score: answer.scores.finalOverall.mean,
      }))
      .sort((a, b) => b.score - a.score);
    const maximum = runs[0];
    const minimum = runs[runs.length - 1];
    return {
      provider,
      min: minimum.score,
      max: maximum.score,
      minModel: minimum.model,
      maxModel: maximum.model,
      minPromptLabel: minimum.promptLabel,
      maxPromptLabel: maximum.promptLabel,
      runCount: runs.length,
      modelCount: new Set(runs.map((run) => run.model)).size,
      runs,
      avg: (
        runs.reduce((sum, run) => sum + run.score, 0) / runs.length
      ).toFixed(2),
      fill: getProviderColor(provider),
      label: getProviderLabel(provider),
    };
  });
  const radar = (group: "Adherence" | "Kindness" | "Interfaith") =>
    METRIC_DEFINITIONS.filter((metric) => metric.group === group).map(
      (metric) => {
        const point: Record<string, string | number> = {
          subject: metric.label,
        };
        best.forEach((answer, provider) => {
          point[provider] = answer.scores[metric.key].mean;
        });
        return point;
      },
    );

  const selectedRuns = activeAnswers.flatMap((answer) => answer.runs);
  const counts = selectedRuns.map((run) => run.questionCount);
  const latestEvaluatedAt = selectedRuns.reduce(
    (latest, run) =>
      !latest || Date.parse(run.evaluatedAt) > Date.parse(latest)
        ? run.evaluatedAt
        : latest,
    "",
  );
  const availableJudges = [
    ...new Set(contextRuns.map((run) => run.judgeModel)),
  ].map(buildJudgeInfo);
  const narrativeStats = activeAnswers.length
    ? {
        winnerName: formatModelLabel(activeAnswers[0].genModel),
        winnerScore: activeAnswers[0].scores.finalOverall.mean,
        runnerUpName: activeAnswers[1]
          ? formatModelLabel(activeAnswers[1].genModel)
          : null,
        runnerUpScore: activeAnswers[1]?.scores.finalOverall.mean ?? null,
        modelCount: activeAnswers.length,
      }
    : null;

  return {
    edition,
    activePromptLabel,
    promptOptions,
    activeAnswers,
    activeCoverage,
    incompleteAnswers: activeCoverage.filter((entry) => !entry.complete),
    availableJudges,
    baselinePromptLabel,
    bestPerProvider,
    progressionPromptLabels,
    promptDelta,
    bestImprovement,
    categoryScoresByModel,
    providerSpread,
    radarAdherence: radar("Adherence"),
    radarKindness: radar("Kindness"),
    radarInterfaith: radar("Interfaith"),
    narrativeStats,
    latestEvaluatedAt,
    questionCountSummary: {
      min: counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
      totalErrors: selectedRuns.reduce((sum, run) => sum + run.errorCount, 0),
    },
  };
}

export type DashboardMetrics = ReturnType<typeof buildDashboardMetrics>;
export function useDashboardMetrics(
  data: EvaluationRun[],
  editionId = DEFAULT_EDITION_ID,
  prompt?: string,
) {
  return useMemo(
    () => buildDashboardMetrics(data, editionId, prompt),
    [data, editionId, prompt],
  );
}

export function scoreRangeLabel(
  answer: EditionAnswer,
  metric: MetricKey = "finalOverall",
): string {
  const score = answer.scores[metric];
  return `${score.min.toFixed(2)}–${score.max.toFixed(2)}`;
}
