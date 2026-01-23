// app/journal/page.tsx
// Coram Deo Journal - Main page with entry list, composer, and dashboard
"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Search, MessageSquare, BookOpen, Calendar, ChevronRight } from "lucide-react";
import { ReflectionCard } from "./components/ReflectionCard";
import { SuggestedRequestsPanel } from "./components/SuggestedRequestsPanel";
import { JournalEntryCard } from "./components/JournalEntryCard";
import type { Call1Output, Call2Output, Call1aOutput, Call1bOutput, Call1cOutput } from "@/types/journal";

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
  | { type: "done"; call1: Call1Output; call2: Call2Output }
  | { type: "error"; message: string };

// API functions
async function fetchEntries(userId: string, page: number, search?: string, tags?: string[]): Promise<JournalEntriesResponse> {
  const params = new URLSearchParams({
    userId,
    page: String(page),
    limit: "10",
  });
  if (search) params.append("search", search);
  if (tags && tags.length > 0) params.append("tags", tags.join(","));

  const res = await fetch(`/api/journal/entries?${params}`);
  if (!res.ok) throw new Error("Failed to fetch entries");
  return res.json();
}

async function continueInChat(userId: string, entryId: string): Promise<{ chatId: string }> {
  const res = await fetch(`/api/journal/entries/${entryId}/continue-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to create chat");
  return res.json();
}

async function fetchHouseholdStatus(userId: string): Promise<{ hasHousehold: boolean; spaceId?: string }> {
  const res = await fetch(`/api/prayer-tracker/spaces?userId=${userId}`);
  if (!res.ok) throw new Error("Failed to fetch household status");
  const data = await res.json();
  return { hasHousehold: !!data.space, spaceId: data.space?.id };
}

async function reprocessEntry(userId: string, entryId: string): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`/api/journal/entries/${entryId}/reprocess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok || !res.body) throw new Error("Failed to reprocess entry");
  return res.body;
}

export default function JournalPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [newEntryText, setNewEntryText] = useState("");
  const [activeEntry, setActiveEntry] = useState<JournalEntry | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Streaming state - supports progressive loading with partial Call1
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamProgress, setStreamProgress] = useState<{ stage: "call1a" | "parallel"; message: string } | null>(null);

  // Queries
  const { data, isLoading, error } = useQuery({
    queryKey: ["journal", "entries", user?.$id, page, search, selectedTags],
    queryFn: () => fetchEntries(user!.$id, page, search || undefined, selectedTags.length > 0 ? selectedTags : undefined),
    enabled: !!user?.$id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Household status query
  const { data: householdStatus } = useQuery({
    queryKey: ["household", "status", user?.$id],
    queryFn: () => fetchHouseholdStatus(user!.$id),
    enabled: !!user?.$id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Streaming submit handler
  const handleSubmitEntry = useCallback(async () => {
    if (!newEntryText.trim() || !user?.$id) return;

    setIsSubmitting(true);
    setStreamProgress({ stage: "call1a", message: "Creating entry..." });
    setIsComposerOpen(false);

    try {
      const response = await fetch("/api/journal/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.$id, entryText: newEntryText }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to create entry");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(line);
          } catch {
            console.error("Failed to parse stream line:", line);
            continue;
          }

          switch (event.type) {
            case "entry_created":
              // Set active entry immediately with skeleton loading state
              setActiveEntry(event.entry);
              setNewEntryText("");
              if (isMobile) setMobileDetailOpen(true);
              break;

            case "progress":
              setStreamProgress({ stage: event.stage, message: event.message });
              break;

            case "call1a_complete":
              // First paint: title, summary, situation
              setActiveEntry(prev => prev ? {
                ...prev,
                aiOutput: {
                  call1: { ...event.call1a } as Call1Output,
                  call2: null
                }
              } : null);
              break;

            case "call1b_complete":
              // Heart and put off/put on analysis
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
              // Scripture and next steps
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
              // Update active entry with call2
              setActiveEntry(prev => prev ? {
                ...prev,
                aiOutput: {
                  call1: prev.aiOutput?.call1 || null,
                  call2: event.call2
                }
              } : null);
              break;

            case "done":
              // Update active entry with final complete call1 and call2
              setActiveEntry(prev => prev ? {
                ...prev,
                aiOutput: { call1: event.call1, call2: event.call2 },
                tags: event.call2?.tags ? Object.values(event.call2.tags).flat() : prev.tags
              } : null);
              // Invalidate to refresh the list
              queryClient.invalidateQueries({ queryKey: ["journal", "entries"] });
              break;

            case "error":
              console.error("Stream error:", event.message);
              break;
          }
        }
      }
    } catch (err) {
      console.error("Failed to create entry:", err);
    } finally {
      setIsSubmitting(false);
      setStreamProgress(null);
    }
  }, [newEntryText, user?.$id, queryClient, isMobile]);

  // Continue in chat handler
  const handleContinueInChat = useCallback(async (entryId: string) => {
    if (!user?.$id) return;
    try {
      const result = await continueInChat(user.$id, entryId);
      queryClient.invalidateQueries({ queryKey: ["chat-list"] });
      router.push(`/${result.chatId}`);
    } catch (err) {
      console.error("Failed to continue in chat:", err);
    }
  }, [user?.$id, queryClient, router]);

  // Reprocess entry handler with streaming
  const handleReprocessEntry = useCallback(async (entryId: string) => {
    if (!user?.$id) return;

    setIsSubmitting(true);
    setStreamProgress({ stage: "call1a", message: "Reprocessing entry..." });

    try {
      const stream = await reprocessEntry(user.$id, entryId);
      const reader = stream.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(line);
          } catch {
            console.error("Failed to parse stream line:", line);
            continue;
          }

          switch (event.type) {
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

            case "done":
              setActiveEntry(prev => prev ? {
                ...prev,
                aiOutput: { call1: event.call1, call2: event.call2 },
                tags: event.call2?.tags ? Object.values(event.call2.tags).flat() : prev.tags
              } : null);
              queryClient.invalidateQueries({ queryKey: ["journal", "entries"] });
              break;

            case "error":
              console.error("Stream error:", event.message);
              break;
          }
        }
      }
    } catch (err) {
      console.error("Failed to reprocess entry:", err);
    } finally {
      setIsSubmitting(false);
      setStreamProgress(null);
    }
  }, [user?.$id, queryClient]);

  const handleEntryClick = useCallback((entry: JournalEntry) => {
    setActiveEntry(entry);
    // Clear streaming state when selecting a different entry
    setStreamProgress(null);
    if (isMobile) setMobileDetailOpen(true);
  }, [isMobile]);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    setPage(1);
  }, []);

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

    return (
      <>
        {!activeEntry.aiOutput && !streamProgress && (
          <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-yellow-900 dark:text-yellow-200 text-sm mb-1">
                    AI Reflection Unavailable
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    Processing failed for this entry. Click the retry button to regenerate your AI reflection.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => handleReprocessEntry(activeEntry.id)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="h-4 w-4" />
                      Retry AI Reflection
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
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
            userId={user!.$id}
            hasHousehold={householdStatus?.hasHousehold ?? false}
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

  // Loading state
  if (authLoading) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-var(--app-header-height))] bg-background">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-var(--app-header-height))] bg-background">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="font-serif text-2xl text-center">Coram Deo Journal</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Reflect on your life before God with pastoral guidance rooted in Scripture.
              </p>
              <Button onClick={() => router.push("/login")} className="w-full">
                Sign in to start journaling
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-var(--app-header-height))] bg-background">
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 max-w-6xl">
        {/* Page Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Coram Deo Journal</h1>
              <p className="text-muted-foreground">Living before the face of God</p>
            </div>
            <Button
              onClick={() => setIsComposerOpen(true)}
              disabled={isSubmitting}
              className="gap-2 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              New Entry
            </Button>
          </div>
        </header>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Entries</span>
              </div>
              <p className="text-2xl font-semibold mt-1">{data?.total || 0}</p>
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
          <Card className="col-span-2">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-muted-foreground">Common Tags</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {getTopTags(data?.entries || []).slice(0, 5).map(tag => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "secondary"}
                    className="cursor-pointer text-xs"
                    onClick={() => handleTagClick(tag)}
                  >
                    {formatTagLabel(tag)}
                  </Badge>
                ))}
                {(!data?.entries || data.entries.length === 0) && (
                  <span className="text-sm text-muted-foreground italic">No tags yet</span>
                )}
              </div>
            </CardContent>
          </Card>
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
              className="pl-10"
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
                  <p className="text-muted-foreground mb-4">No journal entries yet</p>
                  <Button onClick={() => setIsComposerOpen(true)} variant="outline">
                    Write your first entry
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
                    onReprocess={() => handleReprocessEntry(entry.id)}
                    isReprocessing={isSubmitting && activeEntry?.id === entry.id}
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
              </DialogHeader>
              <div className="space-y-4">{renderDetailContent()}</div>
            </DialogContent>
          </Dialog>
        )}

        {/* Composer Modal/Dialog */}
        {isComposerOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto">
              <CardHeader>
                <CardTitle className="font-serif">New Journal Entry</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  What is on your heart today? Reflect on circumstances, emotions, struggles, or thanksgivings.
                  Consider: What happened? How did you respond? What might God be teaching you?
                </p>
                <Textarea
                  placeholder="Write your journal entry..."
                  value={newEntryText}
                  onChange={(e) => setNewEntryText(e.target.value)}
                  className="min-h-[200px]"
                  disabled={isSubmitting}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsComposerOpen(false);
                      setNewEntryText("");
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitEntry}
                    disabled={!newEntryText.trim() || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Save Entry
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

// Helper functions
function getTopTags(entries: JournalEntry[]): string[] {
  const tagCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  return [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

function formatTagLabel(tag: string): string {
  // Convert "category:Value" to just "Value"
  const parts = tag.split(":");
  return parts.length > 1 ? parts[1] : tag;
}
