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
      <CardContent className="space-y-6">
        {!rotation ? (
          <p className="text-sm text-muted-foreground">
            Generate a rotation to see suggested families and prayer requests for tonight.
          </p>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Families</h3>
                <span className="text-sm text-muted-foreground">
                  Select who will lead prayer for each family tonight.
                </span>
              </div>
              {rotation.families.length === 0 ? (
                <p className="text-sm text-muted-foreground">You don&apos;t have any family cards yet.</p>
              ) : (
                <div className="space-y-3">
                  {rotation.families.map((family) => (
                    <div key={family.id} className="rounded-lg border bg-card px-4 py-3 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{family.familyName}</p>
                            {family.categoryTag && (
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                                {family.categoryTag}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Last prayed: {formatRelative(family.lastPrayedAt)} - by {family.lastPrayedBy?.displayName ?? "Unknown"} - {formatTimeSince(family.lastPrayedAt)}
                          </p>
                        </div>
                        <Select
                          value={familyAssignments[family.id] ?? "skip"}
                          onValueChange={(value) => onFamilyAssignmentChange(family.id, value)}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Who is praying?" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip tonight</SelectItem>
                            {members.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Our Family Requests</h3>
                <span className="text-sm text-muted-foreground">
                  Deselect any requests you&apos;re postponing tonight.
                </span>
              </div>
              {rotation.personal.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active personal requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {rotation.personal.map((item) => (
                    <label key={item.id} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
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

            <div className="flex justify-end gap-2">
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
