"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { BibleVerse } from "@/components/BibleVerse";
import { Rotation, Member } from "../types";
import { formatRelative, formatTimeSince } from "../utils";

// Member color assignments for visual grouping
// Using brand colors: Warm Gold, Deep Teal, Royal Purple, Sage Green, Mint Green
const MEMBER_COLORS = [
  "hsl(var(--chart-1))", // Warm Gold - Gospel clarity and joy
  "hsl(var(--chart-2))", // Deep Teal - Trust and theological depth
  "hsl(var(--chart-3))", // Royal Purple - Dignity and wisdom
  "hsl(var(--chart-4))", // Sage Green - Growth and peace
  "hsl(var(--chart-5))", // Mint Green - Refreshing and modern
];

const getMemberColor = (memberId: string, members: Member[]): string => {
  const index = members.findIndex((m) => m.id === memberId);
  return index >= 0 ? MEMBER_COLORS[index % MEMBER_COLORS.length] : "transparent";
};

type RotationCardProps = {
  rotation: Rotation | null;
  members: Member[];
  familyAssignments: Record<string, string>;
  personalSelections: Record<string, boolean>;
  isConfirming: boolean;
  hasSelections: boolean;
  onFamilyAssignmentChange: (familyId: string, value: string) => void;
  onPersonalSelectionChange: (requestId: string, value: boolean) => void;
  onCancelRotation: () => void;
  onConfirmRotation: () => void;
};

export function RotationCard({
  rotation,
  members,
  familyAssignments,
  personalSelections,
  isConfirming,
  hasSelections,
  onFamilyAssignmentChange,
  onPersonalSelectionChange,
  onCancelRotation,
  onConfirmRotation,
}: RotationCardProps) {
  // Check if user has other household members (assuming current user is always 1)
  const hasHouseholdMembers = members.length > 1;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-serif">Tonight&apos;s Rotation</CardTitle>
        {/* Hide description in active mode to save mobile space and reduce cognitive load */}
        {!rotation && (
          <CardDescription>
            We use this rotation to ensure every household is lifted before the Lord on a regular basis, keeping our prayers intentional (<BibleVerse reference="Deuteronomy 6:6-7" />; <BibleVerse reference="Psalm 78:4-7" />).
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Helper layout for empty state */}
        {!rotation && (
          <div className="space-y-3 rounded-2xl border border-primary/10 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              Tap <strong>Prepare Tonight&apos;s Rotation</strong> above to bring forward families and requests for this evening.
            </p>
          </div>
        )}

        {!rotation ? (
          // Conditional instruction: only prompt to invite if they are alone
          !hasHouseholdMembers && (
            <p className="text-sm text-muted-foreground italic">
              Tip: Family worship is sweeter together. Invite your spouse or household members from the Profile page to share the load.
            </p>
          )
        ) : (
          <>
            <div className="space-y-4">
              {/* Simplified header for active state */}
              <div className="space-y-1">
                <h3 className="text-lg font-serif font-medium text-foreground">Family Intercession</h3>
                <p className="text-sm text-muted-foreground">Confirm the assignments below, then mark as prayed when you finish.</p>
              </div>
              {rotation.families.length === 0 ? (
                <p className="text-sm text-muted-foreground">You don&apos;t have any family cards yet.</p>
              ) : (
                <div className="space-y-3">
                  {rotation.families.map((family) => {
                    const assignedMemberId = familyAssignments[family.id] ?? "skip";
                    const memberColor =
                      assignedMemberId !== "skip" ? getMemberColor(assignedMemberId, members) : undefined;

                    return (
                      <div
                        key={family.id}
                        className="rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
                        style={
                          memberColor
                            ? {
                              borderLeftColor: memberColor,
                              borderLeftWidth: 4,
                              borderLeftStyle: "solid",
                            }
                            : undefined
                        }
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-serif font-semibold">{family.familyName}</p>
                              {family.categoryTag && (
                                <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-xs font-medium">
                                  {family.categoryTag}
                                </span>
                              )}
                            </div>
                            {family.parents && (
                              <p className="text-sm text-muted-foreground">Parents: {family.parents}</p>
                            )}
                            {Array.isArray(family.children) && family.children.length > 0 && (
                              <p className="text-sm text-muted-foreground">Children: {family.children.join(", ")}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Last prayed: {formatRelative(family.lastPrayedAt)} ({formatTimeSince(family.lastPrayedAt)}
                              ){family.lastPrayedBy?.displayName && ` - by ${family.lastPrayedBy.displayName}`}
                            </p>
                            {family.requests && family.requests.length > 0 && (
                              <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                                <p className="text-xs font-semibold text-muted-foreground">
                                  Prayer requests for this family
                                </p>
                                {family.requests.map((req) => (
                                  <div key={req.id} className="space-y-1 rounded-md bg-background/80 p-2">
                                    <p className="text-sm font-medium">{req.requestText}</p>
                                    {req.notes && <p className="text-xs text-muted-foreground">{req.notes}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <Select
                            value={familyAssignments[family.id] ?? "skip"}
                            onValueChange={(value) => onFamilyAssignmentChange(family.id, value)}
                          >
                            <SelectTrigger className="w-full md:w-[220px]">
                              <SelectValue placeholder="Who is leading?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">Skip tonight</SelectItem>
                              {members.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.displayName} 🙏
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-serif font-medium text-foreground">Our Household Requests</h3>
                <p className="text-sm text-muted-foreground">Uncheck any petitions you wish to postpone.</p>
              </div>
              {rotation.personal.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active personal requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {rotation.personal.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/40"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={personalSelections[item.id] ?? false}
                        onChange={(event) => onPersonalSelectionChange(item.id, event.target.checked)}
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-serif font-semibold">{item.requestText}</p>
                        {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                        <p className="text-xs text-muted-foreground">
                          Added {formatRelative(item.dateAdded)} - Last prayed {formatTimeSince(item.lastPrayedAt)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t pt-4 md:flex-row md:items-center md:justify-end">
              <Button variant="outline" onClick={onCancelRotation} disabled={isConfirming}>
                Cancel
              </Button>
              <Button onClick={onConfirmRotation} disabled={isConfirming || !hasSelections}>
                {isConfirming ? "Saving..." : "Mark as Prayed"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
