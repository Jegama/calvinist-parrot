"use client";

import { Fragment, useEffect, useState, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppSidebar } from "@/components/chat-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { Loader2, Copy, Check, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useUserIdentifier } from "@/hooks/use-user-identifier";
import { useChatList } from "@/hooks/use-chat-list";
import { useQuery } from "@tanstack/react-query";
import { fetchProfileOverview } from "@/app/profile/api";

// Keyed by the toolName string that arrives in tool_progress events.
// Writer-based tools use display names (e.g. "Bible Commentary").
// MCP/route-injected tools use LangChain names (e.g. "word_study").
const TOOL_PROGRESS_TITLES: Record<string, string> = {
  // Display names from writer events
  "Theological Research": "Gathering supporting sources",
  "CCEL Retrieval": "Consulting classic works",
  "Memory Recall": "Recalling past context",
  "Bible Commentary": "Retrieving commentaries",
  "Cross References": "Finding cross-references",
  "Web Search": "Searching the web",
  // LangChain tool names (from route's tools step / MCP tools)
  supplementalArticleSearch: "Gathering supporting sources",
  ccelRetrieval: "Consulting classic works",
  userMemoryRecall: "Recalling past context",
  BibleCommentary: "Retrieving commentaries",
  bibleCrossReferences: "Finding cross-references",
  generalSearch: "Searching the web",
  // Study Bible MCP tools
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

const DEFAULT_DENOMINATION = "reformed-baptist";
const DEFAULT_DENOMINATION_LABEL = "Reformed Baptist";
const DEFAULT_DENOMINATION_REGEX = /\breformed[- ]baptist\b/i;
const DENOMINATION_NOTICE_STORAGE_PREFIX = "chat-denomination-notice";

type Message = {
  sender: string;
  content: string;
  toolName?: string;
};

type Chat = {
  id: string;
  userId: string;
  conversationName: string;
};

type DataEvent =
  | { type: "info" | "done" }
  | { type: "error"; stage: string; message: string }
  | { type: "progress"; title: string; content: string }
  | { type: "tool_progress"; toolName: string; message: string }
  | { type: "tool_summary"; toolName: string; content: string; raw?: unknown }
  | { type: "parrot"; content: string }
  | { type: "calvin"; content: string }
  | { type: "gotQuestions"; content: string }
  | { type: "CCEL"; content: string }
  | { type: "conversationNameUpdated"; chatId: string; name: string };

export default function ChatPage() {
  const params = useParams() as { chatId: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [hasShownDenominationNotice, setHasShownDenominationNotice] = useState(false);
  const [showDenominationNotice, setShowDenominationNotice] = useState(false);
  const { userId } = useUserIdentifier();
  const { chats, invalidate: invalidateChatList, upsertChat, removeChat } = useChatList(userId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<{ title: string; content: string } | null>(null);
  const autoSentRef = useRef(false);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const lastChatScrolledRef = useRef<boolean>(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Add refs to track data loading state
  const isFetchingChatRef = useRef(false);
  const chatFetchedRef = useRef(false);
  const seededInitialMessageRef = useRef(false);
  const urlNormalizedRef = useRef(false);

  const initialQuestionParam = searchParams.get("initialQuestion");
  const MAX_CHAT_FETCH_RETRIES = 5;
  const RETRY_DELAY_BASE_MS = 200;
  const COPY_FEEDBACK_DURATION = 2000;
  const denominationNoticeStorageKey = `${DENOMINATION_NOTICE_STORAGE_PREFIX}:${params.chatId}`;

  const profileOverview = useQuery({
    queryKey: ["profile-overview", user?.$id ?? "guest"],
    enabled: Boolean(user?.$id),
    queryFn: () => fetchProfileOverview(user!.$id),
    staleTime: 1000 * 60 * 5,
  });

  const currentDenomination = profileOverview.data?.profile?.denomination ?? DEFAULT_DENOMINATION;
  const shouldInviteDenominationChoice = !user?.$id || currentDenomination === DEFAULT_DENOMINATION;
  const denominationMentionIndex = messages.findIndex(
    (message) => message.sender === "parrot" && DEFAULT_DENOMINATION_REGEX.test(message.content)
  );

  // --- 1) Fetch Chat, User, and Chat List ---

  const fetchChat = useCallback(
    async (attempt = 0) => {
      if (!userId) return;
      // Prevent duplicate fetch requests
      if (isFetchingChatRef.current) return;

      try {
        isFetchingChatRef.current = true;
        const response = await fetch(`/api/parrot-chat?chatId=${params.chatId}&userId=${encodeURIComponent(userId)}`);
        if (!response.ok) {
          if (response.status === 401) {
            setErrorMessage("Please sign in to view this chat.");
            return;
          }
          if (response.status === 403) {
            setErrorMessage("You do not have access to this chat.");
            return;
          }
          if (response.status === 404 && attempt < MAX_CHAT_FETCH_RETRIES) {
            const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
            setTimeout(() => fetchChat(attempt + 1), delay);
            return;
          }
          throw new Error("Failed to fetch chat");
        }
        const data = await response.json();
        if (!data.chat) {
          if (attempt < MAX_CHAT_FETCH_RETRIES) {
            const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
            setTimeout(() => fetchChat(attempt + 1), delay);
          } else {
            setErrorMessage("An error occurred while fetching the chat.");
          }
          return;
        }
        setChat(data.chat);
        setMessages((current) => {
          const incoming = Array.isArray(data.messages) ? data.messages : [];
          // Guard against transient backend lag right after streaming.
          // Prefer the longer transcript so the just-streamed final answer is not dropped.
          return incoming.length >= current.length ? incoming : current;
        });
        upsertChat({
          id: data.chat.id,
          conversationName: data.chat.conversationName ?? "New Conversation",
        });
        chatFetchedRef.current = true;
        setErrorMessage("");
        if (initialQuestionParam && !urlNormalizedRef.current) {
          router.replace(`/${params.chatId}`);
          urlNormalizedRef.current = true;
        }
      } catch (error) {
        console.error("Error fetching chat:", error);
        if (attempt >= MAX_CHAT_FETCH_RETRIES) {
          setErrorMessage("An error occurred while fetching the chat.");
        }
      } finally {
        isFetchingChatRef.current = false;
      }
    },
    [params.chatId, initialQuestionParam, router, upsertChat, userId]
  );

  useEffect(() => {
    urlNormalizedRef.current = false;
  }, [params.chatId]);

  useEffect(() => {
    setHasShownDenominationNotice(false);
    setShowDenominationNotice(false);

    if (typeof window === "undefined") return;

    if (window.localStorage.getItem(denominationNoticeStorageKey) === "shown") {
      setHasShownDenominationNotice(true);
    }
  }, [denominationNoticeStorageKey]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  // Add scroll detection for both the window and the messages container (mobile Safari may scroll the window)
  useEffect(() => {
    const container = messagesContainerRef.current;

    const computeScrolled = () => {
      const containerScrolled = container ? container.scrollTop > 30 : false;
      const windowScrolled = typeof window !== "undefined" ? window.scrollY > 30 : false;
      return containerScrolled || windowScrolled;
    };

    const handleScroll = () => {
      const next = computeScrolled();
      if (next !== lastChatScrolledRef.current) {
        lastChatScrolledRef.current = next;
        setIsScrolled(next);
      }
    };

    // Initialize on mount in case we land mid-scroll (e.g., browser restore)
    setIsScrolled(computeScrolled());

    window.addEventListener("scroll", handleScroll, { passive: true });
    if (container) container.addEventListener("scroll", handleScroll, { passive: true } as AddEventListenerOptions);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (container) container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Load chat data once when component mounts or chatId changes
  useEffect(() => {
    if (params.chatId && !chatFetchedRef.current) {
      fetchChat();
    }
  }, [params.chatId, fetchChat]);

  // Seed the initial user message immediately when navigating from the landing page.
  useEffect(() => {
    if (!seededInitialMessageRef.current && initialQuestionParam && messages.length === 0 && !chatFetchedRef.current) {
      seededInitialMessageRef.current = true;
      setMessages([{ sender: "user", content: initialQuestionParam }]);
    }
  }, [initialQuestionParam, messages.length]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (showDenominationNotice) return;
    if (hasShownDenominationNotice) return;
    if (denominationMentionIndex < 0) return;
    if (!shouldInviteDenominationChoice) return;
    if (user?.$id && profileOverview.isPending) return;
    if (typeof window === "undefined") return;

    window.localStorage.setItem(denominationNoticeStorageKey, "shown");
    setHasShownDenominationNotice(true);
    setShowDenominationNotice(true);
  }, [
    hasShownDenominationNotice,
    denominationMentionIndex,
    denominationNoticeStorageKey,
    profileOverview.isPending,
    shouldInviteDenominationChoice,
    showDenominationNotice,
    user?.$id,
  ]);

  // --- 2) Send Message ---
  const handleSendMessage = useCallback(
    async (opts?: { message?: string; isAutoTrigger?: boolean }) => {
      const userInput = opts?.message || input.trim();
      if (!userInput) return;
      setProgress({ title: "Preparing your answer", content: "Thinking through your question to give a clear reply." });

      // Only add user message if not auto-triggered
      if (!opts?.isAutoTrigger) {
        setMessages((msgs) => [...msgs, { sender: "user", content: userInput }]);
      }
      setInput("");

      const response = await fetch("/api/parrot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: params.chatId,
          message: userInput,
          isAutoTrigger: opts?.isAutoTrigger,
        }),
      });

      if (!response.ok || !response.body) {
        console.error("Error processing message");
        setProgress(null);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const appendToken = (sender: string, token: string) => {
        // Skip empty tokens to prevent empty message bubbles
        if (!token) return;

        setMessages((msgs) => {
          if (msgs.length > 0 && msgs[msgs.length - 1].sender === sender) {
            return [...msgs.slice(0, -1), { sender, content: msgs[msgs.length - 1].content + token }];
          } else {
            return [...msgs, { sender, content: token }];
          }
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          setProgress(null);
          // When streaming is done, refresh chat without triggering a re-fetch loop
          chatFetchedRef.current = false;
          fetchChat();
          // Also refresh the chat list to update the sidebar
          invalidateChatList();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let data: DataEvent;
          try {
            data = JSON.parse(line);
          } catch (e) {
            console.error("Failed to parse JSON line:", line, e);
            continue;
          }

          switch (data.type) {
            case "progress":
              setProgress({ title: data.title, content: data.content });
              break;
            case "tool_progress":
              // Ephemeral tool progress - show in progress indicator
              setProgress({
                title: TOOL_PROGRESS_TITLES[data.toolName] || "Working on your answer",
                content: data.message,
              });
              break;
            case "tool_summary":
              // Save tool summary as a collapsible message
              setMessages((msgs) => [
                ...msgs,
                { sender: "tool_summary", content: data.content, toolName: data.toolName },
              ]);
              break;
            case "parrot":
              appendToken("parrot", data.content);
              break;
            case "calvin":
              appendToken("calvin", data.content);
              break;
            case "gotQuestions":
              setMessages((msgs) => [
                ...msgs,
                { sender: "tool_summary", toolName: "Theological Research", content: data.content },
              ]);
              break;
            case "CCEL":
              setMessages((msgs) => [
                ...msgs,
                { sender: "tool_summary", toolName: "CCEL Retrieval", content: data.content },
              ]);
              break;
            case "error":
              setProgress(null);
              setMessages((msgs) => [
                ...msgs,
                {
                  sender: "system_error",
                  content: `An error occurred during ${data.stage}: ${data.message}`,
                },
              ]);
              break;
            case "conversationNameUpdated":
              // Update sidebar immediately with new conversation name
              upsertChat({ id: data.chatId, conversationName: data.name });
              if (chat?.id === data.chatId) {
                setChat((prev) => prev ? { ...prev, conversationName: data.name } : prev);
              }
              break;
            case "done":
              setProgress(null);
              // Refresh chat data once after completion
              chatFetchedRef.current = false;
              fetchChat();

              // Refresh chat list to update sidebar
              invalidateChatList();
              if (initialQuestionParam && !urlNormalizedRef.current) {
                router.replace(`/${params.chatId}`);
                urlNormalizedRef.current = true;
              }
              return;
            default:
              console.warn("Unknown event type:", data.type);
          }
        }
      }
    },
    [input, params.chatId, fetchChat, invalidateChatList, initialQuestionParam, router, chat?.id, upsertChat]
  );

  // --- Auto-trigger sending if only the initial user message exists ---
  useEffect(() => {
    if (
      chatFetchedRef.current &&
      messages.length === 1 &&
      messages[0].sender === "user" &&
      !autoSentRef.current &&
      !progress
    ) {
      autoSentRef.current = true;
      // Call handleSendMessage with autotrigger flag
      handleSendMessage({ message: messages[0].content, isAutoTrigger: true });
    }
  }, [messages, handleSendMessage, progress]);

  // --- 3) Rendering ---
  if (errorMessage) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <p className="text-destructive">{errorMessage}</p>
      </div>
    );
  }

  if (!chat) {
    return (
      <SidebarProvider style={{ minHeight: "calc(100vh - var(--app-header-height))" }}>
        <AppSidebar
          chats={chats}
          currentChatId={params.chatId}
          onDeleted={(id) => {
            removeChat(id);
            if (id === params.chatId) {
              router.push("/");
            }
          }}
        />
        <SidebarInset className="min-h-[calc(100vh-var(--app-header-height))] !bg-transparent">
          <div className="flex min-h-full flex-col">
            <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="h-4 mr-2" />
              <Skeleton className="h-6 w-48" />
            </header>
            <div className="flex-1 overflow-hidden px-4 pb-6 pt-4">
              <Card className="mx-auto flex h-full w-full max-w-2xl flex-col">
                <CardContent className="flex-1 space-y-4 overflow-y-auto p-6">
                  <p className="text-lg text-muted-foreground">Loading chat...</p>
                  <div className="ml-auto max-w-[80%] space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                  <div className="mr-auto max-w-[80%] space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                </CardContent>
                <div className="border-t bg-card/80 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/60">
                  <Skeleton className="h-20 w-full" />
                </div>
              </Card>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider style={{ minHeight: "calc(100vh - var(--app-header-height))" }}>
      <AppSidebar
        chats={chats}
        currentChatId={params.chatId}
        onDeleted={(id) => {
          removeChat(id);
          if (id === params.chatId) {
            router.push("/");
          }
        }}
      />
      <SidebarInset className="min-h-[calc(100vh-var(--app-header-height))] !bg-transparent">
        <div className="flex min-h-full flex-col">
          <header
            className={`sticky top-[var(--app-header-height)] z-20 flex shrink-0 items-center transition-all duration-200 ease-in-out ${isMobile && isScrolled
              ? "!bg-transparent"
              : isScrolled
                ? "!bg-transparent"
                : "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
              } ${isMobile && !isScrolled ? "!bg-transparent !backdrop-blur-none" : ""}`}
            style={{
              height: isMobile ? (isScrolled ? "2.5rem" : "3.5rem") : isScrolled ? "3rem" : "4rem",
              justifyContent: isMobile && isScrolled ? "center" : "flex-start",
              paddingLeft: isMobile && isScrolled ? 0 : "1rem",
              paddingRight: isMobile && isScrolled ? 0 : "1rem",
            }}
          >
            <div
              className={`flex items-center transition-all duration-700 ease-in-out ${isMobile && isScrolled ? "liquid-glass-pill" : ""
                }`}
              style={{
                justifyContent: isMobile && isScrolled ? "center" : "flex-start",
                background: isMobile && isScrolled ? "transparent" : "transparent",
                backdropFilter: "none",
                borderRadius: isMobile && isScrolled ? "9999px" : "0",
                border: "none",
                paddingLeft: isMobile && isScrolled ? "0.625rem" : "0",
                paddingRight: isMobile && isScrolled ? "0.625rem" : "0",
                paddingTop: isMobile && isScrolled ? "0.01rem" : "0",
                paddingBottom: isMobile && isScrolled ? "0.01rem" : "0",
                width: isMobile && isScrolled ? "50%" : "100%",
                maxWidth: isMobile && isScrolled ? "20rem" : "none",
                boxShadow: "none",
                gap: isMobile && isScrolled ? 0 : "0.5rem",
              }}
            >
              <SidebarTrigger
                className="-ml-1 transition-all duration-700 ease-in-out"
                style={{
                  opacity: isMobile && isScrolled ? 0 : 1,
                  width: isMobile && isScrolled ? 0 : "auto",
                  marginLeft: isMobile && isScrolled ? 0 : undefined,
                  marginRight: isMobile && isScrolled ? 0 : undefined,
                  pointerEvents: isMobile && isScrolled ? "none" : "auto",
                  transform: isMobile && isScrolled ? "scale(0)" : "scale(1)",
                }}
              />
              <Separator
                orientation="vertical"
                className="h-4 transition-all duration-700 ease-in-out"
                style={{
                  opacity: isMobile && isScrolled ? 0 : 1,
                  width: isMobile && isScrolled ? 0 : "auto",
                  marginLeft: isMobile && isScrolled ? 0 : undefined,
                  marginRight: isMobile && isScrolled ? 0 : "0.5rem",
                  transform: isMobile && isScrolled ? "scale(0)" : "scale(1)",
                }}
              />
              <h2
                className="leading-tight transition-all duration-700 ease-in-out truncate"
                style={{
                  fontSize: isMobile ? (isScrolled ? "0.75rem" : "1rem") : isScrolled ? "0.875rem" : "1.125rem",
                  fontWeight: isMobile && isScrolled ? 500 : 600,
                  textAlign: isMobile && isScrolled ? "center" : "left",
                  flex: isMobile && isScrolled ? "1" : "0 1 auto",
                }}
              >
                {chat.conversationName}
              </h2>
            </div>
          </header>
          <div className="flex-1 overflow-hidden px-4 pb-6 pt-4">
            <Card className="mx-auto flex h-full w-full max-w-2xl flex-col">
              <CardContent ref={messagesContainerRef} className="flex-1 space-y-4 overflow-y-auto p-6">
                {messages.map((msg, i) => {
                  switch (msg.sender) {
                    case "user":
                      return (
                        <div
                          key={i}
                          className="ml-auto max-w-[80%] rounded-md bg-user-message p-3 text-user-message-foreground shadow"
                        >
                          <div className="mb-1 text-sm font-bold">You</div>
                          <MarkdownWithBibleVerses content={msg.content} />
                        </div>
                      );
                    case "parrot":
                      return (
                        <Fragment key={i}>
                          <div className="group relative mr-auto max-w-[80%] rounded-md bg-parrot-message p-3 text-parrot-message-foreground shadow break-words overflow-wrap-anywhere">
                            <div className="mb-1 text-sm font-bold">Parrot</div>
                            <div className="break-words overflow-wrap-anywhere">
                              <MarkdownWithBibleVerses content={msg.content} />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={copiedMessageIndex === i ? "Markdown copied" : "Copy markdown"}
                              className="absolute right-3 top-3 h-7 w-7 rounded-full bg-muted/30 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-muted/40"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(msg.content);
                                  setCopiedMessageIndex(i);
                                  if (copyResetTimeoutRef.current !== null) {
                                    window.clearTimeout(copyResetTimeoutRef.current);
                                  }
                                  copyResetTimeoutRef.current = window.setTimeout(() => {
                                    setCopiedMessageIndex(null);
                                    copyResetTimeoutRef.current = null;
                                  }, COPY_FEEDBACK_DURATION);
                                } catch (err) {
                                  console.error("Failed to copy message:", err);
                                }
                              }}
                            >
                              {copiedMessageIndex === i ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                          </div>

                          {showDenominationNotice && denominationMentionIndex === i ? (
                            <div className="mr-auto mt-2 max-w-[80%]">
                              <Alert className="border-border/60 bg-muted/20">
                                <Info className="h-4 w-4" />
                                <AlertTitle>
                                  {user?.$id ? "Prefer a different tradition?" : `Currently using ${DEFAULT_DENOMINATION_LABEL} mode`}
                                </AlertTitle>
                                <AlertDescription className="space-y-3">
                                  <p>
                                    {user?.$id
                                      ? `Parrot is answering with ${DEFAULT_DENOMINATION_LABEL} distinctives. If you'd rather use another tradition, you can update your denomination in your profile.`
                                      : `Parrot defaults to ${DEFAULT_DENOMINATION_LABEL} distinctives for guests. Create an account to choose another denomination, or sign in if you already have one.`}
                                  </p>

                                  <div className="flex flex-wrap gap-2">
                                    {user?.$id ? (
                                      <Button asChild size="sm">
                                        <Link href="/profile">Choose denomination in profile</Link>
                                      </Button>
                                    ) : (
                                      <>
                                        <Button asChild size="sm">
                                          <Link href="/register">Create account</Link>
                                        </Button>
                                        <Button asChild size="sm" variant="outline">
                                          <Link href="/login">Sign in</Link>
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </AlertDescription>
                              </Alert>
                            </div>
                          ) : null}
                        </Fragment>
                      );
                    case "calvin": // for backward compatibility
                      return (
                        <div key={i} className="mr-auto mt-2 max-w-[80%]">
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`calvin-${i}`}>
                              <AccordionTrigger>Calvin&apos;s Feedback</AccordionTrigger>
                              <AccordionContent>
                                <MarkdownWithBibleVerses content={msg.content} />
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      );
                    case "tool_summary":
                      const toolIcons: Record<string, string> = {
                        "Theological Research": "🔍",
                        "Bible Commentary": "📖",
                        "Memory Recall": "🧠",
                        "CCEL Retrieval": "📚",
                        "Cross References": "🔗",
                        "Web Search": "🌐",
                        "Lookup Verse": "📜",
                        "Word Study": "📘",
                        "Get Cross References": "🔗",
                        "Get Study Notes": "📝",
                        "Search Lexicon": "📚",
                        "Parse Morphology": "🔎",
                        "Explore Genealogy": "🌿",
                        "Explore Person Events": "👤",
                        "Explore Place": "🗺️",
                        "Find Connection": "🧩",
                        "Find Similar Passages": "🧭",
                        "Get Ane Context": "🏺",
                        "Get Bible Dictionary": "📗",
                        "Get Key Terms": "🏷️",
                        "Graph Enriched Search": "🕸️",
                        "Lookup Name": "🔤",
                        "People In Passage": "👥",
                        "Search By Strongs": "🔠",
                      };
                      const toolTitles: Record<string, string> = {
                        "Theological Research": "Research Notes",
                        "Bible Commentary": "Commentary References",
                        "Memory Recall": "Context Recalled",
                        "CCEL Retrieval": "CCEL Sources",
                        "Cross References": "Cross-References",
                        "Web Search": "Web Sources",
                        "Lookup Verse": "Verse Lookup",
                        "Word Study": "Word Study",
                        "Get Cross References": "Cross-References",
                        "Get Study Notes": "Study Notes",
                        "Search Lexicon": "Lexicon Results",
                        "Parse Morphology": "Morphology Analysis",
                        "Explore Genealogy": "Genealogy",
                        "Explore Person Events": "Person Events",
                        "Explore Place": "Place Details",
                        "Find Connection": "Passage Connections",
                        "Find Similar Passages": "Similar Passages",
                        "Get Ane Context": "Ancient Context",
                        "Get Bible Dictionary": "Bible Dictionary",
                        "Get Key Terms": "Key Terms",
                        "Graph Enriched Search": "Knowledge Graph",
                        "Lookup Name": "Name Lookup",
                        "People In Passage": "People In Passage",
                        "Search By Strongs": "Strong's Search",
                      };
                      const toolName = msg.toolName || "unknown";
                      const icon = toolIcons[toolName] || "🔧";
                      const title = toolTitles[toolName] || toolName;
                      return (
                        <div key={i} className="mr-auto mt-2 max-w-[80%]">
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`tool-${i}`}>
                              <AccordionTrigger>
                                {icon} {title}
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="max-h-72 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-3">
                                  <MarkdownWithBibleVerses content={msg.content} />
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      );
                    case "system_error":
                      return (
                        <div key={i} className="mr-auto max-w-[80%] rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                          <div className="mb-1 text-sm font-bold">System</div>
                          <p className="text-sm">{msg.content}</p>
                        </div>
                      );
                    default:
                      return (
                        <div key={i} className="mr-auto max-w-[80%] rounded-md border border-border/60 bg-muted/20 p-3 text-foreground">
                          <div className="mb-1 text-sm font-bold">Message</div>
                          <MarkdownWithBibleVerses content={msg.content} />
                        </div>
                      );
                  }
                })}
                <div ref={messagesEndRef} />
              </CardContent>
              <div className="border-t bg-card/80 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/60">
                {progress ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div className="space-y-1 text-sm">
                      <h3 className="font-semibold leading-none">{progress.title}</h3>
                      <p className="text-muted-foreground">{progress.content}</p>
                    </div>
                  </div>
                ) : (
                  <form
                    className="flex w-full items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                  >
                    <Textarea
                      className="min-h-[80px] flex-1 resize-none"
                      placeholder="Type your message..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      disabled={!!progress}
                    />
                    <Button type="submit" disabled={!!progress}>
                      Send
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
