"use client";

import * as React from "react";
import { Bot, AlertCircle } from "lucide-react";
import { api, streamChat } from "@/lib/api";
import type {
  AttachmentItem,
  ChatMessage,
  ChatMode,
  ChatSummary,
  ModelInfo,
  Source,
  StreamEvent,
} from "@/lib/types";
import { ChatSidebar } from "./ChatSidebar";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { ChatTopBar } from "./ChatTopBar";
import { SettingsModal } from "@/components/settings/SettingsModal";

const SUGGESTIONS = [
  "Explain this uploaded document",
  "What is the latest AI news today?",
  "Calculate 18.5% growth on 425000",
  "Write Python code to read an Excel file",
];

export function ChatLayout() {
  const [chats, setChats] = React.useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [attachments, setAttachments] = React.useState<(AttachmentItem & { localName?: string })[]>([]);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [mode] = React.useState<ChatMode>("auto");
  const [error, setError] = React.useState<string | null>(null);
  const [suggested, setSuggested] = React.useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [models, setModels] = React.useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = React.useState("");
  const [toolStatus, setToolStatus] = React.useState("");

  const controllerRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastUserMessageRef = React.useRef<string>("");

  const loadChats = React.useCallback(async () => {
    try {
      setChats(await api.listChats());
    } catch {
      /* backend may be down; surfaced on send */
    }
  }, []);

  React.useEffect(() => {
    loadChats();
  }, [loadChats]);

  React.useEffect(() => {
    const collapsed = localStorage.getItem("chat.sidebar.collapsed");
    if (collapsed === "1") setSidebarCollapsed(true);
    const storedModel = localStorage.getItem("chat.selected.model");
    if (storedModel) setSelectedModel(storedModel);
    (async () => {
      try {
        const m = await api.listModels();
        setModels(m.models);
        setSelectedModel((prev) => prev || m.default_model || m.models[0]?.id || "");
      } catch {
        /* ignore */
      }
    })();
  }, []);

  React.useEffect(() => {
    localStorage.setItem("chat.sidebar.collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  React.useEffect(() => {
    if (selectedModel) localStorage.setItem("chat.selected.model", selectedModel);
  }, [selectedModel]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const loadAttachments = React.useCallback(async (chatId: string | null) => {
    if (!chatId) {
      setAttachments([]);
      return;
    }
    try {
      const docs = await api.listAttachments(chatId);
      setAttachments(docs.map((d) => ({ ...d })));
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (!activeChatId) return;
    loadAttachments(activeChatId);
  }, [activeChatId, loadAttachments]);

  React.useEffect(() => {
    const processing = attachments.some((a) => a.status === "processing" || a.status === "uploaded");
    if (!processing || !activeChatId) return;
    const t = setInterval(() => loadAttachments(activeChatId), 2500);
    return () => clearInterval(t);
  }, [attachments, activeChatId, loadAttachments]);

  const openChat = async (id: string) => {
    if (isGenerating) return;
    setError(null);
    setActiveChatId(id);
    setSuggested([]);
    try {
      const detail = await api.getChat(id);
      setMessages(detail.messages);
      await loadAttachments(id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const newChat = () => {
    if (isGenerating) return;
    setActiveChatId(null);
    setAttachments([]);
    setMessages([]);
    setSuggested([]);
    setError(null);
    setToolStatus("");
  };

  const deleteChat = async (id: string) => {
    try {
      await api.deleteChat(id);
      if (id === activeChatId) newChat();
      await loadChats();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const renameChat = async (id: string, title: string) => {
    try {
      await api.renameChat(id, title);
      await loadChats();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const runStream = (text: string, baseMessages: ChatMessage[]) => {
    setError(null);
    setSuggested([]);
    setToolStatus("");
    setIsGenerating(true);
    lastUserMessageRef.current = text;

    const assistant: ChatMessage = { id: "pending", role: "assistant", content: "", pending: true };
    setMessages([...baseMessages, assistant]);

    let streamedSources: Source[] = [];

    controllerRef.current = streamChat(
      {
        chat_id: activeChatId,
        message: text,
        model: selectedModel || undefined,
        mode,
        use_rag: attachments.length > 0,
        use_web: true,
        document_ids: [],
        attachments: attachments.filter((a) => a.status === "ready").map((a) => a.id),
      },
      (e: StreamEvent) => {
        if (e.type === "meta") {
          streamedSources = e.sources || [];
          setToolStatus(e.tool_route || "");
          if (!activeChatId) setActiveChatId(e.chat_id);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") last.sources = streamedSources;
            return next;
          });
        } else if (e.type === "token") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + e.content };
            }
            return next;
          });
        } else if (e.type === "done") {
          setSuggested(e.suggested_questions || []);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { ...last, id: e.message_id || "done", pending: false };
            }
            return next;
          });
          loadAttachments(e.chat_id);
        } else if (e.type === "error") {
          setError(e.message);
        }
      },
      () => {
        setIsGenerating(false);
        controllerRef.current = null;
        loadChats();
      },
      (msg) => {
        setError(msg);
        setIsGenerating(false);
        controllerRef.current = null;
        // drop empty pending assistant bubble
        setMessages((prev) => prev.filter((m) => !(m.pending && !m.content)));
      },
    );
  };

  const send = (text: string) => {
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    runStream(text, [...messages, userMsg]);
  };

  const onAttachFiles = async (files: FileList) => {
    let chatId = activeChatId;
    if (!chatId) {
      try {
        const c = await api.createChat("New chat");
        chatId = c.id;
        setActiveChatId(c.id);
        await loadChats();
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    for (const file of Array.from(files)) {
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      setAttachments((prev) => [
        ...prev,
        {
          id: tempId,
          filename: file.name,
          status: "uploaded",
          file_type: "",
          chunk_count: 0,
          size_bytes: file.size,
          created_at: new Date().toISOString(),
          localName: file.name,
        },
      ]);
      try {
        const uploaded = await api.uploadAttachment(file, chatId || undefined);
        setAttachments((prev) => prev.map((a) => (a.id === tempId ? { ...uploaded } : a)));
      } catch (e) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === tempId ? { ...a, status: "failed", error: (e as Error).message } : a,
          ),
        );
      }
    }
  };

  const removeAttachment = async (id: string) => {
    const isTemp = id.startsWith("temp-");
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    if (!isTemp) {
      try {
        await api.deleteAttachment(id);
      } catch {
        /* ignore */
      }
    }
  };

  const regenerate = () => {
    if (isGenerating || !lastUserMessageRef.current) return;
    // remove the last assistant message, keep history up to last user message
    const trimmed = [...messages];
    if (trimmed[trimmed.length - 1]?.role === "assistant") trimmed.pop();
    runStream(lastUserMessageRef.current, trimmed);
  };

  const stop = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsGenerating(false);
    setMessages((prev) => prev.map((m) => (m.pending ? { ...m, pending: false } : m)));
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full">
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        collapsed={sidebarCollapsed}
        onSelect={openChat}
        onNew={newChat}
        onDelete={deleteChat}
        onRename={renameChat}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatTopBar
          title={chats.find((c) => c.id === activeChatId)?.title || "New chat"}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          models={models}
          selectedModel={selectedModel}
          loadingModels={!models.length}
          onSelectModel={setSelectedModel}
          toolStatus={toolStatus}
        />

        <div ref={scrollRef} className="thin-scroll flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Bot className="h-7 w-7" />
              </div>
              <h1 className="mb-2 text-2xl font-semibold">How can I help you today?</h1>
              <p className="mb-8 text-sm text-muted-foreground">Ask anything. Attach files. Get grounded answers.</p>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <MessageList messages={messages} isGenerating={isGenerating} onRegenerate={regenerate} />

              {suggested.length > 0 && !isGenerating && (
                <div className="mx-auto max-w-3xl px-4 pb-4">
                  <div className="flex flex-wrap gap-2">
                    {suggested.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {error && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <ChatInput
          onSend={send}
          onStop={stop}
          onAttachFiles={onAttachFiles}
          onRemoveAttachment={removeAttachment}
          attachments={attachments}
          isGenerating={isGenerating}
        />
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
