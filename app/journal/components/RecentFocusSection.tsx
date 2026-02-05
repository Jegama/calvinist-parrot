// app/journal/components/RecentFocusSection.tsx
// Displays recurring themes from user's recent journal entries
// Shows what topics the user has been writing about

"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Lightbulb } from "lucide-react";

interface FocusResponse {
  recurringThemes: Array<{ theme: string; count: number; category: string }>;
  periodDays: number;
  entriesAnalyzed: number;
}

interface RecentFocusSectionProps {
  userId: string;
}

async function fetchFocus(userId: string): Promise<FocusResponse> {
  const res = await fetch(`/api/journal/focus?userId=${userId}&days=30`);
  if (!res.ok) throw new Error("Failed to fetch focus");
  return res.json();
}

export function RecentFocusSection({ userId }: RecentFocusSectionProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["journal", "focus", userId],
    queryFn: () => fetchFocus(userId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Recent Focus</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data || data.entriesAnalyzed === 0) {
    return (
      <Card className="col-span-2">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Recent Focus</span>
          </div>
          <p className="text-sm text-muted-foreground italic">
            Write a few entries to see your recent focus
          </p>
        </CardContent>
      </Card>
    );
  }

  // Only show themes that appear more than once (truly recurring)
  const meaningfulThemes = data.recurringThemes.filter(t => t.count > 1);

  // If no meaningful recurring themes, show a helpful message
  if (meaningfulThemes.length === 0) {
    return (
      <Card className="col-span-2">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Recent Focus <span className="text-xs opacity-60">(last {data.periodDays} days)</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground italic">
            No recurring patterns detected yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-accent" />
          <span className="text-sm text-muted-foreground">
            Recent Focus <span className="text-xs opacity-60">(last {data.periodDays} days)</span>
          </span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          {meaningfulThemes.map(({ theme, count }) => (
            <Badge
              key={theme}
              variant="secondary"
              className="text-xs"
            >
              {theme} ({count})
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
