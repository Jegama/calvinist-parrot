"use client";

import Link from "next/link";
import { ChevronDown, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DenominationContextMenuProps = {
  denomination: string;
  isAuthenticated: boolean;
};

function formatDenomination(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function DenominationContextMenu({
  denomination,
  isAuthenticated,
}: DenominationContextMenuProps) {
  const label = formatDenomination(denomination);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden h-auto min-h-9 max-w-64 whitespace-normal text-end lg:inline-flex"
          aria-label={`About the ${label} conversation context`}
        >
          {label} context
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 space-y-4"
        role="dialog"
        aria-label="Conversation theological context"
      >
        <div className="flex items-start gap-3">
          <Info
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="space-y-2">
            <h2 className="font-serif text-base font-semibold">
              {label} context
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Parrot uses this preference when a question touches secondary
              doctrines such as baptism, church government, or spiritual
              gifts. Its core Christian commitments remain unchanged.
            </p>
          </div>
        </div>
        <Button asChild className="w-full whitespace-normal">
          <Link href={isAuthenticated ? "/profile" : "/register"}>
            {isAuthenticated
              ? "Go to profile to change it"
              : "Create a profile to change it"}
          </Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
