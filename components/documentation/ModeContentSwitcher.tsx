"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";

export type ModeOption = {
  value: string;
  label: string;
};

interface ModeContentSwitcherProps {
  contentByMode: Record<string, string>;
  options: ReadonlyArray<ModeOption>;
  initialValue?: string;
  triggerLabel?: string;
}

export function ModeContentSwitcher({
  contentByMode,
  options,
  initialValue,
  triggerLabel = "Select Mode",
}: ModeContentSwitcherProps) {
  const fallbackMode = React.useMemo(() => {
    return initialValue || options[0]?.value || Object.keys(contentByMode)[0] || "";
  }, [contentByMode, initialValue, options]);

  const [selectedMode, setSelectedMode] = React.useState(fallbackMode);

  React.useEffect(() => {
    setSelectedMode(fallbackMode);
  }, [fallbackMode]);

  const currentContent = contentByMode[selectedMode];

  return (
    <div className="mt-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className="min-w-[180px]">
            {triggerLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {options.map((option) => (
            <DropdownMenuItem key={option.value} onClick={() => setSelectedMode(option.value)}>
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {currentContent ? (
        <div className="mt-6">
          <MarkdownWithBibleVerses content={currentContent} />
        </div>
      ) : null}
    </div>
  );
}
