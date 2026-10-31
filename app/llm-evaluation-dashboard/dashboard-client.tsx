"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EvaluationRun } from "./evaluation-metrics";
import { useDashboardMetrics } from "./hooks/use-dashboard-metrics";
import {
  DEFAULT_EDITION_ID,
  HISTORICAL_EDITION_ID,
  SCORING_EDITIONS,
} from "./scoring-editions";
import { TopPerformerBar } from "./charts/TopPerformerBar";
import { PromptDeltaBar } from "./charts/PromptDeltaBar";
import { ProviderSpreadScatter } from "./charts/ProviderSpreadScatter";
import { RadarDeepDive } from "./charts/RadarDeepDive";
import { CategoryScatter } from "./charts/CategoryScatter";
import { formatModelLabel, formatPromptLabel } from "./constants";
import { JudgeAnalysisPanel } from "./components/JudgeAnalysisPanel";
import { EditionResults } from "./components/EditionResults";

export default function DashboardClient({ data }: { data: EvaluationRun[] }) {
  const [editionId, setEditionId] = useState(DEFAULT_EDITION_ID);
  const [requestedPrompt, setRequestedPrompt] = useState<string>();
  const [activeTab, setActiveTab] = useState("compare");
  const metrics = useDashboardMetrics(data, editionId, requestedPrompt);
  const historical = useDashboardMetrics(
    data,
    HISTORICAL_EDITION_ID,
    metrics.activePromptLabel ?? undefined,
  );
  const { edition, activePromptLabel, narrativeStats: stats } = metrics;
  const isPanel = edition.judges.length > 1;
  const promptLabel = activePromptLabel
    ? formatPromptLabel(activePromptLabel)
    : "No prompt";
  const useHistoricalPrompt =
    isPanel &&
    metrics.promptDelta.length === 0 &&
    historical.promptDelta.length > 0;
  const progression = useHistoricalPrompt ? historical : metrics;
  const totalWeight = edition.judges.reduce(
    (sum, judge) => sum + judge.weight,
    0,
  );
  const categories = [
    {
      title: "Adherence to the doctrinal statement",
      data: metrics.radarAdherence,
      description:
        "Core and secondary doctrine, handling of tertiary issues, biblical basis, and consistency.",
    },
    {
      title: "Kindness and gentleness",
      data: metrics.radarKindness,
      description:
        "Clarity with kindness, pastoral sensitivity, fairness, neutrality on tertiary issues, and tone.",
    },
    {
      title: "Interfaith and worldview sensitivity",
      data: metrics.radarInterfaith,
      description:
        "Respect, acknowledgment of objections, evangelism, and Gospel boldness.",
    },
  ];
  const pairs = [
    {
      x: "adherence",
      y: "kindness",
      xLabel: "Doctrinal adherence",
      yLabel: "Kindness and gentleness",
    },
    {
      x: "adherence",
      y: "interfaith",
      xLabel: "Doctrinal adherence",
      yLabel: "Interfaith sensitivity",
    },
    {
      x: "kindness",
      y: "interfaith",
      xLabel: "Kindness and gentleness",
      yLabel: "Interfaith sensitivity",
    },
  ] as const;

  return (
    <div className="min-h-[calc(100vh-var(--app-header-height))] bg-background p-4 font-sans text-foreground md:p-8">
      <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <h1 className="mb-2 font-serif text-3xl font-bold">
            AI Model Performance Dashboard
          </h1>
          <p className="text-muted-foreground">
            Compare how AI models answer theological questions using a Reformed
            framework. Explore scores, judge disagreements, and historical
            prompt comparisons.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/doctrinal-statement">Doctrinal statement</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/llm-evaluation-dashboard/framework">
              <BookOpen className="mr-2 size-4" />
              Evaluation framework
            </Link>
          </Button>
        </div>
      </header>

      <Card className="mb-6">
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <label
                htmlFor="scoring-edition"
                className="mb-1 block text-sm font-semibold"
              >
                Scoring edition
              </label>
              <Select value={editionId} onValueChange={setEditionId}>
                <SelectTrigger
                  id="scoring-edition"
                  className="h-auto min-h-10 text-left"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORING_EDITIONS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor="answer-prompt"
                className="mb-1 block text-sm font-semibold"
              >
                Answer prompt
              </label>
              <Select
                value={activePromptLabel ?? ""}
                onValueChange={setRequestedPrompt}
                disabled={metrics.promptOptions.length === 0}
              >
                <SelectTrigger id="answer-prompt">
                  <SelectValue placeholder="No prompts" />
                </SelectTrigger>
                <SelectContent>
                  {metrics.promptOptions.map((prompt) => (
                    <SelectItem key={prompt} value={prompt}>
                      {formatPromptLabel(prompt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {edition.status === "provisional"
                ? "Provisional panel"
                : "Historical edition"}
            </Badge>
            <Badge variant="outline">Rubric {edition.evalVersion}</Badge>
            <Badge variant="outline">{edition.benchmark}</Badge>
            <Badge variant="outline">
              {metrics.activeAnswers.length}/{metrics.activeCoverage.length}{" "}
              answer sets covered
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {edition.description} Scores from different editions are not
            directly comparable.
          </p>
          <ul className="flex flex-col gap-2 text-sm lg:flex-row lg:flex-wrap lg:gap-x-6">
            {edition.judges.map((judge) => (
              <li key={judge.model}>
                <span className="font-medium">
                  {formatModelLabel(judge.model)}
                </span>{" "}
                · {((judge.weight / totalWeight) * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3" aria-live="polite">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Highest mean · {promptLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {stats ? `${stats.winnerScore.toFixed(3)} / 5` : "Unavailable"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats?.winnerName ??
                "No complete answer sets for this selection"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Next highest mean</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {stats?.runnerUpScore != null
                ? `${stats.runnerUpScore.toFixed(3)} / 5`
                : "Unavailable"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats?.runnerUpName ?? "More comparable models needed"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Comparable models</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {metrics.activeAnswers.length} of {metrics.activeCoverage.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {metrics.incompleteAnswers.length} awaiting comparable judgments.
              Small score gaps are not proof of superiority.
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="compare" className="py-2.5">
            Models &amp; prompts
          </TabsTrigger>
          <TabsTrigger value="judges" className="py-2.5">
            Judge agreement
          </TabsTrigger>
          <TabsTrigger value="spread" className="py-2.5">
            Provider range
          </TabsTrigger>
          <TabsTrigger value="detail" className="py-2.5">
            Deep dive
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compare" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top performer by provider</CardTitle>
              <p className="text-sm text-muted-foreground">
                Best covered model from each provider on {promptLabel}, using
                Final Overall from {edition.label}.{" "}
                {isPanel
                  ? "Whiskers show the range of judge means."
                  : "Whiskers show the recorded population standard deviation."}{" "}
                These whiskers are not confidence intervals.
              </p>
            </CardHeader>
            <CardContent>
              {metrics.bestPerProvider.length > 0 ? (
                <TopPerformerBar data={metrics.bestPerProvider} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No complete comparisons. See missing coverage below or select
                  a historical edition.
                </p>
              )}
            </CardContent>
          </Card>

          <EditionResults metrics={metrics} />

          <Card>
            <CardHeader>
              <CardTitle>Does the custom prompt help?</CardTitle>
              {useHistoricalPrompt && (
                <Badge variant="outline" className="w-fit">
                  Historical prompt comparison · GPT-5 Mini
                </Badge>
              )}
              <p className="text-sm text-muted-foreground">
                {useHistoricalPrompt
                  ? "The selected panel lacks matching baseline judgments. This chart preserves the original GPT-5 Mini comparison; it does not mix historical baselines with panel scores."
                  : `Prompt progression for the same answer model, scored consistently by ${edition.label}.`}
              </p>
            </CardHeader>
            <CardContent>
              {progression.promptDelta.length > 0 ? (
                <>
                  <PromptDeltaBar
                    data={progression.promptDelta}
                    promptLabels={progression.progressionPromptLabels}
                  />
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {progression.promptDelta.map((item) => (
                      <div
                        key={item.model}
                        className="rounded-lg border border-border p-3 text-sm"
                      >
                        <p className="font-semibold">
                          {formatModelLabel(item.model)}
                        </p>
                        <p className="mt-1 text-xl font-bold tabular-nums">
                          {item.deltaPoints >= 0 ? "+" : ""}
                          {item.deltaPoints.toFixed(2)} points
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatPromptLabel(item.baselineLabel)} to{" "}
                          {formatPromptLabel(item.currentLabel)} ·{" "}
                          {item.deltaPct >= 0 ? "+" : ""}
                          {item.deltaPct.toFixed(1)}% relative to baseline
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No matched baseline-to-prompt comparisons for this selection.
                  Choose another prompt or the historical GPT-5 Mini edition.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="judges">
          {activeTab === "judges" && (
            <JudgeAnalysisPanel
              key={edition.id}
              runs={data}
              evalVersion={edition.evalVersion}
              initialReference={edition.judges[0].model}
              activePromptLabel={activePromptLabel}
            />
          )}
        </TabsContent>

        <TabsContent value="spread" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Range across tested models and prompts</CardTitle>
              <p className="text-sm text-muted-foreground">
                Each provider&apos;s minimum and maximum across covered
                non-baseline answer sets through {promptLabel}, all scored by{" "}
                {edition.label}. This range reflects the tested model and prompt
                mix; it does not measure repeated-run reliability.
              </p>
            </CardHeader>
            <CardContent>
              {metrics.providerSpread.length > 0 ? (
                <ProviderSpreadScatter
                  data={metrics.providerSpread}
                  domainMin={
                    edition.id === "three-family-2026-10" ? 3.6 : undefined
                  }
                />
              ) : (
                <p>No covered non-baseline answer sets.</p>
              )}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {metrics.providerSpread.map((provider) => (
                  <details
                    key={provider.provider}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <summary className="cursor-pointer font-semibold">
                      {provider.label}: {provider.min.toFixed(2)}–
                      {provider.max.toFixed(2)} · {provider.modelCount} models,{" "}
                      {provider.runCount} answer sets
                    </summary>
                    <ul className="mt-3 space-y-2">
                      {provider.runs.map((run) => (
                        <li key={`${run.model}-${run.promptLabel}`}>
                          {formatModelLabel(run.model)} ·{" "}
                          {formatPromptLabel(run.promptLabel)}:{" "}
                          {run.score.toFixed(3)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detail" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            All charts use {edition.label} on {promptLabel}. Radars show the
            highest Final Overall model from each covered provider; scatterplots
            show every covered model.
          </p>
          {metrics.activeAnswers.length === 0 ? (
            <p>No complete scores for this selection.</p>
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-3">
                {categories.map((category) => (
                  <Card key={category.title} className="min-w-0">
                    <CardHeader>
                      <CardTitle>{category.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <RadarDeepDive data={category.data} domainMin={1} />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="rounded-lg border border-border p-4 text-sm">
                <p className="mb-2 font-semibold">Models shown in the radars</p>
                <ul className="flex flex-wrap gap-x-6 gap-y-2">
                  {metrics.bestPerProvider.map((item) => (
                    <li key={item.provider}>{formatModelLabel(item.model)}</li>
                  ))}
                </ul>
              </div>
              {pairs.map((pair) => (
                <Card key={pair.x + pair.y}>
                  <CardHeader>
                    <CardTitle>
                      {pair.xLabel} × {pair.yLabel}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Each point is a covered model&apos;s category means.
                      Higher scores on both axes appear toward the top right.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <CategoryScatter
                      data={metrics.categoryScoresByModel.map((point) => ({
                        ...point,
                        x: point[pair.x],
                        y: point[pair.y],
                      }))}
                      xLabel={pair.xLabel}
                      yLabel={pair.yLabel}
                    />
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>

      <footer className="mt-8 space-y-2 border-t border-border pt-5 text-sm text-muted-foreground">
        <p>
          Final Overall combines doctrinal adherence, kindness and gentleness,
          and interfaith sensitivity. Weighted Production is available in the
          detail table. Scores reflect the selected judges&apos; application of
          the rubric; expert review is needed to assess theological accuracy.
        </p>
        <p>
          {metrics.activeAnswers.length > 0
            ? `Covered runs: ${metrics.questionCountSummary.min === metrics.questionCountSummary.max ? metrics.questionCountSummary.max : `${metrics.questionCountSummary.min}–${metrics.questionCountSummary.max}`} scored questions each · ${metrics.questionCountSummary.totalErrors} recorded errors.`
            : "No covered runs in this selection."}{" "}
          {metrics.latestEvaluatedAt &&
            `Latest included evaluation: ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(metrics.latestEvaluatedAt))}.`}
        </p>
        <p>
          Recorded answers and scores remain available when a model is retired.
          A replacement judge requires a new scoring edition.
        </p>
      </footer>
    </div>
  );
}
