// app/kids-discipleship/components/MonthlyVisionSection.tsx
// Section B: Monthly Vision
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ChevronDown, ChevronRight, History, Save, BookOpen } from "lucide-react";

interface MonthlyVision {
  id: string;
  yearMonth: string;
  memoryVerse: string | null;
  characterFocus: string | null;
  competencyFocus: string | null;
  emphasize: string | null;
  watchFor: string | null;
  encourage: string | null;
  correct: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  isEditable: boolean;
}

interface Props {
  userId: string;
  memberId: string;
  childName: string;
  childBirthdate?: string | null;
}

async function fetchMonthlyVisions(userId: string, memberId: string) {
  const res = await fetch(
    `/api/kids-discipleship/monthly-vision?userId=${userId}&memberId=${memberId}`
  );
  if (!res.ok) throw new Error("Failed to fetch monthly visions");
  return res.json();
}

async function saveMonthlyVision(
  userId: string,
  memberId: string,
  data: Partial<MonthlyVision>
) {
  const res = await fetch("/api/kids-discipleship/monthly-vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, memberId, ...data }),
  });
  if (!res.ok) throw new Error("Failed to save vision");
  return res.json();
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Check if child is in Infant/Toddler bracket (0-3 years) - exempt from memory verse
 */
function isInfantToddler(birthdate: string | null | undefined): boolean {
  if (!birthdate) return false;
  const birth = new Date(birthdate);
  const now = new Date();
  const ageInYears = (now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return ageInYears < 3;
}

/**
 * Check if a vision has actual content (not just reviewNotes)
 */
function hasVisionContent(vision: MonthlyVision | undefined): boolean {
  if (!vision) return false;
  return Boolean(
    vision.memoryVerse ||
    vision.characterFocus ||
    vision.competencyFocus ||
    vision.emphasize ||
    vision.watchFor ||
    vision.encourage ||
    vision.correct
  );
}

export function MonthlyVisionSection({ userId, memberId, childBirthdate }: Props) {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<MonthlyVision>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["kids-discipleship", "monthly-vision", memberId],
    queryFn: () => fetchMonthlyVisions(userId, memberId),
    enabled: !!userId && !!memberId,
  });

  const mutation = useMutation({
    mutationFn: (visionData: Partial<MonthlyVision>) =>
      saveMonthlyVision(userId, memberId, visionData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["kids-discipleship", "monthly-vision", memberId],
      });
      setIsEditing(false);
    },
  });

  const visions: MonthlyVision[] = data?.visions || [];
  const currentYearMonth = data?.currentYearMonth || "";
  const currentVision = visions.find((v) => v.yearMonth === currentYearMonth);
  // Limit history to last 12 months
  const pastVisions = visions
    .filter((v) => v.yearMonth !== currentYearMonth)
    .slice(0, 12);

  // Check if current vision has actual content (not just reviewNotes)
  const hasCurrentVisionContent = hasVisionContent(currentVision);

  // Get previous month's vision for pre-filling
  const previousMonthVision = pastVisions.length > 0 ? pastVisions[0] : null;

  // Check if child is exempt from memory verse (0-3 years)
  const isMemoryVerseExempt = isInfantToddler(childBirthdate);

  const startEditing = () => {
    // If no current vision content, pre-fill from previous month
    if (!hasCurrentVisionContent && previousMonthVision) {
      setFormData({
        memoryVerse: previousMonthVision.memoryVerse,
        characterFocus: previousMonthVision.characterFocus,
        competencyFocus: previousMonthVision.competencyFocus,
        emphasize: previousMonthVision.emphasize,
        watchFor: previousMonthVision.watchFor,
        encourage: previousMonthVision.encourage,
        correct: previousMonthVision.correct,
      });
    } else {
      setFormData(currentVision || {});
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    mutation.mutate(formData);
  };

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
              <Calendar className="h-5 w-5 text-accent" />
              Monthly Vision
            </CardTitle>
            <CardDescription className="mt-1">
              {currentYearMonth ? formatMonthLabel(currentYearMonth) : "Current Month"} — Focus and practice plan
            </CardDescription>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              {hasCurrentVisionContent ? "Edit" : "Set Vision"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isEditing ? (
          // Edit Form
          <div className="space-y-4">
            {/* Memory verse - hidden for infants/toddlers (0-3 years) */}
            {!isMemoryVerseExempt && (
              <div>
                <Label htmlFor="memoryVerse">Memory Verse for the Month</Label>
                <Input
                  id="memoryVerse"
                  placeholder="e.g., Children, obey your parents in the Lord... (Ephesians 6:1)"
                  value={formData.memoryVerse || ""}
                  onChange={(e) => setFormData({ ...formData, memoryVerse: e.target.value })}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="characterFocus">Character Focus</Label>
                <Input
                  id="characterFocus"
                  placeholder="Which aspect of the annual character goal?"
                  value={formData.characterFocus || ""}
                  onChange={(e) => setFormData({ ...formData, characterFocus: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="competencyFocus">Competency Focus</Label>
                <Input
                  id="competencyFocus"
                  placeholder="Which specific skill or habit?"
                  value={formData.competencyFocus || ""}
                  onChange={(e) => setFormData({ ...formData, competencyFocus: e.target.value })}
                />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 space-y-4">
              <h4 className="font-medium">Household Practice Plan</h4>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="emphasize">What we will emphasize</Label>
                  <Textarea
                    id="emphasize"
                    placeholder="Specific behaviors or attitudes to reinforce..."
                    value={formData.emphasize || ""}
                    onChange={(e) => setFormData({ ...formData, emphasize: e.target.value })}
                    rows={2}
                  />
                </div>
                <div>
                  <Label htmlFor="watchFor">What we will watch for</Label>
                  <Textarea
                    id="watchFor"
                    placeholder="Signs of growth or struggle to observe..."
                    value={formData.watchFor || ""}
                    onChange={(e) => setFormData({ ...formData, watchFor: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="encourage">How we will encourage (blessings)</Label>
                  <Textarea
                    id="encourage"
                    placeholder="Specific ways to celebrate obedience..."
                    value={formData.encourage || ""}
                    onChange={(e) => setFormData({ ...formData, encourage: e.target.value })}
                    rows={2}
                  />
                </div>
                <div>
                  <Label htmlFor="correct">How we will correct (consequences)</Label>
                  <Textarea
                    id="correct"
                    placeholder="Age-appropriate responses to disobedience..."
                    value={formData.correct || ""}
                    onChange={(e) => setFormData({ ...formData, correct: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Save/Cancel */}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={mutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {mutation.isPending ? "Saving..." : "Save Vision"}
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : hasCurrentVisionContent && currentVision ? (
          // Display current vision
          <div className="space-y-4">
            {currentVision.memoryVerse && !isMemoryVerseExempt && (
              <div className="p-4 rounded-lg border border-accent/20 bg-accent/5">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="h-4 w-4 text-accent" />
                  <span className="font-medium text-sm">Memory Verse</span>
                </div>
                <p className="text-sm italic">{currentVision.memoryVerse}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {currentVision.characterFocus && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <span className="text-xs font-medium text-muted-foreground">Character Focus</span>
                  <p className="font-medium">{currentVision.characterFocus}</p>
                </div>
              )}
              {currentVision.competencyFocus && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <span className="text-xs font-medium text-muted-foreground">Competency Focus</span>
                  <p className="font-medium">{currentVision.competencyFocus}</p>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {currentVision.emphasize && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground">Emphasize</span>
                  <p className="text-sm">{currentVision.emphasize}</p>
                </div>
              )}
              {currentVision.watchFor && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground">Watch For</span>
                  <p className="text-sm">{currentVision.watchFor}</p>
                </div>
              )}
              {currentVision.encourage && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <span className="text-xs font-medium text-muted-foreground">Encourage</span>
                  <p className="text-sm">{currentVision.encourage}</p>
                </div>
              )}
              {currentVision.correct && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                  <span className="text-xs font-medium text-muted-foreground">Correct</span>
                  <p className="text-sm">{currentVision.correct}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          // No vision yet for current month - show previous month for continuity
          <div className="space-y-4">
            {previousMonthVision ? (
              <>
                {/* Prompt to review */}
                <div className="p-4 rounded-lg border border-accent/30 bg-accent/5">
                  <p className="text-sm font-medium text-foreground mb-1">
                    Time to review your vision for {currentYearMonth ? formatMonthLabel(currentYearMonth) : "this month"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Here&apos;s what you focused on last month. Review and adjust as needed for the new month.
                  </p>
                  <Button variant="default" className="mt-3" onClick={startEditing}>
                    Review &amp; Update Vision
                  </Button>
                </div>

                {/* Show previous month's content as reference */}
                <div className="opacity-75">
                  <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                    <History className="h-3 w-3" />
                    From {formatMonthLabel(previousMonthVision.yearMonth)}:
                  </p>

                  {previousMonthVision.memoryVerse && !isMemoryVerseExempt && (
                    <div className="p-4 rounded-lg border border-accent/20 bg-accent/5 mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <BookOpen className="h-4 w-4 text-accent" />
                        <span className="font-medium text-sm">Memory Verse</span>
                      </div>
                      <p className="text-sm italic">{previousMonthVision.memoryVerse}</p>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    {previousMonthVision.characterFocus && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <span className="text-xs font-medium text-muted-foreground">Character Focus</span>
                        <p className="font-medium">{previousMonthVision.characterFocus}</p>
                      </div>
                    )}
                    {previousMonthVision.competencyFocus && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <span className="text-xs font-medium text-muted-foreground">Competency Focus</span>
                        <p className="font-medium">{previousMonthVision.competencyFocus}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 mt-4">
                    {previousMonthVision.emphasize && (
                      <div className="p-3 rounded-lg bg-muted/30">
                        <span className="text-xs font-medium text-muted-foreground">Emphasize</span>
                        <p className="text-sm">{previousMonthVision.emphasize}</p>
                      </div>
                    )}
                    {previousMonthVision.watchFor && (
                      <div className="p-3 rounded-lg bg-muted/30">
                        <span className="text-xs font-medium text-muted-foreground">Watch For</span>
                        <p className="text-sm">{previousMonthVision.watchFor}</p>
                      </div>
                    )}
                    {previousMonthVision.encourage && (
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                        <span className="text-xs font-medium text-muted-foreground">Encourage</span>
                        <p className="text-sm">{previousMonthVision.encourage}</p>
                      </div>
                    )}
                    {previousMonthVision.correct && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                        <span className="text-xs font-medium text-muted-foreground">Correct</span>
                        <p className="text-sm">{previousMonthVision.correct}</p>
                      </div>
                    )}
                  </div>

                  {previousMonthVision.reviewNotes && (
                    <div className="mt-4 p-3 rounded-lg border border-muted bg-muted/20">
                      <span className="text-xs font-medium text-muted-foreground">Review Notes:</span>
                      <p className="text-sm italic text-muted-foreground/80">{previousMonthVision.reviewNotes}</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* No previous month either - true empty state */
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p>No vision set for this month.</p>
                <Button variant="outline" className="mt-4" onClick={startEditing}>
                  Set Monthly Vision
                </Button>
              </div>
            )}
          </div>
        )}

        {/* History section */}
        {pastVisions.length > 0 && (
          <Collapsible open={showHistory} onOpenChange={setShowHistory}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  View History ({pastVisions.length} past {pastVisions.length === 1 ? "month" : "months"})
                </span>
                {showHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-4">
              {pastVisions.map((vision) => (
                <Collapsible key={vision.id}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between p-3 h-auto rounded-lg bg-muted/30 border hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{formatMonthLabel(vision.yearMonth)}</Badge>
                        {vision.characterFocus && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">• {vision.characterFocus}</span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="p-4 pt-2 rounded-b-lg bg-muted/20 border-x border-b -mt-1">
                    {vision.memoryVerse && (
                      <div>
                        <p className="italic text-muted-foreground text-sm mb-3">Memory verse: {vision.memoryVerse}</p>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-3 text-sm">
                      {vision.characterFocus && (
                        <div>
                          <span className="text-xs text-muted-foreground">Character:</span>
                          <p className="font-medium">{vision.characterFocus}</p>
                        </div>
                      )}
                      {vision.competencyFocus && (
                        <div>
                          <span className="text-xs text-muted-foreground">Competency:</span>
                          <p className="font-medium">{vision.competencyFocus}</p>
                        </div>
                      )}
                      {vision.emphasize && (
                        <div>
                          <span className="text-xs text-muted-foreground">Emphasize:</span>
                          <p>{vision.emphasize}</p>
                        </div>
                      )}
                      {vision.watchFor && (
                        <div>
                          <span className="text-xs text-muted-foreground">Watch For:</span>
                          <p>{vision.watchFor}</p>
                        </div>
                      )}
                      {vision.encourage && (
                        <div>
                          <span className="text-xs text-muted-foreground">Encourage:</span>
                          <p>{vision.encourage}</p>
                        </div>
                      )}
                      {vision.correct && (
                        <div>
                          <span className="text-xs text-muted-foreground">Correct:</span>
                          <p>{vision.correct}</p>
                        </div>
                      )}
                    </div>

                    {vision.reviewNotes && (
                      <div className="mt-3 pt-3 border-t border-muted">
                        <span className="text-xs text-muted-foreground">Review Notes:</span>
                        <p className="text-sm italic text-muted-foreground/80">{vision.reviewNotes}</p>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
