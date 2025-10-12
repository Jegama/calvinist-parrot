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
import { useEffect, useMemo, useState } from "react";
import { formatRelative } from "../utils";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { ARCHIVED_CATEGORY } from "../constants";

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
  // Pagination state
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const total = filteredFamilies.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    // Reset to first page when filter changes or list size shrinks below current window
    setPage(1);
  }, [categoryFilter]);

  const pagedFamilies = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredFamilies.slice(start, start + PAGE_SIZE);
  }, [filteredFamilies, page]);

  const canPrev = page > 1;
  const canNext = page < totalPages;
  const selectableCategories = useMemo(
    () => categories.filter((category) => category !== ARCHIVED_CATEGORY),
    [categories]
  );
  const showArchiveMetadata = categoryFilter === ARCHIVED_CATEGORY;

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
                  {selectableCategories.map((category) => (
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
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {Math.min((page - 1) * PAGE_SIZE + 1, total)}-
                {Math.min(page * PAGE_SIZE, total)} of {total}
                {categoryFilter !== "all" ? ` in ${categoryFilter}` : ""}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(1)}
                  disabled={!canPrev}
                  aria-label="Go to first page"
                >
                  <ChevronFirst className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                  aria-label="Go to previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="px-1">Page {page} / {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={!canNext}
                  aria-label="Go to next page"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(totalPages)}
                  disabled={!canNext}
                  aria-label="Go to last page"
                >
                  <ChevronLast className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {pagedFamilies.map((family) => (
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
                    {Array.isArray(family.children) && family.children.length > 0 && (
                      <p>Children: {family.children.join(", ")}</p>
                    )}
                    {showArchiveMetadata && family.archivedAt ? (
                      <p>Archived: {formatRelative(family.archivedAt)}</p>
                    ) : (
                      <p>
                        Last prayed: {formatRelative(family.lastPrayedAt)}
                        {family.lastPrayedBy?.displayName ? ` - by ${family.lastPrayedBy.displayName}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Duplicate controls at bottom for convenience */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {Math.min((page - 1) * PAGE_SIZE + 1, total)}-
                {Math.min(page * PAGE_SIZE, total)} of {total}
                {categoryFilter !== "all" ? ` in ${categoryFilter}` : ""}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(1)}
                  disabled={!canPrev}
                  aria-label="Go to first page"
                >
                  <ChevronFirst className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                  aria-label="Go to previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="px-1">Page {page} / {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={!canNext}
                  aria-label="Go to next page"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(totalPages)}
                  disabled={!canNext}
                  aria-label="Go to last page"
                >
                  <ChevronLast className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
