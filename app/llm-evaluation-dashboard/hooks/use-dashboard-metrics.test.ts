import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildDashboardMetrics } from "./use-dashboard-metrics";
import { parseEvaluationRuns } from "../lib";
import {
  DEFAULT_EDITION_ID,
  HISTORICAL_EDITION_ID,
  SCORING_EDITIONS,
} from "../scoring-editions";
import { fixtureRun, panelRuns } from "../test-fixtures";

describe("dashboard metrics", () => {
  it("uses one edition consistently across rankings, provider range, categories, and radar", () => {
    const data = [
      ...panelRuns("model-a", [3, 4, 5]),
      ...panelRuns("model-b", [3.8, 3.9, 4]),
      ...panelRuns("model-c", [4.1, 4.2, 4.3], { provider: "openai" }),
      ...panelRuns("incomplete", [5, 5, 5]).slice(0, 2),
      fixtureRun("unrelated", "gpt-5-mini", 5),
    ];
    const metrics = buildDashboardMetrics(data);
    expect(metrics.edition.id).toBe(DEFAULT_EDITION_ID);
    expect(metrics.activeAnswers.map((answer) => answer.genModel)).toEqual([
      "model-c",
      "model-a",
      "model-b",
    ]);
    expect(metrics.bestPerProvider.map((answer) => answer.model)).toEqual([
      "model-c",
      "model-a",
    ]);
    expect(
      metrics.categoryScoresByModel.find((answer) => answer.model === "model-a")
        ?.adherence,
    ).toBeCloseTo(4, 12);
    expect(metrics.radarAdherence[0].google).toBeCloseTo(4, 12);
    const google = metrics.providerSpread.find(
      (provider) => provider.provider === "google",
    )!;
    expect(google.min).toBeCloseTo(3.9);
    expect(google.max).toBeCloseTo(4, 12);
    expect(google.runCount).toBe(2);
    expect(metrics.incompleteAnswers).toHaveLength(2);
    expect(metrics.questionCountSummary).toEqual({
      min: 500,
      max: 500,
      totalErrors: 0,
    });
  });

  it("sorts on calculated precision before rounding display values", () => {
    const metrics = buildDashboardMetrics([
      ...panelRuns("a", [4, 4, 4]),
      ...panelRuns("z", [4, 4, 4.001]),
    ]);
    expect(metrics.activeAnswers[0].genModel).toBe("z");
  });

  it("retains historical prompt comparisons without borrowing their baselines for the new panel", () => {
    const data = [
      ...panelRuns("model", [3, 4, 5]),
      fixtureRun("model", "gpt-5-mini", 4.2),
      fixtureRun("model", "gpt-5-mini", 3.5, {
        answersLabel: "model-baseline",
        systemPromptLabel: "baseline",
      }),
      fixtureRun("other", "gpt-5-mini", 4, {
        answersLabel: "other-v1_0",
        systemPromptLabel: "v1_0",
      }),
    ];
    expect(buildDashboardMetrics(data).promptDelta).toEqual([]);
    const historical = buildDashboardMetrics(data, HISTORICAL_EDITION_ID);
    expect(historical.promptDelta).toHaveLength(1);
    expect(historical.promptDelta[0].deltaPoints).toBeCloseTo(0.7);
    expect(historical.promptDelta[0].scores).toEqual({
      baseline: 3.5,
      v1_4: 4.2,
    });
    expect(historical.promptDelta[0].scores.v1_0).toBeUndefined();
    expect(
      buildDashboardMetrics(data, DEFAULT_EDITION_ID, "baseline")
        .narrativeStats,
    ).toBeNull();
  });

  it("handles an empty dataset without inventing a winner", () => {
    const metrics = buildDashboardMetrics([]);
    expect(metrics.activePromptLabel).toBeNull();
    expect(metrics.narrativeStats).toBeNull();
    expect(metrics.bestPerProvider).toEqual([]);
  });

  it("reconciles the current master CSV against the fixed panel's complete intersection", () => {
    const runs = parseEvaluationRuns(
      fs.readFileSync(
        path.join(process.cwd(), "content/data/api_evals_master.csv"),
        "utf8",
      ),
    );
    const metrics = buildDashboardMetrics(runs);
    const context = runs.filter(
      (run) =>
        run.evalVersion === metrics.edition.evalVersion &&
        run.systemPromptLabel === metrics.activePromptLabel,
    );
    const expected = [
      ...new Set(context.map((run) => run.answersLabel)),
    ].filter((label) =>
      SCORING_EDITIONS[0].judges.every(({ model }) =>
        context.some(
          (run) =>
            run.answersLabel === label &&
            run.judgeModel === model &&
            run.questionCount === 500 &&
            run.errorCount === 0,
        ),
      ),
    );
    expect(
      metrics.activeAnswers.map((answer) => answer.answersLabel).sort(),
    ).toEqual(expected.sort());
    expect(metrics.activeAnswers.length).toBeGreaterThan(0);
    for (const answer of metrics.activeAnswers) {
      expect(answer.scores.finalOverall.mean).toBeCloseTo(
        answer.runs.reduce(
          (sum, run) => sum + run.scores.finalOverall.mean,
          0,
        ) / 3,
        12,
      );
    }
    const historical = buildDashboardMetrics(runs, HISTORICAL_EDITION_ID);
    for (const answer of historical.activeAnswers)
      expect(answer.scores.finalOverall.mean).toBe(
        answer.runs[0].scores.finalOverall.mean,
      );
  });
});
