"use client";

import { useId, useRef } from "react";
import { Loader2, Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAutoGrowingTextarea } from "@/hooks/use-auto-growing-textarea";
import { cn } from "@/lib/utils";

export const LANDING_CHAT_DISCLAIMER =
  "The Parrot is not a substitute for your own study, prayer, or pastoral counsel.";

export const CONVERSATION_CHAT_DISCLAIMER =
  "The Parrot can make mistakes. Check important claims against Scripture and your elders/pastors.";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isSubmitting?: boolean;
  isLoading?: boolean;
  progress?: { title: string; content: string } | null;
  placeholder?: string;
  submitLabel?: string;
  layout?: "inline" | "stacked";
  size?: "default" | "hero";
  disclaimer?: string;
  autoFocus?: boolean;
  error?: string;
};

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  isSubmitting = false,
  isLoading = false,
  progress,
  placeholder = "Type your message...",
  submitLabel = "Send",
  layout = "inline",
  size = "default",
  disclaimer = CONVERSATION_CHAT_DISCLAIMER,
  autoFocus = false,
  error,
}: ChatComposerProps) {
  const isComposingRef = useRef(false);
  const disclaimerId = useId();
  const { textareaRef, handleInput } = useAutoGrowingTextarea(value, {
    minHeight: size === "hero" ? 144 : 72,
    maxHeight: size === "hero" ? 560 : 200,
    maxViewportRatio: size === "hero" ? 0.6 : 0.4,
  });

  const submit = () => {
    if (isLoading || isStreaming || isSubmitting || isComposingRef.current || !value.trim()) {
      return;
    }
    onSubmit();
  };

  return (
    <section
      aria-label="Message composer"
      className="border border-input bg-input-bg p-3 shadow-[0_8px_30px_hsl(var(--foreground)/0.08)] sm:p-4"
      style={{ borderRadius: "var(--radius)" }}
    >
      <form
        className={cn(
          "flex gap-3",
          layout === "stacked" ? "flex-col" : "items-end",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={value}
          onInput={handleInput}
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              !isComposingRef.current
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={isLoading ? "Loading conversation…" : placeholder}
          aria-describedby={disclaimerId}
          dir="auto"
          disabled={isLoading || isSubmitting || isStreaming}
          className={cn(
            "resize-none border-input bg-input-bg text-base leading-relaxed shadow-none",
            layout === "inline" ? "flex-1" : "w-full shrink-0",
            size === "hero"
              ? "min-h-36 max-h-[60vh] px-4 py-4 sm:text-base"
              : "min-h-[72px] max-h-[200px] sm:text-sm",
          )}
        />
        {isStreaming ? (
          <Button
            type="button"
            variant="outline"
            className={cn(
              "min-h-11 min-w-20 shrink-0 whitespace-normal",
              layout === "stacked" && "w-full",
            )}
            onClick={onStop}
          >
            <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            className={cn(
              "min-h-11 min-w-20 shrink-0 whitespace-normal",
              layout === "stacked" && "w-full",
            )}
            disabled={isLoading || isSubmitting || !value.trim()}
          >
            {isSubmitting ? (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {submitLabel}
          </Button>
        )}
      </form>
      {size !== "hero" || progress || isLoading || error ? (
        <div
          className="mt-2 h-10 overflow-y-auto text-xs leading-5"
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
          tabIndex={progress || error ? 0 : undefined}
        >
          {isLoading ? "Loading conversation…" : error ? (
            <p className="text-destructive">{error}</p>
          ) : progress ? (
            <div className="flex items-start gap-2">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              <div>
                <span className="font-medium">{progress.title}</span>{" "}
                <span className="text-muted-foreground">{progress.content}</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <p
        id={disclaimerId}
        className={cn(
          "mt-3 pb-[max(0rem,env(safe-area-inset-bottom))] leading-relaxed text-muted-foreground",
          size === "hero" ? "text-xs" : "text-[10px] sm:text-[11px]",
        )}
      >
        {disclaimer}
      </p>
    </section>
  );
}
