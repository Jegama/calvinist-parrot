import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { PROVIDER_LABELS } from "../constants";

interface PromptDeltaBarProps {
  data: Array<{ provider: string; v1: number; baseline: number }>;
}

export function PromptDeltaBar({ data }: PromptDeltaBarProps) {
  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <BarChart data={data} barGap={8}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="provider"
            tickFormatter={(val) => PROVIDER_LABELS[val]}
            tick={{ fill: "hsl(var(--foreground))" }}
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
            formatter={(value: number, name) => [`${value.toFixed(2)} / 5.0`, name]}
            labelFormatter={(label) => PROVIDER_LABELS[label]}
            cursor={{ fill: "transparent", stroke: "hsl(var(--border))", strokeWidth: 2 }}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
          <Bar
            name="Without Instructions (Baseline)"
            dataKey="baseline"
            fill="hsl(var(--muted-foreground))"
            radius={[4, 4, 0, 0]}
          />
          <Bar name="With Our Instructions (v1.0)" dataKey="v1" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
