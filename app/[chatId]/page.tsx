"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, Loader2 } from "lucide-react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatTurn } from "@/components/chat/chat-turn";
import { DenominationContextMenu } from "@/components/chat/denomination-context-menu";
import { EditMessageDialog } from "@/components/chat/edit-message-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useChatList } from "@/hooks/use-chat-list";
import {
  groupChatMessagesIntoTurns,
  type ChatMessageRecord,
  type ChatTurn as ChatTurnType,
} from "@/lib/chat-turns";

const TOOL_PROGRESS_TITLES: Record<string, string> = {
  "Theological Research": "Gathering supporting sources",
  "CCEL Retrieval": "Consulting classic works",
  "Memory Recall": "Recalling past context",
  "Bible Commentary": "Retrieving commentaries",
  "Cross References": "Finding cross-references",
  "Web Search": "Searching the web",
  supplementalArticleSearch: "Gathering supporting sources",
  ccelRetrieval: "Consulting classic works",
  userMemoryRecall: "Recalling past context",
  BibleCommentary: "Retrieving commentaries",
  bibleCrossReferences: "Finding cross-references",
  generalSearch: "Searching the web",
  lookup_verse: "Looking up verse",
  word_study: "Analyzing word",
  get_cross_references: "Finding cross-references",
  get_study_notes: "Retrieving study notes",
  search_lexicon: "Searching lexicon",
  parse_morphology: "Parsing morphology",
  explore_genealogy: "Exploring genealogy",
  explore_person_events: "Exploring person",
  explore_place: "Exploring place",
  find_connection: "Finding connections",
  find_similar_passages: "Finding similar passages",
  get_ane_context: "Getting ancient context",
  get_bible_dictionary: "Looking up dictionary",
  get_key_terms: "Getting key terms",
  graph_enriched_search: "Searching knowledge graph",
  lookup_name: "Looking up name",
  people_in_passage: "Finding people in passage",
  search_by_strongs: "Searching by Strong's number",
};

type Chat = {
  id: string;
  userId: string;
  conversationName: string;
  denomination: string;
  modifiedAt: string;
};

type RequestEvent = { requestId?: string };

type DataEvent =
  | ({ type: "info" | "done" | "stopped" } & RequestEvent)
  | ({ type: "error"; stage: string; message: string } & RequestEvent)
  | ({ type: "progress"; title: string; content: string } & RequestEvent)
  | ({ type: "tool_progress"; toolName: string; message: string } & RequestEvent)
  | ({
      type: "tool_summary";
      toolName: string;
      content: string;
    } & RequestEvent)
  | ({ type: "parrot" | "calvin"; content: string } & RequestEvent)
  | ({ type: "gotQuestions" | "CCEL"; content: string } & RequestEvent)
  | ({
      type: "conversationNameUpdated";
      chatId: string;
      name: string;
    } & RequestEvent);

type SendOptions = {
  message?: string;
  requestId?: string;
  messageId?: string;
  isAutoTrigger?: boolean;
  retry?: boolean;
};

function ChatPageContent() {
  const params = useParams() as { chatId: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const {
    chats,
    invalidate: invalidateChatList,
    upsertChat,
    removeChat,
    renameChat,
    deleteChat,
  } = useChatList(user?.$id ?? "guest");

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [input, setInput] = useState("");
  const [pageError, setPageError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [editingMessage, setEditingMessage] =
    useState<ChatMessageRecord | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef<{ requestId: string } | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const fetchRetryTimeoutRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);
  const nearBottomRef = useRef(true);
  const initialScrollCompleteRef = useRef(false);
  const autoSentMessageIdRef = useRef<string | null>(null);

  const autoSendMessageId = searchParams.get("autoSendMessageId");
  const turns = useMemo(
    () => groupChatMessagesIntoTurns(messages),
    [messages],
  );

  const fetchChat = useCallback(
    async (attempt = 0) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      const fetchController = new AbortController();
      fetchControllerRef.current = fetchController;
      try {
        const response = await fetch(
          `/api/parrot-chat?chatId=${encodeURIComponent(params.chatId)}`,
          { cache: "no-store", signal: fetchController.signal },
        );
        if (!response.ok) {
          if (response.status === 404 && attempt < 4) {
            fetchRetryTimeoutRef.current = window.setTimeout(() => {
              void fetchChat(attempt + 1);
            }, 150 * 2 ** attempt);
            return;
          }
          if (response.status === 403) {
            throw new Error("You do not have access to this conversation.");
          }
          throw new Error("We could not load this conversation.");
        }

        const data = (await response.json()) as {
          chat: Chat;
          messages: ChatMessageRecord[];
        };
        setChat(data.chat);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        upsertChat({
          id: data.chat.id,
          conversationName: data.chat.conversationName,
          modifiedAt: data.chat.modifiedAt,
        });
        setPageError("");
        setIsLoading(false);
      } catch (error) {
        if (fetchController.signal.aborted) return;
        console.error("Error fetching chat:", error);
        setPageError(
          error instanceof Error
            ? error.message
            : "We could not load this conversation.",
        );
        setIsLoading(false);
      } finally {
        if (fetchControllerRef.current === fetchController) {
          fetchControllerRef.current = null;
          isFetchingRef.current = false;
        }
      }
    },
    [params.chatId, upsertChat],
  );

  useEffect(() => {
    fetchControllerRef.current?.abort();
    if (fetchRetryTimeoutRef.current !== null) {
      window.clearTimeout(fetchRetryTimeoutRef.current);
      fetchRetryTimeoutRef.current = null;
    }
    isFetchingRef.current = false;
    setChat(null);
    setMessages([]);
    setInput("");
    setPageError("");
    setComposerError("");
    setIsLoading(true);
    setIsStreaming(false);
    setProgress(null);
    setShowJumpToLatest(false);
    nearBottomRef.current = true;
    initialScrollCompleteRef.current = false;
    autoSentMessageIdRef.current = null;
    void fetchChat();

    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      fetchControllerRef.current?.abort();
      fetchControllerRef.current = null;
      isFetchingRef.current = false;
      if (fetchRetryTimeoutRef.current !== null) {
        window.clearTimeout(fetchRetryTimeoutRef.current);
        fetchRetryTimeoutRef.current = null;
      }
    };
  }, [fetchChat, params.chatId]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const updateScrollState = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const isNearBottom = distanceFromBottom < 96;
      nearBottomRef.current = isNearBottom;
      if (isNearBottom) setShowJumpToLatest(false);
    };

    container.addEventListener("scroll", updateScrollState, { passive: true });
    return () => container.removeEventListener("scroll", updateScrollState);
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      if (!initialScrollCompleteRef.current || nearBottomRef.current) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: initialScrollCompleteRef.current ? "auto" : "auto",
        });
        nearBottomRef.current = true;
        initialScrollCompleteRef.current = true;
        setShowJumpToLatest(false);
      } else {
        setShowJumpToLatest(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  const appendFailure = useCallback((requestId: string, content: string) => {
    setMessages((current) => {
      if (
        current.some(
          (message) =>
            message.requestId === requestId && message.sender === "system_error",
        )
      ) {
        return current;
      }
      return [
        ...current,
        {
          id: `error:${requestId}`,
          sender: "system_error",
          content,
          requestId,
          timestamp: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const handleSendMessage = useCallback(
    async (options: SendOptions = {}) => {
      if (isStreaming) return;
      const outgoingMessage = (options.message ?? input).trim();
      if (!outgoingMessage) return;

      const requestId = options.requestId ?? crypto.randomUUID();
      const messageId = options.messageId ?? crypto.randomUUID();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      activeRequestRef.current = { requestId };
      setComposerError("");
      setIsStreaming(true);
      setProgress({
        title: options.retry ? "Retrying your answer" : "Preparing your answer",
        content: "Thinking through your question to give a clear reply.",
      });
      nearBottomRef.current = true;

      if (options.retry) {
        setMessages((current) =>
          current.filter(
            (existing) =>
              existing.requestId !== requestId ||
              ![
                "tool_summary",
                "system_error",
                "system_stopped",
                "parrot",
              ].includes(existing.sender),
          ),
        );
      } else if (!options.isAutoTrigger) {
        setMessages((current) => [
          ...current,
          {
            id: messageId,
            sender: "user",
            content: outgoingMessage,
            requestId,
            timestamp: new Date().toISOString(),
          },
        ]);
        setInput("");
      }

      try {
        const response = await fetch("/api/parrot-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            chatId: params.chatId,
            message: outgoingMessage,
            requestId,
            messageId,
            isAutoTrigger: options.isAutoTrigger,
            retry: options.retry,
          }),
        });

        if (!response.ok || !response.body) {
          if (response.status === 409) {
            await fetchChat();
            return;
          }
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error || "The response could not be started.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        const appendAssistantToken = (
          eventRequestId: string,
          token: string,
          sender = "parrot",
        ) => {
          if (!token) return;
          setMessages((current) => {
            const existingIndex = current.findIndex(
              (existing) =>
                existing.requestId === eventRequestId &&
                existing.sender === sender,
            );
            if (existingIndex < 0) {
              return [
                ...current,
                {
                  id: `stream:${eventRequestId}:${sender}`,
                  sender,
                  content: token,
                  requestId: eventRequestId,
                  timestamp: new Date().toISOString(),
                },
              ];
            }
            const next = current.slice();
            next[existingIndex] = {
              ...next[existingIndex],
              content: next[existingIndex].content + token,
            };
            return next;
          });
        };

        const processEvent = (data: DataEvent) => {
          const eventRequestId = data.requestId ?? requestId;
          switch (data.type) {
            case "progress":
              setProgress({ title: data.title, content: data.content });
              break;
            case "tool_progress":
              setProgress({
                title:
                  TOOL_PROGRESS_TITLES[data.toolName] ||
                  "Working on your answer",
                content: data.message,
              });
              break;
            case "tool_summary":
              setMessages((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  sender: "tool_summary",
                  toolName: data.toolName,
                  content: data.content,
                  requestId: eventRequestId,
                  timestamp: new Date().toISOString(),
                },
              ]);
              break;
            case "parrot":
            case "calvin":
              appendAssistantToken(eventRequestId, data.content, data.type);
              break;
            case "gotQuestions":
            case "CCEL":
              setMessages((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  sender: "tool_summary",
                  toolName:
                    data.type === "CCEL"
                      ? "CCEL Retrieval"
                      : "Theological Research",
                  content: data.content,
                  requestId: eventRequestId,
                  timestamp: new Date().toISOString(),
                },
              ]);
              break;
            case "error":
              setProgress(null);
              appendFailure(eventRequestId, data.message);
              break;
            case "stopped":
              setMessages((current) => [
                ...current,
                {
                  id: `stopped:${eventRequestId}`,
                  sender: "system_stopped",
                  content: "Response stopped by the user.",
                  requestId: eventRequestId,
                  timestamp: new Date().toISOString(),
                },
              ]);
              break;
            case "conversationNameUpdated":
              upsertChat({
                id: data.chatId,
                conversationName: data.name,
              });
              setChat((current) =>
                current?.id === data.chatId
                  ? { ...current, conversationName: data.name }
                  : current,
              );
              break;
            case "done":
            case "info":
              break;
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              processEvent(JSON.parse(line) as DataEvent);
            } catch (error) {
              console.error("Failed to parse chat event:", error);
            }
          }
        }

        if (buffer.trim()) {
          try {
            processEvent(JSON.parse(buffer) as DataEvent);
          } catch (error) {
            console.error("Failed to parse final chat event:", error);
          }
        }

        await fetchChat();
        invalidateChatList();
      } catch (error) {
        if (controller.signal.aborted) {
          setMessages((current) => {
            if (
              current.some(
                (message) =>
                  message.requestId === requestId &&
                  message.sender === "system_stopped",
              )
            ) {
              return current;
            }
            return [
              ...current,
              {
                id: `stopped:${requestId}`,
                sender: "system_stopped",
                content: "Response stopped by the user.",
                requestId,
                timestamp: new Date().toISOString(),
              },
            ];
          });
        } else {
          console.error("Error processing message:", error);
          const errorMessage =
            error instanceof Error
              ? error.message
              : "We couldn't finish this response.";
          setComposerError(errorMessage);
          appendFailure(requestId, errorMessage);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        if (activeRequestRef.current?.requestId === requestId) {
          activeRequestRef.current = null;
        }
        setProgress(null);
        setIsStreaming(false);
      }
    },
    [
      appendFailure,
      fetchChat,
      input,
      invalidateChatList,
      isStreaming,
      params.chatId,
      upsertChat,
    ],
  );

  useEffect(() => {
    if (
      !autoSendMessageId ||
      isLoading ||
      isStreaming ||
      autoSentMessageIdRef.current === autoSendMessageId
    ) {
      return;
    }

    const userMessage = messages.find(
      (message) =>
        message.id === autoSendMessageId && message.sender === "user",
    );
    if (!userMessage) return;

    const alreadyFinished = messages.some(
      (message) =>
        message.requestId === userMessage.requestId &&
        ["parrot", "system_error", "system_stopped"].includes(message.sender),
    );
    autoSentMessageIdRef.current = autoSendMessageId;
    router.replace(`/${params.chatId}`);
    if (!alreadyFinished) {
      void handleSendMessage({
        message: userMessage.content,
        messageId: userMessage.id,
        requestId: userMessage.requestId ?? crypto.randomUUID(),
        isAutoTrigger: true,
      });
    }
  }, [
    autoSendMessageId,
    handleSendMessage,
    isLoading,
    isStreaming,
    messages,
    params.chatId,
    router,
  ]);

  const handleRetry = (turn: ChatTurnType) => {
    if (!turn.requestId || !turn.user || isStreaming) return;
    void handleSendMessage({
      message: turn.user.content,
      messageId: turn.user.id,
      requestId: turn.requestId,
      isAutoTrigger: true,
      retry: true,
    });
  };

  const handleCreateBranch = async (
    message: ChatMessageRecord,
    editedText: string,
  ) => {
    const response = await fetch("/api/parrot-chat/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceChatId: params.chatId,
        sourceMessageId: message.id,
        editedText,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(body?.error || "Unable to create conversation branch");
    }

    const data = (await response.json()) as {
      chatId: string;
      title: string;
      editedMessageId: string;
    };
    upsertChat({ id: data.chatId, conversationName: data.title });
    router.push(
      `/${data.chatId}?autoSendMessageId=${encodeURIComponent(data.editedMessageId)}`,
    );
  };

  const jumpToLatest = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    nearBottomRef.current = true;
    setShowJumpToLatest(false);
  };

  const stopActiveResponse = async () => {
    const activeRequest = activeRequestRef.current;
    abortControllerRef.current?.abort();
    if (!activeRequest) return;

    try {
      const response = await fetch("/api/parrot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: params.chatId,
          requestId: activeRequest.requestId,
          stop: true,
        }),
      });
      if (!response.ok) {
        console.error("Unable to persist stopped response state");
      }
    } catch (error) {
      console.error("Unable to persist stopped response state:", error);
    }
  };

  const currentDenomination = chat?.denomination || "reformed-baptist";

  return (
    <>
      <ChatShell
        chats={chats}
        currentChatId={params.chatId}
        title={
          isLoading ? (
            <span
              className="block h-5 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none"
              aria-label="Loading conversation"
            />
          ) : (
            chat?.conversationName || "Conversation"
          )
        }
        toolbarEnd={
          <DenominationContextMenu
            denomination={currentDenomination}
            isAuthenticated={Boolean(user?.$id)}
          />
        }
        onDelete={(chatId) =>
          deleteChat.mutateAsync(chatId).then(() => undefined)
        }
        onRename={(chatId, conversationName) =>
          renameChat
            .mutateAsync({ chatId, conversationName })
            .then(({ chat: renamedChat }) => {
              if (renamedChat.id === params.chatId) {
                setChat((current) =>
                  current
                    ? {
                        ...current,
                        conversationName: renamedChat.conversationName,
                        modifiedAt: renamedChat.modifiedAt,
                      }
                    : current,
                );
              }
            })
        }
        onDeleted={(chatId) => {
          removeChat(chatId);
          if (chatId === params.chatId) router.push("/");
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            ref={messagesContainerRef}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 scroll-smooth sm:px-6 sm:py-7"
            aria-busy={isStreaming}
          >
            <div className="mx-auto w-full max-w-4xl space-y-8 pb-5">
              {isLoading ? (
                <div className="space-y-7" aria-label="Loading conversation">
                  <div className="ms-auto w-3/4 max-w-xl space-y-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="ms-auto h-8 w-36" />
                  </div>
                  <Skeleton className="h-48 w-full max-w-[72ch]" />
                </div>
              ) : pageError ? (
                <div
                  className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive"
                  role="alert"
                >
                  {pageError}
                </div>
              ) : turns.length === 0 ? (
                <p className="py-12 text-center text-muted-foreground">
                  Ask a theological question to begin.
                </p>
              ) : (
                turns.map((turn) => (
                  <ChatTurn
                    key={turn.key}
                    turn={turn}
                    onEdit={setEditingMessage}
                    onRetry={handleRetry}
                  />
                ))
              )}
            </div>
            {showJumpToLatest ? (
              <div className="pointer-events-none sticky bottom-3 flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="pointer-events-auto min-h-10 rounded-full border border-border shadow-lg"
                  onClick={jumpToLatest}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  Jump to latest
                </Button>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-border/70 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
            <div className="mx-auto w-full max-w-4xl">
              {isLoading ? (
                <div className="rounded-[var(--radius)] border bg-input-bg p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    Loading conversation…
                  </div>
                </div>
              ) : (
                <ChatComposer
                  value={input}
                  onChange={setInput}
                  onSubmit={() => void handleSendMessage()}
                  onStop={() => void stopActiveResponse()}
                  isStreaming={isStreaming}
                  progress={progress}
                  error={composerError}
                />
              )}
            </div>
          </div>
        </div>
      </ChatShell>

      <EditMessageDialog
        message={editingMessage}
        open={Boolean(editingMessage)}
        onOpenChange={(open) => {
          if (!open) setEditingMessage(null);
        }}
        onConfirm={handleCreateBranch}
      />
      <p className="sr-only" aria-live="polite">
        {isStreaming ? "Parrot is responding." : ""}
      </p>
    </>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-var(--app-header-height))]" />
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
