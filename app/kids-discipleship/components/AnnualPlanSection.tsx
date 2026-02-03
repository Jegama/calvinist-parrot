// app/kids-discipleship/components/AnnualPlanSection.tsx
// Section A: Annual Plan — The Four Elements
"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, ChevronDown, ChevronRight, History, Plus, Save, BookOpen, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

import { BibleVerse } from "@/components/BibleVerse";
import { useVerseValidation } from "@/hooks/use-verse-validation";

interface AnnualPlan {
  id: string;
  year: number;
  characterGoal: string;
  characterScripture: string | null;
  characterAction: string | null;
  competencyGoal: string;
  competencyScripture: string | null;
  competencyAction: string | null;
  competencyType: "PROFESSIONAL" | "PERSONAL";
  blessingsPlan: string | null;
  consequencesPlan: string | null;
  themeVerse: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  userId: string;
  memberId: string;
  childName: string;
  scrollToAndEdit?: boolean;
  onScrollHandled?: () => void;
}

async function fetchAnnualPlans(userId: string, memberId: string) {
  const res = await fetch(
    `/api/kids-discipleship/annual-plan?userId=${userId}&memberId=${memberId}`
  );
  if (!res.ok) throw new Error("Failed to fetch annual plans");
  return res.json();
}

async function createOrUpdatePlan(
  userId: string,
  memberId: string,
  year: number,
  data: Partial<AnnualPlan>,
  planId?: string
) {
  if (planId) {
    const res = await fetch("/api/kids-discipleship/annual-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, planId, ...data }),
    });
    if (!res.ok) throw new Error("Failed to update plan");
    return res.json();
  } else {
    const res = await fetch("/api/kids-discipleship/annual-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, memberId, year, ...data }),
    });
    if (!res.ok) throw new Error("Failed to create plan");
    return res.json();
  }
}

export function AnnualPlanSection({ userId, memberId, childName, scrollToAndEdit, onScrollHandled }: Props) {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [showHistory, setShowHistory] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<AnnualPlan>>({});
  const cardRef = useRef<HTMLDivElement>(null);
  // Track if we need to scroll when the component updates
  const [shouldScrollOnMount, setShouldScrollOnMount] = useState(false);
  // Track if we've already handled this scroll request (to prevent re-triggering)
  const [hasHandledScroll, setHasHandledScroll] = useState(false);
  // Track the previous scrollToAndEdit value to detect changes
  const [prevScrollToAndEdit, setPrevScrollToAndEdit] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["kids-discipleship", "annual-plan", memberId],
    queryFn: () => fetchAnnualPlans(userId, memberId),
    enabled: !!userId && !!memberId,
  });

  const childData = data?.children?.find((c: { memberId: string }) => c.memberId === memberId);
  const plans: AnnualPlan[] = childData?.plans || [];
  const currentPlan = plans.find((p) => p.year === currentYear);
  const pastPlans = plans.filter((p) => p.year < currentYear);
  // Get most recent past plan (last year) for pre-filling
  const previousYearPlan = pastPlans.length > 0 ? pastPlans[0] : null;

  // Handle scroll to and edit when triggered from parent (using render-time state sync pattern)
  if (scrollToAndEdit !== prevScrollToAndEdit) {
    setPrevScrollToAndEdit(scrollToAndEdit ?? false);
    if (scrollToAndEdit) {
      setHasHandledScroll(false); // Reset for new scroll request
    }
  }

  // Process scroll request when data is ready and we haven't handled it yet
  if (scrollToAndEdit && !isLoading && !hasHandledScroll && !isEditing) {
    setHasHandledScroll(true);
    setFormData(currentPlan || {});
    setIsEditing(true);
    setShouldScrollOnMount(true);
  }

  // Callback ref that scrolls when the element is available
  const scrollRef = (node: HTMLDivElement | null) => {
    cardRef.current = node;
    if (node && shouldScrollOnMount) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      setShouldScrollOnMount(false);
      onScrollHandled?.();
    }
  };

  const mutation = useMutation({
    mutationFn: (params: { data: Partial<AnnualPlan>; planId?: string }) =>
      createOrUpdatePlan(userId, memberId, currentYear, params.data, params.planId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["kids-discipleship", "annual-plan", memberId],
      });
      // Invalidate progression state to show next section
      queryClient.invalidateQueries({
        queryKey: ["kids-discipleship", "progression", userId, memberId],
      });
      setIsEditing(false);
    },
  });

  // Verse validation
  const { verseErrors, validateField, clearErrors, hasErrors } = useVerseValidation();

  // Validate verse fields when form data changes
  useEffect(() => {
    if (isEditing) {
      validateField("characterScripture", formData.characterScripture || "");
      validateField("competencyScripture", formData.competencyScripture || "");
      validateField("themeVerse", formData.themeVerse || "");
    }
  }, [formData.characterScripture, formData.competencyScripture, formData.themeVerse, isEditing, validateField]);

  const startEditing = () => {
    // If no current plan but we have a previous year, pre-fill from it
    if (!currentPlan && previousYearPlan) {
      setFormData({
        characterGoal: previousYearPlan.characterGoal,
        characterScripture: previousYearPlan.characterScripture,
        characterAction: previousYearPlan.characterAction,
        competencyGoal: previousYearPlan.competencyGoal,
        competencyScripture: previousYearPlan.competencyScripture,
        competencyAction: previousYearPlan.competencyAction,
        competencyType: previousYearPlan.competencyType,
        blessingsPlan: previousYearPlan.blessingsPlan,
        consequencesPlan: previousYearPlan.consequencesPlan,
        themeVerse: previousYearPlan.themeVerse,
      });
    } else {
      setFormData(currentPlan || {});
    }
    clearErrors();
    setIsEditing(true);
  };

  const handleSave = () => {
    mutation.mutate({
      data: formData,
      planId: currentPlan?.id,
    });
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
    <Card ref={scrollRef}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-accent" />
              Annual Plan for {childName}
            </CardTitle>
            <CardDescription className="mt-1">
              Year: {currentYear}
            </CardDescription>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              {currentPlan ? "Edit" : "Create Plan"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isEditing ? (
          // Edit Form
          <div className="space-y-6">
            
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Character Focus Form - Primary (Deep Blue) */}
              <div className="flex flex-col p-5 rounded-xl border border-primary/20 bg-primary/5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold ring-1 ring-primary/20">1</div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Character Focus</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="characterGoal" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Goal</Label>
                    <Input
                      id="characterGoal"
                      placeholder="e.g., Patience"
                      value={formData.characterGoal || ""}
                      onChange={(e) => setFormData({ ...formData, characterGoal: e.target.value })}
                      className="bg-input-bg font-serif text-lg font-medium"
                    />
                  </div>
                  <div>
                    <Label htmlFor="characterScripture" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Scripture Reference</Label>
                    <Input
                      id="characterScripture"
                      placeholder="e.g., Ephesians 6:1"
                      value={formData.characterScripture || ""}
                      onChange={(e) => setFormData({ ...formData, characterScripture: e.target.value })}
                      className={cn("bg-input-bg", verseErrors.characterScripture && "border-destructive focus-visible:ring-destructive")}
                    />
                    {verseErrors.characterScripture && (
                      <p className="text-xs text-destructive mt-1">{verseErrors.characterScripture}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="characterAction" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Observable Action</Label>
                    <Input
                      id="characterAction"
                      placeholder="e.g., Stopping when saying no"
                      value={formData.characterAction || ""}
                      onChange={(e) => setFormData({ ...formData, characterAction: e.target.value })}
                      className="bg-input-bg"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-primary/10">
                  Biblical Basis: <BibleVerse reference="2 Peter 1:5-7" /> — &ldquo;Add to your faith virtue...&rdquo;
                </p>
              </div>

              {/* Competency Focus Form - Accent (Deep Teal) */}
              <div className="flex flex-col p-5 rounded-xl border border-accent/20 bg-accent/5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold ring-1 ring-accent/20">2</div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-accent">Competency Focus</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="competencyGoal" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Goal</Label>
                    <Input
                      id="competencyGoal"
                      placeholder="e.g., Sleep Schedule"
                      value={formData.competencyGoal || ""}
                      onChange={(e) => setFormData({ ...formData, competencyGoal: e.target.value })}
                      className="bg-input-bg font-serif text-lg font-medium"
                    />
                  </div>
                  <div>
                    <Label htmlFor="competencyType" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Type</Label>
                    <Select
                      value={formData.competencyType || "PERSONAL"}
                      onValueChange={(v) => setFormData({ ...formData, competencyType: v as "PROFESSIONAL" | "PERSONAL" })}
                    >
                      <SelectTrigger className="bg-input-bg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERSONAL">Personal (Life/Home Skills)</SelectItem>
                        <SelectItem value="PROFESSIONAL">Professional (Career/Work Skills)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label htmlFor="competencyScripture" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Scripture Reference</Label>
                        <Input
                        id="competencyScripture"
                        placeholder="e.g., 1 Corinthians 14:40"
                        value={formData.competencyScripture || ""}
                        onChange={(e) => setFormData({ ...formData, competencyScripture: e.target.value })}
                        className={cn("bg-input-bg", verseErrors.competencyScripture && "border-destructive focus-visible:ring-destructive")}
                        />
                        {verseErrors.competencyScripture && (
                          <p className="text-xs text-destructive mt-1">{verseErrors.competencyScripture}</p>
                        )}
                    </div>
                    <div>
                        <Label htmlFor="competencyAction" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Observable Action</Label>
                        <Input
                        id="competencyAction"
                        placeholder="e.g., Having a schedule"
                        value={formData.competencyAction || ""}
                        onChange={(e) => setFormData({ ...formData, competencyAction: e.target.value })}
                        className="bg-input-bg"
                        />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-accent/10">
                  Biblical Basis: <BibleVerse reference="2 Thessalonians 3:10" /> — &ldquo;If anyone is not willing to work...&rdquo;
                </p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
                {/* Blessings Form - Success (Green) */}
                <div className="flex flex-col p-5 rounded-xl border border-success/20 bg-success/5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-success/10 text-success text-xs font-bold ring-1 ring-success/20">3</div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-success">Blessings</h3>
                </div>
                
                <div>
                    <Label htmlFor="blessingsPlan" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">How will we celebrate obedience?</Label>
                    <Textarea
                    id="blessingsPlan"
                    placeholder="e.g., Telling him he did great and our sanity"
                    value={formData.blessingsPlan || ""}
                    onChange={(e) => setFormData({ ...formData, blessingsPlan: e.target.value })}
                    rows={3}
                    className="bg-input-bg resize-none"
                    />
                </div>
                <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-success/10">
                    Biblical Basis: <BibleVerse reference="Ephesians 6:2-3" /> — &ldquo;Honor your father and mother...&rdquo;
                </p>
                </div>

                {/* Consequences Form - Destructive (Red) */}
                <div className="flex flex-col p-5 rounded-xl border border-destructive/20 bg-destructive/5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-destructive/10 text-destructive text-xs font-bold ring-1 ring-destructive/20">4</div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-destructive">Consequences</h3>
                </div>
                
                <div>
                    <Label htmlFor="consequencesPlan" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Response to rebellion?</Label>
                    <Textarea
                    id="consequencesPlan"
                    placeholder="e.g., Firm No"
                    value={formData.consequencesPlan || ""}
                    onChange={(e) => setFormData({ ...formData, consequencesPlan: e.target.value })}
                    rows={3}
                    className="bg-input-bg resize-none"
                    />
                </div>
                <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-destructive/10">
                    Biblical Basis: <BibleVerse reference="Galatians 6:7" />; <BibleVerse reference="Proverbs 22:15" /> — Age-appropriate response.
                </p>
                </div>
            </div>

            {/* Theme Verse */}
            <div className="p-5 rounded-xl border bg-card/50 space-y-3">
              <Label htmlFor="themeVerse" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <ScrollText className="h-4 w-4" />
                Theme Verse Reference (Optional)
              </Label>
              <Input
                id="themeVerse"
                placeholder="e.g., Proverbs 22:6"
                value={formData.themeVerse || ""}
                onChange={(e) => setFormData({ ...formData, themeVerse: e.target.value })}
                className={cn("bg-input-bg", verseErrors.themeVerse && "border-destructive focus-visible:ring-destructive")}
              />
              {verseErrors.themeVerse && (
                <p className="text-xs text-destructive mt-1">{verseErrors.themeVerse}</p>
              )}
            </div>

            {/* Save/Cancel */}
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={mutation.isPending || !formData.characterGoal || !formData.competencyGoal || hasErrors} className="w-full sm:w-auto">
                  <Save className="h-4 w-4 mr-2" />
                  {mutation.isPending ? "Saving..." : "Save Plan"}
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
              </div>
              {mutation.isError && (
                <p className="text-sm text-destructive">
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : "Failed to save plan. Please try again."}
                </p>
              )}
            </div>
          </div>
        ) : currentPlan ? (
          // Display current plan
          <div className="space-y-4">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Character Focus - Primary (Deep Blue) */}
              <div className="flex flex-col h-full p-5 rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold ring-1 ring-primary/20">1</div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Character Focus</span>
                </div>
                <div className="space-y-2">
                  <p className="text-xl font-serif font-bold text-foreground">{currentPlan.characterGoal}</p>
                  {currentPlan.characterScripture && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <BookOpen className="h-4 w-4 mt-0.5 shrink-0" />
                      <BibleVerse reference={currentPlan.characterScripture} />
                    </div>
                  )}
                  {currentPlan.characterAction && (
                    <p className="text-sm border-t border-primary/10 pt-2 mt-2">{currentPlan.characterAction}</p>
                  )}
                </div>
              </div>

              {/* Competency Focus - Accent (Deep Teal) */}
              <div className="flex flex-col h-full p-5 rounded-xl border border-accent/20 bg-accent/5 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold ring-1 ring-accent/20">2</div>
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">Competency Focus</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-accent/20 text-accent/80">
                    {currentPlan.competencyType === "PERSONAL" ? "Personal" : "Professional"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-xl font-serif font-bold text-foreground">{currentPlan.competencyGoal}</p>
                  {currentPlan.competencyScripture && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <BookOpen className="h-4 w-4 mt-0.5 shrink-0" />
                      <BibleVerse reference={currentPlan.competencyScripture} />
                    </div>
                  )}
                  {currentPlan.competencyAction && (
                    <p className="text-sm border-t border-accent/10 pt-2 mt-2">{currentPlan.competencyAction}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Blessings - Success (Green) */}
              {currentPlan.blessingsPlan && (
                <div className="flex flex-col h-full p-5 rounded-xl border border-success/20 bg-success/5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-success/10 text-success text-xs font-bold ring-1 ring-success/20">3</div>
                    <span className="text-xs font-bold uppercase tracking-wider text-success">Blessings</span>
                  </div>
                  <p className="text-sm leading-relaxed">{currentPlan.blessingsPlan}</p>
                </div>
              )}

              {/* Consequences - Destructive (Red) or Warning (Gold)? Using Destructive/Orange for correction */}
              {currentPlan.consequencesPlan && (
                <div className="flex flex-col h-full p-5 rounded-xl border border-destructive/20 bg-destructive/5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-destructive/10 text-destructive text-xs font-bold ring-1 ring-destructive/20">4</div>
                    <span className="text-xs font-bold uppercase tracking-wider text-destructive">Consequences</span>
                  </div>
                  <p className="text-sm leading-relaxed">{currentPlan.consequencesPlan}</p>
                </div>
              )}
            </div>

            {currentPlan.themeVerse && (
              <div className="p-6 rounded-xl bg-card border shadow-sm">
                <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                  <BookOpen className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Theme Verse</span>
                </div>
                <div className="pl-4 border-l-2 border-primary/30">
                  <BibleVerse reference={currentPlan.themeVerse} />
                </div>
              </div>
            )}
          </div>
        ) : previousYearPlan ? (
          // No plan yet for current year - show previous year for review
          <div className="space-y-4">
            {/* Prompt to review */}
            <div className="p-4 rounded-lg border border-accent/30 bg-accent/5">
              <p className="text-sm font-medium text-foreground mb-1">
                Time to review your plan for {currentYear}
              </p>
              <p className="text-sm text-muted-foreground">
                Here&apos;s what you focused on in {previousYearPlan.year}. Review and adjust as needed for the new year.
              </p>
              <Button variant="default" className="mt-3" onClick={startEditing}>
                Review &amp; Update Plan
              </Button>
            </div>

            {/* Show previous year's content as reference */}
            <div className="opacity-75">
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <History className="h-3 w-3" />
                From {previousYearPlan.year}:
              </p>

              <div className="grid gap-6 sm:grid-cols-2">
                {/* Character Focus - Primary (Deep Blue) */}
                <div className="flex flex-col h-full p-5 rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold ring-1 ring-primary/20">1</div>
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Character Focus</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-serif font-bold text-foreground">{previousYearPlan.characterGoal}</p>
                    {previousYearPlan.characterScripture && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <BookOpen className="h-4 w-4 mt-0.5 shrink-0" />
                        <BibleVerse reference={previousYearPlan.characterScripture} />
                      </div>
                    )}
                    {previousYearPlan.characterAction && (
                      <p className="text-sm border-t border-primary/10 pt-2 mt-2">{previousYearPlan.characterAction}</p>
                    )}
                  </div>
                </div>

                {/* Competency Focus - Accent (Deep Teal) */}
                <div className="flex flex-col h-full p-5 rounded-xl border border-accent/20 bg-accent/5 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold ring-1 ring-accent/20">2</div>
                      <span className="text-xs font-bold uppercase tracking-wider text-accent">Competency Focus</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-accent/20 text-accent/80">
                      {previousYearPlan.competencyType === "PERSONAL" ? "Personal" : "Professional"}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-serif font-bold text-foreground">{previousYearPlan.competencyGoal}</p>
                    {previousYearPlan.competencyScripture && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <BookOpen className="h-4 w-4 mt-0.5 shrink-0" />
                        <BibleVerse reference={previousYearPlan.competencyScripture} />
                      </div>
                    )}
                    {previousYearPlan.competencyAction && (
                      <p className="text-sm border-t border-accent/10 pt-2 mt-2">{previousYearPlan.competencyAction}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 mt-4">
                {previousYearPlan.blessingsPlan && (
                  <div className="p-3 rounded-lg border border-success/20 bg-success/5">
                    <span className="text-xs font-medium text-muted-foreground">Blessings</span>
                    <p className="text-sm mt-1">{previousYearPlan.blessingsPlan}</p>
                  </div>
                )}
                {previousYearPlan.consequencesPlan && (
                  <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                    <span className="text-xs font-medium text-muted-foreground">Consequences</span>
                    <p className="text-sm mt-1">{previousYearPlan.consequencesPlan}</p>
                  </div>
                )}
              </div>

              {previousYearPlan.themeVerse && (
                <div className="mt-4 p-3 rounded-lg border bg-muted/20">
                  <span className="text-xs font-medium text-muted-foreground">Theme Verse: </span>
                  <BibleVerse reference={previousYearPlan.themeVerse} />
                </div>
              )}
            </div>
          </div>
        ) : (
          // No plan yet - true empty state (no previous year either)
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="mb-2">No annual plan set for {currentYear}.</p>
            <p className="text-sm max-w-md mx-auto mb-4">
              We encourage you to set aside 20–40 minutes with your spouse to prayerfully discuss
              and create this plan together. Unity in parenting goals is a powerful blessing for your child.
            </p>
            <Button variant="outline" className="mt-2" onClick={startEditing}>
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </div>
        )}

        {/* History section */}
        {pastPlans.length > 0 && (
          <Collapsible open={showHistory} onOpenChange={setShowHistory}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  View History ({pastPlans.length} past {pastPlans.length === 1 ? "year" : "years"})
                </span>
                {showHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-4">
              {pastPlans.map((plan) => (
                <div key={plan.id} className="p-4 rounded-lg bg-muted/30 border">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="secondary">{plan.year}</Badge>
                    <span className="text-xs text-muted-foreground">Read-only</span>
                  </div>
                  <div className="grid gap-2 text-sm">
                    <p><strong>Character:</strong> {plan.characterGoal}</p>
                    <p><strong>Competency:</strong> {plan.competencyGoal}</p>
                    {plan.themeVerse && <p className="italic text-muted-foreground">{plan.themeVerse}</p>}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
