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
import { COLORS } from "../constants";

interface RadarDeepDiveProps {
  data: Array<Record<string, string | number>>;
  title?: string;
  domainMin?: number;
}

export function RadarDeepDive({ data, domainMin = 3.5 }: RadarDeepDiveProps) {
  const hasAnthropic = data.some((d) => "anthropic" in d);

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
          <Radar
            name="Google Gemini 3 Flash"
            dataKey="google"
            stroke={COLORS.google}
            fill={COLORS.google}
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Radar
            name="OpenAI GPT-5 Mini"
            dataKey="openai"
            stroke={COLORS.openai}
            fill={COLORS.openai}
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Radar
            name="xAI Grok 4.1 Fast"
            dataKey="xai"
            stroke={COLORS.xai}
            fill={COLORS.xai}
            fillOpacity={0.2}
            strokeWidth={2}
          />
          {hasAnthropic && (
            <Radar
              name="Anthropic Claude Haiku 4.5"
              dataKey="anthropic"
              stroke={COLORS.anthropic}
              fill={COLORS.anthropic}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          )}
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
