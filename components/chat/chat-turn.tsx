"use client";

import { useRef } from "react";
import { AlertCircle, CircleStop } from "lucide-react";

import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { MessageActions } from "@/components/chat/message-actions";
import { SourcesAndProcess } from "@/components/chat/sources-and-process";
import { Button } from "@/components/ui/button";
import { copySelectedMessageContent } from "@/lib/chat-copy";
import type { ChatMessageRecord, ChatTurn as ChatTurnType } from "@/lib/chat-turns";

type ChatTurnProps = {
  turn: ChatTurnType;
  onEdit: (message: ChatMessageRecord) => void;
  onRetry: (turn: ChatTurnType) => void;
};

export function ChatTurn({ turn, onEdit, onRetry }: ChatTurnProps) {
  const userContentRef = useRef<HTMLDivElement>(null);
  const assistantContentRef = useRef<HTMLDivElement>(null);

  return (
    <article
      className="space-y-4 scroll-mt-20"
      aria-label="Conversation turn"
      data-request-id={turn.requestId ?? undefined}
    >
      {turn.user ? (
        <section className="ms-auto w-fit max-w-[min(90%,42rem)]">
          <div className="rounded-lg bg-user-message px-4 py-3 text-user-message-foreground shadow-sm">
            <p className="mb-1 text-sm font-semibold">You</p>
            <div
              ref={userContentRef}
              dir="auto"
              className="break-words [&>*:last-child]:mb-0"
              onCopy={(event) => {
                if (userContentRef.current) {
                  copySelectedMessageContent(
                    event.nativeEvent,
                    userContentRef.current,
                  );
                }
              }}
            >
              <MarkdownWithBibleVerses content={turn.user.content} />
            </div>
          </div>
          <div className="mt-1 flex justify-end">
            <MessageActions
              markdown={turn.user.content}
              contentRef={userContentRef}
              ariaLabel="Actions for your message"
              onEdit={() => onEdit(turn.user!)}
            />
          </div>
        </section>
      ) : null}

      <SourcesAndProcess sources={turn.sources} />

      {turn.assistant ? (
        <section className="max-w-[72ch]">
          <div className="rounded-lg border border-border/70 bg-card/85 px-4 py-4 text-card-foreground shadow-sm sm:px-5">
            <p className="mb-2 text-sm font-semibold text-accent">Parrot</p>
            <div
              ref={assistantContentRef}
              dir="auto"
              className="break-words leading-7 [&>*:last-child]:mb-0"
              onCopy={(event) => {
                if (assistantContentRef.current) {
                  copySelectedMessageContent(
                    event.nativeEvent,
                    assistantContentRef.current,
                  );
                }
              }}
            >
              <MarkdownWithBibleVerses content={turn.assistant.content} />
            </div>
          </div>
          <div className="mt-1 flex justify-start">
            <MessageActions
              markdown={turn.assistant.content}
              contentRef={assistantContentRef}
              ariaLabel="Actions for Parrot's message"
            />
          </div>
        </section>
      ) : null}

      {turn.failure ? (
        <section
          className="max-w-[72ch] rounded-lg border border-destructive/50 bg-destructive/10 p-4"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">
                We couldn&apos;t finish this response.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your question is preserved. You can try this request again.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-3 min-h-9"
                onClick={() => onRetry(turn)}
                disabled={!turn.requestId}
              >
                Retry
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {turn.stopped ? (
        <section
          className="max-w-[72ch] rounded-lg border border-border bg-muted/35 p-4"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <CircleStop className="h-5 w-5 shrink-0" aria-hidden="true" />
            Response stopped. You can send a new message when you are ready.
          </div>
        </section>
      ) : null}
    </article>
  );
}
