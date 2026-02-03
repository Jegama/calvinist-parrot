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
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <span className="text-2xl font-bold text-green-600">{stats.nurtureCount}</span>
                </div>
                <p className="text-sm text-muted-foreground">Nurture Moments</p>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingDown className="h-5 w-5 text-amber-600" />
                  <span className="text-2xl font-bold text-amber-600">{stats.admonitionCount}</span>
                </div>
                <p className="text-sm text-muted-foreground">Admonition Moments</p>
              </div>
            </div>

            {/* Top patterns */}
            <div className="grid gap-4 sm:grid-cols-2">
              {stats.topHeartIssues.length > 0 && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Top Heart Issues
                  </h4>
                  <div className="flex flex-wrap gap-1" role="list" aria-label="Top heart issues observed">
                    {stats.topHeartIssues.map((issue) => (
                      <Badge key={issue} variant="secondary" role="listitem">
                        {issue}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {stats.topVirtues.length > 0 && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Heart className="h-4 w-4 text-green-500" aria-hidden="true" />
                    Top Virtues
                  </h4>
                  <div className="flex flex-wrap gap-1" role="list" aria-label="Top virtues observed">
                    {stats.topVirtues.map((virtue) => (
                      <Badge key={virtue} variant="secondary" className="bg-green-100 dark:bg-green-900" role="listitem">
                        {virtue}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {stats.topDevelopmentalAreas.length > 0 && (
                <div className="p-4 rounded-lg bg-muted/50 sm:col-span-2">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                    Key Developmental Areas
                  </h4>
                  <div className="flex flex-wrap gap-1" role="list" aria-label="Key developmental areas observed">
                    {stats.topDevelopmentalAreas.map((area) => (
                      <Badge
                        key={area}
                        variant="secondary"
                        className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
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
            <div className="p-4 rounded-lg border">
              <h4 className="text-sm font-medium mb-2">Nurture/Admonition Ratio</h4>
              <div className="h-4 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-400"
                  style={{
                    width: `${(stats.nurtureCount / totalLogs) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {Math.round((stats.nurtureCount / totalLogs) * 100)}% nurture /{" "}
                {Math.round((stats.admonitionCount / totalLogs) * 100)}% admonition
              </p>
            </div>

            {/* What to adjust next month */}
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="text-sm font-medium mb-2">What to Adjust Next Month</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Based on your observations, what would you like to focus on or change?
              </p>
              <Textarea
                placeholder="E.g., Focus more on patience during mealtimes, introduce new bedtime routine..."
                value={displayNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                rows={3}
                className="resize-none"
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
