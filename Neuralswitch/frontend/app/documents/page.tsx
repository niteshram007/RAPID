"use client";

import * as React from "react";
import { api } from "@/lib/api";
import type { DocumentItem } from "@/lib/types";
import { UploadDocument } from "@/components/documents/UploadDocument";
import { DocumentList } from "@/components/documents/DocumentList";

export default function DocumentsPage() {
  const [documents, setDocuments] = React.useState<DocumentItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setDocuments(await api.listDocuments());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Poll while any document is still processing.
  React.useEffect(() => {
    const processing = documents.some(
      (d) => d.status === "processing" || d.status === "uploaded",
    );
    if (!processing) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [documents, load]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDocument(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload files to build your knowledge base. Enable the “Docs” toggle in chat to ask
          questions with retrieval-augmented generation.
        </p>

        <div className="mt-6">
          <UploadDocument onUploaded={load} />
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">
          Uploaded documents
        </h2>
        <DocumentList documents={documents} onDelete={handleDelete} />
      </div>
    </div>
  );
}
