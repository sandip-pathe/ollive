"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Plus, Search, Square } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  API_BASE,
  apiFetch,
  ConversationSummary,
  Message as ApiMessage,
} from "@/app/lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: string;
};

function toChatMessage(message: ApiMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    meta: message.content_redacted ? "Stored after redaction" : undefined,
  };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId),
    [conversations, selectedConversationId],
  );

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      return [
        conversation.title || "",
        conversation.id,
        conversation.status || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [conversations, search]);

  async function loadConversations(preferredConversationId?: string) {
    setLoading(true);
    try {
      const list = await apiFetch<ConversationSummary[]>("/api/conversations");
      setConversations(list);
      const targetId = preferredConversationId || list[0]?.id || "";
      setSelectedConversationId(targetId);
      if (targetId) {
        await loadConversation(targetId);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error("Failed to load conversations", error);
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadConversation(conversationId: string) {
    if (!conversationId) return;
    try {
      const detail = await apiFetch<{
        conversation: ConversationSummary;
        messages: ApiMessage[];
      }>(`/api/conversations/${conversationId}`);
      setSelectedConversationId(detail.conversation.id);
      setMessages(detail.messages.map(toChatMessage));
    } catch (error) {
      console.error("Failed to load conversation", error);
      setMessages([]);
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
        const targetId = list[0]?.id || "";
        setSelectedConversationId(targetId);
        if (targetId) {
          const detail = await apiFetch<{
            conversation: ConversationSummary;
            messages: ApiMessage[];
          }>(`/api/conversations/${targetId}`);
          if (!mounted) return;
          setSelectedConversationId(detail.conversation.id);
          setMessages(detail.messages.map(toChatMessage));
        } else {
          setMessages([]);
        }
      } catch (error) {
        console.error("Failed to load conversations", error);
        if (mounted) {
          setConversations([]);
          setSelectedConversationId("");
          setMessages([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
  }, []);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  async function ensureConversation() {
    if (selectedConversationId) return selectedConversationId;
    const created = await apiFetch<ConversationSummary>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "New conversation" }),
    });
    await loadConversations(created.id);
    return created.id;
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function handleSend() {
    if (!canSend || streaming) return;
    const value = input.trim();
    setInput("");

    const conversationId = await ensureConversation();
    if (!conversationId) return;

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
        `${API_BASE}/api/conversations/${conversationId}/messages/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content: value }),
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

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
            const rawEvent = buffer.slice(0, splitIndex).trim();
            buffer = buffer.slice(splitIndex + 2);
            splitIndex = buffer.indexOf("\n\n");
            if (!rawEvent.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(rawEvent.replace(/^data:\s*/, "")) as {
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
            } catch {
              // ignore malformed chunks and keep streaming
            }
          }
        }
        if (done) break;
      }

      await loadConversations(conversationId);
      window.dispatchEvent(
        new CustomEvent("ollive:trace-refresh", {
          detail: { conversationId },
        }),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Streaming failed", error);
      await loadConversation(conversationId);
      window.dispatchEvent(
        new CustomEvent("ollive:trace-refresh", {
          detail: { conversationId },
        }),
      );
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  async function createConversation() {
    const created = await apiFetch<ConversationSummary>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "New conversation" }),
    });
    await loadConversations(created.id);
  }

  return (
    <div className="flex h-screen w-full bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <aside className="hidden w-72 border-r border-zinc-200 bg-zinc-50 p-4 md:flex md:flex-col dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Claude</h1>
          <Badge>Live</Badge>
        </div>
        <Button
          variant="outline"
          className="mb-3 w-full justify-start gap-2"
          onClick={() => void createConversation()}
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
          <Input
            className="pl-9"
            placeholder="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Separator className="mb-3" />
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Recents
        </p>
        <ScrollArea className="h-[calc(100vh-220px)] pr-2">
          <div className="space-y-1">
            {loading ? (
              <div className="rounded-md px-3 py-2 text-sm text-zinc-500">
                Loading conversations...
              </div>
            ) : null}
            {!loading && visibleConversations.length === 0 ? (
              <div className="rounded-md px-3 py-2 text-sm text-zinc-500">
                No conversations yet.
              </div>
            ) : null}
            {visibleConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => void loadConversation(conversation.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${conversation.id === selectedConversationId ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {conversation.title || "Untitled conversation"}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    {conversation.status || "active"}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-zinc-500">
                  {conversation.id}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium">
              {selectedConversation?.title || "Conversation"}
            </h2>
            <p className="truncate text-xs text-zinc-500">
              {selectedConversationId || "No conversation selected"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void createConversation()}
          >
            Share
          </Button>
        </header>

        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
            {messages.length === 0 && !loading ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/80 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60">
                Select a real conversation, or start one from the sidebar.
              </div>
            ) : null}
            {messages.map((message) => (
              <article key={message.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar
                    className={
                      message.role === "user"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    }
                  >
                    <AvatarFallback>
                      {message.role === "user" ? "U" : "AI"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    {message.role}
                  </span>
                  {message.meta ? (
                    <span className="text-xs text-zinc-400">
                      {message.meta}
                    </span>
                  ) : null}
                </div>
                <div className="max-w-3xl rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[17px] leading-relaxed shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  {message.content ||
                    (streaming ? "Streaming response..." : "")}
                </div>
              </article>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex w-full max-w-4xl items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Write a message..."
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button
              size="icon"
              onClick={() => {
                if (streaming) {
                  stopStreaming();
                  return;
                }
                void handleSend();
              }}
              disabled={!streaming && !canSend}
            >
              {streaming ? (
                <Square className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
