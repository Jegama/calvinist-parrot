"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BookOpenCheck, Filter, Gauge, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAvailableSermonMetrics, scoreForSermonMetric } from "./analytics-data";
import { SermonAnalyticsCharts } from "./analytics-charts";
import { formatDate, formatDuration, formatMetricLabel, formatScore } from "./format";
import { SermonStatusBadge } from "./status";
import { ACTIVE_SERMON_STATUSES } from "./types";
import type { SermonAnalyticsPoint, SermonStatus } from "./types";

const ALL_VALUE = "__all__";
const COMPLETE_STATUSES = new Set<SermonStatus>(["COMPLETE", "COMPLETE_WITH_WARNINGS"]);
const NEEDS_ATTENTION_STATUSES = new Set<SermonStatus>(["FAILED", "TIMED_OUT"]);

type StatusGroup = typeof ALL_VALUE | "in_progress" | "completed" | "needs_attention" | "canceled";

export function matchesSermonStatusGroup(status: SermonStatus, group: StatusGroup): boolean {
  if (group === ALL_VALUE) return true;
  if (group === "in_progress") return ACTIVE_SERMON_STATUSES.has(status);
  if (group === "completed") return COMPLETE_STATUSES.has(status);
  if (group === "needs_attention") return NEEDS_ATTENTION_STATUSES.has(status);
  return status === "CANCELED";
}

export function filterSermonAnalyticsByLatestSelection(
  analyticsEvaluations: readonly SermonAnalyticsPoint[],
  latestEvaluations: readonly SermonAnalyticsPoint[],
): SermonAnalyticsPoint[] {
  const admittedFingerprints = new Set(
    latestEvaluations.map((evaluation) => evaluation.fingerprintId),
  );
  return analyticsEvaluations.filter((evaluation) =>
    admittedFingerprints.has(evaluation.fingerprintId),
  );
}

function matchesCommonFilters(
  evaluation: SermonAnalyticsPoint,
  filters: { preacherId: string; durationPolicy: string; dateFrom: string; dateTo: string },
) {
  if (filters.preacherId !== ALL_VALUE && evaluation.preacherId !== filters.preacherId) return false;
  if (
    filters.durationPolicy !== ALL_VALUE &&
    evaluation.durationAdjustmentEnabled !== (filters.durationPolicy === "enabled")
  ) return false;
  const date = evaluation.preachedOn.slice(0, 10);
  if (filters.dateFrom && date < filters.dateFrom) return false;
  return !(filters.dateTo && date > filters.dateTo);
}

export function SermonDashboard({
  evaluations,
  analyticsEvaluations,
  loading,
}: {
  evaluations: SermonAnalyticsPoint[];
  analyticsEvaluations: SermonAnalyticsPoint[];
  loading: boolean;
}) {
  const [preacherId, setPreacherId] = useState(ALL_VALUE);
  const [status, setStatus] = useState<StatusGroup>(ALL_VALUE);
  const [durationPolicy, setDurationPolicy] = useState(ALL_VALUE);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const metricOptions = useMemo(
    () => listAvailableSermonMetrics(analyticsEvaluations),
    [analyticsEvaluations],
  );
  const [requestedMetric, setRequestedMetric] = useState("overallImpactBase");
  const metric = metricOptions.includes(requestedMetric)
    ? requestedMetric
    : (metricOptions[0] ?? "overallImpactBase");
  const hasAdjustedMetric = metricOptions.includes("overallImpactAdjusted");
  const showAggregateMetric =
    metric !== "overallImpactBase" && metric !== "overallImpactAdjusted";
  const preachers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const evaluation of [...evaluations, ...analyticsEvaluations]) {
      byId.set(evaluation.preacherId, evaluation.preacher);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [analyticsEvaluations, evaluations]);

  const commonFilters = useMemo(
    () => ({ preacherId, durationPolicy, dateFrom, dateTo }),
    [dateFrom, dateTo, durationPolicy, preacherId],
  );
  const filtered = useMemo(
    () =>
      evaluations.filter(
        (evaluation) =>
          matchesCommonFilters(evaluation, commonFilters) &&
          matchesSermonStatusGroup(evaluation.status, status),
      ),
    [commonFilters, evaluations, status],
  );
  const filteredAnalytics = useMemo(
    () => filterSermonAnalyticsByLatestSelection(analyticsEvaluations, filtered),
    [analyticsEvaluations, filtered],
  );

  const completed = [...filteredAnalytics]
    .filter((evaluation) => scoreForSermonMetric(evaluation, metric) !== null)
    .sort((left, right) => new Date(left.preachedOn).valueOf() - new Date(right.preachedOn).valueOf());
  const latest = completed.at(-1) ? scoreForSermonMetric(completed.at(-1)!, metric) : null;
  const previous = completed.at(-2) ? scoreForSermonMetric(completed.at(-2)!, metric) : null;
  const trend = latest !== null && previous !== null ? latest - previous : null;
  const filteredPreacherCount = new Set(filtered.map((evaluation) => evaluation.preacherId)).size;

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={BookOpenCheck}
          label="Sermons"
          value={String(filtered.length)}
          detail="Newest run for each sermon"
        />
        <KpiCard
          icon={Users}
          label="Preachers"
          value={String(filteredPreacherCount)}
          detail="In the current filter"
        />
        <KpiCard
          icon={Gauge}
          label={`Latest ${formatMetricLabel(metric)}`}
          value={formatScore(latest)}
          detail={completed.at(-1)?.title ?? "No completed score"}
        />
        <KpiCard
          icon={trend !== null && trend < 0 ? TrendingDown : TrendingUp}
          label="Latest trend"
          value={trend === null ? "—" : `${trend >= 0 ? "+" : ""}${trend.toFixed(2)}`}
          detail="Versus prior preached date"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <h2 className="font-serif text-lg font-semibold">Dashboard filters</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <FilterSelect label="Preacher" value={preacherId} onValueChange={setPreacherId}>
              <SelectItem value={ALL_VALUE}>All preachers</SelectItem>
              {preachers.map((preacher) => (
                <SelectItem key={preacher.id} value={preacher.id}>
                  {preacher.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect label="Status" value={status} onValueChange={(value) => setStatus(value as StatusGroup)}>
              <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="needs_attention">Needs attention</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </FilterSelect>
            <FilterSelect label="Metric" value={metric} onValueChange={setRequestedMetric}>
              {metricOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {formatMetricLabel(value)}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect label="Duration policy" value={durationPolicy} onValueChange={setDurationPolicy}>
              <SelectItem value={ALL_VALUE}>All policies</SelectItem>
              <SelectItem value="enabled">Adjustment on</SelectItem>
              <SelectItem value="disabled">Adjustment off</SelectItem>
            </FilterSelect>
            <div className="space-y-2">
              <Label htmlFor="sermon-date-from">Preached from</Label>
              <Input id="sermon-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sermon-date-to">Preached through</Label>
              <Input id="sermon-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>
          {(preacherId !== ALL_VALUE || status !== ALL_VALUE || durationPolicy !== ALL_VALUE || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => {
                setPreacherId(ALL_VALUE);
                setStatus(ALL_VALUE);
                setDurationPolicy(ALL_VALUE);
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {evaluations.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Activity className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-serif text-xl font-semibold">Your sermon coaching dashboard is ready</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Start a private evaluation to populate preached-date trends, aggregate comparisons, and self-consistency score spreads.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <SermonAnalyticsCharts evaluations={filteredAnalytics} metric={metric} />
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4">
                <h2 className="font-serif text-lg font-semibold">Latest evaluation records</h2>
                <p className="text-sm text-muted-foreground">
                  The newest run for each retained sermon appears here. Charts keep the newest completed score available while a newer run is still processing or needs attention.
                </p>
              </div>
              <div className="space-y-3 md:hidden">
                {filtered.map((evaluation) => (
                  <EvaluationRecordCard key={evaluation.id} evaluation={evaluation} metric={metric} />
                ))}
                {filtered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No sermon evaluations match these filters.
                  </p>
                ) : null}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sermon</TableHead>
                      <TableHead>Preacher</TableHead>
                      <TableHead>Preached</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Base impact</TableHead>
                      {hasAdjustedMetric ? (
                        <TableHead className="text-right">Adjusted</TableHead>
                      ) : null}
                      {showAggregateMetric ? (
                        <TableHead className="text-right">{formatMetricLabel(metric)}</TableHead>
                      ) : null}
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead>Policy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((evaluation) => (
                      <TableRow key={evaluation.id}>
                        <TableCell className="max-w-64 font-medium">
                          <Link
                            href={`/sermon-evaluation/${evaluation.id}`}
                            className="line-clamp-2 text-accent underline-offset-4 hover:underline"
                          >
                            {evaluation.title}
                          </Link>
                        </TableCell>
                        <TableCell>{evaluation.preacher}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(evaluation.preachedOn)}</TableCell>
                        <TableCell>
                          <SermonStatusBadge status={evaluation.status} />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatScore(evaluation.overallImpactBase)}
                        </TableCell>
                        {hasAdjustedMetric ? (
                          <TableCell className="text-right tabular-nums">
                            {formatScore(evaluation.overallImpactAdjusted)}
                          </TableCell>
                        ) : null}
                        {showAggregateMetric ? (
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatScore(scoreForSermonMetric(evaluation, metric))}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right tabular-nums">
                          {formatDuration(evaluation.durationSeconds)}
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {evaluation.durationAdjustmentEnabled ? "Adjusted on" : "Base only"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7 + Number(hasAdjustedMetric) + Number(showAggregateMetric)}
                          className="h-28 text-center text-muted-foreground"
                        >
                          No sermon evaluations match these filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function EvaluationRecordCard({
  evaluation,
  metric,
}: {
  evaluation: SermonAnalyticsPoint;
  metric: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/sermon-evaluation/${evaluation.id}`}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {evaluation.title}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {evaluation.preacher} · {formatDate(evaluation.preachedOn)}
          </p>
        </div>
        <SermonStatusBadge status={evaluation.status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <RecordValue label="Base impact" value={formatScore(evaluation.overallImpactBase)} />
        {evaluation.overallImpactAdjusted !== null ? (
          <RecordValue label="Adjusted" value={formatScore(evaluation.overallImpactAdjusted)} />
        ) : null}
        {metric !== "overallImpactBase" && metric !== "overallImpactAdjusted" ? (
          <RecordValue
            label={formatMetricLabel(metric)}
            value={formatScore(scoreForSermonMetric(evaluation, metric))}
          />
        ) : null}
        <RecordValue label="Duration" value={formatDuration(evaluation.durationSeconds)} />
        <RecordValue label="Policy" value={evaluation.durationAdjustmentEnabled ? "Adjusted on" : "Base only"} />
      </dl>
    </article>
  );
}

function RecordValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const id = `sermon-filter-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading sermon dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="h-36 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
      <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
    </div>
  );
}
