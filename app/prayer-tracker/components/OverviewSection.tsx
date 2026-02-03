// app/prayer-tracker/components/OverviewSection.tsx
// Phase 4: Dashboard overview tab showing aggregate stats from Prayer, Journal, and Kids
// Privacy: Only shows aggregate data, no individual journal entry links

"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Heart,
  BookOpen,
  Baby,
  Flame,
  AlertCircle,
  HandHeart,
} from "lucide-react";

interface OverviewStats {
  prayer: {
    totalActive: number;
    totalAnswered: number;
    householdActive: number;
    familyActive: number;
    lastPrayedAt: string | null;
    fromJournalCount: number;
    fromKidsCount: number;
  };
  journal: {
    totalEntries: number;
    entriesThisMonth: number;
    topTags: Array<{ tag: string; count: number }>;
    lastEntryAt: string | null;
    streakDays: number;
  };
  kids: {
    totalLogs: number;
    logsThisMonth: number;
    nurtureCount: number;
    admonitionCount: number;
    childrenCount: number;
    lastLogAt: string | null;
  };
  householdPrayerFocus: {
    topTags: Array<{ tag: string; count: number; category: string }>;
    periodDays: number;
  };
}

interface OverviewResponse {
  hasHousehold: boolean;
  stats: OverviewStats | null;
}

async function fetchOverview(): Promise<OverviewResponse> {
  const res = await fetch("/api/prayer-tracker/overview");
  if (!res.ok) throw new Error("Failed to fetch overview");
  return res.json();
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTagLabel(tag: string): string {
  // Convert "category:Value" to just "Value"
  const parts = tag.split(":");
  return parts.length > 1 ? parts[1] : tag;
}

export function OverviewSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["prayer-tracker", "overview"],
    queryFn: fetchOverview,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data?.hasHousehold || !data?.stats) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Unable to load overview stats.</p>
        </CardContent>
      </Card>
    );
  }

  const { prayer, journal, kids, householdPrayerFocus } = data.stats;

  // Helper to get category label for display
  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      heartIssue: "Heart",
      rulingDesire: "Desire",
      virtue: "Virtue",
      circumstance: "Life",
      theologicalTheme: "Theme",
    };
    return labels[category] || category;
  };

  // Helper to get category color
  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      heartIssue: "text-amber-700 dark:text-amber-400",
      rulingDesire: "text-destructive",
      virtue: "text-emerald-700 dark:text-emerald-400",
      circumstance: "text-primary",
      theologicalTheme: "text-[hsl(var(--chart-3))]",
    };
    return colors[category] || "text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-serif">Spiritual Health Overview</CardTitle>
        <CardDescription>
          A snapshot of your household&apos;s prayer, reflection, and discipleship activity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Household Prayer Focus */}
        {householdPrayerFocus.topTags.length > 0 && (
          <div className="space-y-3 rounded-2xl border border-primary/10 bg-muted/30 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">Consider Praying For</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Common themes from your household&apos;s reflections over the past {householdPrayerFocus.periodDays} days
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {householdPrayerFocus.topTags.map(({ tag, count, category }) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="px-3 py-1.5 text-sm border border-border/50"
                >
                  <span className={getCategoryColor(category)}>{formatTagLabel(tag)}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({count})
                  </span>
                  <span className="ml-1.5 text-xs text-muted-foreground opacity-60">
                    {getCategoryLabel(category)}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {/* Prayer Stats */}
          <Card className="bg-muted/10 border-border/60 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <HandHeart className="h-4 w-4 text-primary" />
                Prayer Tracker
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-primary">{prayer.totalActive}</p>
                  <p className="text-xs text-muted-foreground">Active requests</p>
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-success">{prayer.totalAnswered}</p>
                  <p className="text-xs text-muted-foreground">Answered</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Household requests</span>
                  <span className="font-medium">{prayer.householdActive}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Family requests</span>
                  <span className="font-medium">{prayer.familyActive}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last prayed</span>
                  <span className="font-medium">{formatRelativeDate(prayer.lastPrayedAt)}</span>
                </div>
              </div>

              {(prayer.fromJournalCount > 0 || prayer.fromKidsCount > 0) && (
                <div className="pt-2 border-t mt-auto">
                  <p className="text-xs text-muted-foreground mb-2">Requests from reflection:</p>
                  <div className="flex gap-2 flex-wrap">
                    {prayer.fromJournalCount > 0 && (
                      <Badge variant="secondary" className="text-xs border border-border/50">
                        <BookOpen className="h-3 w-3 mr-1" />
                        {prayer.fromJournalCount} from Journal
                      </Badge>
                    )}
                    {prayer.fromKidsCount > 0 && (
                      <Badge variant="secondary" className="text-xs border border-border/50">
                        <Baby className="h-3 w-3 mr-1" />
                        {prayer.fromKidsCount} from Heritage
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Journal Stats */}
          <Card className="bg-muted/10 border-border/60 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <BookOpen className="h-4 w-4 text-accent" />
                Personal Journal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-accent">{journal.totalEntries}</p>
                  <p className="text-xs text-muted-foreground">Total entries</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Flame className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <p className="text-3xl font-bold">{journal.streakDays}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Day streak</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">This month</span>
                  <span className="font-medium">{journal.entriesThisMonth} entries</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last entry</span>
                  <span className="font-medium">{formatRelativeDate(journal.lastEntryAt)}</span>
                </div>
              </div>

              {journal.topTags.length > 0 && (
                <div className="pt-2 border-t mt-auto">
                  <p className="text-xs text-muted-foreground mb-2">Top themes:</p>
                  <div className="flex flex-wrap gap-1">
                    {journal.topTags.map(({ tag, count }) => (
                      <Badge key={tag} variant="secondary" className="text-xs border border-border/50">
                        {formatTagLabel(tag)} ({count})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Kids Stats */}
          <Card className="bg-muted/10 border-border/60 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Baby className="h-4 w-4 text-primary" />
                Heritage Journal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-primary">{kids.totalLogs}</p>
                  <p className="text-xs text-muted-foreground">Total logs</p>
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-foreground">{kids.childrenCount}</p>
                  <p className="text-xs text-muted-foreground">Children tracked</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">This month</span>
                  <span className="font-medium">{kids.logsThisMonth} logs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last log</span>
                  <span className="font-medium">{formatRelativeDate(kids.lastLogAt)}</span>
                </div>
              </div>

              <div className="pt-2 border-t text-sm mt-auto">
                <p className="text-xs text-muted-foreground mb-2">Log breakdown:</p>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <Heart className="h-3 w-3 text-success" />
                    <span className="font-medium">{kids.nurtureCount}</span>
                    <span className="text-muted-foreground">Nurture</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Flame className="h-3 w-3 text-amber-500" />
                    <span className="font-medium">{kids.admonitionCount}</span>
                    <span className="text-muted-foreground">Admonition</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Quick Actions */}
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Actions</p>
            <h3 className="text-base font-serif text-foreground">Quick Shortcuts</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="h-9">
              <Link href="/journal">
                <BookOpen className="h-4 w-4 mr-2 text-accent" />
                New Journal Entry
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link href="/kids-discipleship">
                <Baby className="h-4 w-4 mr-2 text-primary" />
                Log Parenting Moment
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link href="/devotional">
                <Flame className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
                Today&apos;s Devotional
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
