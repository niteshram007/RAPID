"use client";

import type { AppSettings } from "@/lib/neuralswitch/types";
import { Input } from "@/components/neuralswitch/ui/input";
import { Label } from "@/components/neuralswitch/ui/label";

export function ModelSettings({
  settings,
  set,
}: {
  settings: AppSettings;
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label>LLM Base URL</Label>
        <Input value={settings.llm_base_url || ""} onChange={(e) => set("llm_base_url", e.target.value)} />
      </div>
      <div>
        <Label>API Key</Label>
        <Input type="password" value={settings.llm_api_key || ""} onChange={(e) => set("llm_api_key", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Default model</Label>
          <Input value={settings.default_model || ""} onChange={(e) => set("default_model", e.target.value)} />
        </div>
        <div>
          <Label>Temperature</Label>
          <Input type="number" value={settings.temperature ?? 0.3} onChange={(e) => set("temperature", parseFloat(e.target.value || "0"))} />
        </div>
      </div>
    </div>
  );
}
