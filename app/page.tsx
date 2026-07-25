"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import {
  ChatComposer,
  LANDING_CHAT_DISCLAIMER,
} from "@/components/chat/chat-composer";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatShortcuts } from "@/components/chat/chat-shortcuts";
import { SuggestedQuestions } from "@/components/chat/suggested-questions";
import { useAuth } from "@/hooks/use-auth";
import { useChatList } from "@/hooks/use-chat-list";

export default function MainChatPage() {
  const [initialQuestion, setInitialQuestion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const { user } = useAuth();
  const {
    chats,
    createChat,
    upsertChat,
    renameChat,
    deleteChat,
  } = useChatList(user?.$id ?? "guest");

  const handleStartNewChat = () => {
    const question = initialQuestion.trim();
    if (!question || createChat.isPending) return;

    const clientChatId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    setErrorMessage("");

    createChat.mutate(
      { initialQuestion: question, clientChatId, requestId },
      {
        onSuccess: ({ chatId, messageId }) => {
          upsertChat({
            id: chatId,
            conversationName: "New Conversation",
          });
          router.push(`/${chatId}?autoSendMessageId=${encodeURIComponent(messageId)}`);
        },
        onError: (error) => {
          console.error("Error starting new chat:", error);
          setErrorMessage(
            "We could not start the conversation. Please try again.",
          );
        },
      },
    );
  };

  return (
    <ChatShell
      chats={chats}
      title="New chat"
      onDelete={(chatId) =>
        deleteChat.mutateAsync(chatId).then(() => undefined)
      }
      onRename={(chatId, conversationName) =>
        renameChat.mutateAsync({ chatId, conversationName }).then(() => undefined)
      }
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-8 lg:justify-center lg:py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col landscape:flex-none lg:flex-none">
          <header className="mb-6 text-center">
            <Image
              src="/Logo.png"
              alt=""
              width={88}
              height={88}
              priority
              className="mx-auto mb-3 hidden h-20 w-20 min-[390px]:block sm:h-24 sm:w-24"
            />
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Calvinist Parrot
            </h2>
            <p className="mt-2 text-muted-foreground">
              What theological question do you have?
            </p>
          </header>

          <ChatComposer
            value={initialQuestion}
            onChange={setInitialQuestion}
            onSubmit={handleStartNewChat}
            isSubmitting={createChat.isPending}
            placeholder="Enter your question here..."
            submitLabel="Start Chat"
            layout="stacked"
            size="hero"
            disclaimer={LANDING_CHAT_DISCLAIMER}
            autoFocus
            error={errorMessage}
          />

          <div className="mt-5">
            <SuggestedQuestions onSelect={setInitialQuestion} />
          </div>
          <div className="mt-auto pt-6 lg:hidden landscape:hidden">
            <ChatShortcuts />
          </div>
        </div>
      </div>
    </ChatShell>
  );
}
