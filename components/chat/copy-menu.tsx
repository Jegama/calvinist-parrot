"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  absolutizeMarkdownLinks,
  markdownToPlainText,
  sanitizeClipboardHtml,
  writeFormattedClipboard,
} from "@/lib/chat-copy";

type CopyFormat = "formatted" | "markdown" | "plain";

type CopyMenuProps = {
  markdown: string;
  contentRef: RefObject<HTMLElement | null>;
};

const FEEDBACK_DURATION_MS = 2200;

export function CopyMenu({ markdown, contentRef }: CopyMenuProps) {
  const [feedback, setFeedback] = useState<string>("");
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const showFeedback = (message: string) => {
    setFeedback(message);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setFeedback("");
      timeoutRef.current = null;
    }, FEEDBACK_DURATION_MS);
  };

  const copy = async (format: CopyFormat) => {
    try {
      const baseUrl = window.location.origin;
      const markdownWithAbsoluteLinks = absolutizeMarkdownLinks(
        markdown,
        baseUrl,
      );
      const plainText = markdownToPlainText(markdown, { baseUrl });
      if (format === "formatted") {
        const html = sanitizeClipboardHtml(
          contentRef.current?.innerHTML ?? `<p>${plainText}</p>`,
          {
            lang: document.documentElement.lang,
            dir: "auto",
            baseUrl,
          },
        );
        await writeFormattedClipboard(html, plainText);
        showFeedback("Formatted copy ready.");
      } else if (format === "markdown") {
        await navigator.clipboard.writeText(markdownWithAbsoluteLinks);
        showFeedback("Markdown copied.");
      } else {
        await navigator.clipboard.writeText(plainText);
        showFeedback("Plain text copied.");
      }
    } catch (error) {
      console.error("Unable to copy message:", error);
      showFeedback("Copy failed. Check your browser clipboard permission.");
    }
  };

  const copied = feedback.endsWith("copied.") || feedback.endsWith("ready.");

  return (
    <div
      className="inline-flex items-stretch"
      data-clipboard-exclude
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 min-h-9 w-9 rounded-e-none"
            onClick={() => void copy("formatted")}
            aria-label={copied ? feedback : "Copy formatted for Word"}
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {copied ? feedback : "Copy formatted for Word"}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 min-h-9 w-8 rounded-s-none border-s border-border/60"
                aria-label="Choose copy format"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Choose copy format</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-w-64">
          <DropdownMenuItem
            className="whitespace-normal"
            onSelect={() => void copy("formatted")}
          >
            Formatted for Word
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy("markdown")}>
            Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy("plain")}>
            Plain text
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" aria-live="polite">
        {feedback}
      </span>
    </div>
  );
}
