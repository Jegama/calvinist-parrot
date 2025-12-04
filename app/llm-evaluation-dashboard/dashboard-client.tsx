"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LabelList,
  Cell,
} from "recharts";
import { TrendingUp, Scale, Activity, Award, Info, BookOpen } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { EvaluationRecord } from "./lib";

// --- Colors & Themes ---
// Using CSS variables for theme support
const COLORS: Record<string, string> = {
  google: "hsl(var(--chart-1))", // Warm Gold
  openai: "hsl(var(--chart-2))", // Deep Teal
  xai: "hsl(var(--chart-3))", // Royal Purple
  googleLight: "hsl(var(--chart-1) / 0.5)",
  openaiLight: "hsl(var(--chart-2) / 0.5)",
  xaiLight: "hsl(var(--chart-3) / 0.5)",
};

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google (Gemini)",
  openai: "OpenAI (GPT)",
  xai: "xAI (Grok)",
};

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

interface BestImprovementRecord {
  model: string;
  delta: string;
  baselineLabel: string;
  v1Label: string;
}

interface DashboardClientProps {
  data: EvaluationRecord[];
}

export default function DashboardClient({ data }: DashboardClientProps) {
  // --- Derived Data Calculations ---

  // 1. Best Model Per Provider (Strict Judge: GPT-5)
  const bestPerProvider = useMemo(() => {
    // Calculate True Overall Average per Model (Average of Adherence, Kindness, Interfaith)
    const modelScores: Record<
      string,
      { Provider: string; Gen_Model: string; System_Prompt_Label: string; total: number; count: number }
    > = {};

    data
      .filter((d) => d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Overall")
      .forEach((d) => {
        const key = `${d.Gen_Model}-${d.System_Prompt_Label}`;
        if (!modelScores[key]) {
          modelScores[key] = {
            Provider: d.Provider,
            Gen_Model: d.Gen_Model,
            System_Prompt_Label: d.System_Prompt_Label,
            total: 0,
            count: 0,
          };
        }
        modelScores[key].total += d.value;
        modelScores[key].count += 1;
      });

    const trueOveralls = Object.values(modelScores).map((m) => ({
      ...m,
      avgScore: (m.total / m.count).toFixed(2),
    }));

    // Find Max per provider
    const maxes: Record<string, (typeof trueOveralls)[0]> = {};
    trueOveralls.forEach((m) => {
      if (!maxes[m.Provider] || parseFloat(m.avgScore) > parseFloat(maxes[m.Provider].avgScore)) {
        maxes[m.Provider] = m;
      }
    });

    const result = Object.values(maxes).map((m) => ({
      provider: m.Provider,
      model: m.Gen_Model,
      promptLabel: m.System_Prompt_Label,
      score: parseFloat(m.avgScore),
      fill: COLORS[m.Provider],
    }));

    // Sort by score descending so the best model is at the top of the chart
    return result.sort((a, b) => b.score - a.score);
  }, [data]);

  // 2. System Prompt Delta (Vanilla vs v1.0) - GPT-5 Judge
  const promptDelta = useMemo(() => {
    // Use the best/flagship model from each provider for comparison
    const modelMapping = {
      google: "gemini-2.5-flash-preview-09-2025",
      xai: "grok-4-1-fast-reasoning",
      openai: "gpt-5-mini",
    };

    return Object.entries(modelMapping).map(([provider, genModel]) => {
      const calcAvg = (gm: string, prompt: string) => {
        const scores = data.filter(
          (d) =>
            d.Judge_Model === "gpt-5-mini" &&
            d.Gen_Model === gm &&
            d.System_Prompt_Label === prompt &&
            d.subCriterion === "Overall"
        );
        if (scores.length === 0) return 0;
        const total = scores.reduce((sum, curr) => sum + curr.value, 0);
        return (total / scores.length).toFixed(2);
      };

      return {
        provider,
        v1: parseFloat(calcAvg(genModel, "v1_0") as string),
        baseline: parseFloat(calcAvg(genModel, "baseline") as string),
      };
    });
  }, [data]);

  // 2.5 Best Improvement Calculation
  const bestImprovement = useMemo<BestImprovementRecord | null>(() => {
    // Group by Gen_Model + System_Prompt_Label
    const scoresByKey: Record<
      string,
      { Gen_Model: string; System_Prompt_Label: string; total: number; count: number }
    > = {};

    data
      .filter((d) => d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Overall")
      .forEach((d) => {
        const key = `${d.Gen_Model}-${d.System_Prompt_Label}`;
        if (!scoresByKey[key]) {
          scoresByKey[key] = { Gen_Model: d.Gen_Model, System_Prompt_Label: d.System_Prompt_Label, total: 0, count: 0 };
        }
        scoresByKey[key].total += d.value;
        scoresByKey[key].count += 1;
      });

    const allScores = Object.values(scoresByKey).map((s) => ({
      model: s.Gen_Model,
      prompt: s.System_Prompt_Label,
      score: s.total / s.count,
    }));

    // Now find models that have both 'baseline' and 'v1_0'
    const models = Array.from(new Set(allScores.map((s) => s.model)));
    let maxDelta = -1;
    let bestRecord: BestImprovementRecord | null = null;

    models.forEach((m) => {
      const baseline = allScores.find((s) => s.model === m && s.prompt === "baseline");
      const v1 = allScores.find((s) => s.model === m && s.prompt === "v1_0");

      if (baseline && v1) {
        const delta = ((v1.score - baseline.score) / baseline.score) * 100;
        if (delta > maxDelta) {
          maxDelta = delta;
          bestRecord = {
            model: m.replace("-preview-09-2025", "").replace("-reasoning", ""),
            delta: delta.toFixed(0),
            baselineLabel: "baseline",
            v1Label: "v1_0",
          };
        }
      }
    });

    return bestRecord;
  }, [data]);

  // 3. Judge Bias Data
  const judgeComparison = useMemo(() => {
    // Find models that were judged by BOTH
    // We need to find models that appear with both judges
    const models = Array.from(new Set(data.map((d) => d.Gen_Model)));

    const comparisonData = models
      .map((model) => {
        const gptJudgeScores = data.filter(
          (d) => d.Gen_Model === model && d.Judge_Model === "gpt-5-mini" && d.subCriterion === "Overall"
        );
        const geminiJudgeScores = data.filter(
          (d) =>
            d.Gen_Model === model &&
            d.Judge_Model === "gemini-2.5-flash-preview-09-2025" &&
            d.subCriterion === "Overall"
        );

        if (gptJudgeScores.length === 0 || geminiJudgeScores.length === 0) return null;

        const gptAvg = gptJudgeScores.reduce((acc, curr) => acc + curr.value, 0) / gptJudgeScores.length;
        const geminiAvg = geminiJudgeScores.reduce((acc, curr) => acc + curr.value, 0) / geminiJudgeScores.length;

        return {
          model: model.replace("-preview-09-2025", "").replace("-reasoning", ""),
          gptJudge: parseFloat(gptAvg.toFixed(2)),
          geminiJudge: parseFloat(geminiAvg.toFixed(2)),
        };
      })
      .filter(Boolean);

    return comparisonData;
  }, [data]);

  // 4. Provider Spread (Min vs Max)
  const providerSpread = useMemo(() => {
    // Get all true averages for all models (GPT Judge only, v1_0 prompt only)
    const modelScores: Record<string, { Provider: string; Gen_Model: string; total: number; count: number }> = {};
    data
      .filter((d) => d.Judge_Model === "gpt-5-mini" && d.System_Prompt_Label === "v1_0" && d.subCriterion === "Overall")
      .forEach((d) => {
        if (!modelScores[d.id]) {
          modelScores[d.id] = { Provider: d.Provider, Gen_Model: d.Gen_Model, total: 0, count: 0 };
        }
        modelScores[d.id].total += d.value;
        modelScores[d.id].count += 1;
      });

    const scores = Object.values(modelScores).map((m) => ({
      provider: m.Provider,
      model: m.Gen_Model,
      score: m.total / m.count,
    }));

    const result = ["google", "openai", "xai"]
      .map((p) => {
        const pScores = scores.filter((s) => s.provider === p);
        if (pScores.length === 0) return null;

        const minModel = pScores.reduce((prev, curr) => (prev.score < curr.score ? prev : curr));
        const maxModel = pScores.reduce((prev, curr) => (prev.score > curr.score ? prev : curr));

        return {
          provider: p,
          min: minModel.score,
          max: maxModel.score,
          minModel: minModel.model,
          maxModel: maxModel.model,
          avg: (pScores.reduce((a, b) => a + b.score, 0) / pScores.length).toFixed(2),
          fill: COLORS[p],
          label: PROVIDER_LABELS[p],
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return result;
  }, [data]);

  // 5. Radar Data (Top 3 Models)
  const radarData = useMemo(() => {
    const criteria = ["Adherence", "Kindness_and_Gentleness", "Interfaith_Sensitivity"];
    // Select best model ID for each provider
    const bestIds = bestPerProvider
      .map((b) => {
        // Find the ID corresponding to the best model
        const match = data.find(
          (d) => d.Gen_Model === b.model && d.System_Prompt_Label === "v1_0" && d.Judge_Model === "gpt-5-mini"
        );
        return match ? match.id : null;
      })
      .filter(Boolean);

    return criteria.map((crit) => {
      const entry: Record<string, string | number> = { subject: crit.replace(/_/g, " ") };
      bestIds.forEach((id) => {
        if (!id) return;
        const val = data.find((d) => d.id === id && d.criterion === crit && d.subCriterion === "Overall");
        if (val) {
          entry[val.Provider] = val.value;
        }
      });
      return entry;
    });
  }, [bestPerProvider, data]);

  return (
    <div className="bg-background min-h-screen p-4 md:p-8 font-sans text-foreground">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">AI Model Performance Dashboard</h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl">
            Which AI is best at answering theological questions? We tested Google, OpenAI, and xAI models to find out.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="bg-muted px-3 py-1 rounded-full">📊 500+ Questions Tested</span>
            <span className="bg-muted px-3 py-1 rounded-full">🎯 3 Major Categories</span>
            <span className="bg-muted px-3 py-1 rounded-full">🤖 6 Models Compared</span>
          </div>
        </div>
        <Link href="/llm-evaluation-dashboard/framework">
          <Button variant="outline" className="gap-2 whitespace-nowrap">
            <BookOpen size={16} />
            View Framework
          </Button>
        </Link>
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
                <div className="text-muted-foreground">OpenAI GPT-5 Mini scored 4.79/5.0</div>
              </div>
              <div>
                <div className="font-semibold text-foreground mb-1">⚡ Biggest Impact</div>
                <div className="text-muted-foreground">Custom instructions improved Gemini 2.5 by +12%</div>
              </div>
              <div>
                <div className="font-semibold text-foreground mb-1">💪 Runner-Up</div>
                <div className="text-muted-foreground">xAI Grok 4.1 scored 4.73/5.0</div>
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
                    The best model from each AI company, scored on overall performance (out of 5.0)
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bestPerProvider} layout="vertical" margin={{ left: 20, right: 30, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" domain={[4.6, 5]} />
                        <YAxis
                          type="category"
                          dataKey="provider"
                          tickFormatter={(val, index) => {
                            const item = bestPerProvider[index];
                            return item
                              ? `${PROVIDER_LABELS[val]}\n${item.model
                                  .replace("-preview-09-2025", "")
                                  .replace("-reasoning", "")
                                  .replace("gpt-5-mini", "GPT-5 Mini")
                                  .replace("gemini-2.5-flash", "Gemini 2.5")
                                  .replace("grok-4-1-fast", "Grok 4.1")}`
                              : PROVIDER_LABELS[val];
                          }}
                          width={200}
                          tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            borderColor: "hsl(var(--border))",
                            color: "hsl(var(--popover-foreground))",
                            borderRadius: "var(--radius)",
                          }}
                          cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                          formatter={(value: number) => [`${value.toFixed(2)} / 5.0`, "Score"]}
                          labelStyle={{ fontWeight: "bold" }}
                        />
                        <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={40}>
                          {bestPerProvider.map((entry, index) => (
                            <React.Fragment key={`cell-${index}`}>
                              <LabelList
                                dataKey="score"
                                position="right"
                                fill="hsl(var(--foreground))"
                                fontWeight="bold"
                                formatter={(value) => (typeof value === "number" ? value.toFixed(2) : value)}
                              />
                              <Cell fill={entry.fill} />
                            </React.Fragment>
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                    <span className="font-semibold text-foreground">💡 What this means:</span> OpenAI&apos;s GPT-5 Mini
                    comes out on top with 4.79, followed by xAI&apos;s Grok 4.1 at 4.73, and Google&apos;s Gemini 2.5 at
                    4.70. All three are strong performers, with GPT-5 Mini having a slight edge in interfaith
                    conversations.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">⚡ Does Our Custom Prompt Help?</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    Comparing models with our special instructions (v1.0) versus using them &quot;out of the box&quot;
                    (Baseline)
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={promptDelta} barGap={8}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="provider"
                          tickFormatter={(val) => PROVIDER_LABELS[val]}
                          tick={{ fill: "hsl(var(--foreground))" }}
                        />
                        <YAxis
                          domain={[4.5, 5.05]}
                          tick={{ fill: "hsl(var(--foreground))" }}
                          label={{
                            value: "Score (out of 5)",
                            angle: -90,
                            position: "insideLeft",
                            style: { fill: "hsl(var(--foreground))", textAnchor: "middle" },
                            offset: 5,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            borderColor: "hsl(var(--border))",
                            color: "hsl(var(--popover-foreground))",
                            borderRadius: "var(--radius)",
                          }}
                          formatter={(value: number) => value.toFixed(2)}
                        />
                        <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
                        <Bar
                          name="Without Instructions (Baseline)"
                          dataKey="baseline"
                          fill="hsl(var(--muted-foreground))"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          name="With Our Instructions (v1.0)"
                          dataKey="v1"
                          fill="hsl(var(--primary))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                      <span className="font-semibold text-foreground">💡 What this means:</span> Our custom instructions
                      make a<span className="text-primary font-bold"> huge difference</span> for Gemini 2.5 (+12%
                      improvement!). Without instructions, Gemini 2.5 struggled with evangelism questions. With our
                      guidance, it catches up closer to the others.
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-background border border-border rounded p-2 text-center">
                        <div className="font-bold text-foreground">Gemini 2.5</div>
                        <div className="text-primary text-lg font-bold">+12%</div>
                      </div>
                      <div className="bg-background border border-border rounded p-2 text-center">
                        <div className="font-bold text-foreground">Grok 4.1</div>
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
                    We used two different AIs to grade the same answers. Do they agree?
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={judgeComparison} barGap={8}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="model"
                          tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis
                          domain={[4, 5]}
                          tick={{ fill: "hsl(var(--foreground))" }}
                          label={{
                            value: "Score (out of 5)",
                            angle: -90,
                            position: "insideLeft",
                            style: { fill: "hsl(var(--foreground))", textAnchor: "middle" },
                            offset: 5,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            borderColor: "hsl(var(--border))",
                            color: "hsl(var(--popover-foreground))",
                            borderRadius: "var(--radius)",
                          }}
                          cursor={{ fill: "transparent", stroke: "hsl(var(--border))", strokeWidth: 2 }}
                          formatter={(value: number) => [value.toFixed(2), ""]}
                        />
                        <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
                        <Bar
                          name="Graded by GPT-5 (OpenAI)"
                          dataKey="gptJudge"
                          fill="hsl(var(--chart-2))"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          name="Graded by Gemini (Google)"
                          dataKey="geminiJudge"
                          fill="hsl(var(--chart-1))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border flex items-start gap-2">
                      <Info size={16} className="mt-0.5 flex-shrink-0 text-foreground" />
                      <div>
                        <span className="font-semibold text-foreground">💡 What this means:</span> Gemini is an
                        <span className="font-bold text-foreground"> easy grader</span>—it gives almost every model a
                        perfect 5.0! GPT-5 is more critical and gives more useful feedback by showing actual differences
                        between models.
                      </div>
                    </div>
                    <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg text-sm">
                      <div className="font-semibold text-foreground mb-1">📌 Why this matters:</div>
                      <div className="text-muted-foreground">
                        We use GPT-5 as our main judge because it provides more detailed, nuanced scores. This helps us
                        see real differences between models instead of just getting all perfect scores.
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
                    Some companies have all great models. Others have one star and some duds. Here&apos;s the
                    comparison.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="aspect-square w-full max-h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          type="number"
                          dataKey="max"
                          name="Best Model Score"
                          domain={[4.5, 4.9]}
                          tick={{ fill: "hsl(var(--foreground))" }}
                          label={{
                            value: "→ Best Model Score (Higher = Better)",
                            position: "bottom",
                            offset: 10,
                            fill: "hsl(var(--foreground))",
                            fontSize: 12,
                          }}
                        />
                        <YAxis
                          type="number"
                          dataKey="min"
                          name="Worst Model Score"
                          domain={[4.5, 4.9]}
                          tick={{ fill: "hsl(var(--foreground))" }}
                          tickFormatter={(val) => val.toFixed(2)}
                          label={{
                            value: "↑ Worst Model Score (Higher = Better)",
                            angle: -90,
                            position: "insideLeft",
                            fill: "hsl(var(--foreground))",
                            textAnchor: "middle",
                            offset: -5,
                            fontSize: 12,
                          }}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          content={({ payload }) => {
                            if (payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-popover p-3 border border-border shadow-md rounded-lg text-popover-foreground">
                                  <p className="font-bold text-base mb-2">{data.label}</p>
                                  <div className="text-sm space-y-1">
                                    <p className="flex justify-between gap-4">
                                      <span className="text-muted-foreground">Best Model:</span>
                                      <span className="font-semibold">{data.max.toFixed(2)}</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      {data.maxModel.replace("-preview-09-2025", "").replace("-reasoning", "").replace("-fast", "")}
                                    </p>
                                    <p className="flex justify-between gap-4">
                                      <span className="text-muted-foreground">Worst Model:</span>
                                      <span className="font-semibold">{data.min.toFixed(2)}</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      {data.minModel.replace("-preview-09-2025", "").replace("-reasoning", "").replace("-fast", "")}
                                    </p>
                                    <div className="pt-2 mt-2 border-t border-border">
                                      <p className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Range:</span>
                                        <span className="font-bold text-primary">
                                          {(data.max - data.min).toFixed(2)}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Scatter name="Providers" data={providerSpread} fill="hsl(var(--chart-3))" shape="circle">
                          {providerSpread.map((entry: { fill: string }, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                          <LabelList
                            dataKey="label"
                            position="top"
                            fill="hsl(var(--foreground))"
                            fontSize={12}
                            fontWeight="bold"
                          />
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
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
                            Most consistent. GPT-5 Mini (4.79) and GPT-4.1 Mini (4.59) both score high—only 0.20 difference.
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
                            More variation. Grok 4.1 (4.73) is excellent, but Grok 3 Mini (4.59) lags behind—0.14 difference.
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
                            Biggest gap. Gemini 2.5 (4.70) performs well, but Gemini 2.0 (4.25) struggles—0.45 difference.
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
                    Breaking down performance across three key areas: accuracy, tone, and evangelism
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="hsl(var(--border))" strokeWidth={1} />
                        <PolarAngleAxis
                          dataKey="subject"
                          tick={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 500 }}
                        />
                        <PolarRadiusAxis
                          angle={30}
                          domain={[4.5, 5]}
                          tick={{ fill: "hsl(var(--foreground))", fontSize: 10 }}
                          tickCount={6}
                        />
                        <Radar
                          name="Google Gemini 2.5"
                          dataKey="google"
                          stroke={COLORS.google}
                          fill={COLORS.google}
                          fillOpacity={0.2}
                          strokeWidth={2}
                        />
                        <Radar
                          name="OpenAI GPT-5"
                          dataKey="openai"
                          stroke={COLORS.openai}
                          fill={COLORS.openai}
                          fillOpacity={0.2}
                          strokeWidth={2}
                        />
                        <Radar
                          name="xAI Grok 4.1"
                          dataKey="xai"
                          stroke={COLORS.xai}
                          fill={COLORS.xai}
                          fillOpacity={0.2}
                          strokeWidth={2}
                        />
                        <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            borderColor: "hsl(var(--border))",
                            color: "hsl(var(--popover-foreground))",
                            borderRadius: "var(--radius)",
                          }}
                          formatter={(value: number) => value.toFixed(2)}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                      <span className="font-semibold text-foreground">💡 What this means:</span> All three models
                      perform nearly identically on theological accuracy (&quot;Adherence&quot;: 4.96-4.98) and pastoral tone
                      (&quot;Kindness&quot;: 4.93-5.00). The <span className="font-bold text-foreground">key difference</span> is
                      &quot;Interfaith Sensitivity&quot; (4.21-4.39)—how well they handle conversations with people from other
                      faiths. GPT-5 Mini leads here with 4.39.
                    </div>
                    <div className="grid gap-2 text-xs">
                      <div className="bg-background border border-border rounded p-3">
                        <div className="font-bold text-foreground mb-1">📖 Adherence (4.96-4.98)</div>
                        <div className="text-muted-foreground">
                          How well the model sticks to Reformed theology and uses Scripture correctly. All models excel here.
                        </div>
                      </div>
                      <div className="bg-background border border-border rounded p-3">
                        <div className="font-bold text-foreground mb-1">❤️ Kindness and Gentleness (4.93-5.00)</div>
                        <div className="text-muted-foreground">
                          Whether responses are warm, pastoral, and respectful—even when correcting errors. GPT-5 Mini scores perfect 5.0.
                        </div>
                      </div>
                      <div className="bg-background border border-border rounded p-3">
                        <div className="font-bold text-foreground mb-1">🤝 Interfaith Sensitivity (4.21-4.39)</div>
                        <div className="text-muted-foreground">
                          How well the model shares the Gospel with people from other religions while being respectful. This is the hardest category for all models.
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
                              .replace("gemini-2.5-flash", "Gemini 2.5")
                              .replace("grok-4-1-fast", "Grok 4.1");
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
                            "Gemini 2.5"
                          )} with our custom instructions`
                        : "Insufficient Data"
                    }
                    color="hsl(var(--chart-1))"
                  />
                </div>
                <div className="border-t border-primary-foreground/20 pt-4">
                  <Stat
                    label="🎯 Hardest Category"
                    value="Evangelism"
                    subtext="Average: 3.8 / 5.0 — Sharing the Gospel clearly is tough!"
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
                measuring how well they understand and communicate Reformed theology.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">5.0 = Perfect:</span> Theologically accurate,
                    pastoral tone, clear Gospel presentation
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">4.0-4.9 = Strong:</span> Minor issues but generally
                    reliable
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
