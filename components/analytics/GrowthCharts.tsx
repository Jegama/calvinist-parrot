"use client";

import { useState } from "react";
import type { AnalyticsReport } from "@/lib/analytics/report";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dayLabel, numberLabel } from "./format";

const series = [
  { key: "newChats", label: "New chats", color: "stroke-chart-2" },
  { key: "userMessages", label: "User messages", color: "stroke-primary" },
  { key: "newAccounts", label: "New accounts", color: "stroke-chart-3" },
] as const;

// A move starts a separate line after a missing day. A zero-length stroke
// with a round cap keeps an isolated observation visible.
function dailyLine(values: (number | null)[], maximum: number) {
  return values.map((value, index) => {
    if (value === null) return "";
    const x = (100 * index / Math.max(1, values.length - 1)).toFixed(2);
    const y = (97 - 94 * value / maximum).toFixed(2);
    return index === 0 || values[index - 1] === null ? `M${x} ${y}h0` : `L${x} ${y}`;
  }).join("");
}

export default function GrowthCharts({ growth, chatCoverage, endDay, timeZone }: {
  growth: AnalyticsReport["metrics"]["growth"];
  chatCoverage: string | null;
  endDay: string;
  timeZone: string;
}) {
  const [showDays, setShowDays] = useState(false);
  const startDay = growth[0]?.day ?? endDay;
  const chatStart = chatCoverage && new Date(chatCoverage).toLocaleDateString("en-US", { timeZone, dateStyle: "medium" });

  return (
    <section aria-labelledby="growth-heading" className="space-y-4">
      <div>
        <h2 id="growth-heading" className="text-2xl font-semibold">Cumulative growth</h2>
        <p className="text-sm text-muted-foreground">
          Counts accumulate from {dayLabel(startDay)}. {chatStart ? `Chat attribution began ${chatStart}.` : "Chat attribution start is unavailable."}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {series.map(({ key, label, color }) => {
          const last = growth.at(-1)?.[key] ?? null;
          const values = growth.map(point => point[key]);
          const maximum = Math.max(1, ...values.map(value => value ?? 0));
          const hasData = values.some(value => value !== null);
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
                    <svg aria-hidden="true" className="h-24 min-w-0 flex-1 overflow-visible border-y" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d={dailyLine(values, maximum)} className={color} fill="none" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    </svg>
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
      <details onToggle={event => setShowDays(event.currentTarget.open)}>
        <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-ring dark:text-foreground">Daily cumulative totals</summary>
        {showDays && <Table className="mt-2 tabular-nums">
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
        </Table>}
      </details>
    </section>
  );
}
