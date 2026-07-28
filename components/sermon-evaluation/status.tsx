import { AlertCircle, Ban, CheckCircle2, Clock3, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ACTIVE_SERMON_STATUSES, type SermonStatus } from "./types";
import { formatSermonStatus } from "./format";

const STAGE_ORDER: SermonStatus[] = [
  "QUEUED",
  "PREPARING_AUDIO",
  "EXTRACTING",
  "SCORING",
  "HARMONIZING",
  "CALIBRATING",
  "SUMMARIZING",
  "COMPLETE",
];

const STAGE_COPY: Partial<Record<SermonStatus, string>> = {
  QUEUED: "Waiting for a private evaluation worker",
  PREPARING_AUDIO: "Verifying audio and preparing the temporary Gemini file",
  EXTRACTING: "Identifying sermon structure, proposition, and applications",
  SCORING: "Running the requested rubric scores concurrently",
  HARMONIZING: "Combining successful scoring runs and uncertainty",
  CALIBRATING: "Applying deterministic calibration and aggregate weights",
  SUMMARIZING: "Creating coaching feedback and versioned reports",
  COMPLETE: "Coaching feedback is ready",
  COMPLETE_WITH_WARNINGS: "Coaching feedback is ready with reduced confidence",
  FAILED: "This attempt did not complete",
  TIMED_OUT: "This attempt reached its 15-minute deadline",
  CANCELED: "This evaluation was canceled",
};

export function SermonStatusBadge({ status }: { status: SermonStatus }) {
  if (status === "COMPLETE") {
    return <Badge className="border-success/30 bg-success/10 text-success hover:bg-success/10">Complete</Badge>;
  }
  if (status === "COMPLETE_WITH_WARNINGS") {
    return <Badge className="border-warning/40 bg-warning/20 text-foreground hover:bg-warning/20">Complete with warnings</Badge>;
  }
  if (status === "FAILED" || status === "TIMED_OUT") {
    return <Badge variant="destructive">{formatSermonStatus(status)}</Badge>;
  }
  if (status === "CANCELED") {
    return <Badge variant="secondary">Canceled</Badge>;
  }
  return (
    <Badge variant="outline" className="border-info/30 bg-info/10 text-info">
      <Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" />
      {formatSermonStatus(status)}
    </Badge>
  );
}

export function SermonStageProgress({
  status,
  requestedRuns,
  completedRuns,
  retryWave,
  cancelRequested,
}: {
  status: SermonStatus;
  requestedRuns: number;
  completedRuns: number;
  retryWave?: number | null;
  cancelRequested?: boolean;
}) {
  const activeIndex = STAGE_ORDER.indexOf(status);
  const terminalFailure = status === "FAILED" || status === "TIMED_OUT" || status === "CANCELED";
  const progressIndex = terminalFailure ? Math.max(0, STAGE_ORDER.indexOf("QUEUED")) : activeIndex;
  const Icon =
    status === "COMPLETE"
      ? CheckCircle2
      : status === "COMPLETE_WITH_WARNINGS"
        ? TriangleAlert
        : status === "CANCELED"
          ? Ban
          : status === "FAILED"
            ? AlertCircle
            : status === "TIMED_OUT"
              ? Clock3
              : Loader2;

  return (
    <div className="rounded-xl border border-border bg-card p-5" aria-live="polite">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "rounded-full p-2",
            status === "COMPLETE"
              ? "bg-success/10 text-success"
              : status === "COMPLETE_WITH_WARNINGS"
                ? "bg-warning/25 text-foreground"
                : terminalFailure
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary",
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5",
              ACTIVE_SERMON_STATUSES.has(status) && "animate-spin motion-reduce:animate-none",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-foreground">{formatSermonStatus(status)}</p>
            {status === "SCORING" && (
              <span className="text-sm tabular-nums text-muted-foreground">
                {completedRuns} of {requestedRuns} runs complete
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{STAGE_COPY[status]}</p>
          {retryWave !== null && retryWave !== undefined && retryWave > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Scoring wave {retryWave + 1} is in progress (replacement attempt {retryWave} of 2).
            </p>
          )}
          {cancelRequested && ACTIVE_SERMON_STATUSES.has(status) && (
            <p className="mt-2 text-sm text-destructive">
              Cancellation requested. An in-flight provider request may finish before processing stops.
            </p>
          )}
        </div>
      </div>
      {ACTIVE_SERMON_STATUSES.has(status) && (
        <ol className="mt-5 grid grid-cols-7 gap-1" aria-label="Evaluation stages">
          {STAGE_ORDER.slice(1, -1).map((stage, index) => {
            const stageIndex = index + 1;
            const completed = progressIndex > stageIndex;
            const active = progressIndex === stageIndex;
            return (
              <li key={stage} className="min-w-0">
                <div
                  className={cn(
                    "h-1.5 rounded-full",
                    completed ? "bg-success" : active ? "bg-primary" : "bg-muted",
                  )}
                  aria-label={`${formatSermonStatus(stage)}: ${
                    completed ? "complete" : active ? "in progress" : "not started"
                  }`}
                />
                <span className="sr-only">{formatSermonStatus(stage)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
