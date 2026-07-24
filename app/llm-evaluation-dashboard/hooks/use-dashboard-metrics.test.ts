import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildDashboardMetrics } from "./use-dashboard-metrics";
import { parseEvaluationRuns } from "../lib";

const runs = parseEvaluationRuns(
  fs.readFileSync(
    path.join(process.cwd(), "content/data/api_evals_master.csv"),
    "utf8"
  )
);

describe("dashboard metrics", () => {
  it("keeps the configured primary judge and Final Overall ranking semantics", () => {
    const metrics = buildDashboardMetrics(runs);

    expect(metrics.activePromptLabel).toBe("v1_4");
    expect(metrics.primaryJudge?.model).toBe("gpt-5-mini");
    expect(metrics.narrativeStats?.modelCount).toBe(12);
    expect(metrics.bestPerProvider.find((entry) => entry.provider === "xai")?.model).toBe(
      "grok-4.5"
    );
    expect(metrics.questionCountSummary).toEqual({
      min: 499,
      max: 500,
      totalErrors: 3,
    });
  });

  it("does not choose a primary judge by row count", () => {
    const candidateRun = runs.find((run) => run.judgeModel === "gpt-5.6-luna")!;
    const expandedRuns = [
      ...runs,
      ...Array.from({ length: 30 }, (_, index) => ({
        ...candidateRun,
        runId: `synthetic-luna-${index}`,
        answersLabel: `synthetic-luna-answer-${index}`,
      })),
    ];

    expect(buildDashboardMetrics(expandedRuns).primaryJudge?.model).toBe("gpt-5-mini");
  });
});
