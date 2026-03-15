import { useMemo } from "react";
import {
  formatJudgeLabel,
  formatModelLabel,
  getProviderColor,
  getProviderLabel,
  inferProviderFromModel,
} from "../constants";
import type { EvaluationRecord } from "../lib";

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

const RADAR_LABELS: Record<string, string> = {
  Core: "Core Doctrine",
  Secondary: "Secondary Doctrine",
  Tertiary_Handling: "Tertiary Handling",
  Biblical_Basis: "Biblical Basis",
  Consistency: "Consistency",
  Core_Clarity_with_Kindness: "Clarity with Kindness",
  Pastoral_Sensitivity: "Pastoral Sensitivity",
  Secondary_Fairness: "Secondary Fairness",
  Tertiary_Neutrality: "Tertiary Neutrality",
  Tone: "Tone",
  Respect_and_Handling_Objections: "Respect & Objections",
  Objection_Acknowledgement: "Objection Awareness",
  Evangelism: "Evangelism",
  Gospel_Boldness: "Gospel Boldness",
};

function isBaselinePrompt(label: string): boolean {
  return /^(baseline|vanilla)$/i.test(label);
}

function parsePromptVersion(label: string): number[] {
  if (isBaselinePrompt(label)) {
    return [-1];
  }

  const match = label.match(/\d+/g);
  if (!match) {
    return [0];
  }

  return match.map((segment) => Number.parseInt(segment, 10));
}

function comparePromptLabels(left: string, right: string): number {
  const leftParts = parsePromptVersion(left);
  const rightParts = parsePromptVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return left.localeCompare(right);
}

function buildJudgeKey(model: string): string {
  return `${model.replace(/[^a-zA-Z0-9]/g, "") || "judge"}Judge`;
}

function buildJudgeInfo(model: string): JudgeInfo {
  const provider = inferProviderFromModel(model) ?? model;

  return {
    key: buildJudgeKey(model),
    model,
    name: formatJudgeLabel(model),
    color: getProviderColor(provider),
  };
}

export function useDashboardMetrics(data: EvaluationRecord[]) {
  const finalOverallRecords = useMemo(
    () => data.filter((record) => record.subCriterion === "Final_Overall"),
    [data]
  );

  const baselinePromptLabel = useMemo(
    () =>
      finalOverallRecords.find((record) => isBaselinePrompt(record.System_Prompt_Label))
        ?.System_Prompt_Label ?? null,
    [finalOverallRecords]
  );

  const nonBaselinePromptLabels = useMemo(
    () =>
      Array.from(
        new Set(
          finalOverallRecords
            .map((record) => record.System_Prompt_Label)
            .filter((label) => label && !isBaselinePrompt(label))
        )
      ).sort((left, right) => comparePromptLabels(right, left)),
    [finalOverallRecords]
  );

  const activePromptLabel = nonBaselinePromptLabels[0] ?? null;
  const progressionPromptLabels = useMemo(
    () => [baselinePromptLabel, ...[...nonBaselinePromptLabels].sort(comparePromptLabels)].filter(Boolean) as string[],
    [baselinePromptLabel, nonBaselinePromptLabels]
  );

  const primaryJudge = useMemo<JudgeInfo | null>(() => {
    if (!activePromptLabel) {
      return null;
    }

    const promptRecords = finalOverallRecords.filter(
      (record) => record.System_Prompt_Label === activePromptLabel
    );
    const judgeCandidates = Array.from(new Set(promptRecords.map((record) => record.Judge_Model).filter(Boolean)))
      .map((judgeModel) => {
        const judgeRecords = promptRecords.filter((record) => record.Judge_Model === judgeModel);
        const scores = judgeRecords.map((record) => record.value);
        const spread = scores.length > 0 ? Math.max(...scores) - Math.min(...scores) : 0;

        return {
          judge: buildJudgeInfo(judgeModel),
          count: judgeRecords.length,
          spread,
        };
      })
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }

        if (right.spread !== left.spread) {
          return right.spread - left.spread;
        }

        return left.judge.name.localeCompare(right.judge.name);
      });

    return judgeCandidates[0]?.judge ?? null;
  }, [activePromptLabel, finalOverallRecords]);

  const judgeComparisonPromptLabel = useMemo(() => {
    for (const promptLabel of nonBaselinePromptLabels) {
      const promptRecords = finalOverallRecords.filter(
        (record) => record.System_Prompt_Label === promptLabel
      );
      const judgeCount = new Set(promptRecords.map((record) => record.Judge_Model).filter(Boolean)).size;

      if (judgeCount < 2) {
        continue;
      }

      const overlappingModels = Array.from(new Set(promptRecords.map((record) => record.Gen_Model))).filter(
        (model) => {
          const modelJudgeCount = new Set(
            promptRecords
              .filter((record) => record.Gen_Model === model)
              .map((record) => record.Judge_Model)
              .filter(Boolean)
          ).size;

          return modelJudgeCount >= 2;
        }
      );

      if (overlappingModels.length > 0) {
        return promptLabel;
      }
    }

    return null;
  }, [finalOverallRecords, nonBaselinePromptLabels]);

  const comparisonJudges = useMemo<JudgeInfo[]>(() => {
    if (!judgeComparisonPromptLabel) {
      return [];
    }

    return Array.from(
      new Set(
        finalOverallRecords
          .filter((record) => record.System_Prompt_Label === judgeComparisonPromptLabel)
          .map((record) => record.Judge_Model)
          .filter(Boolean)
      )
    )
      .map((judgeModel) => buildJudgeInfo(judgeModel))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [finalOverallRecords, judgeComparisonPromptLabel]);

  const bestPerProvider = useMemo(() => {
    if (!activePromptLabel || !primaryJudge) {
      return [];
    }

    const finalOveralls = finalOverallRecords
      .filter(
        (record) =>
          record.Judge_Model === primaryJudge.model &&
          record.System_Prompt_Label === activePromptLabel
      )
      .map((record) => ({
        provider: record.Provider,
        model: record.Gen_Model,
        promptLabel: record.System_Prompt_Label,
        score: record.value,
      }));

    const maxes: Record<string, (typeof finalOveralls)[0]> = {};
    finalOveralls.forEach((record) => {
      if (!maxes[record.provider] || record.score > maxes[record.provider].score) {
        maxes[record.provider] = record;
      }
    });

    return Object.values(maxes)
      .map((record) => ({
        provider: record.provider,
        model: record.model,
        promptLabel: record.promptLabel,
        score: parseFloat(record.score.toFixed(2)),
        fill: getProviderColor(record.provider),
      }))
      .sort((left, right) => right.score - left.score);
  }, [activePromptLabel, finalOverallRecords, primaryJudge]);

  const promptDelta = useMemo<PromptDeltaRecord[]>(() => {
    if (!activePromptLabel || !baselinePromptLabel || !primaryJudge) {
      return [];
    }

    const judgedRecords = finalOverallRecords.filter(
      (record) => record.Judge_Model === primaryJudge.model
    );
    const models = Array.from(new Set(judgedRecords.map((record) => record.Gen_Model)));
    const modelCountsByProvider = models.reduce<Record<string, number>>((acc, model) => {
      const provider = judgedRecords.find((record) => record.Gen_Model === model)?.Provider;
      if (provider) {
        acc[provider] = (acc[provider] ?? 0) + 1;
      }
      return acc;
    }, {});

    return models
      .reduce<PromptDeltaRecord[]>((acc, model) => {
        const modelRecords = judgedRecords.filter((record) => record.Gen_Model === model);
        const currentRecord = modelRecords.find(
          (record) => record.System_Prompt_Label === activePromptLabel
        );
        const baselineRecord = modelRecords.find(
          (record) => record.System_Prompt_Label === baselinePromptLabel
        );

        if (!currentRecord || !baselineRecord) {
          return acc;
        }

        const scores = progressionPromptLabels.reduce<Record<string, number>>((scoreMap, promptLabel) => {
          const promptRecord = modelRecords.find(
            (record) => record.System_Prompt_Label === promptLabel
          );

          if (promptRecord) {
            scoreMap[promptLabel] = parseFloat(promptRecord.value.toFixed(2));
          }

          return scoreMap;
        }, {});

        const current = scores[activePromptLabel];
        const baseline = scores[baselinePromptLabel];

        if (current === undefined || baseline === undefined) {
          return acc;
        }

        const providerLabel = getProviderLabel(currentRecord.Provider);
        const displayLabel =
          (modelCountsByProvider[currentRecord.Provider] ?? 0) > 1
            ? `${providerLabel} - ${formatModelLabel(model)}`
            : providerLabel;

        acc.push({
          model,
          provider: currentRecord.Provider,
          displayLabel,
          scores,
          currentLabel: activePromptLabel,
          baselineLabel: baselinePromptLabel,
          deltaPct: baseline > 0 ? ((current - baseline) / baseline) * 100 : 0,
        });

        return acc;
      }, [])
      .sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
  }, [activePromptLabel, baselinePromptLabel, finalOverallRecords, primaryJudge, progressionPromptLabels]);

  const bestImprovement = useMemo<BestImprovementRecord | null>(() => {
    if (promptDelta.length === 0) {
      return null;
    }

    const winner = [...promptDelta].sort((left, right) => right.deltaPct - left.deltaPct)[0];
    return {
      model: winner.model,
      delta: winner.deltaPct.toFixed(0),
      baselineLabel: winner.baselineLabel,
      promptLabel: winner.currentLabel,
    };
  }, [promptDelta]);

  const judgeComparison = useMemo(() => {
    if (!judgeComparisonPromptLabel || comparisonJudges.length < 2) {
      return [];
    }

    const promptRecords = finalOverallRecords.filter(
      (record) => record.System_Prompt_Label === judgeComparisonPromptLabel
    );
    const models = Array.from(new Set(promptRecords.map((record) => record.Gen_Model)));

    return models.reduce<Array<Record<string, string | number>>>((acc, model) => {
      const entry: Record<string, string | number> = { model: formatModelLabel(model) };
      let judgeCount = 0;

      comparisonJudges.forEach((judge) => {
        const record = promptRecords.find(
          (promptRecord) =>
            promptRecord.Gen_Model === model && promptRecord.Judge_Model === judge.model
        );

        if (record) {
          entry[judge.key] = parseFloat(record.value.toFixed(2));
          judgeCount += 1;
        } else {
          entry[judge.key] = 0;
        }
      });

      if (judgeCount >= 2) {
        acc.push(entry);
      }

      return acc;
    }, []);
  }, [comparisonJudges, finalOverallRecords, judgeComparisonPromptLabel]);

  const providerSpread = useMemo(() => {
    if (!primaryJudge || nonBaselinePromptLabels.length === 0) {
      return [];
    }

    const scores = finalOverallRecords
      .filter(
        (record) =>
          record.Judge_Model === primaryJudge.model &&
          nonBaselinePromptLabels.includes(record.System_Prompt_Label)
      )
      .map((record) => ({
        provider: record.Provider,
        model: record.Gen_Model,
        promptLabel: record.System_Prompt_Label,
        score: record.value,
      }));

    return Array.from(new Set(scores.map((score) => score.provider)))
      .map((provider) => {
        const providerScores = scores.filter((score) => score.provider === provider);
        if (providerScores.length === 0) {
          return null;
        }

        const minModel = providerScores.reduce((prev, curr) => (prev.score < curr.score ? prev : curr));
        const maxModel = providerScores.reduce((prev, curr) => (prev.score > curr.score ? prev : curr));

        return {
          provider,
          min: minModel.score,
          max: maxModel.score,
          minModel: minModel.model,
          maxModel: maxModel.model,
          minPromptLabel: minModel.promptLabel,
          maxPromptLabel: maxModel.promptLabel,
          runCount: providerScores.length,
          avg: (providerScores.reduce((sum, item) => sum + item.score, 0) / providerScores.length).toFixed(2),
          fill: getProviderColor(provider),
          label: getProviderLabel(provider),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [finalOverallRecords, nonBaselinePromptLabels, primaryJudge]);

  function buildRadarCategory(
    criterion: string,
    subCriteria: string[]
  ): Array<Record<string, string | number>> {
    if (!activePromptLabel || !primaryJudge) {
      return [];
    }

    return subCriteria.map((subCriterion) => {
      const entry: Record<string, string | number> = {
        subject: RADAR_LABELS[subCriterion] || subCriterion,
      };

      bestPerProvider.forEach((best) => {
        const value = data.find(
          (record) =>
            record.Gen_Model === best.model &&
            record.System_Prompt_Label === activePromptLabel &&
            record.Judge_Model === primaryJudge.model &&
            record.criterion === criterion &&
            record.subCriterion === subCriterion
        );

        if (value) {
          entry[best.provider] = value.value;
        }
      });

      return entry;
    });
  }

  const radarAdherence = buildRadarCategory("Adherence", [
    "Core",
    "Secondary",
    "Tertiary_Handling",
    "Biblical_Basis",
    "Consistency",
  ]);

  const radarKindness = buildRadarCategory("Kindness_and_Gentleness", [
    "Core_Clarity_with_Kindness",
    "Pastoral_Sensitivity",
    "Secondary_Fairness",
    "Tertiary_Neutrality",
    "Tone",
  ]);

  const radarInterfaith = buildRadarCategory("Interfaith_Sensitivity", [
    "Respect_and_Handling_Objections",
    "Objection_Acknowledgement",
    "Evangelism",
    "Gospel_Boldness",
  ]);

  const narrativeStats = useMemo<NarrativeStats | null>(() => {
    if (bestPerProvider.length === 0) {
      return null;
    }

    const winner = bestPerProvider[0];
    const runnerUp = bestPerProvider.length > 1 ? bestPerProvider[1] : null;
    const modelCount = new Set(
      data.filter((record) => record.subCriterion === "Final_Overall").map((record) => record.Gen_Model)
    ).size;

    return {
      winnerName: formatModelLabel(winner.model),
      winnerScore: winner.score.toFixed(2),
      runnerUpName: runnerUp ? formatModelLabel(runnerUp.model) : null,
      runnerUpScore: runnerUp ? runnerUp.score.toFixed(2) : null,
      improvementModel: bestImprovement ? formatModelLabel(bestImprovement.model) : null,
      improvementPct: bestImprovement?.delta ?? null,
      modelCount,
    };
  }, [bestPerProvider, bestImprovement, data]);

  return {
    activePromptLabel,
    baselinePromptLabel,
    bestPerProvider,
    comparisonJudges,
    judgeComparisonPromptLabel,
    progressionPromptLabels,
    promptDelta,
    bestImprovement,
    primaryJudge,
    judgeComparison,
    providerSpread,
    radarAdherence,
    radarKindness,
    radarInterfaith,
    narrativeStats,
  };
}
