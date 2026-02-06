import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { COLORS } from "../constants";

interface JudgeBiasBarProps {
  data: Array<{ model: string; gptJudge: number; geminiJudge: number; claudeJudge: number }>;
}

export function JudgeBiasBar({ data }: JudgeBiasBarProps) {
  return (
    <div className="h-80 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <BarChart data={data} barGap={4}>
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
            formatter={(value: number, _name, entry) => {
              const dataKey = (entry as { dataKey?: string })?.dataKey;
              const judgeLabel =
                dataKey === "gptJudge"
                  ? "Graded by GPT-5 Mini (OpenAI)"
                  : dataKey === "geminiJudge"
                    ? "Graded by Gemini 2.5 Flash (Google)"
                    : "Graded by Claude Haiku 4.5 (Anthropic)";
              return [value > 0 ? `${value.toFixed(2)} / 5.0` : "N/A", judgeLabel];
            }}
            labelFormatter={(label) => `Model: ${label}`}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
          <Bar
            name="Graded by GPT-5 Mini (OpenAI)"
            dataKey="gptJudge"
            fill={COLORS.openai}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            name="Graded by Gemini 2.5 Flash (Google)"
            dataKey="geminiJudge"
            fill={COLORS.google}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            name="Graded by Claude Haiku 4.5 (Anthropic)"
            dataKey="claudeJudge"
            fill={COLORS.anthropic}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
