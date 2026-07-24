import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildJudgePairAnalysis } from "./judge-analysis";
import { parseEvaluationRuns } from "./lib";

const runs = parseEvaluationRuns(
  fs.readFileSync(
    path.join(process.cwd(), "content/data/api_evals_master.csv"),
    "utf8"
  )
);

describe("paired judge analysis", () => {
  it("measures Luna against the primary judge on shared answer sets only", () => {
    const analysis = buildJudgePairAnalysis(runs, {
      primaryJudge: "gpt-5-mini",
      comparisonJudge: "gpt-5.6-luna",
      promptLabel: "v1_4",
      metricKey: "finalOverall",
    });

    expect(analysis.sharedRunCount).toBe(8);
    expect(analysis.points).toHaveLength(8);
    expect(analysis.comparisonLowerCount).toBe(8);
    expect(analysis.comparisonHigherCount).toBe(0);
    expect(analysis.meanDifference).toBeCloseTo(-0.3275, 4);
    expect(analysis.pearson).toBeCloseTo(0.8923, 4);
    expect(analysis.spearman).toBeCloseTo(0.7425, 4);
    expect(analysis.primaryAverageStdev).toBeCloseTo(0.2425, 4);
    expect(analysis.comparisonAverageStdev).toBeCloseTo(0.3325, 4);
    expect(analysis.evidenceStatus).toBe("developing");
  });

  it("does not invent zeroes for unpaired coverage", () => {
    const analysis = buildJudgePairAnalysis(runs, {
      primaryJudge: "gpt-5-mini",
      comparisonJudge: "gpt-5.4-mini",
      promptLabel: "v1_4",
      metricKey: "finalOverall",
    });

    expect(analysis.sharedRunCount).toBe(5);
    expect(analysis.points.every((point) => point.primaryMean > 0)).toBe(true);
    expect(analysis.points.every((point) => point.comparisonMean > 0)).toBe(true);
  });
});
