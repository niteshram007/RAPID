"use client";

import type { AppSettings } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function RealtimeToolSettings({
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
          <p className="text-sm font-medium">Web search enabled</p>
          <p className="text-xs text-muted-foreground">Use real-time search for latest/current questions.</p>
        </div>
        <Switch checked={settings.web_search_enabled ?? true} onCheckedChange={(v) => set("web_search_enabled", v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Provider</Label>
          <Input value={settings.web_search_provider || "duckduckgo"} onChange={(e) => set("web_search_provider", e.target.value)} />
        </div>
        <div>
          <Label>Max results</Label>
          <Input type="number" value={settings.web_search_max_results ?? 5} onChange={(e) => set("web_search_max_results", parseInt(e.target.value || "0", 10))} />
        </div>
      </div>
    </div>
  );
}
