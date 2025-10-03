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

type ChatItem = {
  id: string
  conversationName: string
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  chats: ChatItem[];
  currentChatId?: string;
}

export function AppSidebar({ chats, currentChatId, className, style, ...props }: AppSidebarProps) {
  const mergedStyle = {
    ...style,
    top: "var(--app-header-height)",
  } as CSSProperties

  return (
    <Sidebar {...props} className={className} style={mergedStyle}>
      <SidebarContent>
        <SidebarHeader><br />Your Conversations</SidebarHeader>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((c, index) => (
                <React.Fragment key={c.id}>
                  <SidebarMenuItem className="px-2 py-1">
                    <SidebarMenuButton 
                      asChild 
                      isActive={c.id === currentChatId}
                      className="sidebar-button"
                    >
                      <Link href={`/${c.id}`}>{c.conversationName || "Unnamed Conversation"}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {index < chats.length - 1 && (
                    <hr className="border-t border-sidebar-border mx-2 my-1" />
                  )}
                </React.Fragment>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}