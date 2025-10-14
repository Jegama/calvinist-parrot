"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
  const index = members.findIndex(m => m.id === memberId);
  return index >= 0 ? MEMBER_COLORS[index % MEMBER_COLORS.length] : "transparent";
};

const getMemberName = (memberId: string, members: Member[]): string | null => {
  const member = members.find(m => m.id === memberId);
  return member?.displayName || null;
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tonight&apos;s Rotation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-0 md:px-6">
        <p className="text-sm text-muted-foreground px-4 md:px-0">
          We lean on this rotation during family worship, keeping our prayers intentional and making
          sure each household we love is lifted before the Lord together (Deuteronomy 6:6-7; Psalm 78:4-7).
        </p>
        {!rotation ? (
          <p className="text-sm text-muted-foreground px-4 md:px-0">
            Generate a rotation to see suggested families and prayer requests for tonight.
          </p>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-4 md:px-0">
                <h3 className="text-lg font-semibold">Families</h3>
                <span className="text-sm text-muted-foreground">
                  Select who will lead prayer for each family tonight.
                </span>
              </div>
              {rotation.families.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 md:px-0">You don&apos;t have any family cards yet.</p>
              ) : (
                <div className="space-y-3">
                  {rotation.families.map((family) => {
                    const assignedMemberId = familyAssignments[family.id] ?? "skip";
                    const memberColor = assignedMemberId !== "skip" 
                      ? getMemberColor(assignedMemberId, members) 
                      : "transparent";
                    const memberName = assignedMemberId !== "skip" 
                      ? getMemberName(assignedMemberId, members) 
                      : null;
                    
                    return (
                      <div 
                        key={family.id} 
                        className="rounded-none md:rounded-lg border-x-0 md:border-x bg-card px-4 py-3 shadow-sm"
                        style={{ borderLeftWidth: "4px", borderLeftColor: memberColor }}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-base font-semibold">{family.familyName}</p>
                              {family.categoryTag && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
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
                              Last prayed: {formatRelative(family.lastPrayedAt)} ({formatTimeSince(family.lastPrayedAt)})
                              {family.lastPrayedBy?.displayName && ` - by ${family.lastPrayedBy.displayName}`}
                            </p>
                          </div>
                          <Select
                            value={familyAssignments[family.id] ?? "skip"}
                            onValueChange={(value) => onFamilyAssignmentChange(family.id, value)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Who will pray tonight?" />
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
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-4 md:px-0">
                <h3 className="text-lg font-semibold">Our Family Requests</h3>
                <span className="text-sm text-muted-foreground">
                  Deselect any requests you&apos;re postponing tonight.
                </span>
              </div>
              {rotation.personal.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 md:px-0">No active personal requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {rotation.personal.map((item) => (
                    <label key={item.id} className="flex items-start gap-3 rounded-none md:rounded-lg border-x-0 md:border-x bg-card px-4 py-3 shadow-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={personalSelections[item.id] ?? false}
                        onChange={(event) => onPersonalSelectionChange(item.id, event.target.checked)}
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{item.requestText}</p>
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

            <div className="flex justify-end gap-2 px-4 md:px-0">
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
