// app/kids-discipleship/components/PrayerFocusSection.tsx
// Section D: Prayer Focus (derived from logs) + Section E: Monthly Review + Section F: Annual Review
"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Heart,
  HandHeart,
  AlertCircle,
  Plus,
  BookOpen,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Check,
  Loader2,
  Cake,
  Sparkles,
  Save,
  Calendar,
} from "lucide-react";
import { BibleVerse } from "@/components/BibleVerse";
import { AGE_BRACKET_CONFIG } from "@/utils/ageUtils";

interface PrayerFocusItem {
  title: string;
  notes: string;
  linkedScripture: string | null;
  sourceEntryId: string;
  sourceEntryDate: string;
  sourceCategory: "NURTURE" | "ADMONITION";
  sourceSnippet: string;
}

interface LogStats {
  nurtureCount: number;
  admonitionCount: number;
  topHeartIssues: string[];
  topVirtues: string[];
}

interface Props {
  userId: string;
  memberId: string;
  childName: string;
  childBirthdate?: string | null;
  onCreateNextYearPlan?: () => void;
}

async function fetchPrayerFocus(userId: string, memberId: string) {
  const res = await fetch(
    `/api/kids-discipleship/prayer-focus?userId=${userId}&memberId=${memberId}&daysBack=30`
  );
  if (!res.ok) throw new Error("Failed to fetch prayer focus");
  return res.json();
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

async function fetchAnnualPlans(userId: string, memberId: string) {
  const res = await fetch(
    `/api/kids-discipleship/annual-plan?userId=${userId}&memberId=${memberId}`
  );
  if (!res.ok) throw new Error("Failed to fetch annual plans");
  return res.json();
}

export function PrayerFocusSection({
  userId,
  memberId,
  childName,
  childBirthdate,
  onCreateNextYearPlan,
}: Props) {
  const queryClient = useQueryClient();
  const [addedRequests, setAddedRequests] = useState<Set<string>>(new Set());
  const [reviewNotes, setReviewNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["kids-discipleship", "prayer-focus", memberId],
    queryFn: () => fetchPrayerFocus(userId, memberId),
    enabled: !!userId && !!memberId,
    staleTime: 1000 * 60 * 5,
  });

  const prayerNeeds: PrayerFocusItem[] = data?.prayerNeeds || [];
  const praises: PrayerFocusItem[] = data?.praises || [];
  const stats: LogStats = data?.stats || {
    nurtureCount: 0,
    admonitionCount: 0,
    topHeartIssues: [],
    topVirtues: [],
  };

  // Fetch monthly vision for review notes
  const { data: visionData } = useQuery({
    queryKey: ["kids-discipleship", "monthly-vision", memberId],
    queryFn: () => fetchMonthlyVision(userId, memberId),
    enabled: !!userId && !!memberId,
  });

  // Fetch annual plan to check if one exists for current year
  const { data: annualPlanData } = useQuery({
    queryKey: ["kids-discipleship", "annual-plan", memberId],
    queryFn: () => fetchAnnualPlans(userId, memberId),
    enabled: !!userId && !!memberId,
  });

  const currentYear = new Date().getFullYear();
  const childPlans = annualPlanData?.children?.find(
    (c: { memberId: string }) => c.memberId === memberId
  )?.plans || [];
  const hasCurrentYearPlan = childPlans.some(
    (p: { year: number }) => p.year === currentYear
  );

  const currentYearMonth = visionData?.currentYearMonth;
  const currentVision = visionData?.visions?.find(
    (v: { yearMonth: string }) => v.yearMonth === currentYearMonth
  );

  // Sync review notes from fetched data
  const fetchedNotes = currentVision?.reviewNotes || "";
  useEffect(() => {
    if (fetchedNotes && reviewNotes === "") {
      setReviewNotes(fetchedNotes);
    }
  }, [fetchedNotes, reviewNotes]);

  const addMutation = useMutation({
    mutationFn: (params: { title: string; notes: string; linkedScripture: string | null; key: string }) =>
      addPrayerRequest(
        userId,
        params.title,
        params.notes,
        params.linkedScripture
      ),
    onSuccess: (_, variables) => {
      setAddedRequests((prev) => new Set(prev).add(variables.key));
      queryClient.invalidateQueries({ queryKey: ["prayer-requests"] });
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: () => updateReviewNotes(userId, memberId, currentYearMonth, reviewNotes),
    onSuccess: () => {
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["kids-discipleship", "monthly-vision", memberId] });
    },
  });

  // Annual Review calculations
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  const isYearEnd = currentMonth >= 10; // November or December

  let isBirthdayMonth = false;
  let upcomingBirthday: Date | null = null;
  let nextAgeBracket: string | null = null;

  if (childBirthdate) {
    const birthDate = new Date(childBirthdate);
    isBirthdayMonth = birthDate.getMonth() === currentMonth;

    // Calculate next birthday
    upcomingBirthday = new Date(birthDate);
    upcomingBirthday.setFullYear(now.getFullYear());
    if (upcomingBirthday < now) {
      upcomingBirthday.setFullYear(now.getFullYear() + 1);
    }

    // Check if approaching new age bracket
    const ageInMonths = Math.floor((now.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30));

    // Check if within 6 months of a bracket boundary
    const bracketBoundaries = [3, 7, 13]; // Ages where brackets change
    for (const boundary of bracketBoundaries) {
      const monthsToNextBracket = (boundary * 12) - ageInMonths;
      if (monthsToNextBracket > 0 && monthsToNextBracket <= 6) {
        const nextBracketInfo = Object.values(AGE_BRACKET_CONFIG).find(b => b.min === boundary);
        if (nextBracketInfo) {
          nextAgeBracket = nextBracketInfo.label;
        }
        break;
      }
    }
  }

  const showAnnualReview = (isYearEnd || isBirthdayMonth) && hasCurrentYearPlan;

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

  const totalLogs = stats.nurtureCount + stats.admonitionCount;
  const hasData = totalLogs > 0;

  return (
    <div className="space-y-6">
      {/* Annual Review Banner - Section F */}
      {showAnnualReview && (
        <Alert className="border-accent/50 bg-accent/5">
          <Sparkles className="h-5 w-5 text-accent" />
          <AlertTitle className="flex items-center gap-2">
            {isBirthdayMonth ? (
              <>
                <Cake className="h-4 w-4" />
                Birthday Time — Annual Review for {childName}
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4" />
                Year-End Review for {childName}
              </>
            )}
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>
              {isBirthdayMonth
                ? `It's ${childName}'s birthday month! This is a wonderful time to reflect on the past year's growth and set new goals.`
                : `As the year comes to a close, take time to reflect on ${childName}'s growth and prepare next year's plan.`}
            </p>

            {nextAgeBracket && (
              <div className="p-3 rounded-lg bg-primary/10 text-sm">
                <strong>Bracket Transition Coming:</strong> {childName} will soon be entering the{" "}
                <Badge variant="secondary">{nextAgeBracket}</Badge> stage. Consider adjusting your
                approach to match this new developmental phase.
              </div>
            )}

            <div className="space-y-2 text-sm">
              <p className="font-medium">Reflect on this year:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Did you see growth in the Character goal you set?</li>
                <li>How did the Competency focus go?</li>
                <li>What patterns emerged in your nurture and admonition moments?</li>
                <li>What would you do differently next year?</li>
              </ul>
            </div>

            {onCreateNextYearPlan && (
              <Button onClick={onCreateNextYearPlan} className="mt-2">
                <Plus className="h-4 w-4 mr-2" />
                Create {new Date().getFullYear() + 1} Plan
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Prayer Focus Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandHeart className="h-5 w-5 text-accent" />
            Prayer Focus
          </CardTitle>
          <CardDescription>
            Derived from the last 30 days of logs for {childName}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!hasData ? (
            <div className="text-center py-8 text-muted-foreground">
              <HandHeart className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>No logs yet from the last 30 days.</p>
              <p className="text-sm">Start logging parenting moments to generate prayer focus.</p>
            </div>
          ) : (
            <Tabs defaultValue="needs" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="needs" className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Prayer Needs ({prayerNeeds.length})
                </TabsTrigger>
                <TabsTrigger value="praises" className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-green-500" />
                  Praises ({praises.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="needs" className="space-y-3">
                {prayerNeeds.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No prayer needs identified from recent logs.
                  </p>
                ) : (
                  prayerNeeds.map((item, i) => {
                    const key = `need-${i}`;
                    const isAdded = addedRequests.has(key);
                    const isAdding = addMutation.isPending && addMutation.variables?.key === key;
                    return (
                      <PrayerFocusCard
                        key={i}
                        item={item}
                        type="need"
                        isAdded={isAdded}
                        isAdding={isAdding}
                        onAdd={() => addMutation.mutate({ title: item.title, notes: item.notes, linkedScripture: item.linkedScripture, key })}
                      />
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="praises" className="space-y-3">
                {praises.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No praises identified from recent logs.
                  </p>
                ) : (
                  praises.map((item, i) => {
                    const key = `praise-${i}`;
                    const isAdded = addedRequests.has(key);
                    const isAdding = addMutation.isPending && addMutation.variables?.key === key;
                    return (
                      <PrayerFocusCard
                        key={i}
                        item={item}
                        type="praise"
                        isAdded={isAdded}
                        isAdding={isAdding}
                        onAdd={() => addMutation.mutate({ title: item.title, notes: item.notes, linkedScripture: item.linkedScripture, key })}
                      />
                    );
                  })
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Monthly Review Dashboard Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            Monthly Review Dashboard
          </CardTitle>
          <CardDescription>
            Last 30 days summary for {childName}
          </CardDescription>
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
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      Top Heart Issues
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {stats.topHeartIssues.map((issue) => (
                        <Badge key={issue} variant="secondary">
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {stats.topVirtues.length > 0 && (
                  <div className="p-4 rounded-lg bg-muted/50">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Heart className="h-4 w-4 text-green-500" />
                      Top Virtues
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {stats.topVirtues.map((virtue) => (
                        <Badge key={virtue} variant="secondary" className="bg-green-100 dark:bg-green-900">
                          {virtue}
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
                  {Math.round((stats.nurtureCount / totalLogs) * 100)}% nurture / {" "}
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
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
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
                  {currentVision?.reviewNotes && reviewNotes !== currentVision.reviewNotes && (
                    <span className="text-xs text-muted-foreground">Unsaved changes</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Prayer Focus Item Card
function PrayerFocusCard({
  item,
  type,
  isAdded,
  isAdding,
  onAdd,
}: {
  item: PrayerFocusItem;
  type: "need" | "praise";
  isAdded: boolean;
  isAdding: boolean;
  onAdd: () => void;
}) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div
      className={`p-3 rounded-lg border ${type === "need"
          ? "bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800"
          : "bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800"
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-sm text-muted-foreground mt-1">{item.notes}</p>
        </div>
        <Button
          variant={isAdded ? "ghost" : "outline"}
          size="sm"
          disabled={isAdded || isAdding}
          onClick={onAdd}
          className="shrink-0"
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
      </div>
      {item.linkedScripture && (
        <p className="text-xs text-accent mt-1 flex items-center gap-1">
          <BookOpen className="h-3 w-3" />
          <BibleVerse reference={item.linkedScripture} />
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
        From {formatDate(item.sourceEntryDate)}: {item.sourceSnippet}
      </p>
    </div>
  );
}
