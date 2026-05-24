import React from "react";
import {
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export interface CategoryScatterPoint {
  model: string;
  label: string;
  provider: string;
  providerLabel: string;
  fill: string;
  x: number;
  y: number;
}

interface CategoryScatterProps {
  data: CategoryScatterPoint[];
  xLabel: string;
  yLabel: string;
}

export function CategoryScatter({ data, xLabel, yLabel }: CategoryScatterProps) {
  // Per-axis domain so each axis is centered on its own data — combining x and y
  // produced lopsided clusters when one category had a tighter range than the other.
  const computeDomain = (values: number[]): [number, number] => {
    if (values.length === 0) return [3, 5];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = Math.max(0.05, range * 0.1);
    // Round (not floor/ceil) so the padding stays symmetric around the data
    // instead of jumping an extra 0.1 when the unrounded value lands just past
    // a tick boundary (e.g. 4.71 + 0.1 = 4.81 was ceiling to 4.9).
    const low = Math.max(0, Math.round((min - padding) * 10) / 10);
    const high = Math.min(5, Math.round((max + padding) * 10) / 10);
    return [low, high];
  };

  const xDomain = computeDomain(data.map((d) => d.x));
  const yDomain = computeDomain(data.map((d) => d.y));

  return (
    <div className="w-full min-w-0">
      <div className="h-[320px] sm:h-[380px] md:h-[440px] lg:h-[500px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              domain={xDomain}
              tick={{ fill: "hsl(var(--foreground))" }}
              tickFormatter={(val) => val.toFixed(2)}
              label={{
                value: `→ ${xLabel} (Higher = Better)`,
                position: "bottom",
                offset: 10,
                fill: "hsl(var(--foreground))",
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              domain={yDomain}
              tick={{ fill: "hsl(var(--foreground))" }}
              tickFormatter={(val) => val.toFixed(2)}
              label={{
                value: `↑ ${yLabel} (Higher = Better)`,
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
                  const point = payload[0].payload as CategoryScatterPoint;
                  return (
                    <div className="bg-popover p-3 border border-border shadow-md rounded-lg text-popover-foreground">
                      <p className="font-bold text-base mb-1">{point.label}</p>
                      <p className="text-xs text-muted-foreground mb-2">{point.providerLabel}</p>
                      <div className="text-sm space-y-1">
                        <p className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{xLabel}:</span>
                          <span className="font-semibold">{point.x.toFixed(2)}</span>
                        </p>
                        <p className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{yLabel}:</span>
                          <span className="font-semibold">{point.y.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter
              name="Models"
              data={data}
              fill="hsl(var(--chart-3))"
              shape={(props: { cx?: number; cy?: number; fill?: string }) => (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={8}
                  fill={props.fill}
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
                />
              )}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
