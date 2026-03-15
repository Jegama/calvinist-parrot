"use client";

import React from "react";
import { TrendingUp, Scale, Activity, Award, Info, BookOpen } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { EvaluationRecord } from "./lib";
import { useDashboardMetrics } from "./hooks/use-dashboard-metrics";
import { TopPerformerBar } from "./charts/TopPerformerBar";
import { PromptDeltaBar } from "./charts/PromptDeltaBar";
import { JudgeBiasBar } from "./charts/JudgeBiasBar";
import { ProviderSpreadScatter } from "./charts/ProviderSpreadScatter";
import { RadarDeepDive } from "./charts/RadarDeepDive";
import { formatModelLabel, formatPromptLabel, getProviderColor } from "./constants";

const Stat = ({
  label,
  value,
  subtext,
  color,
  className,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
  className?: string;
}) => (
  <div className={`flex flex-col ${className}`}>
    <span className="text-sm opacity-80 font-medium uppercase tracking-wide">{label}</span>
    <span className="text-3xl font-bold mt-1" style={{ color: color || "currentColor" }}>
      {value}
    </span>
    {subtext && <span className="text-xs opacity-70 mt-1">{subtext}</span>}
  </div>
);

interface DashboardClientProps {
  data: EvaluationRecord[];
}

export default function DashboardClient({ data }: DashboardClientProps) {
  const {
    activePromptLabel,
    baselinePromptLabel,
    bestPerProvider,
    comparisonJudges,
    judgeComparisonPromptLabel,
    progressionPromptLabels,
    promptDelta,
    bestImprovement,
    primaryJudge,
    judgeComparison,
    providerSpread,
    radarAdherence,
    radarKindness,
    radarInterfaith,
    narrativeStats,
  } = useDashboardMetrics(data);

  const ns = narrativeStats;
  const modelCount = ns?.modelCount ?? 0;
  const activePromptLabelDisplay = activePromptLabel ? formatPromptLabel(activePromptLabel) : "Current";
  const baselinePromptLabelDisplay = baselinePromptLabel ? formatPromptLabel(baselinePromptLabel) : "Baseline";
  const judgeComparisonPromptDisplay = judgeComparisonPromptLabel
    ? formatPromptLabel(judgeComparisonPromptLabel)
    : activePromptLabelDisplay;

  // Build dynamic prompt delta improvement cards
  const promptDeltaCards = promptDelta.map((d) => ({
    name: formatModelLabel(d.model),
    pct: d.deltaPct.toFixed(0),
  }));

  // Build dynamic provider spread descriptions
  const spreadDescriptions = providerSpread.map((ps) => {
    const range = (ps.max - ps.min).toFixed(2);
    const maxName = formatModelLabel(ps.maxModel);
    const minName = formatModelLabel(ps.minModel);
    const isSingle = ps.min === ps.max;
    const description = isSingle
      ? `Single model tested (${maxName}) scoring ${ps.max.toFixed(2)}.`
      : `${maxName} on ${formatPromptLabel(ps.maxPromptLabel)} (${ps.max.toFixed(2)}) to ${minName} on ${formatPromptLabel(ps.minPromptLabel)} (${ps.min.toFixed(2)}), ${range} range across ${ps.runCount} non-baseline runs.`;
    return { provider: ps.provider, label: ps.label, fill: getProviderColor(ps.provider), description };
  });

  // Primary and cross-validator judge names for display
  const crossValidators = comparisonJudges.filter((j) => j.model !== primaryJudge?.model);
  const crossValidatorNames = crossValidators
    .map((j) => j.name.replace("Graded by ", ""))
    .join(", ");

  return (
    <div className="bg-background min-h-screen p-4 md:p-8 font-sans text-foreground">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2">AI Model Performance Dashboard</h1>
            <p className="text-muted-foreground">
              Which AI is most faithful and pastoral in answering theological questions? We evaluated Google, OpenAI,
              xAI, and Anthropic models against a Reformed theological framework.
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:flex-row sm:items-center gap-2">
            <Button variant="outline" asChild className="w-full sm:w-auto whitespace-nowrap">
              <Link href="/doctrinal-statement">
                View Doctrinal Statement
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2 whitespace-nowrap w-full sm:w-auto">
              <Link href="/llm-evaluation-dashboard/framework">
                <BookOpen size={16} />
                View Framework
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-6">
          <span className="bg-muted px-3 py-1 rounded-full">📊 500+ Questions Tested</span>
          <span className="bg-muted px-3 py-1 rounded-full">🎯 3 Major Categories</span>
          <span className="bg-muted px-3 py-1 rounded-full">🤖 {modelCount} Models Compared</span>
        </div>
      </header>

      {/* Quick Overview Banner */}
      <div className="mb-6 bg-muted/40 border border-border rounded-lg p-4 md:p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary rounded-full p-2 flex-shrink-0">
            <TrendingUp size={20} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground mb-2">Quick Findings</h2>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-semibold text-foreground mb-1">🥇 Winner</div>
                <div className="text-muted-foreground">
                  {ns ? `${ns.winnerName} averaged ${ns.winnerScore}/5.0 across all categories` : "Loading..."}
                </div>
              </div>
              <div>
                <div className="font-semibold text-foreground mb-1">⚡ Biggest Impact</div>
                <div className="text-muted-foreground">
                  {ns?.improvementModel
                    ? `${activePromptLabelDisplay} improved ${ns.improvementModel} by about +${ns.improvementPct}% over ${baselinePromptLabelDisplay}`
                    : "Loading..."}
                </div>
              </div>
              <div>
                <div className="font-semibold text-foreground mb-1">💪 Runner-Up</div>
                <div className="text-muted-foreground">
                  {ns?.runnerUpName
                    ? `${ns.runnerUpName} averaged ${ns.runnerUpScore}/5.0 across all categories`
                    : "Loading..."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="compare" className="w-full space-y-8">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 md:grid-cols-4">
          <TabsTrigger value="compare" className="gap-2 py-2.5">
            <TrendingUp size={16} />
            <span className="hidden sm:inline">Winners</span>
            <span className="sm:hidden">Top</span>
          </TabsTrigger>
          <TabsTrigger value="bias" className="gap-2 py-2.5">
            <Scale size={16} />
            <span className="hidden sm:inline">Judge Fairness</span>
            <span className="sm:hidden">Bias</span>
          </TabsTrigger>
          <TabsTrigger value="spread" className="gap-2 py-2.5">
            <Activity size={16} />
            <span className="hidden sm:inline">Consistency</span>
            <span className="sm:hidden">Range</span>
          </TabsTrigger>
          <TabsTrigger value="radar" className="hidden gap-2 py-2.5 md:inline-flex">
            <Award size={16} />
            <span className="hidden sm:inline">Deep Dive</span>
            <span className="sm:hidden">Detail</span>
          </TabsTrigger>
        </TabsList>

        {/* Main Content Area */}
        <div className="grid grid-cols-12 gap-8">
          {/* Left Column: Visualizations */}
          <div className="col-span-12 lg:col-span-8 space-y-8">
            <TabsContent value="compare" className="space-y-8 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">🏆 Top Performer by Provider</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    The best model from each AI company, scored across doctrinal adherence, kindness and gentleness,
                    and interfaith and worldview sensitivity (out of 5.0) using {activePromptLabelDisplay}
                  </p>
                </CardHeader>
                <CardContent>
                  <TopPerformerBar data={bestPerProvider} />
                  <div className="mt-4 text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                    <span className="font-semibold text-foreground">💡 What this means:</span>{" "}
                    {bestPerProvider.length > 0 ? (
                      <>
                        {bestPerProvider.map((p, i) => {
                          const name = formatModelLabel(p.model);
                          const sep = i === bestPerProvider.length - 1 ? "." : i === bestPerProvider.length - 2 ? ", and " : ", ";
                          return (
                            <span key={p.provider}>
                              {name} at {p.score.toFixed(2)}
                              {sep}
                            </span>
                          );
                        })}
                        {" "}All are strong performers within our Reformed theological framework, confirmed by{" "}
                        {comparisonJudges.length || 1} independent judge{comparisonJudges.length !== 1 ? "s" : ""}.
                      </>
                    ) : (
                      "Loading..."
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">⚡ Does Our Custom Prompt Help?</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Comparing each provider across prompt progression, from {baselinePromptLabelDisplay} through {progressionPromptLabels
                      .filter((label) => label !== baselinePromptLabel)
                      .map((label) => formatPromptLabel(label))
                      .join(" and ")}
                  </p>
                </CardHeader>
                <CardContent>
                  <PromptDeltaBar data={promptDelta} promptLabels={progressionPromptLabels} />
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                      <span className="font-semibold text-foreground">💡 What this means:</span> This chart shows the full prompt progression for each provider, so you can see whether gains were incremental from {baselinePromptLabelDisplay} to v1.0 and then to {activePromptLabelDisplay}, or whether the biggest jump came in a single revision. The percentages in the cards below are the total improvement from {baselinePromptLabelDisplay} to {activePromptLabelDisplay}, calculated as <span className="font-medium text-foreground">(({activePromptLabelDisplay} - {baselinePromptLabelDisplay}) / {baselinePromptLabelDisplay})</span>, not the step from v1.0 to {activePromptLabelDisplay}.
                    </div>
                    {promptDeltaCards.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                        {promptDeltaCards.map((card) => (
                          <div key={card.name} className="bg-background border border-border rounded p-2 text-center">
                            <div className="font-bold text-foreground">{card.name}</div>
                            <div className="text-primary text-lg font-bold">+{card.pct}%</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {baselinePromptLabelDisplay} to {activePromptLabelDisplay}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bias" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">⚖️ Are AI Judges Fair?</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    We used {comparisonJudges.length} different AIs to grade the same {judgeComparisonPromptDisplay} answers
                    across our three categories. Do they generally agree?
                  </p>
                </CardHeader>
                <CardContent>
                  <JudgeBiasBar data={judgeComparison} judges={comparisonJudges} />
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border flex items-start gap-2">
                      <Info size={16} className="mt-0.5 flex-shrink-0 text-foreground" />
                      <div>
                        <span className="font-semibold text-foreground">💡 What this means:</span>{" "}
                        In our tests, {crossValidatorNames || "the secondary judge"} tends to be a more generous grader,
                        often giving models scores near 5.0.{" "}
                        {primaryJudge
                          ? `${primaryJudge.name.replace("Graded by ", "")} is the most discerning and uses more of the 1-5 scale, making its feedback most helpful for seeing real differences between models.`
                          : ""}
                      </div>
                    </div>
                    <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg text-sm">
                      <div className="font-semibold text-foreground mb-1">📌 Why this matters:</div>
                      <div className="text-muted-foreground">
                        We use {primaryJudge ? primaryJudge.name.replace("Graded by ", "") : "the primary judge"} as
                        our primary judge because it provides more detailed, nuanced scores in adherence, kindness,
                        and interfaith and worldview sensitivity. We cross-validate with{" "}
                        {crossValidatorNames || "a secondary judge"} to ensure consistency. This helps us see real
                        differences instead of every model clustering at the top.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="spread" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">📊 How Consistent is Each Company?</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Each provider&apos;s non-baseline performance plotted by its best and worst scores. Points on the diagonal
                    have no spread, which means either one non-baseline run or very consistent results across prompt revisions.
                  </p>
                </CardHeader>
                <CardContent>
                  <ProviderSpreadScatter data={providerSpread} />
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                      <span className="font-semibold text-foreground">💡 How to read this chart:</span> The top-right
                      corner is best (high ceiling AND high floor). Points closer to the bottom-right have more
                      variation.
                    </div>
                    <div className="grid gap-2 text-sm">
                      {spreadDescriptions.map((sd) => (
                        <div key={sd.provider} className="flex items-start gap-2 p-2 rounded bg-background border border-border">
                          <div
                            className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                            style={{ backgroundColor: sd.fill }}
                          ></div>
                          <div>
                            <span className="font-bold text-foreground">{sd.label}:</span>
                            <span className="text-muted-foreground"> {sd.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="radar" className="hidden mt-0 space-y-8 md:block">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">📖 Adherence to Doctrinal Statement</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    How well each model sticks to our doctrinal statement across doctrine tiers,
                    biblical basis, and internal consistency.
                  </p>
                </CardHeader>
                <CardContent>
                  <RadarDeepDive data={radarAdherence} domainMin={2.5} />
                  <div className="mt-4 text-xs text-muted-foreground bg-muted p-3 rounded-lg border border-border space-y-1">
                    <div><span className="font-semibold text-foreground">Core Doctrine:</span> Trinity, Scripture authority, Christ&apos;s deity, the Gospel, justification by faith alone.</div>
                    <div><span className="font-semibold text-foreground">Secondary Doctrine:</span> Baptism, church governance, Lord&apos;s Supper, spiritual gifts.</div>
                    <div><span className="font-semibold text-foreground">Tertiary Handling:</span> Eschatological positions, worship style, age of earth — areas where faithful Christians disagree.</div>
                    <div><span className="font-semibold text-foreground">Biblical Basis:</span> Does the model cite Scripture accurately and in context?</div>
                    <div><span className="font-semibold text-foreground">Consistency:</span> Are answers internally consistent and non-contradictory?</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">❤️ Kindness and Gentleness</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Whether responses are warm, pastoral, patient, and respectful — even when correcting errors
                    or addressing sensitive topics.
                  </p>
                </CardHeader>
                <CardContent>
                  <RadarDeepDive data={radarKindness} domainMin={2.5} />
                  <div className="mt-4 text-xs text-muted-foreground bg-muted p-3 rounded-lg border border-border space-y-1">
                    <div><span className="font-semibold text-foreground">Clarity with Kindness:</span> Communicates truth clearly while remaining warm and inviting.</div>
                    <div><span className="font-semibold text-foreground">Pastoral Sensitivity:</span> Shows awareness of emotional weight in sensitive theological topics.</div>
                    <div><span className="font-semibold text-foreground">Secondary Fairness:</span> Presents secondary doctrinal positions fairly without dismissing other views.</div>
                    <div><span className="font-semibold text-foreground">Tertiary Neutrality:</span> Avoids dogmatism on tertiary issues where Christians may legitimately disagree.</div>
                    <div><span className="font-semibold text-foreground">Tone:</span> Overall warmth, patience, and respectfulness of the response.</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">🤝 Interfaith and Worldview Sensitivity</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    How well the model engages people from other religions or secular worldviews with respect,
                    accurate summaries, and clear Gospel invitations.
                  </p>
                </CardHeader>
                <CardContent>
                  <RadarDeepDive data={radarInterfaith} domainMin={2.5} />
                  <div className="mt-4 text-xs text-muted-foreground bg-muted p-3 rounded-lg border border-border space-y-1">
                    <div><span className="font-semibold text-foreground">Respect &amp; Objections:</span> Fairly summarizes other beliefs and handles objections with charity.</div>
                    <div><span className="font-semibold text-foreground">Objection Awareness:</span> Acknowledges legitimate concerns from other worldviews before responding.</div>
                    <div><span className="font-semibold text-foreground">Evangelism:</span> Offers a clear, gracious call to repent and trust in Jesus Christ.</div>
                    <div><span className="font-semibold text-foreground">Gospel Boldness:</span> Presents the exclusivity of Christ without hedging or watering down the message.</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          {/* Right Column: Key Metrics (Sidebar) */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div className="bg-card text-card-foreground border border-border p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground">
                <TrendingUp size={20} className="text-primary" />
                Quick Stats
              </h3>
              <div className="space-y-6">
                <Stat
                  label="🏆 Highest Score"
                  value={ns?.winnerScore ?? "0"}
                  subtext={ns ? `Achieved by ${ns.winnerName}` : "Loading..."}
                  color="hsl(var(--primary))"
                />
                <div className="border-t border-border pt-4">
                  <Stat
                    label="⚡ Biggest Improvement"
                    value={bestImprovement ? `+${bestImprovement.delta}%` : "N/A"}
                    subtext={
                      ns?.improvementModel
                        ? `${ns.improvementModel} from ${baselinePromptLabelDisplay} to ${activePromptLabelDisplay}`
                        : "Insufficient Data"
                    }
                    color="hsl(var(--success))"
                  />
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Info size={16} />
                  Testing Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-start pb-3 border-b border-border">
                    <span className="text-muted-foreground">Primary Judge:</span>
                    <span className="font-medium text-foreground text-right">
                      {primaryJudge ? primaryJudge.name.replace("Graded by ", "") : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between items-start pb-3 border-b border-border">
                    <span className="text-muted-foreground">Cross-Validator{crossValidators.length !== 1 ? "s" : ""}:</span>
                    <span className="font-medium text-foreground text-right">
                      {crossValidatorNames || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between items-start pb-3 border-b border-border">
                    <span className="text-muted-foreground">System Prompt:</span>
                    <span className="font-medium text-foreground">{activePromptLabelDisplay}</span>
                  </div>
                  <div className="flex justify-between items-start pb-3 border-b border-border">
                    <span className="text-muted-foreground">Judge Fairness Prompt:</span>
                    <span className="font-medium text-foreground text-right">{judgeComparisonPromptDisplay}</span>
                  </div>
                  <div className="flex justify-between items-start pb-3 border-b border-border">
                    <span className="text-muted-foreground">Eval Framework:</span>
                    <span className="font-medium text-foreground">v2</span>
                  </div>
                  <div className="flex justify-between items-start pb-3 border-b border-border">
                    <span className="text-muted-foreground">Questions per Model:</span>
                    <span className="font-medium text-foreground">500</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-muted border border-border p-4 rounded-lg">
              <h4 className="text-foreground font-semibold mb-2 text-sm flex items-center gap-2">
                <Info size={16} />
                About These Scores
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                All models from Google, OpenAI, xAI, and Anthropic are tested against our Reformed
                theological framework. We&apos;re measuring how well they understand and communicate Reformed theology,
                how gentle and pastoral their tone is, and how they share the Gospel across different worldviews.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">5.0 = Perfect:</span> Strong doctrinal faithfulness,
                    gentle pastoral tone, and clear, respectful Gospel presentation across worldviews
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">4.0-4.9 = Strong:</span> Minor issues in nuance,
                    tone, or interfaith sensitivity but generally reliable
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">Below 4.0:</span> Needs significant theological
                    guidance
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
