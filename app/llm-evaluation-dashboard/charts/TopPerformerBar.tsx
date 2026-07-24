import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
  ErrorBar,
  type LabelProps,
} from "recharts";
import { formatModelLabel, formatPromptLabel, getProviderColor, getProviderLabel } from "../constants";
import { CHART_INITIAL_DIMENSIONS } from "./chart-dimensions";

interface TopPerformerDatum {
  provider: string;
  model: string;
  promptLabel: string;
  score: number;
  stdev: number;
  fill: string;
}

interface TopPerformerBarProps {
  data: TopPerformerDatum[];
}

export function TopPerformerBar({ data }: TopPerformerBarProps) {
  const domainMinimum = 3.5;
  const chartData = data.map((item) => ({
    ...item,
    providerLabel: getProviderLabel(item.provider),
    modelLabel: formatModelLabel(item.model),
  }));
  const renderScoreLabel = ({ index, viewBox }: LabelProps) => {
    const item = index === undefined ? undefined : chartData[index];
    if (
      !item ||
      !viewBox ||
      !("x" in viewBox) ||
      !("y" in viewBox) ||
      !("width" in viewBox) ||
      !("height" in viewBox)
    ) {
      return null;
    }

    const x = Number(viewBox.x);
    const y = Number(viewBox.y);
    const width = Number(viewBox.width);
    const height = Number(viewBox.height);
    const pixelsPerPoint = width / (item.score - domainMinimum);
    const whiskerEnd = x + width + item.stdev * pixelsPerPoint;

    return (
      <text
        x={whiskerEnd + 8}
        y={y + height / 2}
        dominantBaseline="middle"
        fill="hsl(var(--foreground))"
        fontSize={13}
        fontWeight={700}
      >
        {item.score.toFixed(2)}
      </text>
    );
  };

  return (
    <div className="h-[22rem] w-full min-w-0 sm:h-80">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={240}
        minHeight={240}
        initialDimension={CHART_INITIAL_DIMENSIONS.compact}
      >
        <BarChart data={chartData} layout="vertical" margin={{ top: 6, right: 30, bottom: 4, left: 2 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            domain={[domainMinimum, 5]}
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
            cursor={{ fill: "transparent", stroke: "hsl(var(--border))", strokeWidth: 2 }}
            content={({ active, payload }) => {
              const item = payload?.[0]?.payload as
                | (TopPerformerDatum & {
                    modelLabel: string;
                    providerLabel: string;
                  })
                | undefined;
              if (!active || !item) {
                return null;
              }

              return (
                <div className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
                  <p className="font-bold">{item.modelLabel}</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {item.providerLabel} · {formatPromptLabel(item.promptLabel)}
                  </p>
                  <div className="space-y-1 text-sm">
                    <p className="flex justify-between gap-6">
                      <span className="text-muted-foreground">Mean score</span>
                      <span className="font-semibold tabular-nums">
                        {item.score.toFixed(2)} / 5.0
                      </span>
                    </p>
                    <p className="flex justify-between gap-6">
                      <span className="text-muted-foreground">Population SD</span>
                      <span className="font-semibold tabular-nums">
                        {item.stdev.toFixed(2)}
                      </span>
                    </p>
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={30}>
            <ErrorBar
              dataKey="stdev"
              direction="x"
              width={5}
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
            />
            <LabelList
              dataKey="score"
              content={renderScoreLabel}
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
