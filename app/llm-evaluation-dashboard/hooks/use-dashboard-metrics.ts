import { useMemo } from "react";
import { COLORS, PROVIDER_LABELS } from "../constants";
import type { EvaluationRecord } from "../lib";

export interface BestImprovementRecord {
  model: string;
  delta: string;
  baselineLabel: string;
  v1Label: string;
}

type JudgeComparisonEntry = { model: string; gptJudge: number; geminiJudge: number };

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
    const modelMapping = {
      google: "gemini-2.5-flash-preview-09-2025",
      xai: "grok-4-1-fast-reasoning",
      openai: "gpt-5-mini",
    };

    return Object.entries(modelMapping).map(([provider, genModel]) => {
      const calcAvg = (gm: string, prompt: string) => {
        const scores = data.filter(
          (d) =>
            d.Judge_Model === "gpt-5-mini" &&
            d.Gen_Model === gm &&
            d.System_Prompt_Label === prompt &&
            d.subCriterion === "Overall"
        );
        if (scores.length === 0) return 0;
        const total = scores.reduce((sum, curr) => sum + curr.value, 0);
        return (total / scores.length).toFixed(2);
      };

      return {
        provider,
        v1: parseFloat(calcAvg(genModel, "v1_0") as string),
        baseline: parseFloat(calcAvg(genModel, "baseline") as string),
      };
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
        (d) => d.Gen_Model === model && d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Overall"
      );
      const geminiJudgeScores = data.filter(
        (d) =>
          d.Gen_Model === model && d.Judge_Model === "gemini-2.5-flash-preview-09-2025" && d.subCriterion === "Overall"
      );

      if (gptJudgeScores.length === 0 || geminiJudgeScores.length === 0) return acc;

      const gptAvg = gptJudgeScores.reduce((accum, curr) => accum + curr.value, 0) / gptJudgeScores.length;
      const geminiAvg = geminiJudgeScores.reduce((accum, curr) => accum + curr.value, 0) / geminiJudgeScores.length;

      acc.push({
        model: model.replace("-preview-09-2025", "").replace("-reasoning", ""),
        gptJudge: parseFloat(gptAvg.toFixed(2)),
        geminiJudge: parseFloat(geminiAvg.toFixed(2)),
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

    const result = ["google", "openai", "xai"]
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
