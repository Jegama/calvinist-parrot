// app/kids-discipleship/components/LogsSection.tsx
// Section C: Nurture & Admonition Log
"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

// Streaming event types
type StreamEvent =
  | { type: "entry_created"; entry: Partial<LogEntry> & { gospelConnection?: string | null } }
  | { type: "progress"; stage: string; message: string }
  | { type: "call1_complete"; call1: KidsCall1Output }
  | { type: "call2_complete"; call2: KidsCall2Output }
  | { type: "done"; entry: Partial<LogEntry>; call1: KidsCall1Output; call2: KidsCall2Output }
  | { type: "error"; message: string };

async function fetchLogs(userId: string, memberId: string, category?: string) {
  const params = new URLSearchParams({ userId, memberId });
  if (category) params.append("category", category);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamProgress, setStreamProgress] = useState<string | null>(null);
  const [newLogEntry, setNewLogEntry] = useState<LogEntry | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [pagesByFilter, setPagesByFilter] = useState<Record<string, number>>({});

  const PAGE_SIZE = 5;

  // Fetch all logs once, filter client-side to avoid extra network calls
  const { data, isLoading } = useQuery({
    queryKey: ["kids-discipleship", "logs", memberId],
    queryFn: () => fetchLogs(userId, memberId),
    enabled: !!userId && !!memberId,
  });

  const allLogs: LogEntry[] = data?.logs || [];

  // Filter logs client-side based on selected category
  const logs = useMemo(() => {
    if (filterCategory === "all") return allLogs;
    return allLogs.filter((log) => log.category === filterCategory);
  }, [allLogs, filterCategory]);

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
    setIsComposerOpen(false);
    setNewLogEntry(null);

    try {
      const response = await fetch("/api/kids-discipleship/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          memberId,
          category: selectedCategory,
          entryText,
          gospelConnection: gospelConnection || null,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to create log");
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
              setNewLogEntry({
                id: event.entry.id || "",
                entryDate: event.entry.entryDate || new Date().toISOString(),
                entryText: event.entry.entryText || entryText,
                category: (event.entry.category as "NURTURE" | "ADMONITION") || selectedCategory,
                gospelConnection: event.entry.gospelConnection || gospelConnection || null,
                tags: [],
                createdAt: new Date().toISOString(),
                aiOutput: null,
              });
              setEntryText("");
              setGospelConnection("");
              break;

            case "progress":
              setStreamProgress(event.message);
              break;

            case "call1_complete":
              setNewLogEntry((prev) =>
                prev
                  ? {
                      ...prev,
                      aiOutput: { call1: event.call1, call2: null },
                    }
                  : null
              );
              break;

            case "call2_complete":
              setNewLogEntry((prev) =>
                prev && prev.aiOutput
                  ? {
                      ...prev,
                      aiOutput: { ...prev.aiOutput, call2: event.call2 },
                    }
                  : null
              );
              break;

            case "done":
              setNewLogEntry((prev) =>
                prev
                  ? {
                      ...prev,
                      tags: event.entry.tags || [],
                      aiOutput: { call1: event.call1, call2: event.call2 },
                    }
                  : null
              );
              setIsSubmitting(false);
              setStreamProgress(null);
              // Invalidate logs and prayer focus queries so they update
              queryClient.invalidateQueries({
                queryKey: ["kids-discipleship", "logs", memberId],
              });
              queryClient.invalidateQueries({
                queryKey: ["kids-discipleship", "prayer-focus", memberId],
              });
              break;

            case "error":
              console.error("Stream error:", event.message);
              setIsSubmitting(false);
              setStreamProgress(null);
              break;
          }
        }
      }
    } catch (error) {
      console.error("Error creating log:", error);
      setIsSubmitting(false);
      setStreamProgress(null);
    }
  }, [userId, memberId, selectedCategory, entryText, gospelConnection, queryClient]);

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
          <Dialog open={isComposerOpen} onOpenChange={setIsComposerOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Log
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Log a Parenting Moment for {childName}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
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
                    id="entryText"
                    placeholder={
                      selectedCategory === "NURTURE"
                        ? "Describe the moment of obedience and how you blessed them..."
                        : "Describe the moment of disobedience and how you shepherded their heart..."
                    }
                    value={entryText}
                    onChange={(e) => setEntryText(e.target.value)}
                    rows={4}
                    className="bg-input-bg resize-none"
                  />
                </div>

                {/* Gospel connection */}
                <div>
                  <Label htmlFor="gospelConnection">Gospel Connection (optional)</Label>
                  <Textarea
                    id="gospelConnection"
                    placeholder="How did you point them to Jesus in this moment?"
                    value={gospelConnection}
                    onChange={(e) => setGospelConnection(e.target.value)}
                    rows={2}
                    className="bg-input-bg resize-none"
                  />
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={!entryText.trim() || isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Log"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Streaming progress */}
        {isSubmitting && streamProgress && (
          <div className="p-4 rounded-lg bg-muted/50 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span>{streamProgress}</span>
          </div>
        )}

        {/* New log entry with AI reflection */}
        {newLogEntry && (
          <LogCard entry={newLogEntry} isNew />
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
                  <LogCard key={log.id} entry={log} />
                ))}
            </div>

            {paginationControls}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Log Card Component
function LogCard({ entry, isNew }: { entry: LogEntry; isNew?: boolean }) {
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
      <div className="flex items-start justify-between mb-3">
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
        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">{formatDate(entry.entryDate)}</span>
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
            {call1.gospelConnectionSuggestion.scriptureToShare} — {call1.gospelConnectionSuggestion.explanation}
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
                <span className="text-muted-foreground"> — {s.whyItApplies}</span>
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
