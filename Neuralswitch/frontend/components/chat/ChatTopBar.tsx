"use client";

import { Globe } from "lucide-react";
import type { ModelInfo } from "@/lib/types";
import { SidebarToggle } from "./SidebarToggle";
import { ModelSelector } from "./ModelSelector";

export function ChatTopBar({
  title,
  sidebarCollapsed,
  onToggleSidebar,
  models,
  selectedModel,
  loadingModels,
  onSelectModel,
  toolStatus,
}: {
  title: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  models: ModelInfo[];
  selectedModel: string;
  loadingModels?: boolean;
  onSelectModel: (modelId: string) => void;
  toolStatus?: string;
}) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border px-3">
      <div className="flex items-center gap-2">
        <SidebarToggle collapsed={sidebarCollapsed} onToggle={onToggleSidebar} />
        <h1 className="max-w-[320px] truncate text-sm font-medium">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {!!toolStatus && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
            <Globe className="h-3 w-3" />
            {toolStatus}
          </span>
        )}
        <ModelSelector value={selectedModel} models={models} loading={loadingModels} onChange={onSelectModel} />
      </div>
    </header>
  );
}
