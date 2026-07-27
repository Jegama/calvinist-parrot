"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createChatResponseSchema,
  type CreateChatRequest,
} from "@/lib/api/contracts";

export type ChatSummary = {
  id: string;
  conversationName: string;
  modifiedAt: string;
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
    (
      chat: Omit<ChatSummary, "modifiedAt"> &
        Partial<Pick<ChatSummary, "modifiedAt">>,
    ) => {
      queryClient.setQueryData<ChatSummary[]>(queryKey, (current = []) => {
        const existingIndex = current.findIndex((item) => item.id === chat.id);
        if (existingIndex !== -1) {
          const next = current.slice();
          next[existingIndex] = {
            ...next[existingIndex],
            ...chat,
            modifiedAt: chat.modifiedAt ?? new Date().toISOString(),
          };
          return next;
        }
        return [
          {
            ...chat,
            modifiedAt: chat.modifiedAt ?? new Date().toISOString(),
          },
          ...current,
        ];
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
      variables: CreateChatRequest,
    ) => {
      const response = await fetch("/api/v1/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variables),
      });
      if (!response.ok) {
        throw new Error("Failed to create chat session");
      }
      return createChatResponseSchema.parse(await response.json());
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({
      chatId,
      conversationName,
    }: {
      chatId: string;
      conversationName: string;
    }) => {
      const response = await fetch("/api/user-chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, conversationName }),
      });
      if (!response.ok) throw new Error("Failed to rename conversation");
      return (await response.json()) as { chat: ChatSummary };
    },
    onMutate: async ({ chatId, conversationName }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ChatSummary[]>(queryKey);
      queryClient.setQueryData<ChatSummary[]>(queryKey, (current = []) =>
        current.map((chat) =>
          chat.id === chatId
            ? { ...chat, conversationName, modifiedAt: new Date().toISOString() }
            : chat,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const params = new URLSearchParams({ chatId });
      const response = await fetch(`/api/user-chats?${params.toString()}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete conversation");
      return chatId;
    },
    onMutate: async (chatId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ChatSummary[]>(queryKey);
      queryClient.setQueryData<ChatSummary[]>(queryKey, (current = []) =>
        current.filter((chat) => chat.id !== chatId),
      );
      return { previous };
    },
    onError: (_error, _chatId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
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
    renameChat: renameMutation,
    deleteChat: deleteMutation,
  };
}
