// app/kids-discipleship/components/AnnualPlanSection.tsx
// Section A: Annual Plan — The Four Elements
"use client";

import { useState, useRef } from "react";
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
import { Target, ChevronDown, ChevronRight, History, Plus, Save, BookOpen } from "lucide-react";

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
      setIsEditing(false);
    },
  });

  const startEditing = () => {
    setFormData(currentPlan || {});
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
            {/* Character Focus */}
            <div className="space-y-3 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">1</Badge>
                <h3 className="font-semibold">Character Focus (Christ-likeness)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Biblical Basis: 2 Peter 1:5-7 — &quot;Add to your faith virtue...&quot;
              </p>
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="characterGoal">Goal</Label>
                  <Input
                    id="characterGoal"
                    placeholder="e.g., Submission, Patience, Self-control"
                    value={formData.characterGoal || ""}
                    onChange={(e) => setFormData({ ...formData, characterGoal: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="characterScripture">Scripture Tag</Label>
                  <Input
                    id="characterScripture"
                    placeholder="e.g., Ephesians 6:1"
                    value={formData.characterScripture || ""}
                    onChange={(e) => setFormData({ ...formData, characterScripture: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="characterAction">Observable Action</Label>
                  <Input
                    id="characterAction"
                    placeholder="e.g., Responding to 'No' without whining"
                    value={formData.characterAction || ""}
                    onChange={(e) => setFormData({ ...formData, characterAction: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Competency Focus */}
            <div className="space-y-3 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">2</Badge>
                <h3 className="font-semibold">Competency Focus (Life Skills)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Biblical Basis: 2 Thessalonians 3:10-12 — &quot;If anyone is not willing to work, let him not eat.&quot;
              </p>
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="competencyGoal">Goal</Label>
                  <Input
                    id="competencyGoal"
                    placeholder="e.g., Sleep Schedule, Gentle Hands"
                    value={formData.competencyGoal || ""}
                    onChange={(e) => setFormData({ ...formData, competencyGoal: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="competencyType">Type</Label>
                  <Select
                    value={formData.competencyType || "PERSONAL"}
                    onValueChange={(v) => setFormData({ ...formData, competencyType: v as "PROFESSIONAL" | "PERSONAL" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSONAL">Personal (Life/Home Skills)</SelectItem>
                      <SelectItem value="PROFESSIONAL">Professional (Career/Work Skills)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="competencyScripture">Scripture Tag</Label>
                  <Input
                    id="competencyScripture"
                    placeholder="e.g., 1 Corinthians 14:40"
                    value={formData.competencyScripture || ""}
                    onChange={(e) => setFormData({ ...formData, competencyScripture: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="competencyAction">Observable Action</Label>
                  <Input
                    id="competencyAction"
                    placeholder="e.g., Sleeping in own crib; not grabbing glasses"
                    value={formData.competencyAction || ""}
                    onChange={(e) => setFormData({ ...formData, competencyAction: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Blessings */}
            <div className="space-y-3 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">3</Badge>
                <h3 className="font-semibold">Blessings (The Harvest of Obedience)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Biblical Basis: Ephesians 6:2-3 — &quot;Honor your father and mother... that it may go well with you.&quot;
              </p>
              <div>
                <Label htmlFor="blessingsPlan">How will we celebrate obedience?</Label>
                <Textarea
                  id="blessingsPlan"
                  placeholder="e.g., Clapping, Puffs, Park Time, Extra stories"
                  value={formData.blessingsPlan || ""}
                  onChange={(e) => setFormData({ ...formData, blessingsPlan: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            {/* Consequences */}
            <div className="space-y-3 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">4</Badge>
                <h3 className="font-semibold">Consequences (The Harvest of Disobedience)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Biblical Basis: Galatians 6:7; Proverbs 22:15 — Age-appropriate and immediate.
              </p>
              <div>
                <Label htmlFor="consequencesPlan">What is the age-appropriate response to rebellion?</Label>
                <Textarea
                  id="consequencesPlan"
                  placeholder="e.g., Firm 'No', Redirection, Playpen Time"
                  value={formData.consequencesPlan || ""}
                  onChange={(e) => setFormData({ ...formData, consequencesPlan: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            {/* Theme Verse */}
            <div>
              <Label htmlFor="themeVerse">Theme Verse for the Year (Optional)</Label>
              <Input
                id="themeVerse"
                placeholder="e.g., Train up a child in the way he should go... (Proverbs 22:6)"
                value={formData.themeVerse || ""}
                onChange={(e) => setFormData({ ...formData, themeVerse: e.target.value })}
              />
            </div>

            {/* Save/Cancel */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={mutation.isPending || !formData.characterGoal || !formData.competencyGoal}>
                  <Save className="h-4 w-4 mr-2" />
                  {mutation.isPending ? "Saving..." : "Save Plan"}
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">1</Badge>
                  <span className="font-medium">Character Focus</span>
                </div>
                <p className="text-lg font-semibold text-accent">{currentPlan.characterGoal}</p>
                {currentPlan.characterScripture && (
                  <p className="text-sm text-muted-foreground mt-1">{currentPlan.characterScripture}</p>
                )}
                {currentPlan.characterAction && (
                  <p className="text-sm mt-2">{currentPlan.characterAction}</p>
                )}
              </div>

              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">2</Badge>
                  <span className="font-medium">Competency Focus</span>
                  <Badge variant="secondary" className="text-xs">
                    {currentPlan.competencyType === "PERSONAL" ? "Personal" : "Professional"}
                  </Badge>
                </div>
                <p className="text-lg font-semibold text-accent">{currentPlan.competencyGoal}</p>
                {currentPlan.competencyScripture && (
                  <p className="text-sm text-muted-foreground mt-1">{currentPlan.competencyScripture}</p>
                )}
                {currentPlan.competencyAction && (
                  <p className="text-sm mt-2">{currentPlan.competencyAction}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {currentPlan.blessingsPlan && (
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-green-100 dark:bg-green-900">3</Badge>
                    <span className="font-medium">Blessings</span>
                  </div>
                  <p className="text-sm">{currentPlan.blessingsPlan}</p>
                </div>
              )}

              {currentPlan.consequencesPlan && (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900">4</Badge>
                    <span className="font-medium">Consequences</span>
                  </div>
                  <p className="text-sm">{currentPlan.consequencesPlan}</p>
                </div>
              )}
            </div>

            {currentPlan.themeVerse && (
              <div className="p-4 rounded-lg border border-accent/20 bg-accent/5">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="h-4 w-4 text-accent" />
                  <span className="font-medium text-sm">Theme Verse</span>
                </div>
                <p className="text-sm italic">{currentPlan.themeVerse}</p>
              </div>
            )}
          </div>
        ) : (
          // No plan yet
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
