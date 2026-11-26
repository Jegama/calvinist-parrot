import type { AnalyticsReport } from "@/lib/analytics/report";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { dayLabel, instantLabel, moneyLabel, numberLabel, rateLabel } from "./format";
import EvaluationCosts from "./EvaluationCosts";
import ChatCostDetails from "./ChatCostDetails";

type FeatureRow = AnalyticsReport["features"]["rows"][number];
type Engagement = NonNullable<FeatureRow["engagement"]>;

function OutcomeCounts({ outcomes }: { outcomes: FeatureRow["actions"] }) {
  if (!outcomes.length) return "—";
  return (
    <dl className="space-y-1">
      {outcomes.map(({ label, count }) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt>{label}</dt><dd className="font-medium tabular-nums">{numberLabel(count)}</dd>
        </div>
      ))}
    </dl>
  );
}

function StepRate({ step }: { step: Engagement["steps"][number] }) {
  if (step.denominator === undefined) return "Count only";
  if (step.denominator === null) return "Denominator unavailable";
  const rate = step.denominator > 0 && step.count !== null ? step.count / step.denominator : null;
  return (
    <>
      <span className="font-semibold">{rateLabel(rate)}</span>
      <span className="block text-xs text-muted-foreground">
        {numberLabel(step.count)} of {numberLabel(step.denominator)}{step.denominatorLabel && ` · ${step.denominatorLabel}`}
      </span>
    </>
  );
}

export default function FeatureTable({ features, period, generatedAt }: Pick<AnalyticsReport, "features" | "period" | "generatedAt">) {
  const observationWindow = period.startDay
    ? `${dayLabel(period.startDay)} – ${dayLabel(period.endDay)} · ${period.timeZone}`
    : `All time through ${instantLabel(generatedAt, period.timeZone)}`;
  return (
    <section aria-labelledby="features-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="features-heading" className="text-2xl font-semibold">Feature usage and spend</h2>
        <a href="https://vercel.com/jegamas-projects/calvinist-parrot/speed-insights" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 dark:text-foreground">
          Vercel Speed Insights <ExternalLink aria-hidden="true" size={14} />
        </a>
      </div>
      <p id="pageview-coverage" className="text-sm text-muted-foreground">Anonymous website pageviews · {features.pageviewCoverage}</p>
      <div className="rounded-lg border bg-card p-2 sm:p-4">
        <Table className="min-w-[60rem] tabular-nums">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Feature</TableHead>
              <TableHead scope="col" aria-describedby="pageview-coverage" className="text-right">Pageviews</TableHead>
              <TableHead scope="col">Completed action</TableHead>
              <TableHead scope="col">Website outcomes</TableHead>
              <TableHead scope="col" className="text-right">Est. spend</TableHead>
              <TableHead scope="col" className="text-right">Cost per completion</TableHead>
              <TableHead scope="col">Spend coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {features.rows.map((row) => (
              <TableRow key={row.key}>
                <th scope="row" className="p-2 text-left font-medium">
                  {row.engagement ? (
                    <a href={`#outcomes-${row.key}`} aria-label={`${row.name} engagement details`} className="text-primary underline underline-offset-4 focus-visible:outline-ring dark:text-foreground">{row.name}</a>
                  ) : row.name}
                </th>
                <TableCell className="text-right">{numberLabel(row.pageviews)}</TableCell>
                <TableCell><OutcomeCounts outcomes={row.actions} /></TableCell>
                <TableCell>{row.engagement ? <OutcomeCounts outcomes={row.engagement.steps} /> : "—"}</TableCell>
                <TableCell className="text-right">{moneyLabel(row.estimatedSpendUsd)}</TableCell>
                <TableCell className="text-right">{moneyLabel(row.costPerCompletionUsd)}</TableCell>
                <TableCell className="max-w-64 text-xs">{row.spendCoverage}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {features.chatSpend && <ChatCostDetails report={features.chatSpend} />}
      <p className="text-sm text-muted-foreground">{features.actionCoverage}</p>
      <EvaluationCosts features={features} />
      <div className="space-y-2 pt-2">
        <h3 className="text-xl font-semibold">Engagement by feature</h3>
        {features.rows.map(({ key, name, engagement }) => engagement && (
          <details key={key} name="feature-engagement" className="rounded-lg border bg-card">
            <summary className="cursor-pointer rounded-lg px-4 py-3 font-semibold focus-visible:outline-ring">{name}</summary>
            <div id={`outcomes-${key}`} tabIndex={-1} aria-label={`${name} engagement details`} role="region"
              className="scroll-mt-[calc(var(--app-header-height)+4rem)] space-y-3 border-t p-4">
              <p className="text-sm font-medium">Observation window · {observationWindow}</p>
              <Table className="tabular-nums">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Website step</TableHead>
                    <TableHead scope="col" className="text-right">Count</TableHead>
                    <TableHead scope="col" className="text-right">Share of eligible flows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {engagement.steps.map(step => (
                    <TableRow key={step.label}>
                      <th scope="row" className="p-2 text-left font-medium">{step.label}</th>
                      <TableCell className="text-right">{numberLabel(step.count)}</TableCell>
                      <TableCell className="text-right"><StepRate step={step} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!!engagement.external?.length && (
                <div className="max-w-lg space-y-1 border-l-2 border-primary/50 px-3 text-sm">
                  <h4 className="font-semibold">Server-observed outcomes by channel</h4>
                  <OutcomeCounts outcomes={engagement.external} />
                </div>
              )}
              <p className="text-sm text-muted-foreground">{engagement.coverage}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
