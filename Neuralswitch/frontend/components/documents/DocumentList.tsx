"use client";

import { FileText, Trash2 } from "lucide-react";
import type { DocumentItem } from "@/lib/types";
import { formatBytes, formatDate } from "@/lib/utils";
import { DocumentStatus } from "./DocumentStatus";

interface Props {
  documents: DocumentItem[];
  onDelete: (id: string) => void;
}

export function DocumentList({ documents, onDelete }: Props) {
  if (documents.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{doc.filename}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {doc.file_type}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{formatBytes(doc.size_bytes)}</span>
              {doc.status === "ready" && <span>{doc.chunk_count} chunks</span>}
              <span>{formatDate(doc.created_at)}</span>
              {doc.status === "failed" && doc.error && (
                <span className="text-red-600">{doc.error}</span>
              )}
            </div>
          </div>
          <DocumentStatus status={doc.status} />
          <button
            onClick={() => onDelete(doc.id)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-red-500"
            title="Delete document"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
