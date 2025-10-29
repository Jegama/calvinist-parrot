"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { ARCHIVED_CATEGORY } from "../constants";
import { FamilySheetState } from "../types";
import { formatRelative } from "../utils";

type FamilySheetProps = {
  isOpen: boolean;
  categories: string[];
  sheetState: FamilySheetState;
  isLoading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onUpdate: (changes: Partial<FamilySheetState>) => void;
  onSave: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

export function FamilySheet({
  isOpen,
  categories,
  sheetState,
  isLoading,
  error,
  onOpenChange,
  onUpdate,
  onSave,
  onArchive,
  onRestore,
  onDelete,
}: FamilySheetProps) {
  const handleCategoryChange = (value: string) => {
    onUpdate({
      categorySelect: value,
      customCategory: value === "__custom" ? sheetState.customCategory : "",
    });
  };

  const categoryOptions = useMemo(() => {
    if (sheetState.categorySelect === ARCHIVED_CATEGORY) return categories;
    return categories.filter((category) => category !== ARCHIVED_CATEGORY);
  }, [categories, sheetState.categorySelect]);

  const showRestore = Boolean(sheetState.archivedAt);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg bg-card">
        <SheetHeader>
          <SheetTitle>Edit family</SheetTitle>
          <SheetDescription>
            {showRestore
              ? "This family is archived. Update details or restore it back to active cards."
              : "Update details or archive this family card."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <Input
            placeholder="Family name"
            value={sheetState.familyName}
            onChange={(event) => onUpdate({ familyName: event.target.value })}
          />
          <Input
            placeholder="Parents"
            value={sheetState.parents}
            onChange={(event) => onUpdate({ parents: event.target.value })}
          />
          <Input
            placeholder="Children (comma-separated)"
            value={sheetState.children}
            onChange={(event) => onUpdate({ children: event.target.value })}
          />
          <div className="space-y-2">
            <Select value={sheetState.categorySelect} onValueChange={handleCategoryChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
                <SelectItem value="__custom">Add new category...</SelectItem>
              </SelectContent>
            </Select>
            {sheetState.categorySelect === "__custom" && (
              <Input
                placeholder="New category name"
                value={sheetState.customCategory}
                onChange={(event) => onUpdate({ customCategory: event.target.value })}
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="family-last-prayed">
              Last prayed on
            </label>
            <div className="flex gap-2">
              <Input
                id="family-last-prayed"
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
          {sheetState.archivedAt && (
            <p className="text-xs text-muted-foreground">
              Archived on {formatRelative(sheetState.archivedAt)}
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <SheetFooter className="mt-6 gap-2">
          <div className="flex flex-1 flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onArchive}
              disabled={isLoading || showRestore}
            >
              Archive
            </Button>
            {showRestore && (
              <Button type="button" variant="outline" onClick={onRestore} disabled={isLoading}>
                Restore
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
