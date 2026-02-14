import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { COLORS } from "../constants";

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-3-flash": "Gemini 3 Flash",
  "gpt-5-mini": "GPT-5 Mini",
  "grok-4-1-fast": "Grok 4.1 Fast",
  "claude-haiku-4-5": "Claude Haiku 4.5",
};

interface PromptDeltaBarProps {
  data: Array<{ model: string; provider: string; v1: number; baseline: number }>;
}

export function PromptDeltaBar({ data }: PromptDeltaBarProps) {
  const allValues = data.flatMap((d) => [d.v1, d.baseline]);
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
  const domainMin = Math.floor(minVal ) - 0.1;

  return (
    <div className="h-80 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <BarChart data={data} barGap={8}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="model"
            tickFormatter={(val) => MODEL_DISPLAY_NAMES[val] || val}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            domain={[domainMin, 5]}
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
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"
            }}
            itemStyle={{ color: "hsl(var(--popover-foreground))" }}
            formatter={(value: number, name) => [`${value.toFixed(2)} / 5.0`, name]}
            labelFormatter={(label) => MODEL_DISPLAY_NAMES[label] || label}
            cursor={{ fill: "transparent", stroke: "hsl(var(--border))", strokeWidth: 2 }}
          />
          <Legend
            content={() => (
              <div className="flex justify-center gap-6 pt-5 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-muted-foreground" />
                  <span className="text-muted-foreground">Without Instructions (Baseline)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <span className="text-foreground">With Our Instructions (v1.0)</span>
                </div>
              </div>
            )}
          />
          <Bar
            name="Without Instructions (Baseline)"
            dataKey="baseline"
            radius={[4, 4, 0, 0]}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-base-${index}`}
                fill={COLORS[`${entry.provider}Light`] || "hsl(var(--muted-foreground))"}
              />
            ))}
          </Bar>
          <Bar
            name="With Our Instructions (v1.0)"
            dataKey="v1"
            radius={[4, 4, 0, 0]}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-v1-${index}`}
                fill={COLORS[entry.provider] || "hsl(var(--primary))"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
