"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChurchDetail, ChurchListItem } from "@/types/church";
import { Button } from "@/components/ui/button";

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
};

export default function ChurchFinderPage() {
  const [filters, setFilters] = useState<ChurchFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedChurch, setSelectedChurch] = useState<ChurchDetail | null>(null);

  const queryClient = useQueryClient();

  const churchQueryKey = useMemo(
    () => [
      "churches",
      filters.page ?? 1,
      filters.state ?? "",
      filters.city ?? "",
      filters.denomination ?? "",
      filters.confessional ?? "all",
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

  const detailMutation = useMutation({
    mutationFn: (id: string) => fetchChurchDetail(id),
    onSuccess: (data) => {
      setSelectedChurch(data);
    },
  });

  const handleSelect = (church: ChurchListItem) => {
    setDetailOpen(true);
    setSelectedChurch(null);
    detailMutation.mutate(church.id);
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
        prev.confessional === nextFilters.confessional
      ) {
        return prev;
      }
      return nextFilters;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters((prev) => {
      // Only reset if filters are not already at default
      if (
        prev.page === DEFAULT_FILTERS.page &&
        prev.state === DEFAULT_FILTERS.state &&
        prev.city === DEFAULT_FILTERS.city &&
        prev.denomination === DEFAULT_FILTERS.denomination &&
        prev.confessional === DEFAULT_FILTERS.confessional
      ) {
        return prev;
      }
      return { ...DEFAULT_FILTERS };
    });
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const handleChurchCreated = useCallback((church: ChurchDetail) => {
    setFilters((prev) => ({ ...prev, page: 1 }));
    void queryClient.invalidateQueries({ queryKey: ["churches"] });
    setSelectedChurch(church);
    setDetailOpen(true);
  }, [queryClient]);

  const churches = churchQuery.data?.items ?? [];
  const total = churchQuery.data?.total ?? 0;
  const page = churchQuery.data?.page ?? filters.page ?? 1;
  const pageSize = churchQuery.data?.pageSize ?? 10;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Church Finder</h1>
        <p className="text-muted-foreground max-w-3xl mb-4">
          A crowd-sourced directory of churches evaluated through the Calvinist Parrot doctrinal framework. 
          Browse churches filtered by region and denominational distinctives, or contribute by adding new churches to help others find sound biblical teaching.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/doctrinal-statement">View Our Doctrinal Statement</Link>
        </Button>
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
              <div className="rounded-lg border border-border bg-card/80 p-6 text-center text-sm text-muted-foreground">
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
            <div className="rounded-lg border border-border bg-card/80 p-6 text-center text-sm text-muted-foreground">
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
        <ChurchDiscoveryPanel onChurchCreated={handleChurchCreated} />
      </div>

      <ChurchDetailDialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setSelectedChurch(null);
          }
        }}
        church={selectedChurch}
      />
    </div>
  );
}
