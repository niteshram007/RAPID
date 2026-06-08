"use client";

import * as React from "react";
import { Paperclip } from "lucide-react";

export function AttachmentButton({
  onPick,
  disabled,
}: {
  onPick: (files: FileList) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title="Attach files"
        onClick={() => inputRef.current?.click()}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <Paperclip className="h-5 w-5" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.csv,.xlsx,.md,.markdown"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onPick(e.target.files);
          }
          e.currentTarget.value = "";
        }}
      />
    </>
  );
}
