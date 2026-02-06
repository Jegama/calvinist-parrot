import { useMemo } from "react";
import { COLORS, PROVIDER_LABELS } from "../constants";
import type { EvaluationRecord } from "../lib";

export interface BestImprovementRecord {
  model: string;
  delta: string;
  baselineLabel: string;
  v1Label: string;
}

type JudgeComparisonEntry = { model: string; gptJudge: number; geminiJudge: number; claudeJudge: number };

export function useDashboardMetrics(data: EvaluationRecord[]) {
  const bestPerProvider = useMemo(() => {
    const modelScores: Record<
      string,
      { Provider: string; Gen_Model: string; System_Prompt_Label: string; total: number; count: number }
    > = {};

    data
      .filter((d) => d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Overall")
      .forEach((d) => {
        const key = `${d.Gen_Model}-${d.System_Prompt_Label}`;
        if (!modelScores[key]) {
          modelScores[key] = {
            Provider: d.Provider,
            Gen_Model: d.Gen_Model,
            System_Prompt_Label: d.System_Prompt_Label,
            total: 0,
            count: 0,
          };
        }
        modelScores[key].total += d.value;
        modelScores[key].count += 1;
      });

    const trueOveralls = Object.values(modelScores).map((m) => ({
      ...m,
      avgScore: (m.total / m.count).toFixed(2),
    }));

    const maxes: Record<string, (typeof trueOveralls)[0]> = {};
    trueOveralls.forEach((m) => {
      if (!maxes[m.Provider] || parseFloat(m.avgScore) > parseFloat(maxes[m.Provider].avgScore)) {
        maxes[m.Provider] = m;
      }
    });

    const result = Object.values(maxes).map((m) => ({
      provider: m.Provider,
      model: m.Gen_Model,
      promptLabel: m.System_Prompt_Label,
      score: parseFloat(m.avgScore),
      fill: COLORS[m.Provider],
    }));

    return result.sort((a, b) => b.score - a.score);
  }, [data]);

  const promptDelta = useMemo(() => {
    const overallScores = data.filter(
      (d) => d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Overall"
    );

    const models = Array.from(new Set(overallScores.map((d) => d.Gen_Model)));

    return models
      .reduce<Array<{ model: string; provider: string; v1: number; baseline: number }>>((acc, model) => {
        const v1Scores = overallScores.filter(
          (d) => d.Gen_Model === model && d.System_Prompt_Label === "v1_0"
        );
        const baselineScores = overallScores.filter(
          (d) => d.Gen_Model === model && d.System_Prompt_Label === "baseline"
        );

        if (v1Scores.length === 0 || baselineScores.length === 0) return acc;

        const v1Avg = v1Scores.reduce((sum, d) => sum + d.value, 0) / v1Scores.length;
        const baselineAvg = baselineScores.reduce((sum, d) => sum + d.value, 0) / baselineScores.length;

        acc.push({
          model: model
            .replace("-preview-09-2025", "")
            .replace("-preview", "")
            .replace("-reasoning", "")
            .replace("-20251001", ""),
          provider: v1Scores[0].Provider,
          v1: parseFloat(v1Avg.toFixed(2)),
          baseline: parseFloat(baselineAvg.toFixed(2)),
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
    const scoresByKey: Record<
      string,
      { Gen_Model: string; System_Prompt_Label: string; total: number; count: number }
    > = {};

    data
      .filter((d) => d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Overall")
      .forEach((d) => {
        const key = `${d.Gen_Model}-${d.System_Prompt_Label}`;
        if (!scoresByKey[key]) {
          scoresByKey[key] = { Gen_Model: d.Gen_Model, System_Prompt_Label: d.System_Prompt_Label, total: 0, count: 0 };
        }
        scoresByKey[key].total += d.value;
        scoresByKey[key].count += 1;
      });

    const allScores = Object.values(scoresByKey).map((s) => ({
      model: s.Gen_Model,
      prompt: s.System_Prompt_Label,
      score: s.total / s.count,
    }));

    const models = Array.from(new Set(allScores.map((s) => s.model)));
    let maxDelta = -1;
    let bestRecord: BestImprovementRecord | null = null;

    models.forEach((m) => {
      const baseline = allScores.find((s) => s.model === m && s.prompt === "baseline");
      const v1 = allScores.find((s) => s.model === m && s.prompt === "v1_0");

      if (baseline && v1) {
        const delta = ((v1.score - baseline.score) / baseline.score) * 100;
        if (delta > maxDelta) {
          maxDelta = delta;
          bestRecord = {
            model: m.replace("-preview-09-2025", "").replace("-reasoning", ""),
            delta: delta.toFixed(0),
            baselineLabel: "baseline",
            v1Label: "v1_0",
          };
        }
      }
    });

    return bestRecord;
  }, [data]);

  const judgeComparison = useMemo(() => {
    const models = Array.from(new Set(data.map((d) => d.Gen_Model)));

    const comparisonData = models.reduce<JudgeComparisonEntry[]>((acc, model) => {
      const gptJudgeScores = data.filter(
        (d) => d.Gen_Model === model && d.Judge_Model === "gpt-5-mini" && d.System_Prompt_Label === "v1_0" && d.subCriterion === "Overall"
      );
      const geminiJudgeScores = data.filter(
        (d) =>
          d.Gen_Model === model && d.Judge_Model === "gemini-2.5-flash-preview-09-2025" && d.System_Prompt_Label === "v1_0" && d.subCriterion === "Overall"
      );
      const claudeJudgeScores = data.filter(
        (d) =>
          d.Gen_Model === model && d.Judge_Model === "claude-haiku-4-5-20251001" && d.System_Prompt_Label === "v1_0" && d.subCriterion === "Overall"
      );

      // Require at least two judges to include the model
      const hasGpt = gptJudgeScores.length > 0;
      const hasGemini = geminiJudgeScores.length > 0;
      const hasClaude = claudeJudgeScores.length > 0;
      if ([hasGpt, hasGemini, hasClaude].filter(Boolean).length < 2) return acc;

      const avg = (scores: typeof gptJudgeScores) =>
        scores.length > 0
          ? parseFloat((scores.reduce((sum, curr) => sum + curr.value, 0) / scores.length).toFixed(2))
          : 0;

      acc.push({
        model: model.replace("-preview-09-2025", "").replace("-reasoning", "").replace("-20251001", ""),
        gptJudge: avg(gptJudgeScores),
        geminiJudge: avg(geminiJudgeScores),
        claudeJudge: avg(claudeJudgeScores),
      });

      return acc;
    }, []);

    return comparisonData;
  }, [data]);

  const providerSpread = useMemo(() => {
    const modelScores: Record<string, { Provider: string; Gen_Model: string; total: number; count: number }> = {};
    data
      .filter((d) => d.Judge_Model === "gpt-5-mini" && d.System_Prompt_Label === "v1_0" && d.subCriterion === "Overall")
      .forEach((d) => {
        if (!modelScores[d.id]) {
          modelScores[d.id] = { Provider: d.Provider, Gen_Model: d.Gen_Model, total: 0, count: 0 };
        }
        modelScores[d.id].total += d.value;
        modelScores[d.id].count += 1;
      });

    const scores = Object.values(modelScores).map((m) => ({
      provider: m.Provider,
      model: m.Gen_Model,
      score: m.total / m.count,
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

  const radarData = useMemo(() => {
    const criteria = ["Adherence", "Kindness_and_Gentleness", "Interfaith_Sensitivity"];
    const bestIds = bestPerProvider
      .map((b) => {
        const match = data.find(
          (d) => d.Gen_Model === b.model && d.System_Prompt_Label === "v1_0" && d.Judge_Model === "gpt-5-mini"
        );
        return match ? match.id : null;
      })
      .filter(Boolean);

    return criteria.map((crit) => {
      const entry: Record<string, string | number> = { subject: crit.replace(/_/g, " ") };
      bestIds.forEach((id) => {
        if (!id) return;
        const val = data.find((d) => d.id === id && d.criterion === crit && d.subCriterion === "Overall");
        if (val) {
          entry[val.Provider] = val.value;
        }
      });
      return entry;
    });
  }, [bestPerProvider, data]);

  return {
    bestPerProvider,
    promptDelta,
    bestImprovement,
    judgeComparison,
    providerSpread,
    radarData,
  };
}
