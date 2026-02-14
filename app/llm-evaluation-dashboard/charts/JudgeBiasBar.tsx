import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { JudgeInfo } from "../hooks/use-dashboard-metrics";

interface JudgeBiasBarProps {
  data: Array<Record<string, string | number>>;
  judges: JudgeInfo[];
}

export function JudgeBiasBar({ data, judges }: JudgeBiasBarProps) {
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
            domain={[3, 5]}
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
              const judge = judges.find((j) => j.key === dataKey);
              const judgeLabel = judge?.name ?? `Judge: ${dataKey}`;
              return [value > 0 ? `${value.toFixed(2)} / 5.0` : "N/A", judgeLabel];
            }}
            labelFormatter={(label) => `Model: ${label}`}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
          {judges.map((judge) => (
            <Bar
              key={judge.key}
              name={judge.name}
              dataKey={judge.key}
              fill={judge.color}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
