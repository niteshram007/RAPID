"use client";

import * as React from "react";
import { Plus, MessageSquare, Trash2, Pencil, Check, X, Search, Settings, User2 } from "lucide-react";
import type { ChatSummary } from "@/lib/neuralswitch/types";
import { cn } from "@/lib/neuralswitch/utils";

interface Props {
  chats: ChatSummary[];
  activeChatId: string | null;
  collapsed?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenSettings: () => void;
}

export function ChatSidebar({
  chats,
  activeChatId,
  collapsed,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onOpenSettings,
}: Props) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [query, setQuery] = React.useState("");

  if (collapsed) return null;

  const filtered = chats.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const groups = groupChats(filtered);

  const startEdit = (c: ChatSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setDraft(c.title);
  };

  const commit = (id: string) => {
    const t = draft.trim();
    if (t) onRename(id, t);
    setEditingId(null);
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-card">
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No conversations yet. Start a new chat.
          </p>
        )}
        {groups.map(([label, items]) => (
          <div key={label} className="mb-3">
            <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {items.map((c) => {
          const active = c.id === activeChatId;
          const editing = c.id === editingId;
          return (
            <div
              key={c.id}
              onClick={() => !editing && onSelect(c.id)}
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              {editing ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-xs outline-none"
                  />
                  <button onClick={(e) => { e.stopPropagation(); commit(c.id); }} title="Save">
                    <Check className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} title="Cancel">
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 truncate">{c.title}</span>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={(e) => startEdit(c, e)} title="Rename">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
          </div>
        ))}
      </div>
      <div className="border-t border-border p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
            <User2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="flex-1 text-left">User</span>
          <Settings className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </aside>
  );
}

function groupChats(chats: ChatSummary[]): Array<[string, ChatSummary[]]> {
  const now = new Date();
  const result = new Map<string, ChatSummary[]>();
  const labels = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"];
  for (const l of labels) result.set(l, []);
  for (const c of chats) {
    const d = new Date(c.updated_at);
    const diffDays = Math.floor((+now - +d) / (1000 * 60 * 60 * 24));
    const label =
      diffDays <= 0 ? "Today" : diffDays === 1 ? "Yesterday" : diffDays <= 7 ? "Previous 7 Days" : diffDays <= 30 ? "Previous 30 Days" : "Older";
    result.get(label)!.push(c);
  }
  return Array.from(result.entries()).filter(([, items]) => items.length > 0);
}
