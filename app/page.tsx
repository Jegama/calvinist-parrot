// app/page.tsx

"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/chat-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useUserIdentifier } from "@/hooks/use-user-identifier";
import { useChatList } from "@/hooks/use-chat-list";

export default function MainChatPage() {
  const [initialQuestion, setInitialQuestion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const { userId, ensureCookieId } = useUserIdentifier();
  const { chats, createChat, upsertChat } = useChatList(userId);

  const handleStartNewChat = (e: React.FormEvent) => {
    e.preventDefault();
    const question = initialQuestion.trim();
    if (!question) return;

    const newChatId = crypto.randomUUID();

    setErrorMessage("");

    const activeUserId = userId ?? ensureCookieId();

    createChat.mutate(
      { userId: activeUserId, initialQuestion: question, clientChatId: newChatId },
      {
        onSuccess: ({ chatId }) => {
          upsertChat({ id: chatId, conversationName: "New Conversation" });
        },
        onError: (error) => {
          console.error("Error starting new chat:", error);
          setErrorMessage("An error occurred while starting a new chat.");
        },
      },
    );

    router.push(`/${newChatId}?initialQuestion=${encodeURIComponent(question)}`);
  };

  return (
    <SidebarProvider>
      <AppSidebar chats={chats} />
      <SidebarInset className="flex min-h-[calc(100vh-var(--app-header-height)-4rem)] flex-col">
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
                  priority
                  unoptimized={true}
                />
                <CardTitle className="w-full justify-center text-3xl font-bold">Calvinist Parrot</CardTitle>
              </div>
              <CardDescription>
                What theological question do you have?
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errorMessage && <p className="mb-4 text-destructive">{errorMessage}</p>}
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
