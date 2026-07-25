"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ChatMessageRecord } from "@/lib/chat-turns";

type SourcesAndProcessProps = {
  sources: ChatMessageRecord[];
};

function sourceLabel(source: ChatMessageRecord) {
  if (source.toolName) return source.toolName;
  if (source.sender === "gotQuestions") return "Theological Research";
  if (source.sender === "CCEL") return "CCEL Retrieval";
  return "Source";
}

export function SourcesAndProcess({ sources }: SourcesAndProcessProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  if (sources.length === 0) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="max-w-[72ch] rounded-lg border border-border/70 bg-muted/25"
    >
      <CollapsibleTrigger
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span>
          Sources &amp; process
          <span className="ms-2 font-normal text-muted-foreground">
            {sources.length}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent id={contentId}>
        <div className="space-y-4 border-t border-border/70 px-3 py-3">
          {sources.map((source) => (
            <section key={source.id}>
              <h3 className="mb-2 text-sm font-semibold text-accent">
                {sourceLabel(source)}
              </h3>
              <div className="break-words text-sm text-foreground" dir="auto">
                <MarkdownWithBibleVerses content={source.content} />
              </div>
            </section>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
