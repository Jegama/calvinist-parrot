// app/journal/components/SuggestedRequestsPanel.tsx
// Displays suggested prayer requests from Call 2 with "Add" buttons

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Loader2, HandHeart, Info } from "lucide-react";
import type { Call2Output } from "@/types/journal";
import { BibleVerse } from "@/components/BibleVerse";

interface SuggestedRequestsPanelProps {
  call2: Call2Output;
  userId: string;
  hasHousehold: boolean;
}

async function addPrayerRequest(
  userId: string,
  requestText: string,
  notes: string | null,
  linkedScripture: string | null
): Promise<void> {
  const res = await fetch("/api/prayer-tracker/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      requestText,
      notes,
      linkedScripture,
      familyId: null, // Household request
    }),
  });
  if (!res.ok) throw new Error("Failed to add prayer request");
}

export function SuggestedRequestsPanel({ call2, userId, hasHousehold }: SuggestedRequestsPanelProps) {
  const queryClient = useQueryClient();
  const [addedRequests, setAddedRequests] = useState<Set<string>>(new Set());

  const addMutation = useMutation({
    mutationFn: (params: { title: string; notes: string; linkedScripture: string | null; key: string }) =>
      addPrayerRequest(userId, params.title, params.notes, params.linkedScripture),
    onSuccess: (_, variables) => {
      setAddedRequests(prev => new Set(prev).add(variables.key));
      queryClient.invalidateQueries({ queryKey: ["prayer-requests"] });
    },
  });

  const requests = call2.suggestedPrayerRequests || [];

  if (requests.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <HandHeart className="h-5 w-5 text-primary" />
          Suggested Prayer Requests
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Based on your reflection, consider adding these to your prayer list
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasHousehold && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground mb-1">
                Create a household to add prayer requests
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                The Prayer Tracker requires a shared family space. Create one from your profile to start tracking prayers together.
              </p>
              <Button size="sm" asChild>
                <Link href="/profile">
                  Go to Profile
                </Link>
              </Button>
            </div>
          </div>
        )}
        {requests.map((req, i) => {
          const key = `prayer-${i}`;
          const isAdded = addedRequests.has(key);
          const isAdding = addMutation.isPending && addMutation.variables?.key === key;

          return (
            <div
              key={key}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{req.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{req.notes}</p>
                {req.linkedScripture && (
                  <Badge variant="secondary" className="mt-2 text-xs [&_button]:no-underline">
                    <BibleVerse reference={req.linkedScripture} />
                  </Badge>
                )}
              </div>
              {hasHousehold && (
                <Button
                  variant={isAdded ? "ghost" : "outline"}
                  size="sm"
                  disabled={isAdded || isAdding}
                  onClick={() => addMutation.mutate({
                    title: req.title,
                    notes: req.notes,
                    linkedScripture: req.linkedScripture,
                    key,
                  })}
                >
                {isAdding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isAdded ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Added
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </>
                )}
                </Button>
              )}
            </div>
          );
        })}

        {/* Tags Display */}
        {Object.values(call2.tags).some(arr => arr.length > 0) && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">
              Extracted Tags
            </h4>
            <div className="flex flex-wrap gap-1">
              {Object.entries(call2.tags).map(([category, values]) =>
                values.map((value, i) => (
                  <Badge
                    key={`${category}-${value}-${i}`}
                    variant="secondary"
                    className="text-xs"
                  >
                    {value}
                  </Badge>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
