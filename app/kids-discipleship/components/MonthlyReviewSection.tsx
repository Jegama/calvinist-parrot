// app/kids-discipleship/components/MonthlyReviewSection.tsx
// Section E: Monthly Review Dashboard with stats and notes
"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Heart,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Check,
  Loader2,
  Save,
} from "lucide-react";

interface LogStats {
  nurtureCount: number;
  admonitionCount: number;
  topHeartIssues: string[];
  topVirtues: string[];
  topDevelopmentalAreas: string[];
}

interface Props {
  userId: string;
  memberId: string;
  childName: string;
}

async function fetchPrayerFocus(userId: string, memberId: string) {
  const res = await fetch(
    `/api/kids-discipleship/prayer-focus?userId=${userId}&memberId=${memberId}&daysBack=30`
  );
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

async function fetchMonthlyVision(userId: string, memberId: string) {
  const res = await fetch(
    `/api/kids-discipleship/monthly-vision?userId=${userId}&memberId=${memberId}`
  );
  if (!res.ok) throw new Error("Failed to fetch monthly vision");
  return res.json();
}

async function updateReviewNotes(
  userId: string,
  memberId: string,
  yearMonth: string,
  reviewNotes: string
): Promise<void> {
  const res = await fetch("/api/kids-discipleship/monthly-vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      memberId,
      yearMonth,
      reviewNotes,
    }),
  });
  if (!res.ok) throw new Error("Failed to save review notes");
}

export function MonthlyReviewSection({ userId, memberId, childName }: Props) {
  const queryClient = useQueryClient();
  // Track timeout for cleanup
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Local edits - only used when user has modified the notes
  const [localNotes, setLocalNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  // Track if user has manually edited the notes (to avoid showing stale local state)
  const [userHasEdited, setUserHasEdited] = useState(false);
  // Track which memberId the local state belongs to
  const [editingMemberId, setEditingMemberId] = useState(memberId);

  // Cleanup timeout helper
  const cleanupTimeouts = useCallback(() => {
    if (savedTimeoutRef.current !== null) {
      clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = null;
    }
  }, []);

  // Reset local state when switching children
  if (memberId !== editingMemberId) {
    setEditingMemberId(memberId);
    setUserHasEdited(false);
    setLocalNotes("");
  }

  // Fetch stats from prayer focus API
  const { data: focusData, isLoading: statsLoading } = useQuery({
    queryKey: ["kids-discipleship", "prayer-focus", memberId],
    queryFn: () => fetchPrayerFocus(userId, memberId),
    enabled: !!userId && !!memberId,
    staleTime: 1000 * 60 * 5,
  });

  const stats: LogStats = focusData?.stats || {
    nurtureCount: 0,
    admonitionCount: 0,
    topHeartIssues: [],
    topVirtues: [],
    topDevelopmentalAreas: [],
  };

  // Fetch monthly vision for review notes
  const { data: visionData, isLoading: visionLoading } = useQuery({
    queryKey: ["kids-discipleship", "monthly-vision", memberId],
    queryFn: () => fetchMonthlyVision(userId, memberId),
    enabled: !!userId && !!memberId,
  });

  const currentYearMonth = visionData?.currentYearMonth;
  const currentVision = visionData?.visions?.find(
    (v: { yearMonth: string }) => v.yearMonth === currentYearMonth
  );

  // Use server data as source of truth until user edits
  const fetchedNotes = currentVision?.reviewNotes || "";

  // Display notes: show local edits if user has edited, otherwise show fetched data
  const displayNotes = userHasEdited ? localNotes : fetchedNotes;

  const handleNotesChange = (value: string) => {
    setUserHasEdited(true);
    setLocalNotes(value);
  };

  const saveNotesMutation = useMutation({
    mutationFn: () => updateReviewNotes(userId, memberId, currentYearMonth, displayNotes),
    onSuccess: () => {
      setNotesSaved(true);
      setUserHasEdited(false); // Reset after save so future fetches can update
      // Clear any existing timeout before setting a new one
      cleanupTimeouts();
      savedTimeoutRef.current = setTimeout(() => {
        setNotesSaved(false);
      }, 2000);
      queryClient.invalidateQueries({ queryKey: ["kids-discipleship", "monthly-vision", memberId] });
    },
  });

  const isLoading = statsLoading || visionLoading;
  const totalLogs = stats.nurtureCount + stats.admonitionCount;
  const hasData = totalLogs > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-4 w-36 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent" />
          Monthly Review Dashboard
        </CardTitle>
        <CardDescription>Last 30 days summary for {childName}</CardDescription>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>No data yet for the dashboard.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Win/Struggle counts */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingUp className="h-5 w-5 text-success" />
                  <span className="text-2xl font-bold text-success">{stats.nurtureCount}</span>
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-success/80">Nurture Moments</p>
              </div>
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                  <span className="text-2xl font-bold text-destructive">{stats.admonitionCount}</span>
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-destructive/80">Admonition Moments</p>
              </div>
            </div>

            {/* Top patterns */}
            <div className="grid gap-4 sm:grid-cols-2">
              {stats.topHeartIssues.length > 0 && (
                <div className="p-5 rounded-xl border border-warning/30 bg-warning/5">
                  <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-3 text-warning-foreground">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    Top Heart Issues
                  </h4>
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Top heart issues observed">
                    {stats.topHeartIssues.map((issue) => (
                      <Badge key={issue} variant="outline" className="border-warning/30 bg-warning/10 hover:bg-warning/20 text-warning-foreground" role="listitem">
                        {issue}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {stats.topVirtues.length > 0 && (
                <div className="p-5 rounded-xl border border-success/30 bg-success/5">
                  <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-3 text-success">
                    <Heart className="h-4 w-4" aria-hidden="true" />
                    Top Virtues
                  </h4>
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Top virtues observed">
                    {stats.topVirtues.map((virtue) => (
                      <Badge key={virtue} variant="outline" className="border-success/30 bg-success/10 hover:bg-success/20 text-success" role="listitem">
                        {virtue}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {stats.topDevelopmentalAreas.length > 0 && (
                <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 sm:col-span-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-3 text-primary">
                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                    Key Developmental Areas
                  </h4>
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Key developmental areas observed">
                    {stats.topDevelopmentalAreas.map((area) => (
                      <Badge
                        key={area}
                        variant="outline"
                        className="border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary"
                        role="listitem"
                      >
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ratio indicator */}
            <div className="p-5 rounded-xl border bg-card/50">
              <h4 className="text-sm font-medium mb-3">Nurture/Admonition Ratio</h4>
              <div className="h-4 rounded-full bg-destructive/30 overflow-hidden flex">
                <div
                  className="h-full bg-success"
                  style={{
                    width: `${(stats.nurtureCount / totalLogs) * 100}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                 <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success"></span> {Math.round((stats.nurtureCount / totalLogs) * 100)}% nurture</span>
                 <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive"></span> {Math.round((stats.admonitionCount / totalLogs) * 100)}% admonition</span>
              </div>
            </div>

            {/* What to adjust next month */}
            <div className="p-5 rounded-xl border bg-muted/30">
              <h4 className="text-sm font-semibold mb-2">What to Adjust Next Month</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Based on your observations, what would you like to focus on or change?
              </p>
              <Textarea
                placeholder="E.g., Focus more on patience during mealtimes, introduce new bedtime routine..."
                value={displayNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                rows={3}
                className="resize-none bg-input-bg"
              />
              <div className="flex items-center justify-between mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveNotesMutation.mutate()}
                  disabled={saveNotesMutation.isPending}
                >
                  {saveNotesMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : notesSaved ? (
                    <Check className="h-4 w-4 mr-2 text-green-600" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {notesSaved ? "Saved!" : "Save Notes"}
                </Button>
                {userHasEdited && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
