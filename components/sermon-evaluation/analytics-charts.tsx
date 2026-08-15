"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildSermonMetricAverageRows,
  buildSermonTrendRows,
  listAvailableSermonMetrics,
  scoreForSermonMetric,
} from "./analytics-data";
import { formatMetricLabel, formatScore } from "./format";
import type { SermonAnalyticsPoint } from "./types";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const source = payload[0]?.payload ?? {};
  return (
    <div className="max-w-xs rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
      <p className="font-medium">{String(source.title ?? label ?? "Sermon")}</p>
      {source.preacher ? <p className="text-xs text-muted-foreground">{String(source.preacher)}</p> : null}
      {typeof source.sermons === "number" ? (
        <p className="text-xs text-muted-foreground">
          {source.sermons} {source.sermons === 1 ? "sermon" : "sermons"}
        </p>
      ) : null}
      <div className="mt-2 space-y-1">
        {payload
          .filter((item) => typeof item.value === "number")
          .map((item) => (
            <p key={item.name} className="flex justify-between gap-5">
              <span className="text-muted-foreground">{item.name}</span>
              <span className="font-semibold tabular-nums">{Number(item.value).toFixed(2)}</span>
            </p>
          ))}
      </div>
    </div>
  );
}

export function SermonAnalyticsCharts({
  evaluations,
  metric,
}: {
  evaluations: SermonAnalyticsPoint[];
  metric: string;
}) {
  const availableMetrics = listAvailableSermonMetrics(evaluations);
  const trendMetric = metric;
  const sorted = [...evaluations].sort(
    (left, right) => new Date(left.preachedOn).valueOf() - new Date(right.preachedOn).valueOf(),
  );
  const preacherCounts = new Map<string, { count: number; name: string }>();
  for (const evaluation of sorted) {
    const current = preacherCounts.get(evaluation.preacherId);
    preacherCounts.set(evaluation.preacherId, {
      count: (current?.count ?? 0) + 1,
      name: evaluation.preacher,
    });
  }
  const preachers = [...preacherCounts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[1].name.localeCompare(right[1].name))
    .slice(0, 5)
    .map(([id, details]) => ({ id, name: details.name }));
  const trendRows = buildSermonTrendRows(sorted, trendMetric, preachers.map((preacher) => preacher.id));
  const accessibleTrendRows = sorted.flatMap((evaluation) => {
    if (!preachers.some((preacher) => preacher.id === evaluation.preacherId)) return [];
    const score = scoreForSermonMetric(evaluation, trendMetric);
    return score === null
      ? []
      : [[evaluation.preachedOn.slice(0, 10), evaluation.title, evaluation.preacher, formatScore(score)]];
  });

  const scatterData = sorted
    .map((evaluation) => ({
      title: evaluation.title,
      preacher: evaluation.preacher,
      durationMinutes:
        evaluation.durationSeconds === null ? null : Math.round((evaluation.durationSeconds / 60) * 10) / 10,
      impact: scoreForSermonMetric(evaluation, metric),
    }))
    .filter(
      (point): point is { title: string; preacher: string; durationMinutes: number; impact: number } =>
        point.durationMinutes !== null && point.impact !== null,
    );

  const trailingRows = preachers.map((preacher) => {
    const scores = sorted
      .filter((evaluation) => evaluation.preacherId === preacher.id)
      .map((evaluation) => scoreForSermonMetric(evaluation, metric))
      .filter((score): score is number => score !== null)
      .slice(-3);
    return {
      preacher: preacher.name,
      average: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      sermons: scores.length,
    };
  }).filter((row): row is { preacher: string; average: number; sermons: number } => row.average !== null);

  const uncertaintyRows = sorted
    .filter(
      (evaluation) =>
        evaluation.preset === "HIGH_CONFIDENCE" &&
        evaluation.overallImpactBase !== null &&
        evaluation.uncertaintyLow !== null &&
        evaluation.uncertaintyHigh !== null,
    )
    .map((evaluation) => {
      const low = evaluation.uncertaintyLow as number;
      const high = evaluation.uncertaintyHigh as number;
      const midpoint = (low + high) / 2;
      return {
        title: evaluation.title,
        preacher: evaluation.preacher,
        score: midpoint,
        finalScore: evaluation.overallImpactBase as number,
        uncertainty: [midpoint - low, high - midpoint],
      };
    });

  const metricKeys = availableMetrics.filter(
    (availableMetric) =>
      availableMetric !== "overallImpactBase" &&
      availableMetric !== "overallImpactAdjusted",
  );
  const heatmapEvaluations = sorted.slice(-20);
  const metricAverageRows = buildSermonMetricAverageRows(sorted).map((row) => ({
    ...row,
    title: formatMetricLabel(row.metric),
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="xl:col-span-2">
        <CardHeader>
          <div className="space-y-1.5">
            <CardTitle className="font-serif text-lg">
              {formatMetricLabel(trendMetric)} over preached date
            </CardTitle>
            <CardDescription>
              Compare any available scoring metric over the date each sermon was preached, grouped by preacher.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {trendRows.length > 0 ? (
            <div className="h-80 min-w-0" aria-hidden="true">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={260}
                minHeight={260}
                initialDimension={{ width: 900, height: 320 }}
              >
                <LineChart data={trendRows} margin={{ top: 8, right: 16, left: -10, bottom: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 5]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }} />
                  {preachers.map((preacher, index) => (
                    <Line
                      key={preacher.id}
                      type="monotone"
                      dataKey={`score:${preacher.id}`}
                      name={preacher.name}
                      connectNulls
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART_COLORS[index % CHART_COLORS.length] }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message="Completed sermon scores will appear here." />
          )}
          {preacherCounts.size > 5 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the five preachers with the most scored sermons. Use the Preacher filter to focus on someone else.
            </p>
          ) : null}
          {accessibleTrendRows.length > 0 ? (
            <ChartDataDetails
              caption={`${formatMetricLabel(trendMetric)} trend data`}
              headers={["Preached", "Sermon", "Preacher", "Score"]}
              rows={accessibleTrendRows}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="font-serif text-lg">Metric heatmap</CardTitle>
          <CardDescription>
            Every aggregate dimension across the latest 20 filtered sermons. Scroll horizontally to compare more sermons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {heatmapEvaluations.length > 0 && metricKeys.length > 0 ? (
            <div className="overflow-x-auto pb-2">
              <table
                className="w-max min-w-full border-separate border-spacing-1 text-xs"
                aria-label="Aggregate metric scores by sermon"
              >
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-10 min-w-44 bg-card p-2 text-left font-medium text-muted-foreground"
                    >
                      Metric
                    </th>
                    {heatmapEvaluations.map((evaluation) => (
                      <th
                        key={evaluation.id}
                        scope="col"
                        className="min-w-36 max-w-36 p-2 text-left font-medium text-muted-foreground"
                        title={evaluation.title}
                      >
                        <span className="line-clamp-2">{evaluation.title}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metricKeys.map((key) => (
                    <tr key={key}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 rounded bg-card p-2 text-left font-medium"
                      >
                        {formatMetricLabel(key)}
                      </th>
                      {heatmapEvaluations.map((evaluation) => {
                        const score = evaluation.aggregateScores[key];
                        const alpha =
                          score === undefined
                            ? 0
                            : 0.12 +
                              Math.min(1, Math.max(0, score / 5)) *
                                0.68;
                        return (
                          <td
                            key={`${evaluation.id}:${key}`}
                            className="rounded border border-border/50 p-2 text-center font-semibold tabular-nums"
                            style={
                              score === undefined
                                ? undefined
                                : {
                                    backgroundColor: `hsl(var(--chart-2) / ${alpha})`,
                                  }
                            }
                            title={`${evaluation.title} — ${formatMetricLabel(key)}: ${formatScore(score)}`}
                          >
                            {formatScore(score)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyChart message="Aggregate metrics will appear after an evaluation completes." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">
            Duration versus {formatMetricLabel(metric)}
          </CardTitle>
          <CardDescription>
            Compare sermon length with the dashboard&apos;s selected comparison metric.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scatterData.length > 0 ? (
            <div className="h-72 min-w-0" aria-hidden="true">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={260}
                minHeight={240}
                initialDimension={{ width: 640, height: 288 }}
              >
                <ScatterChart margin={{ top: 8, right: 12, left: -4, bottom: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="durationMinutes"
                    name="Duration"
                    unit=" min"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="impact"
                    name={formatMetricLabel(metric)}
                    domain={[0, 5]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltip />} />
                  <Scatter data={scatterData} fill="hsl(var(--chart-3))" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message="Duration data will appear after audio preparation completes." />
          )}
          {scatterData.length > 0 ? (
            <ChartDataDetails
              caption={`Duration versus ${formatMetricLabel(metric)} data`}
              headers={["Sermon", "Preacher", "Duration in minutes", "Score"]}
              rows={scatterData.map((point) => [
                point.title,
                point.preacher,
                point.durationMinutes.toFixed(1),
                formatScore(point.impact),
              ])}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Preacher trailing average</CardTitle>
          <CardDescription>
            Latest three {formatMetricLabel(metric)} scores per preacher in the current filter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trailingRows.length > 0 ? (
            <div className="h-72 min-w-0" aria-hidden="true">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={260}
                minHeight={240}
                initialDimension={{ width: 640, height: 288 }}
              >
                <BarChart data={trailingRows} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 5]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="preacher"
                    width={110}
                    tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="average" name="Trailing average" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message="Preacher comparisons need at least one completed sermon." />
          )}
          {trailingRows.length > 0 ? (
            <ChartDataDetails
              caption="Preacher trailing average data"
              headers={["Preacher", "Average score", "Sermons"]}
              rows={trailingRows.map((row) => [row.preacher, formatScore(row.average), String(row.sermons)])}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Self-consistency score spread</CardTitle>
          <CardDescription>Score range from successful parallel runs, where available.</CardDescription>
        </CardHeader>
        <CardContent>
          {uncertaintyRows.length > 0 ? (
            <div className="h-72 min-w-0" aria-hidden="true">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={260}
                minHeight={240}
                initialDimension={{ width: 640, height: 288 }}
              >
                <ScatterChart margin={{ top: 12, right: 12, left: -4, bottom: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    type="category"
                    dataKey="title"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="score"
                    domain={[0, 5]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Scatter data={uncertaintyRows} dataKey="score" name="Run-score midpoint" fill="hsl(var(--chart-5))">
                    <ErrorBar
                      dataKey="uncertainty"
                      direction="y"
                      width={6}
                      stroke="hsl(var(--foreground))"
                      strokeWidth={1.5}
                    />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message="Self-consistency evaluations with multiple successful runs will show score ranges here." />
          )}
          {uncertaintyRows.length > 0 ? (
            <ChartDataDetails
              caption="Self-consistency score spread data"
              headers={["Sermon", "Preacher", "Final score", "Low", "High"]}
              rows={uncertaintyRows.map((row) => [
                row.title,
                row.preacher,
                formatScore(row.finalScore),
                formatScore(row.score - row.uncertainty[0]),
                formatScore(row.score + row.uncertainty[1]),
              ])}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Average aggregate profile</CardTitle>
          <CardDescription>
            Mean score for each aggregate dimension across the filtered scored sermons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metricAverageRows.length > 0 ? (
            <div className="h-72 min-w-0" aria-hidden="true">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={260}
                minHeight={240}
                initialDimension={{ width: 640, height: 288 }}
              >
                <BarChart
                  data={metricAverageRows}
                  layout="vertical"
                  margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                >
                  <CartesianGrid
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[0, 5]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="title"
                    width={150}
                    tick={{ fill: "hsl(var(--foreground))", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="average"
                    name="Average score"
                    fill="hsl(var(--chart-2))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message="Aggregate averages will appear after an evaluation completes." />
          )}
          {metricAverageRows.length > 0 ? (
            <ChartDataDetails
              caption="Average aggregate profile data"
              headers={["Metric", "Average score", "Sermons"]}
              rows={metricAverageRows.map((row) => [row.title, formatScore(row.average), String(row.sermons)])}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ChartDataDetails({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <details className="mt-4 rounded-lg border border-border bg-muted/20 text-sm">
      <summary className="cursor-pointer px-4 py-3 font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        View chart data
      </summary>
      <div className="overflow-x-auto border-t border-border p-3">
        <table className="min-w-full text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col" className="whitespace-nowrap px-2 py-2 font-medium text-muted-foreground">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${caption}:${rowIndex}`} className="border-t border-border/60">
                {row.map((value, columnIndex) => (
                  <td key={`${rowIndex}:${columnIndex}`} className="whitespace-nowrap px-2 py-2 tabular-nums">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
