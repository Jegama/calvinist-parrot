"use client";

import type { RefObject } from "react";
import { Pencil } from "lucide-react";

import { CopyMenu } from "@/components/chat/copy-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MessageActionsProps = {
  markdown: string;
  contentRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  onEdit?: () => void;
};

export function MessageActions({
  markdown,
  contentRef,
  ariaLabel,
  onEdit,
}: MessageActionsProps) {
  return (
    <TooltipProvider delayDuration={350}>
      <div
        className="flex flex-wrap items-center gap-1 text-muted-foreground"
        data-clipboard-exclude
        role="group"
        aria-label={ariaLabel}
      >
        <CopyMenu markdown={markdown} contentRef={contentRef} />
        {onEdit ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 min-h-9 w-9"
                onClick={onEdit}
                aria-label="Edit message"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit message</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
