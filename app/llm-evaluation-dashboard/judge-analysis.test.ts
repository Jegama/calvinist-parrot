import { describe, expect, it } from "vitest";
import {
  buildJudgePairAnalysis,
  pearsonCorrelation,
  spearmanCorrelation,
} from "./judge-analysis";
import { fixtureRun } from "./test-fixtures";

const selection = {
  primaryJudge: "a",
  comparisonJudge: "b",
  promptLabel: "v1_4",
  evalVersion: "v2",
  metricKey: "finalOverall",
} as const;

describe("paired judge analysis", () => {
  it("measures signed differences, absolute disagreement, and coverage on the same cohort", () => {
    const analysis = buildJudgePairAnalysis(
      [
        fixtureRun("one", "a", 3),
        fixtureRun("one", "b", 3.5),
        fixtureRun("two", "a", 4),
        fixtureRun("two", "b", 3.5),
        fixtureRun("three", "a", 5),
        fixtureRun("three", "b", 4),
        fixtureRun("unpaired", "c", 5),
      ],
      selection,
    );
    expect(analysis.sharedRunCount).toBe(3);
    expect(analysis.totalAnswerSetCount).toBe(4);
    expect(analysis.evidenceStatus).toBe("partial");
    expect(analysis.meanDifference).toBeCloseTo(-1 / 3);
    expect(analysis.meanAbsoluteDifference).toBeCloseTo(2 / 3);
    expect(analysis.spearman).toBeCloseTo(Math.sqrt(3) / 2);
    expect(analysis.comparisonLowerCount).toBe(2);
    expect(analysis.comparisonHigherCount).toBe(1);
  });

  it("does not compare incompatible rubric versions, answers, counts, or failed runs", () => {
    for (const overrides of [
      { evalVersion: "v3" },
      { sourceDataset: "other" },
      { questionCount: 499 },
      { errorCount: 1 },
    ]) {
      const analysis = buildJudgePairAnalysis(
        [fixtureRun("one", "a", 4), fixtureRun("one", "b", 3, overrides)],
        selection,
      );
      expect(analysis.sharedRunCount).toBe(0);
      expect(analysis.meanDifference).toBeNull();
      expect(analysis.pearson).toBeNull();
      expect(analysis.evidenceStatus).toBe("none");
    }
  });

  it("rejects duplicate judgments and comparisons with the same judge", () => {
    const data = [fixtureRun("one", "a", 4), fixtureRun("one", "b", 3)];
    expect(
      buildJudgePairAnalysis(
        [...data, { ...data[0], runId: "duplicate" }],
        selection,
      ).sharedRunCount,
    ).toBe(0);
    expect(
      buildJudgePairAnalysis(data, { ...selection, comparisonJudge: "a" })
        .sharedRunCount,
    ).toBe(0);
  });

  it("reports complete available coverage without treating it as validation or a fixed target", () => {
    const analysis = buildJudgePairAnalysis(
      [fixtureRun("one", "a", 4), fixtureRun("one", "b", 3)],
      selection,
    );
    expect(analysis.evidenceStatus).toBe("complete");
    expect(analysis.totalAnswerSetCount).toBe(1);
    expect(analysis.pearson).toBeNull();
  });

  it("handles tied ranks, constant scores, and missing observations", () => {
    expect(spearmanCorrelation([1, 2, 2, 3], [2, 3, 3, 4])).toBeCloseTo(1);
    expect(spearmanCorrelation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(pearsonCorrelation([1, 1], [2, 3])).toBeNull();
    expect(pearsonCorrelation([], [])).toBeNull();
  });
});
