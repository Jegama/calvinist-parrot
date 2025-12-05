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
import { COLORS } from "./constants";

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
  const { bestPerProvider, promptDelta, bestImprovement, judgeComparison, providerSpread, radarData } =
    useDashboardMetrics(data);

  return (
    <div className="bg-background min-h-screen p-4 md:p-8 font-sans text-foreground">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">AI Model Performance Dashboard</h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-8xl">
            Which AI is most faithful and pastoral in answering theological questions? We evaluated Google, OpenAI, and
            xAI models against a Reformed Baptist framework.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="bg-muted px-3 py-1 rounded-full">📊 500+ Questions Tested</span>
            <span className="bg-muted px-3 py-1 rounded-full">🎯 3 Major Categories</span>
            <span className="bg-muted px-3 py-1 rounded-full">🤖 6 Models Compared</span>
          </div>
        </div>
        <div className="flex flex-col items-stretch sm:flex-row sm:items-center gap-2">
          <Link href="/doctrinal-statement">
            <Button variant="outline" className="w-full sm:w-auto whitespace-nowrap">
              View Doctrinal Statement
            </Button>
          </Link>
          <Link href="/llm-evaluation-dashboard/framework">
            <Button variant="outline" className="gap-2 whitespace-nowrap w-full sm:w-auto">
              <BookOpen size={16} />
              View Framework
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Overview Banner */}
      <div className="mb-6 bg-gradient-to-r from-primary/10 to-chart-1/10 border border-primary/20 rounded-lg p-4 md:p-6">
        <div className="flex items-start gap-3">
          <div className="bg-primary text-primary-foreground rounded-full p-2 flex-shrink-0">
            <TrendingUp size={20} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground mb-2">Quick Findings</h2>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-semibold text-foreground mb-1">🥇 Winner</div>
                <div className="text-muted-foreground">OpenAI GPT-5 Mini averaged 4.79/5.0 across all categories</div>
              </div>
              <div>
                <div className="font-semibold text-foreground mb-1">⚡ Biggest Impact</div>
                <div className="text-muted-foreground">Custom instructions improved Gemini 2.5 Flash by about +12%</div>
              </div>
              <div>
                <div className="font-semibold text-foreground mb-1">💪 Runner-Up</div>
                <div className="text-muted-foreground">xAI Grok 4.1 Fast averaged 4.73/5.0 across all categories</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="compare" className="w-full space-y-8">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="compare" className="gap-2">
            <TrendingUp size={16} />
            <span className="hidden sm:inline">Winners</span>
            <span className="sm:hidden">Top</span>
          </TabsTrigger>
          <TabsTrigger value="bias" className="gap-2">
            <Scale size={16} />
            <span className="hidden sm:inline">Judge Fairness</span>
            <span className="sm:hidden">Bias</span>
          </TabsTrigger>
          <TabsTrigger value="spread" className="gap-2">
            <Activity size={16} />
            <span className="hidden sm:inline">Consistency</span>
            <span className="sm:hidden">Range</span>
          </TabsTrigger>
          <TabsTrigger value="radar" className="gap-2">
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
                    The best model from each AI company, averaged across doctrinal adherence, kindness and gentleness,
                    and interfaith and worldview sensitivity (out of 5.0)
                  </p>
                </CardHeader>
                <CardContent>
                  <TopPerformerBar data={bestPerProvider} />
                  <div className="mt-4 text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                    <span className="font-semibold text-foreground">💡 What this means:</span> OpenAI&apos;s GPT-5 Mini
                    comes out on top with 4.79, followed by xAI&apos;s Grok 4.1 Fast at 4.73 and Google&apos;s Gemini
                    2.5 Flash at 4.70. All three are strong performers within our Reformed Baptist framework, with GPT-5
                    Mini showing a slight edge in interfaith and evangelism-related conversations.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">⚡ Does Our Custom Prompt Help?</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Comparing models with our Reformed Baptist instructions (v1.0) versus using them &quot;out of the
                    box&quot; (Baseline)
                  </p>
                </CardHeader>
                <CardContent>
                  <PromptDeltaBar data={promptDelta} />
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                      <span className="font-semibold text-foreground">💡 What this means:</span> Our custom instructions
                      make a<span className="text-primary font-bold"> noticeable difference</span> for Gemini 2.5 Flash
                      (about +12% improvement). Without those instructions, Gemini 2.5 Flash was less consistent,
                      especially on interfaith and evangelism prompts. With our guidance, it comes much closer to the
                      other models.
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-background border border-border rounded p-2 text-center">
                        <div className="font-bold text-foreground">Gemini 2.5 Flash</div>
                        <div className="text-primary text-lg font-bold">+12%</div>
                      </div>
                      <div className="bg-background border border-border rounded p-2 text-center">
                        <div className="font-bold text-foreground">Grok 4.1 Fast</div>
                        <div className="text-primary text-lg font-bold">+4%</div>
                      </div>
                      <div className="bg-background border border-border rounded p-2 text-center">
                        <div className="font-bold text-foreground">GPT-5 Mini</div>
                        <div className="text-primary text-lg font-bold">+6%</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bias" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">⚖️ Are AI Judges Fair?</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    We used two different AIs to grade the same answers across our three categories. Do they generally
                    agree?
                  </p>
                </CardHeader>
                <CardContent>
                  <JudgeBiasBar data={judgeComparison} />
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border flex items-start gap-2">
                      <Info size={16} className="mt-0.5 flex-shrink-0 text-foreground" />
                      <div>
                        <span className="font-semibold text-foreground">💡 What this means:</span> In our tests, Gemini
                        tends to be a very generous grader, often giving models scores near 5.0. GPT-5 Mini is more
                        discerning and uses more of the 1–5 scale, which makes its feedback more helpful for seeing real
                        differences between models.
                      </div>
                    </div>
                    <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg text-sm">
                      <div className="font-semibold text-foreground mb-1">📌 Why this matters:</div>
                      <div className="text-muted-foreground">
                        We use GPT-5 Mini as our main judge because it provides more detailed, nuanced scores in
                        adherence, kindness, and interfaith and worldview sensitivity. This helps us see real
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
                    Some companies have several consistently strong models. Others have a wider gap between their best
                    and weakest models. Here&apos;s the comparison.
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
                      <div className="flex items-start gap-2 p-2 rounded bg-background border border-border">
                        <div
                          className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                          style={{ backgroundColor: COLORS.openai }}
                        ></div>
                        <div>
                          <span className="font-bold text-foreground">OpenAI (GPT):</span>
                          <span className="text-muted-foreground">
                            {" "}
                            Most consistent. GPT-5 Mini (4.79) and GPT-4.1 Mini (4.59) both score high—only 0.20
                            difference.
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-background border border-border">
                        <div
                          className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                          style={{ backgroundColor: COLORS.xai }}
                        ></div>
                        <div>
                          <span className="font-bold text-foreground">xAI (Grok):</span>
                          <span className="text-muted-foreground">
                            {" "}
                            More variation. Grok 4.1 Fast (4.73) is excellent, but Grok 3 Mini (4.59) lags behind—0.14
                            difference.
                          </span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-2 rounded bg-background border border-border">
                        <div
                          className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                          style={{ backgroundColor: COLORS.google }}
                        ></div>
                        <div>
                          <span className="font-bold text-foreground">Google (Gemini):</span>
                          <span className="text-muted-foreground">
                            {" "}
                            Biggest gap. Gemini 2.5 Flash (4.70) performs well, but Gemini 2.0 Flash (4.25) is
                            noticeably weaker in our tests—0.45 difference.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="radar" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">🎯 Deep Dive: Where Each Model Excels</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Breaking down performance across three key areas: doctrinal adherence, kindness and gentleness, and
                    interfaith and evangelism
                  </p>
                </CardHeader>
                <CardContent>
                  <RadarDeepDive data={radarData} />
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                      <span className="font-semibold text-foreground">💡 What this means:</span> All three models
                      perform nearly identically on theological accuracy (&quot;Adherence&quot;: 4.96-4.98) and pastoral
                      tone (&quot;Kindness&quot;: 4.93-5.00). The{" "}
                      <span className="font-bold text-foreground">key difference</span> is &quot;Interfaith and
                      Worldview Sensitivity&quot; (4.21-4.39), which reflects how well they engage people from other
                      religions or secular worldviews with respect, accurate summaries, and clear Gospel invitations.
                      GPT-5 Mini leads here with 4.39.
                    </div>
                    <div className="grid gap-2 text-xs">
                      <div className="bg-background border border-border rounded p-3">
                        <div className="font-bold text-foreground mb-1">📖 Adherence (4.96-4.98)</div>
                        <div className="text-muted-foreground">
                          How well the model sticks to our Reformed Baptist doctrinal statement and uses Scripture
                          carefully, especially on core doctrines like the Trinity, the person and work of Christ, the
                          Gospel, and the authority of Scripture. All models excel here.
                        </div>
                      </div>
                      <div className="bg-background border border-border rounded p-3">
                        <div className="font-bold text-foreground mb-1">❤️ Kindness and Gentleness (4.93-5.00)</div>
                        <div className="text-muted-foreground">
                          Whether responses are warm, pastoral, patient, and respectful—even when correcting errors or
                          addressing sensitive topics. GPT-5 Mini scores a perfect 5.0.
                        </div>
                      </div>
                      <div className="bg-background border border-border rounded p-3">
                        <div className="font-bold text-foreground mb-1">🤝 Interfaith Sensitivity (4.21-4.39)</div>
                        <div className="text-muted-foreground">
                          How well the model fairly summarizes other beliefs, engages people from other religions or
                          secular backgrounds with charity, and still offers a clear, gracious call to repent and trust
                          in Jesus Christ alone. This is the hardest category for all models.
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          {/* Right Column: Key Metrics (Sidebar) */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div className="bg-primary text-primary-foreground p-6 rounded-lg shadow-lg">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <TrendingUp size={20} />
                Quick Stats
              </h3>
              <div className="space-y-6">
                <Stat
                  label="🏆 Highest Score"
                  value={bestPerProvider.length > 0 ? Math.max(...bestPerProvider.map((p) => p.score)).toFixed(2) : "0"}
                  subtext={`Achieved by ${
                    bestPerProvider.length > 0
                      ? bestPerProvider
                          .filter((p) => p.score === Math.max(...bestPerProvider.map((x) => x.score)))
                          .map((p) => {
                            const modelName = p.model
                              .replace("-preview-09-2025", "")
                              .replace("-reasoning", "")
                              .replace("gpt-5-mini", "GPT-5 Mini")
                              .replace("gemini-2.5-flash", "Gemini 2.5 Flash")
                              .replace("grok-4-1-fast", "Grok 4.1 Fast");
                            return modelName;
                          })
                          .join(" & ")
                      : "Unknown"
                  }`}
                  color="hsl(var(--primary-foreground))"
                />
                <div className="border-t border-primary-foreground/20 pt-4">
                  <Stat
                    label="⚡ Biggest Improvement"
                    value={bestImprovement ? `+${bestImprovement.delta}%` : "N/A"}
                    subtext={
                      bestImprovement
                        ? `${bestImprovement.model.replace(
                            "gemini-2.5-flash",
                            "Gemini 2.5 Flash"
                          )} with our custom instructions`
                        : "Insufficient Data"
                    }
                    color="hsl(var(--chart-1))"
                  />
                </div>
                <div className="border-t border-primary-foreground/20 pt-4">
                  <Stat
                    label="🎯 Hardest Category"
                    value="Interfaith & Evangelism"
                    subtext="Average: 3.8 / 5.0 — Sharing the Gospel clearly and kindly across worldviews is tough!"
                    color="hsl(var(--destructive-foreground))"
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
                    <span className="text-muted-foreground">Grading AI:</span>
                    <span className="font-medium text-foreground text-right">
                      GPT-5 Mini
                      <br />
                      (OpenAI)
                    </span>
                  </div>
                  <div className="flex justify-between items-start pb-3 border-b border-border">
                    <span className="text-muted-foreground">Test Version:</span>
                    <span className="font-medium text-foreground">v1.0</span>
                  </div>
                  <div className="flex justify-between items-start pb-3 border-b border-border">
                    <span className="text-muted-foreground">Questions per Model:</span>
                    <span className="font-medium text-foreground">500</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Total Data Points:</span>
                    <span className="font-medium text-foreground">{data.length.toLocaleString()}</span>
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
                All models are tested against our &quot;Reformed Baptist&quot; theological framework. We&apos;re
                measuring how well they understand and communicate Reformed theology, how gentle and pastoral their tone
                is, and how they share the Gospel across different worldviews.
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
