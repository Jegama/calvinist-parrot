// app/main-chat/[chatId]/page.tsx

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<{ title: string; content: string } | null>(null);
  const autoSentRef = useRef(false);

  // --- 1) Fetch Chat, User, and Chat List ---

  const fetchChat = useCallback(async () => {
    try {
      const response = await fetch(`/api/parrot-chat?chatId=${params.chatId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch chat");
      }
      const data = await response.json();
      setChat(data.chat);
      setMessages(data.messages);
    } catch (error) {
      console.error("Error fetching chat:", error);
      setErrorMessage("An error occurred while fetching the chat.");
    }
  }, [params.chatId]);

  const fetchChats = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/user-chats?userId=${userId}`);
    if (res.ok) {
      const data = await res.json();
      setChats(data.chats);
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
    if (params.chatId) {
      fetchChat();
    }
  }, [params.chatId, fetchChat]);

  useEffect(() => {
    fetchChats();
  }, [userId, fetchChats]);

  useEffect(() => {
    // Always scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Add progress to the dependencies so we fetch when progress becomes null
  useEffect(() => {
    if (params.chatId && !progress) {
      fetchChat();
      fetchChats();
    }
  }, [params.chatId, fetchChat, fetchChats, progress]);

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
          setProgress(null); // This will trigger the useEffect to fetch updates
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
              setProgress(null); // This will trigger the useEffect to fetch updates
              return;
            default:
              console.warn("Unknown event type:", data.type);
          }
        }
      }
    },
    [input, params.chatId]
  );

  // --- Auto-trigger sending if only the initial user message exists ---
  useEffect(() => {
    if (messages.length === 1 && messages[0].sender === "user" && !autoSentRef.current) {
      autoSentRef.current = true;
      // Call handleSendMessage with autotrigger flag
      handleSendMessage({ message: messages[0].content, isAutoTrigger: true });
    }
  }, [messages, handleSendMessage]);

  // --- 3) Rendering ---
  if (errorMessage) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <p className="text-red-600">{errorMessage}</p>
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
      <SidebarInset>
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <h2>{chat.conversationName}</h2>
          </header>
          <div className="flex-1 overflow-auto p-4 top-14 pb-28">
            <Card className="w-full max-w-2xl mx-auto">
              <CardContent className="flex flex-col gap-4 p-4">
                {messages.map((msg, i) => {
                  switch (msg.sender) {
                    case "user":
                      return (
                        <div key={i} className="max-w-[80%] p-2 rounded-md ml-auto bg-blue-500 text-white">
                          <div className="text-sm font-bold mb-1">You</div>
                          <MarkdownWithBibleVerses content={msg.content} />
                        </div>
                      );
                    case "parrot":
                      return (
                        <div key={i} className="max-w-[80%] p-2 rounded-md mr-auto bg-green-500 text-white">
                          <div className="text-sm font-bold mb-1">Parrot</div>
                          <MarkdownWithBibleVerses content={msg.content} />
                        </div>
                      );
                    case "calvin":
                      return (
                        <div key={i} className="max-w-[80%] mr-auto mt-2">
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`gotQuestions-${i}`}>
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
                        <div key={i} className="max-w-[80%] mr-auto mt-2">
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`gotQuestions-${i}`}>
                              <AccordionTrigger>Articles from &quot;Got Questions&quot;</AccordionTrigger>
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
            </Card>
          </div>
          <div className="fixed bottom-4 w-full px-4 flex justify-center">
            <Card className="w-full max-w-2xl mx-auto">
              <CardContent className="w-full flex items-center gap-2 p-4">
                {progress ? (
                  <div className="flex flex-col">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    <h3 className="font-bold">{progress.title}</h3>
                    <p>{progress.content}</p>
                  </div>
                ) : (
                  <>
                    <Textarea
                      className="flex-1 border rounded p-2 resize-none"
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
                    <button
                      onClick={() => handleSendMessage()}
                      className="bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      Send
                    </button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
