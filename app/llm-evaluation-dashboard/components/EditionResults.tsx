"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { METRIC_DEFINITIONS, type MetricKey } from "../evaluation-metrics";
import { formatModelLabel } from "../constants";
import {
  scoreRangeLabel,
  type DashboardMetrics,
} from "../hooks/use-dashboard-metrics";

export function EditionResults({ metrics }: { metrics: DashboardMetrics }) {
  const [metricKey, setMetricKey] = useState<MetricKey>("finalOverall");
  const { edition, activeAnswers, incompleteAnswers } = metrics;
  const isPanel = edition.judges.length > 1;
  const ranked = [...activeAnswers].sort(
    (a, b) =>
      b.scores[metricKey].mean - a.scores[metricKey].mean ||
      a.genModel.localeCompare(b.genModel),
  );
  const totalWeight = edition.judges.reduce(
    (sum, judge) => sum + judge.weight,
    0,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>All models and judge scores</CardTitle>
          <p className="text-sm text-muted-foreground">
            Inspect each criterion and judge. The headline charts use Final
            Overall. Scores are calculated from rounded published means; small
            gaps do not establish a decisive winner.
          </p>
          <div className="max-w-sm pt-2">
            <label
              htmlFor="score-detail-metric"
              className="mb-1 block text-sm font-medium"
            >
              Detail metric
            </label>
            <Select
              value={metricKey}
              onValueChange={(value) => setMetricKey(value as MetricKey)}
            >
              <SelectTrigger id="score-detail-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_DEFINITIONS.map((metric) => (
                  <SelectItem key={metric.key} value={metric.key}>
                    {metric.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Answer model</TableHead>
                <TableHead className="text-right">
                  {isPanel ? "Panel mean" : "Mean"}
                </TableHead>
                {edition.judges.map((judge) => (
                  <TableHead key={judge.model} className="text-right">
                    {formatModelLabel(judge.model)}
                    <span className="block text-xs">
                      {((judge.weight / totalWeight) * 100).toFixed(1)}% weight
                    </span>
                  </TableHead>
                ))}
                <TableHead className="text-right">
                  {isPanel ? "Judge range" : "Population SD"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((answer) => (
                <TableRow key={answer.answersLabel}>
                  <TableCell className="font-medium">
                    {formatModelLabel(answer.genModel)}
                    {answer.runs.some((run) => run.errorCount > 0) && (
                      <span className="block text-xs text-muted-foreground">
                        Partial run · {answer.runs[0].questionCount} scored
                        questions
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {answer.scores[metricKey].mean.toFixed(3)}
                  </TableCell>
                  {edition.judges.map((judge) => (
                    <TableCell
                      key={judge.model}
                      className="text-right tabular-nums"
                    >
                      {answer.runs
                        .find((run) => run.judgeModel === judge.model)!
                        .scores[metricKey].mean.toFixed(2)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">
                    {isPanel
                      ? scoreRangeLabel(answer, metricKey)
                      : answer.scores[metricKey].stdev?.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              {ranked.length === 0 && (
                <TableRow>
                  <TableCell colSpan={edition.judges.length + 3}>
                    No complete scores for this edition and prompt.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            {isPanel
              ? "Judge range is the lowest to highest judge mean. It is not a confidence interval, and the original run standard deviations are not averaged."
              : "Population SD describes dispersion within the recorded run. It is not a confidence interval."}
          </p>
        </CardContent>
      </Card>

      {incompleteAnswers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Missing coverage · {incompleteAnswers.length} models
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These answer sets remain available in the dataset, but cannot
              enter this edition&apos;s ranking until every required judgment is
              present and comparable.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Answer model</TableHead>
                  <TableHead>Judges present</TableHead>
                  <TableHead>Still needed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incompleteAnswers.map((entry) => (
                  <TableRow key={entry.answersLabel}>
                    <TableCell className="font-medium">
                      {formatModelLabel(entry.genModel)}
                    </TableCell>
                    <TableCell>
                      {entry.presentJudgeCount}/{edition.judges.length}
                    </TableCell>
                    <TableCell>
                      {entry.missingJudges.map(formatModelLabel).join(", ")}
                      {entry.issues.length > 0 && (
                        <span className="block">{entry.issues.join(". ")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isPanel && activeAnswers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Does the leading model depend on the judges?</CardTitle>
            <p className="text-sm text-muted-foreground">
              Remove one judge from every model, keep the same{" "}
              {activeAnswers.length} answer sets, and redistribute weight among
              the remaining judges. These are sensitivity checks, not additional
              scoring editions.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Judge omitted</TableHead>
                  <TableHead>Highest mean</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {edition.judges.map((omitted) => {
                  const remaining = edition.judges.filter(
                    (judge) => judge.model !== omitted.model,
                  );
                  const remainingWeight = remaining.reduce(
                    (sum, judge) => sum + judge.weight,
                    0,
                  );
                  const scores = activeAnswers
                    .map((answer) => ({
                      model: answer.genModel,
                      mean: remaining.reduce(
                        (sum, judge) =>
                          sum +
                          (answer.runs.find(
                            (run) => run.judgeModel === judge.model,
                          )!.scores.finalOverall.mean *
                            judge.weight) /
                            remainingWeight,
                        0,
                      ),
                    }))
                    .sort((a, b) => b.mean - a.mean);
                  const leaders = scores.filter(
                    (score) => Math.abs(score.mean - scores[0].mean) < 1e-10,
                  );
                  return (
                    <TableRow key={omitted.model}>
                      <TableCell>{formatModelLabel(omitted.model)}</TableCell>
                      <TableCell>
                        {leaders
                          .map((leader) => formatModelLabel(leader.model))
                          .join(" / ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {scores[0].mean.toFixed(3)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
