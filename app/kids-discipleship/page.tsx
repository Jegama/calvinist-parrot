// app/kids-discipleship/page.tsx
// Heritage Journal - Kids Discipleship main page with child tabs
"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ProtectedView } from "@/components/ProtectedView";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Baby,
  BookOpen,
  Users,
} from "lucide-react";
import { formatAge, getAgeBracket, AGE_BRACKET_CONFIG } from "@/utils/ageUtils";
import { AnnualPlanSection } from "./components/AnnualPlanSection";
import { MonthlyVisionSection } from "./components/MonthlyVisionSection";
import { LogsSection } from "./components/LogsSection";
import { MonthlyReviewSection } from "./components/MonthlyReviewSection";
import { PrayerFocusSection } from "./components/PrayerFocusSection";
import Link from "next/link";

// Types
interface ChildMember {
  id: string;
  displayName: string;
  birthdate: string | null;
  isChild: boolean;
}

interface SpaceData {
  id: string;
  spaceName: string;
  members: ChildMember[];
}

interface HouseholdResponse {
  space: SpaceData | null;
  membership: unknown;
}

// API functions
async function fetchHousehold(userId: string): Promise<HouseholdResponse | null> {
  const res = await fetch(`/api/prayer-tracker/spaces?userId=${userId}`);
  if (!res.ok) return null;
  return res.json();
}

export default function KidsDiscipleshipPage() {
  const { user } = useAuth();
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [scrollToAnnualPlan, setScrollToAnnualPlan] = useState(false);

  // Fetch household data with children
  const { data: householdData, isLoading: householdLoading } = useQuery({
    queryKey: ["kids-discipleship", "household", user?.$id],
    queryFn: () => fetchHousehold(user!.$id),
    enabled: !!user?.$id,
    staleTime: 1000 * 60 * 5,
  });

  // Filter to only children - memoize to avoid useEffect dependency issues
  const children = useMemo(
    () => householdData?.space?.members?.filter((m) => m.isChild) || [],
    [householdData?.space?.members]
  );

  // Handle child selection
  const handleChildSelect = (childId: string) => {
    setActiveChildId(childId);
  };

  // Get the active child or default to first
  const currentChildId = activeChildId || children[0]?.id;

  // Get age bracket info for active child
  const getChildBracketInfo = (child: ChildMember) => {
    if (!child.birthdate) return null;
    const bracket = getAgeBracket(child.birthdate);
    if (!bracket) return null;
    return AGE_BRACKET_CONFIG[bracket];
  };

  // Handler for "Create Next Year Plan" from PrayerFocusSection
  const handleCreateNextYearPlan = () => {
    setScrollToAnnualPlan(true);
    // The AnnualPlanSection will handle scrolling and opening edit mode
    // when it detects the scrollToAnnualPlan prop
  };

  return (
    <ProtectedView>
      <div className="container mx-auto px-4 sm:px-6 py-8 min-h-[calc(100vh-var(--app-header-height))]">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2">
                Heritage Journal
              </h1>
              <p className="text-muted-foreground">
                Building faith with your children
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/kids-discipleship/framework">View our Plan of Discipleship Framework</Link>
            </Button>
          </div>
        </header>

        {/* Loading state */}
        {householdLoading && (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {/* No household */}
        {!householdLoading && !householdData?.space && (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Household Found</h2>
              <p className="text-muted-foreground mb-4">
                Create a household in Prayer Tracker to start tracking your
                children&apos;s discipleship.
              </p>
              <Link href="/prayer-tracker">
                <Button>Go to Prayer Tracker</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* No children */}
        {!householdLoading && householdData?.space && children.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Baby className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Children Added</h2>
              <p className="text-muted-foreground mb-4">
                Add children to your household in Prayer Tracker to start using
                Heritage Journal.
              </p>
              <Link href="/prayer-tracker">
                <Button>Add Children in Prayer Tracker</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Main content with child tabs */}
        {!householdLoading && children.length > 0 && (
          <Tabs
            value={currentChildId || undefined}
            onValueChange={handleChildSelect}
            className="space-y-6"
          >
            {/* Child tabs */}
            <TabsList className="flex flex-wrap h-auto gap-2 bg-muted/50 p-2">
              {children.map((child) => {
                const bracketInfo = getChildBracketInfo(child);
                return (
                  <TabsTrigger
                    key={child.id}
                    value={child.id}
                    className="flex flex-col items-start gap-1 px-4 py-3 h-auto data-[state=active]:bg-background"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{child.displayName}</span>
                      {child.birthdate && (
                        <span className="text-xs text-muted-foreground">
                          {formatAge(child.birthdate)}
                        </span>
                      )}
                    </div>
                    {bracketInfo && (
                      <Badge variant="secondary" className="text-xs">
                        {bracketInfo.label}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Content for each child */}
            {children.map((child) => (
              <TabsContent key={child.id} value={child.id} className="space-y-8">
                {/* Age bracket guidance */}
                {child.birthdate && getAgeBracket(child.birthdate) && (
                  <Alert>
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{AGE_BRACKET_CONFIG[getAgeBracket(child.birthdate)!].label}:</strong>{" "}
                        {AGE_BRACKET_CONFIG[getAgeBracket(child.birthdate)!].description}
                      </AlertDescription>
                    </div>
                  </Alert>
                )}

                {/* Section A: Annual Plan */}
                <AnnualPlanSection
                  userId={user!.$id}
                  memberId={child.id}
                  childName={child.displayName}
                  scrollToAndEdit={scrollToAnnualPlan}
                  onScrollHandled={() => setScrollToAnnualPlan(false)}
                />

                {/* Section B: Monthly Vision */}
                <MonthlyVisionSection
                  userId={user!.$id}
                  memberId={child.id}
                  childName={child.displayName}
                  childBirthdate={child.birthdate}
                />

                {/* Section C: Nurture & Admonition Log */}
                <LogsSection
                  userId={user!.$id}
                  memberId={child.id}
                  childName={child.displayName}
                />

                {/* Section D: Monthly Review Dashboard */}
                <MonthlyReviewSection
                  userId={user!.$id}
                  memberId={child.id}
                  childName={child.displayName}
                />

                {/* Section E: Prayer Focus */}
                <PrayerFocusSection
                  userId={user!.$id}
                  memberId={child.id}
                  childName={child.displayName}
                  childBirthdate={child.birthdate}
                  onCreateNextYearPlan={handleCreateNextYearPlan}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </ProtectedView>
  );
}
