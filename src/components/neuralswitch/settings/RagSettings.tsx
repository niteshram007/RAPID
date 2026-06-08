"use client";

import type { AppSettings } from "@/lib/neuralswitch/types";
import { Input } from "@/components/neuralswitch/ui/input";
import { Label } from "@/components/neuralswitch/ui/label";
import { Switch } from "@/components/neuralswitch/ui/switch";

export function RagSettings({
  settings,
  set,
}: {
  settings: AppSettings;
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
        <div>
          <p className="text-sm font-medium">Enable RAG</p>
          <p className="text-xs text-muted-foreground">Use uploaded files for grounded answers.</p>
        </div>
        <Switch checked={settings.rag_enabled ?? true} onCheckedChange={(v) => set("rag_enabled", v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Top-K</Label>
          <Input type="number" value={settings.rag_top_k ?? 5} onChange={(e) => set("rag_top_k", parseInt(e.target.value || "0", 10))} />
        </div>
        <div>
          <Label>Score threshold</Label>
          <Input type="number" step="0.05" value={settings.rag_score_threshold ?? 0.35} onChange={(e) => set("rag_score_threshold", parseFloat(e.target.value || "0"))} />
        </div>
      </div>
    </div>
  );
}
