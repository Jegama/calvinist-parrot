"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/chat-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { ChatSummary } from "@/hooks/use-chat-list";
import { cn } from "@/lib/utils";

type ChatShellProps = {
  chats: ChatSummary[];
  currentChatId?: string;
  title: ReactNode;
  toolbarEnd?: ReactNode;
  children: ReactNode;
  onDelete: (chatId: string) => Promise<void>;
  onRename: (chatId: string, conversationName: string) => Promise<void>;
  onDeleted?: (chatId: string) => void;
  contentClassName?: string;
};

export function ChatShell({
  chats,
  currentChatId,
  title,
  toolbarEnd,
  children,
  onDelete,
  onRename,
  onDeleted,
  contentClassName,
}: ChatShellProps) {
  return (
    <SidebarProvider
      style={{ minHeight: "calc(100vh - var(--app-header-height))" }}
    >
      <AppSidebar
        chats={chats}
        currentChatId={currentChatId}
        onDelete={onDelete}
        onRename={onRename}
        onDeleted={onDeleted}
      />
      <SidebarInset className="h-[calc(100vh-var(--app-header-height))] min-h-[calc(100vh-var(--app-header-height))] overflow-hidden !bg-transparent">
        <div className="flex h-full min-h-0 flex-col">
          <header className="z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-card/95 px-3 py-2 shadow-[0_2px_8px_hsl(var(--foreground)/0.06)] backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:px-4">
            <SidebarTrigger className="shrink-0" />
            <Separator orientation="vertical" className="h-5" />
            <div className="min-w-0 flex-1">
              <h1
                className="truncate font-serif text-base font-semibold text-foreground sm:text-lg"
                dir="auto"
              >
                {title}
              </h1>
            </div>
            {toolbarEnd}
          </header>
          <main className={cn("min-h-0 flex-1", contentClassName)}>{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
