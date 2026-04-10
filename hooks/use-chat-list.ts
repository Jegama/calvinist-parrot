"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ChatSummary = {
  id: string;
  conversationName: string;
};

async function loadChats(): Promise<ChatSummary[]> {
  const response = await fetch("/api/user-chats");
  if (!response.ok) {
    throw new Error("Failed to load chats");
  }
  const json = (await response.json()) as { chats?: ChatSummary[] };
  return Array.isArray(json.chats) ? json.chats : [];
}

export function useChatList(actorKey: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["chat-list", actorKey], [actorKey]);

  const query = useQuery({
    queryKey,
    enabled: true,
    queryFn: () => loadChats(),
    staleTime: 1000 * 60 * 10,
  });

  const upsertChat = useCallback(
    (chat: ChatSummary) => {
      queryClient.setQueryData<ChatSummary[]>(queryKey, (current = []) => {
        const existingIndex = current.findIndex((item) => item.id === chat.id);
        if (existingIndex !== -1) {
          const next = current.slice();
          next[existingIndex] = chat;
          return next;
        }
        return [chat, ...current];
      });
    },
    [queryClient, queryKey],
  );

  const removeChat = useCallback(
    (chatId: string) => {
      queryClient.setQueryData<ChatSummary[]>(queryKey, (current = []) =>
        current.filter((chat) => chat.id !== chatId),
      );
    },
    [queryClient, queryKey],
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const createMutation = useMutation({
    mutationFn: async (
      variables: {
        initialQuestion: string;
        clientChatId?: string;
      },
    ) => {
      const response = await fetch("/api/parrot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variables),
      });
      if (!response.ok) {
        throw new Error("Failed to create chat session");
      }
      const json = (await response.json()) as { chatId?: string };
      if (!json.chatId) {
        throw new Error("Chat session created without an ID");
      }
      return { chatId: json.chatId };
    },
  });

  return {
    chats: query.data ?? [],
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    status: query.status,
    upsertChat,
    removeChat,
    invalidate,
    createChat: createMutation,
  };
}
