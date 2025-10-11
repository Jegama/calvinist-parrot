"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Family, NewFamilyFormState } from "../types";
import { formatRelative } from "../utils";

const joinClassNames = (base: string, extra?: string) => {
  if (!extra) return base;
  return [base, extra].filter(Boolean).join(" ");
};

type FamilySectionProps = {
  className?: string;
  newFamily: NewFamilyFormState;
  familyFormError: string | null;
  categories: string[];
  categoryFilter: string;
  filteredFamilies: Family[];
  onNewFamilyChange: (changes: Partial<NewFamilyFormState>) => void;
  onCreateFamily: () => void;
  onCategoryFilterChange: (value: string) => void;
  onEditFamily: (family: Family) => void;
};

export function FamilySection({
  className,
  newFamily,
  familyFormError,
  categories,
  categoryFilter,
  filteredFamilies,
  onNewFamilyChange,
  onCreateFamily,
  onCategoryFilterChange,
  onEditFamily,
}: FamilySectionProps) {
  return (
    <Card className={joinClassNames("", className)}>
      <CardHeader>
        <CardTitle>Family Cards</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Add a new family</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Family name"
              value={newFamily.familyName}
              onChange={(event) => onNewFamilyChange({ familyName: event.target.value })}
            />
            <Input
              placeholder="Parents"
              value={newFamily.parents}
              onChange={(event) => onNewFamilyChange({ parents: event.target.value })}
            />
            <Input
              placeholder="Children (comma-separated)"
              value={newFamily.children}
              onChange={(event) => onNewFamilyChange({ children: event.target.value })}
            />
            <div className="space-y-2">
              <Select
                value={newFamily.categorySelect}
                onValueChange={(value) =>
                  onNewFamilyChange({
                    categorySelect: value,
                    customCategory: value === "__custom" ? newFamily.customCategory : "",
                  })
                }
              >
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
              {newFamily.categorySelect === "__custom" && (
                <Input
                  placeholder="New category name"
                  value={newFamily.customCategory}
                  onChange={(event) => onNewFamilyChange({ customCategory: event.target.value })}
                />
              )}
            </div>
          </div>
          {familyFormError && <p className="text-xs text-destructive">{familyFormError}</p>}
          <Button onClick={onCreateFamily} className="w-full md:w-auto">
            Add Family
          </Button>
        </div>

        <Separator />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Current families</h3>
          <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
            <SelectTrigger className="w-full md:w-[220px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredFamilies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a family card to get started.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredFamilies.map((family) => (
              <div key={family.id} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-semibold">{family.familyName}</h4>
                    {family.categoryTag && (
                      <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                        {family.categoryTag}
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onEditFamily(family)}>
                    Edit
                  </Button>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {family.parents && <p>Parents: {family.parents}</p>}
                  {family.children.length > 0 && <p>Children: {family.children.join(", ")}</p>}
                  <p>Last prayed: {formatRelative(family.lastPrayedAt)} - by {family.lastPrayedBy?.displayName ?? "Unknown"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
