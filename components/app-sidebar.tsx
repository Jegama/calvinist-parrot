// components/app-sidebar.tsx

import * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
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

export function AppSidebar({ chats, currentChatId, ...props }: AppSidebarProps) {
  return (
    <Sidebar {...props} className="top-14">
      <SidebarHeader>
        {/* Add your own search or version switcher if needed */}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Your Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton asChild isActive={c.id === currentChatId}>
                    <Link href={`/main-chat/${c.id}`}>{c.conversationName || "Unnamed Conversation"}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}