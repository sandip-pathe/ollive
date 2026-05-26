"use client";

import { Plus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ConversationSummary } from "@/app/lib/api";

import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import { RecentChatItem } from "./recent-chat-item";
import { UserProfile } from "./user-profile";

type SidebarProps = {
  open: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  conversations: ConversationSummary[];
  selectedConversationId?: string | null;
  loading?: boolean;
  onSelectConversation: (conversationId: string) => void;
};

export function Sidebar({
  open,
  onToggle,
  onNewChat,
  conversations,
  selectedConversationId,
  loading,
  onSelectConversation,
}: SidebarProps) {
  return (
    <ShadcnSidebar
      collapsible="none" // <-- THIS FIXES THE BLANK MOBILE SIDEBAR
      className="border-none w-full bg-[#f3f1ea]"
    >
      <SidebarHeader className="bg-[#f3f1ea] px-4 pb-3 pt-4">
        <div className="mb-4 flex items-center justify-between">
          {open ? (
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d8d4c8] bg-[#fcefbc] text-[#2d2d28]">
                <h1 className="font-serif text-[35px] font-black leading-none tracking-tight text-[#1f1f1c]">
                  O
                </h1>
              </div>

              <h2 className="text-[35px] leading-none tracking-tight text-[#1f1f1c]">
                Ollive
              </h2>
            </div>
          ) : (
            <div />
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 text-[#5f5b54] hover:bg-[#ece8de]"
          >
            {open ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onNewChat}
              className="h-11 rounded-xl border border-[#dfdbd0] bg-[#f7f5ee] text-[#3a3935] hover:bg-[#ece8de]"
            >
              <Plus className="h-4 w-4 shrink-0" />
              {open && <span>New chat</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="bg-[#f3f1ea]">
        {open && (
          <ScrollArea className="min-h-0 flex-1 px-3">
            <div className="pb-6">
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-[#8a867d]">
                Recents
              </p>

              <div className="space-y-1">
                {loading ? (
                  <div className="rounded-xl px-3 py-2 text-sm text-[#6d695f]">
                    Loading conversations...
                  </div>
                ) : null}

                {loading === false && conversations.length === 0 ? (
                  <div className="rounded-xl px-3 py-2 text-sm text-[#6d695f]">
                    No conversations yet.
                  </div>
                ) : null}

                {conversations.map((conversation) => (
                  <RecentChatItem
                    key={conversation.id}
                    title={conversation.title || "Untitled conversation"}
                    active={conversation.id === selectedConversationId}
                    onClick={() => onSelectConversation(conversation.id)}
                  />
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
      </SidebarContent>

      <SidebarFooter className="bg-[#f3f1ea] px-3 pb-3 pt-2">
        <UserProfile />
      </SidebarFooter>
    </ShadcnSidebar>
  );
}

export { Sidebar as AppSidebar };
