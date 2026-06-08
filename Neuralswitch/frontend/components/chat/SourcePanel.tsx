"use client";

import * as React from "react";
import { FileText, ChevronDown } from "lucide-react";
import type { Source } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SourcePanel({ sources }: { sources: Source[] }) {
  const [open, setOpen] = React.useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          {sources.length} source{sources.length > 1 ? "s" : ""}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {sources.map((s, i) => (
            <div key={i} className="rounded-md border border-border bg-background p-2 text-xs">
              <div className="mb-1 flex items-center justify-between font-medium">
                <span className="truncate">
                  {s.document_name}
                  {s.page ? ` · p.${s.page}` : ""}
                </span>
                <span className="ml-2 shrink-0 text-muted-foreground">
                  {(s.score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="line-clamp-3 text-muted-foreground">{s.chunk_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
