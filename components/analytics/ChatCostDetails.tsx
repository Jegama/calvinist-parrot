import type { ChatSpendReport } from "@/lib/analytics/chat-spend";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { moneyLabel, numberLabel } from "./format";

const labels = {
  combined: "All channels", web: "Website", public_api: "Public API (v1)", mcp: "MCP",
  unknown: "Unknown channel", unattributed: "Unattributed",
};

const stages: Record<string, string> = {
  agent: "Chat response", title: "Conversation title", memory: "Memory extraction", ccel_embedding: "CCEL retrieval embedding",
};

export default function ChatCostDetails({ report }: { report: ChatSpendReport }) {
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Chat cost details</summary>
      <p className="my-3 text-sm text-muted-foreground">
        Turns are grouped by submission date. Estimates include all recorded spend for those turns, including failed calls, retries and later background work.
        Retry spend includes calls made while retrying a provider request or resubmitting a failed turn. A reply available to the caller counts once. Spend shows the known portion. Unit cost requires a completed turn and full measured and priced coverage.
      </p>
      <Table className="min-w-[48rem] tabular-nums">
        <caption className="caption-top pb-2 text-left font-semibold">Cost by entry channel</caption>
        <TableHeader><TableRow>
          {["Channel", "Completed turns", "Est. spend", "Retry spend", "Spend per completed turn", "Measurement coverage"].map(column =>
            <TableHead scope="col" key={column}>{column}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {report.byChannel.map(row => <TableRow key={row.channel}>
            <th scope="row" className="p-2 text-left">{labels[row.channel]}</th>
            <TableCell>{numberLabel(row.completions)}</TableCell>
            <TableCell>{moneyLabel(row.estimatedSpendUsd)}</TableCell>
            <TableCell>{moneyLabel(row.retrySpendUsd)}</TableCell>
            <TableCell>{moneyLabel(row.costPerCompletionUsd)}</TableCell>
            <TableCell className="text-xs">
              {row.partial && "Partial. "}{row.measured}/{row.attempts} attempts measured, {row.priced}/{row.attempts} priced.
              {" "}{row.recordedTurns}/{row.submissions} submitted turns have receipts.
              {row.recordedCompletions < row.completions && ` ${row.recordedCompletions}/${row.completions} completed turns have a successful model receipt.`}
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      <p className="my-3 text-sm text-muted-foreground">
        Shared or unattributed calls are counted separately by attempt date. {numberLabel(report.unattributed.attempts)} attempts,
        {" "}{moneyLabel(report.unattributed.estimatedSpendUsd)} estimated spend, {moneyLabel(report.unattributed.retrySpendUsd)} retry spend.
        {" "}{report.coverageNote}
      </p>
      {report.stages.length > 0 && <Table className="min-w-[52rem] tabular-nums">
        <caption className="caption-top pb-2 text-left font-semibold">Recorded tokens and estimated spend by stage and model</caption>
        <TableHeader><TableRow>
          {["Stage", "Model", "Uncached input", "Cache reads", "Cache writes", "Output", "Priced attempts", "Est. spend"].map(column =>
            <TableHead scope="col" key={column}>{column}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {report.stages.map(row => <TableRow key={JSON.stringify([row.unattributed, row.stage, row.model])}>
            <th scope="row" className="p-2 text-left">{stages[row.stage] ?? row.stage}{row.unattributed && " (unattributed)"}</th>
            <TableCell>{row.model}</TableCell>
            <TableCell>{numberLabel(row.inputTokens)}</TableCell>
            <TableCell>{numberLabel(row.cacheReadTokens)}</TableCell>
            <TableCell>{numberLabel(row.cacheWriteTokens)}</TableCell>
            <TableCell>{numberLabel(row.outputTokens)}</TableCell>
            <TableCell>{row.priced}/{row.attempts}</TableCell>
            <TableCell>{moneyLabel(row.estimatedSpendUsd)}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>}
    </details>
  );
}
