import type {
  AttachmentItem,
  AppSettings,
  ChatDetail,
  ChatRequest,
  ChatSummary,
  ModelsResponse,
  StreamEvent,
  TestConnectionResult,
} from "./types";

// All requests are proxied through Next.js rewrites (/api/backend -> FastAPI),
// so the browser never talks to the LLM/DB directly.
const BASE = "/api/backend";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // ---- Chats ----
  listChats: () => http<ChatSummary[]>("/chats"),
  getChat: (id: string) => http<ChatDetail>(`/chats/${id}`),
  createChat: (title = "New chat") =>
    http<ChatSummary>("/chats", { method: "POST", body: JSON.stringify({ title }) }),
  renameChat: (id: string, title: string) =>
    http<ChatSummary>(`/chats/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteChat: (id: string) => http<{ ok: boolean }>(`/chats/${id}`, { method: "DELETE" }),

  // ---- Documents ----
  listAttachments: (chatId?: string) =>
    http<AttachmentItem[]>(chatId ? `/documents?chat_id=${encodeURIComponent(chatId)}` : "/documents"),
  getAttachment: (id: string) => http<AttachmentItem>(`/attachments/${id}`),
  deleteAttachment: (id: string) =>
    http<{ ok: boolean }>(`/attachments/${id}`, { method: "DELETE" }),
  uploadAttachment: async (file: File, chatId?: string): Promise<AttachmentItem> => {
    const form = new FormData();
    form.append("file", file);
    if (chatId) form.append("chat_id", chatId);
    const res = await fetch(`${BASE}/attachments/upload`, { method: "POST", body: form });
    if (!res.ok) {
      let detail = `Upload failed (${res.status})`;
      try {
        detail = (await res.json()).detail || detail;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    return res.json();
  },
  // Backward compatibility alias
  listDocuments: () => api.listAttachments(),
  deleteDocument: (id: string) => api.deleteAttachment(id),
  uploadDocument: async (file: File): Promise<AttachmentItem> => api.uploadAttachment(file),

  // ---- Models ----
  listModels: () => http<ModelsResponse>("/models"),

  // ---- Settings ----
  getSettings: () => http<AppSettings>("/settings"),
  updateSettings: (patch: AppSettings) =>
    http<AppSettings>("/settings", { method: "POST", body: JSON.stringify(patch) }),
  testConnection: (patch?: AppSettings) =>
    http<TestConnectionResult>("/settings/test-connection", {
      method: "POST",
      body: JSON.stringify(patch || {}),
    }),

  // ---- Health ----
  health: () => http<{ status: string }>("/health"),

  // ---- Tools ----
  routeTool: (message: string, use_rag = true, use_web = true) =>
    http<{ route: string; reasons: string[] }>("/tools/route", {
      method: "POST",
      body: JSON.stringify({ message, use_rag, use_web }),
    }),
};

/**
 * Stream a chat completion. Calls onEvent for each parsed SSE event.
 * Returns an AbortController so the caller can stop generation.
 */
export function streamChat(
  req: ChatRequest,
  onEvent: (e: StreamEvent) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let detail = `Request failed (${res.status})`;
        try {
          detail = (await res.json()).detail || detail;
        } catch {
          /* ignore */
        }
        onError(detail);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            onEvent(JSON.parse(json) as StreamEvent);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
      onDone();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        onDone();
      } else {
        onError((err as Error).message || "Streaming failed.");
      }
    }
  })();

  return controller;
}
