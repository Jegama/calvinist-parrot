// app/main-chat/page.tsx

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { account } from "@/utils/appwrite";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

type Chat = {
  id: string;
  conversationName: string;
};

export default function MainChatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await account.get();
        setUserId(currentUser.$id);
      } catch (error) {
        console.error("Error fetching profile info:", error);
      }
    };
    fetchUser();
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

  const handleStartNewChat = async () => {
    if (!userId) {
      setErrorMessage("Please log in to start a new chat.");
      return;
    }

    try {
      const response = await fetch('/api/parrot-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to create chat session');
      }

      const data = await response.json();
      router.push(`/main-chat/${data.chatId}`);
    } catch (error: unknown) {
      console.error("Error starting new chat:", error);
      setErrorMessage("An error occurred while starting a new chat.");
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar chats={chats} />
      <SidebarInset>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {userId === null ? (
          <Card className="max-w-2xl mx-auto mt-8 mb-8">
            <CardHeader>
              <CardTitle>Main Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <p>You must be logged in to view or start a chat.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {errorMessage && <p className="text-red-600 mb-4">{errorMessage}</p>}
            <Button onClick={handleStartNewChat}>Start New Chat</Button>
          </>
        )}
      </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
