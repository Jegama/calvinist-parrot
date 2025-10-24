"use client";

import { useCallback, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChurchFilters } from "@/app/church-finder/api";

type ViewMode = "list" | "map";

type ChurchFiltersProps = {
  availableStates: string[];
  denominations: string[];
  filters: ChurchFilters;
  onFiltersChange: (next: ChurchFilters) => void;
  onReset: () => void;
  viewMode: ViewMode;
  onViewModeChange: (view: ViewMode) => void;
};

export function ChurchFiltersBar({
  availableStates,
  denominations,
  filters,
  onFiltersChange,
  onReset,
  viewMode,
  onViewModeChange,
}: ChurchFiltersProps) {
  const stateOptions = useMemo(() => ["all", ...availableStates], [availableStates]);
  const denominationOptions = useMemo(() => ["all", ...denominations], [denominations]);

  const stateValue = useMemo(() => filters.state ?? "all", [filters.state]);
  const denominationValue = useMemo(() => filters.denomination ?? "all", [filters.denomination]);
  const confessionalValue = useMemo(() => filters.confessional ?? "all", [filters.confessional]);
  const cityValue = useMemo(() => filters.city ?? "", [filters.city]);

  const handleStateChange = useCallback(
    (value: string) => {
      if (stateValue === value) return;
      const newState = value === "all" ? null : value;
      onFiltersChange({ ...filters, page: 1, state: newState });
    },
    [stateValue, filters, onFiltersChange]
  );

  const handleCityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newCity = event.target.value || null;
      onFiltersChange({ ...filters, page: 1, city: newCity });
    },
    [filters, onFiltersChange]
  );

  const handleDenominationChange = useCallback(
    (value: string) => {
      if (denominationValue === value) return;
      const newDenomination = value === "all" ? null : value;
      onFiltersChange({ ...filters, page: 1, denomination: newDenomination });
    },
    [denominationValue, filters, onFiltersChange]
  );

  const handleConfessionalChange = useCallback(
    (value: string) => {
      if (confessionalValue === value) return;
      const newConfessional = value === "all" ? null : (value as "true" | "false");
      onFiltersChange({ ...filters, page: 1, confessional: newConfessional });
    },
    [confessionalValue, filters, onFiltersChange]
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card/80 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold text-foreground">Filter churches</h2>
        <div className="inline-flex rounded-md border border-border p-1 text-sm">
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            className="rounded-md"
            onClick={() => onViewModeChange("list")}
          >
            List View
          </Button>
          <Button
            type="button"
            variant={viewMode === "map" ? "default" : "ghost"}
            size="sm"
            className="rounded-md"
            onClick={() => onViewModeChange("map")}
          >
            Map View
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">State</label>
          <Select value={stateValue} onValueChange={handleStateChange}>
            <SelectTrigger>
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              {stateOptions.map((state) => (
                <SelectItem key={state} value={state}>
                  {state === "all" ? "All states" : state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">City</label>
          <Input value={cityValue} onChange={handleCityChange} placeholder="e.g., Houston" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">Denomination</label>
          <Select value={denominationValue} onValueChange={handleDenominationChange}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {denominationOptions.map((denomination) => (
                <SelectItem key={denomination} value={denomination}>
                  {denomination === "all" ? "All" : denomination}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">Confessional</label>
          <Select value={confessionalValue} onValueChange={handleConfessionalChange}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All churches</SelectItem>
              <SelectItem value="true">Confessional</SelectItem>
              <SelectItem value="false">Non-confessional</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onReset}>
          Reset filters
        </Button>
      </div>
    </div>
  );
}
