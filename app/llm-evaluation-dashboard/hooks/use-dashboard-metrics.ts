import { useMemo } from "react";
import {
  formatJudgeLabel,
  formatModelLabel,
  getJudgeRole,
  getProviderColor,
  getProviderLabel,
  inferProviderFromModel,
  type JudgeRole,
} from "../constants";
import type { EvaluationRun, MetricKey } from "../evaluation-metrics";

export interface BestImprovementRecord {
  model: string;
  delta: string;
  baselineLabel: string;
  promptLabel: string;
}

export interface JudgeInfo {
  key: string;
  model: string;
  name: string;
  color: string;
  role: JudgeRole;
  roleLabel: string;
  roleDescription: string;
}

export interface NarrativeStats {
  winnerName: string;
  winnerScore: string;
  runnerUpName: string | null;
  runnerUpScore: string | null;
  improvementModel: string | null;
  improvementPct: string | null;
  modelCount: number;
}

export interface PromptDeltaRecord {
  model: string;
  provider: string;
  displayLabel: string;
  scores: Record<string, number>;
  currentLabel: string;
  baselineLabel: string;
  deltaPct: number;
}

const RADAR_METRICS: Record<
  "adherence" | "kindness" | "interfaith",
  Array<{ key: MetricKey; subject: string }>
> = {
  adherence: [
    { key: "adherenceCore", subject: "Core Doctrine" },
    { key: "adherenceSecondary", subject: "Secondary Doctrine" },
    { key: "adherenceTertiaryHandling", subject: "Tertiary Handling" },
    { key: "adherenceBiblicalBasis", subject: "Biblical Basis" },
    { key: "adherenceConsistency", subject: "Consistency" },
  ],
  kindness: [
    { key: "kindnessCoreClarityWithKindness", subject: "Clarity with Kindness" },
    { key: "kindnessPastoralSensitivity", subject: "Pastoral Sensitivity" },
    { key: "kindnessSecondaryFairness", subject: "Secondary Fairness" },
    { key: "kindnessTertiaryNeutrality", subject: "Tertiary Neutrality" },
    { key: "kindnessTone", subject: "Tone" },
  ],
  interfaith: [
    {
      key: "interfaithRespectAndHandlingObjections",
      subject: "Respect & Objections",
    },
    {
      key: "interfaithObjectionAcknowledgement",
      subject: "Objection Awareness",
    },
    { key: "interfaithEvangelism", subject: "Evangelism" },
    { key: "interfaithGospelBoldness", subject: "Gospel Boldness" },
  ],
};

function isBaselinePrompt(label: string): boolean {
  return /^(baseline|vanilla)$/i.test(label);
}

function parsePromptVersion(label: string): number[] {
  if (isBaselinePrompt(label)) return [-1];
  const match = label.match(/\d+/g);
  return match ? match.map((segment) => Number.parseInt(segment, 10)) : [0];
}

function comparePromptLabels(left: string, right: string): number {
  const leftParts = parsePromptVersion(left);
  const rightParts = parsePromptVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.localeCompare(right);
}

function buildJudgeKey(model: string): string {
  return `${model.replace(/[^a-zA-Z0-9]/g, "") || "judge"}Judge`;
}

export function buildJudgeInfo(model: string): JudgeInfo {
  const provider = inferProviderFromModel(model) ?? model;
  const role = getJudgeRole(model);
  return {
    key: buildJudgeKey(model),
    model,
    name: formatJudgeLabel(model),
    color: getProviderColor(provider),
    role: role.role,
    roleLabel: role.label,
    roleDescription: role.description,
  };
}

export function buildDashboardMetrics(data: EvaluationRun[]) {
  const finalOverallRuns = data;
  const baselinePromptLabel =
    finalOverallRuns.find((run) => isBaselinePrompt(run.systemPromptLabel))
      ?.systemPromptLabel ?? null;
  const nonBaselinePromptLabels = Array.from(
    new Set(
      finalOverallRuns
        .map((run) => run.systemPromptLabel)
        .filter((label) => label && !isBaselinePrompt(label))
    )
  ).sort((left, right) => comparePromptLabels(right, left));
  const activePromptLabel = nonBaselinePromptLabels[0] ?? null;
  const progressionPromptLabels = [
    baselinePromptLabel,
    ...[...nonBaselinePromptLabels].sort(comparePromptLabels),
  ].filter(Boolean) as string[];

  const availableJudges = Array.from(new Set(data.map((run) => run.judgeModel)))
    .map(buildJudgeInfo)
    .sort(
      (left, right) =>
        getJudgeRole(left.model).order - getJudgeRole(right.model).order ||
        left.name.localeCompare(right.name)
    );
  const primaryJudge =
    availableJudges.find((judge) => judge.role === "primary") ?? null;
  const allCrossValidators = availableJudges.filter(
    (judge) => judge.model !== primaryJudge?.model
  );

  const bestPerProvider =
    !activePromptLabel || !primaryJudge
      ? []
      : Object.values(
          finalOverallRuns
            .filter(
              (run) =>
                run.judgeModel === primaryJudge.model &&
                run.systemPromptLabel === activePromptLabel
            )
            .reduce<
              Record<
                string,
                {
                  provider: string;
                  model: string;
                  promptLabel: string;
                  score: number;
                  stdev: number;
                }
              >
            >((best, run) => {
              const candidate = {
                provider: run.provider,
                model: run.genModel,
                promptLabel: run.systemPromptLabel,
                score: run.scores.finalOverall.mean,
                stdev: run.scores.finalOverall.stdev,
              };
              if (!best[run.provider] || candidate.score > best[run.provider].score) {
                best[run.provider] = candidate;
              }
              return best;
            }, {})
        )
          .map((run) => ({
            ...run,
            score: Number(run.score.toFixed(2)),
            fill: getProviderColor(run.provider),
          }))
          .sort((left, right) => right.score - left.score);

  const promptDelta: PromptDeltaRecord[] =
    !activePromptLabel || !baselinePromptLabel || !primaryJudge
      ? []
      : (() => {
          const judgedRuns = finalOverallRuns.filter(
            (run) => run.judgeModel === primaryJudge.model
          );
          const models = Array.from(new Set(judgedRuns.map((run) => run.genModel)));
          const modelCountsByProvider = models.reduce<Record<string, number>>(
            (counts, model) => {
              const provider = judgedRuns.find((run) => run.genModel === model)?.provider;
              if (provider) counts[provider] = (counts[provider] ?? 0) + 1;
              return counts;
            },
            {}
          );

          return models
            .flatMap<PromptDeltaRecord>((model) => {
              const modelRuns = judgedRuns.filter((run) => run.genModel === model);
              const currentRun = modelRuns.find(
                (run) => run.systemPromptLabel === activePromptLabel
              );
              const baselineRun = modelRuns.find(
                (run) => run.systemPromptLabel === baselinePromptLabel
              );
              if (!currentRun || !baselineRun) return [];

              const scores = progressionPromptLabels.reduce<Record<string, number>>(
                (scoreMap, promptLabel) => {
                  const promptRun = modelRuns.find(
                    (run) => run.systemPromptLabel === promptLabel
                  );
                  if (promptRun) {
                    scoreMap[promptLabel] = Number(
                      promptRun.scores.finalOverall.mean.toFixed(2)
                    );
                  }
                  return scoreMap;
                },
                {}
              );
              const current = scores[activePromptLabel];
              const baseline = scores[baselinePromptLabel];
              if (current === undefined || baseline === undefined) return [];

              const providerLabel = getProviderLabel(currentRun.provider);
              return [
                {
                  model,
                  provider: currentRun.provider,
                  displayLabel:
                    (modelCountsByProvider[currentRun.provider] ?? 0) > 1
                      ? `${providerLabel} - ${formatModelLabel(model)}`
                      : providerLabel,
                  scores,
                  currentLabel: activePromptLabel,
                  baselineLabel: baselinePromptLabel,
                  deltaPct: baseline > 0 ? ((current - baseline) / baseline) * 100 : 0,
                },
              ];
            })
            .sort(
              (left, right) =>
                left.provider.localeCompare(right.provider) ||
                left.model.localeCompare(right.model)
            );
        })();

  const bestImprovement: BestImprovementRecord | null =
    promptDelta.length === 0
      ? null
      : (() => {
          const winner = [...promptDelta].sort(
            (left, right) => right.deltaPct - left.deltaPct
          )[0];
          return {
            model: winner.model,
            delta: winner.deltaPct.toFixed(0),
            baselineLabel: winner.baselineLabel,
            promptLabel: winner.currentLabel,
          };
        })();

  const categoryScoresByModel =
    !activePromptLabel || !primaryJudge
      ? []
      : data
          .filter(
            (run) =>
              run.judgeModel === primaryJudge.model &&
              run.systemPromptLabel === activePromptLabel
          )
          .map((run) => ({
            model: run.genModel,
            provider: run.provider,
            adherence: Number(run.scores.adherenceOverall.mean.toFixed(2)),
            kindness: Number(run.scores.kindnessOverall.mean.toFixed(2)),
            interfaith: Number(run.scores.interfaithOverall.mean.toFixed(2)),
            fill: getProviderColor(run.provider),
            label: formatModelLabel(run.genModel),
            providerLabel: getProviderLabel(run.provider),
          }));

  const providerSpread =
    !primaryJudge || nonBaselinePromptLabels.length === 0
      ? []
      : Array.from(
          new Set(
            finalOverallRuns
              .filter(
                (run) =>
                  run.judgeModel === primaryJudge.model &&
                  nonBaselinePromptLabels.includes(run.systemPromptLabel)
              )
              .map((run) => run.provider)
          )
        ).map((provider) => {
          const providerRuns = finalOverallRuns
            .filter(
              (run) =>
                run.judgeModel === primaryJudge.model &&
                nonBaselinePromptLabels.includes(run.systemPromptLabel) &&
                run.provider === provider
            )
            .map((run) => ({
              provider: run.provider,
              model: run.genModel,
              promptLabel: run.systemPromptLabel,
              score: run.scores.finalOverall.mean,
            }));
          const minRun = providerRuns.reduce((previous, current) =>
            previous.score < current.score ? previous : current
          );
          const maxRun = providerRuns.reduce((previous, current) =>
            previous.score > current.score ? previous : current
          );
          const runs = [...providerRuns]
            .sort((left, right) => right.score - left.score)
            .map((run) => ({ ...run, score: Number(run.score.toFixed(2)) }));

          return {
            provider,
            min: minRun.score,
            max: maxRun.score,
            minModel: minRun.model,
            maxModel: maxRun.model,
            minPromptLabel: minRun.promptLabel,
            maxPromptLabel: maxRun.promptLabel,
            runCount: providerRuns.length,
            modelCount: new Set(providerRuns.map((run) => run.model)).size,
            runs,
            avg: (
              providerRuns.reduce((sum, run) => sum + run.score, 0) /
              providerRuns.length
            ).toFixed(2),
            fill: getProviderColor(provider),
            label: getProviderLabel(provider),
          };
        });

  function buildRadarCategory(
    metrics: Array<{ key: MetricKey; subject: string }>
  ): Array<Record<string, string | number>> {
    if (!activePromptLabel || !primaryJudge) return [];
    return metrics.map((metric) => {
      const entry: Record<string, string | number> = { subject: metric.subject };
      bestPerProvider.forEach((best) => {
        const run = data.find(
          (candidate) =>
            candidate.genModel === best.model &&
            candidate.systemPromptLabel === activePromptLabel &&
            candidate.judgeModel === primaryJudge.model
        );
        if (run) entry[best.provider] = run.scores[metric.key].mean;
      });
      return entry;
    });
  }

  const narrativeStats: NarrativeStats | null =
    bestPerProvider.length === 0
      ? null
      : {
          winnerName: formatModelLabel(bestPerProvider[0].model),
          winnerScore: bestPerProvider[0].score.toFixed(2),
          runnerUpName:
            bestPerProvider.length > 1
              ? formatModelLabel(bestPerProvider[1].model)
              : null,
          runnerUpScore:
            bestPerProvider.length > 1 ? bestPerProvider[1].score.toFixed(2) : null,
          improvementModel: bestImprovement
            ? formatModelLabel(bestImprovement.model)
            : null,
          improvementPct: bestImprovement?.delta ?? null,
          modelCount: new Set(data.map((run) => run.genModel)).size,
        };

  const questionCounts = data.map((run) => run.questionCount);
  const latestEvaluatedAt = data.reduce(
    (latest, run) =>
      Date.parse(run.evaluatedAt) > Date.parse(latest) ? run.evaluatedAt : latest,
    data[0]?.evaluatedAt ?? new Date(0).toISOString()
  );

  return {
    activePromptLabel,
    allCrossValidators,
    availableJudges,
    baselinePromptLabel,
    bestPerProvider,
    progressionPromptLabels,
    promptDelta,
    bestImprovement,
    categoryScoresByModel,
    primaryJudge,
    providerSpread,
    radarAdherence: buildRadarCategory(RADAR_METRICS.adherence),
    radarKindness: buildRadarCategory(RADAR_METRICS.kindness),
    radarInterfaith: buildRadarCategory(RADAR_METRICS.interfaith),
    narrativeStats,
    evalVersions: Array.from(new Set(data.map((run) => run.evalVersion))).filter(Boolean),
    latestEvaluatedAt,
    questionCountSummary: {
      min: questionCounts.length > 0 ? Math.min(...questionCounts) : 0,
      max: questionCounts.length > 0 ? Math.max(...questionCounts) : 0,
      totalErrors: data.reduce((sum, run) => sum + run.errorCount, 0),
    },
  };
}

export function useDashboardMetrics(data: EvaluationRun[]) {
  return useMemo(() => buildDashboardMetrics(data), [data]);
}
