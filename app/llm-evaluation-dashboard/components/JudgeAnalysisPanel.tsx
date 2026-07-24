"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  getProviderLabel,
} from "../constants";
import type { JudgeInfo } from "../hooks/use-dashboard-metrics";
import {
  buildJudgePairAnalysis,
  type JudgePairAnalysis,
} from "../judge-analysis";
import {
  METRIC_DEFINITIONS,
  getMetricDefinition,
  type EvaluationRun,
  type MetricKey,
} from "../evaluation-metrics";
import { JudgeAgreementScatter } from "../charts/JudgeAgreementScatter";

interface JudgeAnalysisPanelProps {
  runs: EvaluationRun[];
  primaryJudge: JudgeInfo | null;
  activePromptLabel: string | null;
}

const COMPOSITE_METRICS: MetricKey[] = [
  "adherenceOverall",
  "kindnessOverall",
  "interfaithOverall",
  "finalOverall",
  "weightedProductionScore",
];

function formatStatistic(value: number | null, digits = 2): string {
  return value === null ? "N/A" : value.toFixed(digits);
}

function formatDifference(value: number | null): string {
  if (value === null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function evidenceCopy(status: JudgePairAnalysis["evidenceStatus"]): string {
  if (status === "strong") return "Strong paired coverage";
  if (status === "developing") return "Developing evidence";
  return "Limited evidence";
}

function correlationCopy(value: number | null): string {
  if (value === null) return "not estimable";
  const magnitude = Math.abs(value);
  if (magnitude >= 0.9) return "very strong";
  if (magnitude >= 0.7) return "strong";
  if (magnitude >= 0.5) return "moderate";
  if (magnitude >= 0.3) return "weak";
  return "very weak";
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function JudgeAnalysisPanel({
  runs,
  primaryJudge,
  activePromptLabel,
}: JudgeAnalysisPanelProps) {
  const promptOptions = useMemo(() => {
    if (!primaryJudge) return [];
    return Array.from(new Set(runs.map((run) => run.systemPromptLabel)))
      .filter((prompt) => {
        const primaryAnswers = new Set(
          runs
            .filter(
              (run) =>
                run.systemPromptLabel === prompt &&
                run.judgeModel === primaryJudge.model
            )
            .map((run) => `${run.answersLabel}|${run.evalVersion}`)
        );
        return runs.some(
          (run) =>
            run.systemPromptLabel === prompt &&
            run.judgeModel !== primaryJudge.model &&
            primaryAnswers.has(`${run.answersLabel}|${run.evalVersion}`)
        );
      })
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  }, [primaryJudge, runs]);
  const [requestedPrompt, setRequestedPrompt] = useState(activePromptLabel ?? "");
  const promptLabel = promptOptions.includes(requestedPrompt)
    ? requestedPrompt
    : activePromptLabel && promptOptions.includes(activePromptLabel)
      ? activePromptLabel
      : (promptOptions[0] ?? "");

  const comparisonOptions = useMemo(() => {
    if (!primaryJudge || !promptLabel) return [];
    const primaryAnswers = new Set(
      runs
        .filter(
          (run) =>
            run.systemPromptLabel === promptLabel &&
            run.judgeModel === primaryJudge.model
        )
        .map((run) => `${run.answersLabel}|${run.evalVersion}`)
    );
    return Array.from(
      new Set(
        runs
          .filter(
            (run) =>
              run.systemPromptLabel === promptLabel &&
              run.judgeModel !== primaryJudge.model &&
              primaryAnswers.has(`${run.answersLabel}|${run.evalVersion}`)
          )
          .map((run) => run.judgeModel)
      )
    ).sort(
      (left, right) =>
        getJudgeRole(left).order - getJudgeRole(right).order ||
        left.localeCompare(right)
    );
  }, [primaryJudge, promptLabel, runs]);

  const [requestedComparison, setRequestedComparison] = useState("gpt-5.6-luna");
  const comparisonJudge = comparisonOptions.includes(requestedComparison)
    ? requestedComparison
    : (comparisonOptions[0] ?? "");
  const [metricKey, setMetricKey] = useState<MetricKey>("finalOverall");

  const analysis = useMemo(
    () =>
      primaryJudge && comparisonJudge && promptLabel
        ? buildJudgePairAnalysis(runs, {
            primaryJudge: primaryJudge.model,
            comparisonJudge,
            promptLabel,
            metricKey,
          })
        : null,
    [comparisonJudge, metricKey, primaryJudge, promptLabel, runs]
  );

  const compositeAnalysis = useMemo(
    () =>
      primaryJudge && comparisonJudge && promptLabel
        ? COMPOSITE_METRICS.map((key) =>
            buildJudgePairAnalysis(runs, {
              primaryJudge: primaryJudge.model,
              comparisonJudge,
              promptLabel,
              metricKey: key,
            })
          )
        : [],
    [comparisonJudge, primaryJudge, promptLabel, runs]
  );

  const biggestSubcriterionDifference = useMemo(() => {
    if (!primaryJudge || !comparisonJudge || !promptLabel) return null;
    return METRIC_DEFINITIONS.filter((metric) => metric.group !== "Composite")
      .map((metric) => ({
        definition: metric,
        analysis: buildJudgePairAnalysis(runs, {
          primaryJudge: primaryJudge.model,
          comparisonJudge,
          promptLabel,
          metricKey: metric.key,
        }),
      }))
      .filter((entry) => entry.analysis.meanDifference !== null)
      .sort(
        (left, right) =>
          Math.abs(right.analysis.meanDifference ?? 0) -
          Math.abs(left.analysis.meanDifference ?? 0)
      )[0];
  }, [comparisonJudge, primaryJudge, promptLabel, runs]);

  if (!primaryJudge) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          The configured primary judge is not present in this dataset.
        </CardContent>
      </Card>
    );
  }

  const primaryLabel = formatModelLabel(primaryJudge.model);
  const comparisonLabel = comparisonJudge
    ? formatModelLabel(comparisonJudge)
    : "Comparison judge";
  const comparisonRole = comparisonJudge ? getJudgeRole(comparisonJudge) : null;
  const metric = getMetricDefinition(metricKey);
  const remainingForFullOverlap = Math.max(0, 20 - (analysis?.sharedRunCount ?? 0));
  const selfPoint = analysis?.points.find((point) => point.model === comparisonJudge);
  const primarySelfRank = selfPoint
    ? [...analysis!.points]
        .sort((left, right) => right.primaryMean - left.primaryMean)
        .findIndex((point) => point.answersLabel === selfPoint.answersLabel) + 1
    : null;
  const comparisonSelfRank = selfPoint
    ? [...analysis!.points]
        .sort((left, right) => right.comparisonMean - left.comparisonMean)
        .findIndex((point) => point.answersLabel === selfPoint.answersLabel) + 1
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-serif text-2xl">
                <Scale className="size-5 text-primary" />
                Judge Agreement &amp; Calibration
              </CardTitle>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Compare judges only where they scored the exact same answer set and
                evaluation version. The dashboard ranking remains based on Final Overall
                from the configured primary judge.
              </p>
            </div>
            {comparisonRole && (
              <Badge variant="outline" className="w-fit">
                {comparisonRole.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">
              Evaluation prompt
              <Select value={promptLabel} onValueChange={setRequestedPrompt}>
                <SelectTrigger aria-label="Evaluation prompt">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {promptOptions.map((prompt) => (
                    <SelectItem key={prompt} value={prompt}>
                      {formatPromptLabel(prompt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Comparison judge
              <Select
                value={comparisonJudge}
                onValueChange={setRequestedComparison}
                disabled={comparisonOptions.length === 0}
              >
                <SelectTrigger aria-label="Comparison judge">
                  <SelectValue placeholder="No paired judge" />
                </SelectTrigger>
                <SelectContent>
                  {comparisonOptions.map((judge) => (
                    <SelectItem key={judge} value={judge}>
                      {formatModelLabel(judge)} · {getJudgeRole(judge).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Metric
              <Select
                value={metricKey}
                onValueChange={(value) => setMetricKey(value as MetricKey)}
              >
                <SelectTrigger aria-label="Metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["Composite", "Adherence", "Kindness", "Interfaith"] as const).map(
                    (group) => (
                      <SelectGroup key={group}>
                        <SelectLabel>{group}</SelectLabel>
                        {METRIC_DEFINITIONS.filter(
                          (definition) => definition.group === group
                        ).map((definition) => (
                          <SelectItem key={definition.key} value={definition.key}>
                            {definition.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )
                  )}
                </SelectContent>
              </Select>
            </label>
          </div>
        </CardContent>
      </Card>

      {analysis && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Shared answer sets"
              value={`${analysis.sharedRunCount}`}
              detail={`${analysis.comparisonRunCount} comparison runs · ${analysis.primaryRunCount} primary runs`}
            />
            <SummaryCard
              label="Average difference"
              value={formatDifference(analysis.meanDifference)}
              detail={`${comparisonLabel} minus ${primaryLabel}`}
            />
            <SummaryCard
              label="Pearson r"
              value={formatStatistic(analysis.pearson)}
              detail="Agreement in score spacing"
            />
            <SummaryCard
              label="Spearman ρ"
              value={formatStatistic(analysis.spearman)}
              detail="Agreement in model ranking"
            />
            <SummaryCard
              label="Evidence status"
              value={evidenceCopy(analysis.evidenceStatus)}
              detail={`${analysis.sharedRunCount}/20 target paired sets`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif">{metric.label} agreement</CardTitle>
              <p className="text-sm text-muted-foreground">
                Points below the dashed line mean {comparisonLabel} scored the same
                answers lower than {primaryLabel}. Provider colors identify the answer
                model, not the judge.
              </p>
            </CardHeader>
            <CardContent>
              <JudgeAgreementScatter
                data={analysis.points}
                primaryLabel={primaryLabel}
                comparisonLabel={comparisonLabel}
              />
              <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">What the paired data says:</span>{" "}
                {analysis.meanDifference !== null && analysis.meanDifference < -0.05
                  ? `${comparisonLabel} is stricter by ${Math.abs(analysis.meanDifference).toFixed(2)} points on average`
                  : analysis.meanDifference !== null && analysis.meanDifference > 0.05
                    ? `${comparisonLabel} is more generous by ${analysis.meanDifference.toFixed(2)} points on average`
                    : "The judges have little average scoring offset"}
                . It scored {analysis.comparisonLowerCount} of {analysis.sharedRunCount} shared
                sets lower and {analysis.comparisonHigherCount} higher. Pearson agreement is{" "}
                {correlationCopy(analysis.pearson)}; rank agreement is{" "}
                {correlationCopy(analysis.spearman)}.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Paired scores and dispersion</CardTitle>
              <p className="text-sm text-muted-foreground">
                Mean ± population SD for question-level scores within each run. SD
                describes how varied the question scores were; it is not a confidence
                interval or standard error for the mean.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Answer model</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">{primaryLabel}</TableHead>
                    <TableHead className="text-right">{comparisonLabel}</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.points.map((point) => (
                    <TableRow key={point.answersLabel}>
                      <TableCell className="font-medium">
                        {formatModelLabel(point.model)}
                      </TableCell>
                      <TableCell>{getProviderLabel(point.provider)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {point.primaryMean.toFixed(2)} ± {point.primaryStdev.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {point.comparisonMean.toFixed(2)} ±{" "}
                        {point.comparisonStdev.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatDifference(point.difference)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Average question-score SD: {primaryLabel}{" "}
                {formatStatistic(analysis.primaryAverageStdev)} · {comparisonLabel}{" "}
                {formatStatistic(analysis.comparisonAverageStdev)}.
              </p>
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-6 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="font-serif">Rubric-level calibration</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Positive differences mean the comparison judge is more generous.
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Composite metric</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                      <TableHead className="text-right">Pearson</TableHead>
                      <TableHead className="text-right">Spearman</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compositeAnalysis.map((entry) => (
                      <TableRow key={entry.metricKey}>
                        <TableCell className="font-medium">
                          {getMetricDefinition(entry.metricKey).label}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDifference(entry.meanDifference)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatStatistic(entry.pearson)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatStatistic(entry.spearman)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="font-serif">Largest rubric disagreement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {biggestSubcriterionDifference && (
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <p className="font-semibold text-foreground">
                      {biggestSubcriterionDifference.definition.label}
                    </p>
                    <p className="mt-1 text-3xl font-bold tabular-nums">
                      {formatDifference(
                        biggestSubcriterionDifference.analysis.meanDifference
                      )}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Pearson{" "}
                      {formatStatistic(biggestSubcriterionDifference.analysis.pearson)} ·
                      Spearman{" "}
                      {formatStatistic(biggestSubcriterionDifference.analysis.spearman)}.
                      This is the best place to inspect rubric interpretation before
                      promoting a new primary judge.
                    </p>
                  </div>
                )}
                {selfPoint && (
                  <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <p className="text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        Self-model watch:
                      </span>{" "}
                      {comparisonLabel} ranks its own answer set #{comparisonSelfRank},
                      while {primaryLabel} ranks it #{primarySelfRank} for this metric.
                      This is a flag for blinded human review, not evidence of self-bias
                      by itself.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Evidence needed before promotion</CardTitle>
              <p className="text-sm text-muted-foreground">
                Strictness can be useful, but it is not enough on its own. A primary judge
                should also track expert judgments, apply the rubric consistently, and
                avoid model-family favoritism.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex gap-3 rounded-lg border border-border p-4">
                  {remainingForFullOverlap === 0 ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                  )}
                  <div>
                    <p className="font-semibold">Complete paired coverage</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {remainingForFullOverlap === 0
                        ? "The 20-set overlap target is complete."
                        : `Judge the remaining ${remainingForFullOverlap} answer sets to reach 20 fully paired comparisons.`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-lg border border-border p-4">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">Blind expert calibration</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Have two or more theological reviewers score a stratified sample,
                      then compare judge error and rank agreement against consensus.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-lg border border-border p-4">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">Repeatability and bias checks</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Re-judge a blinded subset across runs and model families, including
                      the candidate&apos;s own answers and adversarial rubric edge cases.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
