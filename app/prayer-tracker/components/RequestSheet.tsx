"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PersonalSheetState, Family } from "../types";
import { useMemo } from "react";
import { formatRelative } from "../utils";

type RequestSheetProps = {
  isOpen: boolean;
  sheetState: PersonalSheetState;
  families: Family[];
  isLoading: boolean;
  error: string | null;
  answeringRequestId: string | null;
  onOpenChange: (open: boolean) => void;
  onUpdate: (changes: Partial<PersonalSheetState>) => void;
  onSave: () => void;
  onMarkAnswered: () => void;
  onDelete: () => void;
};

export function RequestSheet({
  isOpen,
  sheetState,
  families,
  isLoading,
  error,
  answeringRequestId,
  onOpenChange,
  onUpdate,
  onSave,
  onMarkAnswered,
  onDelete,
}: RequestSheetProps) {
  const isAnswered = sheetState.status === "ANSWERED";
  const isMarking = answeringRequestId === sheetState.id;

  // Group families by category for the dropdown
  const familiesByCategory = useMemo(() => {
    const grouped: Record<string, Family[]> = {};
    families.forEach((family) => {
      const category = family.categoryTag || "Uncategorized";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(family);
    });
    return grouped;
  }, [families]);

  const categoryKeys = useMemo(() => Object.keys(familiesByCategory).sort(), [familiesByCategory]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <SheetContent className="sm:max-w-lg bg-card">
        <SheetHeader>
          <SheetTitle>Edit request</SheetTitle>
          <SheetDescription>Update or celebrate answered prayer.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <Input
            placeholder="Request"
            value={sheetState.requestText}
            onChange={(event) => onUpdate({ requestText: event.target.value })}
          />
          <Textarea
            placeholder="Notes"
            value={sheetState.notes}
            onChange={(event) => onUpdate({ notes: event.target.value })}
          />
          <Select
            value={sheetState.linkedToFamily}
            onValueChange={(value) => onUpdate({ linkedToFamily: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Link to..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Your Household</SelectLabel>
                <SelectItem value="household">Our Family</SelectItem>
              </SelectGroup>
              {categoryKeys.map((category, index) => (
                <div key={category}>
                  {index > 0 && <SelectSeparator />}
                  <SelectGroup>
                    <SelectLabel>{category}</SelectLabel>
                    {familiesByCategory[category].map((family) => (
                      <SelectItem key={family.id} value={family.id}>
                        {family.familyName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </div>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="request-last-prayed">
              Last prayed on
            </label>
            <div className="flex gap-2">
              <Input
                id="request-last-prayed"
                type="date"
                value={sheetState.lastPrayedAt}
                onChange={(event) => onUpdate({ lastPrayedAt: event.target.value })}
                max="9999-12-31"
              />
              {sheetState.lastPrayedAt && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onUpdate({ lastPrayedAt: "" })}
                  disabled={isLoading}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Status: {isAnswered ? "Answered" : "Active"}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <SheetFooter className="mt-6 gap-2">
          <div className="flex flex-1 flex-wrap gap-2">
            {!isAnswered && (
              <Button
                type="button"
                variant="secondary"
                onClick={onMarkAnswered}
                disabled={isLoading || isMarking}
              >
                {isMarking ? "Saving..." : "Mark Answered"}
              </Button>
            )}
            <Button type="button" variant="destructive" onClick={onDelete} disabled={isLoading}>
              Delete
            </Button>
          </div>
          <div className="flex gap-2">
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={isLoading}>
                Cancel
              </Button>
            </SheetClose>
            <Button onClick={onSave} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
