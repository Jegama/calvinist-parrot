import { useMemo } from "react";
import { COLORS, PROVIDER_LABELS } from "../constants";
import type { EvaluationRecord } from "../lib";

export interface BestImprovementRecord {
  model: string;
  delta: string;
  baselineLabel: string;
  v1Label: string;
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

function friendlyModelName(model: string): string {
  return model
    .replace("gemini-3-flash-preview", "Gemini 3 Flash")
    .replace("gemini-2.5-flash-preview", "Gemini 2.5 Flash")
    .replace("gpt-5-mini", "GPT-5 Mini")
    .replace("grok-4-1-fast-reasoning", "Grok 4.1 Fast")
    .replace("claude-haiku-4-5-20251001", "Claude Haiku 4.5")
    .replace("claude-haiku-4-5", "Claude Haiku 4.5");
}

function shortModelName(model: string): string {
  return model
    .replace("-preview-09-2025", "")
    .replace("-preview", "")
    .replace("-reasoning", "")
    .replace("-20251001", "");
}

export function useDashboardMetrics(data: EvaluationRecord[]) {
  const bestPerProvider = useMemo(() => {
    // Final_Overall is a single pre-computed score per model config — no averaging needed
    const finalOveralls = data
      .filter((d) => d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Final_Overall")
      .map((d) => ({
        Provider: d.Provider,
        Gen_Model: d.Gen_Model,
        System_Prompt_Label: d.System_Prompt_Label,
        score: d.value,
      }));

    const maxes: Record<string, (typeof finalOveralls)[0]> = {};
    finalOveralls.forEach((m) => {
      if (!maxes[m.Provider] || m.score > maxes[m.Provider].score) {
        maxes[m.Provider] = m;
      }
    });

    const result = Object.values(maxes).map((m) => ({
      provider: m.Provider,
      model: m.Gen_Model,
      promptLabel: m.System_Prompt_Label,
      score: parseFloat(m.score.toFixed(2)),
      fill: COLORS[m.Provider],
    }));

    return result.sort((a, b) => b.score - a.score);
  }, [data]);

  const promptDelta = useMemo(() => {
    const finalOveralls = data.filter(
      (d) => d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Final_Overall"
    );

    const models = Array.from(new Set(finalOveralls.map((d) => d.Gen_Model)));

    return models
      .reduce<Array<{ model: string; provider: string; v1: number; baseline: number }>>((acc, model) => {
        const v1 = finalOveralls.find(
          (d) => d.Gen_Model === model && d.System_Prompt_Label === "v1_0"
        );
        const baseline = finalOveralls.find(
          (d) => d.Gen_Model === model && d.System_Prompt_Label === "baseline"
        );

        if (!v1 || !baseline) return acc;

        acc.push({
          model: shortModelName(model),
          provider: v1.Provider,
          v1: parseFloat(v1.value.toFixed(2)),
          baseline: parseFloat(baseline.value.toFixed(2)),
        });

        return acc;
      }, [])
      .sort((a, b) => {
        const deltaA = (a.v1 - a.baseline) / a.baseline;
        const deltaB = (b.v1 - b.baseline) / b.baseline;
        return deltaB - deltaA;
      });
  }, [data]);

  const bestImprovement = useMemo<BestImprovementRecord | null>(() => {
    const finalOveralls = data
      .filter((d) => d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Final_Overall")
      .map((d) => ({
        model: d.Gen_Model,
        prompt: d.System_Prompt_Label,
        score: d.value,
      }));

    const models = Array.from(new Set(finalOveralls.map((s) => s.model)));
    let maxDelta = -1;
    let bestRecord: BestImprovementRecord | null = null;

    models.forEach((m) => {
      const baseline = finalOveralls.find((s) => s.model === m && s.prompt === "baseline");
      const v1 = finalOveralls.find((s) => s.model === m && s.prompt === "v1_0");

      if (baseline && v1) {
        const delta = ((v1.score - baseline.score) / baseline.score) * 100;
        if (delta > maxDelta) {
          maxDelta = delta;
          bestRecord = {
            model: shortModelName(m),
            delta: delta.toFixed(0),
            baselineLabel: "baseline",
            v1Label: "v1_0",
          };
        }
      }
    });

    return bestRecord;
  }, [data]);

  // Detect available judges from data
  const availableJudges = useMemo<JudgeInfo[]>(() => {
    const judges = Array.from(
      new Set(
        data
          .filter((d) => d.subCriterion === "Final_Overall")
          .map((d) => d.Judge_Model)
      )
    ).filter(Boolean);

    return judges.map((j) => ({
      key:
        j === "gpt-5-mini"
          ? "gptJudge"
          : j === "gemini-3-flash-preview"
            ? "geminiJudge"
            : j.replace(/[^a-zA-Z0-9]/g, "") + "Judge",
      model: j,
      name:
        j === "gpt-5-mini"
          ? "Graded by GPT-5 Mini (OpenAI)"
          : j === "gemini-3-flash-preview"
            ? "Graded by Gemini 3 Flash (Google)"
            : `Graded by ${j}`,
      color:
        j === "gpt-5-mini"
          ? COLORS.openai
          : j === "gemini-3-flash-preview"
            ? COLORS.google
            : COLORS.anthropic,
    }));
  }, [data]);

  const judgeComparison = useMemo(() => {
    const models = Array.from(
      new Set(
        data
          .filter((d) => d.subCriterion === "Final_Overall" && d.System_Prompt_Label === "v1_0")
          .map((d) => d.Gen_Model)
      )
    );

    return models.reduce<Array<Record<string, string | number>>>((acc, model) => {
      const entry: Record<string, string | number> = { model: shortModelName(model) };

      let judgeCount = 0;
      availableJudges.forEach((judge) => {
        const record = data.find(
          (d) =>
            d.Gen_Model === model &&
            d.Judge_Model === judge.model &&
            d.System_Prompt_Label === "v1_0" &&
            d.subCriterion === "Final_Overall"
        );
        if (record) {
          entry[judge.key] = parseFloat(record.value.toFixed(2));
          judgeCount++;
        } else {
          entry[judge.key] = 0;
        }
      });

      if (judgeCount >= 2) acc.push(entry);
      return acc;
    }, []);
  }, [data, availableJudges]);

  const providerSpread = useMemo(() => {
    const scores = data
      .filter(
        (d) =>
          d.Judge_Model === "gpt-5-mini" &&
          d.System_Prompt_Label === "v1_0" &&
          d.subCriterion === "Final_Overall"
      )
      .map((d) => ({
        provider: d.Provider,
        model: d.Gen_Model,
        score: d.value,
      }));

    const result = ["google", "openai", "xai", "anthropic"]
      .map((p) => {
        const pScores = scores.filter((s) => s.provider === p);
        if (pScores.length === 0) return null;

        const minModel = pScores.reduce((prev, curr) => (prev.score < curr.score ? prev : curr));
        const maxModel = pScores.reduce((prev, curr) => (prev.score > curr.score ? prev : curr));

        return {
          provider: p,
          min: minModel.score,
          max: maxModel.score,
          minModel: minModel.model,
          maxModel: maxModel.model,
          avg: (pScores.reduce((a, b) => a + b.score, 0) / pScores.length).toFixed(2),
          fill: COLORS[p],
          label: PROVIDER_LABELS[p],
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return result;
  }, [data]);

  // --- 3 Radar datasets (one per evaluation category) ---

  function buildRadarCategory(
    criterion: string,
    subCriteria: string[]
  ): Array<Record<string, string | number>> {
    return subCriteria.map((sub) => {
      const entry: Record<string, string | number> = { subject: RADAR_LABELS[sub] || sub };
      bestPerProvider.forEach((best) => {
        const val = data.find(
          (d) =>
            d.Gen_Model === best.model &&
            d.System_Prompt_Label === "v1_0" &&
            d.Judge_Model === "gpt-5-mini" &&
            d.criterion === criterion &&
            d.subCriterion === sub
        );
        if (val) {
          entry[best.provider] = val.value;
        }
      });
      return entry;
    });
  }

  const radarAdherence = useMemo(
    () => buildRadarCategory("Adherence", ["Core", "Secondary", "Tertiary_Handling", "Biblical_Basis", "Consistency"]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bestPerProvider, data]
  );

  const radarKindness = useMemo(
    () =>
      buildRadarCategory("Kindness_and_Gentleness", [
        "Core_Clarity_with_Kindness",
        "Pastoral_Sensitivity",
        "Secondary_Fairness",
        "Tertiary_Neutrality",
        "Tone",
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bestPerProvider, data]
  );

  const radarInterfaith = useMemo(
    () =>
      buildRadarCategory("Interfaith_Sensitivity", [
        "Respect_and_Handling_Objections",
        "Objection_Acknowledgement",
        "Evangelism",
        "Gospel_Boldness",
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bestPerProvider, data]
  );

  // --- Narrative stats ---

  const narrativeStats = useMemo<NarrativeStats | null>(() => {
    if (bestPerProvider.length === 0) return null;

    const winner = bestPerProvider[0];
    const runnerUp = bestPerProvider.length > 1 ? bestPerProvider[1] : null;

    const modelCount = new Set(
      data.filter((d) => d.subCriterion === "Final_Overall").map((d) => d.Gen_Model)
    ).size;

    return {
      winnerName: friendlyModelName(winner.model),
      winnerScore: winner.score.toFixed(2),
      runnerUpName: runnerUp ? friendlyModelName(runnerUp.model) : null,
      runnerUpScore: runnerUp ? runnerUp.score.toFixed(2) : null,
      improvementModel: bestImprovement ? friendlyModelName(bestImprovement.model) : null,
      improvementPct: bestImprovement?.delta ?? null,
      modelCount,
    };
  }, [bestPerProvider, bestImprovement, data]);

  return {
    bestPerProvider,
    promptDelta,
    bestImprovement,
    availableJudges,
    judgeComparison,
    providerSpread,
    radarAdherence,
    radarKindness,
    radarInterfaith,
    narrativeStats,
  };
}
