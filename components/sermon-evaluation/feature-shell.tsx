"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Beaker, BookOpenText, FilePlus2, LockKeyhole, RefreshCw, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ProtectedView } from "@/components/ProtectedView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchSermonAnalytics, fetchSermonCapabilities, fetchSermonEvaluations } from "./api";
import { SermonDashboard } from "./dashboard";
import { SermonUploadForm } from "./upload-form";
import type { SermonAnalyticsPoint } from "./types";

export function SermonEvaluationFeature() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const capabilitiesQuery = useQuery({
    queryKey: ["sermon-evaluations", "capabilities"],
    queryFn: fetchSermonCapabilities,
    enabled: !!user && !authLoading,
    staleTime: 60_000,
    retry: false,
  });
  const dataQuery = useQuery({
    queryKey: ["sermon-evaluations", "dashboard"],
    queryFn: async () => {
      const [analyticsResult, listResult] = await Promise.allSettled([
        fetchSermonAnalytics(),
        fetchSermonEvaluations(),
      ]);
      if (analyticsResult.status === "rejected" && listResult.status === "rejected") {
        throw analyticsResult.reason;
      }
      const analytics =
        analyticsResult.status === "fulfilled" ? analyticsResult.value.evaluations : [];
      const list = listResult.status === "fulfilled" ? listResult.value : [];
      const byId = new Map<string, SermonAnalyticsPoint>();
      for (const evaluation of list) {
        byId.set(evaluation.id, { ...evaluation, aggregateScores: {} });
      }
      for (const evaluation of analytics) {
        const existing = byId.get(evaluation.id);
        byId.set(
          evaluation.id,
          existing
            ? {
                ...existing,
                preacher: evaluation.preacher,
                preachedOn: evaluation.preachedOn,
                status: evaluation.status,
                overallImpactBase: evaluation.overallImpactBase,
                overallImpactAdjusted: evaluation.overallImpactAdjusted,
                durationAdjustmentEnabled: evaluation.durationAdjustmentEnabled,
                durationSeconds: evaluation.durationSeconds ?? existing.durationSeconds,
                uncertaintyLow: evaluation.uncertaintyLow ?? existing.uncertaintyLow,
                uncertaintyHigh: evaluation.uncertaintyHigh ?? existing.uncertaintyHigh,
                aggregateScores: evaluation.aggregateScores,
              }
            : evaluation,
        );
      }
      return [...byId.values()].sort(
        (left, right) => new Date(right.preachedOn).valueOf() - new Date(left.preachedOn).valueOf(),
      );
    },
    enabled: capabilitiesQuery.data?.hasAccess === true,
    staleTime: 30_000,
  });

  const authFallback = (
    <main className="min-h-[calc(100vh-var(--app-header-height))] bg-background px-4 py-8 sm:px-6">
      <div className="container mx-auto max-w-7xl">
        <div className="h-10 w-72 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-3 h-5 max-w-2xl animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-8 h-96 animate-pulse rounded-xl border border-border bg-muted/30 motion-reduce:animate-none" />
      </div>
    </main>
  );

  return (
    <ProtectedView fallback={authFallback}>
      <main className="min-h-[calc(100vh-var(--app-header-height))] bg-background px-4 py-8 sm:px-6">
        <div className="container mx-auto max-w-7xl">
          <header className="mb-8">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-accent">
                  <Beaker className="h-4 w-4" />
                  Labs · Private beta
                </div>
                <h1 className="mb-2 font-serif text-3xl font-bold text-foreground">Sermon Evaluation</h1>
                <p className="text-muted-foreground">
                  Detailed, private coaching feedback that preserves the sermon&apos;s structure, rubric, aggregates, and practical next steps.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/sermon-evaluation/framework">
                    <BookOpenText />
                    How evaluations work
                  </Link>
                </Button>
                {capabilitiesQuery.data?.hasAccess && (
                  <Button className="w-full sm:w-auto" onClick={() => setTab("new")}>
                    <FilePlus2 />
                    New evaluation
                  </Button>
                )}
              </div>
            </div>
          </header>

          {capabilitiesQuery.isPending ? (
            <CapabilitiesLoading />
          ) : capabilitiesQuery.isError ? (
            <Alert variant="destructive">
              <ShieldAlert />
              <AlertTitle>Could not verify sermon evaluation access</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>
                  {capabilitiesQuery.error instanceof Error
                    ? capabilitiesQuery.error.message
                    : "The server-derived capabilities could not be loaded."}
                </span>
                <Button variant="outline" size="sm" onClick={() => void capabilitiesQuery.refetch()}>
                  <RefreshCw />
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : !capabilitiesQuery.data?.hasAccess ? (
            <AccessDenied />
          ) : user ? (
            <Tabs value={tab} onValueChange={setTab} className="space-y-6">
              <div className="flex items-center justify-between gap-4 overflow-x-auto">
                <TabsList className="h-10">
                  <TabsTrigger value="dashboard" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="new" className="gap-2">
                    <FilePlus2 className="h-4 w-4" />
                    New evaluation
                  </TabsTrigger>
                </TabsList>
                {capabilitiesQuery.data.isAdmin && (
                  <span className="hidden rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
                    Sermon evaluator admin
                  </span>
                )}
              </div>
              <TabsContent value="dashboard">
                {dataQuery.isError && (
                  <Alert variant="destructive" className="mb-6">
                    <AlertTitle>Dashboard data could not be loaded</AlertTitle>
                    <AlertDescription className="flex flex-col items-start gap-3">
                      <span>
                        {dataQuery.error instanceof Error ? dataQuery.error.message : "Please try again."}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => void dataQuery.refetch()}>
                        <RefreshCw />
                        Reload dashboard
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <SermonDashboard evaluations={dataQuery.data ?? []} loading={dataQuery.isPending} />
              </TabsContent>
              <TabsContent value="new" className="mx-auto max-w-4xl">
                <SermonUploadForm capabilities={capabilitiesQuery.data} user={user} />
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </main>
    </ProtectedView>
  );
}

function CapabilitiesLoading() {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
        <div className="h-10 w-10 animate-pulse rounded-full bg-primary/15 motion-reduce:animate-none" />
        <div className="mt-4 h-5 w-56 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <span className="sr-only">Checking sermon evaluation access</span>
      </CardContent>
    </Card>
  );
}

function AccessDenied() {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 rounded-full bg-muted p-3 text-muted-foreground">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <CardTitle className="font-serif text-2xl">Private beta access required</CardTitle>
        <CardDescription className="mx-auto max-w-lg">
          Sermon Evaluation is currently available only to accounts with a server-managed sermon evaluator beta or admin label.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertTitle>Your other Calvinist Parrot features are unchanged</AlertTitle>
          <AlertDescription>
            Access is checked from your authenticated Appwrite account. If an operator recently granted access, refresh your session by signing out and back in.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
