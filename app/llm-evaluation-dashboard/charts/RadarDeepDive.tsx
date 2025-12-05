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
}

export function RadarDeepDive({ data }: RadarDeepDiveProps) {
  return (
    <div className="h-96 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={240} minHeight={240}>
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="hsl(var(--border))" strokeWidth={1} />
          <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 500 }} />
          <PolarRadiusAxis
            angle={30}
            domain={[4.5, 5]}
            tick={{ fill: "hsl(var(--foreground))", fontSize: 10 }}
            tickCount={6}
          />
          <Radar
            name="Google Gemini 2.5 Flash"
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
