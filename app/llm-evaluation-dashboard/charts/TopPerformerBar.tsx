import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from "recharts";
import { COLORS, PROVIDER_LABELS } from "../constants";

interface TopPerformerBarProps {
  data: Array<{ provider: string; model: string; promptLabel: string; score: number; fill: string }>;
}

export function TopPerformerBar({ data }: TopPerformerBarProps) {
  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" domain={[4.6, 5]} />
          <YAxis
            type="category"
            dataKey="provider"
            tickFormatter={(val, index) => {
              const item = data[index];
              return item
                ? `${PROVIDER_LABELS[val]}` +
                    `\n${item.model
                      .replace("-preview-09-2025", "")
                      .replace("-reasoning", "")
                      .replace("gpt-5-mini", "GPT-5 Mini")
                      .replace("gemini-2.5-flash", "Gemini 2.5 Flash")
                      .replace("grok-4-1-fast", "Grok 4.1 Fast")}`
                : PROVIDER_LABELS[val];
            }}
            width={200}
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
              const model = item?.model
                ?.replace("-preview-09-2025", "")
                .replace("-reasoning", "")
                .replace("gpt-5-mini", "GPT-5 Mini")
                .replace("gemini-2.5-flash", "Gemini 2.5 Flash")
                .replace("grok-4-1-fast", "Grok 4.1 Fast");
              return model ? `${PROVIDER_LABELS[provider]} — ${model}` : PROVIDER_LABELS[provider];
            }}
            labelStyle={{ fontWeight: "bold", color: "hsl(var(--foreground))" }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={40}>
            {data.map((entry, index) => (
              <React.Fragment key={`cell-${index}`}>
                <LabelList
                  dataKey="score"
                  position="right"
                  fill="hsl(var(--foreground))"
                  fontWeight="bold"
                  formatter={(value) => (typeof value === "number" ? value.toFixed(2) : value)}
                />
                <Cell fill={entry.fill || COLORS[entry.provider]} />
              </React.Fragment>
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
