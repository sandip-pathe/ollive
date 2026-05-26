"use client";

import { useState } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "@/components/sidebar/sidebar";
import { ChatLayout } from "@/components/chat/chat-layout";
import { InspectPanel } from "@/components/inspect/inspect-panel";

import { useIsMobile } from "@/hooks/use-mobile";
import type { ConversationSummary } from "@/app/lib/api";

type ChatSidebarAPI = {
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  loading: boolean;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
};

export function WorkspaceShell() {
  const isMobile = useIsMobile();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectOpen, setInspectOpen] = useState(false);

  // Chat registers sidebar data/actions here
  const [chatApi, setChatApi] = useState<ChatSidebarAPI | null>(null);

  function toggleInspect() {
    setInspectOpen((prev) => !prev);
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-[#faf9f5]">
        {/* =========================
            DESKTOP SIDEBAR
        ========================= */}
        {!isMobile && chatApi && sidebarOpen && (
          <div className="h-full w-64 shrink-0 border-r border-[#e3e0d6] overflow-hidden transition-all duration-300 ease-in-out">
            <AppSidebar
              open={true}
              onToggle={() => setSidebarOpen(false)}
              onNewChat={chatApi.onNewChat}
              conversations={chatApi.conversations}
              selectedConversationId={chatApi.selectedConversationId}
              loading={chatApi.loading}
              onSelectConversation={chatApi.onSelectConversation}
            />
          </div>
        )}

        {/* =========================
            MAIN WORKSPACE AREA
        ========================= */}
        <div className="flex flex-1 min-w-0 h-full overflow-hidden">
          {/* CHAT PANEL (Takes remaining space, which is 50% when Inspect is open) */}
          <div className="flex-1 min-w-0 h-full overflow-hidden relative">
            <ChatLayout
              sidebarOpen={sidebarOpen}
              inspectOpen={inspectOpen}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              onToggleInspect={toggleInspect}
              registerShellHandlers={setChatApi}
            />
          </div>

          {/* DESKTOP INSPECT PANEL (Fixed at exactly 50% width) */}
          {!isMobile && inspectOpen && (
            <div className="w-1/2 shrink-0 min-w-0 h-full border-l border-[#e3e0d6] bg-[#f8f6f0] overflow-hidden transition-all duration-300 ease-in-out">
              <InspectPanel
                sessionId={chatApi?.selectedConversationId || undefined}
                onClose={() => setInspectOpen(false)}
              />
            </div>
          )}
        </div>

        {/* =========================
            MOBILE SIDEBAR SHEET
        ========================= */}
        {isMobile && chatApi && (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-72 border-r-0 p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <AppSidebar
                open={true}
                onToggle={() => setSidebarOpen(false)}
                onNewChat={chatApi.onNewChat}
                conversations={chatApi.conversations}
                selectedConversationId={chatApi.selectedConversationId}
                loading={chatApi.loading}
                onSelectConversation={(id: string) => {
                  chatApi.onSelectConversation(id);
                  setSidebarOpen(false);
                }}
              />
            </SheetContent>
          </Sheet>
        )}

        {/* =========================
            MOBILE INSPECT SHEET (Opens from Bottom)
        ========================= */}
        {isMobile && (
          <Sheet open={inspectOpen} onOpenChange={setInspectOpen}>
            <SheetContent
              side="bottom"
              className="h-[85vh] w-full p-0 border-t-0 rounded-t-3xl overflow-hidden shadow-2xl"
            >
              <SheetTitle className="sr-only">Inspect Details</SheetTitle>
              <InspectPanel
                sessionId={chatApi?.selectedConversationId || undefined}
                onClose={() => setInspectOpen(false)}
              />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </SidebarProvider>
  );
}
