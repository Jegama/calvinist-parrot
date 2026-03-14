import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from "recharts";
import { formatModelLabel, formatPromptLabel, getProviderColor, getProviderLabel } from "../constants";

interface TopPerformerBarProps {
  data: Array<{ provider: string; model: string; promptLabel: string; score: number; fill: string }>;
}

export function TopPerformerBar({ data }: TopPerformerBarProps) {
  const chartData = data.map((item) => ({
    ...item,
    providerLabel: getProviderLabel(item.provider),
    modelLabel: formatModelLabel(item.model),
  }));

  return (
    <div className="h-[22rem] w-full min-w-0 sm:h-80">
      <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 6, right: 30, bottom: 4, left: 2 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            domain={[3.5, 5]}
            ticks={[3.5, 4, 4.5, 5]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            type="category"
            dataKey="providerLabel"
            width={120}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              borderColor: "hsl(var(--border))",
              color: "hsl(var(--foreground))",
              borderRadius: "var(--radius)",
            }}
            cursor={{ fill: "transparent", stroke: "hsl(var(--border))", strokeWidth: 2 }}
            formatter={(value: number, _name, props) => {
              const payload = props?.payload as { promptLabel?: string } | undefined;
              const label = payload?.promptLabel ? formatPromptLabel(payload.promptLabel) : "Score";
              return [`${value.toFixed(2)} / 5.0`, label];
            }}
            labelFormatter={(provider, payload) => {
              const item = payload?.[0]?.payload;
              return item?.modelLabel ?? provider;
            }}
            labelStyle={{ fontWeight: "bold", color: "hsl(var(--foreground))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={30}>
            <LabelList
              dataKey="score"
              position="right"
              fill="hsl(var(--foreground))"
              fontWeight="bold"
              formatter={(value) => (typeof value === "number" ? value.toFixed(2) : value)}
            />
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill || getProviderColor(entry.provider)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
