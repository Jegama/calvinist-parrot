import { describe, expect, it } from "vitest";
import { METRIC_DEFINITIONS } from "./evaluation-metrics";
import {
  buildEditionScores,
  getScoringEdition,
  HISTORICAL_EDITION_ID,
  SCORING_EDITIONS,
} from "./scoring-editions";
import { fixtureRun, panelRuns } from "./test-fixtures";

const edition = SCORING_EDITIONS[0];

describe("versioned scoring editions", () => {
  it("uses fixed weights for all metrics, retaining the judge range without averaging SDs", () => {
    const data = panelRuns("model", [3, 4, 5]);
    const original = structuredClone(data);
    const { answers } = buildEditionScores(data, edition);
    for (const { key } of METRIC_DEFINITIONS) {
      expect(answers[0].scores[key].mean).toBeCloseTo(4, 12);
      expect(answers[0].scores[key]).toMatchObject({
        min: 3,
        max: 5,
        stdev: null,
      });
    }
    const weighted = {
      ...edition,
      judges: edition.judges.map((judge, index) => ({
        ...judge,
        weight: index === 2 ? 2 : 1,
      })),
    };
    expect(
      buildEditionScores(data, weighted).answers[0].scores.finalOverall.mean,
    ).toBe(4.25);
    expect(data).toEqual(original);
  });

  it("does not substitute another judge, a different rubric, or a partial panel", () => {
    const partial = panelRuns("model", [3, 4, 5]).slice(0, 2);
    const { answers, coverage } = buildEditionScores(
      [
        ...partial,
        fixtureRun("model", "gpt-5-mini", 5),
        fixtureRun("model", "claude-haiku-5-5", 5, { evalVersion: "v3" }),
      ],
      edition,
    );
    expect(answers).toEqual([]);
    expect(coverage[0].missingJudges).toEqual(["claude-haiku-5-5"]);
    expect(coverage[0].presentJudgeCount).toBe(2);
  });

  it.each(SCORING_EDITIONS)(
    "ignores unrelated judges' metadata in $id regardless of row order",
    (selectedEdition) => {
      const runs = selectedEdition.judges.map((judge, index) =>
        fixtureRun("model", judge.model, 3 + index / 2, {
          questionCount: selectedEdition.judges.length === 1 ? 499 : 500,
        }),
      );
      const unrelated = fixtureRun("model", "unselected-judge", 5, {
        sourceDataset: "different.jsonl",
        genModel: "different-model",
        provider: "openai",
        systemPromptLabel: "baseline",
      });
      const expected = buildEditionScores(runs, selectedEdition);
      expect(expected.answers).toHaveLength(1);
      expect(expected.coverage[0].complete).toBe(true);

      for (const data of [[unrelated, ...runs], [...runs, unrelated]]) {
        expect(buildEditionScores(data, selectedEdition)).toEqual(expected);
      }
    },
  );

  it("retains missing-judge coverage when no edition judge has a run", () => {
    const run = fixtureRun("model", "unselected-judge", 5);
    const { answers, coverage } = buildEditionScores([run], edition);

    expect(answers).toEqual([]);
    expect(coverage).toEqual([
      {
        answersLabel: run.answersLabel,
        genModel: run.genModel,
        provider: run.provider,
        systemPromptLabel: run.systemPromptLabel,
        missingJudges: edition.judges.map((judge) => judge.model),
        issues: [],
        presentJudgeCount: 0,
        complete: false,
      },
    ]);
  });

  it.each([
    { questionCount: 499 },
    { questionCount: 499, errorCount: 1 },
    { sourceDataset: "different.jsonl" },
    { genModel: "different-model" },
    { provider: "openai" },
    { systemPromptLabel: "baseline" },
  ])("excludes noncomparable panel judgments: %j", (override) => {
    const data = panelRuns("model", [3, 4, 5]);
    data[2] = { ...data[2], ...override };
    const { answers, coverage } = buildEditionScores(data, edition);
    expect(answers).toHaveLength(0);
    expect(coverage[0].issues.length).toBeGreaterThan(0);
  });

  it("excludes duplicate judgments instead of choosing one arbitrarily", () => {
    const data = panelRuns("model", [3, 4, 5]);
    expect(
      buildEditionScores([...data, { ...data[0], runId: "duplicate" }], edition)
        .answers,
    ).toHaveLength(0);
  });

  it("includes complete runs with recovered failed attempts without discarding the error history", () => {
    const data = panelRuns("grok-4.3", [3.51, 4.2, 3.37], { provider: "xai" });
    data[1].errorCount = 1;
    const { answers, coverage } = buildEditionScores(data, edition);
    expect(coverage[0].complete).toBe(true);
    expect(answers[0].scores.finalOverall.mean).toBeCloseTo(3.6933333333333334);
    expect(answers[0].runs[1].errorCount).toBe(1);
  });

  it("allows a saved retired model to join once the missing current judge is added", () => {
    const data = panelRuns("gemini-3.7-flash", [3.9, 4.6, 3.7]);
    expect(buildEditionScores(data.slice(0, 2), edition).answers).toHaveLength(
      0,
    );
    expect(buildEditionScores(data, edition).answers[0].genModel).toBe(
      "gemini-3.7-flash",
    );
  });

  it("preserves historical single-judge scores, SDs, and recorded partial runs", () => {
    const run = fixtureRun("legacy", "gpt-5-mini", 4.13, {
      questionCount: 499,
      errorCount: 1,
    });
    const { answers } = buildEditionScores(
      [run],
      getScoringEdition(HISTORICAL_EDITION_ID),
    );
    expect(answers[0].scores.finalOverall).toEqual({
      mean: 4.13,
      min: 4.13,
      max: 4.13,
      stdev: 0.4,
    });
    expect(answers[0].runs[0]).toBe(run);
  });

  it("rejects invalid edition definitions and unknown edition IDs", () => {
    for (const judges of [
      [],
      [{ model: "a", weight: 0 }],
      [{ model: "a", weight: NaN }],
      [
        { model: "a", weight: 1 },
        { model: "a", weight: 1 },
      ],
    ]) {
      expect(() => buildEditionScores([], { ...edition, judges })).toThrow(
        /distinct judges/,
      );
    }
    expect(() => getScoringEdition("unrecorded-edition")).toThrow(
      /Unknown scoring edition/,
    );
  });
});
