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

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialQuestion.trim()) return;

    try {
      const createResponse = await fetch('/api/parrot-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, initialQuestion }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create chat session');
      }

      const { chatId } = await createResponse.json();
      router.push(`/${chatId}`);
    } catch (error) {
      console.error("Error starting new chat:", error);
      setErrorMessage("An error occurred while starting a new chat.");
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar chats={chats} />
      <SidebarInset>
        <div className="pl-4">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
          </header>
          <main className="flex flex-1 items-start justify-center pt-[5vh] p-4 overflow-auto">
            <Card className="w-[90%] mx-auto">
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <Image
                    src="/Logo.png"
                    alt="Calvinist Parrot"
                    width={100}
                    height={100}
                    unoptimized={true}
                  />
                  <CardTitle className="text-3xl font-bold justify-center w-full">Calvinist Parrot</CardTitle>
                </div>
                <CardDescription>
                  What theological question do you have?
                </CardDescription>
              </CardHeader>
              <CardContent>
                {errorMessage && <p className="text-red-600 mb-4">{errorMessage}</p>}
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
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
