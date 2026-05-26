"use client";

import { useEffect, useRef } from "react";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";
import { ChatMessage } from "./types";

type MessageListProps = {
  messages: ChatMessage[];
};

export function MessageList({ messages }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      // Scroll to bottom when messages change
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      } else if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    } catch (e) {
      // ignore
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full min-w-0 flex-col gap-9 px-5 pb-14 pt-10 md:px-10"
    >
      {messages.map((message) =>
        message.role === "user" ? (
          <UserMessage key={message.id} content={message.content} />
        ) : (
          <AssistantMessage
            key={message.id}
            content={message.content}
            meta={message.meta}
          />
        ),
      )}
      <div ref={bottomRef} />
    </div>
  );
}
