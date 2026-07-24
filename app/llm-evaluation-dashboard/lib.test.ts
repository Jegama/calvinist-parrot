import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import {
  METRIC_DEFINITIONS,
  parseEvaluationRuns,
  type EvaluationRun,
} from "./lib";

const masterCsv = fs.readFileSync(
  path.join(process.cwd(), "content/data/api_evals_master.csv"),
  "utf8"
);

describe("vertical evaluation master CSV", () => {
  it("parses one validated object per judge run", () => {
    const runs = parseEvaluationRuns(masterCsv);

    expect(runs).toHaveLength(37);
    expect(new Set(runs.map((run) => run.runId)).size).toBe(37);
    expect(Object.keys(runs[0].scores)).toHaveLength(19);
    expect(runs.filter((run) => run.errorCount > 0)).toHaveLength(3);
    expect(runs.filter((run) => run.errorCount > 0).map((run) => run.questionCount)).toEqual([
      499, 499, 499,
    ]);
  });

  it("uses answers_label as the stable identity across judges", () => {
    const runs = parseEvaluationRuns(masterCsv);
    const answerRuns = runs.filter(
      (run) => run.answersLabel === "openai-gpt-5-mini-v1_4"
    );

    expect(new Set(answerRuns.map((run) => run.judgeModel))).toEqual(
      new Set(["gpt-5-mini", "gpt-5.4-mini", "gpt-5.6-luna"])
    );
    expect(new Set(answerRuns.map((run) => run.runId)).size).toBe(3);
  });

  it("rejects a missing required column", () => {
    const malformed = masterCsv.replace(
      "final_overall_stdev",
      "renamed_final_overall_stdev"
    );
    expect(() => parseEvaluationRuns(malformed)).toThrow(
      /missing required columns: final_overall_stdev/
    );
  });

  it("rejects duplicate judge-run identities", () => {
    const firstDataRow = masterCsv.trimEnd().split("\n")[1];
    expect(() => parseEvaluationRuns(`${masterCsv.trimEnd()}\n${firstDataRow}\n`)).toThrow(
      /duplicate run_id/
    );
  });
});

describe("historical reconciliation", () => {
  it("preserves all 450 published mean cells from the wide CSV", () => {
    const wideCsv = fs.readFileSync(
      path.join(process.cwd(), "content/data/api_evals_comparison.csv"),
      "utf8"
    );
    const rows = parse(wideCsv, { relax_column_count: true }) as string[][];
    const headers = rows[0].slice(2);
    const metricRows = rows.slice(1).filter((row) => row[0] !== "Meta");
    const metadata = new Map(
      rows
        .filter((row) => row[0] === "Meta")
        .map((row) => [row[1], row.slice(2)] as const)
    );
    const runs = parseEvaluationRuns(masterCsv);

    expect(headers).toHaveLength(25);
    expect(metricRows).toHaveLength(18);

    let reconciledCells = 0;
    headers.forEach((header, columnIndex) => {
      const answersLabel = header.replace(/-2$/, "");
      const judge = metadata.get("Judge_Model")?.[columnIndex];
      const evalVersion = metadata.get("Eval_version")?.[columnIndex];
      const run = runs.find(
        (candidate) =>
          candidate.answersLabel === answersLabel &&
          candidate.judgeModel === judge &&
          candidate.evalVersion === evalVersion
      );
      expect(run, `Missing master run for ${header}`).toBeDefined();

      metricRows.forEach((row) => {
        const definition = METRIC_DEFINITIONS.find(
          (metric) =>
            (metric.criterion === row[0] && metric.subCriterion === row[1]) ||
            (row[0] === "" &&
              row[1] === "Final_Overall" &&
              metric.key === "finalOverall")
        );
        expect(definition, `Missing metric mapping for ${row[0]}/${row[1]}`).toBeDefined();
        expect((run as EvaluationRun).scores[definition!.key].mean).toBe(
          Number(row[columnIndex + 2])
        );
        reconciledCells += 1;
      });
    });

    expect(reconciledCells).toBe(450);
  });
});
