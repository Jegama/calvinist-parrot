"use client";

import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatModelLabel, getProviderColor, getProviderLabel } from "../constants";
import type { JudgePairPoint } from "../judge-analysis";
import { CHART_INITIAL_DIMENSIONS } from "./chart-dimensions";

interface JudgeAgreementScatterProps {
  data: JudgePairPoint[];
  primaryLabel: string;
  comparisonLabel: string;
}

interface ChartPoint extends JudgePairPoint {
  x: number;
  y: number;
  fill: string;
}

export function JudgeAgreementScatter({
  data,
  primaryLabel,
  comparisonLabel,
}: JudgeAgreementScatterProps) {
  const chartData: ChartPoint[] = data.map((point) => ({
    ...point,
    x: point.primaryMean,
    y: point.comparisonMean,
    fill: getProviderColor(point.provider),
  }));
  const values = chartData.flatMap((point) => [point.x, point.y]);
  const observedMin = values.length > 0 ? Math.min(...values) : 3;
  const observedMax = values.length > 0 ? Math.max(...values) : 5;
  const padding = Math.max(0.1, (observedMax - observedMin) * 0.12);
  const domain: [number, number] = [
    Math.max(1, Math.floor((observedMin - padding) * 10) / 10),
    Math.min(5, Math.ceil((observedMax + padding) * 10) / 10),
  ];
  if (domain[0] === domain[1]) {
    domain[0] = Math.max(1, domain[0] - 0.1);
    domain[1] = Math.min(5, domain[1] + 0.1);
  }

  return (
    <div className="h-[360px] w-full min-w-0 md:h-[460px]">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={240}
        minHeight={280}
        initialDimension={CHART_INITIAL_DIMENSIONS.judgeAgreement}
      >
        <ScatterChart margin={{ top: 20, right: 20, bottom: 64, left: 62 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            dataKey="x"
            domain={domain}
            name={primaryLabel}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
            tickFormatter={(value: number) => value.toFixed(1)}
            label={{
              value: `→ ${primaryLabel}`,
              position: "bottom",
              offset: 14,
              fill: "hsl(var(--foreground))",
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={domain}
            name={comparisonLabel}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
            tickFormatter={(value: number) => value.toFixed(1)}
            label={{
              value: `↑ ${comparisonLabel}`,
              angle: -90,
              position: "insideLeft",
              offset: -44,
              fill: "hsl(var(--foreground))",
              fontSize: 12,
            }}
          />
          <ReferenceLine
            segment={[
              { x: domain[0], y: domain[0] },
              { x: domain[1], y: domain[1] },
            ]}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="6 4"
            label={{
              value: "Perfect agreement",
              fill: "hsl(var(--muted-foreground))",
              fontSize: 11,
              position: "insideTopRight",
            }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined;
              if (!point) return null;
              return (
                <div className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
                  <p className="font-semibold">{formatModelLabel(point.model)}</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {getProviderLabel(point.provider)}
                  </p>
                  <p className="text-sm">
                    {primaryLabel}: <strong>{point.primaryMean.toFixed(2)}</strong>
                  </p>
                  <p className="text-sm">
                    {comparisonLabel}: <strong>{point.comparisonMean.toFixed(2)}</strong>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Difference: {point.difference >= 0 ? "+" : ""}
                    {point.difference.toFixed(2)}
                  </p>
                </div>
              );
            }}
          />
          <Scatter data={chartData} name="Shared answer sets">
            {chartData.map((point) => (
              <Cell key={point.answersLabel} fill={point.fill} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
