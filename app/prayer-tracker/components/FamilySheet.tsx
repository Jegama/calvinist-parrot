"use client";

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
import { FamilySheetState } from "../types";

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
  onDelete,
}: FamilySheetProps) {
  const handleCategoryChange = (value: string) => {
    onUpdate({
      categorySelect: value,
      customCategory: value === "__custom" ? sheetState.customCategory : "",
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit family</SheetTitle>
          <SheetDescription>Update details or archive this family card.</SheetDescription>
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
                {categories.map((category) => (
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
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <SheetFooter className="mt-6 gap-2">
          <div className="flex flex-1 flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={onArchive} disabled={isLoading}>
              Archive
            </Button>
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
