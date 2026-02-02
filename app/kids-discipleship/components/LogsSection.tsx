// app/kids-discipleship/components/LogsSection.tsx
// Section C: Nurture & Admonition Log
"use client";

import { useState, useCallback } from "react";
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

export function LogsSection({ userId, memberId }: Props) {
  const queryClient = useQueryClient();
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<"NURTURE" | "ADMONITION">("NURTURE");
  const [entryText, setEntryText] = useState("");
  const [gospelConnection, setGospelConnection] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamProgress, setStreamProgress] = useState<string | null>(null);
  const [newLogEntry, setNewLogEntry] = useState<LogEntry | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["kids-discipleship", "logs", memberId, filterCategory],
    queryFn: () => fetchLogs(userId, memberId, filterCategory === "all" ? undefined : filterCategory),
    enabled: !!userId && !!memberId,
  });

  const logs: LogEntry[] = data?.logs || [];

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
                <DialogTitle>Log a Parenting Moment</DialogTitle>
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
                          ? "bg-green-600 hover:bg-green-700 flex-1"
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
                          ? "bg-amber-600 hover:bg-amber-700 flex-1"
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
        <Tabs value={filterCategory} onValueChange={setFilterCategory}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="NURTURE" className="text-green-600 dark:text-green-400">
              Nurture
            </TabsTrigger>
            <TabsTrigger value="ADMONITION" className="text-amber-600 dark:text-amber-400">
              Admonition
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Logs list */}
        {logs.length === 0 && !newLogEntry ? (
          <div className="text-center py-8 text-muted-foreground">
            <Heart className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>No logs yet.</p>
            <p className="text-sm">Start recording parenting moments to track growth.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {logs
              .filter((log) => !newLogEntry || log.id !== newLogEntry.id)
              .map((log) => (
                <LogCard key={log.id} entry={log} />
              ))}
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
      className={`p-4 rounded-lg border ${
        isNew ? "border-accent bg-accent/5" : "bg-card"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={
              entry.category === "NURTURE"
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
            }
          >
            {entry.category === "NURTURE" ? (
              <CheckCircle className="h-3 w-3 mr-1" />
            ) : (
              <Lightbulb className="h-3 w-3 mr-1" />
            )}
            {entry.category}
          </Badge>
          {isNew && <Badge variant="outline" className="text-accent">New</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">{formatDate(entry.entryDate)}</span>
      </div>

      <p className="text-sm mb-3">{entry.entryText}</p>

      {/* Gospel Connection if provided */}
      {entry.gospelConnection && (
        <div className="mb-3 p-2 rounded-lg bg-accent/10 border border-accent/20">
          <p className="text-xs font-medium text-accent mb-1">Gospel Connection</p>
          <p className="text-sm">{entry.gospelConnection}</p>
        </div>
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {entry.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* AI Reflection */}
      {entry.aiOutput?.call1 && (
        <Collapsible open={showReflection} onOpenChange={setShowReflection}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Shepherding Reflection
              </span>
              {showReflection ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <ReflectionCard call1={entry.aiOutput.call1} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// Reflection Card Component
function ReflectionCard({ call1 }: { call1: KidsCall1Output }) {
  return (
    <div className="p-4 rounded-lg bg-muted/30 space-y-4">
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
    </div>
  );
}
