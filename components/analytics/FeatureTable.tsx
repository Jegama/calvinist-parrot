import type { AnalyticsReport } from "@/lib/analytics/report";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { moneyLabel, numberLabel } from "./format";
import EvaluationCosts from "./EvaluationCosts";
import ChatCostDetails from "./ChatCostDetails";

export default function FeatureTable({ features }: { features: AnalyticsReport["features"] }) {
  return (
    <section aria-labelledby="features-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="features-heading" className="text-2xl font-semibold">Feature usage and spend</h2>
        <a href="https://vercel.com/jegamas-projects/calvinist-parrot/speed-insights" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 dark:text-foreground">
          Vercel Speed Insights <ExternalLink aria-hidden="true" size={14} />
        </a>
      </div>
      <p id="pageview-coverage" className="text-sm text-muted-foreground">Pageviews · {features.pageviewCoverage}</p>
      <div className="rounded-lg border bg-card p-2 sm:p-4">
        <Table className="min-w-[48rem] tabular-nums">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Feature</TableHead>
              <TableHead scope="col" aria-describedby="pageview-coverage" className="text-right">Pageviews</TableHead>
              <TableHead scope="col">Completed action</TableHead>
              <TableHead scope="col" className="text-right">Est. spend</TableHead>
              <TableHead scope="col" className="text-right">Cost per completion</TableHead>
              <TableHead scope="col">Spend coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {features.rows.map((row) => (
              <TableRow key={row.key}>
                <th scope="row" className="p-2 text-left font-medium">{row.name}</th>
                <TableCell className="text-right">{numberLabel(row.pageviews)}</TableCell>
                <TableCell>
                  {row.actions.length > 0 ? (
                    <dl className="space-y-1">
                      {row.actions.map((action) => (
                        <div key={action.label} className="flex items-baseline justify-between gap-3">
                          <dt>{action.label}</dt><dd className="font-medium">{numberLabel(action.count)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : "—"}
                </TableCell>
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
    </section>
  );
}
