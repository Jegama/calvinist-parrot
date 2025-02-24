// app/main-chat/page.tsx

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { account } from "@/utils/appwrite";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

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
      router.push(`/main-chat/${chatId}`);
    } catch (error) {
      console.error("Error starting new chat:", error);
      setErrorMessage("An error occurred while starting a new chat.");
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar chats={chats} />
      <SidebarInset>
        <main className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-[90%] max-w-2xl">
            <CardHeader>
              <CardTitle className="text-3xl font-bold">Parrot Chat</CardTitle>
              <CardDescription>
                Ask the Parrot a theological question
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errorMessage && <p className="text-red-600 mb-4">{errorMessage}</p>}
              <form onSubmit={handleStartNewChat} className="space-y-4">
                <Input
                  placeholder="Enter your question here..."
                  value={initialQuestion}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInitialQuestion(e.target.value)}
                />
                <Button type="submit" className="w-full">
                  Start Chat
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
