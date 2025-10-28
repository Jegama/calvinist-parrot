"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChurchDetail, ChurchListItem } from "@/types/church";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

import {
  ChurchDetailDialog,
} from "./components/church-detail-dialog";
import { ChurchDiscoveryPanel } from "./components/church-discovery-panel";
import { ChurchFiltersBar } from "./components/church-filters";
import { ChurchList } from "./components/church-list";
import { ChurchMap } from "./components/church-map";
import type { ChurchFilters } from "./api";
import { fetchChurchDetail, fetchChurches, fetchChurchMeta } from "./api";

type ViewMode = "list" | "map";

const DEFAULT_FILTERS: ChurchFilters = {
  page: 1,
  state: null,
  city: null,
  denomination: null,
  confessional: null,
  status: "exclude_red_flag", // Exclude non-endorsed churches by default
};

// Reset filters maintains the default exclusion of red_flag churches
const RESET_FILTERS: ChurchFilters = {
  page: 1,
  state: null,
  city: null,
  denomination: null,
  confessional: null,
  status: "exclude_red_flag",
};

export default function ChurchFinderPage() {
  const [filters, setFilters] = useState<ChurchFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedChurchId, setSelectedChurchId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const churchQueryKey = useMemo(
    () => [
      "churches",
      filters.page ?? 1,
      filters.state ?? "",
      filters.city ?? "",
      filters.denomination ?? "",
      filters.confessional ?? "all",
      filters.status ?? "exclude_red_flag",
    ],
    [filters]
  );

  const churchQuery = useQuery({
    queryKey: churchQueryKey,
    queryFn: () => fetchChurches(filters),
  });

  const metaQuery = useQuery({
    queryKey: ["churches", "meta"],
    queryFn: fetchChurchMeta,
    staleTime: 1000 * 60 * 10,
  });

  // Phase 2: Use useQuery for church details with caching
  const detailQuery = useQuery({
    queryKey: ["church-detail", selectedChurchId],
    queryFn: () => fetchChurchDetail(selectedChurchId!),
    enabled: !!selectedChurchId && detailOpen,
    staleTime: 1000 * 60 * 60, // 1 hour - evaluations don't change often
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
  });

  const handleSelect = (church: ChurchListItem) => {
    setDetailOpen(true);
    setSelectedChurchId(church.id);
  };

  const handleFiltersChange = useCallback((next: ChurchFilters | ((prev: ChurchFilters) => ChurchFilters)) => {
    setFilters((prev) => {
      const nextFilters = typeof next === "function" ? next(prev) : next;
      
      // Only update if filters actually changed
      if (
        prev.page === nextFilters.page &&
        prev.state === nextFilters.state &&
        prev.city === nextFilters.city &&
        prev.denomination === nextFilters.denomination &&
        prev.confessional === nextFilters.confessional &&
        prev.status === nextFilters.status
      ) {
        return prev;
      }
      return nextFilters;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters((prev) => {
      // Only reset if filters are not already at reset state
      if (
        prev.page === RESET_FILTERS.page &&
        prev.state === RESET_FILTERS.state &&
        prev.city === RESET_FILTERS.city &&
        prev.denomination === RESET_FILTERS.denomination &&
        prev.confessional === RESET_FILTERS.confessional &&
        prev.status === RESET_FILTERS.status
      ) {
        return prev;
      }
      return { ...RESET_FILTERS };
    });
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const handleChurchCreated = useCallback((church: ChurchDetail) => {
    setFilters((prev) => ({ ...prev, page: 1 }));
    
    // Invalidate and refetch both church list and metadata
    void queryClient.invalidateQueries({ queryKey: ["churches"], refetchType: "active" });
    void queryClient.invalidateQueries({ queryKey: ["churches", "meta"], refetchType: "active" });
    
    // Cache the newly created church detail
    queryClient.setQueryData(["church-detail", church.id], church);
    
    setSelectedChurchId(church.id);
    setDetailOpen(true);
  }, [queryClient]);

  const handleChurchView = useCallback((church: ChurchDetail) => {
    // Cache the church detail
    queryClient.setQueryData(["church-detail", church.id], church);
    
    setSelectedChurchId(church.id);
    setDetailOpen(true);
  }, [queryClient]);

  const handleChurchUpdated = useCallback((church: ChurchDetail) => {
    // Update the cache with the re-evaluated church
    queryClient.setQueryData(["church-detail", church.id], church);
    
    // Invalidate list queries to show updated data
    void queryClient.invalidateQueries({ queryKey: ["churches"], refetchType: "active" });
  }, [queryClient]);

  const churches = churchQuery.data?.items ?? [];
  const total = churchQuery.data?.total ?? 0;
  const page = churchQuery.data?.page ?? filters.page ?? 1;
  const pageSize = churchQuery.data?.pageSize ?? 10;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Church Finder</h1>
        <p className="text-muted-foreground mb-4">
          We're building a community-maintained directory to help believers find churches anchored in the Gospel and the essentials of the faith. Filter by location and denominational distinctives, and contribute by adding churches so others can benefit.
        </p>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/doctrinal-statement">View Our Doctrinal Statement</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/church-finder/guide">How evaluations work</Link>
          </Button>
        </div>
        <Alert className="bg-card border-border shadow-sm">
          <Info className="h-4 w-4 text-primary" />
          <AlertTitle className="text-foreground font-semibold">How these evaluations work</AlertTitle>
          <AlertDescription className="text-foreground/80">
            We summarize what a church states on its website—nothing more. If something isn't clearly written online, we can't
            infer their position. If you see an error, <a href="mailto:contact@calvinistparrotministries.org" className="text-primary underline underline-offset-2 hover:no-underline">email us</a> with the page link and what needs correction.
          </AlertDescription>
        </Alert>
      </header>

      {/* Main content grid: List on left, Filters on right (desktop) */}
      <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
        <div className="space-y-4">
          {/* Filters shown between discovery and list on mobile */}
          <div className="lg:hidden">
            <ChurchFiltersBar
              availableStates={metaQuery.data?.states ?? []}
              denominations={metaQuery.data?.denominations ?? []}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onReset={handleResetFilters}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>

          {viewMode === "list" ? (
            churchQuery.isPending ? (
              <div className="rounded-lg border border-border bg-card shadow-sm p-6 text-center text-sm text-muted-foreground">
                Loading churches…
              </div>
            ) : (
              <ChurchList
                items={churches}
                page={page}
                pageSize={pageSize}
                total={total}
                loading={churchQuery.isFetching}
                onPageChange={handlePageChange}
                onSelect={handleSelect}
              />
            )
          ) : churchQuery.isPending ? (
            <div className="rounded-lg border border-border bg-card shadow-sm p-6 text-center text-sm text-muted-foreground">
              Loading map data…
            </div>
          ) : (
            <ChurchMap churches={churches} onSelect={handleSelect} />
          )}
        </div>

        {/* Filters sidebar - Desktop only */}
        <div className="hidden lg:block">
          <ChurchFiltersBar
            availableStates={metaQuery.data?.states ?? []}
            denominations={metaQuery.data?.denominations ?? []}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={handleResetFilters}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>

      {/* Discovery Panel - moved to bottom for crowd-sourced contribution */}
      <div className="mt-8">
        <ChurchDiscoveryPanel onChurchCreated={handleChurchCreated} onChurchView={handleChurchView} />
      </div>

      <ChurchDetailDialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setSelectedChurchId(null);
          }
        }}
        church={detailQuery.data ?? null}
        onChurchUpdated={handleChurchUpdated}
      />
    </div>
  );
}
