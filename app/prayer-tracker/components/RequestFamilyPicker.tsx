"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Family } from "../types";
import { filterFamiliesByName, isFamilyArchived } from "../utils";

const household = { id: "household", familyName: "Our Family" };
type FamilyOption = Pick<Family, "id" | "familyName">;

type RequestFamilyPickerProps = {
  families: Family[];
  value: string;
  onValueChange: (id: string) => void;
};

export function RequestFamilyPicker({ families, value, onValueChange }: RequestFamilyPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pickerId = useId();
  const listId = `${pickerId}-options`;
  const optionId = (id: string) => `${pickerId}-family-${id}`;

  const selected = families.find((family) => family.id === value);
  const familyName = value === household.id ? household.familyName : selected?.familyName ?? "Linked family";
  const selectedLabel = selected && isFamilyArchived(selected) ? `${familyName} (archived)` : familyName;

  const groups = useMemo(() => {
    const categories = new Map<string, FamilyOption[]>();
    for (const family of filterFamiliesByName(families, query)) {
      const name = family.categoryTag || "Uncategorized";
      const group = categories.get(name);
      if (group) group.push(family);
      else categories.set(name, [family]);
    }
    const result = Array.from(categories.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, options]) => ({ name, options }));
    if (household.familyName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) {
      result.unshift({ name: "Your Household", options: [household] });
    }
    return result;
  }, [families, query]);
  const options = groups.flatMap((group) => group.options);
  const activeOption = options.find((option) => option.id === activeId);

  function changeQuery(text: string) {
    setQuery(text);
    setActiveId(null);
  }

  function choose(id: string) {
    onValueChange(id);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || !options.length) return;
    if (event.key === "Enter") {
      const choice = activeOption ?? (options.length === 1 ? options[0] : undefined);
      if (choice) {
        event.preventDefault();
        choose(choice.id);
      }
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const current = options.findIndex((option) => option.id === activeId);
    const next = event.key === "ArrowDown"
      ? options[current + 1] ?? options[0]
      : options[current - 1] ?? options[options.length - 1];
    setActiveId(next.id);
    document.getElementById(optionId(next.id))?.scrollIntoView({ block: "nearest" });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) changeQuery("");
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Link to family: ${selectedLabel}`}
          className="w-full justify-between"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown aria-hidden="true" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Link to family"
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] flex-col gap-2 p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <label htmlFor={pickerId} className="px-1 text-sm font-medium">Search families</label>
        <div className="flex items-center gap-2">
          <Input
            id={pickerId}
            ref={searchRef}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={activeOption && optionId(activeOption.id)}
            autoComplete="off"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                changeQuery("");
                searchRef.current?.focus();
              }}
            >
              Clear search
            </Button>
          )}
        </div>
        <div id={listId} role="listbox" aria-label="Families" className="max-h-64 overflow-y-auto">
          {groups.map(({ name, options }) => (
            <div key={options[0] === household ? "household" : `category-${name}`} role="group" aria-label={name}>
              <div aria-hidden="true" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{name}</div>
              {options.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  id={optionId(option.id)}
                  role="option"
                  aria-selected={value === option.id}
                  tabIndex={-1}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${activeId === option.id ? "bg-muted" : ""}`}
                  onClick={() => choose(option.id)}
                >
                  <Check aria-hidden="true" className={`h-4 w-4 shrink-0 ${value === option.id ? "" : "invisible"}`} />
                  {option.familyName}
                </button>
              ))}
            </div>
          ))}
        </div>
        {!options.length && <p role="status" className="px-2 text-sm text-muted-foreground">No matching families</p>}
      </PopoverContent>
    </Popover>
  );
}
