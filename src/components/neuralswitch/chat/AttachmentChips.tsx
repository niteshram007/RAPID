"use client";

import { FileText, Loader2, X, AlertCircle, CheckCircle2 } from "lucide-react";
import type { AttachmentItem } from "@/lib/neuralswitch/types";

export function AttachmentChips({
  items,
  onRemove,
}: {
  items: (AttachmentItem & { localName?: string })[];
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((a) => {
        const status = a.status || "uploading";
        return (
          <div key={a.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-[220px] truncate">{a.filename || a.localName || "file"}</span>
            <span className="text-muted-foreground">
              {status === "processing" || status === "uploaded" ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> uploading...
                </span>
              ) : status === "ready" ? (
                <span className="inline-flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" /> ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <AlertCircle className="h-3 w-3" /> failed
                </span>
              )}
            </span>
            <button onClick={() => onRemove(a.id)} className="rounded p-0.5 hover:bg-accent" title="Remove">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
