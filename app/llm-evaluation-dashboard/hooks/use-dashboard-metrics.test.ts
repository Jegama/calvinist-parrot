import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildDashboardMetrics } from "./use-dashboard-metrics";
import { parseEvaluationRuns } from "../lib";
import {
  DEFAULT_EDITION_ID,
  HISTORICAL_EDITION_ID,
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

  it("reconciles the master CSV against the complete November panel and retains the recorded penalties", () => {
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
      metrics.edition.judges.every(({ model }) =>
        context.some(
          (run) =>
            run.answersLabel === label &&
            run.judgeModel === model &&
            run.questionCount === 500,
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
    const flashLite = metrics.activeAnswers.find(
      (answer) => answer.answersLabel === "google-gemini-3.5-flash-lite-v1_4",
    )!;
    for (const run of flashLite.runs) {
      expect(run.questionCount).toBe(500);
      expect(run.generationFailureCount).toBe(1);
    }
    expect(flashLite.scores.finalOverall.mean).toBeCloseTo(
      (3.6 + 4.07 + 3.51) / 3, 12,
    );
    const october = buildDashboardMetrics(runs, "three-family-2026-10");
    const octoberFlashLite = october.activeAnswers.find(
      (answer) => answer.answersLabel === flashLite.answersLabel,
    )!;
    expect(octoberFlashLite.scores.finalOverall.mean).toBeCloseTo(
      (3.6 + 4.54 + 3.51) / 3, 12,
    );

    const historical = buildDashboardMetrics(runs, HISTORICAL_EDITION_ID);
    for (const answer of historical.activeAnswers)
      expect(answer.scores.finalOverall.mean).toBe(
        answer.runs[0].scores.finalOverall.mean,
      );
  });

  it.each([
    ["three-family-2026-11", 4, "gemini-4-hydrogen"],
    ["three-family-2026-10", 3, "gemini-3.8-flash"],
  ] as const)(
    "uses %s for the same saved answers in every view",
    (id, expected, googleJudge) => {
      const metrics = buildDashboardMetrics(
        [
          ...panelRuns("answer-model", [3, 4, 5]),
          fixtureRun("answer-model", "gemini-3.8-flash", 1),
        ],
        id,
      );
      const [answer] = metrics.activeAnswers;
      expect(answer.runs.map((run) => run.judgeModel)).toEqual([
        "gpt-6-luna", googleJudge, "claude-haiku-5-5",
      ]);
      for (const score of Object.values(answer.scores)) {
        expect(score.mean).toBeCloseTo(expected, 12);
      }
      expect(metrics.narrativeStats?.winnerScore).toBeCloseTo(expected, 12);
      expect(metrics.bestPerProvider[0].score).toBeCloseTo(expected, 12);
      expect(metrics.providerSpread[0].runs[0].score).toBeCloseTo(expected, 12);
      const [category] = metrics.categoryScoresByModel;
      for (const score of [category.adherence, category.kindness, category.interfaith]) {
        expect(score).toBeCloseTo(expected, 12);
      }
      const radars = [metrics.radarAdherence, metrics.radarKindness, metrics.radarInterfaith];
      for (const point of radars.flat()) {
        expect(point.google).toBeCloseTo(expected, 12);
      }
    },
  );

  it("includes recovered Grok evaluations consistently across the main table, charts, and coverage", () => {
    const grok = panelRuns("grok-4.3", [3.51, 4.2, 3.37], { provider: "xai" });
    grok[1].errorCount = 1;
    const metrics = buildDashboardMetrics(grok);
    expect(metrics.activeAnswers[0].genModel).toBe("grok-4.3");
    expect(metrics.incompleteAnswers).toEqual([]);
    expect(metrics.categoryScoresByModel[0].model).toBe("grok-4.3");
    expect(metrics.providerSpread[0].modelCount).toBe(1);
    expect(metrics.radarAdherence[0].xai).toBeCloseTo(3.6933333333333334);
    expect(metrics.questionCountSummary).toEqual({
      min: 500,
      max: 500,
      totalErrors: 1,
    });
  });
});
