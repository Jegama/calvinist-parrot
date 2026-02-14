import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from "recharts";
import { COLORS, PROVIDER_LABELS } from "../constants";

interface TopPerformerBarProps {
  data: Array<{ provider: string; model: string; promptLabel: string; score: number; fill: string }>;
}

export function TopPerformerBar({ data }: TopPerformerBarProps) {
  const getModelLabel = (model: string) =>
    model
      .replace("-preview-09-2025", "")
      .replace("-preview", "")
      .replace("-reasoning", "")
      .replace("-20251001", "")
      .replace("gpt-5-mini", "GPT-5 Mini")
      .replace("gemini-2.5-flash", "Gemini 2.5 Flash")
      .replace("gemini-3-flash", "Gemini 3 Flash")
      .replace("grok-4-1-fast", "Grok 4.1 Fast")
      .replace("claude-haiku-4-5", "Claude Haiku 4.5");

  const chartData = data.map((item) => ({
    ...item,
    providerLabel: PROVIDER_LABELS[item.provider],
    modelLabel: getModelLabel(item.model),
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
              const label = payload?.promptLabel ? payload.promptLabel : "Score";
              return [`${value.toFixed(2)} / 5.0`, label];
            }}
            labelFormatter={(provider, payload) => {
              const item = payload?.[0]?.payload;
              const model = item?.modelLabel;
              return model ? `${PROVIDER_LABELS[provider]} — ${model}` : PROVIDER_LABELS[provider];
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
              <Cell key={`cell-${index}`} fill={entry.fill || COLORS[entry.provider]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
