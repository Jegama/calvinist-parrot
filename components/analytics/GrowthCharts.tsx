import type { AnalyticsReport } from "@/lib/analytics/report";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dayLabel, numberLabel } from "./format";

const series = [
  { key: "newChats", label: "New chats", color: "bg-chart-2" },
  { key: "userMessages", label: "User messages", color: "bg-primary" },
  { key: "newAccounts", label: "New accounts", color: "bg-chart-3" },
] as const;

export default function GrowthCharts({ report }: { report: AnalyticsReport }) {
  const { growth, coverage } = report.metrics;
  // Keep bars readable on a phone. Each shows the end of an equal share of the period.
  const barCount = Math.min(growth.length, 30);
  const bars = Array.from({ length: barCount }, (_, index) =>
    growth[Math.ceil((index + 1) * growth.length / barCount) - 1]);
  const { startDay, endDay, timeZone } = report.period;
  const chatStart = coverage.chat && new Date(coverage.chat).toLocaleDateString("en-US", { timeZone, dateStyle: "medium" });

  return (
    <section aria-labelledby="growth-heading" className="space-y-4">
      <div>
        <h2 id="growth-heading" className="text-2xl font-semibold">Cumulative growth</h2>
        <p className="text-sm text-muted-foreground">
          Counts accumulate from {dayLabel(startDay)}. {chatStart ? `Chat attribution began ${chatStart}.` : "Chat attribution start is unavailable."}
          {growth.length > barCount && " Each bar shows the cumulative total at the end of an interval. The table lists every day."}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {series.map(({ key, label, color }) => {
          const last = growth.at(-1)?.[key] ?? null;
          const maximum = Math.max(1, ...growth.map((point) => point[key] ?? 0));
          const hasData = growth.some((point) => point[key] !== null);
          return (
            <figure key={key} className="min-w-0 rounded-lg border bg-card p-5">
              <figcaption className="mb-4 flex items-baseline justify-between gap-2">
                <span className="font-medium">{label}</span>
                <strong className="text-2xl tabular-nums">{numberLabel(last)}</strong>
              </figcaption>
              {hasData ? (
                <>
                  <div className="flex gap-2" role="img" aria-label={`${label}, cumulative through ${dayLabel(endDay)}: ${numberLabel(last)}. Daily values follow in the table.`}>
                    <div aria-hidden="true" className="flex h-24 flex-col justify-between text-xs tabular-nums text-muted-foreground">
                      <span>{numberLabel(maximum)}</span><span>0</span>
                    </div>
                    <div aria-hidden="true" className="flex h-24 flex-1 items-end gap-px border-y">
                      {bars.map((point) => {
                        const value = point[key];
                        return value === null
                          ? <span key={point.day} className="h-full flex-1 bg-muted" />
                          : <span key={point.day} className={`flex-1 rounded-t-sm ${color}`} style={{ height: `${100 * value / maximum}%` }} />;
                      })}
                    </div>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{dayLabel(startDay, true)}</span><span>{dayLabel(endDay, true)}</span>
                  </div>
                </>
              ) : <p className="flex h-28 items-center justify-center border-y border-dashed text-sm text-muted-foreground">Data unavailable for this period</p>}
            </figure>
          );
        })}
      </div>
      <details>
        <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-ring dark:text-foreground">Daily cumulative totals</summary>
        <Table className="mt-2 tabular-nums">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Reporting day</TableHead>
              {series.map(({ key, label }) => <TableHead scope="col" key={key} className="text-right">{label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {growth.map((point) => (
              <TableRow key={point.day}>
                <th scope="row" className="p-2 text-left font-normal">{dayLabel(point.day)}</th>
                {series.map(({ key }) => <TableCell key={key} className="text-right">{numberLabel(point[key])}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </section>
  );
}
