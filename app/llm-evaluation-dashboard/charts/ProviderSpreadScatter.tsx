import React from "react";
import {
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatModelLabel, formatPromptLabel } from "../constants";

interface ProviderSpreadScatterProps {
  data: Array<{
    provider: string;
    min: number;
    max: number;
    minModel: string;
    maxModel: string;
    minPromptLabel: string;
    maxPromptLabel: string;
    runCount: number;
    avg: string;
    fill: string;
    label: string;
  }>;
}

export function ProviderSpreadScatter({ data }: ProviderSpreadScatterProps) {
  // Compute domain from data with 0.2 padding
  const allValues = data.flatMap((d) => [d.min, d.max]);
  const dataMin = allValues.length > 0 ? Math.min(...allValues) + 0.2 : 3.5;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) - 0.2 : 5;
  const domainLow = Math.floor((dataMin - 0.2) * 10) / 10;
  const domainHigh = Math.ceil((dataMax + 0.2) * 10) / 10;

  return (
    <div className="w-full min-w-0">
      <div className="h-[320px] sm:h-[380px] md:h-[440px] lg:h-[500px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            dataKey="max"
            name="Best Model Score"
            domain={[domainLow, domainHigh]}
            tick={{ fill: "hsl(var(--foreground))" }}
            label={{
              value: "→ Best Model Score (Higher = Better)",
              position: "bottom",
              offset: 10,
              fill: "hsl(var(--foreground))",
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="min"
            name="Worst Model Score"
            domain={[domainLow, domainHigh]}
            tick={{ fill: "hsl(var(--foreground))" }}
            tickFormatter={(val) => val.toFixed(2)}
            label={{
              value: "↑ Worst Model Score (Higher = Better)",
              angle: -90,
              position: "insideLeft",
              fill: "hsl(var(--foreground))",
              textAnchor: "middle",
              offset: -5,
              fontSize: 12,
            }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              if (payload && payload.length) {
                const point = payload[0].payload;
                return (
                  <div className="bg-popover p-3 border border-border shadow-md rounded-lg text-popover-foreground">
                    <p className="font-bold text-base mb-2">{point.label}</p>
                    <div className="text-sm space-y-1">
                      <p className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Best Model:</span>
                        <span className="font-semibold">{point.max.toFixed(2)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {formatModelLabel(point.maxModel)} on {formatPromptLabel(point.maxPromptLabel)}
                      </p>
                      <p className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Worst Model:</span>
                        <span className="font-semibold">{point.min.toFixed(2)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {formatModelLabel(point.minModel)} on {formatPromptLabel(point.minPromptLabel)}
                      </p>
                      <div className="pt-2 mt-2 border-t border-border">
                        <p className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Non-baseline runs:</span>
                          <span className="font-semibold">{point.runCount}</span>
                        </p>
                        <p className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Range:</span>
                          <span className="font-bold text-primary">{(point.max - point.min).toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Scatter name="Providers" data={data} fill="hsl(var(--chart-3))" shape="circle">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
            <LabelList dataKey="label" position="top" fill="hsl(var(--foreground))" fontSize={12} fontWeight="bold" />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
