"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Family, NewFamilyFormState } from "../types";
import { useCallback, useMemo, useState } from "react";
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
  onViewFamilyDetail: (family: Family) => void;
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
  onViewFamilyDetail,
}: FamilySectionProps) {
  // Pagination state
  const PAGE_SIZE = 10;
  const [pagesByCategory, setPagesByCategory] = useState<Record<string, number>>({});
  const total = filteredFamilies.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activePage = pagesByCategory[categoryFilter] ?? 1;
  const currentPage = Math.min(activePage, totalPages);

  const setPageForFilter = useCallback(
    (nextPage: number) => {
      setPagesByCategory((prev) => {
        const clamped = Math.max(1, Math.min(nextPage, totalPages));
        if (prev[categoryFilter] === clamped) {
          return prev;
        }
        return { ...prev, [categoryFilter]: clamped };
      });
    },
    [categoryFilter, totalPages]
  );

  const handleCategoryFilterChange = useCallback(
    (value: string) => {
      if (value !== categoryFilter) {
        setPagesByCategory((prev) => (prev[value] === 1 ? prev : { ...prev, [value]: 1 }));
      }
      onCategoryFilterChange(value);
    },
    [categoryFilter, onCategoryFilterChange]
  );

  const pagedFamilies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredFamilies.slice(start, start + PAGE_SIZE);
  }, [filteredFamilies, currentPage]);

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  const selectableCategories = useMemo(
    () => categories.filter((category) => category !== ARCHIVED_CATEGORY),
    [categories]
  );
  const showArchiveMetadata = categoryFilter === ARCHIVED_CATEGORY;

  const paginationControls = (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <span>
        {Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}-{Math.min(currentPage * PAGE_SIZE, total)} of {total}
        {categoryFilter !== "all" ? ` in ${categoryFilter}` : ""}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPageForFilter(1)}
          disabled={!canPrev}
          aria-label="Go to first page"
        >
          <ChevronFirst className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPageForFilter(currentPage - 1)}
          disabled={!canPrev}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="px-1">
          Page {currentPage} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPageForFilter(currentPage + 1)}
          disabled={!canNext}
          aria-label="Go to next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPageForFilter(totalPages)}
          disabled={!canNext}
          aria-label="Go to last page"
        >
          <ChevronLast className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  return (
    <Card className={joinClassNames("", className)}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-serif">Family Cards</CardTitle>
        <CardDescription>
          Shepherd household relationships, surface recent prayer touches, and keep archived families close at hand.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-primary/10 bg-muted/30 p-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Create</p>
            <h3 className="text-base font-serif text-foreground">Add a new family</h3>
            <p className="text-sm text-muted-foreground">
              Capture the parents, children, and category that anchor this family in your rotation.
            </p>
          </div>
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

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Overview</p>
            <h3 className="text-base font-serif text-foreground">Current families</h3>
            <p className="text-sm text-muted-foreground">
              Tap a card for details or use the menu to filter by category.
            </p>
          </div>
          <Select value={categoryFilter} onValueChange={handleCategoryFilterChange}>
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
            {paginationControls}

            <div className="grid gap-4 md:grid-cols-2">
              {pagedFamilies.map((family) => {
                const isArchived = Boolean(family.archivedAt);
                return (
                  <div
                    key={family.id}
                    className={joinClassNames(
                      "rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-colors hover:border-primary/40",
                      isArchived ? "opacity-75" : ""
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 cursor-pointer space-y-2" onClick={() => onViewFamilyDetail(family)}>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-primary/70" aria-hidden="true" />
                          <h4 className="text-base font-serif font-semibold transition-colors hover:text-primary">
                            {family.familyName}
                          </h4>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] font-medium">
                          {family.categoryTag && (
                            <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2 py-0.5">
                              {family.categoryTag}
                            </span>
                          )}
                          {isArchived && (
                            <span className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">
                              Archived
                            </span>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onEditFamily(family)}>
                        Edit
                      </Button>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
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
                );
              })}
            </div>

            {paginationControls}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
