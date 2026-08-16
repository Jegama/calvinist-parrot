"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  FileAudio,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ProtectedView } from "@/components/ProtectedView";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { SERMON_CRITERIA_COUNT } from "@/lib/sermon-evaluation/rubric.generated";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchSermonCapabilities,
  fetchSermonEvaluation,
  fetchSermonPlaybackAuthorization,
  fetchSermonStatus,
} from "./api";
import { canonicalDuplicateRedirectUrl } from "./canonical-redirect";
import { SermonDetailActions } from "./detail-actions";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMetricLabel,
  formatScore,
  formatSermonPreset,
} from "./format";
import { ReportDownloads } from "./report-downloads";
import { SermonStageProgress, SermonStatusBadge } from "./status";
import {
  ACTIVE_SERMON_STATUSES,
  COMPLETE_SERMON_STATUSES,
  TERMINAL_SERMON_STATUSES,
  type SermonCapabilities,
  type SermonEvaluationDetail,
  type SermonPlaybackAuthorization,
} from "./types";

export function SermonEvaluationDetailFeature({
  evaluationId,
  notice,
}: {
  evaluationId: string;
  notice?: "duplicate" | "reattach";
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const capabilitiesQuery = useQuery({
    queryKey: ["sermon-evaluations", "capabilities"],
    queryFn: fetchSermonCapabilities,
    enabled: !!user && !authLoading,
    staleTime: 60_000,
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ["sermon-evaluations", evaluationId],
    queryFn: () => fetchSermonEvaluation(evaluationId),
    enabled: capabilitiesQuery.data?.hasAccess === true,
    refetchInterval: (query) =>
      query.state.data?.reportRegenerationPending ? 3_000 : false,
    retry: false,
  });
  const statusQuery = useQuery({
    queryKey: ["sermon-evaluations", evaluationId, "status"],
    queryFn: () => fetchSermonStatus(evaluationId),
    enabled:
      capabilitiesQuery.data?.hasAccess === true &&
      !!detailQuery.data &&
      ACTIVE_SERMON_STATUSES.has(detailQuery.data.status),
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? detailQuery.data?.status;
      return status && ACTIVE_SERMON_STATUSES.has(status) ? 3_000 : false;
    },
    refetchIntervalInBackground: false,
  });
  const priorStatusRef = useRef(detailQuery.data?.status);
  const canonicalRedirectRef = useRef<string | null>(null);
  const canonicalRedirectUrl =
    canonicalDuplicateRedirectUrl(evaluationId, statusQuery.data) ??
    canonicalDuplicateRedirectUrl(evaluationId, detailQuery.data);

  useEffect(() => {
    if (
      canonicalRedirectUrl &&
      canonicalRedirectRef.current !== canonicalRedirectUrl
    ) {
      canonicalRedirectRef.current = canonicalRedirectUrl;
      router.replace(canonicalRedirectUrl);
    }
  }, [canonicalRedirectUrl, router]);

  useEffect(() => {
    const nextStatus = statusQuery.data?.status;
    if (
      nextStatus &&
      nextStatus !== priorStatusRef.current &&
      TERMINAL_SERMON_STATUSES.has(nextStatus)
    ) {
      void detailQuery.refetch();
    }
    priorStatusRef.current = nextStatus ?? detailQuery.data?.status;
  }, [detailQuery, statusQuery.data?.status]);

  const detail = useMemo(() => {
    if (!detailQuery.data) {
      return null;
    }
    if (!statusQuery.data) {
      return detailQuery.data;
    }
    return {
      ...detailQuery.data,
      status: statusQuery.data.status,
      requestedRuns: statusQuery.data.requestedRuns,
      completedRuns: statusQuery.data.completedRuns,
      warnings: statusQuery.data.warnings,
      errorCode: statusQuery.data.errorCode,
      errorMessage: statusQuery.data.errorMessage,
      cancelRequestedAt: statusQuery.data.cancelRequestedAt,
      retryWave: statusQuery.data.retryWave,
      attemptNumber: statusQuery.data.attemptNumber,
      stageStartedAt: statusQuery.data.stageStartedAt,
    };
  }, [detailQuery.data, statusQuery.data]);

  const authFallback = (
    <main className="min-h-[calc(100vh-var(--app-header-height))] bg-background px-4 py-8 sm:px-6">
      <DetailSkeleton />
    </main>
  );

  return (
    <ProtectedView fallback={authFallback}>
      <main className="min-h-[calc(100vh-var(--app-header-height))] bg-background px-4 py-8 sm:px-6">
        <div className="container mx-auto max-w-7xl">
          {capabilitiesQuery.isPending ? (
            <DetailSkeleton />
          ) : capabilitiesQuery.isError ? (
            <ErrorState
              title="Could not verify sermon evaluation access"
              message={
                capabilitiesQuery.error instanceof Error
                  ? capabilitiesQuery.error.message
                  : "Please try again."
              }
              onRetry={() => void capabilitiesQuery.refetch()}
            />
          ) : !capabilitiesQuery.data?.hasAccess ? (
            <ErrorState
              title="Private beta access required"
              message="Your authenticated account does not have a server-managed sermon evaluator label."
            />
          ) : detailQuery.isPending || canonicalRedirectUrl ? (
            <DetailSkeleton />
          ) : detailQuery.isError || !detail ? (
            <ErrorState
              title="Evaluation could not be loaded"
              message={
                detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : "The evaluation may not exist or may belong to another account."
              }
              onRetry={() => void detailQuery.refetch()}
            />
          ) : user ? (
            <SermonDetail
              evaluation={detail}
              capabilities={capabilitiesQuery.data}
              notice={notice}
              onChanged={async () => {
                await Promise.all([detailQuery.refetch(), statusQuery.refetch()]);
              }}
            />
          ) : null}
        </div>
      </main>
    </ProtectedView>
  );
}

function SermonDetail({
  evaluation,
  capabilities,
  notice,
  onChanged,
}: {
  evaluation: SermonEvaluationDetail;
  capabilities: SermonCapabilities;
  notice?: "duplicate" | "reattach";
  onChanged: () => Promise<unknown>;
}) {
  const isComplete = COMPLETE_SERMON_STATUSES.has(evaluation.status);
  const scoreToDisplay =
    evaluation.durationAdjustmentEnabled && evaluation.overallImpactAdjusted !== null
      ? evaluation.overallImpactAdjusted
      : evaluation.overallImpactBase;
  const aggregateEntries = Object.entries(evaluation.aggregateScores);

  return (
    <div className="space-y-6">
      <Link
        href="/sermon-evaluation"
        className="inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Sermon Evaluation dashboard
      </Link>

      {notice === "duplicate" && (
        <Alert className="border-info/30 bg-info/10">
          <History />
          <AlertTitle>You already evaluated this audio</AlertTitle>
          <AlertDescription>
            No file was uploaded. This is the latest private evaluation for the exact audio bytes; its full fingerprint history and remaining run credits are below.
          </AlertDescription>
        </Alert>
      )}
      {notice === "reattach" && (
        <Alert className="border-warning/50 bg-warning/15">
          <FileAudio />
          <AlertTitle>This audio belongs to existing sermon history</AlertTitle>
          <AlertDescription>
            The retained audio was previously deleted. Reattach the exact same bytes below to preserve history and the existing run-credit balance.
          </AlertDescription>
        </Alert>
      )}

      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SermonStatusBadge status={evaluation.status} />
              <Badge variant="outline">{formatSermonPreset(evaluation.preset)}</Badge>
              <Badge variant="outline">{evaluation.requestedRuns} requested runs</Badge>
            </div>
            <h1 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">{evaluation.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <UserRound className="h-4 w-4" />
                {evaluation.preacher}
              </span>
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Preached {formatDate(evaluation.preachedOn)}
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Private coaching feedback
              </span>
            </div>
          </div>
          {isComplete && (
            <div className="min-w-48 rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {evaluation.durationAdjustmentEnabled ? "Displayed Overall Impact" : "Base Overall Impact"}
              </p>
              <p className="mt-1 text-4xl font-semibold tabular-nums text-primary">{formatScore(scoreToDisplay)}</p>
              <p className="mt-1 text-xs text-muted-foreground">out of 5.00</p>
            </div>
          )}
        </div>
      </header>

      <SermonDetailProgress
        status={evaluation.status}
        requestedRuns={evaluation.requestedRuns}
        completedRuns={evaluation.completedRuns}
        retryWave={evaluation.retryWave}
        cancelRequested={!!evaluation.cancelRequestedAt}
      />

      {evaluation.status === "COMPLETE_WITH_WARNINGS" && (
        <Alert className="border-warning/50 bg-warning/15">
          <AlertTitle>Completed with fewer self-consistency runs</AlertTitle>
          <AlertDescription>
            {evaluation.completedRuns} of {evaluation.requestedRuns} requested scoring runs completed. Coaching feedback is available, but the score spread reflects fewer independent judgments than requested.
          </AlertDescription>
        </Alert>
      )}
      {evaluation.warnings.map((warning, index) => (
        <Alert key={`${warning.code ?? "warning"}-${index}`} className="border-warning/50 bg-warning/15">
          <AlertTitle>{warning.code ? formatMetricLabel(warning.code) : "Evaluation warning"}</AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}
      {evaluation.doctrinalGate.status === "FAIL" && (
        <Alert variant="destructive">
          <AlertTitle>Core-doctrine gate applied</AlertTitle>
          <AlertDescription>
            Overall Impact was capped because the evaluator identified an explicit contradiction of an implicated core doctrine.
            {evaluation.doctrinalGate.reason
              ? ` ${evaluation.doctrinalGate.reason}`
              : " Review the doctrinal-fidelity rubric feedback for the supporting evidence."}
          </AlertDescription>
        </Alert>
      )}
      {(evaluation.status === "FAILED" || evaluation.status === "TIMED_OUT") && (
        <Alert variant="destructive">
          <AlertTitle>
            {evaluation.status === "TIMED_OUT" ? "The 15-minute attempt deadline was reached" : "Evaluation attempt failed"}
          </AlertTitle>
          <AlertDescription>
            {evaluation.errorMessage ?? "Failed evaluations do not consume sermon run credits; only successful rounds in completed evaluations count."}
            {evaluation.errorCode ? ` (${evaluation.errorCode})` : ""}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {isComplete && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {aggregateEntries.map(([key, score]) => (
                  <Card key={key}>
                    <CardContent className="p-5">
                      <p className="text-sm text-muted-foreground">{formatMetricLabel(key)}</p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums">{score.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {Object.keys(evaluation.aggregateFeedback).length > 0 && (
                <AggregateFeedback evaluation={evaluation} />
              )}

              <Tabs defaultValue="coaching" className="space-y-4">
                <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
                  <TabsTrigger value="coaching">Coaching</TabsTrigger>
                  <TabsTrigger value="rubric">Rubric · {SERMON_CRITERIA_COUNT} criteria</TabsTrigger>
                  <TabsTrigger value="structure">Sermon structure</TabsTrigger>
                  <TabsTrigger value="history">Evaluation history</TabsTrigger>
                </TabsList>
                <TabsContent value="coaching">
                  <CoachingFeedback evaluation={evaluation} />
                </TabsContent>
                <TabsContent value="rubric">
                  <RubricDetail evaluation={evaluation} />
                </TabsContent>
                <TabsContent value="structure">
                  <StructureDetail evaluation={evaluation} />
                </TabsContent>
                <TabsContent value="history">
                  <HistoryDetail evaluation={evaluation} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <aside className="space-y-6">
          <PrivateAudioCard evaluation={evaluation} />
          <ReportDownloads evaluation={evaluation} />
          <ProvenanceCard evaluation={evaluation} />
        </aside>
      </div>

      <Separator />
      <SermonDetailActions
        evaluation={evaluation}
        capabilities={capabilities}
        onChanged={onChanged}
      />
      <RunCreditCard evaluation={evaluation} />
    </div>
  );
}

const COMPLETION_NOTICE_DURATION_MS = 6_000;

export function SermonDetailProgress({
  status,
  requestedRuns,
  completedRuns,
  retryWave,
  cancelRequested,
}: {
  status: SermonEvaluationDetail["status"];
  requestedRuns: number;
  completedRuns: number;
  retryWave?: number | null;
  cancelRequested?: boolean;
}) {
  const [progressState, setProgressState] = useState({
    status,
    showCompletionNotice: false,
  });

  // React permits this guarded previous-prop pattern and immediately retries
  // the render, so no stale completed state is painted or synchronized by an
  // effect.
  if (progressState.status !== status) {
    setProgressState({
      status,
      showCompletionNotice:
        ACTIVE_SERMON_STATUSES.has(progressState.status) &&
        COMPLETE_SERMON_STATUSES.has(status),
    });
  }

  useEffect(() => {
    if (!progressState.showCompletionNotice) {
      return;
    }

    const timeout = window.setTimeout(
      () =>
        setProgressState((current) => ({
          ...current,
          showCompletionNotice: false,
        })),
      COMPLETION_NOTICE_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [progressState.showCompletionNotice]);

  if (
    COMPLETE_SERMON_STATUSES.has(status) &&
    !progressState.showCompletionNotice
  ) {
    return null;
  }

  return (
    <SermonStageProgress
      status={status}
      requestedRuns={requestedRuns}
      completedRuns={completedRuns}
      retryWave={retryWave}
      cancelRequested={cancelRequested}
    />
  );
}

function RunCreditCard({ evaluation }: { evaluation: SermonEvaluationDetail }) {
  const used = Math.min(evaluation.runCredits.limit, evaluation.runCredits.consumed);
  const reserved = Math.min(
    evaluation.runCredits.limit - used,
    evaluation.runCredits.reserved,
  );
  const usedPercent = evaluation.runCredits.limit === 0 ? 0 : (used / evaluation.runCredits.limit) * 100;
  const reservedPercent =
    evaluation.runCredits.limit === 0 ? 0 : (reserved / evaluation.runCredits.limit) * 100;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Lifetime sermon run credits</p>
            <p className="mt-1 font-serif text-xl font-semibold">
              {used} of {evaluation.runCredits.limit} sermon run credits used
            </p>
          </div>
          <p className="text-sm font-medium text-accent">
            {evaluation.runCredits.remaining} remaining
          </p>
        </div>
        <div
          className="mt-4 flex h-3 overflow-hidden rounded-full bg-secondary"
          role="meter"
          aria-label={`${used} of ${evaluation.runCredits.limit} sermon run credits used`}
          aria-valuemin={0}
          aria-valuemax={evaluation.runCredits.limit}
          aria-valuenow={used}
        >
          <div className="h-full bg-primary" style={{ width: `${usedPercent}%` }} />
          <div className="h-full bg-warning" style={{ width: `${reservedPercent}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>Standard costs one credit.</span>
          <span>Self-consistency costs three.</span>
          {reserved > 0 && <span>{reserved} currently reserved.</span>}
          <span>Failed evaluations release their reservations.</span>
          <span>Consumed credits are not restored by deletion.</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CoachingFeedback({ evaluation }: { evaluation: SermonEvaluationDetail }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {evaluation.coaching.summary && (
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Coaching summary</CardTitle>
          </CardHeader>
          <CardContent className="max-w-[72ch] leading-relaxed">
            <MarkdownWithBibleVerses content={evaluation.coaching.summary} />
          </CardContent>
        </Card>
      )}
      <FeedbackList title="Strengths to steward" items={evaluation.coaching.strengths} tone="success" />
      <FeedbackList title="Growth areas" items={evaluation.coaching.growthAreas} tone="warning" />
      <FeedbackList title="Practical next steps" items={evaluation.coaching.nextSteps} tone="info" className="xl:col-span-2" />
    </div>
  );
}

function AggregateFeedback({
  evaluation,
}: {
  evaluation: SermonEvaluationDetail;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          Aggregate coaching
        </CardTitle>
        <CardDescription>
          Canonical feedback for each weighted aggregate dimension and the doctrinal gate.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        {Object.entries(evaluation.aggregateFeedback).map(([key, feedback]) => (
          <div key={key} className="rounded-lg border border-border p-4">
            <p className="mb-2 font-medium">{formatMetricLabel(key)}</p>
            <div className="text-sm leading-relaxed text-muted-foreground">
              <MarkdownWithBibleVerses content={feedback} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FeedbackList({
  title,
  items,
  tone,
  className = "",
}: {
  title: string;
  items: string[];
  tone: "success" | "warning" | "info";
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="font-serif text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="space-y-3">
            {items.map((item, index) => (
              <li key={index} className="flex items-start gap-3">
                <span
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-info"
                  }`}
                />
                <div className="min-w-0 flex-1 leading-relaxed">
                  <MarkdownWithBibleVerses content={item} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No items were published for this section.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RubricDetail({ evaluation }: { evaluation: SermonEvaluationDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Seven rubric sections and 28 subcriteria</CardTitle>
        <CardDescription>
          Scores and feedback are preserved from the canonical two-step evaluator.
          {evaluation.scoringConfidence !== null
            ? ` Scoring confidence: ${formatConfidence(evaluation.scoringConfidence)}.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {evaluation.rubricSections.length > 0 ? (
          <Accordion type="multiple">
            {evaluation.rubricSections.map((section) => (
              <AccordionItem key={section.key} value={section.key}>
                <AccordionTrigger className="gap-4">
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-2">
                    <span>{section.label}</span>
                    <span className="tabular-nums text-primary">{formatScore(section.score)} / 5</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {section.feedback && (
                    <div className="mb-4 rounded-lg bg-muted/30 p-4 leading-relaxed">
                      <MarkdownWithBibleVerses content={section.feedback} />
                    </div>
                  )}
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {section.subcriteria.map((criterion) => (
                      <div key={criterion.key} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_5rem]">
                        <div>
                          <p className="font-medium">{criterion.label}</p>
                          {criterion.feedback && (
                            <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
                              <MarkdownWithBibleVerses content={criterion.feedback} />
                            </div>
                          )}
                        </div>
                        <p className="text-right font-semibold tabular-nums">{formatScore(criterion.score)} / 5</p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="text-sm text-muted-foreground">Rubric detail has not been published yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function StructureDetail({ evaluation }: { evaluation: SermonEvaluationDetail }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Step 1 sermon extraction</CardTitle>
          <CardDescription>
            The full descriptive extraction produced before analytical scoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <StructureText
            label="Scripture introduction"
            value={evaluation.structure.scriptureIntroduction}
          />
          <StructureText
            label="Sermon introduction"
            value={evaluation.structure.sermonIntroduction}
          />
          <StructureText label="Proposition" value={evaluation.structure.proposition} />
          <StructureText label="Fallen Condition Focus" value={evaluation.structure.fallenConditionFocus} />
          {evaluation.structure.fallenConditionComments && (
            <StructureText
              label="Fallen Condition Focus comments"
              value={evaluation.structure.fallenConditionComments}
            />
          )}
          <StructureText label="Conclusion" value={evaluation.structure.conclusion} />
          {evaluation.structure.extractionConfidence !== null &&
            evaluation.structure.extractionConfidence !== undefined && (
              <MetricLine
                label="Extraction confidence"
                value={formatConfidence(
                  evaluation.structure.extractionConfidence,
                )}
              />
            )}
        </CardContent>
      </Card>
      {evaluation.structure.points.map((point, index) => (
        <Card key={`${point.heading}-${index}`}>
          <CardHeader>
            <CardTitle className="font-serif text-lg">
              {index + 1}. {point.heading}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {point.summary && <MarkdownWithBibleVerses content={point.summary} />}
            {point.scriptures && point.scriptures.length > 0 && (
              <StructureList label="Scripture" items={point.scriptures} />
            )}
            {point.subpoints && point.subpoints.length > 0 && (
              <StructureList label="Subpoints" items={point.subpoints} />
            )}
            {point.applications && point.applications.length > 0 && (
              <StructureList label="Applications" items={point.applications} />
            )}
            {point.illustrations && point.illustrations.length > 0 && (
              <StructureList label="Illustrations" items={point.illustrations} />
            )}
            {point.comments && (
              <StructureText label="Extraction comments" value={point.comments} />
            )}
            {point.feedback && (
              <StructureText label="Extraction feedback" value={point.feedback} />
            )}
          </CardContent>
        </Card>
      ))}
      <div className="grid gap-6 lg:grid-cols-2">
        <StructureListCard label="Applications" items={evaluation.structure.applications} />
        <StructureListCard label="Illustrations" items={evaluation.structure.illustrations} />
      </div>
      {evaluation.structure.comments && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Extraction comments</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownWithBibleVerses content={evaluation.structure.comments} />
          </CardContent>
        </Card>
      )}
      {(evaluation.structure.generalComments.content ||
        evaluation.structure.generalComments.structure ||
        evaluation.structure.generalComments.explanation) && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">
              General extraction comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {evaluation.structure.generalComments.content && (
              <StructureText
                label="Content"
                value={evaluation.structure.generalComments.content}
              />
            )}
            {evaluation.structure.generalComments.structure && (
              <StructureText
                label="Structure"
                value={evaluation.structure.generalComments.structure}
              />
            )}
            {evaluation.structure.generalComments.explanation && (
              <StructureText
                label="Explanation"
                value={evaluation.structure.generalComments.explanation}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HistoryDetail({ evaluation }: { evaluation: SermonEvaluationDetail }) {
  const history = evaluation.history.length > 0 ? evaluation.history : [evaluation];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Exact-audio evaluation history</CardTitle>
        <CardDescription>
          Chronological owner-scoped history. The audio fingerprint itself is never exposed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-5 border-s border-border ps-6">
          {[...history]
            .sort((left, right) => new Date(right.createdAt).valueOf() - new Date(left.createdAt).valueOf())
            .map((item) => (
              <li key={item.id} className="relative">
                <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/sermon-evaluation/${item.id}`}
                    className="font-medium text-accent underline-offset-4 hover:underline"
                  >
                    {formatSermonPreset(item.preset)} evaluation
                  </Link>
                  <SermonStatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(item.createdAt)} · {item.completedRuns} of {item.requestedRuns} runs · Base impact{" "}
                  {formatScore(item.overallImpactBase)}
                </p>
              </li>
            ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function PrivateAudioCard({ evaluation }: { evaluation: SermonEvaluationDetail }) {
  const [authorization, setAuthorization] =
    useState<SermonPlaybackAuthorization | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackButtonRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const playAfterAuthorizationRef = useRef(false);
  const mediaRetryUsedRef = useRef(false);
  const [playing, setPlaying] = useState(false);

  const authorizationIsFresh = (
    candidate: SermonPlaybackAuthorization | null,
  ) =>
    candidate !== null &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    Date.parse(candidate.expiresAt) > Date.now() + 15_000;

  const authorizeAudio = async ({
    force = false,
    mediaRetry = false,
  }: {
    force?: boolean;
    mediaRetry?: boolean;
  } = {}): Promise<SermonPlaybackAuthorization | null> => {
    if (!force && authorizationIsFresh(authorization)) {
      return authorization;
    }
    setLoading(true);
    setError(null);
    try {
      const nextAuthorization = await fetchSermonPlaybackAuthorization(
        evaluation.id,
      );
      if (
        !nextAuthorization.url ||
        !Number.isFinite(Date.parse(nextAuthorization.expiresAt))
      ) {
        throw new Error(
          "The five-minute playback authorization was incomplete.",
        );
      }
      setAuthorization(nextAuthorization);
      if (!mediaRetry) {
        mediaRetryUsedRef.current = false;
      }
      return nextAuthorization;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Private playback could not be authorized.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const refreshAndResume = async (
    audio: HTMLAudioElement,
    resumePlayback: boolean,
    mediaRetry: boolean,
  ) => {
    const resumeAt = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const nextAuthorization = await authorizeAudio({
      force: true,
      mediaRetry,
    });
    if (!nextAuthorization) {
      return;
    }
    audio.src = nextAuthorization.url;
    audio.load();
    const resume = () => {
      if (resumeAt > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(resumeAt, audio.duration);
      }
      if (resumePlayback) {
        void audio.play().catch(() => {
          setError("Private playback could not resume. Please try again.");
        });
      }
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resume();
    } else {
      audio.addEventListener("loadedmetadata", resume, { once: true });
    }
  };

  const startPrivatePlayback = async () => {
    playAfterAuthorizationRef.current = true;
    const nextAuthorization = await authorizeAudio();
    if (!nextAuthorization) {
      playAfterAuthorizationRef.current = false;
    }
  };

  useEffect(() => {
    if (!authorization || !playAfterAuthorizationRef.current) {
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    playAfterAuthorizationRef.current = false;
    playbackButtonRef.current?.focus();
    void audio.play().catch(() => {
      setError("Private audio is ready. Select Play to start it.");
    });
  }, [authorization]);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Volume2 className="h-5 w-5 text-primary" />
          Private audio
        </CardTitle>
        <CardDescription>Playback uses a short-lived, owner-authorized private audio URL.</CardDescription>
      </CardHeader>
      <CardContent aria-busy={loading}>
        {!evaluation.hasRetainedAudio ? (
          <Alert className="border-warning/50 bg-warning/15">
            <AlertTitle>Audio deleted</AlertTitle>
            <AlertDescription>Reports remain available. Re-evaluation requires the exact original file.</AlertDescription>
          </Alert>
        ) : authorization ? (
          <div className="space-y-3">
            <audio
              ref={audioRef}
              src={authorization.url}
              preload="metadata"
              onPlay={(event) => {
                if (!authorizationIsFresh(authorization)) {
                  event.currentTarget.pause();
                  void refreshAndResume(event.currentTarget, true, false);
                  return;
                }
                setError(null);
                setPlaying(true);
              }}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onSeeking={(event) => {
                if (
                  !loading &&
                  !authorizationIsFresh(authorization)
                ) {
                  const shouldResume = !event.currentTarget.paused;
                  event.currentTarget.pause();
                  void refreshAndResume(
                    event.currentTarget,
                    shouldResume,
                    false,
                  );
                }
              }}
              onError={(event) => {
                if (loading) {
                  return;
                }
                if (mediaRetryUsedRef.current) {
                  setError(
                    "Private playback could not continue after refreshing its authorization.",
                  );
                  return;
                }
                mediaRetryUsedRef.current = true;
                void refreshAndResume(event.currentTarget, true, true);
              }}
              className="w-full"
              controls
            >
              Your browser does not support private audio playback.
            </audio>
            <Button
              ref={playbackButtonRef}
              variant="outline"
              className="w-full"
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                if (audio.paused) {
                  setError(null);
                  if (!authorizationIsFresh(authorization)) {
                    void refreshAndResume(audio, true, false);
                  } else {
                    void audio.play().catch(() => {
                      setError("Private playback could not start.");
                    });
                  }
                } else {
                  audio.pause();
                }
              }}
              disabled={loading}
              aria-describedby={error ? "private-audio-error" : undefined}
            >
              {loading ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : playing ? (
                <Pause />
              ) : (
                <Play />
              )}
              {loading ? "Refreshing private audio…" : playing ? "Pause" : "Play"}
            </Button>
          </div>
        ) : (
          <>
            <dl className="mb-4 space-y-2 text-sm">
              {evaluation.audio.filename && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">File</dt>
                  <dd className="max-w-44 truncate text-right font-medium" title={evaluation.audio.filename}>
                    {evaluation.audio.filename}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="font-medium tabular-nums">{formatDuration(evaluation.durationSeconds)}</dd>
              </div>
              {evaluation.audio.byteSize !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Size</dt>
                  <dd className="font-medium tabular-nums">{formatAudioBytes(evaluation.audio.byteSize)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Verification</dt>
                <dd className={evaluation.audio.verified ? "text-success" : "text-muted-foreground"}>
                  {evaluation.audio.verified ? "Verified" : "Pending"}
                </dd>
              </div>
            </dl>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void startPrivatePlayback()}
              disabled={loading}
              aria-describedby={error ? "private-audio-error" : undefined}
            >
              {loading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Play />}
              {loading ? "Starting private audio…" : "Play private audio"}
            </Button>
          </>
        )}
        {error && (
          <p
            ref={errorRef}
            id="private-audio-error"
            role="alert"
            tabIndex={-1}
            className="mt-3 text-sm text-destructive outline-none"
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatAudioBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function formatConfidence(value: number): string {
  return `${(value * (value <= 1 ? 100 : 1)).toFixed(0)}%`;
}

function ProvenanceCard({ evaluation }: { evaluation: SermonEvaluationDetail }) {
  const entries = Object.entries(evaluation.provenance);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">Evaluator provenance</CardTitle>
        <CardDescription>Reproducibility metadata; prompts, secrets, and internal identifiers stay private.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length > 0 ? (
          <dl className="space-y-3 text-sm">
            {entries.map(([key, value]) => (
              <div key={key} className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">{formatMetricLabel(key)}</dt>
                <dd className="break-words font-mono text-xs text-foreground">{String(value ?? "—")}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Provenance will appear when the evaluation publishes.</p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StructureText({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">{label}</p>
      {value ? (
        <div className="leading-relaxed">
          <MarkdownWithBibleVerses content={value} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not identified.</p>
      )}
    </div>
  );
}

function StructureList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">{label}</p>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="rounded-lg bg-muted/30 p-3">
            <MarkdownWithBibleVerses content={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StructureListCard({ label, items }: { label: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <StructureList label={label} items={items} />
        ) : (
          <p className="text-sm text-muted-foreground">None identified.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw />
              Try again
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/sermon-evaluation">Back to dashboard</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="container mx-auto max-w-7xl space-y-6" aria-label="Loading sermon evaluation">
      <div className="h-4 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="h-12 max-w-xl animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/30 motion-reduce:animate-none" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="h-96 animate-pulse rounded-xl border border-border bg-muted/30 motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/30 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
