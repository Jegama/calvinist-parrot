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
  | { type: "progress"; content: string }
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
  const [sending, setSending] = useState(false);

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
    // Attempt to get the current user
    (async () => {
      try {
        const { account } = await import("@/utils/appwrite");
        const currentUser = await account.get();
        setUserId(currentUser.$id);
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    })();
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

  // --- 2) Send Message ---

  async function handleSendMessage() {
    if (!input.trim()) return;
    setSending(true);
    const userInput = input.trim();
    setInput("");

    // Immediately add user message to UI
    setMessages((msgs) => [...msgs, { sender: "user", content: userInput }]);

    const response = await fetch("/api/parrot-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: params.chatId,
        message: userInput,
      }),
    });

    if (!response.ok || !response.body) {
      console.error("Error sending message");
      setSending(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const appendToken = (sender: string, token: string) => {
      setMessages((msgs) => {
        if (msgs.length > 0 && msgs[msgs.length - 1].sender === sender) {
          // Append partial tokens to the last message if same sender
          return [
            ...msgs.slice(0, -1),
            { sender, content: msgs[msgs.length - 1].content + token },
          ];
        } else {
          // Otherwise, create a new message
          return [...msgs, { sender, content: token }];
        }
      });
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        await fetchChat();  // Refresh from DB
        await fetchChats();
        setSending(false);
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
          case "info":
            // Optional: handle info messages
            break;
          case "parrot":
            appendToken("parrot", data.content);
            break;
          case "calvin":
            appendToken("calvin", data.content);
            break;
          case "gotQuestions":
            // Insert directly into the conversation flow
            setMessages((msgs) => [...msgs, { sender: "gotQuestions", content: data.content }]);
            break;
          case "done":
            // End of streaming
            await fetchChat();
            await fetchChats();
            setSending(false);
            return;
          default:
            console.warn("Unknown event type:", data.type);
        }
      }
    }
  }

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
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <h2>{chat.conversationName}</h2>
          </header>

          {/* Main Content */}
          <div className="flex-1 overflow-auto p-4 top-14 pb-28">
            <Card className="w-full max-w-2xl mx-auto">
              <CardContent className="flex flex-col gap-4 p-4">
                {messages.map((msg, i) => {
                  // Render each message according to sender
                  switch (msg.sender) {
                    case "user": {
                      return (
                        <div
                          key={i}
                          className="max-w-[80%] p-2 rounded-md ml-auto bg-blue-500 text-white"
                        >
                          <div className="text-sm font-bold mb-1">You</div>
                          <MarkdownWithBibleVerses content={msg.content} />
                        </div>
                      );
                    }

                    case "parrot": {
                      return (
                        <div
                          key={i}
                          className="max-w-[80%] p-2 rounded-md mr-auto bg-green-500 text-white"
                        >
                          <div className="text-sm font-bold mb-1">Parrot</div>
                          <MarkdownWithBibleVerses content={msg.content} />
                        </div>
                      );
                    }

                    case "calvin": {
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
                    }

                    case "gotQuestions": {
                      // For each gotQuestions message, we create an inline accordion
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
                    }

                    case "bibleCommentary": {
                      // Optionally, you could do the same approach with an inline accordion
                      return (
                        <div key={i} className="max-w-[80%] mr-auto mt-2">
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`bibleCommentary-${i}`}>
                              <AccordionTrigger>Bible Commentary</AccordionTrigger>
                              <AccordionContent>
                                <MarkdownWithBibleVerses content={msg.content} />
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      );
                    }

                    default:
                      return null;
                  }
                })}
                <div ref={messagesEndRef} />
              </CardContent>
            </Card>
          </div>

          {/* Input Section */}
          <div className="fixed bottom-4 w-full px-4 flex justify-center">
            <Card className="w-full max-w-2xl mx-auto">
              <CardContent className="w-full flex items-center gap-2 p-4">
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
                  disabled={sending}
                />
                {sending ? (
                  <div className="flex items-center">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    <span>Sending...</span>
                  </div>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    Send
                  </button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
