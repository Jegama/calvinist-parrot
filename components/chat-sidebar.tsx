"use client";

import * as React from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";

import type { ChatSummary } from "@/hooks/use-chat-list";
import { chatTitleMatches, groupChatsByDate } from "@/lib/chat-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  chats: ChatSummary[];
  currentChatId?: string;
  onDelete: (chatId: string) => Promise<void>;
  onRename: (chatId: string, conversationName: string) => Promise<void>;
  onDeleted?: (chatId: string) => void;
}

type PendingAction =
  | { type: "rename"; chat: ChatSummary }
  | { type: "delete"; chat: ChatSummary }
  | null;

export function AppSidebar({
  chats,
  currentChatId,
  onDelete,
  onRename,
  onDeleted,
  className,
  style,
  ...props
}: AppSidebarProps) {
  const [query, setQuery] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const locale =
    typeof navigator === "undefined" ? "en" : navigator.language || "en";

  const visibleChats = React.useMemo(
    () =>
      chats.filter((chat) =>
        chatTitleMatches(chat.conversationName || "Unnamed Conversation", query, locale),
      ),
    [chats, locale, query],
  );
  const groups = React.useMemo(() => groupChatsByDate(visibleChats), [visibleChats]);
  const dateFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  const mergedStyle = {
    ...style,
    top: "var(--app-header-height)",
    height: "calc(100vh - var(--app-header-height))",
    borderColor: "hsl(var(--sidebar-border))",
    boxShadow: "2px 0 8px hsl(var(--foreground) / 0.04)",
  } as CSSProperties;

  const openRename = (chat: ChatSummary) => {
    setRenameValue(chat.conversationName);
    setPendingAction({ type: "rename", chat });
  };

  const finishAction = async () => {
    if (!pendingAction) return;
    setIsSaving(true);
    try {
      if (pendingAction.type === "rename") {
        const name = renameValue.trim();
        if (!name) return;
        await onRename(pendingAction.chat.id, name);
        setAnnouncement(`Renamed conversation to ${name}.`);
      } else {
        await onDelete(pendingAction.chat.id);
        onDeleted?.(pendingAction.chat.id);
        setAnnouncement("Conversation deleted.");
      }
      setPendingAction(null);
    } catch (error) {
      console.error("Conversation action failed:", error);
      setAnnouncement(
        pendingAction.type === "rename"
          ? "The conversation could not be renamed."
          : "The conversation could not be deleted.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Sidebar
        {...props}
        className={`${className ?? ""} transition-[top,height] duration-200 motion-reduce:transition-none`}
        style={mergedStyle}
      >
        <SidebarHeader className="gap-3 p-3">
          <Button asChild className="w-full justify-start">
            <Link href="/" prefetch={false}>
              <Plus className="h-4 w-4" />
              New chat
            </Link>
          </Button>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <SidebarInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="h-10 bg-input-bg ps-8"
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.key} className="pt-1">
              <SidebarGroupLabel className="font-semibold">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.chats.map((chat) => (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={chat.id === currentChatId}
                        size="lg"
                        className="sidebar-button h-auto min-h-12 pe-11"
                      >
                        <Link
                          href={`/${chat.id}`}
                          prefetch={false}
                          title={`${chat.conversationName || "Unnamed Conversation"} — ${dateFormatter.format(new Date(chat.modifiedAt))}`}
                        >
                          <span className="line-clamp-2 whitespace-normal break-words text-start leading-snug">
                            {chat.conversationName || "Unnamed Conversation"}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction
                            aria-label={`Actions for ${chat.conversationName || "Unnamed Conversation"}`}
                            className="top-2 h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-w-64">
                          <DropdownMenuItem
                            className="whitespace-normal"
                            onSelect={() => openRename(chat)}
                          >
                            <Pencil className="h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="whitespace-normal text-destructive focus:text-destructive"
                            onSelect={() => setPendingAction({ type: "delete", chat })}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
          {visibleChats.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {query ? "No conversations match your search." : "Your conversations will appear here."}
            </p>
          ) : null}
        </SidebarContent>
      </Sidebar>

      <Dialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setPendingAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.type === "rename"
                ? "Rename conversation"
                : "Delete conversation?"}
            </DialogTitle>
            <DialogDescription>
              {pendingAction?.type === "rename"
                ? "Choose a clear name you will recognize later."
                : "This permanently removes the conversation and its messages."}
            </DialogDescription>
          </DialogHeader>
          {pendingAction?.type === "rename" ? (
            <Input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              maxLength={120}
              aria-label="Conversation name"
              className="bg-input-bg"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void finishAction();
                }
              }}
            />
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingAction(null)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={pendingAction?.type === "delete" ? "destructive" : "default"}
              onClick={() => void finishAction()}
              disabled={
                isSaving ||
                (pendingAction?.type === "rename" && !renameValue.trim())
              }
            >
              {isSaving
                ? "Saving…"
                : pendingAction?.type === "rename"
                  ? "Rename"
                  : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
