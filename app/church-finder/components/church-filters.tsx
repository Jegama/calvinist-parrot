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
  const confessionalValue = useMemo(() => filters.confessional ?? "all", [filters.confessional]);
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

  const handleConfessionalChange = useCallback(
    (value: string) => {
      onFiltersChange((prev) => {
        if ((prev.confessional ?? "all") === value) return prev;
        const newConfessional = value === "all" ? null : (value as "true" | "false");
        return { ...prev, page: 1, confessional: newConfessional };
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

        {/* Confessional Filter */}
        <div className="space-y-2">
          <Label htmlFor="confessional-filter">Confessional</Label>
          <Select value={confessionalValue} onValueChange={handleConfessionalChange}>
            <SelectTrigger id="confessional-filter">
              <SelectValue placeholder="All churches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All churches</SelectItem>
              <SelectItem value="true">Confessional</SelectItem>
              <SelectItem value="false">Non-confessional</SelectItem>
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
