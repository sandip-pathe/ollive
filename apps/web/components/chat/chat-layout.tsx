"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import type { ChatMessage } from "./types";
import {
  API_BASE,
  apiFetch,
  type ConversationSummary,
  type Message as ApiMessage,
} from "@/app/lib/api";

function buildConversationTitle(prompt: string) {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  if (!trimmed) return "New chat";
  const words = trimmed.split(" ").slice(0, 6).join(" ");
  return words.length > 42 ? `${words.slice(0, 39).trim()}…` : words;
}

function toChatMessage(message: ApiMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    meta: message.content_redacted ? "Stored after redaction" : undefined,
  };
}

type ChatLayoutProps = {
  sidebarOpen: boolean;
  inspectOpen: boolean;
  onToggleSidebar: () => void;
  onToggleInspect: () => void;
  registerShellHandlers?: (api: {
    conversations: ConversationSummary[];
    selectedConversationId: string | null;
    loading: boolean;
    onNewChat: () => void;
    onSelectConversation: (id: string) => void;
  }) => void;
};

export function ChatLayout({
  sidebarOpen,
  inspectOpen,
  onToggleSidebar,
  onToggleInspect,
  registerShellHandlers,
}: ChatLayoutProps) {
  const [composer, setComposer] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [selectedConversationTitle, setSelectedConversationTitle] =
    useState("New chat");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );
  const heading =
    selectedConversation?.title || selectedConversationTitle || "New chat";

  const showLoader =
    streaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    messages[messages.length - 1].content.trim().length === 0;

  async function loadConversation(conversationId: string) {
    const detail = await apiFetch<{
      conversation: ConversationSummary;
      messages: ApiMessage[];
    }>(`/api/conversations/${conversationId}`);
    setSelectedConversationId(detail.conversation.id);
    setSelectedConversationTitle(detail.conversation.title || "New chat");
    setMessages(detail.messages.map(toChatMessage));
    return detail.conversation;
  }

  async function refreshConversations(preferredConversationId?: string) {
    setLoadingConversations(true);
    try {
      const list = await apiFetch<ConversationSummary[]>("/api/conversations");
      setConversations(list);
      const targetId = preferredConversationId || list[0]?.id || null;
      if (targetId) {
        await loadConversation(targetId);
      } else {
        setSelectedConversationId(null);
        setSelectedConversationTitle("New chat");
        setMessages([]);
      }
    } catch (error) {
      console.error("Failed to load conversations", error);
      setConversations([]);
      setSelectedConversationId(null);
      setSelectedConversationTitle("New chat");
      setMessages([]);
    } finally {
      setLoadingConversations(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const list =
          await apiFetch<ConversationSummary[]>("/api/conversations");
        if (!mounted) return;
        setConversations(list);
        const targetId = list[0]?.id || null;
        if (targetId) {
          await loadConversation(targetId);
        } else {
          setSelectedConversationId(null);
          setSelectedConversationTitle("New chat");
          setMessages([]);
        }
      } catch (error) {
        console.error("Failed to load conversations", error);
        if (mounted) {
          setConversations([]);
          setSelectedConversationId(null);
          setSelectedConversationTitle("New chat");
          setMessages([]);
        }
      } finally {
        if (mounted) setLoadingConversations(false);
      }
    })();
    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
  }, []);

  function voidLoadConversation(id: string) {
    void loadConversation(id);
  }

  async function ensureConversationId(prompt: string) {
    if (selectedConversationId) return selectedConversationId;
    const created = await apiFetch<ConversationSummary>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: buildConversationTitle(prompt) }),
    });
    setSelectedConversationId(created.id);
    setSelectedConversationTitle(
      created.title || buildConversationTitle(prompt),
    );
    setConversations((current) => [
      created,
      ...current.filter((item) => item.id !== created.id),
    ]);
    return created.id;
  }

  async function pauseStreaming() {
    const conversationId = activeConversationIdRef.current || selectedConversationId;
    if (!conversationId) {
      abortRef.current?.abort();
      return;
    }
    try {
      await apiFetch(`/api/conversations/${conversationId}/pause`, {
        method: "POST",
      });
    } catch (error) {
      console.error("Failed to pause conversation", error);
    } finally {
      abortRef.current?.abort();
    }
  }

  async function handleSubmit() {
    const value = composer.trim();
    if (!value || streaming) return;
    setComposer("");

    const convId = await ensureConversationId(value);
    activeConversationIdRef.current = convId;

    const optimisticUser: ChatMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: "user",
      content: value,
    };
    const optimisticAssistantId = `stream-${crypto.randomUUID()}`;
    const optimisticAssistant: ChatMessage = {
      id: optimisticAssistantId,
      role: "assistant",
      content: "",
    };
    setMessages((current) => [...current, optimisticUser, optimisticAssistant]);

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/conversations/${convId}/messages/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content: value }),
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body)
        throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (chunk) {
          buffer += decoder.decode(chunk, { stream: true });
          let splitIndex = buffer.indexOf("\n\n");
          while (splitIndex !== -1) {
            const raw = buffer.slice(0, splitIndex).trim();
            buffer = buffer.slice(splitIndex + 2);
            splitIndex = buffer.indexOf("\n\n");
            if (!raw.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(raw.replace(/^data:\s*/, "")) as {
                type?: string;
                text?: string;
              };
              if (payload.type === "chunk" && payload.text) {
                assistantText += payload.text;
                setMessages((current) =>
                  current.map((message) =>
                    message.id === optimisticAssistantId
                      ? { ...message, content: assistantText }
                      : message,
                  ),
                );
              }
            } catch {}
          }
        }
        if (done) break;
      }

      await loadConversation(convId);
      await refreshConversations(convId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        await loadConversation(convId);
        await refreshConversations(convId);
        return;
      }
      console.error("Streaming failed", error);
      await loadConversation(convId);
    } finally {
      activeConversationIdRef.current = null;
      abortRef.current = null;
      setStreaming(false);
    }
  }

  function handleNewChat() {
    abortRef.current?.abort();
    activeConversationIdRef.current = null;
    setSelectedConversationId(null);
    setSelectedConversationTitle("New chat");
    setMessages([]);
    setComposer("");
    setStreaming(false);
  }

  useEffect(() => {
    if (!registerShellHandlers) return;
    registerShellHandlers({
      conversations,
      selectedConversationId,
      loading: loadingConversations,
      onNewChat: handleNewChat,
      onSelectConversation: (id: string) => voidLoadConversation(id),
    });
  }, [
    conversations,
    selectedConversationId,
    loadingConversations,
    registerShellHandlers,
  ]);

  return (
    <div className="flex h-full w-full min-w-0 min-h-0 flex-col overflow-hidden bg-[#faf9f5] max-w-3xl mx-auto">
      <ChatHeader
        title={heading}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        onToggleInspect={onToggleInspect}
        inspectOpen={inspectOpen}
      />

      <div className="relative flex-1 w-full min-w-0 min-h-0">
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
          <MessageList messages={messages} />
        </div>
      </div>

      <ChatInput
        value={composer}
        onChange={setComposer}
        onSubmit={handleSubmit}
        onPause={pauseStreaming}
        streaming={streaming}
        showLoader={showLoader}
      />
    </div>
  );
}
