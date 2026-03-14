import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatModelLabel, formatPromptLabel, getProviderColor } from "../constants";
import type { PromptDeltaRecord } from "../hooks/use-dashboard-metrics";

interface PromptDeltaBarProps {
  data: PromptDeltaRecord[];
  promptLabels: string[];
}

type PromptChartDatum = {
  provider: string;
  model: string;
  displayLabel: string;
  modelLabel: string;
} & Record<string, string | number>;

function getPromptOpacity(index: number, total: number): number {
  if (total <= 1) {
    return 1;
  }

  return 0.35 + (index / (total - 1)) * 0.65;
}

export function PromptDeltaBar({ data, promptLabels }: PromptDeltaBarProps) {
  const chartData: PromptChartDatum[] = data.map((entry) => ({
    ...entry.scores,
    provider: entry.provider,
    model: entry.model,
    displayLabel: entry.displayLabel,
    modelLabel: formatModelLabel(entry.model),
  }));
  const allValues = chartData.flatMap((entry) => promptLabels.map((label) => entry[label]).filter((value): value is number => typeof value === "number"));
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
  const domainMin = Math.max(0, Math.floor(minVal) - 0.1);
  const chartHeight = Math.max(420, chartData.length * 140);

  return (
    <div className="w-full min-w-0" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <BarChart data={chartData} layout="vertical" barGap={6} margin={{ top: 6, right: 24, bottom: 12, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            domain={[domainMin, 5]}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="displayLabel"
            width={140}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
            label={{
              value: "Provider",
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
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
            }}
            itemStyle={{ color: "hsl(var(--popover-foreground))" }}
            formatter={(value: number, name) => [`${value.toFixed(2)} / 5.0`, formatPromptLabel(String(name))]}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.modelLabel ?? "Model"}
            cursor={{ fill: "transparent", stroke: "hsl(var(--border))", strokeWidth: 2 }}
          />
          {promptLabels.map((promptLabel, promptIndex) => (
            <Bar
              key={promptLabel}
              name={formatPromptLabel(promptLabel)}
              dataKey={promptLabel}
              radius={[0, 4, 4, 0]}
              barSize={20}
            >
              {chartData.map((entry, entryIndex) => (
                <Cell
                  key={`${promptLabel}-${entryIndex}`}
                  fill={getProviderColor(entry.provider)}
                  fillOpacity={getPromptOpacity(promptIndex, promptLabels.length)}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
