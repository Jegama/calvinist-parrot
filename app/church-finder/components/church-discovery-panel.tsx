"use client";

import { useState, useEffect } from "react";

import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { ChurchDetail, ChurchSearchResult } from "@/types/church";
import { checkChurchExists, createChurch, fetchChurchDetail, searchChurches } from "@/app/church-finder/api";

type EvaluationStatus = "idle" | "fetching" | "analyzing" | "complete";

type BulkReEvaluationProgress = {
  total: number;
  current: number;
  currentChurchName: string;
  completed: string[];
  failed: Array<{ name: string; error: string }>;
};

type ChurchDiscoveryPanelProps = {
  onChurchCreated: (church: ChurchDetail) => void;
  onChurchView: (church: ChurchDetail) => void;
};

export function ChurchDiscoveryPanel({ onChurchCreated, onChurchView }: ChurchDiscoveryPanelProps) {
  const { user } = useAuth();
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [searchResults, setSearchResults] = useState<ChurchSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [creationError, setCreationError] = useState<string | null>(null);
  const [evaluatingIds, setEvaluatingIds] = useState<Set<string>>(new Set());
  const [existingChurchIds, setExistingChurchIds] = useState<Map<string, string>>(new Map());
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus>("idle");
  const [searchEvaluationStatuses, setSearchEvaluationStatuses] = useState<Map<string, EvaluationStatus>>(new Map());

  // Bulk re-evaluation state
  const [isBulkReEvaluating, setIsBulkReEvaluating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkReEvaluationProgress | null>(null);

  const isAdmin = user?.$id === process.env.NEXT_PUBLIC_ADMIN_ID;

  // Simulate progress through evaluation stages
  useEffect(() => {
    if (evaluationStatus === "idle") return;

    const timers: NodeJS.Timeout[] = [];

    if (evaluationStatus === "fetching") {
      // Move to analyzing after 12 seconds (realistic crawl time)
      const timer = setTimeout(() => {
        setEvaluationStatus((prev) => (prev === "fetching" ? "analyzing" : prev));
      }, 12000);
      timers.push(timer);
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [evaluationStatus]);

  const getStatusMessage = (status: EvaluationStatus): string => {
    switch (status) {
      case "fetching":
        return "Fetching info...";
      case "analyzing":
        return "Analyzing...";
      case "complete":
      case "idle":
      default:
        return "";
    }
  };

  const searchMutation = useMutation({
    mutationFn: async () => {
      const trimmedCity = city.trim();
      if (!trimmedCity) {
        throw new Error("City is required for search");
      }
      const results = await searchChurches({ city: trimmedCity, state: state.trim() || undefined });
      return results;
    },
    onSuccess: async (results) => {
      setSearchError(null);
      // Only show churches with websites since we can't evaluate those without
      const churchesWithWebsites = results.filter((church) => church.website);
      setSearchResults(churchesWithWebsites);

      // Check which churches already exist in our database
      const existenceChecks = await Promise.all(
        churchesWithWebsites.map(async (church) => {
          if (!church.website) return { osmId: church.id, exists: false };
          try {
            const check = await checkChurchExists(church.website);
            return { osmId: church.id, exists: check.exists, churchId: check.churchId };
          } catch {
            return { osmId: church.id, exists: false };
          }
        })
      );

      // Build map of OSM ID -> our church ID
      const existingMap = new Map<string, string>();
      existenceChecks.forEach((check) => {
        if (check.exists && check.churchId) {
          existingMap.set(check.osmId, check.churchId);
        }
      });
      setExistingChurchIds(existingMap);
    },
    onError: (error: Error) => {
      setSearchError(error.message || "Unable to search right now");
      setSearchResults([]);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (websiteUrl: string) => {
      if (!websiteUrl.trim()) {
        throw new Error("Website is required");
      }

      setEvaluationStatus("fetching");

      // Check if church already exists
      const check = await checkChurchExists(websiteUrl.trim());
      if (check.exists && check.churchId) {
        // Fetch and return existing church
        const existingChurch = await fetchChurchDetail(check.churchId);
        return { church: existingChurch, wasExisting: true };
      }

      // Create new evaluation
      const church = await createChurch({ website: websiteUrl.trim() });
      return { church, wasExisting: false };
    },
    onSuccess: ({ church, wasExisting }) => {
      setEvaluationStatus("complete");
      setCreationError(null);
      setWebsite("");
      if (wasExisting) {
        onChurchView(church);
      } else {
        onChurchCreated(church);
      }
      // Reset status after a short delay
      setTimeout(() => setEvaluationStatus("idle"), 500);
    },
    onError: (error: Error) => {
      setEvaluationStatus("idle");
      setCreationError(error.message || "Unable to add church right now");
    },
  });

  const handleEvaluateFromSearch = async (result: ChurchSearchResult) => {
    if (!result.website) return;

    setEvaluatingIds((prev) => new Set(prev).add(result.id));
    setSearchEvaluationStatuses((prev) => new Map(prev).set(result.id, "fetching"));
    setCreationError(null);

    // Set up progress simulation for this specific church
    const fetchingTimer = setTimeout(() => {
      setSearchEvaluationStatuses((prev) => new Map(prev).set(result.id, "analyzing"));
    }, 15000);

    try {
      // Check if church already exists
      const existingChurchId = existingChurchIds.get(result.id);
      if (existingChurchId) {
        // Fetch and show existing church
        const existingChurch = await fetchChurchDetail(existingChurchId);
        onChurchView(existingChurch);
      } else {
        // Create new evaluation
        const church = await createChurch({ website: result.website });
        onChurchCreated(church);
      }
      setSearchEvaluationStatuses((prev) => new Map(prev).set(result.id, "complete"));
      // Reset status after a short delay
      setTimeout(() => {
        setSearchEvaluationStatuses((prev) => {
          const next = new Map(prev);
          next.delete(result.id);
          return next;
        });
      }, 500);
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : "Unable to add church right now");
      setSearchEvaluationStatuses((prev) => {
        const next = new Map(prev);
        next.delete(result.id);
        return next;
      });
    } finally {
      clearTimeout(fetchingTimer);
      setEvaluatingIds((prev) => {
        const next = new Set(prev);
        next.delete(result.id);
        return next;
      });
    }
  };

  const handleBulkReEvaluate = async () => {
    if (!isAdmin || !user?.$id) return;

    setIsBulkReEvaluating(true);
    setBulkProgress({
      total: 0,
      current: 0,
      currentChurchName: "Fetching churches...",
      completed: [],
      failed: [],
    });

    try {
      // Fetch all churches in one request with a very high page size
      const response = await fetch(`/api/churches?page=1&pageSize=10000`);
      if (!response.ok) {
        throw new Error("Failed to fetch churches");
      }
      const data = await response.json();
      const churches = data.items.map((item: ChurchDetail) => ({
        id: item.id,
        name: item.name,
        website: item.website,
      }));

      setBulkProgress((prev) => ({
        ...prev!,
        total: churches.length,
        currentChurchName: "Starting evaluations...",
      }));

      // Re-evaluate each church sequentially (to avoid rate limits)
      for (let i = 0; i < churches.length; i++) {
        const church = churches[i];

        setBulkProgress((prev) => ({
          ...prev!,
          current: i + 1,
          currentChurchName: church.name,
        }));

        try {
          await createChurch({
            website: church.website,
            forceReEvaluate: true,
            userId: user.$id,
          });

          setBulkProgress((prev) => ({
            ...prev!,
            completed: [...prev!.completed, church.name],
          }));

          // Small delay to avoid overwhelming the API
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Failed to re-evaluate ${church.name}:`, error);
          setBulkProgress((prev) => ({
            ...prev!,
            failed: [
              ...prev!.failed,
              {
                name: church.name,
                error: error instanceof Error ? error.message : "Unknown error",
              },
            ],
          }));
        }
      }

      // Final update
      setBulkProgress((prev) => ({
        ...prev!,
        currentChurchName: "Complete!",
      }));
    } catch (error) {
      console.error("Bulk re-evaluation error:", error);
      setBulkProgress((prev) => ({
        ...prev!,
        currentChurchName: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }));
    } finally {
      setIsBulkReEvaluating(false);
    }
  };

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-foreground">Discover and add churches</CardTitle>
        <CardDescription>
          Help grow the directory. Search by city, then evaluate a church by entering its website so others can benefit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">Evaluate a church by website</h3>
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://examplechurch.org"
              aria-label="Church website"
            />
            <Button
              type="button"
              onClick={() => createMutation.mutate(website)}
              disabled={createMutation.status === "pending" || !website.trim()}
              className="md:w-48 min-w-[160px]"
            >
              {createMutation.status === "pending" ? (
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Spinner />
                  <span className="text-xs">{getStatusMessage(evaluationStatus)}</span>
                </span>
              ) : (
                "Evaluate & add"
              )}
            </Button>
          </div>
          {creationError ? <p className="text-sm text-red-500">{creationError}</p> : null}
          <p className="text-xs text-muted-foreground">
            We read what the church publishes on its website and summarize it with our evaluation pipeline. If a belief
            is not stated online, we cannot infer it.
          </p>
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">Search by city</h3>
          <p className="text-xs text-muted-foreground">
            Very basic search to find churches in a city. If you want to contribute with a better search system,
            consider{" "}
            <a
              href="https://github.com/Jegama/calvinist-parrot"
              className="underline underline-offset-2 hover:no-underline"
            >
              taking a look at our GitHub repo
            </a>
            .
          </p>
          <div className="grid gap-3 md:grid-cols-[2fr,1fr,auto]">
            <Input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="City (e.g., Houston)"
              aria-label="City name"
            />
            <Input
              value={state}
              onChange={(event) => setState(event.target.value)}
              placeholder="State (optional)"
              aria-label="State name"
            />
            <Button
              type="button"
              onClick={() => searchMutation.mutate()}
              disabled={searchMutation.status === "pending"}
            >
              {searchMutation.status === "pending" ? <Spinner /> : "Search"}
            </Button>
          </div>
          {searchError ? <p className="text-sm text-red-500">{searchError}</p> : null}
          {searchResults.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm shadow-sm">
              <p className="mb-3 font-semibold text-foreground">
                Found {searchResults.length} {searchResults.length === 1 ? "result" : "results"}
              </p>
              <ul className="space-y-3">
                {searchResults.map((result) => (
                  <li key={result.id} className="rounded-md border border-border bg-card shadow-sm p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{result.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {result.address.city || "Unknown city"}, {result.address.state || "Unknown state"}
                        </p>
                        {result.displayName && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{result.displayName}</p>
                        )}
                        {result.website ? (
                          <a
                            href={result.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-1 inline-block"
                          >
                            {result.website}
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground/60 italic mt-1">No website available</p>
                        )}
                      </div>
                      {result.website && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleEvaluateFromSearch(result)}
                          disabled={evaluatingIds.has(result.id)}
                          className="shrink-0 min-w-[120px]"
                        >
                          {evaluatingIds.has(result.id) ? (
                            <span className="flex items-center gap-2 whitespace-nowrap">
                              <Spinner />
                              <span className="text-xs">
                                {getStatusMessage(searchEvaluationStatuses.get(result.id) ?? "idle")}
                              </span>
                            </span>
                          ) : existingChurchIds.has(result.id) ? (
                            "View"
                          ) : (
                            "Evaluate"
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* Admin Bulk Re-evaluation Section */}
        {isAdmin && (
          <>
            <Separator />
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Admin Actions</h3>
              <Alert className="bg-primary/5 border-primary/20 dark:bg-primary/10 dark:border-primary/30">
                <Info className="h-4 w-4 !text-primary" />
                <AlertTitle className="text-primary font-semibold">Bulk Re-evaluate All Churches</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p className="text-foreground/80">
                    This will re-run the evaluation pipeline for ALL churches in the database using their current
                    website content. This process may take a long time depending on the number of churches.
                  </p>

                  {bulkProgress && (
                    <div className="rounded-md border border-primary/30 bg-card p-4 space-y-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          Progress: {bulkProgress.current} / {bulkProgress.total}
                        </span>
                        <span className="text-sm text-primary font-semibold">
                          {bulkProgress.total > 0
                            ? `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%`
                            : "0%"}
                        </span>
                      </div>

                      <div className="w-full bg-primary/10 rounded-full h-2.5">
                        <div
                          className="bg-primary h-2.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%`,
                          }}
                        />
                      </div>

                      <p className="text-sm text-foreground">
                        <span className="font-medium">Current:</span> {bulkProgress.currentChurchName}
                      </p>

                      {bulkProgress.completed.length > 0 && (
                        <div className="text-sm">
                          <p className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            Completed: {bulkProgress.completed.length}
                          </p>
                        </div>
                      )}

                      {bulkProgress.failed.length > 0 && (
                        <div className="text-sm">
                          <p className="font-medium text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Failed: {bulkProgress.failed.length}
                          </p>
                          <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                            {bulkProgress.failed.map((failure, idx) => (
                              <p key={idx} className="text-xs text-destructive/80">
                                • {failure.name}: {failure.error}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      onClick={handleBulkReEvaluate}
                      disabled={isBulkReEvaluating}
                      className="w-full sm:w-auto"
                    >
                      {isBulkReEvaluating ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Re-evaluating...
                        </span>
                      ) : (
                        "Start Bulk Re-evaluation"
                      )}
                    </Button>
                    {isBulkReEvaluating && (
                      <p className="text-xs text-muted-foreground">
                        Please keep this page open. This may take several minutes.
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            </section>
          </>
        )}

        <Separator />
        <p className="text-xs text-muted-foreground">
          Notice an error?{" "}
          <a
            href="mailto:contact@calvinistparrotministries.org"
            className="underline underline-offset-2 hover:no-underline"
          >
            Email us
          </a>{" "}
          with the page link and what needs correction.
        </p>
      </CardContent>
    </Card>
  );
}
