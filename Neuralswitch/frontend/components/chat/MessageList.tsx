"use client";

import type { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

export function MessageList({
  messages,
  isGenerating,
  onRegenerate,
}: {
  messages: ChatMessage[];
  isGenerating: boolean;
  onRegenerate: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl py-2">
      {messages.map((m, i) => (
        <MessageBubble
          key={m.id + i}
          message={m}
          isStreaming={isGenerating && i === messages.length - 1}
          onRegenerate={onRegenerate}
          canRegenerate={!isGenerating && m.role === "assistant" && i === messages.length - 1}
        />
      ))}
    </div>
  );
}
