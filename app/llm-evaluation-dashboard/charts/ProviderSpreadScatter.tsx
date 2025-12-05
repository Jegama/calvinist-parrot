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

interface ProviderSpreadScatterProps {
  data: Array<{
    provider: string;
    min: number;
    max: number;
    minModel: string;
    maxModel: string;
    avg: string;
    fill: string;
    label: string;
  }>;
}

export function ProviderSpreadScatter({ data }: ProviderSpreadScatterProps) {
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
            domain={[4.5, 4.9]}
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
            domain={[4.5, 4.9]}
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
                        {point.maxModel.replace("-preview-09-2025", "").replace("-reasoning", "").replace("-fast", "")}
                      </p>
                      <p className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Worst Model:</span>
                        <span className="font-semibold">{point.min.toFixed(2)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {point.minModel.replace("-preview-09-2025", "").replace("-reasoning", "").replace("-fast", "")}
                      </p>
                      <div className="pt-2 mt-2 border-t border-border">
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
