import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import {
  METRIC_DEFINITIONS,
  type EvaluationRun,
  type MetricKey,
  type ScoreSummary,
} from "./evaluation-metrics";

export {
  METRIC_DEFINITIONS,
  getMetricDefinition,
} from "./evaluation-metrics";
export type {
  EvaluationRun,
  MetricDefinition,
  MetricGroup,
  MetricKey,
  ScoreSummary,
} from "./evaluation-metrics";

const METADATA_COLUMNS = [
  "run_id",
  "answers_label",
  "provider",
  "gen_model",
  "system_prompt_label",
  "judge_model",
  "eval_version",
  "evaluated_at",
  "timestamp_source",
  "question_count",
  "error_count",
  "source_dataset",
  "source_results",
] as const;

export const REQUIRED_MASTER_COLUMNS = [
  ...METADATA_COLUMNS,
  ...METRIC_DEFINITIONS.flatMap((metric) => [metric.meanColumn, metric.stdevColumn]),
];

function requireText(row: Record<string, string>, column: string, rowNumber: number): string {
  const value = row[column]?.trim();
  if (!value) {
    throw new Error(`Master CSV row ${rowNumber} is missing ${column}.`);
  }
  return value;
}

function parseFiniteNumber(
  row: Record<string, string>,
  column: string,
  rowNumber: number
): number {
  const raw = requireText(row, column, rowNumber);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Master CSV row ${rowNumber} has an invalid ${column}: ${raw}.`);
  }
  return value;
}

function parseCount(row: Record<string, string>, column: string, rowNumber: number): number {
  const value = parseFiniteNumber(row, column, rowNumber);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Master CSV row ${rowNumber} requires a non-negative integer ${column}.`);
  }
  return value;
}

export function parseEvaluationRuns(csv: string): EvaluationRun[] {
  const rows = parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  if (rows.length === 0) {
    throw new Error("Master CSV contains no evaluation runs.");
  }

  const headers = new Set(Object.keys(rows[0]));
  const missingColumns = REQUIRED_MASTER_COLUMNS.filter((column) => !headers.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`Master CSV is missing required columns: ${missingColumns.join(", ")}.`);
  }

  const runs = rows.map<EvaluationRun>((row, index) => {
    const rowNumber = index + 2;
    const evaluatedAt = requireText(row, "evaluated_at", rowNumber);
    if (Number.isNaN(Date.parse(evaluatedAt))) {
      throw new Error(`Master CSV row ${rowNumber} has an invalid evaluated_at timestamp.`);
    }

    const scoreEntries = METRIC_DEFINITIONS.map((metric) => {
      const mean = parseFiniteNumber(row, metric.meanColumn, rowNumber);
      const stdev = parseFiniteNumber(row, metric.stdevColumn, rowNumber);
      if (mean < 1 || mean > 5) {
        throw new Error(
          `Master CSV row ${rowNumber} has ${metric.meanColumn} outside the 1–5 scale.`
        );
      }
      if (stdev < 0) {
        throw new Error(`Master CSV row ${rowNumber} has a negative ${metric.stdevColumn}.`);
      }
      return [metric.key, { mean, stdev }] as const;
    });

    return {
      runId: requireText(row, "run_id", rowNumber),
      answersLabel: requireText(row, "answers_label", rowNumber),
      provider: requireText(row, "provider", rowNumber),
      genModel: requireText(row, "gen_model", rowNumber),
      systemPromptLabel: requireText(row, "system_prompt_label", rowNumber),
      judgeModel: requireText(row, "judge_model", rowNumber),
      evalVersion: requireText(row, "eval_version", rowNumber),
      evaluatedAt,
      timestampSource: requireText(row, "timestamp_source", rowNumber),
      questionCount: parseCount(row, "question_count", rowNumber),
      errorCount: parseCount(row, "error_count", rowNumber),
      sourceDataset: requireText(row, "source_dataset", rowNumber),
      sourceResults: requireText(row, "source_results", rowNumber),
      scores: Object.fromEntries(scoreEntries) as Record<MetricKey, ScoreSummary>,
    };
  });

  const runIds = new Set<string>();
  const judgeIdentities = new Set<string>();
  runs.forEach((run) => {
    if (runIds.has(run.runId)) {
      throw new Error(`Master CSV contains duplicate run_id ${run.runId}.`);
    }
    runIds.add(run.runId);

    const identity = `${run.answersLabel}|${run.judgeModel}|${run.evalVersion}`;
    if (judgeIdentities.has(identity)) {
      throw new Error(`Master CSV contains duplicate judge run identity ${identity}.`);
    }
    judgeIdentities.add(identity);
  });

  return runs;
}

export async function getEvaluationData(): Promise<EvaluationRun[]> {
  const filePath = path.join(process.cwd(), "content/data/api_evals_master.csv");
  const fileContent = await fs.promises.readFile(filePath, "utf-8");
  return parseEvaluationRuns(fileContent);
}
