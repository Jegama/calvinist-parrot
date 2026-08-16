// app/journal/page.tsx
// Personal Journal - Main page with entry list, composer, and dashboard
"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useAutoGrowingTextarea } from "@/hooks/use-auto-growing-textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProtectedView } from "@/components/ProtectedView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  ChevronRight,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { ReflectionCard } from "./components/ReflectionCard";
import { SuggestedRequestsPanel } from "./components/SuggestedRequestsPanel";
import { JournalEntryCard } from "./components/JournalEntryCard";
import { RecentFocusSection } from "./components/RecentFocusSection";
import type {
  Call1Output,
  Call2Output,
  Call1aOutput,
  Call1bOutput,
  Call1cOutput,
  JournalGenerationStage,
  JournalGenerationStatus,
} from "@/types/journal";

// Types for journal entries
interface JournalEntry {
  id: string;
  entryDate: string;
  entryText: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  aiOutput: {
    call1: Call1Output | null;
    call2: Call2Output | null;
  } | null;
  generationStatus: JournalGenerationStatus;
}

interface JournalEntriesResponse {
  entries: JournalEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Streaming event types - supports parallel call structure
type StreamEvent =
  | { type: "entry_created"; entry: JournalEntry }
  | { type: "progress"; stage: "call1a" | "parallel"; message: string }
  | { type: "call1a_complete"; call1a: Call1aOutput }
  | { type: "call1b_complete"; call1b: Call1bOutput }
  | { type: "call1c_complete"; call1c: Call1cOutput }
  | { type: "call2_complete"; call2: Call2Output }
  | { type: "call1b_error"; message: string }
  | { type: "call1c_error"; message: string }
  | { type: "call2_error"; message: string }
  | {
      type: "done";
      call1: Call1Output;
      call2: Call2Output;
      partial?: boolean;
      failedStages?: JournalGenerationStage[];
    }
  | { type: "error"; message: string };

// API functions
async function fetchEntries(page: number, search?: string, tags?: string[]): Promise<JournalEntriesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: "10",
  });
  if (search) params.append("search", search);
  if (tags && tags.length > 0) params.append("tags", tags.join(","));

  const res = await fetch(`/api/journal/entries?${params}`);
  if (!res.ok) throw new Error("Failed to fetch entries");
  return res.json();
}

async function continueInChat(entryId: string): Promise<{ chatId: string }> {
  const res = await fetch(`/api/journal/entries/${entryId}/continue-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Failed to create chat");
  return res.json();
}

async function fetchHouseholdStatus(): Promise<{ hasHousehold: boolean; spaceId?: string }> {
  const res = await fetch(`/api/prayer-tracker/spaces`);
  if (!res.ok) throw new Error("Failed to fetch household status");
  const data = await res.json();
  return { hasHousehold: !!data.space, spaceId: data.space?.id };
}

async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

async function consumeJournalStream(
  response: Response,
  onEvent: (event: StreamEvent) => void
) {
  if (!response.ok || !response.body) {
    throw new Error(await readApiError(response, "Journal request failed"));
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

async function requestReprocessEntry(entryId: string): Promise<Response> {
  return fetch(`/api/journal/entries/${entryId}/reprocess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

async function deleteEntry(entryId: string) {
  const response = await fetch(`/api/journal/entries/${entryId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to delete entry"));
  }
}

function hasGenerationFailure(entry: JournalEntry) {
  return (
    entry.generationStatus === "failed" ||
    entry.generationStatus === "partial"
  );
}

function failedStagesMessage(stages?: JournalGenerationStage[]) {
  if (!stages?.length) {
    return "The AI reflection did not finish generating. Your journal entry is still saved.";
  }

  const labels: Record<JournalGenerationStage, string> = {
    call1a: "entry summary",
    call1b: "heart reflection",
    call1c: "biblical guidance",
    call2: "tags and prayer suggestions",
  };
  return `Some parts did not finish generating: ${stages.map((stage) => labels[stage]).join(", ")}. Your journal entry is still saved.`;
}

export default function JournalPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile(1024);

  // State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [newEntryText, setNewEntryText] = useState("");
  const {
    textareaRef: journalEntryTextareaRef,
    handleInput: handleJournalEntryInput,
  } = useAutoGrowingTextarea(newEntryText, {
    minHeight: 200,
    maxHeight: 560,
    maxViewportRatio: 0.42,
    enabled: isComposerOpen,
  });
  const [activeEntry, setActiveEntry] = useState<JournalEntry | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Streaming state - supports progressive loading with partial Call1
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamProgress, setStreamProgress] = useState<{ stage: "call1a" | "parallel"; message: string } | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<{
    entryId: string;
    message: string;
  } | null>(null);
  const [reprocessingEntryId, setReprocessingEntryId] = useState<string | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<JournalEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Queries
  const { data, isLoading, error } = useQuery({
    queryKey: ["journal", "entries", user?.$id, page, search, selectedTags],
    queryFn: () => fetchEntries(page, search || undefined, selectedTags.length > 0 ? selectedTags : undefined),
    enabled: !!user?.$id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Household status query
  const { data: householdStatus } = useQuery({
    queryKey: ["household", "status", user?.$id],
    queryFn: () => fetchHouseholdStatus(),
    enabled: !!user?.$id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Streaming submit handler
  const handleSubmitEntry = useCallback(async () => {
    if (!newEntryText.trim() || !user?.$id) return;

    setIsSubmitting(true);
    setStreamProgress({ stage: "call1a", message: "Creating entry..." });
    setSubmissionError(null);
    setGenerationError(null);
    setIsComposerOpen(false);
    let createdEntryId: string | null = null;
    let shouldRefreshEntries = false;

    try {
      const response = await fetch("/api/journal/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryText: newEntryText }),
      });

      await consumeJournalStream(response, (event) => {
        switch (event.type) {
          case "entry_created":
            createdEntryId = event.entry.id;
            shouldRefreshEntries = true;
            setActiveEntry(event.entry);
            setNewEntryText("");
            if (isMobile) setMobileDetailOpen(true);
            break;

          case "progress":
            setStreamProgress({ stage: event.stage, message: event.message });
            break;

          case "call1a_complete":
            setActiveEntry(prev => prev ? {
              ...prev,
              aiOutput: {
                call1: { ...event.call1a } as Call1Output,
                call2: null
              }
            } : null);
            break;

          case "call1b_complete":
            setActiveEntry(prev => prev ? {
              ...prev,
              aiOutput: {
                call1: {
                  ...prev.aiOutput?.call1,
                  ...event.call1b
                } as Call1Output,
                call2: prev.aiOutput?.call2 || null
              }
            } : null);
            break;

          case "call1c_complete":
            setActiveEntry(prev => prev ? {
              ...prev,
              aiOutput: {
                call1: {
                  ...prev.aiOutput?.call1,
                  ...event.call1c
                } as Call1Output,
                call2: prev.aiOutput?.call2 || null
              }
            } : null);
            break;

          case "call2_complete":
            setActiveEntry(prev => prev ? {
              ...prev,
              aiOutput: {
                call1: prev.aiOutput?.call1 || null,
                call2: event.call2
              }
            } : null);
            break;

          case "call1b_error":
          case "call1c_error":
          case "call2_error":
            break;

          case "done":
            setActiveEntry(prev => prev ? {
              ...prev,
              aiOutput: { call1: event.call1, call2: event.call2 },
              tags: event.call2?.tags ? Object.values(event.call2.tags).flat() : prev.tags,
              generationStatus: event.partial ? "partial" : "complete",
            } : null);
            if (createdEntryId) {
              setGenerationError(
                event.partial
                  ? {
                      entryId: createdEntryId,
                      message: failedStagesMessage(event.failedStages),
                    }
                  : null
              );
            }
            break;

          case "error":
            shouldRefreshEntries = true;
            setActiveEntry(prev => prev ? {
              ...prev,
              generationStatus: "failed",
            } : null);
            if (createdEntryId) {
              setGenerationError({
                entryId: createdEntryId,
                message: event.message,
              });
            }
            break;
        }
      });
    } catch (err) {
      console.error("Failed to create entry:", err);
      const message =
        err instanceof Error ? err.message : "Failed to create journal entry";
      if (createdEntryId) {
        shouldRefreshEntries = true;
        setActiveEntry(prev => prev ? {
          ...prev,
          generationStatus: "failed",
        } : null);
        setGenerationError({ entryId: createdEntryId, message });
      } else {
        setSubmissionError(message);
        setIsComposerOpen(true);
      }
    } finally {
      if (shouldRefreshEntries) {
        await queryClient.invalidateQueries({ queryKey: ["journal", "entries"] });
      }
      setIsSubmitting(false);
      setStreamProgress(null);
    }
  }, [newEntryText, user?.$id, queryClient, isMobile]);

  // Continue in chat handler
  const handleContinueInChat = useCallback(async (entryId: string) => {
    if (!user?.$id) return;
    try {
      const result = await continueInChat(entryId);
      queryClient.invalidateQueries({ queryKey: ["chat-list"] });
      router.push(`/${result.chatId}`);
    } catch (err) {
      console.error("Failed to continue in chat:", err);
    }
  }, [user?.$id, queryClient, router]);

  // Reprocess entry handler with streaming
  const handleReprocessEntry = useCallback(async (entry: JournalEntry) => {
    if (!user?.$id || !hasGenerationFailure(entry)) return;

    setIsSubmitting(true);
    setReprocessingEntryId(entry.id);
    setStreamProgress({ stage: "call1a", message: "Reprocessing entry..." });
    setGenerationError(null);
    setActiveEntry({ ...entry, generationStatus: "pending" });
    if (isMobile) setMobileDetailOpen(true);
    const previousStatus = entry.generationStatus;

    try {
      const response = await requestReprocessEntry(entry.id);
      await consumeJournalStream(response, (event) => {
        switch (event.type) {
          case "entry_created":
            break;

          case "progress":
            setStreamProgress({ stage: event.stage, message: event.message });
            break;

          case "call1a_complete":
            setActiveEntry(prev => prev?.id === entry.id ? {
              ...prev,
              aiOutput: {
                call1: { ...event.call1a } as Call1Output,
                call2: null
              }
            } : prev);
            break;

          case "call1b_complete":
            setActiveEntry(prev => prev?.id === entry.id ? {
              ...prev,
              aiOutput: {
                call1: {
                  ...prev.aiOutput?.call1,
                  ...event.call1b
                } as Call1Output,
                call2: prev.aiOutput?.call2 || null
              }
            } : prev);
            break;

          case "call1c_complete":
            setActiveEntry(prev => prev?.id === entry.id ? {
              ...prev,
              aiOutput: {
                call1: {
                  ...prev.aiOutput?.call1,
                  ...event.call1c
                } as Call1Output,
                call2: prev.aiOutput?.call2 || null
              }
            } : prev);
            break;

          case "call2_complete":
            setActiveEntry(prev => prev?.id === entry.id ? {
              ...prev,
              aiOutput: {
                call1: prev.aiOutput?.call1 || null,
                call2: event.call2
              }
            } : prev);
            break;

          case "call1b_error":
          case "call1c_error":
          case "call2_error":
            break;

          case "done":
            setActiveEntry(prev => prev?.id === entry.id ? {
              ...prev,
              aiOutput: { call1: event.call1, call2: event.call2 },
              tags: event.call2?.tags ? Object.values(event.call2.tags).flat() : prev.tags,
              generationStatus: event.partial ? "partial" : "complete",
            } : prev);
            setGenerationError(
              event.partial
                ? {
                    entryId: entry.id,
                    message: failedStagesMessage(event.failedStages),
                  }
                : null
            );
            break;

          case "error":
            setActiveEntry(prev => prev?.id === entry.id ? {
              ...prev,
              generationStatus: previousStatus,
            } : prev);
            setGenerationError({ entryId: entry.id, message: event.message });
            break;
        }
      });
    } catch (err) {
      console.error("Failed to reprocess entry:", err);
      setActiveEntry(prev => prev?.id === entry.id ? {
        ...prev,
        generationStatus: previousStatus,
      } : prev);
      setGenerationError({
        entryId: entry.id,
        message:
          err instanceof Error
            ? err.message
            : "AI processing failed. Please try again.",
      });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["journal", "entries"] });
      setIsSubmitting(false);
      setReprocessingEntryId(null);
      setStreamProgress(null);
    }
  }, [user?.$id, queryClient, isMobile]);

  const handleDeleteEntry = useCallback(async () => {
    if (!pendingDeleteEntry || deletingEntryId) return;

    const entryId = pendingDeleteEntry.id;
    setDeletingEntryId(entryId);
    setDeleteError(null);

    try {
      await deleteEntry(entryId);
      queryClient.setQueriesData<JournalEntriesResponse>(
        { queryKey: ["journal", "entries"] },
        (current) => {
          if (!current) return current;
          const entries = current.entries.filter((entry) => entry.id !== entryId);
          const removed = entries.length !== current.entries.length;
          const total = removed ? Math.max(0, current.total - 1) : current.total;
          return {
            ...current,
            entries,
            total,
            totalPages: Math.ceil(total / current.limit),
          };
        }
      );
      setActiveEntry((current) => current?.id === entryId ? null : current);
      setGenerationError((current) => current?.entryId === entryId ? null : current);
      setPendingDeleteEntry(null);
      setMobileDetailOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["journal", "entries"] });
    } catch (err) {
      console.error("Failed to delete journal entry:", err);
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete journal entry"
      );
    } finally {
      setDeletingEntryId(null);
    }
  }, [deletingEntryId, pendingDeleteEntry, queryClient]);

  const handleEntryClick = useCallback((entry: JournalEntry) => {
    setActiveEntry(entry);
    // Clear streaming state when selecting a different entry
    setStreamProgress(null);
    setGenerationError(null);
    if (isMobile) setMobileDetailOpen(true);
  }, [isMobile]);



  useEffect(() => {
    if (!isMobile) {
      setMobileDetailOpen(false);
    }
  }, [isMobile]);

  const renderDetailContent = () => {
    if (!activeEntry) {
      return (
        <Card className="h-full min-h-[300px] flex items-center justify-center">
          <CardContent className="text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select an entry to view its reflection</p>
          </CardContent>
        </Card>
      );
    }

    const activeGenerationFailed = hasGenerationFailure(activeEntry);
    const activeGenerationMessage =
      generationError?.entryId === activeEntry.id
        ? generationError.message
        : activeEntry.generationStatus === "partial"
          ? "Some parts of the AI reflection did not finish generating. Your journal entry is still saved."
          : "The AI reflection did not finish generating. Your journal entry is still saved.";

    return (
      <>
        {activeGenerationFailed && !streamProgress && (
          <Card className="status--warning">
            <CardContent className="pt-4">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                <div>
                  <p className="font-medium text-sm mb-1">
                    {activeEntry.generationStatus === "partial"
                      ? "AI Reflection Incomplete"
                      : "AI Reflection Unavailable"}
                  </p>
                  <p className="text-xs opacity-90" role="alert">
                    {activeGenerationMessage}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => handleReprocessEntry(activeEntry)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Retry AI Reflection
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row">
            <div>
              <p className="text-sm text-muted-foreground">
                {new Date(activeEntry.entryDate).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleContinueInChat(activeEntry.id)}
                disabled={isSubmitting}
              >
                <MessageSquare className="h-4 w-4" />
                Continue in Chat
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setPendingDeleteEntry(activeEntry);
                  setDeleteError(null);
                  if (isMobile) setMobileDetailOpen(false);
                }}
                disabled={isSubmitting || deletingEntryId === activeEntry.id}
              >
                {deletingEntryId === activeEntry.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                Delete Entry
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{activeEntry.entryText}</p>
            {activeEntry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-4">
                {activeEntry.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {formatTagLabel(tag)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {activeEntry.aiOutput?.call1 || streamProgress ? (
          <ReflectionCard
            call1={activeEntry.aiOutput?.call1 || null}
            isStreaming={!!streamProgress}
            streamMessage={streamProgress?.message}
          />
        ) : null}

        {activeEntry.aiOutput?.call2 ? (
          <SuggestedRequestsPanel
            call2={activeEntry.aiOutput.call2}
            hasHousehold={householdStatus?.hasHousehold ?? false}
            entryId={activeEntry.id}
          />
        ) : streamProgress ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <CardTitle className="font-serif text-lg">Preparing Suggestions...</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ) : null}
      </>
    );
  };

  const authFallback = (
    <Card className="max-w-2xl mx-auto mt-8 mb-8">
      <CardHeader>
        <CardTitle>Personal Journal</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Checking your session… redirecting to login if needed.</p>
      </CardContent>
    </Card>
  );

  if (!user) {
    return <ProtectedView fallback={authFallback} />;
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--app-header-height))] bg-background">
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
        {/* Page Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Personal Journal</h1>
              <p className="text-muted-foreground">Daily reflections with pastoral insight</p>
            </div>
            <Button
              onClick={() => setIsComposerOpen(true)}
              disabled={isSubmitting}
              className="gap-2 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Write Today&apos;s Entry
            </Button>
          </div>
        </header>

        {submissionError && (
          <div
            className="status--warning mb-6 flex items-start gap-3 rounded-lg p-4"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Journal entry was not saved</p>
              <p className="mt-1 text-xs opacity-90">{submissionError}</p>
            </div>
          </div>
        )}

        {/* Dashboard Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Entries</span>
              </div>
              {data?.total === 0 ? (
                <p className="text-sm text-muted-foreground italic mt-1">Start your first entry above</p>
              ) : (
                <p className="text-2xl font-semibold mt-1">{data?.total || 0}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">This Month</span>
              </div>
              <p className="text-2xl font-semibold mt-1">
                {data?.entries.filter(e => {
                  const entryDate = new Date(e.entryDate);
                  const now = new Date();
                  return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
                }).length || 0}
              </p>
            </CardContent>
          </Card>
          {/* Recent Focus - Keywords and themes from LLM analysis */}
          <RecentFocusSection userId={user.$id} />
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entries..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10 bg-card border-border shadow-sm"
            />
          </div>
          {selectedTags.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTags([])}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Entry List */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-semibold">Entries</h2>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Failed to load entries
                </CardContent>
              </Card>
            ) : data?.entries.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-sm font-medium mb-2">No journal entries yet</p>
                  <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                    Write about your day, struggles, or growth—get gentle, pastoral reflection to help you see your heart and grow in grace.
                  </p>
                  <Button onClick={() => setIsComposerOpen(true)} variant="default">
                    Start Your First Entry
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {data?.entries.map(entry => (
                  <JournalEntryCard
                    key={entry.id}
                    entry={entry}
                    isActive={activeEntry?.id === entry.id}
                    onClick={() => handleEntryClick(entry)}
                    onReprocess={
                      hasGenerationFailure(entry)
                        ? () => handleReprocessEntry(entry)
                        : undefined
                    }
                    isReprocessing={reprocessingEntryId === entry.id}
                  />
                ))}

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                  <div className="flex justify-between items-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {data.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === data.totalPages}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detail View */}
          <div className="hidden lg:col-span-2 lg:block space-y-4">
            {renderDetailContent()}
          </div>
        </div>

        {/* Mobile detail dialog */}
        {isMobile && (
          <Dialog open={!!activeEntry && mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
            <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto rounded-2xl">
              <DialogHeader className="flex flex-row items-center justify-between space-y-0">
                <DialogTitle className="font-serif text-xl">
                  {activeEntry?.aiOutput?.call1?.title || "Journal Entry"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Journal entry details and AI reflection.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">{renderDetailContent()}</div>
            </DialogContent>
          </Dialog>
        )}

        <Dialog
          open={!!pendingDeleteEntry}
          onOpenChange={(open) => {
            if (!open && !deletingEntryId) {
              setPendingDeleteEntry(null);
              setDeleteError(null);
            }
          }}
        >
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Delete journal entry?</DialogTitle>
              <DialogDescription>
                This permanently deletes the journal entry and its AI reflection. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            {pendingDeleteEntry && (
              <p className="line-clamp-3 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                {pendingDeleteEntry.entryText}
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
                  setPendingDeleteEntry(null);
                  setDeleteError(null);
                }}
                disabled={!!deletingEntryId}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteEntry}
                disabled={!!deletingEntryId}
              >
                {deletingEntryId ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Delete Entry
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Composer Modal/Dialog */}
        <Dialog
          open={isComposerOpen}
          onOpenChange={(open) => {
            if (!open && isSubmitting) return;
            setIsComposerOpen(open);
            if (!open) setNewEntryText("");
          }}
        >
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[90dvh]">
            <DialogHeader className="shrink-0 space-y-4 px-5 pb-0 pt-5 pr-12 text-left sm:px-6 sm:pt-6 sm:pr-12">
              <DialogTitle className="font-serif">
                New Journal Entry
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                What is on your heart today? Reflect on circumstances,
                emotions, struggles, or thanksgivings. Consider: What happened?
                How did you respond? What might God be teaching you?
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
              {submissionError && (
                <div
                  className="status--warning mb-4 flex items-start gap-3 rounded-lg p-3"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">Entry could not be saved</p>
                    <p className="mt-1 text-xs opacity-90">{submissionError}</p>
                  </div>
                </div>
              )}
              <Textarea
                ref={journalEntryTextareaRef}
                placeholder="Write your journal entry..."
                value={newEntryText}
                onInput={handleJournalEntryInput}
                onChange={(e) => setNewEntryText(e.target.value)}
                className="min-h-[200px] max-h-[42dvh] resize-none overflow-y-hidden"
                disabled={isSubmitting}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Tip: Reflect on what happened, how you responded, and what God
                might be teaching you
              </p>
              {newEntryText.length === 0 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">
                    Need help getting started?
                  </summary>
                  <ul className="ml-4 mt-2 list-disc space-y-1 text-muted-foreground">
                    <li>What happened today that stood out?</li>
                    <li>How did you feel or respond?</li>
                    <li>Where did you see God&apos;s hand?</li>
                    <li>What are you struggling with?</li>
                  </ul>
                </details>
              )}
            </div>

            <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t bg-background px-5 py-4 sm:px-6 sm:space-x-0">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setIsComposerOpen(false);
                  setNewEntryText("");
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={handleSubmitEntry}
                disabled={!newEntryText.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Saving...
                  </>
                ) : (
                  <>
                    Save Entry
                    <ChevronRight
                      className="ml-1 h-4 w-4"
                      aria-hidden="true"
                    />
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

// Helper functions
function formatTagLabel(tag: string): string {
  // Convert "category:Value" to just "Value"
  const parts = tag.split(":");
  return parts.length > 1 ? parts[1] : tag;
}
