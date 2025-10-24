"use client";

import { useCallback, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChurchDetail, ChurchListItem } from "@/types/church";

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

  const handleFiltersChange = useCallback((next: ChurchFilters) => {
    setFilters(next);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const handleChurchCreated = (church: ChurchDetail) => {
    setFilters((prev) => ({ ...prev, page: 1 }));
    void queryClient.invalidateQueries(["churches"]);
    setSelectedChurch(church);
    setDetailOpen(true);
  };

  const churches = churchQuery.data?.items ?? [];
  const total = churchQuery.data?.total ?? 0;
  const page = churchQuery.data?.page ?? filters.page ?? 1;
  const pageSize = churchQuery.data?.pageSize ?? 10;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Church Finder</h1>
        <p className="max-w-3xl text-muted-foreground">
          Evaluate churches through the Calvinist Parrot doctrinal framework, filter by region and denominational distinctives,
          and discover new ministries to review.
        </p>
      </header>

      <ChurchFiltersBar
        availableStates={metaQuery.data?.states ?? []}
        denominations={metaQuery.data?.denominations ?? []}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onReset={handleResetFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          {viewMode === "list" ? (
            churchQuery.status === "loading" && !churchQuery.data ? (
              <div className="rounded-lg border border-border bg-card/80 p-6 text-center text-sm text-muted-foreground">
                Loading churches…
              </div>
            ) : (
              <ChurchList
                items={churches}
                page={page}
                pageSize={pageSize}
                total={total}
                loading={churchQuery.status === "loading"}
                onPageChange={handlePageChange}
                onSelect={handleSelect}
              />
            )
          ) : churchQuery.status === "loading" && !churchQuery.data ? (
            <div className="rounded-lg border border-border bg-card/80 p-6 text-center text-sm text-muted-foreground">
              Loading map data…
            </div>
          ) : (
            <ChurchMap churches={churches} onSelect={handleSelect} />
          )}
        </div>

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
