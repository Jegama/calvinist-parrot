import React from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getProviderColor, getProviderLabel } from "../constants";
import { CHART_INITIAL_DIMENSIONS } from "./chart-dimensions";

interface RadarDeepDiveProps {
  data: Array<Record<string, string | number>>;
  title?: string;
  domainMin?: number;
}

function renderAxisLabel({
  x,
  y,
  payload,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string };
}) {
  const lines: string[] = [];
  for (const word of String(payload?.value ?? "").split(" ")) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]} ${word}`.length <= 15)
      lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill="hsl(var(--foreground))"
      fontSize={11}
    >
      {lines.map((line, index) => (
        <tspan
          key={index}
          x={x}
          dy={index === 0 ? -(lines.length - 1) * 6 : 12}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function RadarDeepDive({ data, domainMin = 3.5 }: RadarDeepDiveProps) {
  const providerKeys = Array.from(
    new Set(
      data.flatMap((entry) =>
        Object.keys(entry).filter((key) => key !== "subject"),
      ),
    ),
  );

  return (
    <div className="h-96 w-full min-w-0">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={240}
        minHeight={240}
        initialDimension={CHART_INITIAL_DIMENSIONS.radar}
      >
        <RadarChart cx="50%" cy="50%" outerRadius="55%" data={data}>
          <PolarGrid stroke="hsl(var(--border))" strokeWidth={1} />
          <PolarAngleAxis dataKey="subject" tick={renderAxisLabel} />
          <PolarRadiusAxis
            angle={30}
            domain={[domainMin, 5]}
            tick={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          {providerKeys.map((providerKey) => (
            <Radar
              key={providerKey}
              name={getProviderLabel(providerKey)}
              dataKey={providerKey}
              stroke={getProviderColor(providerKey)}
              fill={getProviderColor(providerKey)}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          ))}
          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              borderColor: "hsl(var(--border))",
              color: "hsl(var(--popover-foreground))",
              borderRadius: "var(--radius)",
            }}
            formatter={(value: number) => value.toFixed(2)}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
