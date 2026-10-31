"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatModelLabel,
  formatPromptLabel,
  getJudgeRole,
} from "../constants";
import { buildJudgePairAnalysis } from "../judge-analysis";
import {
  METRIC_DEFINITIONS,
  getMetricDefinition,
  type EvaluationRun,
  type MetricKey,
} from "../evaluation-metrics";
import { JudgeAgreementScatter } from "../charts/JudgeAgreementScatter";

interface JudgeAnalysisPanelProps {
  runs: EvaluationRun[];
  evalVersion: string;
  initialReference: string;
  activePromptLabel: string | null;
}

function statistic(value: number | null) {
  return value === null ? "N/A" : value.toFixed(3);
}
function difference(value: number | null) {
  return value === null ? "N/A" : `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}
function rank(value: number, values: number[]) {
  return (
    values.filter((candidate) => candidate > value).length +
    (values.filter((candidate) => candidate === value).length + 1) / 2
  );
}

export function JudgeAnalysisPanel({
  runs,
  evalVersion,
  initialReference,
  activePromptLabel,
}: JudgeAnalysisPanelProps) {
  const judges = useMemo(
    () =>
      [
        ...new Set(
          runs
            .filter((run) => run.evalVersion === evalVersion)
            .map((run) => run.judgeModel),
        ),
      ].sort(
        (a, b) =>
          getJudgeRole(a).order - getJudgeRole(b).order || a.localeCompare(b),
      ),
    [runs, evalVersion],
  );
  const [requestedReference, setRequestedReference] =
    useState(initialReference);
  const [requestedComparison, setRequestedComparison] =
    useState("gemini-3.8-flash");
  const [metricKey, setMetricKey] = useState<MetricKey>("finalOverall");
  const reference = judges.includes(requestedReference)
    ? requestedReference
    : (judges[0] ?? "");
  const comparisons = judges.filter((judge) => judge !== reference);
  const comparison = comparisons.includes(requestedComparison)
    ? requestedComparison
    : (comparisons[0] ?? "");
  const analyses = METRIC_DEFINITIONS.map(({ key }) =>
    buildJudgePairAnalysis(runs, {
      primaryJudge: reference,
      comparisonJudge: comparison,
      promptLabel: activePromptLabel ?? "",
      evalVersion,
      metricKey: key,
    }),
  );
  const analysis = analyses.find((entry) => entry.metricKey === metricKey)!;
  const largestDifference = analyses
    .filter(
      (entry) =>
        getMetricDefinition(entry.metricKey).group !== "Composite" &&
        entry.meanAbsoluteDifference !== null,
    )
    .sort((a, b) => b.meanAbsoluteDifference! - a.meanAbsoluteDifference!)[0];
  const referenceLabel = formatModelLabel(reference);
  const comparisonLabel = formatModelLabel(comparison);
  const selfPoints = analysis.points.filter(
    (point) => point.model === reference || point.model === comparison,
  );
  const cards = [
    {
      label: "Paired coverage",
      value: `${analysis.sharedRunCount} / ${analysis.totalAnswerSetCount}`,
      detail:
        "Available answer sets with compatible, error-free runs from both judges.",
    },
    {
      label: "Mean difference",
      value: difference(analysis.meanDifference),
      detail:
        "Comparison minus reference; negative means stricter scores on average.",
    },
    {
      label: "Mean absolute difference",
      value: statistic(analysis.meanAbsoluteDifference),
      detail: "Typical distance between the two judges' answer-set means.",
    },
    {
      label: "Pearson correlation",
      value: statistic(analysis.pearson),
      detail: "Association between answer-set mean scores.",
    },
    {
      label: "Spearman correlation",
      value: statistic(analysis.spearman),
      detail: "Association between rankings, with tied ranks averaged.",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Judge agreement and calibration</CardTitle>
          <p className="text-sm text-muted-foreground">
            Compare any two judges on matching saved answer sets, rubric
            versions, and scored-question counts. These diagnostics do not
            change the selected scoring edition.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {activePromptLabel
                ? formatPromptLabel(activePromptLabel)
                : "No prompt"}{" "}
              · Rubric {evalVersion}
            </Badge>
            <Badge variant="outline">
              {analysis.evidenceStatus === "complete"
                ? "Complete paired coverage"
                : analysis.evidenceStatus === "partial"
                  ? "Partial paired coverage"
                  : "No paired coverage"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="reference-judge"
              className="mb-1 block text-sm font-semibold"
            >
              Reference judge
            </label>
            <Select
              value={reference}
              onValueChange={setRequestedReference}
              disabled={!judges.length}
            >
              <SelectTrigger id="reference-judge">
                <SelectValue placeholder="No judges" />
              </SelectTrigger>
              <SelectContent>
                {judges.map((judge) => (
                  <SelectItem key={judge} value={judge}>
                    {formatModelLabel(judge)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label
              htmlFor="comparison-judge"
              className="mb-1 block text-sm font-semibold"
            >
              Comparison judge
            </label>
            <Select
              value={comparison}
              onValueChange={setRequestedComparison}
              disabled={!comparisons.length}
            >
              <SelectTrigger id="comparison-judge">
                <SelectValue placeholder="No comparison judges" />
              </SelectTrigger>
              <SelectContent>
                {comparisons.map((judge) => (
                  <SelectItem key={judge} value={judge}>
                    {formatModelLabel(judge)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label
              htmlFor="agreement-metric"
              className="mb-1 block text-sm font-semibold"
            >
              Comparison metric
            </label>
            <Select
              value={metricKey}
              onValueChange={(value) => setMetricKey(value as MetricKey)}
            >
              <SelectTrigger id="agreement-metric">
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
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm font-semibold">{card.label}</p>
            <p className="my-2 text-2xl font-bold tabular-nums">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.detail}</p>
          </div>
        ))}
      </div>

      {analysis.sharedRunCount === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No compatible paired runs for this selection. Choose another judge
            or answer prompt. Missing comparisons are not zero scores.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {getMetricDefinition(metricKey).label}: paired means
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Each point is one saved answer set. Correlation across model
                means does not measure agreement on individual questions or
                establish theological accuracy.
              </p>
            </CardHeader>
            <CardContent>
              <JudgeAgreementScatter
                data={analysis.points}
                primaryLabel={referenceLabel}
                comparisonLabel={comparisonLabel}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Scores on the same answers</CardTitle>
              <p className="text-sm text-muted-foreground">
                Mean ± recorded population standard deviation within each judge
                run. These standard deviations are not uncertainty intervals for
                the means.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Answer model</TableHead>
                    <TableHead className="text-right">
                      {referenceLabel}
                    </TableHead>
                    <TableHead className="text-right">
                      {comparisonLabel}
                    </TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.points.map((point) => (
                    <TableRow key={point.answersLabel}>
                      <TableCell className="font-medium">
                        {formatModelLabel(point.model)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {point.primaryMean.toFixed(2)} ±{" "}
                        {point.primaryStdev.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {point.comparisonMean.toFixed(2)} ±{" "}
                        {point.comparisonStdev.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {difference(point.difference)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Rubric-level comparison</CardTitle>
              <p className="text-sm text-muted-foreground">
                All metrics use the same paired answer sets. Stricter scores
                alone do not identify a more accurate judge.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">
                      Mean difference
                    </TableHead>
                    <TableHead className="text-right">
                      Mean absolute difference
                    </TableHead>
                    <TableHead className="text-right">Pearson</TableHead>
                    <TableHead className="text-right">Spearman</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((entry) => (
                    <TableRow key={entry.metricKey}>
                      <TableCell className="font-medium">
                        {getMetricDefinition(entry.metricKey).label}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {difference(entry.meanDifference)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {statistic(entry.meanAbsoluteDifference)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {statistic(entry.pearson)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {statistic(entry.spearman)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>What to review next</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {largestDifference && (
                <p>
                  Largest average absolute subcriterion difference:{" "}
                  <strong className="text-foreground">
                    {getMetricDefinition(largestDifference.metricKey).label} (
                    {statistic(largestDifference.meanAbsoluteDifference)}{" "}
                    points)
                  </strong>
                  . Review the underlying answers and rubric interpretation.
                </p>
              )}
              {selfPoints.map((point) => (
                <p key={point.answersLabel}>
                  <strong className="text-foreground">
                    Self-model comparison:
                  </strong>{" "}
                  {formatModelLabel(point.model)} ranks{" "}
                  {rank(
                    point.primaryMean,
                    analysis.points.map((item) => item.primaryMean),
                  )}{" "}
                  with {referenceLabel} and{" "}
                  {rank(
                    point.comparisonMean,
                    analysis.points.map((item) => item.comparisonMean),
                  )}{" "}
                  with {comparisonLabel} among these {analysis.sharedRunCount}{" "}
                  answer sets. Tied ranks are averaged. This alone does not
                  establish self-bias.
                </p>
              ))}
              <p>
                {analysis.totalAnswerSetCount - analysis.sharedRunCount}{" "}
                available answer sets lack a compatible pair. Completing
                coverage improves comparability; it does not validate either
                judge.
              </p>
              <p>
                Use blinded theological reviewers to score a stratified sample,
                then compare judge errors against expert consensus. Repeat a
                subset to assess consistency, and include each judge&apos;s own
                model family and difficult rubric cases.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
