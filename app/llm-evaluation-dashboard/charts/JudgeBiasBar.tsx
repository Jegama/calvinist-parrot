import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface JudgeBiasBarProps {
  data: Array<{ model: string; gptJudge: number; geminiJudge: number }>;
}

export function JudgeBiasBar({ data }: JudgeBiasBarProps) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={8}>
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
                dataKey === "gptJudge" ? "Graded by GPT-5 Mini (OpenAI)" : "Graded by Gemini 2.5 Flash (Google)";
              return [`${value.toFixed(2)} / 5.0`, judgeLabel];
            }}
            labelFormatter={(label) => `Model: ${label}`}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
          <Bar
            name="Graded by GPT-5 Mini (OpenAI)"
            dataKey="gptJudge"
            fill="hsl(var(--chart-2))"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            name="Graded by Gemini 2.5 Flash (Google)"
            dataKey="geminiJudge"
            fill="hsl(var(--chart-1))"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
