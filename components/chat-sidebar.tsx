// components/chat-sidebar.tsx

import * as React from "react"
import type { CSSProperties } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  // SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { Trash2 } from "lucide-react"
import { useCallback } from "react"

type ChatItem = {
  id: string
  conversationName: string
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  chats: ChatItem[];
  currentChatId?: string;
  onDeleted?: (chatId: string) => void;
}

export function AppSidebar({ chats, currentChatId, onDeleted, className, style, ...props }: AppSidebarProps) {
  const mergedStyle = {
    ...style,
    top: "var(--app-header-height)",
  } as CSSProperties

  const handleDelete = useCallback(async (chatId: string) => {
    try {
      const params = new URLSearchParams({ chatId });
      // userId is verified via cookie on the server; optional to include here
      const res = await fetch(`/api/user-chats?${params.toString()}`, { method: "DELETE" });
      if (!res.ok) throw new Error('Failed to delete chat');
      onDeleted?.(chatId);
    } catch (e) {
      console.error('Delete chat failed', e);
    }
  }, [onDeleted]);

  return (
    <Sidebar {...props} className={className} style={mergedStyle}>
      <SidebarContent>
        <SidebarHeader><br />Your Conversations</SidebarHeader>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {chats.map((c) => (
                <React.Fragment key={c.id}>
                  <SidebarMenuItem className="px-2 py-0.5 border-t border-sidebar-border first:border-t-0">
                    <div className="group flex items-center justify-between gap-2">
                      <SidebarMenuButton
                        asChild
                        isActive={c.id === currentChatId}
                        size="lg"
                        className="sidebar-button flex-1 text-left h-auto min-h-8 py-1.5"
                      >
                        <Link href={`/${c.id}`} prefetch={false} title={c.conversationName || "Unnamed Conversation"}>
                          <span
                            className="block text-sm leading-tight"
                            style={{
                              display: '-webkit-box',
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              WebkitLineClamp: 2,
                              wordBreak: 'break-word',
                              whiteSpace: 'normal',
                            }}
                          >
                            {c.conversationName || "Unnamed Conversation"}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                      <button
                        type="button"
                        aria-label="Delete chat"
                        title="Delete chat"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 md:pointer-events-none md:group-hover:pointer-events-auto"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(c.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </SidebarMenuItem>
                  {/* Separator replaced by item borders for tighter spacing */}
                </React.Fragment>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}