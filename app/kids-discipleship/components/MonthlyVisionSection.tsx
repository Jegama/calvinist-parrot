// app/kids-discipleship/components/MonthlyVisionSection.tsx
// Section B: Monthly Vision
"use client";

import { useState, useEffect } from "react";
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
import { cn } from "@/lib/utils";

import { BibleVerse } from "@/components/BibleVerse";
import { useVerseValidation } from "@/hooks/use-verse-validation";

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

  // Verse validation
  const { verseErrors, validateField, clearErrors, hasErrors } = useVerseValidation();

  // Validate memory verse field when form data changes
  useEffect(() => {
    if (isEditing) {
      validateField("memoryVerse", formData.memoryVerse || "");
    }
  }, [formData.memoryVerse, isEditing, validateField]);

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
      // Invalidate progression state to show next section
      queryClient.invalidateQueries({
        queryKey: ["kids-discipleship", "progression", userId, memberId],
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
    clearErrors();
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
          <div className="space-y-6">
            {/* Memory verse - hidden for infants/toddlers (0-3 years) */}
            {!isMemoryVerseExempt && (
              <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <Label htmlFor="memoryVerse" className="text-xs font-bold uppercase tracking-wider text-primary">Memory Verse Reference</Label>
                </div>
                <Input
                  id="memoryVerse"
                  placeholder="e.g., Ephesians 6:1"
                  value={formData.memoryVerse || ""}
                  onChange={(e) => setFormData({ ...formData, memoryVerse: e.target.value })}
                  className={cn("bg-input-bg", verseErrors.memoryVerse && "border-destructive focus-visible:ring-destructive")}
                />
                {verseErrors.memoryVerse && (
                  <p className="text-xs text-destructive">{verseErrors.memoryVerse}</p>
                )}
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col p-5 rounded-xl border border-primary/20 bg-primary/5 shadow-sm space-y-3">
                <Label htmlFor="characterFocus" className="text-xs font-bold uppercase tracking-wider text-primary">Character Focus</Label>
                <Input
                  id="characterFocus"
                  placeholder="e.g., Not whining"
                  value={formData.characterFocus || ""}
                  onChange={(e) => setFormData({ ...formData, characterFocus: e.target.value })}
                  className="bg-input-bg font-serif text-lg font-medium"
                />
                <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-primary/10">
                  Biblical Basis: <BibleVerse reference="2 Peter 1:5-7" /> — Christ-like character traits
                </p>
              </div>
              <div className="flex flex-col p-5 rounded-xl border border-accent/20 bg-accent/5 shadow-sm space-y-3">
                <Label htmlFor="competencyFocus" className="text-xs font-bold uppercase tracking-wider text-accent">Competency Focus</Label>
                <Input
                  id="competencyFocus"
                  placeholder="e.g., Go to sleep"
                  value={formData.competencyFocus || ""}
                  onChange={(e) => setFormData({ ...formData, competencyFocus: e.target.value })}
                  className="bg-input-bg font-serif text-lg font-medium"
                />
                <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-accent/10">
                  Biblical Basis: <BibleVerse reference="2 Thessalonians 3:10-12" /> — Life skills for responsible living
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2">Household Practice Plan</h4>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="p-5 rounded-xl border border-accent/20 bg-accent/5 space-y-3">
                  <Label htmlFor="emphasize" className="text-xs font-bold uppercase tracking-wider text-accent">Emphasize</Label>
                  <Textarea
                    id="emphasize"
                    placeholder="Specific behaviors..."
                    value={formData.emphasize || ""}
                    onChange={(e) => setFormData({ ...formData, emphasize: e.target.value })}
                    rows={3}
                    className="bg-input-bg resize-none"
                  />
                </div>
                <div className="p-5 rounded-xl border border-warning/40 bg-warning/10 space-y-3">
                  <Label htmlFor="watchFor" className="text-xs font-bold uppercase tracking-wider text-warning-foreground/80">Watch For</Label>
                  <Textarea
                    id="watchFor"
                    placeholder="Signs of growth or struggle..."
                    value={formData.watchFor || ""}
                    onChange={(e) => setFormData({ ...formData, watchFor: e.target.value })}
                    rows={3}
                    className="bg-input-bg resize-none"
                  />
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="p-5 rounded-xl border border-success/20 bg-success/5 space-y-3">
                  <Label htmlFor="encourage" className="text-xs font-bold uppercase tracking-wider text-success">Encourage (Blessings)</Label>
                  <Textarea
                    id="encourage"
                    placeholder="Celebration plan..."
                    value={formData.encourage || ""}
                    onChange={(e) => setFormData({ ...formData, encourage: e.target.value })}
                    rows={3}
                    className="bg-input-bg resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-success/10">
                    Biblical Basis: <BibleVerse reference="Ephesians 6:2-3" /> — Harvest of obedience
                  </p>
                </div>
                <div className="p-5 rounded-xl border border-destructive/20 bg-destructive/5 space-y-3">
                  <Label htmlFor="correct" className="text-xs font-bold uppercase tracking-wider text-destructive">Correct (Consequences)</Label>
                  <Textarea
                    id="correct"
                    placeholder="Correction plan..."
                    value={formData.correct || ""}
                    onChange={(e) => setFormData({ ...formData, correct: e.target.value })}
                    rows={3}
                    className="bg-input-bg resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-destructive/10">
                    Biblical Basis: <BibleVerse reference="Galatians 6:7" />; <BibleVerse reference="Proverbs 22:15" /> — Harvest of disobedience
                  </p>
                </div>
              </div>
            </div>

            {/* Save/Cancel */}
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={mutation.isPending || hasErrors} className="w-full sm:w-auto">
                  <Save className="h-4 w-4 mr-2" />
                  {mutation.isPending ? "Saving..." : "Save Vision"}
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
              </div>
              {mutation.isError && (
                <p className="text-sm text-destructive">
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : "Failed to save vision. Please try again."}
                </p>
              )}
            </div>
          </div>
        ) : hasCurrentVisionContent && currentVision ? (
          // Display current vision
          <div className="space-y-6">
            {currentVision.memoryVerse && !isMemoryVerseExempt && (
              <div className="p-6 rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Memory Verse</span>
                </div>
                <div className="relative pl-4 border-l-2 border-primary/20">
                  <BibleVerse reference={currentVision.memoryVerse} />
                </div>
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              {currentVision.characterFocus && (
                <div className="flex flex-col p-5 rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary mb-2">Character Focus</span>
                  <p className="font-serif text-lg font-bold text-foreground">{currentVision.characterFocus}</p>
                </div>
              )}
              {currentVision.competencyFocus && (
                <div className="flex flex-col p-5 rounded-xl border border-accent/20 bg-accent/5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-accent mb-2">Competency Focus</span>
                  <p className="font-serif text-lg font-bold text-foreground">{currentVision.competencyFocus}</p>
                </div>
              )}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {currentVision.emphasize && (
                <div className="p-5 rounded-xl border border-accent/20 bg-accent/5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-accent mb-2 block">Emphasize</span>
                  <p className="text-sm leading-relaxed">{currentVision.emphasize}</p>
                </div>
              )}
              {currentVision.watchFor && (
                <div className="p-5 rounded-xl border border-warning/40 bg-warning/10 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-warning-foreground/80 mb-2 block">Watch For</span>
                  <p className="text-sm leading-relaxed">{currentVision.watchFor}</p>
                </div>
              )}
              {currentVision.encourage && (
                <div className="p-5 rounded-xl border border-success/20 bg-success/5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-success mb-2 block">Encourage</span>
                  <p className="text-sm leading-relaxed">{currentVision.encourage}</p>
                </div>
              )}
              {currentVision.correct && (
                <div className="p-5 rounded-xl border border-destructive/20 bg-destructive/5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-destructive mb-2 block">Correct</span>
                  <p className="text-sm leading-relaxed">{currentVision.correct}</p>
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
                      <BibleVerse reference={previousMonthVision.memoryVerse} />
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
                      <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                        <span className="text-xs font-medium text-muted-foreground">Encourage</span>
                        <p className="text-sm">{previousMonthVision.encourage}</p>
                      </div>
                    )}
                    {previousMonthVision.correct && (
                      <div className="p-3 rounded-lg bg-warning/30 border border-warning/50">
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
                      <div className="mb-3">
                        <span className="text-xs text-muted-foreground">Memory verse: </span>
                        <BibleVerse reference={vision.memoryVerse} />
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
