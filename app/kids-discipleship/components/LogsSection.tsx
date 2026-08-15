// app/kids-discipleship/components/LogsSection.tsx
// Section C: Nurture & Admonition Log
"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAutoGrowingTextarea } from "@/hooks/use-auto-growing-textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Heart,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  BookOpen,
  Lightbulb,
  CheckCircle,
  RefreshCw,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { BibleVerse } from "@/components/BibleVerse";
import type { KidsCall1Output, KidsCall2Output } from "@/lib/prompts/kids-discipleship";

interface LogEntry {
  id: string;
  entryDate: string;
  entryText: string;
  category: "NURTURE" | "ADMONITION";
  gospelConnection: string | null;
  tags: string[];
  createdAt: string;
  aiOutput: {
    call1: KidsCall1Output | null;
    call2: KidsCall2Output | null;
  } | null;
}

interface Props {
  userId: string;
  memberId: string;
  childName: string;
}

interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Streaming event types
type StreamEvent =
  | { type: "entry_created"; entry: Partial<LogEntry> & { gospelConnection?: string | null } }
  | { type: "progress"; stage: string; message: string }
  | { type: "call1_complete"; call1: KidsCall1Output }
  | { type: "call2_complete"; call2: KidsCall2Output }
  | { type: "done"; entry: Partial<LogEntry>; call1: KidsCall1Output; call2: KidsCall2Output }
  | { type: "error"; message: string };

async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

async function consumeLogStream(
  response: Response,
  onEvent: (event: StreamEvent) => void
) {
  if (!response.ok || !response.body) {
    throw new Error(await readApiError(response, "Generation request failed"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let receivedTerminalEvent = false;

  const processLine = (line: string) => {
    if (!line.trim()) return;

    const event = JSON.parse(line) as StreamEvent;
    onEvent(event);
    if (event.type === "done" || event.type === "error") {
      receivedTerminalEvent = true;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(processLine);
  }

  buffer += decoder.decode();
  processLine(buffer);

  if (!receivedTerminalEvent) {
    throw new Error("Generation stopped before it finished. Please try again.");
  }
}

async function fetchLogs(memberId: string): Promise<LogsResponse> {
  const params = new URLSearchParams({ memberId });
  const res = await fetch(`/api/kids-discipleship/logs?${params}`);
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

export function LogsSection({ userId, memberId, childName }: Props) {
  const queryClient = useQueryClient();
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<"NURTURE" | "ADMONITION">("NURTURE");
  const [entryText, setEntryText] = useState("");
  const [gospelConnection, setGospelConnection] = useState("");
  const {
    textareaRef: entryTextareaRef,
    handleInput: handleEntryInput,
  } = useAutoGrowingTextarea(entryText, {
    minHeight: 128,
    maxHeight: 420,
    maxViewportRatio: 0.34,
    enabled: isComposerOpen,
  });
  const {
    textareaRef: gospelConnectionTextareaRef,
    handleInput: handleGospelConnectionInput,
  } = useAutoGrowingTextarea(gospelConnection, {
    minHeight: 80,
    maxHeight: 240,
    maxViewportRatio: 0.2,
    enabled: isComposerOpen,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamProgress, setStreamProgress] = useState<string | null>(null);
  const [newLogEntry, setNewLogEntry] = useState<LogEntry | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [retryProgress, setRetryProgress] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [logActionError, setLogActionError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [pendingDeleteLog, setPendingDeleteLog] = useState<LogEntry | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [pagesByFilter, setPagesByFilter] = useState<Record<string, number>>({});

  const PAGE_SIZE = 5;

  // Fetch all logs once, filter client-side to avoid extra network calls
  const { data, isLoading } = useQuery({
    queryKey: ["kids-discipleship", "logs", memberId],
    queryFn: () => fetchLogs(memberId),
    enabled: !!userId && !!memberId,
  });

  const updateVisibleLog = useCallback(
    (logId: string, update: (entry: LogEntry) => LogEntry) => {
      setNewLogEntry((current) =>
        current?.id === logId ? update(current) : current
      );
      queryClient.setQueryData<LogsResponse>(
        ["kids-discipleship", "logs", memberId],
        (current) =>
          current
            ? {
                ...current,
                logs: current.logs.map((entry) =>
                  entry.id === logId ? update(entry) : entry
                ),
              }
            : current
      );
    },
    [memberId, queryClient]
  );

  const removeVisibleLog = useCallback(
    (logId: string) => {
      setNewLogEntry((current) =>
        current?.id === logId ? null : current
      );
      queryClient.setQueryData<LogsResponse>(
        ["kids-discipleship", "logs", memberId],
        (current) => {
          if (!current) return current;
          const logs = current.logs.filter((entry) => entry.id !== logId);
          const removedFromCache = logs.length !== current.logs.length;
          const total = removedFromCache
            ? Math.max(0, current.total - 1)
            : current.total;
          return {
            ...current,
            logs,
            total,
            totalPages: Math.ceil(total / current.limit),
          };
        }
      );
    },
    [memberId, queryClient]
  );

  // Filter logs client-side based on selected category
  const logs = useMemo(() => {
    const allLogs: LogEntry[] = data?.logs || [];
    if (filterCategory === "all") return allLogs;
    return allLogs.filter((log) => log.category === filterCategory);
  }, [data?.logs, filterCategory]);

  // Pagination logic
  const total = logs.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activePage = pagesByFilter[filterCategory] ?? 1;
  const currentPage = Math.min(activePage, totalPages);

  const setPageForFilter = useCallback(
    (nextPage: number) => {
      setPagesByFilter((prev) => {
        const clamped = Math.max(1, Math.min(nextPage, totalPages));
        if (prev[filterCategory] === clamped) {
          return prev;
        }
        return { ...prev, [filterCategory]: clamped };
      });
    },
    [filterCategory, totalPages]
  );

  const handleFilterChange = useCallback(
    (value: string) => {
      if (value !== filterCategory) {
        setPagesByFilter((prev) => (prev[value] === 1 ? prev : { ...prev, [value]: 1 }));
      }
      setFilterCategory(value);
    },
    [filterCategory]
  );

  const pagedLogs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return logs.slice(start, start + PAGE_SIZE);
  }, [logs, currentPage, PAGE_SIZE]);

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  const filterSuffix = filterCategory === "all" ? "" : ` in ${filterCategory}`;

  // Pagination controls component
  const paginationControls = (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <span>
        {Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}-{Math.min(currentPage * PAGE_SIZE, total)} of {total}
        {filterSuffix && ` ${filterSuffix}`}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPageForFilter(1)}
          disabled={!canPrev}
          aria-label="Go to first page"
        >
          <ChevronFirst className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPageForFilter(currentPage - 1)}
          disabled={!canPrev}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="px-1">
          Page {currentPage} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPageForFilter(currentPage + 1)}
          disabled={!canNext}
          aria-label="Go to next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPageForFilter(totalPages)}
          disabled={!canNext}
          aria-label="Go to last page"
        >
          <ChevronLast className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  const handleSubmit = useCallback(async () => {
    if (!entryText.trim()) return;

    setIsSubmitting(true);
    setStreamProgress("Creating log...");
    setSubmissionError(null);
    setLogActionError(null);
    setIsComposerOpen(false);
    setNewLogEntry(null);
    let createdLogId: string | null = null;
    let completed = false;

    try {
      const response = await fetch("/api/kids-discipleship/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          category: selectedCategory,
          entryText,
          gospelConnection: gospelConnection || null,
        }),
      });

      await consumeLogStream(response, (event) => {
        switch (event.type) {
          case "entry_created": {
            createdLogId = event.entry.id || null;
            setNewLogEntry({
              id: event.entry.id || "",
              entryDate: event.entry.entryDate || new Date().toISOString(),
              entryText: event.entry.entryText || entryText,
              category:
                (event.entry.category as "NURTURE" | "ADMONITION") ||
                selectedCategory,
              gospelConnection:
                event.entry.gospelConnection || gospelConnection || null,
              tags: [],
              createdAt: new Date().toISOString(),
              aiOutput: null,
            });
            setEntryText("");
            setGospelConnection("");
            break;
          }

          case "progress":
            setStreamProgress(event.message);
            break;

          case "call1_complete":
            setNewLogEntry((current) =>
              current
                ? {
                    ...current,
                    aiOutput: { call1: event.call1, call2: null },
                  }
                : null
            );
            break;

          case "call2_complete":
            setNewLogEntry((current) =>
              current
                ? {
                    ...current,
                    aiOutput: {
                      call1: current.aiOutput?.call1 || null,
                      call2: event.call2,
                    },
                  }
                : null
            );
            break;

          case "done":
            completed = true;
            setNewLogEntry((current) =>
              current
                ? {
                    ...current,
                    tags: event.entry.tags || [],
                    aiOutput: { call1: event.call1, call2: event.call2 },
                  }
                : null
            );
            break;

          case "error":
            throw new Error(event.message);
        }
      });

      if (completed) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["kids-discipleship", "logs", memberId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["kids-discipleship", "prayer-focus", memberId],
          }),
        ]);
      }
    } catch (error) {
      console.error("Error creating log:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create log";
      if (createdLogId) {
        setLogActionError({ id: createdLogId, message });
      } else {
        setSubmissionError(message);
      }
    } finally {
      setIsSubmitting(false);
      setStreamProgress(null);
    }
  }, [memberId, selectedCategory, entryText, gospelConnection, queryClient]);

  const handleRetry = useCallback(
    async (entry: LogEntry) => {
      if (retryingLogId || deletingLogId) return;

      setRetryingLogId(entry.id);
      setRetryProgress({
        id: entry.id,
        message: "Regenerating shepherding reflection...",
      });
      setLogActionError(null);
      let completed = false;

      updateVisibleLog(entry.id, (current) => ({
        ...current,
        aiOutput: null,
      }));

      try {
        const response = await fetch(
          `/api/kids-discipleship/logs/${entry.id}/reprocess`,
          { method: "POST" }
        );

        await consumeLogStream(response, (event) => {
          switch (event.type) {
            case "entry_created":
              break;

            case "progress":
              setRetryProgress({ id: entry.id, message: event.message });
              break;

            case "call1_complete":
              updateVisibleLog(entry.id, (current) => ({
                ...current,
                aiOutput: { call1: event.call1, call2: null },
              }));
              break;

            case "call2_complete":
              updateVisibleLog(entry.id, (current) => ({
                ...current,
                aiOutput: {
                  call1: current.aiOutput?.call1 || null,
                  call2: event.call2,
                },
              }));
              break;

            case "done":
              completed = true;
              updateVisibleLog(entry.id, (current) => ({
                ...current,
                tags: event.entry.tags || [],
                aiOutput: { call1: event.call1, call2: event.call2 },
              }));
              break;

            case "error":
              throw new Error(event.message);
          }
        });

        if (completed) {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ["kids-discipleship", "logs", memberId],
            }),
            queryClient.invalidateQueries({
              queryKey: ["kids-discipleship", "prayer-focus", memberId],
            }),
          ]);
        }
      } catch (error) {
        console.error("Error retrying kids log:", error);
        setLogActionError({
          id: entry.id,
          message:
            error instanceof Error
              ? error.message
              : "AI processing failed. Please try again.",
        });
        updateVisibleLog(entry.id, (current) => ({
          ...current,
          aiOutput: null,
        }));
      } finally {
        setRetryingLogId(null);
        setRetryProgress(null);
      }
    },
    [
      deletingLogId,
      memberId,
      queryClient,
      retryingLogId,
      updateVisibleLog,
    ]
  );

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteLog || deletingLogId) return;

    const logId = pendingDeleteLog.id;
    setDeletingLogId(logId);
    setDeleteError(null);

    try {
      const response = await fetch(
        `/api/kids-discipleship/logs/${logId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to delete log"));
      }

      removeVisibleLog(logId);
      setPendingDeleteLog(null);
      setLogActionError((current) =>
        current?.id === logId ? null : current
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["kids-discipleship", "logs", memberId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["kids-discipleship", "prayer-focus", memberId],
        }),
      ]);
    } catch (error) {
      console.error("Error deleting kids log:", error);
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete log"
      );
    } finally {
      setDeletingLogId(null);
    }
  }, [
    deletingLogId,
    memberId,
    pendingDeleteLog,
    queryClient,
    removeVisibleLog,
  ]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-accent" />
              Nurture & Admonition Log
            </CardTitle>
            <CardDescription className="mt-1">
              &quot;Bring them up in the nurture and admonition of the Lord.&quot; — Ephesians 6:4
            </CardDescription>
          </div>
          <Dialog
            open={isComposerOpen}
            onOpenChange={(open) => {
              if (!open && isSubmitting) return;
              setIsComposerOpen(open);
              if (!open) {
                setEntryText("");
                setGospelConnection("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Log
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[90dvh]">
              <DialogHeader className="shrink-0 space-y-3 px-5 pb-0 pt-5 pr-12 text-left sm:px-6 sm:pt-6 sm:pr-12">
                <DialogTitle>Log a Parenting Moment for {childName}</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Record what happened and how you responded. The reflection will help you consider the heart and connect the moment to Christ.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                {/* Category Toggle */}
                <div>
                  <Label className="mb-2 block">Category</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={selectedCategory === "NURTURE" ? "default" : "outline"}
                      className={
                        selectedCategory === "NURTURE"
                          ? "bg-success hover:bg-success/90 flex-1"
                          : "flex-1"
                      }
                      onClick={() => setSelectedCategory("NURTURE")}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Nurture
                    </Button>
                    <Button
                      type="button"
                      variant={selectedCategory === "ADMONITION" ? "default" : "outline"}
                      className={
                        selectedCategory === "ADMONITION"
                          ? "bg-warning hover:bg-warning/90 text-foreground flex-1"
                          : "flex-1"
                      }
                      onClick={() => setSelectedCategory("ADMONITION")}
                    >
                      <Lightbulb className="h-4 w-4 mr-2" />
                      Admonition
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {selectedCategory === "NURTURE"
                      ? "Celebrating obedience — catching them doing good"
                      : "Correcting disobedience — redirecting the heart"}
                  </p>
                </div>

                {/* What happened */}
                <div>
                  <Label htmlFor="entryText">What happened?</Label>
                  <Textarea
                    ref={entryTextareaRef}
                    id="entryText"
                    placeholder={
                      selectedCategory === "NURTURE"
                        ? "Describe the moment of obedience and how you blessed them..."
                        : "Describe the moment of disobedience and how you shepherded their heart..."
                    }
                    value={entryText}
                    onInput={handleEntryInput}
                    onChange={(e) => setEntryText(e.target.value)}
                    className="min-h-[128px] max-h-[34dvh] resize-none overflow-y-hidden bg-input-bg"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Gospel connection */}
                <div>
                  <Label htmlFor="gospelConnection">Gospel Connection (optional)</Label>
                  <Textarea
                    ref={gospelConnectionTextareaRef}
                    id="gospelConnection"
                    placeholder="How did you point them to Jesus in this moment?"
                    value={gospelConnection}
                    onInput={handleGospelConnectionInput}
                    onChange={(e) => setGospelConnection(e.target.value)}
                    className="min-h-[80px] max-h-[20dvh] resize-none overflow-y-hidden bg-input-bg"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t bg-background px-5 py-4 sm:px-6 sm:space-x-0">
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => {
                    setIsComposerOpen(false);
                    setEntryText("");
                    setGospelConnection("");
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 sm:flex-none"
                  onClick={handleSubmit}
                  disabled={!entryText.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Save Log
                      <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {submissionError && (
          <div className="status--warning flex items-start gap-3 rounded-lg p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Log creation failed</p>
              <p className="mt-1 text-xs opacity-90">{submissionError}</p>
            </div>
          </div>
        )}

        {/* Streaming progress */}
        {isSubmitting && streamProgress && (
          <div className="p-4 rounded-lg bg-muted/50 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span>{streamProgress}</span>
          </div>
        )}

        {/* New log entry with AI reflection */}
        {newLogEntry && (
          <LogCard
            entry={newLogEntry}
            isNew
            isProcessing={
              isSubmitting || retryingLogId === newLogEntry.id
            }
            processMessage={
              retryProgress?.id === newLogEntry.id
                ? retryProgress.message
                : streamProgress
            }
            actionError={
              logActionError?.id === newLogEntry.id
                ? logActionError.message
                : null
            }
            isDeleting={deletingLogId === newLogEntry.id}
            onRetry={() => handleRetry(newLogEntry)}
            onDelete={() => {
              setPendingDeleteLog(newLogEntry);
              setDeleteError(null);
            }}
          />
        )}

        {/* Filter tabs */}
        <Tabs value={filterCategory} onValueChange={handleFilterChange}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="NURTURE" className="data-[state=active]:text-success">
              Nurture
            </TabsTrigger>
            <TabsTrigger value="ADMONITION" className="data-[state=active]:text-warning-foreground">
              Admonition
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Logs list */}
        {logs.length === 0 && !newLogEntry ? (
          <div className="text-center py-12 text-muted-foreground">
            <Heart className="h-12 w-12 mx-auto mb-4 opacity-50 text-accent" />
            <h3 className="text-lg font-medium mb-1">No logs yet</h3>
            <p className="text-sm">Start recording parenting moments to track growth.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paginationControls}

            <div className="space-y-4">
              {pagedLogs
                .filter((log) => !newLogEntry || log.id !== newLogEntry.id)
                .map((log) => (
                  <LogCard
                    key={log.id}
                    entry={log}
                    isProcessing={retryingLogId === log.id}
                    processMessage={
                      retryProgress?.id === log.id
                        ? retryProgress.message
                        : null
                    }
                    actionError={
                      logActionError?.id === log.id
                        ? logActionError.message
                        : null
                    }
                    isDeleting={deletingLogId === log.id}
                    onRetry={() => handleRetry(log)}
                    onDelete={() => {
                      setPendingDeleteLog(log);
                      setDeleteError(null);
                    }}
                  />
                ))}
            </div>

            {paginationControls}
          </div>
        )}
      </CardContent>

      <Dialog
        open={!!pendingDeleteLog}
        onOpenChange={(open) => {
          if (!open && !deletingLogId) {
            setPendingDeleteLog(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete Heritage Journal log?</DialogTitle>
            <DialogDescription>
              This permanently deletes the parenting log and its shepherding reflection. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {pendingDeleteLog && (
            <p className="line-clamp-3 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              {pendingDeleteLog.entryText}
            </p>
          )}

          {deleteError && (
            <p className="status-text--warning text-sm" role="alert">
              {deleteError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => {
                setPendingDeleteLog(null);
                setDeleteError(null);
              }}
              disabled={!!deletingLogId}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!!deletingLogId}
            >
              {deletingLogId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete Log
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Log Card Component
function LogCard({
  entry,
  isNew,
  isProcessing = false,
  processMessage,
  actionError,
  isDeleting = false,
  onRetry,
  onDelete,
}: {
  entry: LogEntry;
  isNew?: boolean;
  isProcessing?: boolean;
  processMessage?: string | null;
  actionError?: string | null;
  isDeleting?: boolean;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const [showReflection, setShowReflection] = useState(isNew);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={`p-5 rounded-xl border ${
        isNew ? "border-accent bg-accent/5" : "bg-card shadow-sm"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              entry.category === "NURTURE"
                ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
                : "border-warning/30 bg-warning/10 text-warning-foreground hover:bg-warning/20"
            }
          >
            {entry.category === "NURTURE" ? (
              <CheckCircle className="h-3 w-3 mr-1" />
            ) : (
              <Lightbulb className="h-3 w-3 mr-1" />
            )}
            {entry.category}
          </Badge>
          {isNew && <Badge variant="default" className="bg-accent text-accent-foreground">New</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {formatDate(entry.entryDate)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            disabled={isProcessing || isDeleting}
            aria-label={`Delete log from ${formatDate(entry.entryDate)}`}
            title="Delete log"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      <p className="text-sm leading-relaxed mb-4">{entry.entryText}</p>

      {/* Gospel Connection if provided */}
      {entry.gospelConnection && (
        <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20">
          <p className="text-xs font-bold text-accent uppercase tracking-wider mb-1">Gospel Connection</p>
          <p className="text-sm">{entry.gospelConnection}</p>
        </div>
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {entry.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs bg-muted text-muted-foreground hover:bg-muted/80">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {isProcessing && (
        <div
          className="mb-4 flex items-center gap-3 rounded-lg bg-muted/50 p-4"
          role="status"
        >
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" aria-hidden="true" />
          <span className="text-sm">
            {processMessage || "Regenerating shepherding reflection..."}
          </span>
        </div>
      )}

      {(!entry.aiOutput?.call1 || !entry.aiOutput.call2) && !isProcessing && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {entry.aiOutput?.call1
                  ? "Shepherding reflection incomplete"
                  : "Shepherding reflection unavailable"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The journal entry was saved, but its reflection did not finish generating.
              </p>
              {actionError && (
                <p className="mt-2 text-xs text-warning-foreground" role="alert">
                  {actionError}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onRetry}
                disabled={isDeleting}
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Retry Reflection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Reflection */}
      {entry.aiOutput?.call1 && (
        <Collapsible open={showReflection} onOpenChange={setShowReflection}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-9 hover:bg-muted/50">
              <span className="flex items-center gap-2 text-primary font-medium">
                <BookOpen className="h-4 w-4" />
                Shepherding Reflection
              </span>
              {showReflection ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 pl-2 border-l-2 border-primary/20">
            <ReflectionCard call1={entry.aiOutput.call1} call2={entry.aiOutput.call2} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// Allowlist of urgent safety flags matching the LLM prompt
const URGENT_SAFETY_FLAGS = [
  "URGENT_SELF_HARM",
  "URGENT_CHILD_SAFETY",
  "URGENT_VIOLENCE_OR_ABUSE",
  "URGENT_MEDICAL_EMERGENCY",
  "URGENT_OTHER_IMMEDIATE_DANGER",
] as const;

type UrgentSafetyFlag = (typeof URGENT_SAFETY_FLAGS)[number];

const SAFETY_FLAG_MESSAGES: Record<UrgentSafetyFlag, string> = {
  URGENT_SELF_HARM:
    "Possible self-harm concern noted. If you or someone you know is in crisis, please reach out to a mental health professional or crisis line immediately.",
  URGENT_CHILD_SAFETY:
    "Possible immediate child safety concern noted. If anyone is in immediate danger, please contact emergency services.",
  URGENT_VIOLENCE_OR_ABUSE:
    "Possible violence or abuse concern noted. If you believe a child is in danger, please contact local authorities or a child protection hotline.",
  URGENT_MEDICAL_EMERGENCY:
    "Possible medical emergency noted. If anyone needs immediate medical attention, please contact emergency services.",
  URGENT_OTHER_IMMEDIATE_DANGER:
    "Possible immediate danger noted. If anyone is in immediate danger, please contact emergency services.",
};

// Reflection Card Component
function ReflectionCard({ call1, call2 }: { call1: KidsCall1Output; call2?: KidsCall2Output | null }) {
  // Safety flag helpers
  const isUrgentSafetyFlag = (flag: string): flag is UrgentSafetyFlag => {
    return URGENT_SAFETY_FLAGS.includes(flag as UrgentSafetyFlag);
  };

  const formatUrgentSafetyFlag = (flag: UrgentSafetyFlag): string => {
    return SAFETY_FLAG_MESSAGES[flag] ?? flag;
  };

  const urgentSafetyFlags = (call1.safetyFlags || []).filter(isUrgentSafetyFlag);

  return (
    <div className="p-4 rounded-lg bg-muted/30 space-y-4">
      {/* Urgent Safety Flags (red notice at top) */}
      {urgentSafetyFlags.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-destructive mb-2">Important Notice</h4>
          <ul className="space-y-1">
            {urgentSafetyFlags.map((flag, i) => (
              <li key={i} className="text-sm text-destructive/80">
                {formatUrgentSafetyFlag(flag)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="font-medium">{call1.summary}</p>

      {call1.whatMightBeGoingOnInTheHeart.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            What might be going on in the heart:
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {call1.whatMightBeGoingOnInTheHeart.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {call1.gospelConnectionSuggestion && (
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
          <h4 className="text-sm font-medium mb-2">Gospel Connection Suggestion</h4>
          <p className="text-sm italic mb-2">&quot;{call1.gospelConnectionSuggestion.ageAppropriatePhrase}&quot;</p>
          <p className="text-xs text-muted-foreground">
            {call1.gospelConnectionSuggestion.scriptureToShare}: {call1.gospelConnectionSuggestion.explanation}
          </p>
        </div>
      )}

      {call1.parentShepherdingNextSteps.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Next Steps:</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {call1.parentShepherdingNextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      {call1.scripture.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Scripture:</h4>
          <div className="space-y-2">
            {call1.scripture.map((s, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-accent">
                  <BibleVerse reference={s.reference} />
                </span>
                <span className="text-muted-foreground">: {s.whyItApplies}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {call1.encouragementForParent && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <p className="text-sm italic">{call1.encouragementForParent}</p>
        </div>
      )}

      {/* Parent Consistency Note (from call2) */}
      {call2?.parentConsistencyNote && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Pattern Observation:</h4>
          <p className="text-sm">{call2.parentConsistencyNote}</p>
        </div>
      )}

      {/* Suggested Monthly Vision Adjustments (from call2) */}
      {call2?.suggestedMonthlyVisionAdjustments && call2.suggestedMonthlyVisionAdjustments.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Consider for Monthly Vision:
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {call2.suggestedMonthlyVisionAdjustments.map((suggestion, i) => (
              <li key={i}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Developmental Areas (from call2 tags) */}
      {call2?.tags?.developmentalArea && call2.tags.developmentalArea.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Developmental Areas:</h4>
          <div className="flex flex-wrap gap-1" role="list" aria-label="Developmental areas observed">
            {call2.tags.developmentalArea.map((area, i) => (
              <Badge key={i} variant="secondary" className="text-xs" role="listitem">
                {area}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
