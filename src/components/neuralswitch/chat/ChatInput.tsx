"use client";

import * as React from "react";
import { ArrowUp, Square } from "lucide-react";
import type { AttachmentItem } from "@/lib/neuralswitch/types";
import { AttachmentButton } from "./AttachmentButton";
import { AttachmentChips } from "./AttachmentChips";

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  onAttachFiles: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  attachments: (AttachmentItem & { localName?: string })[];
  isGenerating: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  onAttachFiles,
  onRemoveAttachment,
  attachments,
  isGenerating,
}: Props) {
  const [text, setText] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const autosize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  React.useEffect(autosize, [text, autosize]);

  const submit = () => {
    const value = text.trim();
    if (!value || isGenerating) return;
    onSend(value);
    setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="px-2 pt-2">
          <AttachmentChips items={attachments} onRemove={onRemoveAttachment} />
        </div>
        <div className="flex items-end gap-2 p-2">
          <AttachmentButton onPick={onAttachFiles} disabled={isGenerating} />

          <textarea
            ref={ref}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything…"
            className="thin-scroll max-h-[200px] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />

          {isGenerating ? (
            <button
              onClick={onStop}
              title="Stop generating"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              title="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">Enter to send · Shift+Enter for new line</div>
      </div>
    </div>
  );
}
