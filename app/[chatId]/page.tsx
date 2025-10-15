"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { AppSidebar } from "@/components/chat-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { Loader2, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

type Message = {
  sender: string;
  content: string;
};

type Chat = {
  id: string;
  userId: string;
  conversationName: string;
};

type ChatListItem = {
  id: string;
  conversationName: string;
};

type DataEvent =
  | { type: "info" | "done" }
  | { type: "progress"; title: string; content: string }
  | { type: "parrot"; content: string }
  | { type: "calvin"; content: string }
  | { type: "gotQuestions"; content: string };

export default function ChatPage() {
  const params = useParams() as { chatId: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
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
  const isFetchingChatsRef = useRef(false);
  const chatFetchedRef = useRef(false);
  const seededInitialMessageRef = useRef(false);
  const urlNormalizedRef = useRef(false);

  const initialQuestionParam = searchParams.get("initialQuestion");
  const MAX_CHAT_FETCH_RETRIES = 5;
  const RETRY_DELAY_BASE_MS = 200;
  const COPY_FEEDBACK_DURATION = 2000

  // --- 1) Fetch Chat, User, and Chat List ---

  const fetchChat = useCallback(async (attempt = 0) => {
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
      setMessages(data.messages);
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
  }, [params.chatId, initialQuestionParam, router, userId]);

  const fetchChats = useCallback(async () => {
    // Only fetch if we have a userId and aren't already fetching
    if (!userId || isFetchingChatsRef.current) return;
    
    try {
      isFetchingChatsRef.current = true;
      const res = await fetch(`/api/user-chats?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats);
      } else {
        console.error("Error fetching chats: non-OK response");
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
    } finally {
      isFetchingChatsRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    async function initUser() {
      try {
        const { account } = await import("@/utils/appwrite");
        const currentUser = await account.get();
        setUserId(currentUser.$id);
      } catch (error) {
        console.log("Error getting user:", error);
        const getCookieUserId = () => {
          const match = document.cookie.match(new RegExp('(^| )userId=([^;]+)'));
          return match ? match[2] : null;
        };
        let cookieUserId = getCookieUserId();
        if (!cookieUserId) {
          cookieUserId = crypto.randomUUID();
          document.cookie = `userId=${cookieUserId}; path=/; max-age=31536000`;
        }
        setUserId(cookieUserId);
      }
    }
    initUser();
  }, []);

  useEffect(() => {
    urlNormalizedRef.current = false;
  }, [params.chatId]);

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
    if (container) container.addEventListener("scroll", handleScroll, { passive: true } as any);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (container) container.removeEventListener("scroll", handleScroll as any);
    };
  }, []);

  // Load chat data once when component mounts or chatId changes
  useEffect(() => {
    if (params.chatId && !chatFetchedRef.current) {
      fetchChat();
    }
  }, [params.chatId, fetchChat]);

  // Load chat list when userId is available and whenever we need to refresh
  useEffect(() => {
    if (userId) {
      fetchChats();
    }
  }, [userId, fetchChats]);

  // Seed the initial user message immediately when navigating from the landing page.
  useEffect(() => {
    if (
      !seededInitialMessageRef.current &&
      initialQuestionParam &&
      messages.length === 0 &&
      !chatFetchedRef.current
    ) {
      seededInitialMessageRef.current = true;
      setMessages([{ sender: "user", content: initialQuestionParam }]);
    }
  }, [initialQuestionParam, messages.length]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- 2) Send Message ---
  const handleSendMessage = useCallback(
    async (opts?: { message?: string; isAutoTrigger?: boolean }) => {
      const userInput = opts?.message || input.trim();
      if (!userInput) return;
      setProgress({ title: "Reasoning", content: "Deciding what tools to use" });

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
        setMessages((msgs) => {
          if (msgs.length > 0 && msgs[msgs.length - 1].sender === sender) {
            return [
              ...msgs.slice(0, -1),
              { sender, content: msgs[msgs.length - 1].content + token },
            ];
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
          fetchChats();
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
            case "parrot":
              appendToken("parrot", data.content);
              break;
            case "calvin":
              appendToken("calvin", data.content);
              break;
            case "gotQuestions":
              setMessages((msgs) => [...msgs, { sender: "gotQuestions", content: data.content }]);
              break;
            case "done":
              setProgress(null);
              // Refresh chat data once after completion
              chatFetchedRef.current = false;
              fetchChat();

              // Refresh chat list to update sidebar
              fetchChats();
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
    [input, params.chatId, fetchChat, fetchChats, initialQuestionParam, router]
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
      <div className="flex flex-1 overflow-hidden">
        <p>Loading chat...</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar chats={chats} currentChatId={params.chatId} />
      <SidebarInset className="min-h-[calc(100vh-var(--app-header-height))] !bg-transparent">
        <div className="flex min-h-full flex-col">
          <header 
            className={`sticky top-[var(--app-header-height)] z-20 flex shrink-0 items-center transition-all duration-500 ease-in-out ${
              isMobile && isScrolled ? "" : "border-b"
            }`}
            style={{
              height: isMobile ? (isScrolled ? "2.5rem" : "3.5rem") : (isScrolled ? "3rem" : "4rem"),
              justifyContent: isMobile && isScrolled ? "center" : "flex-start",
              paddingLeft: isMobile && isScrolled ? 0 : "1rem",
              paddingRight: isMobile && isScrolled ? 0 : "1rem",
              background: isMobile ? "transparent !important" : "hsl(var(--background) / 0.95)",
              backdropFilter: isMobile ? "none" : "blur(8px)",
              backgroundColor: isMobile ? "transparent !important" : undefined,
            }}
          >
            <div
              className="flex items-center transition-all duration-500 ease-in-out"
              style={{
                justifyContent: isMobile && isScrolled ? "center" : "flex-start",
                background: isMobile && isScrolled ? "hsl(var(--background) / 0.95)" : "transparent",
                backdropFilter: isMobile && isScrolled ? "blur(12px)" : "none",
                borderRadius: isMobile && isScrolled ? "9999px" : "0",
                border: isMobile && isScrolled ? "1px solid hsl(var(--border))" : "none",
                paddingLeft: isMobile && isScrolled ? "0.625rem" : "0",
                paddingRight: isMobile && isScrolled ? "0.625rem" : "0",
                paddingTop: isMobile && isScrolled ? "0.25rem" : "0",
                paddingBottom: isMobile && isScrolled ? "0.25rem" : "0",
                width: isMobile && isScrolled ? "50%" : "100%",
                maxWidth: isMobile && isScrolled ? "20rem" : "none",
                boxShadow: isMobile && isScrolled ? "0 4px 12px rgba(0, 0, 0, 0.08)" : "none",
                gap: isMobile && isScrolled ? 0 : "0.5rem",
              }}
            >
              <SidebarTrigger 
                className="-ml-1 transition-all duration-500 ease-in-out" 
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
                className="h-4 transition-all duration-500 ease-in-out"
                style={{
                  opacity: isMobile && isScrolled ? 0 : 1,
                  width: isMobile && isScrolled ? 0 : "auto",
                  marginLeft: isMobile && isScrolled ? 0 : undefined,
                  marginRight: isMobile && isScrolled ? 0 : "0.5rem",
                  transform: isMobile && isScrolled ? "scale(0)" : "scale(1)",
                }}
              />
              <h2 
                className="leading-tight transition-all duration-500 ease-in-out truncate"
                style={{
                  fontSize: isMobile ? (isScrolled ? "0.75rem" : "1rem") : (isScrolled ? "0.875rem" : "1.125rem"),
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
              <CardContent 
                ref={messagesContainerRef}
                className="flex-1 space-y-4 overflow-y-auto p-6"
              >
                {messages.map((msg, i) => {
                  switch (msg.sender) {
                    case "user":
                      return (
                        <div key={i} className="ml-auto max-w-[80%] rounded-md bg-user-message p-3 text-user-message-foreground shadow">
                          <div className="mb-1 text-sm font-bold">You</div>
                          <MarkdownWithBibleVerses content={msg.content} />
                        </div>
                      );
                    case "parrot":
                      return (
                        <div
                          key={i}
                          className="group relative mr-auto max-w-[80%] rounded-md bg-parrot-message p-3 text-parrot-message-foreground shadow"
                        >
                          <div className="mb-1 text-sm font-bold">Parrot</div>
                          <MarkdownWithBibleVerses content={msg.content} />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={
                              copiedMessageIndex === i ? "Markdown copied" : "Copy markdown"
                            }
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
                            {copiedMessageIndex === i ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      );
                    case "calvin":
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
                    case "gotQuestions":
                      return (
                        <div key={i} className="mr-auto mt-2 max-w-[80%]">
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`gotQuestions-${i}`}>
                              <AccordionTrigger>Additional Sources/Materials</AccordionTrigger>
                              <AccordionContent>
                                <MarkdownWithBibleVerses content={msg.content} />
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      );
                    default:
                      return null;
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
