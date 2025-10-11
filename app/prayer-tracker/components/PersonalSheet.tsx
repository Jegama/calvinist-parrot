"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PersonalSheetState } from "../types";

type PersonalSheetProps = {
  isOpen: boolean;
  sheetState: PersonalSheetState;
  isLoading: boolean;
  error: string | null;
  answeringPersonalId: string | null;
  onOpenChange: (open: boolean) => void;
  onUpdate: (changes: Partial<PersonalSheetState>) => void;
  onSave: () => void;
  onMarkAnswered: () => void;
  onDelete: () => void;
};

export function PersonalSheet({
  isOpen,
  sheetState,
  isLoading,
  error,
  answeringPersonalId,
  onOpenChange,
  onUpdate,
  onSave,
  onMarkAnswered,
  onDelete,
}: PersonalSheetProps) {
  const isAnswered = sheetState.status === "ANSWERED";
  const isMarking = answeringPersonalId === sheetState.id;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit request</SheetTitle>
          <SheetDescription>Update or celebrate answered prayer for your family.</SheetDescription>
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
