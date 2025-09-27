// app/page.tsx

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { account } from "@/utils/appwrite";
import { AppSidebar } from "@/components/chat-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

type Chat = {
  id: string;
  conversationName: string;
};

export default function MainChatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [initialQuestion, setInitialQuestion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const router = useRouter();

  useEffect(() => {
    async function initUser() {
      try {
        const currentUser = await account.get();
        setUserId(currentUser.$id);
      } catch {
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
    const fetchChats = async () => {
      if (!userId) return;
      const res = await fetch(`/api/user-chats?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats);
      }
    };
    fetchChats();
  }, [userId]);

  const handleStartNewChat = (e: React.FormEvent) => {
    e.preventDefault();
    const question = initialQuestion.trim();
    if (!question) return;

    const newChatId = crypto.randomUUID();

    setErrorMessage("");

    void (async () => {
      try {
        const createResponse = await fetch('/api/parrot-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, initialQuestion: question, clientChatId: newChatId }),
        });

        if (!createResponse.ok) {
          throw new Error('Failed to create chat session');
        }

        const { chatId } = await createResponse.json();
        if (!chatId) {
          throw new Error('Chat session created without an ID');
        }
      } catch (error) {
        console.error("Error starting new chat:", error);
        setErrorMessage("An error occurred while starting a new chat.");
      }
    })();

    router.push(`/${newChatId}?initialQuestion=${encodeURIComponent(question)}`);
  };

  return (
    <SidebarProvider>
      <AppSidebar chats={chats} />
      <SidebarInset className="flex min-h-[calc(100vh-var(--app-header-height))] flex-col">
        <header className="sticky top-[var(--app-header-height)] z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <Card className="w-full max-w-3xl">
            <CardHeader>
              <div className="flex items-center space-x-4">
                <Image
                  src="/Logo.png"
                  alt="Calvinist Parrot"
                  width={100}
                  height={100}
                  unoptimized={true}
                />
                <CardTitle className="w-full justify-center text-3xl font-bold">Calvinist Parrot</CardTitle>
              </div>
              <CardDescription>
                What theological question do you have?
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errorMessage && <p className="mb-4 text-red-600">{errorMessage}</p>}
              <form onSubmit={handleStartNewChat} className="space-y-4">
                <Textarea
                  placeholder="Enter your question here..."
                  value={initialQuestion}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInitialQuestion(e.target.value)}
                />
                <Button type="submit" className="w-full">
                  Start Chat
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
