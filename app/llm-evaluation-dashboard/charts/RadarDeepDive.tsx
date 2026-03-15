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

interface RadarDeepDiveProps {
  data: Array<Record<string, string | number>>;
  title?: string;
  domainMin?: number;
}

export function RadarDeepDive({ data, domainMin = 3.5 }: RadarDeepDiveProps) {
  const providerKeys = Array.from(
    new Set(data.flatMap((entry) => Object.keys(entry).filter((key) => key !== "subject")))
  );

  return (
    <div className="h-96 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="hsl(var(--border))" strokeWidth={1} />
          <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 500 }} />
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
