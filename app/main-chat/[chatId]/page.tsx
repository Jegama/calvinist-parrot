// app/main-chat/[chatId]/page.tsx

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
// import { BackToTop } from '@/components/BackToTop';

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
  | { type: 'info' | 'done' }
  | { type: 'parrot' | 'calvin' | 'parrot_final'; content: string };

export default function ChatPage() {
  const params = useParams() as { chatId: string };
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [errorMessage, setErrorMessage] = useState("");
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);

  const fetchChat = useCallback(async () => {
    try {
      const response = await fetch(`/api/parrot-chat?chatId=${params.chatId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch chat');
      }
      const data = await response.json();
      setChat(data.chat);
      setMessages(data.messages);
    } catch (error: unknown) {
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage() {
    if (!input.trim()) return;
    setSending(true);
    const userInput = input.trim();
    setInput('');

    const response = await fetch('/api/parrot-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const appendToken = (sender: string, token: string) => {
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
        await fetchChat();
        await fetchChats();
        setSending(false);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

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
          case 'info':
            break;
          case 'parrot':
            appendToken('parrot', data.content);
            break;
          case 'calvin':
            appendToken('calvin', data.content);
            break;
          case 'parrot_final':
            appendToken('parrot', data.content);
            break;
          case 'done':
            await fetchChat();
            await fetchChats();
            setSending(false);
            return;
          default:
              console.warn("Unknown event type");
        }
      }
    }
  }

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
          {/* Sidebar trigger and chat name */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <h2>{chat.conversationName}</h2>
          </header>

          {/* Chat Messages */}
          <div className="flex-1 overflow-auto p-4 top-14 pb-28">
            <Card className="w-full max-w-2xl mx-auto">
              <CardContent className="flex flex-col gap-4 p-4">
                {messages.map((msg, i) => {
                  const isUser = msg.sender === 'user';
                  const bubbleClass = isUser
                    ? "ml-auto bg-blue-500 text-white"
                    : msg.sender === 'parrot'
                      ? "mr-auto bg-green-500 text-white"
                      : "mr-auto bg-yellow-500 text-white";

                  const senderName = isUser ? 'You' : msg.sender.charAt(0).toUpperCase() + msg.sender.slice(1);

                  return (
                    <div key={i} className={`max-w-[80%] p-2 rounded-md ${bubbleClass}`}>
                      <div className="text-sm font-bold mb-1">{senderName}</div>
                      <MarkdownWithBibleVerses content={msg.content} />
                    </div>  
                  );
                })}
                <div ref={messagesEndRef}></div>
              </CardContent>
            </Card>
          </div>

          {/* Input section */}
          <div className="fixed bottom-4 w-full px-4 flex justify-center">
            <Card className="w-full max-w-2xl mx-auto">
              <CardContent className="w-full flex items-center gap-2 p-4">
                <input
                  className="flex-1 border rounded p-2"
                  placeholder="Type your message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
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
