"use client";

import { useCallback, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { ChurchFilters } from "@/app/church-finder/api";

type ViewMode = "list" | "map";

type ChurchFiltersProps = {
  availableStates: string[];
  denominations: string[];
  filters: ChurchFilters;
  onFiltersChange: (next: ChurchFilters | ((prev: ChurchFilters) => ChurchFilters)) => void;
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
  const statusValue = useMemo(() => filters.status ?? "exclude_red_flag", [filters.status]);
  const cityValue = useMemo(() => filters.city ?? "", [filters.city]);

  const handleStateChange = useCallback(
    (value: string) => {
      onFiltersChange((prev) => {
        if ((prev.state ?? "all") === value) return prev;
        const newState = value === "all" ? null : value;
        return { ...prev, page: 1, state: newState };
      });
    },
    [onFiltersChange]
  );

  const handleCityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newCity = event.target.value || null;
      onFiltersChange((prev) => ({ ...prev, page: 1, city: newCity }));
    },
    [onFiltersChange]
  );

  const handleDenominationChange = useCallback(
    (value: string) => {
      onFiltersChange((prev) => {
        if ((prev.denomination ?? "all") === value) return prev;
        const newDenomination = value === "all" ? null : value;
        return { ...prev, page: 1, denomination: newDenomination };
      });
    },
    [onFiltersChange]
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      onFiltersChange((prev) => {
        if ((prev.status ?? "exclude_red_flag") === value) return prev;
        const newStatus = value === "all" ? "exclude_red_flag" : (value as ChurchFilters["status"]);
        return { ...prev, page: 1, status: newStatus };
      });
    },
    [onFiltersChange]
  );

  return (
    <Card className="sticky top-4 bg-card shadow-sm border-border">
      <CardHeader>
        <CardTitle>Filter churches</CardTitle>
        <CardDescription>
          Refine results by location and denominational distinctives
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* View Mode Toggle */}
        <div className="space-y-2">
          <Label>View Mode</Label>
          <div className="inline-flex w-full rounded-md border border-border bg-muted/30 p-1">
            <Button
              type="button"
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="flex-1 rounded-sm"
              onClick={() => onViewModeChange("list")}
            >
              List View
            </Button>
            <Button
              type="button"
              variant={viewMode === "map" ? "default" : "ghost"}
              size="sm"
              className="flex-1 rounded-sm"
              onClick={() => onViewModeChange("map")}
            >
              Map View
            </Button>
          </div>
        </div>

        <Separator />

        {/* State Filter */}
        <div className="space-y-2">
          <Label htmlFor="state-filter">State</Label>
          <Select value={stateValue} onValueChange={handleStateChange}>
            <SelectTrigger id="state-filter">
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

        {/* City Filter */}
        <div className="space-y-2">
          <Label htmlFor="city-filter">City</Label>
          <Input
            id="city-filter"
            value={cityValue}
            onChange={handleCityChange}
            placeholder="e.g., Houston"
          />
        </div>

        {/* Denomination Filter */}
        <div className="space-y-2">
          <Label htmlFor="denomination-filter">Denomination</Label>
          <Select value={denominationValue} onValueChange={handleDenominationChange}>
            <SelectTrigger id="denomination-filter">
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

        {/* Status Filter - replaces Confessional */}
        <div className="space-y-2">
          <Label htmlFor="status-filter">Church Status</Label>
          <Select value={statusValue} onValueChange={handleStatusChange}>
            <SelectTrigger id="status-filter">
              <SelectValue placeholder="All churches (excluding Not Endorsed)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclude_red_flag">All churches (excluding Not Endorsed)</SelectItem>
              <SelectItem value="historic_reformed">Historic Reformed (Confessional)</SelectItem>
              <SelectItem value="recommended">Recommended</SelectItem>
              <SelectItem value="caution">Proceed with Caution</SelectItem>
              <SelectItem value="red_flag">Not Endorsed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Reset Button */}
        <Button type="button" variant="outline" className="w-full" onClick={onReset}>
          Reset filters
        </Button>
      </CardContent>
    </Card>
  );
}
