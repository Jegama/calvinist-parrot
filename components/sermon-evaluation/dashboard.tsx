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
import { SermonAnalyticsCharts } from "./analytics-charts";
import { formatDate, formatDuration, formatMetricLabel, formatScore } from "./format";
import { SermonStatusBadge } from "./status";
import type { SermonAnalyticsPoint, SermonStatus } from "./types";

const ALL_VALUE = "__all__";

function dashboardScore(evaluation: SermonAnalyticsPoint, metric: string): number | null {
  if (metric === "overallImpactBase") {
    return evaluation.overallImpactBase;
  }
  if (metric === "overallImpactAdjusted") {
    return evaluation.overallImpactAdjusted;
  }
  return evaluation.aggregateScores[metric] ?? null;
}

export function SermonDashboard({
  evaluations,
  loading,
}: {
  evaluations: SermonAnalyticsPoint[];
  loading: boolean;
}) {
  const [preacher, setPreacher] = useState(ALL_VALUE);
  const [status, setStatus] = useState(ALL_VALUE);
  const [durationPolicy, setDurationPolicy] = useState(ALL_VALUE);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const metricOptions = useMemo(
    () => [
      "overallImpactBase",
      "overallImpactAdjusted",
      ...new Set(evaluations.flatMap((evaluation) => Object.keys(evaluation.aggregateScores))),
    ],
    [evaluations],
  );
  const [metric, setMetric] = useState("overallImpactBase");
  const preachers = useMemo(
    () => [...new Set(evaluations.map((evaluation) => evaluation.preacher))].sort(),
    [evaluations],
  );

  const filtered = useMemo(
    () =>
      evaluations.filter((evaluation) => {
        if (preacher !== ALL_VALUE && evaluation.preacher !== preacher) {
          return false;
        }
        if (status !== ALL_VALUE && evaluation.status !== status) {
          return false;
        }
        if (
          durationPolicy !== ALL_VALUE &&
          evaluation.durationAdjustmentEnabled !== (durationPolicy === "enabled")
        ) {
          return false;
        }
        const date = evaluation.preachedOn.slice(0, 10);
        if (dateFrom && date < dateFrom) {
          return false;
        }
        return !(dateTo && date > dateTo);
      }),
    [dateFrom, dateTo, durationPolicy, evaluations, preacher, status],
  );

  const completed = filtered
    .filter((evaluation) => dashboardScore(evaluation, metric) !== null)
    .sort((left, right) => new Date(left.preachedOn).valueOf() - new Date(right.preachedOn).valueOf());
  const latest = completed.at(-1) ? dashboardScore(completed.at(-1)!, metric) : null;
  const previous = completed.at(-2) ? dashboardScore(completed.at(-2)!, metric) : null;
  const trend = latest !== null && previous !== null ? latest - previous : null;
  const filteredPreacherCount = new Set(filtered.map((evaluation) => evaluation.preacher)).size;

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={BookOpenCheck} label="Sermons" value={String(filtered.length)} detail="Latest evaluations only" />
        <KpiCard icon={Users} label="Preachers" value={String(filteredPreacherCount)} detail="In the current filter" />
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
            <FilterSelect label="Preacher" value={preacher} onValueChange={setPreacher}>
              <SelectItem value={ALL_VALUE}>All preachers</SelectItem>
              {preachers.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect label="Status" value={status} onValueChange={setStatus}>
              <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
              {["COMPLETE", "COMPLETE_WITH_WARNINGS", "QUEUED", "SCORING", "FAILED", "TIMED_OUT", "CANCELED"].map(
                (value) => (
                  <SelectItem key={value} value={value}>
                    {formatMetricLabel(value)}
                  </SelectItem>
                ),
              )}
            </FilterSelect>
            <FilterSelect label="Metric" value={metric} onValueChange={setMetric}>
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
          {(preacher !== ALL_VALUE || status !== ALL_VALUE || durationPolicy !== ALL_VALUE || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => {
                setPreacher(ALL_VALUE);
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
          <SermonAnalyticsCharts evaluations={filtered} metric={metric} />
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4">
                <h2 className="font-serif text-lg font-semibold">Latest evaluation records</h2>
                <p className="text-sm text-muted-foreground">
                  Only the newest evaluation for each retained sermon appears here. Earlier runs and their versioned reports remain available from evaluation history.
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sermon</TableHead>
                      <TableHead>Preacher</TableHead>
                      <TableHead>Preached</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Base impact</TableHead>
                      <TableHead className="text-right">Adjusted</TableHead>
                      <TableHead className="text-right">{formatMetricLabel(metric)}</TableHead>
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
                          <SermonStatusBadge status={evaluation.status as SermonStatus} />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatScore(evaluation.overallImpactBase)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatScore(evaluation.overallImpactAdjusted)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatScore(dashboardScore(evaluation, metric))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatDuration(evaluation.durationSeconds)}</TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {evaluation.durationAdjustmentEnabled ? "Adjusted on" : "Base only"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="h-28 text-center text-muted-foreground">
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
          <div key={index} className="h-28 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
        ))}
      </div>
      <div className="h-36 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
      <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
    </div>
  );
}
