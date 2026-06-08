"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import type { ModelInfo } from "@/lib/neuralswitch/types";

export function ModelSelector({
  value,
  models,
  loading,
  onChange,
}: {
  value: string;
  models: ModelInfo[];
  loading?: boolean;
  onChange: (modelId: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-[220px] appearance-none rounded-lg border border-border bg-background pl-3 pr-9 text-sm"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {loading ? (
        <Loader2 className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}
