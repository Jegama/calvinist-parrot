import type { FeatureReport } from "@/lib/analytics/features";
import type { EvaluationStage } from "@/lib/analytics/evaluation-spend";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { channelLabels, moneyLabel, numberLabel } from "./format";

const labels: Record<string, string> = {
  root_extract: "Root page extraction",
  geocode: "Address search",
  denomination_confession: "Denomination and confession",
  HIGH_CONFIDENCE: "High Confidence",
};

function label(value: string) {
  return labels[value] ?? (value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replaceAll("_", " "));
}

function ChannelCosts({ name, rows }: { name: string; rows: NonNullable<FeatureReport["evaluationChannels"]> }) {
  return (
    <Table aria-label={name + " costs by entry channel"} className="min-w-[48rem] tabular-nums">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Channel</TableHead>
          <TableHead scope="col" className="text-right">Completed evaluations</TableHead>
          <TableHead scope="col" className="text-right">Model spend</TableHead>
          <TableHead scope="col" className="text-right">External fees</TableHead>
          <TableHead scope="col" className="text-right">Total spend</TableHead>
          <TableHead scope="col" className="text-right">Cost per evaluation</TableHead>
          <TableHead scope="col">Coverage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => (
          <TableRow key={row.channel}>
            <th scope="row" className="p-2 text-left font-medium">{channelLabels[row.channel]}</th>
            <TableCell className="text-right">{numberLabel(row.completions)}</TableCell>
            <TableCell className="text-right">{moneyLabel(row.modelSpend)}</TableCell>
            <TableCell className="text-right">{moneyLabel(row.externalFees)}</TableCell>
            <TableCell className="text-right">{moneyLabel(row.estimatedSpendUsd)}</TableCell>
            <TableCell className="text-right">{moneyLabel(row.costPerCompletionUsd)}</TableCell>
            <TableCell className="max-w-64 text-xs">{row.spendCoverage}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StageCosts({ name, rows, showPreset }: { name: string; rows: EvaluationStage[]; showPreset: boolean }) {
  if (!rows.length) return <p>No attempts recorded in this period.</p>;
  return (
    <Table aria-label={name + " costs by stage"} className="min-w-[40rem] tabular-nums">
      <TableHeader>
        <TableRow>
          {showPreset && <TableHead scope="col">Preset</TableHead>}
          <TableHead scope="col">Stage</TableHead>
          <TableHead scope="col">Provider and service</TableHead>
          <TableHead scope="col">Modality or billed units</TableHead>
          <TableHead scope="col" className="text-right">Known spend</TableHead>
          <TableHead scope="col">Coverage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => (
          <TableRow key={JSON.stringify([row.stage, row.preset, row.provider, row.service, row.modality, row.billingUnit])}>
            {showPreset && <TableCell>{label(row.preset ?? "Unknown")}</TableCell>}
            <th scope="row" className="p-2 text-left font-medium">{label(row.stage)}</th>
            <TableCell>{row.service === row.provider ? label(row.provider) : `${label(row.provider)} · ${row.service}`}</TableCell>
            <TableCell>
              {row.billingUnit
                ? `${numberLabel(row.quantity)} ${row.billingUnit === "credit" && row.quantity !== 1 ? "credits" : row.billingUnit}`
                : label(row.modality ?? "Unknown modality")}
            </TableCell>
            <TableCell className="text-right">{moneyLabel(row.spend)}</TableCell>
            <TableCell>{row.measured}/{row.attempts} measured, {row.priced}/{row.attempts} priced</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function EvaluationCosts({ features }: { features: FeatureReport }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Evaluation costs</h3>
      <p className="text-sm text-muted-foreground">Spend includes billed retries and failed evaluations in the selected period. Cost per completion uses the full recorded cost of evaluations saved by Church Finder or completed by Sermon Evaluator in that period. Partial amounts include only priced attempts.</p>
      {(["church", "sermon"] as const).map(feature => {
        const name = feature === "church" ? "Church Finder" : "Sermon Evaluator";
        const channels = features.evaluationChannels?.filter(row => row.feature === feature);
        const stages = features.evaluationStages?.filter(row => row.feature === feature);
        return (
          <details key={feature} className="rounded-lg border bg-card p-3 sm:p-4">
            <summary className="cursor-pointer font-semibold">{name} cost breakdown</summary>
            <h4 className="mb-1 mt-4 font-semibold">By entry channel</h4>
            {channels ? <ChannelCosts name={name} rows={channels} /> : <p>Evaluation cost data unavailable.</p>}
            <h4 className="mb-1 mt-4 font-semibold">{feature === "church" ? "By service and stage" : "By preset and stage"}</h4>
            {stages ? <StageCosts name={name} rows={stages} showPreset={feature === "sermon"} /> : <p>Stage data unavailable.</p>}
            {feature === "church" && <p className="mt-2 text-sm text-muted-foreground">Tavily fees use the pay-as-you-go estimate of $0.008 per credit. A dash indicates an unknown amount.</p>}
          </details>
        );
      })}
    </div>
  );
}
